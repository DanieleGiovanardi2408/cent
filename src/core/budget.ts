/**
 * Budget storicizzati e metriche del periodo.
 *
 * ## Perche' i budget non si modificano
 *
 * Un budget non e' un'impostazione, e' un fatto datato: "da meta' luglio in poi
 * la soglia era 800". Se cambiare il numero riscrivesse il record, luglio
 * cambierebbe risposta a posteriori e lo storico direbbe una cosa diversa ogni
 * volta che lo si guarda. Quindi un record non si tocca mai: si **chiude** con
 * `effectiveTo` e se ne apre uno nuovo (`planBudgetChange`).
 *
 * ## Quale record vale per un periodo
 *
 * Il budget di un periodo e' quello in vigore il giorno `min(oggi, ultimo giorno
 * del periodo)`.
 *
 * - Per un periodo passato e' l'ultimo giorno del periodo: il budget con cui quel
 *   mese e' stato vissuto. Un cambio fatto oggi ha `effectiveFrom` di oggi, non
 *   copre quel giorno, e non lo tocca. E' l'invariante che il test protegge.
 * - Per il periodo corrente e' oggi: alzare il budget stamattina si vede subito
 *   sulla Home. L'alternativa (il budget del primo giorno del periodo) renderebbe
 *   ogni modifica invisibile fino al periodo successivo, che e' un bug travestito
 *   da coerenza.
 */

import { addDays, daysBetween, endOfMonth, endOfWeek, isAfter, isBefore, startOfMonth, startOfWeek } from './date'
import type { IsoDate } from './date'
import { divideCents, sumCents } from './money'
import type { Cents } from './money'
import type { Budget, BudgetPeriod, Expense, Timestamp } from './types'
import { newId as defaultNewId, nowTimestamp } from './types'

export interface PeriodRange {
  readonly start: IsoDate
  readonly end: IsoDate
}

/** Il periodo (settimana con lunedi', o mese) che contiene `onDate`. */
export function periodRange(period: BudgetPeriod, onDate: IsoDate): PeriodRange {
  return period === 'weekly'
    ? { start: startOfWeek(onDate), end: endOfWeek(onDate) }
    : { start: startOfMonth(onDate), end: endOfMonth(onDate) }
}

function coversDay(budget: Budget, day: IsoDate): boolean {
  if (isBefore(day, budget.effectiveFrom)) return false
  return budget.effectiveTo === undefined || !isAfter(day, budget.effectiveTo)
}

/**
 * Il record di budget in vigore il giorno `onDay`, o `null` se non ce n'e'.
 *
 * `categoryId` assente = budget complessivo. Se piu' record si sovrappongono
 * (import fatto male, orologio spostato) vince quello con `effectiveFrom` piu'
 * recente, a parita' il creato per ultimo: la sovrapposizione e' un dato sporco,
 * non una condizione da segnalare all'utente mentre guarda quanto puo' spendere.
 */
export function resolveBudget(
  budgets: readonly Budget[],
  period: BudgetPeriod,
  onDay: IsoDate,
  categoryId?: string,
): Budget | null {
  let best: Budget | null = null
  for (const budget of budgets) {
    if (budget.period !== period) continue
    if (budget.categoryId !== categoryId) continue
    if (!coversDay(budget, onDay)) continue
    if (
      best === null ||
      isAfter(budget.effectiveFrom, best.effectiveFrom) ||
      (budget.effectiveFrom === best.effectiveFrom && budget.createdAt > best.createdAt)
    ) {
      best = budget
    }
  }
  return best
}

export interface BudgetMetrics {
  readonly period: BudgetPeriod
  readonly range: PeriodRange
  /** `null` = nessun budget definito per questo periodo. */
  readonly budgetCents: Cents | null
  readonly spentCents: Cents
  /** Budget meno speso. Negativo se si e' sforato. `null` senza budget. */
  readonly remainingCents: Cents | null
  readonly daysTotal: number
  /** Giorni gia' passati, oggi escluso. Da mostrare, non da usare come divisore. */
  readonly daysElapsed: number
  /** Giorni che restano, **oggi incluso**. 0 se il periodo e' finito. */
  readonly daysRemaining: number
  /** Rimanente diviso i giorni che restano. `null` a periodo finito o senza budget. */
  readonly dailyAllowanceCents: Cents | null
  /**
   * Media spesa al giorno **sui giorni vissuti, oggi compreso**.
   *
   * Il divisore e' `daysElapsed + 1`, non `daysElapsed`: `spentCents` somma
   * tutto il periodo fino a oggi incluso, quindi dividere per i giorni finiti
   * sarebbe n/(n-1) — il secondo giorno del periodo raddoppierebbe il passo, e
   * sempre in eccesso, proprio nei giorni in cui c'e' ancora tempo per
   * correggere. Su un periodo passato il divisore vale `daysTotal`.
   *
   * `null` il primo giorno e prima che il periodo cominci: una media su un
   * giorno appena iniziato non e' un passo, e' l'ultima spesa.
   */
  readonly currentPaceCents: Cents | null
  /** Budget diviso i giorni totali: il passo che si potrebbe tenere. */
  readonly sustainablePaceCents: Cents | null
  readonly overBudget: boolean
}

