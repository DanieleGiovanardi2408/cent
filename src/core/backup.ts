/**
 * Export e import del backup JSON.
 *
 * `parseBackup` **non applica niente**: legge, migra, valida e restituisce
 * un'anteprima. Applicare e' un'altra chiamata (`Repository.importBackup`), e in
 * mezzo ci sta la conferma dell'utente. E' il requisito "import con anteprima e
 * conferma, mai sovrascrittura silenziosa" scritto come firma di funzione invece
 * che come promessa nella UI: chi importa non ha modo di saltare il passaggio.
 *
 * Il file dichiara la propria `schemaVersion`. Un backup vecchio passa dalle
 * stesse migrazioni del database (`schema.ts`) prima di essere validato, quindi
 * il validatore vede sempre e solo la forma corrente.
 *
 * Fuori da qui, di proposito: l'export CSV (fase 7, e non e' reimportabile per
 * definizione) e la fusione con i dati esistenti. L'import sostituisce tutto.
 */

import { isIsoDate } from './date'
import type { IsoDate } from './date'
import { buildDefaultSettings } from './defaults'
import { SCHEMA_VERSION, SchemaTooNewError, emptyRawDataSet, migrateRawData } from './schema'
import type { RawDataSet, RawRecord } from './schema'
import type {
  Budget,
  Category,
  DataSet,
  Expense,
  RecurringRule,
  Settings,
  StoreName,
  Timestamp,
} from './types'
import { SETTINGS_ID, nowTimestamp } from './types'

export interface BackupFile {
  readonly app: 'cent'
  readonly schemaVersion: number
  readonly exportedAt: Timestamp
  readonly data: {
    readonly expenses: readonly Expense[]
    readonly categories: readonly Category[]
    readonly recurringRules: readonly RecurringRule[]
    readonly budgets: readonly Budget[]
    readonly settings: Settings
  }
}

export function buildBackup(data: DataSet, now: () => Timestamp = nowTimestamp): BackupFile {
  return {
    app: 'cent',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now(),
    data: {
      expenses: data.expenses,
      categories: data.categories,
      recurringRules: data.recurringRules,
      budgets: data.budgets,
      settings: data.settings,
    },
  }
}

export type IssueSeverity = 'error' | 'warning'

export interface ImportIssue {
  readonly severity: IssueSeverity
  /** Dove, in forma leggibile: `expenses[12].amountCents`. */
  readonly path: string
  readonly message: string
}

export interface ImportPreview {
  /** `false` = il file non e' utilizzabile, `data` e' `null`. */
  readonly ok: boolean
  readonly data: DataSet | null
  /** Record validi per store, da mostrare nell'anteprima. */
  readonly counts: Readonly<Record<StoreName, number>>
  /** Record scartati perche' irrecuperabili. */
  readonly discarded: number
  readonly issues: readonly ImportIssue[]
  /** Versione dichiarata dal file, prima delle migrazioni. */
  readonly fromSchemaVersion: number | null
}

