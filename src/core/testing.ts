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
  DataSet,
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

/**
 * **Un archivio in cui ogni campo dichiarato porta un valore**, e l'unione
 * delle liste copre l'intero inventario dei tipi d'archivio.
 *
 * ## Il difetto che esiste per chiudere
 *
 * `backup.ts` ha un'asimmetria: `buildBackup` passa i record **per
 * riferimento** — qualunque campo esce — mentre `parseRule`, `parseExpense` e
 * le altre **ricostruiscono campo per campo**. Un campo nuovo esce nel file e
 * non rientra, e rientra `ok: true` con zero issue: **perdita silenziosa sul
 * percorso del ripristino**, cioe' nel punto peggiore in cui un'app
 * local-first possa averne una.
 *
 * Il round-trip con `toEqual` c'era gia' e non l'ha preso. Il confronto era
 * completo; era la **fixture** a essere parziale: `dataset()` in
 * `backup.test.ts` non popolava `RecurringRule.note`, e un campo che nessuno
 * scrive non si puo' perdere. Misurato sul backup vero del 26 agosto prima di
 * scrivere questa funzione — `EXPORT "Palestra"` / `IMPORT undefined` / `ok: true`.
 *
 * ## Perche' e' qui e non nel file di test
 *
 * Perche' ha due consumatori: questa guardia, e `docs/demo.json` — il profilo
 * dimostrativo degli screenshot, che deve mostrare ogni cosa che l'app sa
 * disegnare. Le due cose vogliono la stessa **forma** (ogni campo popolato) e
 * volumi diversi, quindi la forma sta qui una volta sola.
 *
 * ## I record sono plausibili, non solo completi
 *
 * Nessun record che la produzione non potrebbe scrivere: un'occorrenza generata
 * porta `recurringId` e **non** `timeMinutes` (una spesa che l'app ha creato da
 * sola non ha osservato nessun orologio), una lapide porta `deletedAt` su una
 * spesa che prima era viva. La copertura si ottiene con l'unione di record
 * onesti, non con un mostro che nessuna schermata potrebbe produrre — altrimenti
 * il giro proverebbe che il parser regge una forma che non incontrera' mai.
 */
export function completeDataSet(): DataSet {
  return {
    expenses: [
      // Manuale, con tutto quello che un inserimento a mano puo' portare.
      makeExpense({
        id: 'exp-manuale',
        date: '2026-08-01',
        amountCents: 1_250,
        categoryId: 'cat-attiva',
        note: 'Caffe e brioche',
        timeMinutes: 1_240,
        source: 'manual',
      }),
      // Generata da una regola: `recurringId`, e nessun orario.
      makeExpense({
        id: 'rec:rule-mensile:2026-08-25',
        date: '2026-08-25',
        amountCents: 50_700,
        categoryId: 'cat-attiva',
        source: 'recurring',
        recurringId: 'rule-mensile',
      }),
      // Lapide: cancellata, e resta nel backup perche' l'import non la resusciti.
      makeExpense({
        id: 'exp-cancellata',
        date: '2026-08-03',
        amountCents: 500,
        categoryId: 'cat-archiviata',
        source: 'manual',
        deletedAt: '2026-08-03T10:00:00.000Z',
      }),
    ],
    categories: [
      makeCategory({ id: 'cat-attiva', name: 'Spesa', emoji: '🛒', color: '#709951', order: 10 }),
      // `archived: true` e' un valore del campo, non la sua assenza: senza una
      // categoria archiviata il giro non proverebbe niente su quel booleano.
      makeCategory({
        id: 'cat-archiviata',
        name: 'Coffeeshop',
        emoji: '🌿',
        color: '#00a6c6',
        order: 20,
        archived: true,
      }),
    ],
    recurringRules: [
      // Mensile: e' l'unica cadenza che porta `anchorDay`.
      makeRule({
        id: 'rule-mensile',
        cadence: 'monthly',
        anchorDay: 25,
        startDate: '2026-01-25',
        endDate: '2026-12-31',
        lastMaterializedDate: '2026-08-25',
        amountCents: 50_700,
        categoryId: 'cat-attiva',
        note: 'La stanza',
        interval: 1,
        active: true,
      }),
      // Settimanale e spenta: copre `cadence` fuori dal ramo mensile e `active`
      // nel valore che l'altro record non ha.
      makeRule({
        id: 'rule-settimanale',
        cadence: 'weekly',
        startDate: '2026-02-01',
        amountCents: 2_300,
        categoryId: 'cat-attiva',
        note: 'Palestra',
        interval: 2,
        active: false,
      }),
    ],
    budgets: [
      makeBudget({
        id: 'bud-chiuso',
        period: 'weekly',
        amountCents: 20_000,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-07-31',
      }),
      makeBudget({
        id: 'bud-aperto',
        period: 'monthly',
        amountCents: 80_000,
        effectiveFrom: '2026-08-01',
      }),
    ],
    settings: makeSettings({
      lastBackupAt: '2026-08-01T09:00:00.000Z',
      language: 'it',
      onboardingCompletedAt: '2026-08-23T10:00:00.000Z',
      theme: 'dark',
    }),
  }
}
