/**
 * L'unico file che conosce IndexedDB.
 *
 * Implementa `Persistence` con `idb`. Tutto il resto di `src/core` parla con
 * l'interfaccia.
 *
 * Non c'e' validazione in lettura: questi record li ha scritti quest'app, e
 * IndexedDB li restituisce dallo structured clone com'erano. Il posto in cui i
 * dati sconosciuti vengono validati e' l'import (`backup.ts`), che e' l'unica
 * porta da cui entra roba scritta da qualcun altro.
 *
 * ## La connessione non e' per sempre
 *
 * WebKit chiude le connessioni IndexedDB delle web app in background senza
 * chiedere il permesso. Una `IDBPDatabase` terminata non lo dice: lancia
 * `InvalidStateError` alla prima transazione successiva, e da li' in poi ogni
 * scrittura fallisce in silenzio dietro l'ottimismo del mirror — cioe' l'utente
 * inserisce spese tutto il giorno, le vede, e alla riapertura non ci sono.
 *
 * Per questo la connessione qui e' **lazy e sostituibile**: `terminated` la
 * butta via, `blocking` la chiude quando un altro contesto deve aggiornare lo
 * schema (senza, la scheda vecchia terrebbe in ostaggio la PWA nuova, che non si
 * aprirebbe mai e mostrerebbe una pagina bianca senza spiegazioni), e la
 * scrittura successiva ne apre una nuova. Una scrittura che fallisce perche' la
 * connessione era morta viene ritentata **una volta** su quella nuova: la
 * transazione fallita non ha scritto niente, quindi il ritentativo non e'
 * ambiguo.
 */

import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb'
import {
  DB_NAME,
  MIGRATIONS,
  MIGRATED_STORES,
  REPLACED_STORES,
  SCHEMA_VERSION,
  emptyRawDataSet,
  pendingMigrations,
} from './schema'
import type { MigrationStep, RawDataSet, RawRecord } from './schema'
import { planResolvedBudgetChange } from './budget'
import { planCategoryDeletion, planCategoryPlacement } from './categories'
import { planRecurringRuleDeletion, planRecurringRuleRewind } from './recurring-plan'
import type { RecurringRuleDeletion, RecurringRuleRewind } from './recurring-plan'
import type { CategoryDeletion, CategoryPlacement } from './categories'
import { isAfter } from './date'
import { NOTHING_SKIPPED } from './persistence'
import type { LoadedData, Persistence, WriteBatch, WriteResult } from './persistence'
import { buildPreImportSnapshot } from './snapshot'
import type {
  AnyStoreName,
  Budget,
  Category,
  DataSet,
  Expense,
  PreImportSnapshot,
  RecurringRule,
  Settings,
  StoreName,
  Timestamp,
} from './types'
import { ALL_STORES, PRE_IMPORT_SNAPSHOT_ID, SETTINGS_ID } from './types'

export interface CentDB extends DBSchema {
  expenses: { key: string; value: Expense; indexes: { 'by-date': string } }
  categories: { key: string; value: Category }
  recurringRules: { key: string; value: RecurringRule }
  budgets: { key: string; value: Budget }
  settings: { key: string; value: Settings }
  /**
   * Store di **sistema**: non si migra con l'archivio, non esce nel backup, e
   * `replaceAll` non lo cancella. Vedi le due famiglie in `types.ts`.
   */
  preImportSnapshot: {
    key: string
    value: PreImportSnapshot
    indexes: { 'by-takenAt': string }
  }
}

type UpgradeTx = IDBPTransaction<CentDB, StoreNames<CentDB>[], 'versionchange'>

