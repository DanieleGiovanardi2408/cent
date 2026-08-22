import { describe, expect, it } from 'vitest'
import {
  addDays,
  clampDayOfMonth,
  compareIsoDates,
  dayOfWeek,
  daysBetween,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  fromEpochDay,
  fromIsoDate,
  isAfter,
  isBefore,
  isIsoDate,
  isLeapYear,
  startOfMonth,
  startOfWeek,
  toDateParts,
  toEpochDay,
  toIsoDate,
  today,
  type IsoDate,
} from './date'

describe('conversioni Date <-> YYYY-MM-DD', () => {
  it('legge i componenti locali, non quelli UTC', () => {
    const mezzanotteLocale = new Date(2025, 0, 1, 0, 30, 0)
    expect(toIsoDate(mezzanotteLocale)).toBe('2025-01-01')
    if (mezzanotteLocale.getTimezoneOffset() < 0) {
      // A est di Greenwich l'istante UTC cade il giorno prima: e' esattamente
      // il bug che questo modulo esiste per evitare.
      expect(mezzanotteLocale.toISOString().slice(0, 10)).toBe('2024-12-31')
    }
  })

  it('non slitta di un giorno a fine giornata', () => {
    expect(toIsoDate(new Date(2025, 11, 31, 23, 59, 59))).toBe('2025-12-31')
  })

  it('fromIsoDate torna alla mezzanotte locale e fa round-trip', () => {
    const d = fromIsoDate('2025-08-24')
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(24)
    for (const iso of ['2024-02-29', '2025-03-30', '2025-10-26', '2026-01-01', '1999-12-31']) {
      expect(toIsoDate(fromIsoDate(iso))).toBe(iso)
    }
  })

  it('today() usa l orologio locale e accetta un istante iniettato', () => {
    expect(today(new Date(2026, 7, 22, 23, 45))).toBe('2026-08-22')
    expect(isIsoDate(today())).toBe(true)
  })

  it('rifiuta le date inesistenti', () => {
    expect(isIsoDate('2025-02-29')).toBe(false)
    expect(isIsoDate('2024-02-29')).toBe(true)
    expect(isIsoDate('2025-02-30')).toBe(false)
    expect(isIsoDate('2025-13-01')).toBe(false)
    expect(isIsoDate('2025-00-10')).toBe(false)
    expect(isIsoDate('2025-04-31')).toBe(false)
    expect(isIsoDate('2025-4-01')).toBe(false)
    expect(isIsoDate('20250401')).toBe(false)
    expect(isIsoDate('2025-04-01T00:00:00Z')).toBe(false)
    expect(() => toDateParts('2025-02-30')).toThrow(RangeError)
  })

  it('scompone in anno/mese/giorno', () => {
    expect(toDateParts('2025-08-24')).toEqual({ year: 2025, month: 8, day: 24 })
  })
})

describe('startOfWeek (settimana che inizia lunedi)', () => {
  it('su una domenica torna al lunedi PRECEDENTE', () => {
    expect(dayOfWeek('2025-08-24')).toBe(7)
    expect(startOfWeek('2025-08-24')).toBe('2025-08-18')
  })

  it('su un lunedi e identita', () => {
    expect(dayOfWeek('2025-08-18')).toBe(1)
    expect(startOfWeek('2025-08-18')).toBe('2025-08-18')
  })

  it('attraversa il confine di mese', () => {
    // Domenica 2 marzo 2025 -> lunedi 24 febbraio 2025.
    expect(dayOfWeek('2025-03-02')).toBe(7)
    expect(startOfWeek('2025-03-02')).toBe('2025-02-24')
  })

  it('attraversa il confine di anno', () => {
    // Giovedi 1 gennaio 2026 -> lunedi 29 dicembre 2025.
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29')
    // Venerdi 1 gennaio 2027 -> lunedi 28 dicembre 2026.
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28')
  })

  it('tutti i giorni della stessa settimana condividono lo stesso lunedi', () => {
    const lunedi = '2025-08-18'
    for (let i = 0; i < 7; i += 1) {
      const giorno = addDays(lunedi, i)
      expect(startOfWeek(giorno)).toBe(lunedi)
      expect(dayOfWeek(giorno)).toBe(i + 1)
    }
    expect(startOfWeek(addDays(lunedi, 7))).toBe('2025-08-25')
  })

  it('endOfWeek e la domenica, 6 giorni dopo, anche nella settimana del cambio ora', () => {
    expect(endOfWeek('2025-08-18')).toBe('2025-08-24')
    expect(endOfWeek('2025-08-24')).toBe('2025-08-24')
    // Settimana del ritorno all ora solare (26 ottobre 2025).
    expect(startOfWeek('2025-10-26')).toBe('2025-10-20')
    expect(endOfWeek('2025-10-20')).toBe('2025-10-26')
    expect(daysBetween(startOfWeek('2025-10-26'), endOfWeek('2025-10-26'))).toBe(6)
    // Settimana del passaggio all ora legale (29 marzo 2026).
    expect(startOfWeek('2026-03-29')).toBe('2026-03-23')
    expect(daysBetween(startOfWeek('2026-03-29'), endOfWeek('2026-03-29'))).toBe(6)
  })

  it('dayOfWeek su riferimenti noti', () => {
    expect(dayOfWeek('1970-01-01')).toBe(4) // giovedi
    expect(dayOfWeek('2000-01-01')).toBe(6) // sabato
    expect(dayOfWeek('2024-02-29')).toBe(4) // giovedi
  })
})

