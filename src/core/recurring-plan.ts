/**
 * Le tre domande che si fanno su una regola **prima** di scrivere qualcosa.
 *
 * 1. **Quanto pesa al mese** (`monthlyCostCents`, `monthlyFixedCosts`): il
 *    numero che sta accanto al budget e che ADR 016 rende obbligatorio.
 * 2. **Cosa succede se la salvo** (`previewMaterialization`): quante spese
 *    arretrate, da quando a quando, per quanto.
 * 3. **Posso cancellarla** (`planRecurringRuleDeletion`).
 *
 * Tutto puro e sincrono, come `categories.ts`: nessun I/O, nessun orologio
 * implicito, il giorno di riferimento arriva sempre come argomento. Il motore
 * vero — quello che scrive — sta in `recurrence.ts` e non lo si duplica qui:
 * l'anteprima riusa `materializationWindow` e `occurrencesBetween`, che sono le
 * stesse funzioni che la materializzazione esegue davvero.
 */

import { isAfter, isBefore } from './date'
import type { IsoDate } from './date'
import type { Cents } from './money'
import { materializationWindow, occurrencesBetween, validateRule } from './recurrence'
import type { Cadence, Expense, RecurringRule } from './types'

/* ------------------------------------------------------------------------- *
 * 1. Il totale mensile delle fisse
 * ------------------------------------------------------------------------- */

/**
 * Giorni dell'anno medio gregoriano: 146097 giorni ogni 400 anni.
 *
 * E' il solo punto in cui questo file usa un numero non intero, ed e' il costo
 * dichiarato della normalizzazione a mese.
 */
export const DAYS_PER_YEAR = 365.2425

/** Settimane dell'anno medio: 52,17750. */
export const WEEKS_PER_YEAR = DAYS_PER_YEAR / 7

const MONTHS_PER_YEAR = 12

/**
 * Quante volte all'anno scatta questa regola, ignorando `startDate`, `endDate`
 * e `active`. Un tasso, non un conteggio: e' un numero con la virgola apposta.
 */
function occurrencesPerYear(cadence: Cadence, interval: number): number {
  switch (cadence) {
    case 'daily':
      return DAYS_PER_YEAR / interval
    case 'weekly':
      return WEEKS_PER_YEAR / interval
    case 'monthly':
      return MONTHS_PER_YEAR / interval
  }
}

/**
 * Quanto costa al mese questa regola, in centesimi interi.
 *
 * ## La convenzione, per esteso, perche' e' un'approssimazione dichiarata
 *
 * Si passa **dall'anno**: `mensile = importo x occorrenze_all_anno / 12`, dove
 * l'anno e' l'anno medio gregoriano (365,2425 giorni, cioe' 52,1775 settimane).
 * Poi si arrotonda al centesimo, una volta sola, per regola.
 *
 * Non e' l'unica convenzione possibile ed e' scelta di proposito:
 *
 * - **Il caso piu' comune resta esatto.** Una mensile con `interval: 1` da'
 *   `12/12 = 1`, cioe' l'importo tale e quale. L'affitto — il motivo per cui
 *   questo numero esiste — non subisce nessuna approssimazione.
 * - **L'anno torna.** Dodici volte il numero mensile e' il costo annuo vero, a
 *   meno dell'arrotondamento. E' la proprieta' che conta, perche' questa cifra
 *   verra' confrontata con uno stipendio. Le convenzioni piu' "rotonde" — 4
 *   settimane al mese, 30 giorni al mese — non ce l'hanno: una settimanale da
 *   100 diventerebbe 400 al mese, cioe' 4.800 all'anno contro i 5.217 che escono
 *   davvero. Quattrocento euro di errore l'anno, sempre in difetto, e sempre nel
 *   verso che fa sembrare le fisse piu' leggere di quanto sono.
 *
 * ## Cosa questo numero **non** e'
 *
 * Non e' quanto uscira' **questo** mese. Una settimanale da 100 vale 434,81 al
 * mese, ma il mese con cinque scadenze ne vedra' uscire 500. E' un tasso, non
 * una previsione di cassa: chi vuole sapere che cosa scatta in un mese preciso
 * usa `occurrencesBetween`, che risponde esatto.
 *
 * Non tiene conto di `startDate` ne' di `endDate`: una regola che finisce fra
 * tre giorni pesa qui come una senza scadenza. Il filtro su chi e' in vigore lo
 * fa `monthlyFixedCosts`, che e' l'unico posto in cui quella domanda ha una data
 * a cui riferirsi.
 *
 * ## Una regola non valida vale zero
 *
 * `interval: 0` o `anchorDay: 40` non lanciano: restituiscono 0. E' la stessa
 * dottrina di `resolveBudget` e di `activeCategories` — una funzione di lettura
 * totale, perche' un dato sporco arrivato da un import non deve poter svuotare
 * la schermata che lo mostra.
 */
