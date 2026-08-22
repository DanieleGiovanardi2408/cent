/**
 * Le etichette che l'utente legge. Tutte in it-IT, tutte da `Intl`.
 *
 * I formatter si costruiscono una volta sola: `Intl.DateTimeFormat` costa
 * qualche millisecondo a istanziarlo e nello Storico verrebbe istanziato una
 * volta per giorno visibile.
 */

import { addDays, fromIsoDate, toDateParts } from '../core/date'
import type { IsoDate } from '../core/date'

const dayLong = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const dayWithYear = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const dayShort = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' })

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * L'intestazione di un giorno nello Storico. "Oggi" e "Ieri" per esteso: sono
 * le due righe che si leggono ogni giorno, e una data numerica costringerebbe a
 * fare il conto ogni volta.
 */
export function dayHeading(date: IsoDate, todayIso: IsoDate): string {
  if (date === todayIso) return 'Oggi'
  if (date === addDays(todayIso, -1)) return 'Ieri'
  const sameYear = toDateParts(date).year === toDateParts(todayIso).year
  const formatter = sameYear ? dayLong : dayWithYear
  return capitalize(formatter.format(fromIsoDate(date)))
}

/** Forma corta per il chip della data: `18 ago`. */
export function dayChipLabel(date: IsoDate): string {
  return dayShort.format(fromIsoDate(date))
}
