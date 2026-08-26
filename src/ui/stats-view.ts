/**
 * Tutto quello che le Statistiche decidono **prima** di disegnare: quali righe
 * esistono, quanto sono lunghe, e quali portano un confronto.
 *
 * Sta qui e non in `Stats.tsx` per la stessa ragione di `budget-view.ts`: la
 * geometria e' aritmetica, e l'aritmetica si prova senza un browser. Il
 * componente riceve frazioni gia' calcolate e le trasforma in attributi SVG,
 * senza decidere niente.
 *
 * ## Le due domande, e la terza che non e' un grafico
 *
 * - **A — "dove sono finiti i soldi?"** Ripartizione per categoria del periodo
 *   corrente, ricorrenti escluse (ADR 016).
 * - **B — "sto spendendo piu' o meno degli altri periodi?"** Una riga per
 *   periodo, con la traccia del budget **dove il confronto ha una risposta**.
 * - **C — "quanto mi costa stare qui?"** Due cifre in testa, non un grafico: e'
 *   ADR 016 §3 ("due numeri, non uno"), ed e' cio' che rende leggibili A e B —
 *   entrambi escludono le fisse, e un'esclusione taciuta e' un numero che mente
 *   per omissione.
 *
 * ## Perche' le righe sono orizzontali
 *
 * Nome a sinistra, barra al centro, importo a destra: **il grafico e' la
 * tabella**. Non esiste una seconda vista da tenere allineata — che sarebbe una
 * parafrasi del grafico, promossa a schermata — le etichette entrano sempre
 * anche a otto categorie su 375 punti, e non c'e' nessun testo ruotato.
 *
 * Ne segue che il colore non porta l'identita': la porta l'etichetta. Il colore
 * porta la **continuita' con il resto dell'app** — e' lo stesso colore del chip
 * che l'utente ha scelto e riconosce dallo Storico. E' un lavoro diverso da
 * quello che una tavolozza di grafico farebbe, e per questo importarne una
 * estranea spezzerebbe l'unica associazione gia' imparata.
 */
import { computeBudgetMetrics, periodRange } from '../core/budget'
import type { BudgetMetrics, PeriodRange } from '../core/budget'
import { addDays, isBefore } from '../core/date'
import type { IsoDate } from '../core/date'
import { monthlyFixedCosts } from '../core/recurring-plan'
import type { Budget, BudgetPeriod, Category, Expense, RecurringRule } from '../core/types'
import type { Cents } from '../core/money'
import { divideCents, sumCents } from '../core/money'

/**
 * Quanti periodi indietro guarda B.
 *
 * **Otto, ed e' una finestra dichiarata invece che una soglia scoperta.** La
 * domanda di B e' *"sto spendendo piu' o meno degli **altri** periodi"*, cioe' un
 * confronto col normale recente — e due mesi sono il normale recente. Oltre,
 * smette di essere un confronto e diventa una storia (*"com'e' andato l'anno"*),
 * che e' un'altra domanda e non ha una schermata.
 *
 * Il numero e' anche cio' che impedisce a B di cambiare forma: otto righe
 * scorrono su qualunque telefono, quindi non esiste una soglia oltre la quale
 * comprimere. La schermata cresce per scorrimento, mai per compressione.
 */
export const TREND_PERIODS = 8

/**
 * Sotto quante categorie con spesa A smette di essere un grafico.
 *
 * Tre. Due barre non sono un confronto — sono due numeri disegnati lunghi — e
 * una sola e' il bar chart a una barra, che e' l'anti-esempio da manuale. Sotto
 * la soglia le stesse righe si leggono senza barra: nome e importo.
 *
 * La soglia esiste perche' il caso vuoto e' stato disegnato per primo: partendo
 * dai dati pieni, questo stato sarebbe arrivato come un grafico degenere invece
 * che come una forma sua.
 */
export const BREAKDOWN_MIN_ROWS = 3

/** Una riga di A: una categoria del periodo corrente. */
export interface CategorySlice {
  readonly categoryId: string
  readonly name: string
  /** Il colore che l'utente ha scelto per il chip. Continuita', non identita'. */
  readonly color: string
  readonly cents: Cents
  /** Lunghezza della barra, 0..1 sulla scala condivisa della sezione. */
  readonly fraction: number
}

/**
 * La traccia del budget dietro la barra di un periodo. **Esiste solo dove il
 * confronto ha una risposta** (`BudgetMetrics.comparableToBudget`): dove non ce
 * l'ha, questo e' `null` e la barra e' nuda.
 *
 * Non esiste una traccia parziale, e la ragione e' che nessuna lunghezza sarebbe
 * onesta. Sulla settimana in cui il budget e' nato l'ultimo giorno, una traccia
 * intera legge "sei stato bravo" e una traccia da un settimo legge "disastro":
 * 136,45 su 200 non e' nessuna delle due. L'assenza si dichiara con la
 * geometria, non con una nota.
 */