class Collector {
  readonly issues: ImportIssue[] = []
  error(path: string, message: string): null {
    this.issues.push({ severity: 'error', path, message })
    return null
  }
  warn(path: string, message: string): void {
    this.issues.push({ severity: 'warning', path, message })
  }
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function optionalStr(value: unknown): string | undefined | false {
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' ? value : false
}

function intCents(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

function isoDate(value: unknown): IsoDate | null {
  return typeof value === 'string' && isIsoDate(value) ? value : null
}

function optionalIsoDate(value: unknown): IsoDate | undefined | false {
  if (value === undefined || value === null) return undefined
  return isoDate(value) ?? false
}

interface BaseFields {
  readonly id: string
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

function base(raw: RawRecord, path: string, c: Collector): BaseFields | null {
  const id = str(raw['id'])
  if (id === null) return c.error(`${path}.id`, 'id assente o non testuale')
  // I timestamp mancanti non giustificano la perdita del record: quello che
  // conta di una spesa e' l'importo, non l'ora in cui e' stata digitata.
  const fallback = new Date(0).toISOString()
  const createdAt = typeof raw['createdAt'] === 'string' ? raw['createdAt'] : fallback
  const updatedAt = typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : createdAt
  return { id, createdAt, updatedAt }
}

function parseExpense(raw: RawRecord, path: string, c: Collector): Expense | null {
  const b = base(raw, path, c)
  if (b === null) return null
  const amountCents = intCents(raw['amountCents'])
  if (amountCents === null) return c.error(`${path}.amountCents`, 'importo non intero in centesimi')
  const categoryId = str(raw['categoryId'])
  if (categoryId === null) return c.error(`${path}.categoryId`, 'categoria assente')
  const date = isoDate(raw['date'])
  if (date === null) return c.error(`${path}.date`, `data non valida: ${String(raw['date'])}`)
  const source = raw['source'] === 'recurring' ? 'recurring' : 'manual'
  const note = optionalStr(raw['note'])
  const recurringId = optionalStr(raw['recurringId'])
  const deletedAt = optionalStr(raw['deletedAt'])
  if (note === false || recurringId === false || deletedAt === false) {
    return c.error(path, 'campi opzionali di tipo sbagliato')
  }
  return {
    ...b,
    amountCents,
    categoryId,
    date,
    source,
    ...(note !== undefined ? { note } : {}),
    ...(recurringId !== undefined ? { recurringId } : {}),
    ...(deletedAt !== undefined ? { deletedAt } : {}),
  }
}

function parseCategory(raw: RawRecord, path: string, c: Collector): Category | null {
  const b = base(raw, path, c)
  if (b === null) return null
  const name = str(raw['name'])
  if (name === null) return c.error(`${path}.name`, 'nome assente')
  const order = raw['order']
  return {
    ...b,
    name,
    emoji: typeof raw['emoji'] === 'string' ? raw['emoji'] : '🔖',
    color: typeof raw['color'] === 'string' ? raw['color'] : '#6b7280',
    order: typeof order === 'number' && Number.isFinite(order) ? order : 0,
    archived: raw['archived'] === true,
  }
}

function parseRule(raw: RawRecord, path: string, c: Collector): RecurringRule | null {
  const b = base(raw, path, c)
  if (b === null) return null
  const amountCents = intCents(raw['amountCents'])
  if (amountCents === null) return c.error(`${path}.amountCents`, 'importo non intero in centesimi')
  const categoryId = str(raw['categoryId'])
  if (categoryId === null) return c.error(`${path}.categoryId`, 'categoria assente')
  const cadence = raw['cadence']
  if (cadence !== 'daily' && cadence !== 'weekly' && cadence !== 'monthly') {
    return c.error(`${path}.cadence`, `cadenza sconosciuta: ${String(cadence)}`)
  }
  const interval = raw['interval']
  if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1) {
    return c.error(`${path}.interval`, `intervallo non valido: ${String(interval)}`)
  }
  const startDate = isoDate(raw['startDate'])
  if (startDate === null) return c.error(`${path}.startDate`, 'data di inizio non valida')
  const endDate = optionalIsoDate(raw['endDate'])
  const lastMaterializedDate = optionalIsoDate(raw['lastMaterializedDate'])
  if (endDate === false || lastMaterializedDate === false) {
    return c.error(path, 'endDate o lastMaterializedDate non sono date valide')
  }
  const note = optionalStr(raw['note'])
  if (note === false) return c.error(`${path}.note`, 'nota non testuale')
  const anchorRaw = raw['anchorDay']
  let anchorDay: number | undefined
  if (anchorRaw !== undefined && anchorRaw !== null) {
    if (typeof anchorRaw !== 'number' || !Number.isInteger(anchorRaw) || anchorRaw < 1 || anchorRaw > 31) {
      return c.error(`${path}.anchorDay`, `giorno di ancoraggio non valido: ${String(anchorRaw)}`)
    }
    anchorDay = anchorRaw
  }
  return {
    ...b,
    amountCents,
    categoryId,
    cadence,
    interval,
    startDate,
    active: raw['active'] !== false,
    ...(note !== undefined ? { note } : {}),
    ...(anchorDay !== undefined ? { anchorDay } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
    ...(lastMaterializedDate !== undefined ? { lastMaterializedDate } : {}),
  }
}

function parseBudget(raw: RawRecord, path: string, c: Collector): Budget | null {
  const b = base(raw, path, c)
  if (b === null) return null
  const period = raw['period']
  if (period !== 'weekly' && period !== 'monthly') {
    return c.error(`${path}.period`, `periodo sconosciuto: ${String(period)}`)
  }
  const amountCents = intCents(raw['amountCents'])
  if (amountCents === null) return c.error(`${path}.amountCents`, 'importo non intero in centesimi')
  const effectiveFrom = isoDate(raw['effectiveFrom'])
  if (effectiveFrom === null) return c.error(`${path}.effectiveFrom`, 'inizio validita non valido')
  const effectiveTo = optionalIsoDate(raw['effectiveTo'])
  if (effectiveTo === false) return c.error(`${path}.effectiveTo`, 'data di fine non valida')
  const categoryId = optionalStr(raw['categoryId'])
  if (categoryId === false) return c.error(`${path}.categoryId`, 'categoria non testuale')
  return {
    ...b,
    period,
    amountCents,
    effectiveFrom,
    ...(categoryId !== undefined ? { categoryId } : {}),
    ...(effectiveTo !== undefined ? { effectiveTo } : {}),
  }
}

function parseSettings(raw: RawRecord | undefined, c: Collector): Settings {
  const fallback = buildDefaultSettings()
  if (raw === undefined) {
    c.warn('settings', 'impostazioni assenti nel file: si usano quelle di default')
    return fallback
  }
  const theme = raw['theme']
  const lastBackupAt = optionalStr(raw['lastBackupAt'])
  if (raw['weekStartsOn'] !== undefined && raw['weekStartsOn'] !== 1) {
    c.warn('settings.weekStartsOn', 'la settimana in questa app inizia sempre di lunedi')
  }
  return {
    id: SETTINGS_ID,
    createdAt: typeof raw['createdAt'] === 'string' ? raw['createdAt'] : fallback.createdAt,
    updatedAt: typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : fallback.updatedAt,
    weekStartsOn: 1,
    theme: theme === 'light' || theme === 'dark' ? theme : 'auto',
    // La versione la decide questa app, non il file: i dati sono appena passati
    // dalle migrazioni e sono nella forma corrente qualunque cosa dica il file.
    schemaVersion: SCHEMA_VERSION,
    ...(lastBackupAt !== undefined && lastBackupAt !== false ? { lastBackupAt } : {}),
  }
}

function rawArray(source: RawRecord, key: StoreName, c: Collector): RawRecord[] {
  const value = source[key]
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    c.warn(key, 'sezione non e un elenco: ignorata')
    return []
  }
  return value.filter((item): item is RawRecord => {
    if (isRecord(item)) return true
    c.warn(key, 'elemento non e un oggetto: ignorato')
    return false
  })
}

function parseList<T extends { readonly id: string }>(
  raws: readonly RawRecord[],
  store: StoreName,
  parse: (raw: RawRecord, path: string, c: Collector) => T | null,
  c: Collector,
): { readonly records: T[]; readonly discarded: number } {
  const byId = new Map<string, T>()
  let discarded = 0
  raws.forEach((raw, index) => {
    const record = parse(raw, `${store}[${index}]`, c)
    if (record === null) {
      discarded += 1
      return
    }
    if (byId.has(record.id)) {
      c.warn(`${store}[${index}]`, `id duplicato ${record.id}: tenuta l'ultima occorrenza`)
    }
    byId.set(record.id, record)
  })
  return { records: [...byId.values()], discarded }
}

const EMPTY_COUNTS: Readonly<Record<StoreName, number>> = {
  expenses: 0,
  categories: 0,
  recurringRules: 0,
  budgets: 0,
  settings: 0,
}

/**
 * Legge un backup e prepara l'anteprima.
 *
 * Non lancia su nessun output di `JSON.parse`, che e' l'unico ingresso reale
 * (`parseBackup(JSON.parse(testo))`): un file rotto e' un caso previsto, e
 * l'utente deve vederselo raccontare, non farsi esplodere l'app. Su un oggetto
 * costruito a mano con getter ostili o un `toString` che lancia, invece, lancia
 * come qualunque altro codice — e nessuno lo chiama cosi'.
 */
export function parseBackup(input: unknown): ImportPreview {
  const c = new Collector()
  const reject = (path: string, message: string): ImportPreview => {
    c.error(path, message)
    return {
      ok: false,
      data: null,
      counts: EMPTY_COUNTS,
      discarded: 0,
      issues: c.issues,
      fromSchemaVersion: null,
    }
  }

  if (!isRecord(input)) return reject('file', 'il contenuto non e un oggetto JSON')
  if (input['app'] !== undefined && input['app'] !== 'cent') {
    return reject('file.app', `questo file dice di appartenere a "${String(input['app'])}"`)
  }
  const declared = input['schemaVersion']
  if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 1) {
    return reject('file.schemaVersion', 'versione dello schema assente o non valida')
  }
  const body = input['data']
  if (!isRecord(body)) return reject('file.data', 'sezione dati assente')

  const raw: RawDataSet = emptyRawDataSet()
  raw.expenses = rawArray(body, 'expenses', c)
  raw.categories = rawArray(body, 'categories', c)
  raw.recurringRules = rawArray(body, 'recurringRules', c)
  raw.budgets = rawArray(body, 'budgets', c)
  const settingsRaw = body['settings']
  raw.settings = isRecord(settingsRaw) ? [settingsRaw] : []

  let migrated: RawDataSet
  try {
    migrated = migrateRawData(raw, declared)
  } catch (error) {
    const message = error instanceof SchemaTooNewError ? error.message : String(error)
    return reject('file.schemaVersion', message)
  }

  const expenses = parseList(migrated.expenses, 'expenses', parseExpense, c)
  const categories = parseList(migrated.categories, 'categories', parseCategory, c)
  const recurringRules = parseList(migrated.recurringRules, 'recurringRules', parseRule, c)
  const budgets = parseList(migrated.budgets, 'budgets', parseBudget, c)
  const settings = parseSettings(migrated.settings[0], c)

  const knownCategories = new Set(categories.records.map((cat) => cat.id))
  const orphans = expenses.records.filter((e) => !knownCategories.has(e.categoryId)).length
  if (orphans > 0) {
    c.warn(
      'expenses',
      `${orphans} spese fanno riferimento a una categoria che non e nel file: vengono importate lo stesso`,
    )
  }

  return {
    ok: true,
    data: {
      expenses: expenses.records,
      categories: categories.records,
      recurringRules: recurringRules.records,
      budgets: budgets.records,
      settings,
    },
    counts: {
      expenses: expenses.records.length,
      categories: categories.records.length,
      recurringRules: recurringRules.records.length,
      budgets: budgets.records.length,
      settings: 1,
    },
    discarded:
      expenses.discarded + categories.discarded + recurringRules.discarded + budgets.discarded,
    issues: c.issues,
    fromSchemaVersion: declared,
  }
}