function applyStructure(
  db: IDBPDatabase<CentDB>,
  tx: UpgradeTx,
  oldVersion: number,
  newVersion: number,
  steps: readonly MigrationStep[],
): void {
  for (const step of pendingMigrations(oldVersion, newVersion, steps)) {
    for (const spec of step.createStores ?? []) {
      const store = db.createObjectStore(spec.name, { keyPath: 'id' })
      for (const index of spec.indexes) {
        store.createIndex(
          index.name as never,
          index.keyPath as string,
          index.unique === true ? { unique: true } : {},
        )
      }
    }
    for (const addition of step.addIndexes ?? []) {
      tx.objectStore(addition.store).createIndex(
        addition.index.name as never,
        addition.index.keyPath as string,
        addition.index.unique === true ? { unique: true } : {},
      )
    }
  }
}

/**
 * Applica le trasformazioni dei record dentro la transazione di upgrade.
 *
 * Dalla versione 2 un passo pubblicato ha un `transform` (vedi `MIGRATIONS`),
 * quindi questo percorso e' quello che gira davvero all'aggiornamento dell'app,
 * non solo con i passi finti che i test iniettano (`migrations` in
 * `OpenOptions`) — che restano, perche' servono a esercitare anche i casi che
 * nessun passo vero ha ancora, tipo una trasformazione che esplode a meta'.
 *
 * **Si riscrive solo cio' che la trasformazione ha davvero cambiato.** Un passo
 * e' una funzione pura che restituisce un `RawDataSet` nuovo, ma le sezioni che
 * non ha toccato le restituisce con lo stesso riferimento (`{...data, settings:
 * ...}`); qui quel riferimento vale come prova che non c'e' niente da scrivere.
 * Senza questo controllo l'aggiornamento a una versione che cambia solo il
 * singleton delle impostazioni riscriverebbe comunque 5.000 spese: tempo speso
 * a rimettere sul disco byte identici, dentro la transazione di upgrade, cioe'
 * davanti al primo avvio dopo l'aggiornamento.
 */
async function applyTransforms(
  tx: UpgradeTx,
  oldVersion: number,
  newVersion: number,
  steps: readonly MigrationStep[],
): Promise<void> {
  const withTransform = pendingMigrations(oldVersion, newVersion, steps).filter((s) => s.transform)
  if (withTransform.length === 0) return

  const existing = MIGRATED_STORES.filter((name) => tx.objectStoreNames.contains(name))
  const before: RawDataSet = emptyRawDataSet()
  for (const name of existing) {
    before[name] = (await tx.objectStore(name).getAll()) as unknown as RawRecord[]
  }
  let data: RawDataSet = before
  for (const step of withTransform) {
    if (step.transform) data = step.transform(data)
  }
  for (const name of existing) {
    if (data[name] === before[name]) continue
    const store = tx.objectStore(name)
    await store.clear()
    for (const record of data[name]) await store.put(record as never)
  }
}

export interface OpenOptions {
  readonly name?: string
  readonly version?: number
  /**
   * I passi di migrazione. Di norma quelli di `schema.ts`: il parametro esiste
   * perche' i test possano far girare davvero il percorso di upgrade senza
   * aspettare che esista una versione 2.
   */
  readonly migrations?: readonly MigrationStep[]
  /** Un altro contesto sta aggiornando lo schema: qui si chiude e si molla. */
  readonly blocking?: () => void
  /** Noi stiamo bloccando un altro contesto che vuole aggiornare. */
  readonly blocked?: () => void
  /** Il browser ha chiuso la connessione sotto i piedi. */
  readonly terminated?: () => void
}

