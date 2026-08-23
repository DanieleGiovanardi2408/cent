/**
 * Le etichette che l'utente legge. Tutte in it-IT, tutte da `Intl`.
 *
 * I formatter si costruiscono una volta sola: `Intl.DateTimeFormat` costa
 * qualche millisecondo a istanziarlo e nello Storico verrebbe istanziato una
 * volta per giorno visibile.
 */

import { addDays, fromIsoDate, toDateParts } from '../core/date'
import type { IsoDate } from '../core/date'
import type { PeriodRange } from '../core/budget'
import type { BudgetPeriod } from '../core/types'

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

const monthLong = new Intl.DateTimeFormat('it-IT', { month: 'long' })

/**
 * Il periodo della Home in due parole: "Questa settimana", "Questo mese".
 *
 * Non "Settimana corrente": la Home si legge in piedi, e "questa" e' la parola
 * che si usa parlando.
 */
export function periodName(period: BudgetPeriod): string {
  return period === 'weekly' ? 'Questa settimana' : 'Questo mese'
}

/**
 * L'estensione del periodo: `18–24 ago` per la settimana, `agosto` per il mese.
 *
 * `formatRange` fonde le parti uguali (`18–24 ago` invece di `18 ago – 24 ago`)
 * e a cavallo di due mesi le riapre da solo (`31 ago – 6 set`). E' la stessa
 * differenza che farebbe una persona scrivendolo a mano.
 */
export function periodRangeLabel(period: BudgetPeriod, range: PeriodRange): string {
  if (period === 'monthly') return monthLong.format(fromIsoDate(range.start))
  return dayShort.formatRange(fromIsoDate(range.start), fromIsoDate(range.end))
}

const weekdayLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long' })
const dayAndMonth = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' })

/**
 * "da mercoledì" dentro una settimana, "dal 19 agosto" dentro un mese.
 *
 * Il giorno della settimana basta solo se il periodo e' la settimana: in un mese
 * ci sono quattro mercoledi' e "da mercoledì" non direbbe quale. La preposizione
 * viene da qui e non da chi compone la frase, perche' cambia con la forma
 * ("da mercoledì" ma "dal 19 agosto") e sarebbe l'errore piu' facile da fare.
 */
export function fromDayLabel(period: BudgetPeriod, date: IsoDate): string {
  const at = fromIsoDate(date)
  return period === 'weekly' ? `da ${weekdayLong.format(at)}` : `dal ${dayAndMonth.format(at)}`
}

/** `1 giorno` / `5 giorni`. Il singolare esiste ed e' il giorno che conta di piu'. */
export function daysLabel(days: number): string {
  return days === 1 ? '1 giorno' : `${days} giorni`
}
