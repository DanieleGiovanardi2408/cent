/**
 * Schema del database e migrazioni.
 *
 * Le migrazioni sono definite come **trasformazioni pure** su un insieme di
 * record grezzi (`RawDataSet`), non come codice IndexedDB. Cosi' lo stesso
 * elenco di passi serve a due consumatori diversi:
 *
 * 1. l'apertura del database (`idb.ts`), che le applica dentro la transazione
 *    di upgrade;
 * 2. l'**import** di un backup JSON scritto da una versione precedente
 *    (`backup.ts`), che non passa da IndexedDB.
 *
 * Averne una copia sola e' l'unico modo perche' i due percorsi non divergano,
 * ed e' anche l'unico modo per testarle in node.
 */

import type { StoreName } from './types'

export const DB_NAME = 'cent'

/** Versione corrente. Si incrementa aggiungendo un passo a `MIGRATIONS`. */
export const SCHEMA_VERSION = 2

export const STORE_NAMES: readonly StoreName[] = [
  'expenses',
  'categories',
  'recurringRules',
  'budgets',
  'settings',
]

/** Un record letto dal database o da un file, prima di essere validato. */
export type RawRecord = Record<string, unknown>

/** Tutti i record, per store. `settings` e' un array di 0 o 1 elementi. */
export type RawDataSet = { [K in StoreName]: RawRecord[] }

export interface IndexSpec {
  readonly name: string
  readonly keyPath: string | readonly string[]
  readonly unique?: boolean
}

export interface StoreSpec {
  readonly name: StoreName
  readonly indexes: readonly IndexSpec[]
}

export interface MigrationStep {
  /** Versione raggiunta da questo passo. */
  readonly to: number
  readonly summary: string
  /** Store creati a questa versione (keyPath sempre `id`). */
  readonly createStores?: readonly StoreSpec[]
  /** Indici aggiunti a store che esistevano gia'. */
  readonly addIndexes?: readonly { readonly store: StoreName; readonly index: IndexSpec }[]
  /**
   * Trasformazione dei record. Riceve l'insieme completo e ne restituisce uno
   * nuovo: deve essere pura e non deve mai perdere record senza dirlo.
   */
  readonly transform?: (data: RawDataSet) => RawDataSet
}

/**
 * Indici.
 *
 * Sono pochi di proposito. La UI **non interroga IndexedDB**: legge dal mirror
 * in memoria caricato all'avvio (`repository.ts`), quindi raggruppamenti,
 * filtri e aggregazioni sono `Array.prototype` su dati gia' in RAM — 5.000
 * spese sono circa 700 KB, e un filtro su 5.000 elementi costa decine di
 * microsecondi. Aggiungere indici per query che nessuno esegue vorrebbe dire
 * pagarli a ogni singola scrittura in cambio di niente.
 *
 * `by-date` esiste per l'unica lettura vera che il database riceve: il
 * caricamento iniziale, che con un cursore sull'indice arriva gia' ordinato per
 * data e risparmia un sort. E' anche l'indice da cui partirebbe un eventuale
 * caricamento a finestre, se un giorno l'archivio diventasse troppo grande per
 * stare tutto in memoria.
 *
 * Non c'e' un indice su `recurringId`: la deduplica delle ricorrenze lavora sul
 * mirror, non sul database (vedi `recurrence.ts`).
 */
const INITIAL_STORES: readonly StoreSpec[] = [
  { name: 'expenses', indexes: [{ name: 'by-date', keyPath: 'date' }] },
  { name: 'categories', indexes: [] },
  { name: 'recurringRules', indexes: [] },
  { name: 'budgets', indexes: [] },
  { name: 'settings', indexes: [] },
]

/**
 * I passi, in ordine crescente di `to`.
 *
 * Regole per chi ne aggiunge uno:
 * - non modificare mai un passo gia' pubblicato, se ne aggiunge un altro;
 * - `transform` non cancella record. Se un record non e' piu' rappresentabile
 *   si converte, non si butta: l'utente non ha nessun altro posto dove averlo.
 */
export const MIGRATIONS: readonly MigrationStep[] = [
  {
    to: 1,
    summary: 'Schema iniziale: expenses, categories, recurringRules, budgets, settings',
    createStores: INITIAL_STORES,
  },
  {
    to: 2,
    summary: 'Expense.timeMinutes (opzionale); le impostazioni dichiarano la versione 2',
    /**
     * `timeMinutes` e' **opzionale**, quindi le spese gia' scritte non hanno
     * niente da ricevere: una spesa inserita prima di questa versione non ha un
     * orario, e l'unica cosa vera da scrivere sarebbe nessuna. Riempirle con uno
     * zero (mezzanotte) o con l'ora di `createdAt` significherebbe fabbricare a
     * tavolino un dato che nessuno ha mai osservato, e le statistiche per fascia
     * oraria della fase 6 non avrebbero modo di distinguerlo da uno vero.
     *
     * Quello che invece va aggiornato e' il record delle impostazioni: porta
     * scritto con quale versione dello schema questi dati sono stati scritti, e
     * dopo l'upgrade continuerebbe a dire 1 per sempre — l'unico campo che
     * mentirebbe. E' un record solo, il singleton.
     *
     * Le altre sezioni escono da qui **con lo stesso riferimento** con cui sono
     * entrate: e' cosi' che `idb.ts` sa di non doverle riscrivere (vedi
     * `applyTransforms`), ed e' la forma verificabile di "la migrazione non tocca
     * i record esistenti".
     */
    transform: (data) => ({
      ...data,
      settings: data.settings.map((raw) => ({ ...raw, schemaVersion: 2 })),
    }),
  },
]

export function emptyRawDataSet(): RawDataSet {
  return { expenses: [], categories: [], recurringRules: [], budgets: [], settings: [] }
}

/** I passi da applicare per portare dei dati da `fromVersion` a `toVersion`. */
export function pendingMigrations(
  fromVersion: number,
  toVersion: number,
  steps: readonly MigrationStep[] = MIGRATIONS,
): readonly MigrationStep[] {
  return steps.filter((s) => s.to > fromVersion && s.to <= toVersion).sort((a, b) => a.to - b.to)
}

export class SchemaTooNewError extends Error {
  constructor(
    readonly foundVersion: number,
    readonly supportedVersion: number,
  ) {
    super(
      `Dati scritti dalla versione ${foundVersion} dello schema, questa app arriva alla ${supportedVersion}. ` +
        `Aggiorna l'app prima di importarli.`,
    )
    this.name = 'SchemaTooNewError'
  }
}

/**
 * Porta un insieme di record grezzi da `fromVersion` a `toVersion`.
 *
 * Non valida le forme: si limita ad applicare le trasformazioni. La validazione
 * e' a valle, in `backup.ts`, e vede quindi sempre record gia' nella forma
 * corrente.
 *
 * @throws SchemaTooNewError se i dati vengono dal futuro. Rifiutarli e' l'unica
 * scelta onesta: aprirli con uno schema piu' vecchio significherebbe scartare in
 * silenzio i campi che non conosciamo e riscriverli mutilati.
 */
export function migrateRawData(
  data: RawDataSet,
  fromVersion: number,
  toVersion: number = SCHEMA_VERSION,
  steps: readonly MigrationStep[] = MIGRATIONS,
): RawDataSet {
  if (fromVersion > toVersion) throw new SchemaTooNewError(fromVersion, toVersion)
  let current = data
  for (const step of pendingMigrations(fromVersion, toVersion, steps)) {
    if (step.transform) current = step.transform(current)
  }
  return current
}
