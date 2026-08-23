/**
 * Il repository: mirror in memoria davanti a IndexedDB.
 *
 * ## Come funziona una scrittura
 *
 * 1. il mirror cambia e i sottoscrittori vengono notificati, **sincronamente**;
 * 2. il batch viene accodato verso il disco e la funzione ritorna subito.
 *
 * E' l'optimistic UI del brief presa alla lettera: il tap che salva una spesa
 * non aspetta IndexedDB, quindi il feedback arriva nello stesso frame.
 *
 * La coda e' una catena di promise, quindi le scritture arrivano al disco
 * nell'ordine esatto in cui sono state richieste. Due modifiche alla stessa
 * spesa non possono invertirsi.
 *
 * ## Quando il disco non risponde
 *
 * Il prezzo dell'ottimismo e' che un errore di scrittura si scopre dopo. E' il
 * solo percorso in cui si perdono spese gia' inserite e gia' viste confermate:
 * WebKit chiude la connessione IndexedDB di una web app in background, l'utente
 * continua a inserire spese, le vede in lista tutto il giorno, e alla riapertura
 * non ci sono.
 *
 * Per questo l'esito delle scritture e' **stato osservabile e durevole**:
 * `getState().writeFailures` conta le scritture non arrivate al disco e non si
 * azzera da solo. L'unica cosa che lo riporta a zero e' un import riuscito, che
 * e' anche l'unico momento in cui mirror e disco sono uguali per costruzione. La
 * UI ci appende un avviso permanente. `flush()` rilancia il primo errore e non
 * lo consuma: chiamarla di nuovo lo rilancia ancora, perche' "la seconda flush
 * risolve pulita" e' esattamente il modo in cui un problema del genere sparisce
 * dagli occhi di tutti.
 *
 * Ci passa **tutto**, materializzazione compresa: un catch-up morto a meta' e'
 * il caso in cui e' piu' facile che l'errore non abbia nessun canale da cui
 * uscire, perche' nessuno lo sta aspettando.
 *
 * Il mirror **non** fa rollback: per un'app single-user "N spese non salvate" e'
 * piu' onesto della sparizione silenziosa di quello che si e' appena inserito.
 *
 * ## Cosa NON c'e', volutamente
 *
 * Niente cancellazione fisica. `deleteExpense` mette `deletedAt`, `restore` lo
 * toglie, ed e' letteralmente una riga: e' quello che rende il toast "Annulla"
 * possibile senza dialoghi di conferma. I record cancellati restano nel mirror
 * e vengono filtrati dalle letture (`stats.ts`), non spariscono.
 *
 * Niente letture dal database dopo l'avvio: le query sono funzioni pure su
 * `getState()`. L'unica eccezione e' `reloadFromDisk()`, che non e' una query:
 * e' il modo in cui il mirror ammette di essere una cache (vedi sotto).
 *
 * ## Il mirror e' una cache, non la fonte di verita'
 *
 * Due contesti sullo stesso database sono normali: bastano due schede Safari
 * sullo stesso indirizzo. Su iOS non girano mai insieme — quello in secondo
 * piano e' congelato — quindi non c'e' nessuna concorrenza da arbitrare. C'e' un
 * contesto che si risveglia con un mirror vecchio di ore e scrive.
 *
 * `reloadFromDisk()` e' la cura, e va chiamata **prima di qualunque scrittura**,
 * materializzazione compresa. L'aggancio a `visibilitychange` e `pageshow` sta
 * in `src/app`: qui dentro non si tocca il DOM. Vedi ADR 007.
 *
 * La rilettura si **rifiuta di girare** quando il mirror contiene roba che il
 * disco non ha (scritture in coda o gia' fallite): li' rileggere non
 * riallineerebbe niente, cancellerebbe. In quel caso restituisce il motivo,
 * cosi' chi chiama puo' dire all'utente "esporta subito" invece di far finta.
 */

import { isAfter, isIsoDate, localInstant } from './date'
import type { IsoDate } from './date'
import type {
  CategoryDeletion,
  CategoryPlacement,
  CategoryPlacementRequest,
} from './categories'
import { buildDefaultCategories, buildDefaultSettings } from './defaults'
import type { Cents } from './money'
import type {
  Persistence,
  RecurringMarkerAdvance,
  WriteBatch,
  WriteResult,
} from './persistence'
import { materializeRecurring } from './recurrence'
import type { MaterializeResult } from './recurrence'
import { planResolvedBudgetChange } from './budget'
import type { BudgetChange, BudgetChangeRequest } from './budget'
import { buildBackup } from './backup'
import type { BackupFile } from './backup'
import { createObservable } from './store'
import type {
  Budget,
  Cadence,
  Category,
  DataSet,
  Expense,
  Language,
  RecurringRule,
  Settings,
  ThemePreference,
  Timestamp,
} from './types'
import { newId as defaultNewId, nowTimestamp } from './types'

export interface NewExpense {
  readonly amountCents: Cents
  readonly categoryId: string
  /**
   * Default: oggi. E' il caso normale, e non deve costare un tap.
   *
   * Una data diversa da oggi e' una spesa retrodatata, e una spesa retrodatata
   * non riceve `timeMinutes`: l'orologio sa che ore sono adesso, non che ore
   * erano allora.
   */
  readonly date?: IsoDate
  readonly note?: string
}

/*
 * Nota su un campo che non c'e': `timeMinutes` in `NewExpense`.
 *
 * L'orario non e' un ingresso, e' un'osservazione: lo legge `addExpense`
 * dall'orologio, e chi chiama non ha modo di dettarlo. Se fosse un parametro
 * esisterebbe subito il modo di scrivere un orario che non e' mai accaduto —
 * una schermata che "ricorda" l'ora di ieri, un import che la inventa — e da
 * quel momento le fasce orarie della fase 6 non avrebbero piu' modo di sapere
 * quali orari sono veri. I test lo controllano da `RepositoryOptions.nowInstant`,
 * cioe' spostando l'orologio, che e' l'unica cosa che nella realta' lo sposta.
 */

export interface ExpensePatch {
  readonly amountCents?: Cents
  readonly categoryId?: string
  /** Cambiare giorno fa cadere `timeMinutes`: vedi `updateExpense`. */
  readonly date?: IsoDate
  /** `null` cancella la nota. */
  readonly note?: string | null
}

