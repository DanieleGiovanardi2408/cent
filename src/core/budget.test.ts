import { describe, expect, it } from 'vitest'
import {
  computeBudgetMetrics,
  periodRange,
  planBudgetChange,
  resolveBudget,
  totalSpent,
} from './budget'
import { daysBetween } from './date'
import { makeBudget, makeExpense, sequentialIds, tickingClock } from './testing'
import type { Budget } from './types'

describe('periodi', () => {
  it('il periodo settimanale va da lunedi a domenica', () => {
    // 2026-08-22 e un sabato.
    expect(periodRange('weekly', '2026-08-22')).toEqual({
      start: '2026-08-17',
      end: '2026-08-23',
    })
  })

  it('la settimana del cambio ora legale ha comunque 7 giorni', () => {
    // Ora legale: domenica 29 marzo 2026. Ora solare: domenica 25 ottobre 2026.
    for (const day of ['2026-03-29', '2026-10-25']) {
      const range = periodRange('weekly', day)
      expect(daysBetween(range.start, range.end)).toBe(6)
      expect(range.end.slice(8)).not.toBe(range.start.slice(8))
    }
    expect(periodRange('weekly', '2026-03-29')).toEqual({ start: '2026-03-23', end: '2026-03-29' })
    expect(periodRange('weekly', '2026-10-25')).toEqual({ start: '2026-10-19', end: '2026-10-25' })
  })

  it('il periodo mensile arriva all ultimo giorno vero del mese', () => {
    expect(periodRange('monthly', '2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
    expect(periodRange('monthly', '2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(periodRange('monthly', '2026-04-30')).toEqual({ start: '2026-04-01', end: '2026-04-30' })
  })

})

describe('resolveBudget', () => {
  const chiuso = makeBudget({
    id: 'b-vecchio',
    amountCents: 100_000,
    effectiveFrom: '2026-01-01',
    effectiveTo: '2026-07-31',
  })
  const aperto = makeBudget({ id: 'b-nuovo', amountCents: 80_000, effectiveFrom: '2026-08-01' })
  const budgets: readonly Budget[] = [chiuso, aperto]

  it('sceglie il record in vigore quel giorno', () => {
    expect(resolveBudget(budgets, 'monthly', '2026-07-31')?.id).toBe('b-vecchio')
    expect(resolveBudget(budgets, 'monthly', '2026-08-01')?.id).toBe('b-nuovo')
  })

  it('restituisce null prima del primo record e per periodi diversi', () => {
    expect(resolveBudget(budgets, 'monthly', '2025-12-31')).toBeNull()
    expect(resolveBudget(budgets, 'weekly', '2026-08-01')).toBeNull()
  })

  it('un budget di categoria non risponde per il budget complessivo, e viceversa', () => {
    const diCategoria = makeBudget({
      amountCents: 20_000,
      effectiveFrom: '2026-01-01',
      categoryId: 'cat-spesa',
    })
    const all = [...budgets, diCategoria]
    expect(resolveBudget(all, 'monthly', '2026-08-10')?.id).toBe('b-nuovo')
    expect(resolveBudget(all, 'monthly', '2026-08-10', 'cat-spesa')?.id).toBe(diCategoria.id)
    expect(resolveBudget(all, 'monthly', '2026-08-10', 'cat-altro')).toBeNull()
  })

  it('con record sovrapposti vince il piu recente, senza lanciare', () => {
    const sovrapposto = makeBudget({
      id: 'b-sovrapposto',
      amountCents: 50_000,
      effectiveFrom: '2026-08-05',
    })
    expect(resolveBudget([...budgets, sovrapposto], 'monthly', '2026-08-10')?.id).toBe(
      'b-sovrapposto',
    )
  })
})

describe('budget storicizzati: il passato non si riscrive', () => {
  const spese = [
    makeExpense({ date: '2026-07-05', amountCents: 30_000 }),
    makeExpense({ date: '2026-07-20', amountCents: 25_000 }),
    makeExpense({ date: '2026-08-03', amountCents: 12_000 }),
  ]
  const oggi = '2026-08-22'
  const iniziali: readonly Budget[] = [
    makeBudget({ id: 'b1', amountCents: 100_000, effectiveFrom: '2026-01-01' }),
  ]

  it('cambiare il budget di oggi non tocca i totali del mese scorso', () => {
    const luglioPrima = computeBudgetMetrics({
      expenses: spese,
      budgets: iniziali,
      period: 'monthly',
      onDate: '2026-07-15',
      today: oggi,
    })
    expect(luglioPrima.budgetCents).toBe(100_000)
    expect(luglioPrima.spentCents).toBe(55_000)
    expect(luglioPrima.remainingCents).toBe(45_000)

    // L utente stamattina abbassa il budget.
    const scritti = planBudgetChange(iniziali, {
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: oggi,
      now: tickingClock(),
      newId: sequentialIds('b'),
    })
    const dopo = [
      ...iniziali.filter((b) => !scritti.some((s) => s.id === b.id)),
      ...scritti,
    ]

    const luglioDopo = computeBudgetMetrics({
      expenses: spese,
      budgets: dopo,
      period: 'monthly',
      onDate: '2026-07-15',
      today: oggi,
    })
    expect(luglioDopo).toEqual(luglioPrima)

    // E il mese corrente il nuovo budget lo vede subito, non dal mese prossimo.
    const agosto = computeBudgetMetrics({
      expenses: spese,
      budgets: dopo,
      period: 'monthly',
      onDate: oggi,
      today: oggi,
    })
    expect(agosto.budgetCents).toBe(80_000)
  })

  it('planBudgetChange chiude il record aperto il giorno prima', () => {
    const scritti = planBudgetChange(iniziali, {
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: '2026-08-22',
      now: tickingClock(),
      newId: sequentialIds('b'),
    })
    expect(scritti).toHaveLength(2)
    expect(scritti[0]?.id).toBe('b1')
    expect(scritti[0]?.effectiveTo).toBe('2026-08-21')
    expect(scritti[0]?.amountCents).toBe(100_000)
    expect(scritti[1]?.effectiveFrom).toBe('2026-08-22')
    expect(scritti[1]?.amountCents).toBe(80_000)
    expect(scritti[1]?.effectiveTo).toBeUndefined()
  })

  it('due cambi nello stesso giorno aggiornano lo stesso record, senza lasciare rottami', () => {
    const primo = planBudgetChange(iniziali, {
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: '2026-08-22',
      now: tickingClock(),
      newId: sequentialIds('b'),
    })
    const stato = [iniziali[0] as Budget, primo[1] as Budget]
    const secondo = planBudgetChange(stato, {
      period: 'monthly',
      amountCents: 90_000,
      effectiveFrom: '2026-08-22',
      now: tickingClock(),
      newId: sequentialIds('c'),
    })
    expect(secondo).toHaveLength(1)
    expect(secondo[0]?.id).toBe(primo[1]?.id)
    expect(secondo[0]?.amountCents).toBe(90_000)
  })

  it('il primo budget in assoluto non chiude niente', () => {
    const scritti = planBudgetChange([], {
      period: 'weekly',
      amountCents: 20_000,
      effectiveFrom: '2026-08-17',
      now: tickingClock(),
      newId: sequentialIds('b'),
    })
    expect(scritti).toHaveLength(1)
    expect(scritti[0]?.period).toBe('weekly')
    expect(scritti[0]?.categoryId).toBeUndefined()
  })
})

describe('metriche del periodo', () => {
  const budgets = [makeBudget({ amountCents: 60_000, effectiveFrom: '2026-08-01' })]
  const spese = [
    makeExpense({ date: '2026-08-01', amountCents: 10_000 }),
    makeExpense({ date: '2026-08-10', amountCents: 5_000 }),
    makeExpense({ date: '2026-08-22', amountCents: 3_000 }),
    makeExpense({ date: '2026-09-01', amountCents: 99_999 }),
  ]

  it('calcola speso, rimanente e giorni con oggi incluso fra quelli rimanenti', () => {
    const m = computeBudgetMetrics({
      expenses: spese,
      budgets,
      period: 'monthly',
      onDate: '2026-08-22',
      today: '2026-08-22',
    })
    expect(m.range).toEqual({ start: '2026-08-01', end: '2026-08-31' })
    expect(m.spentCents).toBe(18_000)
    expect(m.remainingCents).toBe(42_000)
    expect(m.daysTotal).toBe(31)
    expect(m.daysRemaining).toBe(10)
    expect(m.daysElapsed).toBe(21)
    // 42000 / 10 = 4200 esatti.
    expect(m.dailyAllowanceCents).toBe(4_200)
    // Il passo attuale si divide per i giorni **vissuti**, oggi compreso: dal 1
    // al 22 sono 22 giorni, non 21. 18000/22 = 818,18 -> 818.
    // (Qui c'era 857, cioe' 18000/21: un test verde che documentava come
    // intenzionale l'errore n/(n-1). Vedi il commento su `currentPaceCents`.)
    expect(m.currentPaceCents).toBe(818)
    expect(m.sustainablePaceCents).toBe(1_935)
    expect(m.overBudget).toBe(false)
  })

  it('il secondo giorno del periodo il passo non raddoppia', () => {
    // Il caso che rendeva il numero inservibile: settimana 17-23 agosto, 100
    // euro spesi lunedi, oggi e' martedi. Il passo e' 50 al giorno, non 100.
    const m = computeBudgetMetrics({
      expenses: [makeExpense({ date: '2026-08-17', amountCents: 10_000 })],
      budgets: [],
      period: 'weekly',
      onDate: '2026-08-18',
      today: '2026-08-18',
    })
    expect(m.daysElapsed).toBe(1)
    expect(m.currentPaceCents).toBe(5_000)
  })

  it('su un periodo finito il passo si divide per tutti i giorni del periodo', () => {
    // Luglio: 31 giorni, tutti vissuti. 18600/31 = 600 esatti.
    const luglio = [
      makeExpense({ date: '2026-07-02', amountCents: 9_300 }),
      makeExpense({ date: '2026-07-20', amountCents: 9_300 }),
    ]
    const m = computeBudgetMetrics({
      expenses: luglio,
      budgets,
      period: 'monthly',
      onDate: '2026-07-15',
      today: '2026-08-22',
    })
    expect(m.daysTotal).toBe(31)
    expect(m.currentPaceCents).toBe(600)
  })

  it('il passo attuale non supera mai lo speso: nessun giorno viene contato in meno', () => {
    // La proprieta' che l'errore n/(n-1) rompeva: passo * giorni vissuti <= speso.
    for (const day of ['2026-08-01', '2026-08-02', '2026-08-10', '2026-08-31']) {
      const m = computeBudgetMetrics({
        expenses: spese,
        budgets,
        period: 'monthly',
        onDate: day,
        today: day,
      })
      const vissuti = m.daysElapsed + 1
      expect((m.currentPaceCents ?? 0) * vissuti).toBeLessThanOrEqual(m.spentCents)
    }
  })

  it('ignora le spese cancellate', () => {
    const conCancellata = [
      ...spese,
      makeExpense({ date: '2026-08-05', amountCents: 40_000, deletedAt: '2026-08-05T12:00:00Z' }),
    ]
    const m = computeBudgetMetrics({
      expenses: conCancellata,
      budgets,
      period: 'monthly',
      onDate: '2026-08-22',
      today: '2026-08-22',
    })
    expect(m.spentCents).toBe(18_000)
  })

  it('sforare non e un errore: il rimanente diventa negativo e il giornaliero anche', () => {
    const troppo = [makeExpense({ date: '2026-08-02', amountCents: 61_000 })]
    const m = computeBudgetMetrics({
      expenses: troppo,
      budgets,
      period: 'monthly',
      onDate: '2026-08-22',
      today: '2026-08-22',
    })
    expect(m.remainingCents).toBe(-1_000)
    expect(m.overBudget).toBe(true)
    // -1000 su 10 giorni: -100 esatti. Con floor, mai un valore che consoli.
    expect(m.dailyAllowanceCents).toBe(-100)
  })

  it('a periodo finito i giorni rimanenti sono zero e il giornaliero e null', () => {
    const m = computeBudgetMetrics({
      expenses: spese,
      budgets,
      period: 'monthly',
      onDate: '2026-07-15',
      today: '2026-08-22',
    })
    expect(m.daysRemaining).toBe(0)
    expect(m.daysElapsed).toBe(31)
    expect(m.dailyAllowanceCents).toBeNull()
  })

  it('il primo giorno del periodo non ha un passo attuale da mostrare', () => {
    const m = computeBudgetMetrics({
      expenses: spese,
      budgets,
      period: 'monthly',
      onDate: '2026-08-01',
      today: '2026-08-01',
    })
    expect(m.daysElapsed).toBe(0)
    expect(m.currentPaceCents).toBeNull()
    expect(m.daysRemaining).toBe(31)
  })

  it('senza budget le metriche di denaro sono null ma lo speso si vede lo stesso', () => {
    const m = computeBudgetMetrics({
      expenses: spese,
      budgets: [],
      period: 'monthly',
      onDate: '2026-08-22',
      today: '2026-08-22',
    })
    expect(m.budgetCents).toBeNull()
    expect(m.remainingCents).toBeNull()
    expect(m.dailyAllowanceCents).toBeNull()
    expect(m.sustainablePaceCents).toBeNull()
    expect(m.spentCents).toBe(18_000)
    expect(m.overBudget).toBe(false)
  })

  it('il budget di categoria conta solo le spese di quella categoria', () => {
    const miste = [
      makeExpense({ date: '2026-08-02', amountCents: 4_000, categoryId: 'cat-spesa' }),
      makeExpense({ date: '2026-08-03', amountCents: 9_000, categoryId: 'cat-svago' }),
    ]
    const perCategoria = [
      makeBudget({ amountCents: 10_000, effectiveFrom: '2026-08-01', categoryId: 'cat-spesa' }),
    ]
    const m = computeBudgetMetrics({
      expenses: miste,
      budgets: perCategoria,
      period: 'monthly',
      onDate: '2026-08-22',
      today: '2026-08-22',
      categoryId: 'cat-spesa',
    })
    expect(m.spentCents).toBe(4_000)
    expect(m.budgetCents).toBe(10_000)
  })

  it('un periodo futuro ha tutti i giorni davanti', () => {
    const m = computeBudgetMetrics({
      expenses: spese,
      budgets,
      period: 'weekly',
      onDate: '2026-09-07',
      today: '2026-08-22',
    })
    expect(m.daysTotal).toBe(7)
    expect(m.daysRemaining).toBe(7)
    expect(m.daysElapsed).toBe(0)
  })

  it('totalSpent somma solo dentro l intervallo', () => {
    expect(totalSpent(spese, { start: '2026-08-01', end: '2026-08-31' })).toBe(18_000)
    expect(totalSpent(spese, { start: '2026-08-02', end: '2026-08-21' })).toBe(5_000)
    expect(totalSpent(spese, { start: '2026-01-01', end: '2026-01-31' })).toBe(0)
  })
})
