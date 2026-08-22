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
import { DB_NAME, MIGRATIONS, SCHEMA_VERSION, STORE_NAMES, emptyRawDataSet, pendingMigrations } from './schema'
import type { MigrationStep, RawDataSet, RawRecord } from './schema'
import { isAfter } from './date'
import { NOTHING_SKIPPED } from './persistence'
import type { LoadedData, Persistence, WriteBatch, WriteResult } from './persistence'
import type { Budget, Category, DataSet, Expense, RecurringRule, Settings, StoreName } from './types'
import { SETTINGS_ID } from './types'

export interface CentDB extends DBSchema {
  expenses: { key: string; value: Expense; indexes: { 'by-date': string } }
  categories: { key: string; value: Category }
  recurringRules: { key: string; value: RecurringRule }
  budgets: { key: string; value: Budget }
  settings: { key: string; value: Settings }
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
 * Nessun passo pubblicato ha oggi un `transform`: alla versione 1 c'e' solo la
 * creazione degli store. Il trasporto da e verso gli object store e' pero'
 * esercitato dai test, che iniettano dei passi finti (`migrations` in
 * `OpenOptions`) — un ramo che gira solo il giorno della prima migrazione vera
 * e' un ramo che quel giorno non funziona.
 */
async function applyTransforms(
  tx: UpgradeTx,
  oldVersion: number,
  newVersion: number,
  steps: readonly MigrationStep[],
): Promise<void> {
  const withTransform = pendingMigrations(oldVersion, newVersion, steps).filter((s) => s.transform)
  if (withTransform.length === 0) return

  const existing = STORE_NAMES.filter((name) => tx.objectStoreNames.contains(name))
  let data: RawDataSet = emptyRawDataSet()
  for (const name of existing) {
    data[name] = (await tx.objectStore(name).getAll()) as unknown as RawRecord[]
  }
  for (const step of withTransform) {
    if (step.transform) data = step.transform(data)
  }
  for (const name of existing) {
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
  const names: StoreName[] = []
  if (batch.expenses || batch.addExpenses) names.push('expenses')
  if (batch.categories) names.push('categories')
  if (batch.recurringRules || batch.advanceRecurringMarkers) names.push('recurringRules')
  if (batch.budgets) names.push('budgets')
  if (batch.settings) names.push('settings')
  return names
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

type WriteTx = IDBPTransaction<CentDB, StoreName[], 'readwrite'>

/** Il corpo di una scrittura, dentro una transazione gia' aperta. */
async function runBatch(tx: WriteTx, batch: WriteBatch): Promise<WriteResult> {
  const skippedIds: string[] = []
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
    for (const record of batch.categories) enqueue(store.put(record))
  }
  if (batch.recurringRules) {
    const store = tx.objectStore('recurringRules')
    for (const record of batch.recurringRules) enqueue(store.put(record))
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
  if (batch.settings) enqueue(tx.objectStore('settings').put(batch.settings))

  await Promise.all(writes)
  await tx.done
  return { skippedIds }
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

    async replaceAll(data: DataSet): Promise<void> {
      await withDb(async (connection) => {
        const tx = connection.transaction([...STORE_NAMES], 'readwrite')
        try {
          await Promise.all(STORE_NAMES.map((name) => tx.objectStore(name).clear()))
          await runBatch(tx, {
            expenses: data.expenses,
            categories: data.categories,
            recurringRules: data.recurringRules,
            budgets: data.budgets,
            settings: data.settings,
          })
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