export interface NewCategory {
  readonly name: string
  readonly emoji: string
  readonly color: string
}

/*
 * Nota su due campi che non ci sono: `order` in `NewCategory` e `archived` in
 * `CategoryPatch`.
 *
 * `order` no perche' la posizione non e' una proprieta' della categoria nuova:
 * o prende il posto di quella che sostituisce, o va in fondo. Chi vuole
 * spostarla usa `reorderCategories`, che riscrive la griglia intera e quindi
 * non puo' lasciare due categorie sulla stessa cella.
 *
 * `archived` no per una ragione piu' seria: e' il tetto di otto reso
 * inesprimibile. Con quel campo qui dentro, `updateCategory(id, { archived:
 * false })` sarebbe una riga che compila e che fa la nona categoria attiva, e
 * l'unica difesa sarebbe ricordarsi di non scriverla. Senza, e' un **errore di
 * compilazione**. Le due transizioni hanno ciascuna la propria porta:
 * `archiveCategory` toglie dalla griglia (direzione sempre sicura), e le due
 * `place*` la rimettono passando dal controllo del tetto fatto sul disco.
 */
export interface CategoryPatch {
  readonly name?: string
  readonly emoji?: string
  readonly color?: string
  readonly order?: number
}

export interface NewRecurringRule {
  readonly amountCents: Cents
  readonly categoryId: string
  readonly cadence: Cadence
  readonly interval: number
  readonly startDate: IsoDate
  readonly note?: string
  readonly anchorDay?: number
  readonly endDate?: IsoDate
}

export interface RecurringRulePatch {
  readonly amountCents?: Cents
  readonly categoryId?: string
  readonly note?: string | null
  readonly interval?: number
  readonly anchorDay?: number | null
  readonly endDate?: IsoDate | null
  readonly active?: boolean
}

export interface SettingsPatch {
  readonly theme?: ThemePreference
  readonly lastBackupAt?: Timestamp
  /**
   * La lingua scelta in Impostazioni. `null` la riporta ad **assente**, cioe' a
   * "decidila tu dall'ambiente": senza quel verso, la prima scelta sarebbe una
   * porta a senso unico e "Automatica" non potrebbe esistere.
   */
  readonly language?: Language | null
  /** Quando la guida e' stata completata o saltata. `null` la fa riapparire. */
  readonly onboardingCompletedAt?: Timestamp | null
}

export interface RepositoryOptions {
  readonly now?: () => Timestamp
  readonly newId?: () => string
  /**
   * L'istante da cui si ricavano **la data civile e l'ora** di cio' che nasce
   * adesso: la data di default di una spesa, il suo `timeMinutes`, e il giorno
   * fino a cui materializzare le ricorrenze.
   *
   * E' separato da `now` perche' `now` produce un timestamp (una stringa), e da
   * una stringa non si torna indietro a un giorno locale senza riparsarla. Qui
   * serve l'istante intero, che si legge **una volta sola** per chiamata: e' la
   * stessa disciplina di `today(now?)` in `date.ts`, ed e' l'unico modo perche'
   * un test possa dire "sono le 20:40 del 22 agosto" senza toccare l'orologio
   * globale.
   *
   * Default: l'orologio di sistema.
   */
  readonly nowInstant?: () => Date
  /**
   * Chiamata quando una scrittura fallisce dopo che il mirror e' gia' cambiato.
   * E' una notifica, non lo stato: lo stato e' `getState().writeFailures`.
   */
  readonly onWriteError?: (error: unknown) => void
  /** Occorrenze per transazione durante il catch-up delle ricorrenze. */
  readonly recurrenceChunkSize?: number
}

/**
 * Quante scritture non sono arrivate al disco, e l'ultima ragione.
 *
 * L'unica cosa che lo riporta a zero e' un import andato a buon fine: e' il solo
 * momento in cui l'app **sa** che mirror e disco dicono la stessa cosa, perche'
 * li ha appena resi uguali. Fuori da li' un contatore che si azzera da solo
 * racconterebbe che il problema e' passato, mentre le spese continuano a mancare
 * sul disco.
 */
export interface WriteFailureState {
  /**
   * Quante scritture hanno lasciato il mirror **davanti** al disco: record che
   * l'utente vede e che il disco non ha. E' il numero che giustifica l'avviso
   * "esporta subito", ed e' anche quello che tiene spenta la rilettura al
   * risveglio.
   *
   * Non conta i blocchi di materializzazione falliti: quelli non entrano nel
   * mirror (vedi `MaterializeOptions.onCommitted`), quindi non c'e' niente da
   * salvare — l'occorrenza mancante la rifara' la chiamata successiva. Restano
   * pero' in `lastError`/`lastAt`, e `flush()` li rilancia.
   */
  readonly count: number
  /** L'ultimo errore ricevuto, per la diagnostica. `null` se non ce ne sono. */
  readonly lastError: unknown
  /** Quando e' fallita l'ultima. `null` se non e' mai fallita nessuna. */
  readonly lastAt: Timestamp | null
}

/** Perche' una `reloadFromDisk()` non ha riletto niente. */
export type ReloadSkipReason =
  /** C'e' un import in corso: il disco sta gia' per essere sostituito. */
  | 'import-in-progress'
  /** Ci sono scritture accodate: il mirror e' davanti al disco. */
  | 'pending-writes'
  /** Ci sono scritture perse: il mirror e' l'unica copia di quei record. */
  | 'write-failures'
  /** Qualcuno ha modificato il mirror mentre si leggeva: la lettura e' vecchia. */
  | 'mirror-changed'
  /** Sul disco non c'e' niente: non ci si adegua a un database vuoto. */
  | 'uninitialized-disk'

export type ReloadOutcome =
  | { readonly reloaded: true }
  | { readonly reloaded: false; readonly reason: ReloadSkipReason }

/** Una mutazione chiesta mentre un import sta sostituendo tutto. */
export class ImportInProgressError extends Error {
  constructor() {
    super('Import in corso: le modifiche sono sospese')
    this.name = 'ImportInProgressError'
  }
}