describe('mesi', () => {
  it('endOfMonth su febbraio bisestile e non', () => {
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29')
    expect(endOfMonth('2025-02-10')).toBe('2025-02-28')
  })

  it('endOfMonth sui mesi da 30 e 31', () => {
    expect(endOfMonth('2025-04-01')).toBe('2025-04-30')
    expect(endOfMonth('2025-12-31')).toBe('2025-12-31')
    expect(endOfMonth('2025-01-01')).toBe('2025-01-31')
  })

  it('startOfMonth', () => {
    expect(startOfMonth('2025-08-24')).toBe('2025-08-01')
  })

  it('anni bisestili, inclusi i secolari', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2025)).toBe(false)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(daysInMonth(2100, 2)).toBe(28)
    expect(() => daysInMonth(2025, 13)).toThrow(RangeError)
  })
})

describe('clampDayOfMonth', () => {
  it('il 31 a febbraio non sconfina a marzo', () => {
    expect(clampDayOfMonth(2025, 2, 31)).toBe('2025-02-28')
    expect(clampDayOfMonth(2024, 2, 31)).toBe('2024-02-29')
    expect(clampDayOfMonth(2025, 2, 30)).toBe('2025-02-28')
    expect(clampDayOfMonth(2025, 2, 29)).toBe('2025-02-28')
  })

  it('taglia il 31 sui mesi da 30 giorni', () => {
    expect(clampDayOfMonth(2025, 4, 31)).toBe('2025-04-30')
    expect(clampDayOfMonth(2025, 6, 31)).toBe('2025-06-30')
    expect(clampDayOfMonth(2025, 11, 31)).toBe('2025-11-30')
  })

  it('lascia intatti i giorni validi', () => {
    expect(clampDayOfMonth(2025, 1, 31)).toBe('2025-01-31')
    expect(clampDayOfMonth(2025, 3, 15)).toBe('2025-03-15')
    expect(clampDayOfMonth(2025, 12, 1)).toBe('2025-12-01')
  })

  it('rifiuta mese e giorno fuori intervallo', () => {
    expect(() => clampDayOfMonth(2025, 0, 10)).toThrow(RangeError)
    expect(() => clampDayOfMonth(2025, 13, 10)).toThrow(RangeError)
    expect(() => clampDayOfMonth(2025, 2, 0)).toThrow(RangeError)
    expect(() => clampDayOfMonth(2025.5, 2, 10)).toThrow(RangeError)
  })

  it('anchorDay 31 su tutti i mesi di un anno bisestile', () => {
    const attesi = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    for (let m = 1; m <= 12; m += 1) {
      expect(clampDayOfMonth(2024, m, 31)).toBe(`2024-${String(m).padStart(2, '0')}-${attesi[m - 1] ?? 0}`)
    }
  })
})

