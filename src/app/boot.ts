/**
 * Avvio dell'app e ciclo di vita del repository.
 *
 * ## Ordine di pittura
 *
 * Qui dentro non c'e' niente che debba succedere prima del primo frame.
 * `main.tsx` dipinge il guscio e **poi** chiama `boot()`: la prima cosa che
 * `openRepository` fa e' una lettura asincrona di IndexedDB, quindi il task
 * corrente finisce subito e il browser dipinge. Con 5.000 spese in archivio la
 * differenza fra le due sequenze e' tutta la lettura davanti al primo frame.
 *
 * Lo stato dell'app e' un piccolo osservabile: la UI ci si sottoscrive con
 * `useApp()`. Non e' `src/core/store.ts` perche' quello e' del dominio; questo
 * tiene tre cose che il dominio non conosce — se il database si e' aperto, il
 * giorno civile corrente, e il mirror piu' recente.
 */

import { today } from '../core/date'
import type { IsoDate } from '../core/date'
import { createIdbPersistence } from '../core/idb'
import { openRepository } from '../core/repository'
import type { Repository, RepositoryState } from '../core/repository'

export type AppPhase = 'opening' | 'ready' | 'failed'

export interface AppState {
  readonly phase: AppPhase
  /** Disponibile solo in `ready`. */
  readonly repo: Repository | null
  /** Il mirror. `null` finche' il database non e' aperto. */
  readonly data: RepositoryState | null
  /**
   * Il giorno civile corrente. Non si ricalcola a ogni render: cambia solo
   * all'avvio e a ogni risveglio, che e' esattamente quando puo' essere
   * cambiato davvero (app lasciata aperta la notte — vedi ADR 007).
   */
  readonly day: IsoDate
  /** Perche' l'apertura e' fallita. Solo in `failed`. */
  readonly error: unknown
}

let state: AppState = {
  phase: 'opening',
  repo: null,
  data: null,
  day: today(),
  error: null,
}

const listeners = new Set<() => void>()

function patch(next: Partial<AppState>): void {
  state = { ...state, ...next }
  for (const listener of [...listeners]) listener()
}

export function getAppState(): AppState {
  return state
}