export async function openCentDatabase(options: OpenOptions = {}): Promise<IDBPDatabase<CentDB>> {
  const version = options.version ?? SCHEMA_VERSION
  const steps = options.migrations ?? MIGRATIONS
  return openDB<CentDB>(options.name ?? DB_NAME, version, {
    upgrade(db, oldVersion, newVersion, tx) {
      const target = newVersion ?? version
      applyStructure(db, tx as UpgradeTx, oldVersion, target, steps)
      // Se una trasformazione fallisce la transazione di upgrade viene abortita
      // e `openDB` rifiuta: meglio un'app che non si apre di un database mezzo
      // migrato, che sarebbe irrecuperabile senza che nessuno se ne accorga.
      applyTransforms(tx as UpgradeTx, oldVersion, target, steps).catch(() => {
        try {
          tx.abort()
        } catch {
          // Gia' abortita dall'errore stesso: non c'e' altro da fare.
        }
        // L'abort fa rifiutare anche `tx.done`, che qui non aspetta nessuno:
        // senza questo `catch` sarebbe una unhandled rejection sputata da un
        // percorso che stiamo gia' gestendo.
        void tx.done.catch(() => undefined)
      })
    },
    ...(options.blocked !== undefined ? { blocked: options.blocked } : {}),
    ...(options.blocking !== undefined ? { blocking: options.blocking } : {}),
    ...(options.terminated !== undefined ? { terminated: options.terminated } : {}),
  })
}

/** Gli store toccati da un batch, per aprire la transazione piu' stretta possibile. */
function storesOf(batch: WriteBatch): StoreName[] {
  const names = new Set<StoreName>()
  if (batch.expenses || batch.addExpenses) names.add('expenses')
  if (
    batch.categories ||
    batch.archiveCategories ||
    batch.categoryPlacement ||
    batch.categoryDeletion
  ) {
    names.add('categories')
  }
  if (
    batch.recurringRules ||
    batch.advanceRecurringMarkers ||
    batch.recurringRuleDeletion ||
    batch.recurringRuleRewind
  ) {
    names.add('recurringRules')
  }
  if (batch.budgets || batch.budgetChange) names.add('budgets')
  if (batch.settings) names.add('settings')
  // Cancellare una categoria dipende da chi la nomina: le **due** letture
  // stanno nella stessa transazione della cancellazione, altrimenti sarebbero
  // un controllo fatto "appena prima", cioe' la stessa gara con una finestra
  // piu' stretta (ADR 008). L'elenco qui deve restare l'esatto specchio degli
  // argomenti di `planCategoryDeletion`: uno store dimenticato qui non e' un
  // permesso sbagliato, e' un `NotFoundError` sulla transazione. I budget ne
  // sono usciti insieme a `Budget.categoryId`: un budget non puo' piu'
  // nominare una categoria, quindi aprirne lo store era bloccare una scrittura
  // in piu' per leggere una risposta che era zero per costruzione.
  if (batch.categoryDeletion) {
    names.add('expenses')
    names.add('recurringRules')
  }
  // Stessa ragione, un riferimento solo: chi nomina una regola sono le spese
  // che ha generato. Anche qui l'elenco deve restare lo specchio esatto degli
  // argomenti di `planRecurringRuleDeletion`.
  if (batch.recurringRuleDeletion) names.add('expenses')
  // E il rewind, per la stessa ragione: l'impronta ri-derivata e' il calendario
  // **meno** cio' che sul disco c'e' gia', e cio' che c'e' gia' sono le spese
  // che quella regola ha generato. Anche qui l'elenco deve restare lo specchio
  // esatto degli argomenti di `planRecurringRuleRewind`.
  if (batch.recurringRuleRewind) names.add('expenses')
  return [...names]
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String((error as { name: unknown }).name)
    : ''
}

/** L'errore che lascia una connessione morta: la transazione non e' mai partita. */
function isConnectionGone(error: unknown): boolean {
  const name = errorName(error)
  return name === 'InvalidStateError' || name === 'TransactionInactiveError'
}

export class PersistenceClosedError extends Error {
  constructor() {
    super('La persistenza e stata chiusa')
    this.name = 'PersistenceClosedError'
  }
}

export interface IdbPersistence extends Persistence {
  /** Quante volte la connessione e' stata riaperta. Serve ai test, non alla UI. */
  readonly reopenCount: number
}

/**
 * Una transazione di scrittura. E' aperta su `AnyStoreName` — cioe' su tutte e
 * due le famiglie — perche' import e ripristino toccano anche lo store di
 * sistema; `storesOf` continua a restituire la lista **piu' stretta possibile**,
 * e questa e' la sua controparte piu' larga possibile a livello di tipo.
 */