/**
 * La materializzazione e' stata abbandonata perche' un import ha sostituito i
 * dati sotto i piedi. Non e' una scrittura fallita: non c'e' niente da salvare
 * e niente da riprovare sui vecchi dati.
 */
export class MaterializationSupersededError extends Error {
  constructor() {
    super('Materializzazione superata da un import')
    this.name = 'MaterializationSupersededError'
  }
}

export const NO_WRITE_FAILURES: WriteFailureState = { count: 0, lastError: null, lastAt: null }

/**
 * Il mirror piu' la salute delle scritture. E' un `DataSet` a tutti gli effetti,
 * quindi passa ovunque serva un `DataSet` (export, metriche, statistiche): il
 * campo in piu' non finisce nel backup, perche' `buildBackup` elenca i campi che
 * copia invece di copiare tutto.
 */
export interface RepositoryState extends DataSet {
  readonly writeFailures: WriteFailureState
}

export interface Repository {
  /** Il mirror. Riferimento nuovo a ogni modifica, mai mutato sul posto. */
  getState(): RepositoryState
  subscribe(listener: (state: RepositoryState) => void): () => void

  addExpense(input: NewExpense): Expense
  updateExpense(id: string, patch: ExpensePatch): Expense | null
  /** Soft delete. Restituisce la spesa cancellata, da passare al toast Annulla. */
  deleteExpense(id: string): Expense | null
  restoreExpense(id: string): Expense | null

  /**
   * Crea una categoria e la mette **in griglia**. Se la griglia e' piena serve
   * `replacing`: e' lo scambio, ed e' il percorso normale, non il caso limite.
   *
   * Le otto categorie di default riempiono esattamente il tetto, quindi la
   * primissima cosa che fa chi ne vuole una sua e' sostituirne una. Per questo
   * "quale sostituisce?" e' un parametro di questa funzione e non una seconda
   * chiamata: archiviare e aggiungere viaggiano in **una transazione sola**, e
   * un'interruzione fra le due non puo' lasciare sette categorie in griglia.
   *
   * **E' asincrona, e non e' ottimistica.** Il mirror non cambia finche' il
   * disco non ha risposto. E' l'eccezione alla scrittura ottimistica del resto
   * del repository, ed e' deliberata: il tetto si conta sulle categorie che
   * stanno sul disco (ADR 008), quindi un "fatto" mostrato prima della risposta
   * sarebbe un "fatto" che a volte va disfatto — e non esiste nessun istante,
   * nemmeno in mirror, in cui le categorie in griglia sono nove. Il costo e'
   * nullo dove si paga: questa chiamata vive in Impostazioni, non sul percorso
   * dei due tap.
   *
   * Rifiuta (`{ ok: false }`) invece di lanciare: `grid-full` **non e' un
   * errore**, e' la domanda "quale sostituisce?" che la UI deve fare.
   */
  addCategory(input: NewCategory, replacing?: string): Promise<CategoryPlacement>

  /**
   * Riporta in griglia una categoria dall'archivio. Stesse regole e stessa
   * forma di `addCategory`: se non c'e' posto, serve `replacing`.
   *
   * Esiste perche' archiviare non sia una porta a senso unico.
   */
  unarchiveCategory(id: string, replacing?: string): Promise<CategoryPlacement>

  /**
   * Toglie una categoria dalla griglia. **Non e' una cancellazione**: la
   * categoria resta su tutte le spese che l'hanno usata, e Storico e statistiche
   * continuano a mostrarla. E' un'azione di visualizzazione.
   *
   * Sincrona e ottimistica, al contrario delle due sopra: archiviare puo' solo
   * far **scendere** il numero di categorie in griglia, quindi non ha nessun
   * invariante da verificare sul disco e puo' rispondere nello stesso frame.
   *
   * `null` se l'id non esiste o se era gia' archiviata.
   */
  archiveCategory(id: string): Category | null

  /**
   * Cancella davvero, e **solo se nessun record la nomina** — nessuna spesa
   * (viva o cancellata: i soft delete restano nello Storico e nell'export) e
   * nessuna regola ricorrente. Altrimenti resterebbero riferimenti orfani che
   * nessuna schermata sa riparare.
   *
   * Asincrona e non ottimistica per la stessa ragione di `addCategory`, piu'
   * una: e' l'unica operazione irreversibile sulle categorie, e il permesso lo
   * da' il disco. Il rifiuto porta con se' i numeri da mostrare ("3 spese la
   * usano: puoi archiviarla").
   */
  deleteCategory(id: string): Promise<CategoryDeletion>

  /** Nome, emoji, colore, posizione. Non `archived`: vedi `CategoryPatch`. */
  updateCategory(id: string, patch: CategoryPatch): Category | null
  /** Riscrive `order` seguendo l'elenco dato. Gli id sconosciuti sono ignorati. */
  reorderCategories(orderedIds: readonly string[]): readonly Category[]

  addRecurringRule(input: NewRecurringRule): RecurringRule
  updateRecurringRule(id: string, patch: RecurringRulePatch): RecurringRule | null

  /**
   * Chiude il budget in vigore e ne apre uno nuovo. Vedi `budget.ts`.
   *
   * **Quali record scrivere lo decide il disco, non il mirror.** Qui parte
   * l'intenzione ("da questo giorno l'importo e' questo"); la pianificazione
   * vera avviene dentro la transazione, sui budget che ci sono in quel momento
   * (`WriteBatch.budgetChange`). Un mirror vecchio che pianificasse da solo non
   * vedrebbe il budget aperto da un altro contesto e non lo chiuderebbe: due
   * record aperti sovrapposti restano li' per sempre, nessuna schermata li
   * mostra e la Home continua a dare un numero plausibile.
   *
   * Il valore restituito e' il piano **ottimistico**, quello con cui il mirror
   * si muove subito. Se il disco decide diversamente, il mirror si allinea a
   * scrittura conclusa: cio' che questa funzione restituisce serve al feedback
   * immediato, non a essere memorizzato come verita'.
   */
  setBudget(change: BudgetChange): readonly Budget[]

  updateSettings(patch: SettingsPatch): Settings

