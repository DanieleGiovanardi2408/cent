/**
 * Aggregazioni di lettura: Storico e Statistiche.
 *
 * Funzioni pure su array gia' in memoria. Non toccano il database e non sanno
 * che esista: il chiamante passa `state.expenses` del mirror.
 *
 * Una regola sola, ma vale per tutte: **una spesa con `deletedAt` non entra in
 * nessun totale**. E' l'unico punto in cui il soft delete potrebbe sfuggire, ed
 * e' per questo che `isLive` esiste come funzione e non come condizione copiata.
 */

import { addDays, compareIsoDates, endOfWeek, isAfter, isBefore, startOfWeek } from './date'
import type { IsoDate } from './date'
import { sumCents } from './money'
import type { Cents } from './money'
import type { PeriodRange } from './budget'
import type { Expense } from './types'

/** Una spesa conta solo se non e' stata cancellata. */
export function isLive(expense: Expense): boolean {
  return expense.deletedAt === undefined
}

/**
 * Le spese vive di un intervallo, dalla piu' recente alla piu' vecchia.
 * A parita' di giorno vince l'inserita per ultima: e' l'ordine in cui l'utente
 * si aspetta di rivedere quello che ha appena scritto.
 */
export function expensesInRange(
  expenses: readonly Expense[],
  range: PeriodRange,
): readonly Expense[] {
  return expenses
    .filter(
      (e) => isLive(e) && !isBefore(e.date, range.start) && !isAfter(e.date, range.end),
    )
    .sort(
      (a, b) => compareIsoDates(b.date, a.date) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    )
}

export interface DayGroup {
  readonly date: IsoDate
  readonly totalCents: Cents
  readonly expenses: readonly Expense[]
}

/**
 * Raggruppa per giorno, dal piu' recente. E' la forma esatta che serve allo
 * Storico: intestazione con la data, totale del giorno, righe sotto.
 *
 * Ordina una volta sola e poi scorre: su 5.000 spese e' un sort e una passata.
 */
export function groupByDay(expenses: readonly Expense[]): readonly DayGroup[] {
  const live = expenses.filter(isLive).sort(
    (a, b) => compareIsoDates(b.date, a.date) || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
  )
  const groups: DayGroup[] = []
  let currentDate: IsoDate | null = null
  let bucket: Expense[] = []
  const flush = (): void => {
    if (currentDate === null) return
    groups.push({
      date: currentDate,
      totalCents: sumCents(bucket.map((e) => e.amountCents)),
      expenses: bucket,
    })
  }
  for (const expense of live) {
    if (expense.date !== currentDate) {
      flush()
      currentDate = expense.date
      bucket = []
    }
    bucket.push(expense)
  }
  flush()
  return groups
}

export interface CategoryTotal {
  readonly categoryId: string
  readonly totalCents: Cents
  readonly count: number
  /**
   * Quota sul totale in punti base (10000 = 100%). Intero, come tutto il resto:
   * serve alla UI per la lunghezza degli archi, non e' denaro e non va formattato
   * come tale. La somma delle quote puo' non fare esattamente 10000 per via
   * dell'arrotondamento, ed e' irrilevante su un grafico.
   */
  readonly shareBasisPoints: number
}

/**
 * Ripartizione per categoria di un intervallo, dalla piu' pesante alla piu'
 * leggera. Le categorie senza spese non compaiono: uno spicchio da zero non
 * dice niente e allunga la legenda.
 *
 * Se il totale e' negativo o nullo le quote sono 0: dividere per zero o
 * ottenere percentuali negative su un grafico a torta non ha significato.
 */
export function spentByCategory(
  expenses: readonly Expense[],
  range: PeriodRange,
): readonly CategoryTotal[] {
  const totals = new Map<string, { total: Cents; count: number }>()
  let grandTotal = 0
  for (const expense of expenses) {
    if (!isLive(expense)) continue
    if (isBefore(expense.date, range.start) || isAfter(expense.date, range.end)) continue
    const entry = totals.get(expense.categoryId) ?? { total: 0, count: 0 }
    entry.total += expense.amountCents
    entry.count += 1
    totals.set(expense.categoryId, entry)
    grandTotal += expense.amountCents
  }
  return [...totals.entries()]
    .map(([categoryId, entry]) => ({
      categoryId,
      totalCents: entry.total,
      count: entry.count,
      shareBasisPoints: grandTotal > 0 ? Math.round((entry.total * 10000) / grandTotal) : 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents || (a.categoryId < b.categoryId ? -1 : 1))
}

export interface WeekTotal {
  /** Lunedi' della settimana. */
  readonly weekStart: IsoDate
  /** Domenica della settimana. */
  readonly weekEnd: IsoDate
  readonly totalCents: Cents
}

/**
 * Totali delle ultime `weeks` settimane, la piu' vecchia per prima: e' l'ordine
 * in cui il grafico le disegna da sinistra a destra.
 *
 * L'ultima settimana e' quella che contiene `endDate` (di norma oggi) ed e'
 * quindi in corso e piu' bassa delle altre: e' voluto, mostrare solo settimane
 * chiuse significherebbe non vedere mai quella che si sta vivendo. Le settimane
 * senza spese ci sono, con totale zero: un buco nel grafico e' un'informazione.
 */
export function lastWeeksTotals(
  expenses: readonly Expense[],
  endDate: IsoDate,
  weeks = 8,
): readonly WeekTotal[] {
  if (!Number.isInteger(weeks) || weeks < 1) {
    throw new RangeError(`Numero di settimane non valido: ${weeks}`)
  }
  const lastStart = startOfWeek(endDate)
  const firstStart = addDays(lastStart, -7 * (weeks - 1))

  const byWeek = new Map<IsoDate, Cents>()
  for (let i = 0; i < weeks; i += 1) byWeek.set(addDays(firstStart, i * 7), 0)

  for (const expense of expenses) {
    if (!isLive(expense)) continue
    if (isBefore(expense.date, firstStart) || isAfter(expense.date, endOfWeek(lastStart))) continue
    const key = startOfWeek(expense.date)
    byWeek.set(key, (byWeek.get(key) ?? 0) + expense.amountCents)
  }

  return [...byWeek.entries()].map(([weekStart, totalCents]) => ({
    weekStart,
    weekEnd: endOfWeek(weekStart),
    totalCents,
  }))
}
