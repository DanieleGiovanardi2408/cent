import { describe, expect, it } from 'vitest'
import { groupByDay, isLive, lastWeeksTotals, spentByCategory } from './stats'
import { makeExpense } from './testing'
import type { Expense } from './types'

const agosto = { start: '2026-08-01', end: '2026-08-31' }

function ex(date: string, amountCents: number, extra: Partial<Expense> = {}): Expense {
  return makeExpense({ date, amountCents, ...extra })
}

describe('soft delete', () => {
  it('isLive esclude solo le cancellate', () => {
    expect(isLive(ex('2026-08-01', 100))).toBe(true)
    expect(isLive(ex('2026-08-01', 100, { deletedAt: '2026-08-01T00:00:00Z' }))).toBe(false)
  })
})

describe('groupByDay (lo Storico)', () => {
  const spese = [
    ex('2026-08-10', 500, { createdAt: '2026-08-10T08:00:00Z' }),
    ex('2026-08-10', 250, { createdAt: '2026-08-10T19:00:00Z' }),
    ex('2026-08-12', 1_000),
    ex('2026-08-11', 900, { deletedAt: '2026-08-11T10:00:00Z' }),
  ]

  it('raggruppa per giorno, dal piu recente, con il totale del giorno', () => {
    const groups = groupByDay(spese)
    expect(groups.map((g) => g.date)).toEqual(['2026-08-12', '2026-08-10'])
    expect(groups[0]?.totalCents).toBe(1_000)
    expect(groups[1]?.totalCents).toBe(750)
    expect(groups[1]?.expenses).toHaveLength(2)
  })

  it('dentro il giorno mette per prima l ultima inserita', () => {
    const groups = groupByDay(spese)
    expect(groups[1]?.expenses[0]?.createdAt).toBe('2026-08-10T19:00:00Z')
  })

  it('il giorno che resta senza spese vive sparisce, non compare a zero', () => {
    expect(groupByDay(spese).map((g) => g.date)).not.toContain('2026-08-11')
  })

  it('elenco vuoto, nessun gruppo', () => {
    expect(groupByDay([])).toEqual([])
  })

  it('regge 5.000 spese senza sudare', () => {
    const molte: Expense[] = []
    for (let i = 0; i < 5_000; i += 1) {
      molte.push(ex(`2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, '0')}`, 100 + i))
    }
    const started = performance.now()
    const groups = groupByDay(molte)
    expect(performance.now() - started).toBeLessThan(500)
    expect(groups.reduce((n, g) => n + g.expenses.length, 0)).toBe(5_000)
  })
})

describe('spentByCategory', () => {
  const spese = [
    ex('2026-08-01', 3_000, { categoryId: 'cat-a' }),
    ex('2026-08-02', 1_000, { categoryId: 'cat-b' }),
    ex('2026-08-03', 1_000, { categoryId: 'cat-a' }),
    ex('2026-08-04', 9_999, { categoryId: 'cat-c', deletedAt: '2026-08-04T00:00:00Z' }),
    ex('2026-09-04', 9_999, { categoryId: 'cat-c' }),
  ]

  it('somma per categoria, dalla piu pesante', () => {
    const rows = spentByCategory(spese, agosto)
    expect(rows.map((r) => r.categoryId)).toEqual(['cat-a', 'cat-b'])
    expect(rows[0]?.totalCents).toBe(4_000)
    expect(rows[0]?.count).toBe(2)
  })

  it('le quote sono intere in punti base e sommano circa a 10000', () => {
    const rows = spentByCategory(spese, agosto)
    expect(rows[0]?.shareBasisPoints).toBe(8_000)
    expect(rows[1]?.shareBasisPoints).toBe(2_000)
    expect(rows.reduce((n, r) => n + r.shareBasisPoints, 0)).toBe(10_000)
  })

  it('le categorie senza spese nel periodo non compaiono', () => {
    expect(spentByCategory(spese, agosto).map((r) => r.categoryId)).not.toContain('cat-c')
  })

  it('con totale zero le quote sono zero, non NaN', () => {
    const rows = spentByCategory([ex('2026-08-01', 0, { categoryId: 'cat-a' })], agosto)
    expect(rows[0]?.shareBasisPoints).toBe(0)
    expect(rows[0]?.totalCents).toBe(0)
  })
})

describe('lastWeeksTotals (ultime 8 settimane)', () => {
  it('restituisce 8 settimane, dalla piu vecchia, lunedi-domenica', () => {
    const weeks = lastWeeksTotals([], '2026-08-22', 8)
    expect(weeks).toHaveLength(8)
    expect(weeks[0]?.weekStart).toBe('2026-06-29')
    expect(weeks[0]?.weekEnd).toBe('2026-07-05')
    expect(weeks[7]?.weekStart).toBe('2026-08-17')
    expect(weeks[7]?.weekEnd).toBe('2026-08-23')
  })

  it('le settimane senza spese ci sono, a zero', () => {
    const weeks = lastWeeksTotals([ex('2026-08-18', 1_500)], '2026-08-22', 8)
    expect(weeks[7]?.totalCents).toBe(1_500)
    expect(weeks.slice(0, 7).every((w) => w.totalCents === 0)).toBe(true)
  })

  it('somma dentro la settimana giusta anche al confine della domenica', () => {
    const spese = [
      ex('2026-08-16', 100), // domenica: settimana precedente
      ex('2026-08-17', 200), // lunedi: settimana corrente
      ex('2026-08-23', 400), // domenica: ancora settimana corrente
      ex('2026-08-24', 800), // lunedi successivo: fuori finestra
    ]
    const weeks = lastWeeksTotals(spese, '2026-08-22', 8)
    expect(weeks[6]?.totalCents).toBe(100)
    expect(weeks[7]?.totalCents).toBe(600)
    expect(weeks.reduce((n, w) => n + w.totalCents, 0)).toBe(700)
  })

  it('la settimana del cambio ora legale resta di 7 giorni', () => {
    // 2026-03-30 e il lunedi dopo il cambio: la spesa di domenica 29 finisce
    // nella settimana precedente, che resta di 7 giorni nonostante l ora persa.
    const weeks = lastWeeksTotals([ex('2026-03-29', 100)], '2026-03-30', 2)
    expect(weeks[0]).toEqual({ weekStart: '2026-03-23', weekEnd: '2026-03-29', totalCents: 100 })
    expect(weeks[1]).toEqual({ weekStart: '2026-03-30', weekEnd: '2026-04-05', totalCents: 0 })
  })

  it('ignora le cancellate e rifiuta un numero di settimane assurdo', () => {
    const weeks = lastWeeksTotals(
      [ex('2026-08-18', 1_500, { deletedAt: '2026-08-18T00:00:00Z' })],
      '2026-08-22',
    )
    expect(weeks.every((w) => w.totalCents === 0)).toBe(true)
    expect(() => lastWeeksTotals([], '2026-08-22', 0)).toThrow(RangeError)
  })
})