  /**
   * Genera le spese ricorrenti mancanti fino a `today` incluso.
   *
   * Idempotente: chiamarla piu' volte lo stesso giorno non scrive niente, da
   * questo contesto o da un altro.
   *
   * **Puo' rifiutare, e chi chiama deve gestirlo.** Non e' un caso di
   * laboratorio: e' una scrittura su IndexedDB, e IndexedDB su iOS chiude le
   * connessioni delle web app in background. Due modi di fallire:
   *
   * - una scrittura non arriva al disco: la promise rifiuta con l'errore vero,
   *   che finisce anche in `getState().writeFailures.lastError` e che `flush()`
   *   rilancera'. I blocchi gia' scritti restano validi: la chiamata successiva
   *   riprende esattamente da li', senza duplicati.
   * - `MaterializationSupersededError`: un import e' passato nel frattempo e ha
   *   sostituito i dati. Non c'e' niente da riprovare e niente da dire
   *   all'utente; se serve, si richiama dopo l'import.
   *
   * Va chiamata **dopo** `reloadFromDisk()`, mai prima: e' a tutti gli effetti
   * una scrittura, e con un mirror vecchio genera occorrenze da regole che
   * l'utente puo' aver spento altrove.
   */
  materializeRecurring(today?: IsoDate): Promise<MaterializeResult>

  /**
   * Rilegge tutto dal disco e **sostituisce** il mirror. Da chiamare al
   * risveglio (`visibilitychange` visible, `pageshow` persisted) prima di
   * qualunque scrittura. Vedi ADR 007.
   *
   * Non e' un merge e non e' una riconciliazione: il disco vince, sempre. E'
   * anche il punto in cui si chiudono i buchi che la materializzazione lascia
   * nel mirror quando il disco salta un'occorrenza gia' scritta da un altro
   * contesto.
   *
   * **Non rilegge** se il mirror contiene qualcosa che il disco non ha —
   * scritture in coda o gia' fallite — perche' rileggere le cancellerebbe.
   * L'esito lo dice: `{ reloaded: false, reason }`.
   *
   * Rifiuta solo se la lettura dal disco fallisce. In quel caso il mirror resta
   * intatto: una lettura fallita non e' una divergenza.
   */
  reloadFromDisk(): Promise<ReloadOutcome>

  exportBackup(): BackupFile

  /**
   * Sostituisce **tutto**. Il chiamante ha gia' mostrato l'anteprima.
   *
   * Restituisce il backup dello stato **precedente**, costruito prima di
   * toccare il disco: e' il materiale per l'Annulla. Importare il file
   * sbagliato scelto dal Files di iOS e' un errore che l'anteprima non puo'
   * intercettare — l'anteprima dice correttamente "12 spese", ed e' l'utente a
   * pensare che si fondano — quindi l'unica rete e' poter tornare indietro,
   * come per ogni altra azione distruttiva dell'app.
   *
   * L'annullamento e' `importBackup(precedente.data)`.
   *
   * Mentre e' in corso, ogni mutazione lancia `ImportInProgressError`: un
   * "salvata" col toast su una spesa che l'import sta per cancellare e' peggio
   * di un errore. Una materializzazione gia' avviata viene abbandonata
   * (`MaterializationSupersededError`) invece di essere attesa: sono spese che
   * l'import butterebbe via un istante dopo, e aspettarle vorrebbe dire tenere
   * l'utente fermo davanti a un lavoro di sfondo che puo' durare quaranta
   * giorni di catch-up.
   *
   * E' anche l'unico punto in cui `writeFailures` torna a zero: dopo un
   * `replaceAll` riuscito mirror e disco sono uguali per costruzione.
   */
  importBackup(data: DataSet): Promise<BackupFile>

  /**
   * Attende la coda di scrittura. Rilancia il primo errore, **senza
   * consumarlo**: finche' l'app resta aperta, ogni `flush()` successiva lo
   * rilancia, e vale anche per i blocchi di materializzazione. Per sapere se ci
   * sono stati errori senza farsi lanciare addosso niente si legge
   * `getState().writeFailures`.
   *
   * L'unica cosa che lo azzera e' un import riuscito.
   */
  flush(): Promise<void>
  close(): void
}

function assertCents(value: Cents, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(`${field}: atteso un intero in centesimi, ricevuto ${value}`)
  }
}

function assertDate(value: IsoDate, field: string): void {
  if (!isIsoDate(value)) throw new RangeError(`${field}: data non valida "${value}"`)
}

/** Due record di budget con lo stesso contenuto. Serve a non notificare a vuoto. */
function sameBudget(a: Budget, b: Budget): boolean {
  return (
    a.id === b.id &&
    a.period === b.period &&
    a.amountCents === b.amountCents &&
    a.categoryId === b.categoryId &&
    a.effectiveFrom === b.effectiveFrom &&
    a.effectiveTo === b.effectiveTo &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt
  )
}

function replace<T extends { readonly id: string }>(list: readonly T[], record: T): T[] {
  const next = [...list]
  const index = next.findIndex((r) => r.id === record.id)
  if (index === -1) next.push(record)
  else next[index] = record
  return next
}

