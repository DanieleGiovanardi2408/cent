/**
 * Fabbriche di entita' per i test. **Solo per i test**, come
 * `memory-persistence.ts`: nessun file di `src/app` o `src/ui` la importa,
 * quindi non entra nel bundle.
 *
 * Serve a una cosa sola: far vedere in ogni test i tre o quattro campi che
 * contano davvero per quel test, e non gli altri dieci che devono esistere solo
 * perche' il tipo li richiede.
 */

import { today, toDateParts } from './date'
import type { IsoDate } from './date'
import type { DefaultCategoryNames } from './defaults'
import { NO_OCCURRENCES, occupiedOccurrenceDates } from './recurrence'
import { previewMaterialization } from './recurring-plan'
import type { RecurrenceDraft } from './recurring-plan'
import type { Repository } from './repository'
import type {
  Budget,
  Cadence,
  Category,
  Expense,
  RecurringRule,
  RecurringRuleCommon,
  Settings,
} from './types'
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

/**
 * Una regola, con il calendario tenuto insieme dalla fabbrica.
 *
 * `anchorDay` e' **facoltativo qui e obbligatorio nel record**: se non lo si
 * passa, una mensile lo riceve dal giorno di `startDate`. E' la stessa
 * derivazione della migrazione 3 -> 4, ed e' qui per la stessa ragione per cui
 * e' li' — quello era gia' il giorno che il motore usava, quindi un test che
 * non nomina l'ancora continua a descrivere lo stesso calendario di prima.
 *
 * Chi vuole provare l'ancora la passa, ed e' l'unico modo di ottenere una
 * mensile il cui giorno del mese **non** coincide con quello d'inizio: il caso
 * che prima non era nemmeno esprimibile.
 */
export function makeRule(
  fields: Partial<RecurringRuleCommon> & {
    startDate: IsoDate
    cadence?: Cadence
    anchorDay?: number
  },
): RecurringRule {
  const { cadence = 'monthly', anchorDay, ...rest } = fields
  const common: RecurringRuleCommon = {
    id: autoId('rule'),
    createdAt: EPOCH,
    updatedAt: EPOCH,
    amountCents: 5000,
    categoryId: 'cat-1',
    interval: 1,
    active: true,
    ...rest,
  }
  return cadence === 'monthly'
    ? { ...common, cadence, anchorDay: anchorDay ?? toDateParts(fields.startDate).day }
    : { ...common, cadence }
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

/** Una regola come la si scrive: calendario, piu' il campo che l'anteprima non guarda. */
export type BozzaRegola = RecurrenceDraft & { readonly categoryId: string }

/**
 * Creare una regola costa a un test esattamente quello che costa alla UI:
 * si chiede l'anteprima, e si spende il permesso che restituisce.
 *
 * ## Il ritentativo non e' pigrizia
 *
 * Il giorno con cui il test calcola l'anteprima e quello che il repository
 * legge al momento di scrivere sono **due letture d'orologio**, e fra le due
 * puo' passare la mezzanotte. Quando succede la scrittura rifiuta — e' il suo
 * mestiere, ed e' l'oggetto di questa consegna — e la cosa giusta da fare e'
 * ricalcolare, che e' anche cio' che la UI dovra' fare. Senza, questa suite
 * avrebbe un test che fallisce una volta ogni qualche anno alle 00:00: la
 * mezzanotte in questo progetto ha gia' morso due volte proprio cosi'.
 */
export function creaRegola(repo: Repository, bozza: BozzaRegola, giorno?: IsoDate): RecurringRule {
  for (let tentativo = 0; tentativo < 2; tentativo += 1) {
    // `NO_OCCURRENCES`: la regola non esiste ancora, il suo id sara' un UUID
    // appena generato, nessun record puo' portarlo. E' un fatto, non un default.
    const anteprima = previewMaterialization(bozza, giorno ?? today(), NO_OCCURRENCES)
    if (!anteprima.ok) throw new Error(`anteprima rifiutata: ${anteprima.reason}`)
    const esito = repo.addRecurringRule({ categoryId: bozza.categoryId }, anteprima.confirmed)
    if (esito.ok) return esito.rule
    if (esito.reason !== 'stale-preview') throw new Error(`scrittura rifiutata: ${esito.reason}`)
  }
  throw new Error('due anteprime di fila rifiutate: non e la mezzanotte')
}

/** Come sopra, per la modifica: il calendario nuovo passa dalla stessa porta. */
export function rivediRegola(
  repo: Repository,
  id: string,
  bozza: RecurrenceDraft,
  giorno?: IsoDate,
): RecurringRule {
  for (let tentativo = 0; tentativo < 2; tentativo += 1) {
    // Le occorrenze di **questa** regola gia' a disco: la finestra si apre dopo
    // il segnaposto, quindi di norma non ce n'e' nessuna dentro — ma "di norma"
    // non e' un argomento, e il conteggio lo si prende dal mirror come fa la UI.
    const anteprima = previewMaterialization(
      bozza,
      giorno ?? today(),
      occupiedOccurrenceDates(id, repo.getState().expenses),
    )
    if (!anteprima.ok) throw new Error(`anteprima rifiutata: ${anteprima.reason}`)
    const esito = repo.reviseRecurringRule(id, anteprima.confirmed)
    if (esito.ok) return esito.rule
    if (esito.reason !== 'stale-preview') throw new Error(`scrittura rifiutata: ${esito.reason}`)
  }
  throw new Error('due anteprime di fila rifiutate: non e la mezzanotte')
}