type WriteTx = IDBPTransaction<CentDB, AnyStoreName[], 'readwrite'>

/** Il corpo di una scrittura, dentro una transazione gia' aperta. */
async function runBatch(tx: WriteTx, batch: WriteBatch): Promise<WriteResult> {
  const skippedIds: string[] = []
  let budgetsWritten: readonly Budget[] = []
  let placement: CategoryPlacement | undefined
  let deletion: CategoryDeletion | undefined
  let ruleDeletion: RecurringRuleDeletion | undefined
  let ruleRewind: RecurringRuleRewind | undefined
  const writes: Promise<unknown>[] = []

  /**
   * Accoda una richiesta tenendone a bada il rifiuto.
   *
   * Il `catch` vuoto non nasconde niente: l'errore vero lo raccoglie
   * `Promise.all` piu' sotto. Serve a evitare che, quando la transazione viene
   * abortita prima di arrivarci, le richieste gia' partite risultino "unhandled
   * rejection" — rumore che nasconde l'errore che conta.
   */
  const enqueue = (request: Promise<unknown>): void => {
    request.catch(() => undefined)
    writes.push(request)
  }

  if (batch.addExpenses) {
    const store = tx.objectStore('expenses')
    // Il controllo e l'inserimento stanno nella **stessa** transazione:
    // IndexedDB serializza le readwrite sullo stesso store, quindi fra il
    // `getKey` e l'`add` non si infila nessuno — nemmeno un altro contesto
    // sullo stesso database.
    //
    // Perche' un `getKey` e non semplicemente `add` con l'errore catturato: in
    // IndexedDB una richiesta fallita abortisce la transazione che la contiene.
    // Un solo id gia' occupato butterebbe via anche le occorrenze buone del
    // blocco e il segnaposto che viaggia con loro — cioe' il contrario di
    // "salta quella e vai avanti". `add` (e non `put`) resta come ultima rete:
    // se l'id risultasse comunque occupato la transazione abortisce, il che e'
    // rumoroso ma non sovrascrive niente.
    for (const record of batch.addExpenses) {
      const taken = await store.getKey(record.id)
      if (taken !== undefined) {
        skippedIds.push(record.id)
        continue
      }
      enqueue(store.add(record))
    }
  }
  if (batch.expenses) {
    const store = tx.objectStore('expenses')
    for (const record of batch.expenses) enqueue(store.put(record))
  }
  if (batch.categories) {
    const store = tx.objectStore('categories')
    // `archived` non passa di qui: si rilegge dal disco e si conserva. Un mirror
    // vecchio che rinomina una categoria archiviata altrove la riporterebbe in
    // griglia, e sarebbe la nona.
    for (const record of batch.categories) {
      const current = await store.get(record.id)
      enqueue(store.put(current === undefined ? record : { ...record, archived: current.archived }))
    }
  }
  if (batch.archiveCategories) {
    const store = tx.objectStore('categories')
    for (const archival of batch.archiveCategories) {
      const current = await store.get(archival.id)
      if (current === undefined || current.archived) continue
      enqueue(store.put({ ...current, archived: true, updatedAt: archival.updatedAt }))
    }
  }
  if (batch.categoryPlacement) {
    const store = tx.objectStore('categories')
    // Il tetto si verifica **qui**, sulle categorie che stanno sul disco adesso.
    // Chi ha premuto il tasto ha deciso quale categoria vuole e quale sostituire,
    // non se c'e' posto: quella risposta ha bisogno dello stato vero, e un mirror
    // vecchio non vede l'ottava aggiunta da un altro contesto.
    //
    // IndexedDB serializza le readwrite sullo stesso store, quindi fra questo
    // `getAll` e i `put` che ne seguono non si infila nessuno.
    placement = planCategoryPlacement(await store.getAll(), batch.categoryPlacement)
    // I due record — quella che esce e quella che entra — nella stessa
    // transazione: o passa lo scambio intero, o non passa niente.
    if (placement.ok) for (const record of placement.written) enqueue(store.put(record))
  }
  if (batch.categoryDeletion) {
    const store = tx.objectStore('categories')
    // La cancellazione vera e' l'unica operazione irreversibile su una
    // categoria, ed e' anche l'unica il cui permesso dipende interamente da
    // record che stanno in altri store. Si rileggono qui dentro.
    deletion = planCategoryDeletion(
      await store.getAll(),
      await tx.objectStore('expenses').getAll(),
      await tx.objectStore('recurringRules').getAll(),
      batch.categoryDeletion,
    )
    if (deletion.ok) enqueue(store.delete(deletion.deleted.id))
  }
  if (batch.recurringRules) {
    const store = tx.objectStore('recurringRules')
    for (const record of batch.recurringRules) enqueue(store.put(record))
  }
  if (batch.recurringRuleDeletion) {
    const store = tx.objectStore('recurringRules')
    // Le spese si rileggono **qui dentro**: il permesso dipende interamente da
    // record di un altro store, e un conteggio fatto appena prima e' la stessa
    // gara con una finestra piu' stretta (ADR 008).
    ruleDeletion = planRecurringRuleDeletion(
      await store.getAll(),
      await tx.objectStore('expenses').getAll(),
      batch.recurringRuleDeletion,
    )
    if (ruleDeletion.ok) enqueue(store.delete(ruleDeletion.deleted.id))
  }
  if (batch.recurringRuleRewind) {
    const store = tx.objectStore('recurringRules')
    // La regola si rilegge **qui dentro**, e l'impronta si ri-deriva da lei: cio'
    // che ha attraversato il confine e' l'intenzione piu' i numeri mostrati, non
    // le date gia' calcolate (ADR 008).
    //
    // Le spese servono, e non sono un ripensamento: l'impronta e' il calendario
    // **meno** le occorrenze gia' scritte, e quelle stanno solo qui. Una lettura
    // sola, e la sottrazione la fa il piano — non N interrogazioni, una per
    // data candidata, che su una giornaliera riavvolta di due anni sarebbero 730.
    ruleRewind = planRecurringRuleRewind(
      await store.getAll(),
      await tx.objectStore('expenses').getAll(),
      batch.recurringRuleRewind,
    )
    if (ruleRewind.ok) enqueue(store.put(ruleRewind.rule))
  }
  if (batch.advanceRecurringMarkers) {
    const store = tx.objectStore('recurringRules')
    // Rilettura **dentro** la transazione: quello che finisce sul disco e' la
    // regola che c'e' sul disco con un campo in piu', non la copia che aveva in
    // mano chi ha chiesto la scrittura. E' l'unico modo perche' un contesto con
    // il mirror vecchio non riporti indietro `amountCents` o `active`.
    for (const advance of batch.advanceRecurringMarkers) {
      const current = await store.get(advance.id)
      if (current === undefined) continue
      const previous = current.lastMaterializedDate
      if (previous !== undefined && !isAfter(advance.lastMaterializedDate, previous)) continue
      enqueue(
        store.put({
          ...current,
          lastMaterializedDate: advance.lastMaterializedDate,
          updatedAt: advance.updatedAt,
        }),
      )
    }
  }
  if (batch.budgets) {
    const store = tx.objectStore('budgets')
    for (const record of batch.budgets) enqueue(store.put(record))
  }
  if (batch.budgetChange) {
    const store = tx.objectStore('budgets')
    // Pianificazione **dentro** la transazione, sui budget che stanno sul disco
    // adesso. Chi ha premuto il tasto ha deciso l'importo e il giorno, non quali
    // record chiudere: quella decisione ha bisogno dello stato vero, e un mirror
    // vecchio non vede il record aperto da un altro contesto — non lo chiude, e
    // la sovrapposizione che ne resta non e' correggibile da nessuna schermata.
    //
    // IndexedDB serializza le readwrite sullo stesso store, quindi fra questo
    // `getAll` e i `put` che ne seguono non si infila nessun altro contesto.
    budgetsWritten = planResolvedBudgetChange(await store.getAll(), batch.budgetChange)
    for (const record of budgetsWritten) enqueue(store.put(record))
  }
  if (batch.settings) enqueue(tx.objectStore('settings').put(batch.settings))

  await Promise.all(writes)
  await tx.done
  return {
    skippedIds,
    budgets: budgetsWritten,
    ...(placement !== undefined ? { categoryPlacement: placement } : {}),
    ...(deletion !== undefined ? { categoryDeletion: deletion } : {}),
    ...(ruleDeletion !== undefined ? { recurringRuleDeletion: ruleDeletion } : {}),
    ...(ruleRewind !== undefined ? { recurringRuleRewind: ruleRewind } : {}),
  }
}

