/**
 * Date civili come stringhe `YYYY-MM-DD`.
 *
 * L'aritmetica e' fatta su interi (giorni dall'epoca civile, algoritmo di
 * Howard Hinnant): nessun `Date` e nessun millisecondo entrano nei calcoli,
 * quindi ora legale e fuso orario non possono influenzarli. `Date` compare solo
 * ai bordi, per leggere "oggi" dall'orologio locale.
 */

/** Data civile locale nel formato `YYYY-MM-DD`. */
export type IsoDate = string

export interface DateParts {
  readonly year: number
  readonly month: number // 1-12
  readonly day: number // 1-31
}

// Anni a 4 cifre, 0000-9999: piu' che sufficiente, e rende lo slicing banale.
const ISO_SHAPE = /^\d{4}-\d{2}-\d{2}$/

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Numero di giorni del mese (month 1-12). */
export function daysInMonth(year: number, month: number): number {
  assertMonth(month)
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    default:
      return 31
  }
}

function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Mese non valido: ${month}`)
  }
}

function assertYear(year: number): void {
  if (!Number.isInteger(year) || year < 0 || year > 9999) {
    throw new RangeError(`Anno non valido: ${year}`)
  }
}

/** Costruisce una IsoDate da anno/mese/giorno gia' validi. */
function formatParts(year: number, month: number, day: number): IsoDate {
  if (year < 0 || year > 9999) throw new RangeError(`Anno fuori intervallo: ${year}`)
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`
}

/** `true` solo se la stringa e' una data civile realmente esistente. */
export function isIsoDate(value: string): boolean {
  if (!ISO_SHAPE.test(value)) return false
  const month = Number(value.slice(5, 7))
  if (month < 1 || month > 12) return false
  const year = Number(value.slice(0, 4))
  const day = Number(value.slice(8, 10))
  return day >= 1 && day <= daysInMonth(year, month)
}

/** Scompone una IsoDate. Lancia se la data non esiste. */
export function toDateParts(iso: IsoDate): DateParts {
  if (!isIsoDate(iso)) throw new RangeError(`Data non valida: "${iso}"`)
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
  }
}

/** Giorni dall'epoca civile (1970-01-01 = 0). Solo aritmetica intera. */
function epochDayFromParts(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

function partsFromEpochDay(epochDay: number): DateParts {
  const z = epochDay + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  )
  const y = yoe + era * 400
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp + (mp < 10 ? 3 : -9)
  return { year: month <= 2 ? y + 1 : y, month, day }
}

/** Giorni dall'epoca civile per una IsoDate. */
export function toEpochDay(iso: IsoDate): number {
  const { year, month, day } = toDateParts(iso)
  return epochDayFromParts(year, month, day)
}

export function fromEpochDay(epochDay: number): IsoDate {
  if (!Number.isInteger(epochDay)) throw new RangeError(`Giorno non intero: ${epochDay}`)
  const { year, month, day } = partsFromEpochDay(epochDay)
  return formatParts(year, month, day)
}

/** Da `Date` a data civile, leggendo i componenti LOCALI (mai UTC). */
export function toIsoDate(date: Date): IsoDate {
  if (Number.isNaN(date.getTime())) throw new RangeError('Date non valida')
  return formatParts(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

/**
 * Da data civile a `Date`, alla mezzanotte LOCALE.
 * Da usare solo per formattazione/UI: i calcoli restano sulle stringhe.
 */
export function fromIsoDate(iso: IsoDate): Date {
  const { year, month, day } = toDateParts(iso)
  const date = new Date(year, month - 1, day)
  // Anni 0-99: il costruttore li mapperebbe su 1900+anno.
  if (year >= 0 && year <= 99) date.setFullYear(year)
  return date
}

/** La data di oggi secondo l'orologio locale. */
export function today(now: Date = new Date()): IsoDate {
  return toIsoDate(now)
}

/** Somma (o sottrae) giorni di calendario. Immune ai cambi di ora legale. */
export function addDays(iso: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new RangeError(`Giorni non intero: ${days}`)
  return fromEpochDay(toEpochDay(iso) + days)
}

/** Differenza in giorni: `to - from`. Positivo se `to` viene dopo. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return toEpochDay(to) - toEpochDay(from)
}

/**
 * -1, 0, 1. Confronto lessicografico diretto: nel formato `YYYY-MM-DD` i campi
 * sono a larghezza fissa e in ordine di significativita' decrescente, quindi
 * l'ordine delle stringhe *e'* gia' quello cronologico. Convertire in epoch day
 * darebbe la stessa risposta pagando regex, tre `Number(slice)` e `daysInMonth`
 * per ogni confronto: ~16x piu' lento nell'ordinamento di una lista lunga.
 *
 * NON valida, di proposito, e non lancia mai: e' una funzione totale su qualsiasi
 * coppia di stringhe. Un comparatore che lancia rende inutilizzabile l'intera
 * vista che lo usa — basta un record corrotto (import storto, migrazione andata
 * male) per far esplodere il sort di 5.000 spese invece di lasciare il record
 * rotto in fondo all'elenco. La validazione sta ai bordi, dove i dati entrano:
 * `isIsoDate` / `toDateParts` nel parse, nell'import e nei costruttori di dominio.
 * Se stai pensando di "sistemare" questa funzione aggiungendoci un controllo,
 * il controllo va messo a monte, non qui.
 */
export function compareIsoDates(a: IsoDate, b: IsoDate): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Passano da `compareIsoDates`: stessa velocita', stessa totalita'. */
export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return compareIsoDates(a, b) === -1
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return compareIsoDates(a, b) === 1
}

/** Giorno della settimana ISO: 1 = lunedi', ..., 7 = domenica. */
export function dayOfWeek(iso: IsoDate): number {
  const epochDay = toEpochDay(iso)
  // 1970-01-01 era giovedi' (=4).
  return ((((epochDay + 3) % 7) + 7) % 7) + 1
}

/** Lunedi' della settimana che contiene `iso`. */
export function startOfWeek(iso: IsoDate): IsoDate {
  return addDays(iso, -(dayOfWeek(iso) - 1))
}

/** Domenica della settimana che contiene `iso`. */
export function endOfWeek(iso: IsoDate): IsoDate {
  return addDays(startOfWeek(iso), 6)
}

export function startOfMonth(iso: IsoDate): IsoDate {
  const { year, month } = toDateParts(iso)
  return formatParts(year, month, 1)
}

export function endOfMonth(iso: IsoDate): IsoDate {
  const { year, month } = toDateParts(iso)
  return formatParts(year, month, daysInMonth(year, month))
}

/**
 * Data del mese con il giorno "tagliato" all'ultimo disponibile.
 * `clampDayOfMonth(2025, 2, 31)` -> `2025-02-28`: mai sconfinamento al mese
 * successivo (e' la regola delle ricorrenze mensili con anchorDay 29/30/31).
 */
export function clampDayOfMonth(year: number, month: number, day: number): IsoDate {
  assertYear(year)
  assertMonth(month)
  if (!Number.isInteger(day) || day < 1) throw new RangeError(`Giorno non valido: ${day}`)
  return formatParts(year, month, Math.min(day, daysInMonth(year, month)))
}