export function monthlyCostCents(rule: RecurringRule): Cents {
  if (validateRule(rule) !== null) return 0
  const perYear = occurrencesPerYear(rule.cadence, rule.interval)
  return Math.round((rule.amountCents * perYear) / MONTHS_PER_YEAR)
}

export interface FixedCostLine {
  readonly rule: RecurringRule
  /** Il costo mensile normalizzato di questa sola regola. */
  readonly monthlyCents: Cents
}

export interface MonthlyFixedCosts {
  /** La somma delle righe. Interi sommati fra loro: nessun errore accumulato. */
  readonly totalCents: Cents
  /** Le regole che ci sono dentro, dalla piu' pesante. Ordine totale. */
  readonly lines: readonly FixedCostLine[]
}

/**
 * "Fisse: 1.040 € al mese" — il secondo dei due numeri di ADR 016, quello senza
 * il quale il budget mostrato da solo e' un'omissione.
 *
 * Conta le regole **in vigore il giorno `onDate`**, cioe':
 *
 * - `active`;
 * - `startDate <= onDate`: una regola che comincia il mese prossimo non e'
 *   ancora un costo, e metterla dentro direbbe che escono soldi che non escono;
 * - `endDate` assente o `>= onDate`: una regola finita non e' piu' un costo.
 *
 * Le due esclusioni sono deliberate e sono anche il limite dichiarato di questo
 * numero: e' la fotografia di **adesso**, non un piano. Chi vuole vedere in
 * anticipo il peso di una regola futura ha `monthlyCostCents` sulla singola
 * regola, che non guarda le date.
 *
 * L'arrotondamento e' per riga e poi si sommano interi: il totale mostrato e'
 * sempre esattamente la somma delle righe mostrate. L'alternativa — sommare i
 * float e arrotondare alla fine — darebbe un totale che a volte non torna con
 * l'elenco sotto, che e' il modo piu' rapido per far dubitare di tutti i numeri
 * della schermata.
 */
export function monthlyFixedCosts(
  rules: readonly RecurringRule[],
  onDate: IsoDate,
): MonthlyFixedCosts {
  const lines: FixedCostLine[] = []
  let totalCents = 0
  for (const rule of rules) {
    if (!rule.active) continue
    if (isBefore(onDate, rule.startDate)) continue
    if (rule.endDate !== undefined && isAfter(onDate, rule.endDate)) continue
    // Una regola non valida non compare nemmeno come riga da zero: non e' un
    // costo, e' un record rotto. `monthlyCostCents` la porterebbe a 0 lo stesso,
    // ma una riga "Affitto — 0,00 €" e' un numero sbagliato con l'aria di
    // essere giusto.
    if (validateRule(rule) !== null) continue
    const monthlyCents = monthlyCostCents(rule)
    lines.push({ rule, monthlyCents })
    totalCents += monthlyCents
  }
  // Ordine totale: importo, poi id. Due regole da 900 non devono scambiarsi di
  // posto a seconda di come il mirror le ha restituite.
  lines.sort((a, b) => b.monthlyCents - a.monthlyCents || (a.rule.id < b.rule.id ? -1 : 1))
  return { totalCents, lines }
}

/* ------------------------------------------------------------------------- *
 * 2. L'anteprima, prima di scrivere
 * ------------------------------------------------------------------------- */

/**
 * Una regola **non ancora salvata**: i campi che decidono il calendario e
 * l'importo, senza id ne' timestamp.
 *
 * `categoryId` non c'e' perche' non entra in nessuno dei numeri qui sotto. Una
 * `RecurringRule` vera e' comunque assegnabile a questo tipo — e va bene, con
 * `lastMaterializedDate` incluso: l'anteprima di una regola gia' esistente
 * risponde alla stessa domanda ("cosa scrive la prossima materializzazione"),
 * ed e' cio' che serve per riattivare una regola rimasta ferma dei mesi.
 */