export interface BudgetTrack {
  /** Lunghezza della traccia, 0..1 sulla scala condivisa. */
  readonly fraction: number
  /**
   * Quanta parte del periodo e' **accaduta**, 0..1. A periodo chiuso vale 1,
   * quindi non resta niente da disegnare come non accaduto: l'incompletezza e'
   * un dato, non un ramo.
   */
  readonly livedFraction: number
  /**
   * Il budget **maturato** ai giorni vissuti: il segno contro cui si legge se il
   * passo e' alto. Cade a `fraction * livedFraction` della scala.
   *
   * **Non e' un pro-rata** e non tocca ADR 010: non riduce il budget ne' il
   * residuo, e' un segnaposto di passo. E si calcola dal budget e dai giorni,
   * mai moltiplicando `sustainablePaceCents` — 28,57 x 7 fa 199,99, e il segno
   * cadrebbe un centesimo prima della fine della traccia, per sempre.
   */
  readonly accruedCents: Cents
}

/** Una riga di B: un periodo. */
export interface PeriodBar {
  /** `range.start`: identita' stabile, non l'indice di riga. */
  readonly key: IsoDate
  readonly range: PeriodRange
  readonly cents: Cents
  readonly fraction: number
  readonly track: BudgetTrack | null
  /** Il periodo che contiene oggi. */
  readonly current: boolean
}

/**
 * Le due cifre in testa (C). `fixedMonthlyCents` e' **al mese** mentre
 * `variableCents` e' **del periodo**: la differenza di unita' non e' una svista,
 * e' ADR 016 §3, che pareggia esplicitamente il budget del periodo con il totale
 * mensile delle fisse.
 */
export interface StatsTiles {
  readonly variableCents: Cents
  readonly fixedMonthlyCents: Cents
  /**
   * Falso quando non c'e' nessuna spesa fissa. La cifra non si mostra a zero,
   * per la stessa ragione per cui `hero.fixed` tace: annunciare un'esclusione
   * dove non c'e' niente da escludere insegna a non leggere l'annuncio.
   */
  readonly hasFixed: boolean
}

export interface Breakdown {
  /**
   * Sotto `BREAKDOWN_MIN_ROWS` le righe restano e le barre no. Il campo sta qui
   * e non nel componente perche' la soglia e' una decisione, e una decisione
   * scritta dentro un `&&` in JSX non si trova piu'.
   */
  readonly asChart: boolean
  readonly rows: readonly CategorySlice[]
}

export interface Trend {
  readonly asChart: boolean
  readonly rows: readonly PeriodBar[]
}

export type StatsView =
  | {
      /** Nessuna spesa viva, mai. Non "poche": nessuna. */
      readonly kind: 'blank'
    }
  | {
      readonly kind: 'ready'
      readonly period: BudgetPeriod
      readonly current: BudgetMetrics
      readonly tiles: StatsTiles
      readonly byCategory: Breakdown
      readonly byPeriod: Trend
    }

export interface StatsInput {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly rules: readonly RecurringRule[]
  readonly budgets: readonly Budget[]
  readonly period: BudgetPeriod
  readonly day: IsoDate
}

/** Vive = non cancellate. Le lapidi non sono spese, e nessun grafico le conta. */
function alive(expenses: readonly Expense[]): readonly Expense[] {
  return expenses.filter((expense) => expense.deletedAt === undefined)
}

/**
 * Gli `TREND_PERIODS` periodi che finiscono con quello di oggi, dal piu' vecchio
 * al piu' recente.
 *
 * Si cammina all'indietro da `range.start - 1`, che appartiene per costruzione al
 * periodo precedente — vale per la settimana come per il mese, e per i mesi di
 * lunghezza diversa, perche' e' `periodRange` a decidere i confini e non
 * un'aritmetica sui giorni.
 */
export function trendRanges(period: BudgetPeriod, day: IsoDate): readonly PeriodRange[] {
  const ranges: PeriodRange[] = []
  let cursor = day
  for (let i = 0; i < TREND_PERIODS; i += 1) {
    const range = periodRange(period, cursor)
    ranges.unshift(range)
    cursor = addDays(range.start, -1)
  }
  return ranges
}

/** Frazione di `value` su `scale`, con `scale === 0` che non divide per zero. */
function share(value: Cents, scale: Cents): number {
  return scale <= 0 ? 0 : value / scale
}