export function subscribeApp(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Ricalcola il giorno civile, se e' cambiato.
 *
 * Il risveglio copre il caso normale (l'app torna in primo piano il giorno
 * dopo), ma non quello dell'app rimasta aperta e in primo piano oltre la
 * mezzanotte. Chiamarla quando si apre il foglio costa una `new Date()` ed e'
 * l'istante esatto in cui la risposta conta: da li' dipendono l'etichetta
 * "Oggi", quella di "Ieri" e la data che finisce nella spesa.
 */
export function refreshDay(): void {
  const now = today()
  if (now !== state.day) patch({ day: now })
}

/** Avvia l'apertura del database. Ritorna subito: il guscio e' gia' dipinto. */
export function boot(): void {
  void open()
}

async function open(): Promise<void> {
  let repo: Repository
  try {
    repo = await openRepository(createIdbPersistence())
  } catch (error) {
    // Succede davvero: navigazione privata, storage pieno, profilo bloccato.
    // La UI lo dice con parole sue; qui non c'e' niente da ritentare.
    patch({ phase: 'failed', error })
    return
  }

  repo.subscribe((data) => patch({ data }))
  patch({ phase: 'ready', repo, data: repo.getState(), day: today() })

  attachWake(repo)
  await materialize(repo)
}

/**
 * Genera le spese ricorrenti arretrate.
 *
 * **Puo' rifiutare**, e va atteso: un `void repo.materializeRecurring()` si
 * trasformerebbe in una unhandled rejection al primo catch-up interrotto.
 * Non c'e' niente da mostrare all'utente:
 * - una scrittura persa e' gia' contata in `writeFailures`, e la UI ci appende
 *   il suo avviso permanente;
 * - `MaterializationSupersededError` significa che un import ha sostituito i
 *   dati, e in fase 2 l'import non esiste nemmeno nella UI.
 * L'occorrenza mancante la rifa' la chiamata successiva: e' idempotente.
 */
async function materialize(repo: WakeRepository): Promise<void> {
  try {
    await repo.materializeRecurring(today())
  } catch {
    // Nessun canale: lo stato che conta e' gia' in getState().writeFailures.
  }
}

/**
 * Il tetto di tempo sulla rilettura dal disco.
 *
 * Il `finally` copre il **rifiuto**, non la promessa che non si risolve mai — ed
 * e' quello il caso peggiore: `running` resterebbe `true` per sempre, ogni
 * risveglio successivo sarebbe un no-op silenzioso e con la fase 5 le ricorrenze
 * smetterebbero di essere generate senza che niente lo dica. Un blocco
 * permanente invisibile e' peggio di un errore visibile.
 *
 * Dieci secondi, e non e' un numero tondo scelto a caso: una rilettura completa
 * di 5.000 spese misura decine di millisecondi, quindi il tetto sta **due ordini
 * di grandezza sopra** il caso peggiore reale e non puo' abortire una lettura
 * lenta ma viva. Dall'altro lato, e' abbastanza corto da essere scaduto prima
 * che l'utente torni sull'app una seconda volta: chi guarda il telefono, lo
 * blocca e lo riapre lo fa in minuti, non in secondi.
 *
 * Scadere non perde niente: il mirror resta quello che era e la rilettura si
 * rifa' al risveglio dopo. La materializzazione, invece, resta ferma — parte
 * solo dopo una rilettura **riuscita**, mai su un mirror di cui non ci si fida.
 */
const RELOAD_TIMEOUT_MS = 10_000

/**
 * Cio' che il risveglio usa davvero del repository, e niente altro.
 *
 * Non e' un'astrazione in piu': e' il contratto minimo che `createWake` chiede,
 * scritto sul posto. Un doppio nei test implementa tre metodi invece di venti, e
 * chi legge la firma sa subito che qui non si scrive niente che non passi da
 * questi tre.
 */
export type WakeRepository = Pick<
  Repository,
  'reloadFromDisk' | 'getState' | 'materializeRecurring'
>

/**
 * Costruisce il risveglio (ADR 007).
 *
 * Il mirror e' una cache e dopo ogni sospensione e' scaduto. Qui non c'e'
 * nessuna logica di sicurezza da replicare — se il mirror contiene roba che il
 * disco non ha, e' il repository a tirarsi indietro e a dire perche'.
 *
 * Tre cose succedono a ogni risveglio, anche quando la rilettura viene saltata:
 * 1. il giorno civile viene ricalcolato (app lasciata aperta la notte);
 * 2. lo stato pubblicato torna allineato al mirror;
 * 3. la materializzazione parte **solo dopo** una rilettura riuscita, mai prima:
 *    con un mirror vecchio genererebbe occorrenze da regole spente altrove.
 *
 * **Il punto 1 non e' dentro il `try`, ed e' la prima riga.** ADR 009 dice che
 * la riconciliazione al risveglio comprende il ricalcolo del giorno civile, e il
 * giorno civile non dipende dal disco: quando `reloadFromDisk` rifiuta — iOS
 * chiude le connessioni IndexedDB in background, e' un fatto noto — la Home
 * resterebbe sul periodo di ieri con le spese di ieri sotto "Oggi", cioe' il
 * dato sbagliato piu' visibile dell'app per un guasto che non lo riguarda.
 * Nemmeno la guardia `running` lo trattiene: il giorno si ricalcola comunque.
 *
 * ## Perche' repository e tetto arrivano da fuori
 *
 * Questo e' lo strato di composizione: comporre e' il suo mestiere, e prendere
 * le dipendenze come argomenti e' iniezione ordinaria, non una porta aperta per
 * i test dentro il dominio. La funzione cosi' non tocca il DOM — l'aggancio agli
 * eventi resta in `attachWake` — quindi si prova in ambiente node con un finto
 * repository e un tetto di pochi millisecondi. La stessa cucitura in `src/core`
 * sarebbe stata una superficie pubblica che qualcuno avrebbe usato per sbaglio.
 */
export function createWake(
  repo: WakeRepository,
  reloadTimeoutMs: number,
): () => Promise<void> {
  let running = false

  return async function wake(): Promise<void> {
    refreshDay()
    if (running) return
    running = true
    let expired: ReturnType<typeof setTimeout> | undefined
    try {
      const outcome = await Promise.race([
        repo.reloadFromDisk(),
        new Promise<never>((_, reject) => {
          expired = setTimeout(
            () => reject(new Error('rilettura oltre il tetto di tempo')),
            reloadTimeoutMs,
          )
        }),
      ])
      patch({ data: repo.getState() })
      if (outcome.reloaded) await materialize(repo)
      // Saltata: il mirror e' avanti al disco (scritture in coda o perse) o un
      // import sta gia' sostituendo tutto. In tutti i casi il dato buono e'
      // quello che l'utente ha davanti, e resta li'.
    } catch {
      // La lettura dal disco e' fallita, o non e' mai tornata: il mirror e'
      // intatto, non e' una divergenza. Si ritenta al prossimo risveglio.
    } finally {
      clearTimeout(expired)
      running = false
    }
  }
}

/**
 * Aggancia il risveglio ai due eventi che in una PWA significano "l'app e'
 * tornata". E' l'unica meta' della faccenda che tocca il DOM, ed e' per questo
 * che e' rimasta separata da `createWake`: qui non c'e' niente da decidere.
 */
function attachWake(repo: Repository): void {
  const wake = createWake(repo, RELOAD_TIMEOUT_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void wake()
  })

  // Ritorno dalla bfcache: `visibilitychange` puo' non scattare.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void wake()
  })
}