export interface RecurrenceDraft {
  readonly amountCents: Cents
  readonly cadence: Cadence
  readonly interval: number
  readonly anchorDay?: number
  readonly startDate: IsoDate
  readonly endDate?: IsoDate
  /**
   * Presente solo per una regola che esiste gia'. Assente su una regola nuova,
   * ed e' l'assenza che produce l'arretrato: si parte da `startDate`.
   */
  readonly lastMaterializedDate?: IsoDate
}

export interface MaterializationPreview {
  /** Quante spese verrebbero scritte. Esatto, non un campione. */
  readonly count: number
  /** La prima, o `null` se non ce n'e' nessuna. */
  readonly firstDate: IsoDate | null
  /** L'ultima, o `null`. */
  readonly lastDate: IsoDate | null
  /** `count` per l'importo della regola. */
  readonly totalCents: Cents
  /**
   * La prima occorrenza cade **prima di oggi**: salvare riscrive dei periodi
   * gia' passati.
   *
   * E' la condizione con cui si decide se chiedere conferma. Senza, si
   * chiederebbe conferma anche a chi crea "spesa di oggi in poi", che e' il caso
   * normale e non ha niente da confermare — e una conferma che compare sempre
   * smette di essere letta, come l'indicatore che grida tutti i mesi.
   */
  readonly backdated: boolean
  /** Le prime `maxDates` occorrenze, per mostrarne un elenco. */
  readonly dates: readonly IsoDate[]
  /** Vero se `dates` e' stato tagliato: `count` resta il numero vero. */
  readonly truncated: boolean
}

export type MaterializationPreviewResult =
  | ({ readonly ok: true } & MaterializationPreview)
  /** La regola non e' salvabile. `reason` e' il messaggio di `validateRule`. */
  | { readonly ok: false; readonly reason: string }

const DEFAULT_MAX_DATES = 12

/**
 * Che cosa scriverebbe il motore se questa regola venisse salvata adesso.
 *
 * ## Perche' esiste
 *
 * *"Affitto, 900, mensile, dal 1 gennaio"* creata ad agosto scrive **otto**
 * spese per 7.200 € e cambia i totali di otto periodi passati, all'istante e
 * senza dire niente. Le date passate sono legittime — e' cosi' che si registra
 * un affitto che esiste da mesi — quindi non si vietano: **si dichiara cosa
 * succede**. E' la stessa dottrina dell'import, che mostra l'anteprima e chiede
 * conferma invece di sovrascrivere in silenzio.
 *
 * ## Perche' non ricalcola niente per conto suo
 *
 * Usa `materializationWindow` e `occurrencesBetween`, cioe' **le stesse due
 * funzioni** che `materializeRecurring` esegue. Se l'anteprima avesse una copia
 * propria del calendario, il giorno in cui una delle due cambiasse l'utente
 * confermerebbe un numero e ne otterrebbe un altro: un'anteprima che diverge
 * dalla scrittura e' peggio di nessuna anteprima, perche' e' una bugia con un
 * bottone di conferma sotto.
 *
 * ## Cosa **non** copre
 *
 * Non sa se sul disco esistano gia' spese con quegli id. Per una regola nuova
 * non possono esistere (l'id contiene un UUID appena generato), e per una regola
 * esistente la finestra parte dopo il segnaposto, che per costruzione dichiara
 * gia' scritto tutto cio' che sta prima. Resta un solo caso scoperto: un altro
 * contesto che ha materializzato mentre questa schermata era aperta. Li'
 * l'anteprima conta di piu' di quel che verra' scritto — mai di meno, perche'
 * `addExpenses` salta e non sovrascrive. E' l'unico verso accettabile: si
 * annuncia piu' di quanto si fa.
 */