/**
 * Lo scatto da scrivere, letto dall'archivio **dentro la transazione**.
 *
 * `null` quando non c'e' nessun record `settings`: un database mai
 * inizializzato non ha nessuno stato a cui tornare, e uno scatto di niente
 * sarebbe una voce in Impostazioni che promette un ripristino vuoto.
 */
async function readArchive(tx: WriteTx, takenAt: Timestamp): Promise<PreImportSnapshot | null> {
  const settings = await tx.objectStore('settings').get(SETTINGS_ID)
  if (settings === undefined) return null
  return buildPreImportSnapshot(
    {
      expenses: await tx.objectStore('expenses').getAll(),
      categories: await tx.objectStore('categories').getAll(),
      recurringRules: await tx.objectStore('recurringRules').getAll(),
      budgets: await tx.objectStore('budgets').getAll(),
      settings,
    },
    takenAt,
  )
}

/**
 * Abortisce una transazione andata storta e ne assorbe l'esito.
 *
 * Un errore **sincrono** (un record che non passa lo structured clone, uno
 * store sbagliato) non abortisce la transazione da solo: senza questo, la meta'
 * buona del batch finirebbe sul disco lo stesso e "o va tutto o non va niente"
 * resterebbe una promessa scritta solo nei commenti. `tx.done` va consumata
 * perche' l'abort la fa rifiutare, e nessuno la sta aspettando.
 */