export async function openRepository(
  persistence: Persistence,
  options: RepositoryOptions = {},
): Promise<Repository> {
  const clock = options.now ?? nowTimestamp
  const makeId = options.newId ?? defaultNewId
  const readInstant = options.nowInstant ?? (() => new Date())

  const loaded = await persistence.loadAll()
  let settings = loaded.settings
  let categories = loaded.categories

  if (settings === null) {
    // Primo avvio: le impostazioni e le categorie di default nascono qui, in una
    // sola transazione, cosi' un'app che muore subito dopo riparte gia' pronta.
    settings = buildDefaultSettings(clock)
    categories = buildDefaultCategories(clock, makeId)
    await persistence.write({ settings, categories })
  }

  const observable = createObservable<RepositoryState>({
    expenses: loaded.expenses,
    categories,
    recurringRules: loaded.recurringRules,
    budgets: loaded.budgets,
    settings,
    writeFailures: NO_WRITE_FAILURES,
  })

  let queue: Promise<void> = Promise.resolve()
  let pendingError: unknown = null
  /** Scritture accodate e non ancora concluse. Sopra zero, il mirror e' avanti. */
  let pendingWrites = 0
  /**
   * Sale a ogni cambiamento dei dati nel mirror. Serve solo alla rilettura, per
   * accorgersi che qualcuno ha scritto mentre lei leggeva e tirarsi indietro.
   */
  let revision = 0
  /** Sale a ogni import: fa abbandonare una materializzazione partita prima. */
  let generation = 0
  let importing = false

  /**
   * L'unica porta per cambiare i dati del mirror. Passa di qui anche il blocco
   * durante l'import, cosi' non esiste un metodo che se lo dimentica.
   */
  function mutate(reducer: (state: RepositoryState) => RepositoryState): void {
    if (importing) throw new ImportInProgressError()
    const before = observable.get()
    const next = reducer(before)
    if (Object.is(next, before)) return
    revision += 1
    observable.set(next)
  }

  /**
   * Accoda una scrittura e ne registra l'esito **dentro la coda**.
   *
   * La contabilita' dell'errore sta nella catena, non appesa fuori: se ne
   * stesse fuori, `flush()` potrebbe risolvere pulita un istante prima che
   * l'errore venga registrato, che e' il modo piu' rapido per far sparire un
   * problema dagli occhi di tutti.
   *
   * @param divergence vedi `recordFailure`.
   */
  function schedule(batch: WriteBatch, divergence: boolean): Promise<WriteResult> {
    pendingWrites += 1
    const run = queue.then(() => persistence.write(batch))
    const settled = run.then(
      (result) => {
        pendingWrites -= 1
        return result
      },
      (error: unknown) => {
        pendingWrites -= 1
        recordFailure(error, divergence)
        throw error
      },
    )
    queue = settled.then(
      () => undefined,
      () => undefined,
    )
    return settled
  }

  /**
   * @param divergence `true` se il mirror e' rimasto con record che il disco non
   * ha. Solo quel caso incrementa il contatore: e' il numero su cui la UI
   * costruisce "esporta subito", e gonfiarlo con fallimenti che non hanno
   * lasciato niente nel mirror lo renderebbe una cifra senza significato.
   */
  function recordFailure(error: unknown, divergence: boolean): void {
    if (pendingError === null) pendingError = error
    observable.update((state) => ({
      ...state,
      writeFailures: {
        count: state.writeFailures.count + (divergence ? 1 : 0),
        lastError: error,
        lastAt: clock(),
      },
    }))
    options.onWriteError?.(error)
  }

  /**
   * Perche' non si puo' rileggere adesso, o `null` se si puo'.
   *
   * Il vincolo di sicurezza di ADR 007 in forma di funzione: se il mirror
   * contiene qualcosa che il disco non ha, rileggere non riallinea, cancella.
   * Un blocco di materializzazione fallito non conta — non ha lasciato niente
   * nel mirror — ed e' anche il motivo per cui `count` non lo conteggia.
   */
  function reloadBlocker(): ReloadSkipReason | null {
    if (importing) return 'import-in-progress'
    if (pendingWrites > 0) return 'pending-writes'
    if (observable.get().writeFailures.count > 0) return 'write-failures'
    return null
  }

  function push(batch: WriteBatch): void {
    // L'errore e' gia' stato registrato dentro `schedule`: qui resta solo da
    // non lasciarlo come rifiuto non gestito.
    void schedule(batch, true).catch(() => undefined)
  }

  function findExpense(id: string): Expense | undefined {
    return observable.get().expenses.find((e) => e.id === id)
  }

  function commitExpense(expense: Expense): Expense {
    mutate((state) => ({ ...state, expenses: replace(state.expenses, expense) }))
    push({ expenses: [expense] })
    return expense
  }

  function commitCategory(category: Category): Category {
    mutate((state) => ({ ...state, categories: replace(state.categories, category) }))
    push({ categories: [category] })
    return category
  }

  /**
   * Aggiunge al mirror solo le spese il cui id non c'e' gia'.
   *
   * Riceve solo occorrenze davvero inserite sul disco, quindi il filtro e' una
   * rete: serve se una rilettura al risveglio le ha gia' portate dentro mentre
   * il blocco era in volo.
   */
  function mergeGenerated(
    list: readonly Expense[],
    incoming: readonly Expense[],
  ): readonly Expense[] {
    const known = new Set(list.map((e) => e.id))
    const missing = incoming.filter((e) => !known.has(e.id))
    return missing.length === 0 ? list : [...list, ...missing]
  }

  /**
   * Fa avanzare il segnaposto nel mirror, e solo quello.
   *
   * Non e' un `replace` della regola per la stessa ragione per cui sul disco non
   * si scrive la regola intera: fra il momento in cui la materializzazione ha
   * letto la regola e questo aggiornamento c'e' stato un `await`, e in quel
   * buco l'utente puo' averla disattivata. Riscriverla intera la
   * riaccenderebbe in lista — e siccome il ciclo rilegge proprio da qui, si
   * riaccenderebbe anche il catch-up che l'utente aveva appena fermato.
   */
  function advanceMarker(
    rules: readonly RecurringRule[],
    marker: RecurringMarkerAdvance,
  ): readonly RecurringRule[] {
    const index = rules.findIndex((r) => r.id === marker.id)
    const current = rules[index]
    if (current === undefined) return rules
    const previous = current.lastMaterializedDate
    if (previous !== undefined && !isAfter(marker.lastMaterializedDate, previous)) return rules
    const next = [...rules]
    next[index] = {
      ...current,
      lastMaterializedDate: marker.lastMaterializedDate,
      updatedAt: marker.updatedAt,
    }
    return next
  }

  let inFlight: {
    day: IsoDate
    generation: number
    promise: Promise<MaterializeResult>
  } | null = null

  function runMaterialization(target: IsoDate): Promise<MaterializeResult> {
    const startedAt = generation
    return materializeRecurring({
      today: target,
      rules: observable.get().recurringRules,
      expenses: observable.get().expenses,
      // La regola si rilegge dal mirror prima di ogni blocco: durante un
      // catch-up lungo l'utente puo' averla disattivata o averne cambiato
      // l'importo, e la sua versione vince sulla nostra.
      currentRule: (id) => observable.get().recurringRules.find((r) => r.id === id),
      write: (batch) => {
        if (generation !== startedAt) {
          // Un import ha sostituito tutto: le regole da cui viene questo blocco
          // non esistono piu'. Si abbandona **prima** di accodare, cosi' il
          // blocco non finisce nella coda dietro il `replaceAll`.
          return Promise.reject(new MaterializationSupersededError())
        }
        // Passa dalla stessa coda delle altre scritture: l'ordine si mantiene e
        // ogni blocco e' una transazione sola, come richiede l'interrompibilita'.
        //
        // `divergence: false`, ma registrato: prima questo percorso non passava
        // da nessun canale — `pendingError` restava `null`, `onWriteError` non
        // veniva mai chiamato e `flush()` risolveva pulita su un catch-up morto
        // a meta'.
        return schedule(batch, false)
      },
      onCommitted: (inserted, marker) => {
        // Un import sta sostituendo tutto: il mirror non deve prendersi record
        // che stanno per sparire. Il blocco successivo si fermera' da solo.
        if (generation !== startedAt) return
        mutate((s) => {
          const expenses = mergeGenerated(s.expenses, inserted)
          const recurringRules = advanceMarker(s.recurringRules, marker)
          if (expenses === s.expenses && recurringRules === s.recurringRules) return s
          return { ...s, expenses, recurringRules }
        })
      },
      ...(options.recurrenceChunkSize !== undefined
        ? { chunkSize: options.recurrenceChunkSize }
        : {}),
      now: clock,
    })
  }

  /**
   * Allinea il mirror ai record che la transazione ha davvero scritto.
   *
   * Il piano ottimistico e' fatto sui budget del mirror; quello che conta e'
   * quello fatto sul disco. Quando i due coincidono — il caso normale — qui non
   * cambia niente e nessuno viene notificato. Quando non coincidono, il disco
   * vince: i record scritti entrano nel mirror, e il record che il mirror aveva
   * aperto in via ottimistica viene **tolto** se il disco non l'ha aperto (li'
   * c'era gia' un record con lo stesso `effectiveFrom`, aggiornato sul posto).
   * Senza questa rimozione il mirror si terrebbe un fantasma che il disco non ha
   * — cioe' proprio la sovrapposizione che si e' appena evitata sul disco.
   *
   * Resta fuori un caso, e ci resta apposta: se il mirror ha chiuso in via
   * ottimistica un record che sul disco era gia' chiuso, quel record nel mirror
   * ha un `effectiveTo` che il disco non ha. Non produce sovrapposizioni (chiude
   * di piu', non di meno) e sparisce alla prima rilettura al risveglio.
   */
  function reconcileBudgets(
    written: readonly Budget[],
    optimisticId: string,
    startedAt: number,
  ): void {
    // Un import ha sostituito tutto: questi record non c'entrano piu' niente.
    if (generation !== startedAt || importing) return
    mutate((state) => {
      const opened = written.some((b) => b.id === optimisticId)
      const base = opened ? state.budgets : state.budgets.filter((b) => b.id !== optimisticId)
      const aligned =
        base === state.budgets && written.every((w) => state.budgets.some((b) => sameBudget(b, w)))
      if (aligned) return state
      return {
        ...state,
        budgets: written.reduce<readonly Budget[]>((acc, b) => replace(acc, b), base),
      }
    })
  }

  /**
   * Manda in transazione l'intenzione "questa entra in griglia, quella esce", e
   * porta nel mirror **solo** cio' che il disco ha davvero scritto.
   *
   * Il mirror non si muove prima: e' l'unico modo perche' non esista nessun
   * istante in cui il **disco** ha nove categorie in griglia. Vedi
   * `Repository.addCategory`.
   *
   * Resta un caso, e ci resta apposta. Se un altro contesto ha archiviato una
   * categoria che il nostro mirror crede ancora attiva, il disco pianifica su
   * sette e accetta; il mirror, applicando i record scritti, si ritrova nove
   * record non archiviati — cioe' uno stato che il disco non ha. Non produce
   * nessuna griglia da nove, perche' `activeCategories` e' totale e ne
   * restituisce otto per regola, e sparisce alla prima rilettura al risveglio.
   * E' la seconda meta' di ADR 008: una difesa impedisce, l'altra rende innocuo
   * cio' che e' passato lo stesso.
   */
  async function runPlacement(request: CategoryPlacementRequest): Promise<CategoryPlacement> {
    if (importing) throw new ImportInProgressError()
    const startedAt = generation
    // `divergence: false`: il mirror non contiene niente che il disco non abbia,
    // perche' si aggiorna dopo. Se la scrittura fallisce non c'e' nessun record
    // da salvare — solo un'operazione che non e' avvenuta, e la promise rifiuta.
    const result = await schedule({ categoryPlacement: request }, false)
    const outcome = result.categoryPlacement
    if (outcome === undefined) {
      throw new TypeError('La persistenza non ha risposto a categoryPlacement')
    }
    // Un import ha sostituito tutto: questi record non c'entrano piu' niente.
    if (!outcome.ok || generation !== startedAt || importing) return outcome
    mutate((state) => ({
      ...state,
      categories: outcome.written.reduce<readonly Category[]>(
        (acc, c) => replace(acc, c),
        state.categories,
      ),
    }))
    return outcome
  }

  function commitRule(rule: RecurringRule): RecurringRule {
    mutate((state) => ({
      ...state,
      recurringRules: replace(state.recurringRules, rule),
    }))
    push({ recurringRules: [rule] })
    return rule
  }

  return {
    getState: observable.get,
    subscribe: observable.subscribe,

    addExpense(input) {
      assertCents(input.amountCents, 'amountCents')
      // Una lettura sola dell'orologio: la data di default e l'orario vengono
      // dallo stesso istante. Chiederli separatamente vorrebbe dire che a
      // cavallo della mezzanotte la spesa puo' finire datata ieri con l'orario
      // di oggi — un dato falso, plausibile e irriproducibile.
      const instant = localInstant(readInstant())
      const date = input.date ?? instant.date
      assertDate(date, 'date')
      const timestamp = clock()
      return commitExpense({
        id: makeId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        amountCents: input.amountCents,
        categoryId: input.categoryId,
        date,
        // L'orario si scrive **solo** se la spesa sta nel giorno in cui la si
        // sta inserendo. Su una spesa retrodatata l'orologio non sa niente
        // dell'ora in cui e' stata fatta: l'unica cosa vera da scrivere e'
        // niente. Vedi `Expense.timeMinutes`.
        ...(date === instant.date ? { timeMinutes: instant.timeMinutes } : {}),
        source: 'manual',
        ...(input.note !== undefined ? { note: input.note } : {}),
      })
    },

    updateExpense(id, patch) {
      const current = findExpense(id)
      if (!current) return null
      if (patch.amountCents !== undefined) assertCents(patch.amountCents, 'amountCents')
      if (patch.date !== undefined) assertDate(patch.date, 'date')
      const note = patch.note === undefined ? current.note : (patch.note ?? undefined)
      // `timeMinutes` sono i minuti **del giorno `date`**: spostare la spesa a
      // un altro giorno lo rende un orario che nessuno ha osservato, quindi
      // sparisce insieme al giorno a cui apparteneva. Restare sullo stesso
      // giorno (correggere l'importo, la categoria, la nota) non lo tocca.
      const keepsDay = patch.date === undefined || patch.date === current.date
      const timeMinutes = keepsDay ? current.timeMinutes : undefined
      const { note: _dropped, timeMinutes: _time, ...rest } = current
      return commitExpense({
        ...rest,
        ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.date !== undefined ? { date: patch.date } : {}),
        ...(timeMinutes !== undefined ? { timeMinutes } : {}),
        ...(note !== undefined ? { note } : {}),
        updatedAt: clock(),
      })
    },

    deleteExpense(id) {
      const current = findExpense(id)
      if (!current || current.deletedAt !== undefined) return null
      const timestamp = clock()
      return commitExpense({ ...current, deletedAt: timestamp, updatedAt: timestamp })
    },

    restoreExpense(id) {
      const current = findExpense(id)
      if (!current || current.deletedAt === undefined) return null
      const { deletedAt: _removed, ...rest } = current
      return commitExpense({ ...rest, updatedAt: clock() })
    },

    addCategory(input, replacing) {
      return runPlacement({
        incoming: { kind: 'new', id: makeId(), ...input },
        ...(replacing !== undefined ? { replacing } : {}),
        timestamp: clock(),
      })
    },

    unarchiveCategory(id, replacing) {
      return runPlacement({
        incoming: { kind: 'existing', id },
        ...(replacing !== undefined ? { replacing } : {}),
        timestamp: clock(),
      })
    },

    archiveCategory(id) {
      const current = observable.get().categories.find((c) => c.id === id)
      if (!current || current.archived) return null
      const archived: Category = { ...current, archived: true, updatedAt: clock() }
      mutate((state) => ({ ...state, categories: replace(state.categories, archived) }))
      // Non un `put` della copia del mirror: l'intenzione e basta. Il record che
      // finisce sul disco e' quello che sta sul disco con `archived: true`,
      // quindi un mirror vecchio non riporta indietro nome, colore o posizione.
      push({ archiveCategories: [{ id, updatedAt: archived.updatedAt }] })
      return archived
    },

    async deleteCategory(id) {
      if (importing) throw new ImportInProgressError()
      const startedAt = generation
      const result = await schedule({ categoryDeletion: { id } }, false)
      const outcome = result.categoryDeletion
      if (outcome === undefined) {
        throw new TypeError('La persistenza non ha risposto a categoryDeletion')
      }
      if (outcome.ok && generation === startedAt && !importing) {
        mutate((state) => ({
          ...state,
          categories: state.categories.filter((c) => c.id !== id),
        }))
      }
      return outcome
    },

    updateCategory(id, patch) {
      const current = observable.get().categories.find((c) => c.id === id)
      if (!current) return null
      return commitCategory({ ...current, ...patch, updatedAt: clock() })
    },

    reorderCategories(orderedIds) {
      const timestamp = clock()
      const state = observable.get()
      const updated: Category[] = []
      orderedIds.forEach((id, index) => {
        const current = state.categories.find((c) => c.id === id)
        if (!current) return
        const order = (index + 1) * 10
        if (current.order === order) return
        updated.push({ ...current, order, updatedAt: timestamp })
      })
      if (updated.length === 0) return []
      mutate((s) => ({
        ...s,
        categories: updated.reduce<readonly Category[]>((acc, c) => replace(acc, c), s.categories),
      }))
      push({ categories: updated })
      return updated
    },

    addRecurringRule(input) {
      assertCents(input.amountCents, 'amountCents')
      assertDate(input.startDate, 'startDate')
      if (!Number.isInteger(input.interval) || input.interval < 1) {
        throw new RangeError(`interval: atteso un intero >= 1, ricevuto ${input.interval}`)
      }
      const timestamp = clock()
      return commitRule({
        id: makeId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        amountCents: input.amountCents,
        categoryId: input.categoryId,
        cadence: input.cadence,
        interval: input.interval,
        startDate: input.startDate,
        active: true,
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(input.anchorDay !== undefined ? { anchorDay: input.anchorDay } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      })
    },

    updateRecurringRule(id, patch) {
      const current = observable.get().recurringRules.find((r) => r.id === id)
      if (!current) return null
      if (patch.amountCents !== undefined) assertCents(patch.amountCents, 'amountCents')
      const note = patch.note === undefined ? current.note : (patch.note ?? undefined)
      const anchorDay = patch.anchorDay === undefined ? current.anchorDay : (patch.anchorDay ?? undefined)
      const endDate = patch.endDate === undefined ? current.endDate : (patch.endDate ?? undefined)
      const { note: _n, anchorDay: _a, endDate: _e, ...rest } = current
      return commitRule({
        ...rest,
        ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.interval !== undefined ? { interval: patch.interval } : {}),
        ...(patch.active !== undefined ? { active: patch.active } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(anchorDay !== undefined ? { anchorDay } : {}),
        ...(endDate !== undefined ? { endDate } : {}),
        updatedAt: clock(),
      })
    },

    setBudget(change) {
      // L'istante e l'id del record nuovo si decidono **qui**, una volta sola, e
      // viaggiano fino alla transazione: la pianificazione la rifa' il disco, ma
      // su ingressi fissi. Cosi' il piano ottimistico e quello vero coincidono
      // ogni volta che disco e mirror sono d'accordo, e un ritentativo della
      // scrittura riusa lo stesso id invece di aprire un secondo record.
      const request: BudgetChangeRequest = {
        period: change.period,
        amountCents: change.amountCents,
        ...(change.categoryId !== undefined ? { categoryId: change.categoryId } : {}),
        effectiveFrom: change.effectiveFrom,
        timestamp: clock(),
        newRecordId: makeId(),
      }
      const planned = planResolvedBudgetChange(observable.get().budgets, request)
      mutate((state) => ({
        ...state,
        budgets: planned.reduce<readonly Budget[]>((acc, b) => replace(acc, b), state.budgets),
      }))
      const startedAt = generation
      void schedule({ budgetChange: request }, true).then(
        (result) => reconcileBudgets(result.budgets, request.newRecordId, startedAt),
        // L'errore e' gia' registrato dentro `schedule`. Il mirror resta col
        // piano ottimistico: e' l'unica copia di quei record, come per ogni
        // altra scrittura persa.
        () => undefined,
      )
      return planned
    },

    updateSettings(patch) {
      const current = observable.get().settings
      // `null` significa "torna assente", e l'assenza qui e' un dato: la lingua
      // mai scelta la decide l'ambiente, la guida mai completata si rivede. Uno
      // spread nudo scriverebbe `null` dentro un campo tipizzato `Language`.
      const language = patch.language === undefined ? current.language : (patch.language ?? undefined)
      const onboardingCompletedAt =
        patch.onboardingCompletedAt === undefined
          ? current.onboardingCompletedAt
          : (patch.onboardingCompletedAt ?? undefined)
      const {
        language: _lang,
        onboardingCompletedAt: _onboarding,
        ...rest
      } = current
      const next: Settings = {
        ...rest,
        ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
        ...(patch.lastBackupAt !== undefined ? { lastBackupAt: patch.lastBackupAt } : {}),
        ...(language !== undefined ? { language } : {}),
        ...(onboardingCompletedAt !== undefined ? { onboardingCompletedAt } : {}),
        updatedAt: clock(),
      }
      mutate((state) => ({ ...state, settings: next }))
      push({ settings: next })
      return next
    },

    materializeRecurring(day) {
      const target = day ?? localInstant(readInstant()).date
      // Ottimizzazione, non correttezza: due chiamate per lo stesso giorno si
      // dividono lo stesso lavoro invece di rifarlo. Se questa memoizzazione
      // venisse tolta domani l'app resterebbe corretta — l'identita'
      // deterministica delle occorrenze e la semantica add fanno tutto il
      // lavoro serio (ADR 006). E' anche l'unica cosa onesta da dire di un lock
      // in memoria: non vede l'altra scheda Safari aperta sullo stesso
      // database, e non sopravvive a un'interruzione.
      if (importing) return Promise.reject(new ImportInProgressError())

      const running = inFlight
      if (running !== null && running.day === target && running.generation === generation) {
        return running.promise
      }

      const promise = runMaterialization(target).finally(() => {
        if (inFlight?.promise === promise) inFlight = null
      })
      inFlight = { day: target, generation, promise }
      return promise
    },

    exportBackup() {
      return buildBackup(observable.get(), clock)
    },

    async importBackup(data) {
      if (importing) throw new ImportInProgressError()
      importing = true
      try {
        // Prima di distruggere: la fotografia di quello che c'era, che e'
        // l'unico modo per offrire Annulla dopo un import sbagliato. Il mirror
        // contiene gia' tutto quello che e' in coda verso il disco, quindi
        // fotografarlo adesso non perde niente.
        const previous = buildBackup(observable.get(), clock)
        // Da qui una materializzazione in volo non scrivera' un blocco in piu'.
        generation += 1
        // `replaceAll` entra **nella coda**, non la scavalca: `await queue`
        // fotografava la catena di quel momento, e la materializzazione la
        // rilascia fra un blocco e l'altro. Bastava un catch-up in corso perche'
        // venti spese della regola precedente sopravvivessero **insieme** ai
        // dati importati: non una sovrascrittura, una fusione silenziosa fra due
        // dataset.
        const run = queue.then(() => persistence.replaceAll(data))
        queue = run.then(
          () => undefined,
          () => undefined,
        )
        await run
        revision += 1
        // L'unico punto dell'app in cui mirror e disco sono uguali per
        // costruzione, e quindi l'unico in cui si puo' onestamente dire che la
        // divergenza non c'e' piu'.
        pendingError = null
        observable.set({ ...data, writeFailures: NO_WRITE_FAILURES })
        return previous
      } finally {
        importing = false
      }
    },

    async reloadFromDisk() {
      const blocked = reloadBlocker()
      if (blocked !== null) return { reloaded: false, reason: blocked }

      const readAt = revision
      const loaded = await persistence.loadAll()

      // Rileggere costa un giro di eventi: nel frattempo puo' essere cambiato
      // tutto. Si ricontrolla, e nel dubbio non si tocca il mirror.
      const blockedNow = reloadBlocker()
      if (blockedNow !== null) return { reloaded: false, reason: blockedNow }
      if (revision !== readAt) return { reloaded: false, reason: 'mirror-changed' }
      if (loaded.settings === null) {
        // Un database senza impostazioni e' un database mai inizializzato:
        // uno stato che quest'app, dopo `openRepository`, non lascia mai dietro
        // di se'. Adeguarsi vorrebbe dire cancellare il mirror per assecondare
        // un disco che qualcun altro ha svuotato.
        return { reloaded: false, reason: 'uninitialized-disk' }
      }

      revision += 1
      // La memoizzazione della materializzazione e' stata calcolata sul mirror
      // vecchio: chi chiama dopo la rilettura deve ripartire da quello nuovo.
      // La chiamata gia' in volo non si abortisce — rilegge la regola dal
      // mirror prima di ogni blocco, quindi si ferma da sola se serve.
      inFlight = null
      observable.set({
        expenses: loaded.expenses,
        categories: loaded.categories,
        recurringRules: loaded.recurringRules,
        budgets: loaded.budgets,
        settings: loaded.settings,
        writeFailures: observable.get().writeFailures,
      })
      return { reloaded: true }
    },

    async flush() {
      await queue
      // L'errore non si consuma: vedi il commento in testa al file.
      if (pendingError !== null) throw pendingError
    },

    close() {
      persistence.close()
    },
  }
}
