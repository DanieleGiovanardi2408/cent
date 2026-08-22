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

import { isAfter, isIsoDate, today as todayFrom } from './date'
import type { IsoDate } from './date'
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
import { planBudgetChange } from './budget'
import type { BudgetChange } from './budget'
import { buildBackup } from './backup'
import type { BackupFile } from './backup'
import { createObservable } from './store'
import type {
  Budget,
  Cadence,
  Category,
  DataSet,
  Expense,
  RecurringRule,
  Settings,
  ThemePreference,
  Timestamp,
} from './types'
import { newId as defaultNewId, nowTimestamp } from './types'

export interface NewExpense {
  readonly amountCents: Cents
  readonly categoryId: string
  /** Default: oggi. E' il caso normale, e non deve costare un tap. */
  readonly date?: IsoDate
  readonly note?: string
}

export interface ExpensePatch {
  readonly amountCents?: Cents
  readonly categoryId?: string
  readonly date?: IsoDate
  /** `null` cancella la nota. */
  readonly note?: string | null
}

export interface NewCategory {
  readonly name: string
  readonly emoji: string
  readonly color: string
  /** Default: in fondo. */
  readonly order?: number
}

export interface CategoryPatch {
  readonly name?: string
  readonly emoji?: string
  readonly color?: string
  readonly order?: number
  readonly archived?: boolean
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
}

export interface RepositoryOptions {
  readonly now?: () => Timestamp
  readonly newId?: () => string
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

  addCategory(input: NewCategory): Category
  updateCategory(id: string, patch: CategoryPatch): Category | null
  /** Riscrive `order` seguendo l'elenco dato. Gli id sconosciuti sono ignorati. */
  reorderCategories(orderedIds: readonly string[]): readonly Category[]

  addRecurringRule(input: NewRecurringRule): RecurringRule
  updateRecurringRule(id: string, patch: RecurringRulePatch): RecurringRule | null

  /** Chiude il budget in vigore e ne apre uno nuovo. Vedi `budget.ts`. */
  setBudget(change: Omit<BudgetChange, 'now' | 'newId'>): readonly Budget[]

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
      const date = input.date ?? todayFrom()
      assertDate(date, 'date')
      const timestamp = clock()
      return commitExpense({
        id: makeId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        amountCents: input.amountCents,
        categoryId: input.categoryId,
        date,
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
      const { note: _dropped, ...rest } = current
      return commitExpense({
        ...rest,
        ...(patch.amountCents !== undefined ? { amountCents: patch.amountCents } : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.date !== undefined ? { date: patch.date } : {}),
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

    addCategory(input) {
      const timestamp = clock()
      const orders = observable.get().categories.map((c) => c.order)
      const order = input.order ?? (orders.length === 0 ? 10 : Math.max(...orders) + 10)
      return commitCategory({
        id: makeId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        name: input.name,
        emoji: input.emoji,
        color: input.color,
        order,
        archived: false,
      })
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
      const written = planBudgetChange(observable.get().budgets, {
        ...change,
        now: clock,
        newId: makeId,
      })
      mutate((state) => ({
        ...state,
        budgets: written.reduce<readonly Budget[]>((acc, b) => replace(acc, b), state.budgets),
      }))
      push({ budgets: written })
      return written
    },

    updateSettings(patch) {
      const next: Settings = {
        ...observable.get().settings,
        ...patch,
        updatedAt: clock(),
      }
      mutate((state) => ({ ...state, settings: next }))
      push({ settings: next })
      return next
    },

    materializeRecurring(day) {
      const target = day ?? todayFrom()
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
