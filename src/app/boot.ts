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
async function materialize(repo: Repository): Promise<void> {
  try {
    await repo.materializeRecurring(today())
  } catch {
    // Nessun canale: lo stato che conta e' gia' in getState().writeFailures.
  }
}

/**
 * Rilettura al risveglio (ADR 007).
 *
 * Il mirror e' una cache e dopo ogni sospensione e' scaduto. Qui si agganciano
 * i due eventi che in una PWA significano "l'app e' tornata": non c'e' nessuna
 * logica di sicurezza da replicare — se il mirror contiene roba che il disco non
 * ha, e' il repository a tirarsi indietro e a dire perche'.
 *
 * Tre cose succedono a ogni risveglio, anche quando la rilettura viene saltata:
 * 1. il giorno civile viene ricalcolato (app lasciata aperta la notte);
 * 2. lo stato pubblicato torna allineato al mirror;
 * 3. la materializzazione parte **solo dopo** una rilettura riuscita, mai prima:
 *    con un mirror vecchio genererebbe occorrenze da regole spente altrove.
 */
function attachWake(repo: Repository): void {
  let running = false

  const wake = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      const outcome = await repo.reloadFromDisk()
      patch({ day: today(), data: repo.getState() })
      if (outcome.reloaded) await materialize(repo)
      // Saltata: il mirror e' avanti al disco (scritture in coda o perse) o un
      // import sta gia' sostituendo tutto. In tutti i casi il dato buono e'
      // quello che l'utente ha davanti, e resta li'.
    } catch {
      // La lettura dal disco e' fallita: il mirror e' intatto, non e' una
      // divergenza. Si ritenta al prossimo risveglio.
    } finally {
      running = false
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void wake()
  })

  // Ritorno dalla bfcache: `visibilitychange` puo' non scattare.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void wake()
  })
}