export function statsView(input: StatsInput): StatsView {
  const expenses = alive(input.expenses)
  if (expenses.length === 0) return { kind: 'blank' }

  const metricsOf = (onDate: IsoDate): BudgetMetrics =>
    computeBudgetMetrics({
      expenses,
      budgets: input.budgets,
      period: input.period,
      onDate,
      today: input.day,
    })

  const current = metricsOf(input.day)

  const fixed = monthlyFixedCosts(input.rules, input.day)
  const tiles: StatsTiles = {
    variableCents: current.spentCents,
    fixedMonthlyCents: fixed.totalCents,
    hasFixed: fixed.totalCents > 0,
  }

  /* --- A: le categorie del periodo corrente ------------------------------- */

  // Le stesse spese che il budget conta: vive e non ricorrenti (ADR 016). Il
  // filtro non e' riscritto qui — e' `budgetSpent` a definirlo — ma la finestra
  // e' la stessa, quindi la somma di queste righe e' `current.spentCents`. Un
  // test lo asserisce come identita'.
  const inPeriod = expenses.filter(
    (e) =>
      e.source !== 'recurring' &&
      !isBefore(e.date, current.range.start) &&
      !isBefore(current.range.end, e.date),
  )

  const byCategoryCents = new Map<string, Cents>()
  for (const expense of inPeriod) {
    byCategoryCents.set(
      expense.categoryId,
      (byCategoryCents.get(expense.categoryId) ?? 0) + expense.amountCents,
    )
  }

  const named = new Map(input.categories.map((c) => [c.id, c]))
  const slices: CategorySlice[] = []
  for (const [categoryId, cents] of byCategoryCents) {
    const category = named.get(categoryId)
    // Una spesa orfana non ha un nome ne' un colore da mostrare. `parseBackup`
    // le importa di proposito, quindi lo stato esiste; la riga si salta invece
    // di inventare un'etichetta.
    if (category === undefined) continue
    slices.push({ categoryId, name: category.name, color: category.color, cents, fraction: 0 })
  }
  // Dalla piu' grande: la domanda e' "dove sono finiti i soldi", e la risposta si
  // legge dall'alto. **Non** per ordine di griglia, che serve al pollice in cassa.
  slices.sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name))

  const sliceScale = slices.reduce((max, s) => Math.max(max, s.cents), 0)
  const byCategory: Breakdown = {
    asChart: slices.length >= BREAKDOWN_MIN_ROWS,
    rows: slices.map((s) => ({ ...s, fraction: share(s.cents, sliceScale) })),
  }

  /* --- B: i periodi ------------------------------------------------------- */

  const ranges = trendRanges(input.period, input.day)
  const perPeriod = ranges.map((range) => {
    const m = metricsOf(range.start)
    return { range, m }
  })

  // **Una scala sola per tutte le righe**, cosi' le lunghezze restano
  // confrontabili anche dove la traccia manca. Comprende i budget delle righe
  // confrontabili: altrimenti una barra sotto budget potrebbe risultare piu'
  // lunga della traccia che dovrebbe contenerla.
  const trendScale = perPeriod.reduce(
    (max, { m }) => Math.max(max, m.spentCents, m.comparableToBudget ? (m.budgetCents ?? 0) : 0),
    0,
  )

  const bars: PeriodBar[] = perPeriod.map(({ range, m }) => ({
    key: range.start,
    range,
    cents: m.spentCents,
    fraction: share(m.spentCents, trendScale),
    current: range.start === current.range.start,
    track:
      m.comparableToBudget && m.budgetCents !== null
        ? {
            fraction: share(m.budgetCents, trendScale),
            livedFraction: m.daysLived / m.daysTotal,
            accruedCents: divideCents(m.budgetCents * m.daysLived, m.daysTotal),
          }
        : null,
  }))

  // Le righe vuote in coda non si mostrano: un periodo prima della prima spesa
  // non e' "zero speso", e' un periodo in cui l'app non c'era. Si taglia dalla
  // testa e non dal fondo, perche' il periodo corrente e' sempre l'ultimo.
  const firstSpent = bars.findIndex((bar) => bar.cents > 0)
  const shown = firstSpent === -1 ? bars.slice(-1) : bars.slice(firstSpent)

  return {
    kind: 'ready',
    period: input.period,
    current,
    tiles,
    byCategory,
    byPeriod: { asChart: shown.length >= 2, rows: shown },
  }
}

/**
 * La somma delle righe di A. Esiste per il test di identita' con la Home: le due
 * schermate mostrano la stessa quantita', e devono mostrarla **al centesimo**.
 */
export function breakdownTotal(breakdown: Breakdown): Cents {
  return sumCents(breakdown.rows.map((row) => row.cents))
}
