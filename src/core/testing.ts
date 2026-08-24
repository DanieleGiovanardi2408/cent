/**
 * Fabbriche di entita' per i test. **Solo per i test**, come
 * `memory-persistence.ts`: nessun file di `src/app` o `src/ui` la importa,
 * quindi non entra nel bundle.
 *
 * Serve a una cosa sola: far vedere in ogni test i tre o quattro campi che
 * contano davvero per quel test, e non gli altri dieci che devono esistere solo
 * perche' il tipo li richiede.
 */

import type { IsoDate } from './date'
import type { DefaultCategoryNames } from './defaults'
import type { Budget, Category, Expense, RecurringRule, Settings } from './types'
import { SETTINGS_ID } from './types'
import { SCHEMA_VERSION } from './schema'

const EPOCH = '2020-01-01T00:00:00.000Z'

/**
 * I nomi con cui i test aprono il repository.
 *
 * Sono in **inglese**, che e' la lingua di default dell'app: un test che
 * seminasse in italiano racconterebbe la storia di prima, cioe' quella in cui i
 * nomi erano cablati nel core.
 *
 * Nessun test deve dipendere da *queste* parole per qualcosa che non siano le
 * categorie di default: il punto della cucitura e' che i nomi vengano da fuori,
 * e chi vuole provarlo passa i propri (vedi `defaults.test.ts`).
 */
export const TEST_CATEGORY_NAMES: DefaultCategoryNames = {
  groceries: 'Groceries',
  eatingOut: 'Eating out',
  coffeeshop: 'Coffeeshop',
  cigarettes: 'Cigarettes',
  transport: 'Transport',
  leisure: 'Leisure',
  home: 'Home',
  extra: 'Extra',
}

/** Id prevedibili: `pre-1`, `pre-2`, ... Gli assert restano leggibili. */
export function sequentialIds(prefix = 'id'): () => string {
  let n = 0
  return () => {
    n += 1
    return `${prefix}-${n}`
  }
}

/** Orologio che avanza di un millisecondo a ogni lettura: timestamp ordinabili. */
export function tickingClock(start = EPOCH): () => string {
  let ms = new Date(start).getTime()
  return () => {
    ms += 1
    return new Date(ms).toISOString()
  }
}

let counter = 0
function autoId(kind: string): string {
  counter += 1
  return `${kind}-${counter}`
}

export function makeExpense(fields: Partial<Expense> & { date: IsoDate }): Expense {
  return {
    id: autoId('exp'),
    createdAt: EPOCH,
    updatedAt: EPOCH,
    amountCents: 1000,
    categoryId: 'cat-1',
    source: 'manual',
    ...fields,
  }
}

export function makeRule(fields: Partial<RecurringRule> & { startDate: IsoDate }): RecurringRule {
  return {
    id: autoId('rule'),
    createdAt: EPOCH,
    updatedAt: EPOCH,
    amountCents: 5000,
    categoryId: 'cat-1',
    cadence: 'monthly',
    interval: 1,
    active: true,
    ...fields,
  }
}

export function makeBudget(
  fields: Partial<Budget> & { effectiveFrom: IsoDate; amountCents: number },
): Budget {
  return {
    id: autoId('bud'),
    createdAt: EPOCH,
    updatedAt: EPOCH,
    period: 'monthly',
    ...fields,
  }
}

export function makeCategory(fields: Partial<Category> & { name: string }): Category {
  return {
    id: autoId('cat'),
    createdAt: EPOCH,
    updatedAt: EPOCH,
    emoji: '🔖',
    color: '#6b7280',
    order: 10,
    archived: false,
    ...fields,
  }
}

export function makeSettings(fields: Partial<Settings> = {}): Settings {
  return {
    id: SETTINGS_ID,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    weekStartsOn: 1,
    theme: 'auto',
    schemaVersion: SCHEMA_VERSION,
    ...fields,
  }
}