export interface BudgetMetricsInput {
  readonly expenses: readonly Expense[]
  readonly budgets: readonly Budget[]
  readonly period: BudgetPeriod
  /** Un giorno qualsiasi del periodo da calcolare. */
  readonly onDate: IsoDate
  /** Oggi: decide giorni rimanenti e budget vigente. */
  readonly today: IsoDate
  /** Presente = metriche di una singola categoria. */
  readonly categoryId?: string
}

/** Somma delle spese vive in `[start, end]`, eventualmente di una sola categoria. */
export function totalSpent(
  expenses: readonly Expense[],
  range: PeriodRange,
  categoryId?: string,
): Cents {
  const values: Cents[] = []
  for (const expense of expenses) {
    if (expense.deletedAt !== undefined) continue
    if (isBefore(expense.date, range.start) || isAfter(expense.date, range.end)) continue
    if (categoryId !== undefined && expense.categoryId !== categoryId) continue
    values.push(expense.amountCents)
  }
  return sumCents(values)
}

export function computeBudgetMetrics(input: BudgetMetricsInput): BudgetMetrics {
  const range = periodRange(input.period, input.onDate)
  const referenceDay = isBefore(input.today, range.start)
    ? range.start
    : isAfter(input.today, range.end)
      ? range.end
      : input.today

  const budget = resolveBudget(input.budgets, input.period, referenceDay, input.categoryId)
  const budgetCents = budget?.amountCents ?? null
  const spentCents = totalSpent(input.expenses, range, input.categoryId)

  const daysTotal = daysBetween(range.start, range.end) + 1
  const daysRemaining = isAfter(input.today, range.end)
    ? 0
    : isBefore(input.today, range.start)
      ? daysTotal
      : daysBetween(input.today, range.end) + 1
  const daysElapsed = daysTotal - daysRemaining
  // I giorni davvero vissuti del periodo, oggi compreso: e' il divisore del
  // passo attuale, perche' e' l'arco su cui `spentCents` e' stato speso.
  const daysLived = daysBetween(range.start, referenceDay) + 1

  const remainingCents = budgetCents === null ? null : budgetCents - spentCents

  return {
    period: input.period,
    range,
    budgetCents,
    spentCents,
    remainingCents,
    daysTotal,
    daysElapsed,
    daysRemaining,
    dailyAllowanceCents:
      remainingCents === null || daysRemaining === 0 ? null : divideCents(remainingCents, daysRemaining),
    currentPaceCents: daysElapsed === 0 ? null : divideCents(spentCents, daysLived),
    sustainablePaceCents: budgetCents === null ? null : divideCents(budgetCents, daysTotal),
    overBudget: budgetCents !== null && spentCents > budgetCents,
  }
}

export interface BudgetChange {
  readonly period: BudgetPeriod
  readonly amountCents: Cents
  readonly categoryId?: string
  /** Da quando vale il nuovo importo. Di norma oggi. */
  readonly effectiveFrom: IsoDate
  readonly now?: () => Timestamp
  readonly newId?: () => string
}

/**
 * I record da scrivere per cambiare un budget senza riscrivere il passato.
 *
 * Restituisce sempre l'insieme completo dei record modificati o creati: chiude
 * quello aperto al giorno prima di `effectiveFrom` e ne apre uno nuovo.
 *
 * Unica eccezione: se esiste gia' un record con lo stesso `effectiveFrom` (si e'
 * cambiato idea due volte nello stesso giorno) quello viene aggiornato sul posto.
 * Chiuderlo produrrebbe un record di durata negativa, cioe' spazzatura che non
 * vale per nessun giorno.
 */
export function planBudgetChange(
  budgets: readonly Budget[],
  change: BudgetChange,
): readonly Budget[] {
  const clock = change.now ?? nowTimestamp
  const makeId = change.newId ?? defaultNewId
  const timestamp = clock()
  const sameKey = budgets.filter(
    (b) => b.period === change.period && b.categoryId === change.categoryId,
  )

  const sameDay = sameKey.find((b) => b.effectiveFrom === change.effectiveFrom)
  if (sameDay) {
    return [{ ...sameDay, amountCents: change.amountCents, updatedAt: timestamp }]
  }

  const previousDay = addDays(change.effectiveFrom, -1)
  const toClose = sameKey.filter((b) => coversDay(b, previousDay) && b.effectiveTo === undefined)
  const closed = toClose.map<Budget>((b) => ({ ...b, effectiveTo: previousDay, updatedAt: timestamp }))

  const created: Budget = {
    id: makeId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    period: change.period,
    amountCents: change.amountCents,
    effectiveFrom: change.effectiveFrom,
    ...(change.categoryId !== undefined ? { categoryId: change.categoryId } : {}),
  }
  return [...closed, created]
}