export function previewMaterialization(
  draft: RecurrenceDraft,
  today: IsoDate,
  maxDates: number = DEFAULT_MAX_DATES,
): MaterializationPreviewResult {
  // Una regola sintetica: `occurrencesBetween` chiede una `RecurringRule` e
  // legge solo i campi del calendario. L'id non finisce da nessuna parte —
  // l'anteprima non scrive — ma serve a `validateRule` per il messaggio.
  const rule: RecurringRule = {
    id: 'anteprima',
    createdAt: '',
    updatedAt: '',
    amountCents: draft.amountCents,
    categoryId: '',
    cadence: draft.cadence,
    interval: draft.interval,
    startDate: draft.startDate,
    active: true,
    ...(draft.anchorDay !== undefined ? { anchorDay: draft.anchorDay } : {}),
    ...(draft.endDate !== undefined ? { endDate: draft.endDate } : {}),
    ...(draft.lastMaterializedDate !== undefined
      ? { lastMaterializedDate: draft.lastMaterializedDate }
      : {}),
  }

  // Prima della finestra: `occurrencesBetween` lancia su una regola non valida,
  // e un'anteprima che lancia lascia la schermata senza risposta proprio mentre
  // l'utente sta ancora scrivendo i campi.
  const problem = validateRule(rule)
  if (problem !== null) return { ok: false, reason: problem }

  const window = materializationWindow(rule, today)
  const dates = window === null ? [] : occurrencesBetween(rule, window.from, window.to)

  const first = dates[0] ?? null
  const last = dates[dates.length - 1] ?? null
  const cap = Math.max(0, maxDates)
  return {
    ok: true,
    count: dates.length,
    firstDate: first,
    lastDate: last,
    totalCents: draft.amountCents * dates.length,
    backdated: first !== null && isBefore(first, today),
    dates: dates.slice(0, cap),
    truncated: dates.length > cap,
  }
}

/* ------------------------------------------------------------------------- *
 * 3. Cancellare una regola
 * ------------------------------------------------------------------------- */

export interface RecurringRuleDeletionRequest {
  readonly id: string
}

export type RecurringRuleDeletion =
  | { readonly ok: true; readonly deleted: RecurringRule }
  | { readonly ok: false; readonly reason: 'unknown' }
  | {
      readonly ok: false
      readonly reason: 'in-use'
      /** Spese generate dalla regola, **cancellate comprese**. */
      readonly expenses: number
    }

/**
 * Il piano per cancellare **davvero** una regola ricorrente.
 *
 * E' `planCategoryDeletion` applicato a un'altra entita', e ha di proposito la
 * stessa forma: stessa purezza, stesso rifiuto con i numeri dentro, stesso
 * "chiamalo prima di disegnare il bottone". Due operazioni che rispondono alla
 * stessa domanda devono avere la stessa API, o la seconda diventa un caso
 * particolare da ricordare a memoria.
 *
 * L'unica condizione e' che nessuna spesa la nomini. Le spese generate
 * **restano** — la storia non cambia mai retroattivamente, e cancellare la
 * regola non e' un pentimento sui soldi gia' usciti — quindi cancellare il
 * record lascerebbe dei `recurringId` che puntano al vuoto: righe che nessuna
 * schermata sa piu' spiegare e che nessuno puo' riparare.
 *
 * Contano anche le spese **con `deletedAt`**, per la stessa ragione delle
 * categorie: un soft delete resta nello Storico e resta nell'export, quindi il
 * suo riferimento e' vivo a tutti gli effetti.
 *
 * Se qualcuno la usa, la risposta non e' "no": e' **disattivala**
 * (`updateRecurringRule(id, { active: false })`). Che si puo' fare sempre, non
 * perde niente, e produce esattamente cio' che l'utente voleva — che non esca
 * piu' quella spesa. La cancellazione vera serve solo a togliere di mezzo una
 * regola sbagliata appena creata, ed e' esattamente il caso in cui non ha
 * ancora generato niente.
 *
 * **`rules` ed `expenses` devono essere lo stato su cui la scrittura andra'
 * davvero ad atterrare** (ADR 008): il conteggio fatto su un mirror vecchio non
 * vede l'occorrenza materializzata da un altro contesto trenta secondi fa, e
 * l'orfano che ne resta non e' riparabile da nessuna schermata. Per questo il
 * repository non decide qui: manda l'intenzione al disco
 * (`WriteBatch.recurringRuleDeletion`) e la decisione avviene dentro la
 * transazione.
 */
export function planRecurringRuleDeletion(
  rules: readonly RecurringRule[],
  expenses: readonly Expense[],
  request: RecurringRuleDeletionRequest,
): RecurringRuleDeletion {
  const target = rules.find((r) => r.id === request.id)
  if (target === undefined) return { ok: false, reason: 'unknown' }
  const generated = expenses.filter((e) => e.recurringId === request.id).length
  if (generated > 0) return { ok: false, reason: 'in-use', expenses: generated }
  return { ok: true, deleted: target }
}