async function rollback(tx: WriteTx): Promise<void> {
  try {
    tx.abort()
  } catch {
    // Gia' abortita dall'errore stesso: e' lo stato che volevamo.
  }
  await tx.done.catch(() => undefined)
}

/**
 * La persistenza vera. Non riceve una connessione: la apre quando serve e la
 * riapre se il browser gliela porta via.
 */
export function createIdbPersistence(options: OpenOptions = {}): IdbPersistence {
  let db: IDBPDatabase<CentDB> | null = null
  let opening: Promise<IDBPDatabase<CentDB>> | null = null
  let closed = false
  let opened = 0

  function drop(connection: IDBPDatabase<CentDB> | null): void {
    if (connection !== null && db === connection) db = null
  }

  async function connect(): Promise<IDBPDatabase<CentDB>> {
    if (closed) throw new PersistenceClosedError()
    if (db !== null) return db
    if (opening === null) {
      opening = openCentDatabase({
        ...options,
        blocking() {
          // Un altro contesto vuole aggiornare lo schema (o cancellare il
          // database). Chi non chiude qui lo blocca per sempre: la finestra
          // nuova non parte e non ha nemmeno modo di dirlo.
          const current = db
          drop(current)
          current?.close()
          options.blocking?.()
        },
        terminated() {
          // WebKit ha chiuso la connessione: si butta via, la prossima
          // scrittura ne aprira' un'altra.
          db = null
          options.terminated?.()
        },
      }).then(
        (connection) => {
          opening = null
          opened += 1
          if (closed) {
            connection.close()
            throw new PersistenceClosedError()
          }
          db = connection
          return connection
        },
        (error: unknown) => {
          opening = null
          throw error
        },
      )
    }
    return opening
  }

  /** Esegue `run`, e se la connessione era morta la rifa' e riprova una volta. */
  async function withDb<T>(run: (connection: IDBPDatabase<CentDB>) => Promise<T>): Promise<T> {
    const first = await connect()
    try {
      return await run(first)
    } catch (error) {
      if (closed || !isConnectionGone(error)) throw error
      drop(first)
      first.close()
      return run(await connect())
    }
  }

  return {
    get reopenCount() {
      return Math.max(0, opened - 1)
    },

    async loadAll(): Promise<LoadedData> {
      return withDb(async (connection) => {
        // Le spese arrivano gia' ordinate per data: e' l'unica ragione per cui
        // l'indice `by-date` esiste.
        const [expenses, categories, recurringRules, budgets, settings] = await Promise.all([
          connection.getAllFromIndex('expenses', 'by-date'),
          connection.getAll('categories'),
          connection.getAll('recurringRules'),
          connection.getAll('budgets'),
          connection.get('settings', SETTINGS_ID),
        ])
        return { expenses, categories, recurringRules, budgets, settings: settings ?? null }
      })
    },

    async write(batch: WriteBatch): Promise<WriteResult> {
      const names = storesOf(batch)
      if (names.length === 0) return NOTHING_SKIPPED
      return withDb(async (connection) => {
        const tx = connection.transaction(names, 'readwrite')
        try {
          return await runBatch(tx, batch)
        } catch (error) {
          await rollback(tx)
          throw error
        }
      })
    },

    async replaceAll(data: DataSet, takenAt: Timestamp): Promise<Timestamp | null> {
      return withDb(async (connection) => {
        // La transazione si apre su **tutte e due** le famiglie: lo scatto e la
        // sostituzione sono la stessa operazione, e se fossero due transazioni
        // esisterebbe l'istante "import senza scatto" (ADR 008).
        const tx = connection.transaction([...ALL_STORES], 'readwrite') as WriteTx
        try {
          // Lo stato precedente si legge **qui dentro, dal disco**, e non lo
          // porta il chiamante: e' il caso "il valore da scrivere dipende da
          // cosa c'e' gia' li'". Un mirror ha in piu' cio' che la coda non ha
          // ancora scritto e in meno cio' che ha scritto un altro contesto.
          const snapshot = await readArchive(tx, takenAt)
          const store = tx.objectStore('preImportSnapshot')
          // In tutti e due i rami lo store resta con **esattamente uno**
          // scatto o con nessuno: l'id e' una costante, quindi il `put`
          // sostituisce quello di ieri invece di affiancarglisi.
          //
          // Il `delete` e' l'invariante scritta invece che argomentata, e vale
          // la pena dire quanto: oggi non e' raggiungibile, perche' per
          // arrivarci servirebbe un archivio **senza** `settings` che ha
          // pero' gia' uno scatto — e gli scrittori del record `settings` sono
          // tre, `WriteBatch.settings`, `replaceAll` e `restoreSnapshot`, che
          // lo mettono e non lo tolgono mai. Nessuno lo cancella. Resta perche'
          // costa una riga e rende l'invariante vera per costruzione invece che
          // per una catena di tre argomenti che il prossimo lettore dovrebbe
          // rifare.
          if (snapshot === null) await store.delete(PRE_IMPORT_SNAPSHOT_ID)
          else await store.put(snapshot)
          await Promise.all(REPLACED_STORES.map((name) => tx.objectStore(name).clear()))
          await runBatch(tx, {
            expenses: data.expenses,
            categories: data.categories,
            recurringRules: data.recurringRules,
            budgets: data.budgets,
            settings: data.settings,
          })
          return snapshot === null ? null : snapshot.takenAt
        } catch (error) {
          await rollback(tx)
          throw error
        }
      })
    },

    close(): void {
      closed = true
      const current = db
      db = null
      current?.close()
    },
  }
}