describe('addDays e differenze', () => {
  it('non usa aritmetica UTC: il ritorno all ora solare non sposta i giorni', () => {
    // 26 ottobre 2025, in Europa la giornata dura 25 ore.
    expect(addDays('2025-10-25', 1)).toBe('2025-10-26')
    expect(addDays('2025-10-26', 1)).toBe('2025-10-27')
    expect(addDays('2025-10-25', 3)).toBe('2025-10-28')
    expect(daysBetween('2025-10-01', '2025-11-01')).toBe(31)
  })

  it('non usa aritmetica UTC: il passaggio all ora legale non salta un giorno', () => {
    // 29 marzo 2026, giornata di 23 ore.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30')
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31)
    // Con i millisecondi, (25h o 23h) / 24h non e un intero: qui lo e sempre.
    expect(daysBetween('2025-03-30', '2025-03-31')).toBe(1)
  })

  it('attraversa mesi, anni e il 29 febbraio', () => {
    expect(addDays('2025-01-31', 1)).toBe('2025-02-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01')
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2025-08-24', 0)).toBe('2025-08-24')
  })

  it('catch-up di 40 giorni', () => {
    expect(addDays('2025-01-15', 40)).toBe('2025-02-24')
    expect(daysBetween('2025-01-15', '2025-02-24')).toBe(40)
    expect(addDays('2025-02-24', -40)).toBe('2025-01-15')
  })

  it('daysBetween e con segno e coerente sui mesi di febbraio', () => {
    expect(daysBetween('2025-08-24', '2025-08-24')).toBe(0)
    expect(daysBetween('2025-08-24', '2025-08-18')).toBe(-6)
    expect(daysBetween('2024-02-01', '2024-03-01')).toBe(29)
    expect(daysBetween('2025-02-01', '2025-03-01')).toBe(28)
    expect(daysBetween('2025-01-01', '2026-01-01')).toBe(365)
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366)
  })

  it('rifiuta input non validi', () => {
    expect(() => addDays('2025-02-30', 1)).toThrow(RangeError)
    expect(() => addDays('2025-01-01', 1.5)).toThrow(RangeError)
  })

  it('epochDay e stabile e invertibile su 1500 giorni consecutivi', () => {
    let iso: IsoDate = '2023-01-01'
    let epoch = toEpochDay(iso)
    let atteso = dayOfWeek(iso)
    for (let i = 0; i < 1500; i += 1) {
      expect(fromEpochDay(epoch)).toBe(iso)
      expect(toEpochDay(iso)).toBe(epoch)
      expect(dayOfWeek(iso)).toBe(atteso)
      expect(daysBetween('2023-01-01', iso)).toBe(i)
      const next = addDays(iso, 1)
      expect(isIsoDate(next)).toBe(true)
      expect(toIsoDate(fromIsoDate(next))).toBe(next)
      iso = next
      epoch += 1
      atteso = atteso === 7 ? 1 : atteso + 1
    }
    expect(iso).toBe('2027-02-09')
  })
})

describe('confronti', () => {
  it('ordina cronologicamente', () => {
    expect(compareIsoDates('2025-01-01', '2025-01-02')).toBe(-1)
    expect(compareIsoDates('2025-01-02', '2025-01-01')).toBe(1)
    expect(compareIsoDates('2025-01-01', '2025-01-01')).toBe(0)
    expect(isBefore('2024-12-31', '2025-01-01')).toBe(true)
    expect(isAfter('2025-01-01', '2024-12-31')).toBe(true)
    expect(isBefore('2025-01-01', '2025-01-01')).toBe(false)
  })

  it('e utilizzabile come comparatore di Array.sort', () => {
    const date = ['2025-03-01', '2024-12-31', '2025-01-15']
    expect([...date].sort(compareIsoDates)).toEqual(['2024-12-31', '2025-01-15', '2025-03-01'])
  })

  it('e totale: non lancia mai, nemmeno su date inesistenti o spazzatura', () => {
    // Nessuna di queste passerebbe isIsoDate; il comparatore risponde lo stesso.
    expect(() => compareIsoDates('2025-02-31', '2025-01-01')).not.toThrow()
    expect(() => compareIsoDates('', '2025-01-01')).not.toThrow()
    expect(() => compareIsoDates('non-una-data', '2025-01-01')).not.toThrow()
    expect(compareIsoDates('', '')).toBe(0)
    expect(compareIsoDates('2025-13-01', '2025-13-01')).toBe(0)
  })

  it('un record corrotto non fa esplodere il sort della lista', () => {
    const date = ['2025-03-01', 'spazzatura', '2024-12-31', '', '2025-01-15', '2025-02-31']
    let sorted: string[] = []
    expect(() => {
      sorted = [...date].sort(compareIsoDates)
    }).not.toThrow()

    // Nessun elemento perso o duplicato.
    expect(sorted).toHaveLength(date.length)
    expect([...sorted].sort()).toEqual([...date].sort())

    // Le date valide restano ordinate fra loro, nell'ordine giusto.
    const valide = sorted.filter(isIsoDate)
    expect(valide).toEqual(['2024-12-31', '2025-01-15', '2025-03-01'])
  })
})
