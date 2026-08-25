import { describe, expect, it } from 'vitest'
import {
  budgetSpent,
  computeBudgetMetrics,
  countsTowardBudget,
  periodRange,
  planResolvedBudgetChange,
  recurringSpent,
  resolveBudget,
} from './budget'
import { daysBetween } from './date'
import type { IsoDate } from './date'
import { makeBudget, makeExpense } from './testing'
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

  /**
   * Due record aperti sullo stesso `period` e la stessa categoria non
   * dovrebbero esistere. Se esistono lo stesso — un JSON modificato a mano e
   * reimportato, una scrittura morta a meta' — la risposta non puo' dipendere
   * dall'ordine in cui l'array li presenta: la Home mostrerebbe due numeri
   * diversi per lo stesso dato. Ogni caso qui sotto viene quindi provato in
   * entrambi gli ordini.
   */
  describe('sovrapposizioni: la scelta e deterministica, mai arbitraria', () => {
    function inEntrambiGliOrdini(uno: Budget, due: Budget, onDay: IsoDate): (Budget | null)[] {
      return [
        resolveBudget([uno, due], 'monthly', onDay, 'cat-casa'),
        resolveBudget([due, uno], 'monthly', onDay, 'cat-casa'),
      ]
    }

    it('due record aperti sovrapposti: vince l effectiveFrom piu recente', () => {
      const vecchio = makeBudget({
        id: 'b-vecchio-aperto',
        categoryId: 'cat-casa',
        amountCents: 100_000,
        effectiveFrom: '2026-08-01',
        // Creato dopo, apposta: non e' `createdAt` a decidere quando i giorni
        // sono diversi, altrimenti un import riordinerebbe la storia.
        createdAt: '2026-08-20T10:00:00.000Z',
      })
      const recente = makeBudget({
        id: 'b-recente-aperto',
        categoryId: 'cat-casa',
        amountCents: 50_000,
        effectiveFrom: '2026-08-05',
        createdAt: '2026-08-02T10:00:00.000Z',
      })
      for (const scelto of inEntrambiGliOrdini(vecchio, recente, '2026-08-10')) {
        expect(scelto?.id).toBe('b-recente-aperto')
        expect(scelto?.amountCents).toBe(50_000)
      }
      // E prima del secondo record vale il primo: la sovrapposizione non
      // cancella il passato, lo lascia dov e.
      for (const scelto of inEntrambiGliOrdini(vecchio, recente, '2026-08-03')) {
        expect(scelto?.id).toBe('b-vecchio-aperto')
      }
    })

    it('a parita di effectiveFrom vince il creato per ultimo', () => {
      const prima = makeBudget({
        id: 'b-prima',
        categoryId: 'cat-casa',
        amountCents: 100_000,
        effectiveFrom: '2026-08-01',
        createdAt: '2026-08-01T09:00:00.000Z',
      })
      const dopo = makeBudget({
        id: 'b-dopo',
        categoryId: 'cat-casa',
        amountCents: 70_000,
        effectiveFrom: '2026-08-01',
        createdAt: '2026-08-01T09:00:01.000Z',
      })
      for (const scelto of inEntrambiGliOrdini(prima, dopo, '2026-08-10')) {
        expect(scelto?.id).toBe('b-dopo')
        expect(scelto?.amountCents).toBe(70_000)
      }
    })

    it('a parita anche di createdAt sceglie l id piu grande: sempre lo stesso, e non lancia', () => {
      const alfa = makeBudget({
        id: 'b-alfa',
        categoryId: 'cat-casa',
        amountCents: 100_000,
        effectiveFrom: '2026-08-01',
        createdAt: '2026-08-01T09:00:00.000Z',
      })
      const beta = makeBudget({
        id: 'b-beta',
        categoryId: 'cat-casa',
        amountCents: 70_000,
        effectiveFrom: '2026-08-01',
        createdAt: '2026-08-01T09:00:00.000Z',
      })
      expect(() => resolveBudget([alfa, beta], 'monthly', '2026-08-10', 'cat-casa')).not.toThrow()
      for (const scelto of inEntrambiGliOrdini(alfa, beta, '2026-08-10')) {
        expect(scelto?.id).toBe('b-beta')
      }
    })

    it('tre record sovrapposti: la stessa risposta per tutte le permutazioni', () => {
      const record = [
        makeBudget({
          id: 'b-1',
          categoryId: 'cat-casa',
          amountCents: 100_000,
          effectiveFrom: '2026-08-01',
          createdAt: '2026-08-01T09:00:00.000Z',
        }),
        makeBudget({
          id: 'b-2',
          categoryId: 'cat-casa',
          amountCents: 70_000,
          effectiveFrom: '2026-08-03',
          createdAt: '2026-08-03T09:00:00.000Z',
        }),
        makeBudget({
          id: 'b-3',
          categoryId: 'cat-casa',
          amountCents: 40_000,
          effectiveFrom: '2026-08-03',
          createdAt: '2026-08-03T09:00:01.000Z',
        }),
      ] as const
      const permutazioni: Budget[][] = [
        [record[0], record[1], record[2]],
        [record[0], record[2], record[1]],
        [record[1], record[0], record[2]],
        [record[1], record[2], record[0]],
        [record[2], record[0], record[1]],
        [record[2], record[1], record[0]],
      ]
      const scelti = permutazioni.map(
        (p) => resolveBudget(p, 'monthly', '2026-08-10', 'cat-casa')?.id,
      )
      expect(new Set(scelti)).toEqual(new Set(['b-3']))
    })
  })
})

describe('budget storicizzati: il passato non si riscrive', () => {
  // Istante e id del record nuovo arrivano gia' risolti da chi ha premuto il
  // tasto: `planResolvedBudgetChange` e' pura, e con gli stessi ingressi
  // ripianifica lo stesso identico piano (e' cio' che gira in transazione).
  const ISTANTE = '2026-08-22T09:00:00.000Z'
  const ISTANTE_DOPO = '2026-08-22T18:30:00.000Z'
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
    const scritti = planResolvedBudgetChange(iniziali, {
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: oggi,
      timestamp: ISTANTE,
      newRecordId: 'b2',
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

  it('chiude il record aperto il giorno prima e apre quello nuovo con l id ricevuto', () => {
    const scritti = planResolvedBudgetChange(iniziali, {
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: '2026-08-22',
      timestamp: ISTANTE,
      newRecordId: 'b2',
    })
    expect(scritti).toHaveLength(2)
    expect(scritti[0]?.id).toBe('b1')
    expect(scritti[0]?.effectiveTo).toBe('2026-08-21')
    expect(scritti[0]?.amountCents).toBe(100_000)
    expect(scritti[0]?.updatedAt).toBe(ISTANTE)
    expect(scritti[1]?.id).toBe('b2')
    expect(scritti[1]?.effectiveFrom).toBe('2026-08-22')
    expect(scritti[1]?.amountCents).toBe(80_000)
    expect(scritti[1]?.effectiveTo).toBeUndefined()
    expect(scritti[1]?.createdAt).toBe(ISTANTE)
  })

  it('a ingressi identici il piano e identico: ritentare una scrittura non apre un secondo record', () => {
    const richiesta = {
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: '2026-08-22',
      timestamp: ISTANTE,
      newRecordId: 'b2',
    } as const
    expect(planResolvedBudgetChange(iniziali, richiesta)).toEqual(
      planResolvedBudgetChange(iniziali, richiesta),
    )
  })

  it('due cambi nello stesso giorno aggiornano lo stesso record, senza lasciare rottami', () => {
    const primo = planResolvedBudgetChange(iniziali, {
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: '2026-08-22',
      timestamp: ISTANTE,
      newRecordId: 'b2',
    })
    const stato = [iniziali[0] as Budget, primo[1] as Budget]
    const secondo = planResolvedBudgetChange(stato, {
      period: 'monthly',
      amountCents: 90_000,
      effectiveFrom: '2026-08-22',
      timestamp: ISTANTE_DOPO,
      newRecordId: 'b3',
    })
    expect(secondo).toHaveLength(1)
    expect(secondo[0]?.id).toBe('b2')
    expect(secondo[0]?.amountCents).toBe(90_000)
    expect(secondo[0]?.updatedAt).toBe(ISTANTE_DOPO)
  })

  it('il primo budget in assoluto non chiude niente', () => {
    const scritti = planResolvedBudgetChange([], {
      period: 'weekly',
      amountCents: 20_000,
      effectiveFrom: '2026-08-17',
      timestamp: ISTANTE,
      newRecordId: 'b2',
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

  it('budgetEffectiveFrom riporta da che giorno il budget vale', () => {
    // Il budget e nato con il periodo (anzi, prima): copriva tutto l arco, quindi
    // quello che si e speso lo ha eroso davvero.
    const m = computeBudgetMetrics({
      expenses: spese,
      budgets,
      period: 'monthly',
      onDate: '2026-08-22',
      today: '2026-08-22',
    })
    expect(m.budgetEffectiveFrom).toBe('2026-08-01')
    expect(m.budgetEffectiveFrom).toBe(m.range.start)
  })

  it('un budget nato a meta periodo si distingue da un budget bruciato', () => {
    // Il caso vero: primo budget settimanale impostato mercoledi, con lunedi e
    // martedi gia spesi. `remainingCents` esce negativo, ma non e uno sforamento:
    // il budget non c era ancora. Il numero non cambia, cambia cosa si puo dire.
    const settimana = [
      makeExpense({ date: '2026-08-17', amountCents: 12_000 }),
      makeExpense({ date: '2026-08-18', amountCents: 12_000 }),
    ]
    const natoMercoledi = [
      makeBudget({ period: 'weekly', amountCents: 20_000, effectiveFrom: '2026-08-19' }),
    ]
    const m = computeBudgetMetrics({
      expenses: settimana,
      budgets: natoMercoledi,
      period: 'weekly',
      onDate: '2026-08-19',
      today: '2026-08-19',
    })
    expect(m.range.start).toBe('2026-08-17')
    expect(m.budgetEffectiveFrom).toBe('2026-08-19')
    // Nessun budget copriva il lunedi: quei 240,00 sono usciti senza una regola.
    expect(m.budgetCoveredPeriodStart).toBe(false)
    // Nessun pro-rata: il tetto resta quello dichiarato, e lo speso e quello del
    // periodo intero. Solo `budgetEffectiveFrom` dice che il budget e piu giovane.
    expect(m.budgetCents).toBe(20_000)
    expect(m.spentCents).toBe(24_000)
    expect(m.remainingCents).toBe(-4_000)

    // Stessi numeri, budget presente da inizio settimana: qui e bruciato davvero.
    const bruciato = computeBudgetMetrics({
      expenses: settimana,
      budgets: [makeBudget({ period: 'weekly', amountCents: 20_000, effectiveFrom: '2026-08-17' })],
      period: 'weekly',
      onDate: '2026-08-19',
      today: '2026-08-19',
    })
    expect(bruciato.remainingCents).toBe(m.remainingCents)
    expect(bruciato.budgetEffectiveFrom).toBe('2026-08-17')
    expect(bruciato.budgetCoveredPeriodStart).toBe(true)
  })

  it('senza budget budgetEffectiveFrom e null come budgetCents', () => {
    const m = computeBudgetMetrics({
      expenses: spese,
      budgets: [],
      period: 'monthly',
      onDate: '2026-08-22',
      today: '2026-08-22',
    })
    expect(m.budgetCents).toBeNull()
    expect(m.budgetEffectiveFrom).toBeNull()
    expect(m.budgetCoveredPeriodStart).toBe(false)
  })

  it('un budget modificato a meta periodo non e un budget nato a meta periodo', () => {
    // Le due storie hanno lo stesso `budgetEffectiveFrom`: e solo
    // `budgetCoveredPeriodStart` a dire che qui una regola c era gia da lunedi,
    // e quindi che non c e niente da spiegare.
    const settimana = [
      makeExpense({ date: '2026-08-17', amountCents: 12_000 }),
      makeExpense({ date: '2026-08-18', amountCents: 12_000 }),
    ]
    const modificatoMercoledi = [
      makeBudget({
        id: 'b-lun',
        period: 'weekly',
        amountCents: 30_000,
        effectiveFrom: '2026-08-10',
        effectiveTo: '2026-08-18',
      }),
      makeBudget({
        id: 'b-mer',
        period: 'weekly',
        amountCents: 20_000,
        effectiveFrom: '2026-08-19',
      }),
    ]
    const m = computeBudgetMetrics({
      expenses: settimana,
      budgets: modificatoMercoledi,
      period: 'weekly',
      onDate: '2026-08-19',
      today: '2026-08-19',
    })
    const da = m.budgetEffectiveFrom
    expect(da).toBe('2026-08-19')
    expect(da !== null && da > m.range.start).toBe(true)
    expect(m.budgetCoveredPeriodStart).toBe(true)
    expect(m.remainingCents).toBe(-4_000)
  })

  it('un budget aperto mesi fa copre il primo giorno del periodo', () => {
    const m = computeBudgetMetrics({
      expenses: spese,
      budgets,
      period: 'monthly',
      onDate: '2026-08-22',
      today: '2026-08-22',
    })
    expect(m.budgetEffectiveFrom).toBe(m.range.start)
    expect(m.budgetCoveredPeriodStart).toBe(true)
  })

  it('un budget chiuso a meta periodo e mai riaperto lascia il flag a false', () => {
    // Dato che `planResolvedBudgetChange` non produce (chiude solo aprendo):
    // puo arrivare da un JSON modificato a mano. Senza budget oggi non c e
    // niente da qualificare, quindi il flag e false anche se lunedi un budget
    // c era. Scelta dichiarata nel doc del campo.
    const orfano = [
      makeBudget({
        period: 'weekly',
        amountCents: 20_000,
        effectiveFrom: '2026-08-17',
        effectiveTo: '2026-08-18',
      }),
    ]
    const m = computeBudgetMetrics({
      expenses: [],
      budgets: orfano,
      period: 'weekly',
      onDate: '2026-08-19',
      today: '2026-08-19',
    })
    expect(m.budgetCents).toBeNull()
    expect(m.budgetEffectiveFrom).toBeNull()
    expect(m.budgetCoveredPeriodStart).toBe(false)
  })

  it('budgetSpent somma solo dentro l intervallo', () => {
    expect(budgetSpent(spese, { start: '2026-08-01', end: '2026-08-31' })).toBe(18_000)
    expect(budgetSpent(spese, { start: '2026-08-02', end: '2026-08-21' })).toBe(5_000)
    expect(budgetSpent(spese, { start: '2026-01-01', end: '2026-01-31' })).toBe(0)
  })
})

/**
 * ADR 016 — le spese generate da una regola non entrano nel budget.
 *
 * Il caso che l'ADR esiste per evitare e' preciso: un affitto da 900 dentro una
 * settimana da 200 renderebbe la settimana del primo sempre catastrofica, e
 * "puoi spendere ~X al giorno" diventerebbe un numero che nessuno guarda piu'.
 */
describe('le ricorrenti fuori dal budget (ADR 016)', () => {
  const agosto = { start: '2026-08-01', end: '2026-08-31' }
  const spese = [
    makeExpense({ date: '2026-08-03', amountCents: 4_000 }),
    makeExpense({
      date: '2026-08-01',
      amountCents: 90_000,
      source: 'recurring',
      recurringId: 'r-affitto',
    }),
    makeExpense({ date: '2026-08-05', amountCents: 1_000, deletedAt: '2026-08-05T10:00:00.000Z' }),
    makeExpense({
      date: '2026-08-02',
      amountCents: 3_000,
      source: 'recurring',
      recurringId: 'r-palestra',
      deletedAt: '2026-08-02T10:00:00.000Z',
    }),
  ]

  it('countsTowardBudget: fuori le cancellate, fuori le ricorrenti', () => {
    expect(countsTowardBudget(spese[0]!)).toBe(true)
    expect(countsTowardBudget(spese[1]!)).toBe(false)
    expect(countsTowardBudget(spese[2]!)).toBe(false)
    expect(countsTowardBudget(spese[3]!)).toBe(false)
  })

  it('budgetSpent conta solo le manuali vive; recurringSpent solo le generate vive', () => {
    expect(budgetSpent(spese, agosto)).toBe(4_000)
    expect(recurringSpent(spese, agosto)).toBe(90_000)
  })

  it('un affitto da 900 non svuota la settimana da 200', () => {
    const budgets = [makeBudget({ period: 'weekly', amountCents: 20_000, effectiveFrom: '2026-08-01' })]
    const settimana = [
      // Il primo del mese cade in questa settimana: e' il giorno in cui, senza
      // ADR 016, la Home sarebbe stata catastrofica ogni singolo mese.
      makeExpense({
        date: '2026-08-31',
        amountCents: 90_000,
        source: 'recurring',
        recurringId: 'r-affitto',
      }),
      makeExpense({ date: '2026-09-01', amountCents: 2_500 }),
    ]
    const m = computeBudgetMetrics({
      expenses: settimana,
      budgets,
      period: 'weekly',
      onDate: '2026-09-01',
      today: '2026-09-01',
    })
    expect(m.range).toEqual({ start: '2026-08-31', end: '2026-09-06' })
    expect(m.spentCents).toBe(2_500)
    expect(m.remainingCents).toBe(17_500)
    // 17500 / 6 giorni rimanenti = 2916,66 -> 2916. Un numero che si guarda
    // ancora, che e' esattamente il punto dell'ADR.
    expect(m.daysRemaining).toBe(6)
    expect(m.dailyAllowanceCents).toBe(2_916)
    // E l'esclusione e' dichiarata, non taciuta.
    expect(m.recurringSpentCents).toBe(90_000)
  })

  it('senza ricorrenti nel periodo recurringSpentCents e zero: non c e niente da annunciare', () => {
    const m = computeBudgetMetrics({
      expenses: [makeExpense({ date: '2026-08-10', amountCents: 5_000 })],
      budgets: [makeBudget({ amountCents: 60_000, effectiveFrom: '2026-08-01' })],
      period: 'monthly',
      onDate: '2026-08-22',
      today: '2026-08-22',
    })
    expect(m.spentCents).toBe(5_000)
    expect(m.recurringSpentCents).toBe(0)
  })

  it('le ricorrenti non toccano nessuno degli altri numeri', () => {
    const budgets = [makeBudget({ amountCents: 60_000, effectiveFrom: '2026-08-01' })]
    const input = {
      budgets,
      period: 'monthly' as const,
      onDate: '2026-08-22',
      today: '2026-08-22',
    }
    const sole = [makeExpense({ date: '2026-08-10', amountCents: 5_000 })]
    const conFisse = [
      ...sole,
      makeExpense({
        date: '2026-08-01',
        amountCents: 90_000,
        source: 'recurring' as const,
        recurringId: 'r-affitto',
      }),
    ]
    const senza = computeBudgetMetrics({ ...input, expenses: sole })
    const con = computeBudgetMetrics({ ...input, expenses: conFisse })
    // Ogni campo identico tranne quello che dichiara l'esclusione.
    expect({ ...con, recurringSpentCents: 0 }).toEqual(senza)
  })

  it('una spesa generata e poi corretta a mano resta fuori: conta source, non l importo', () => {
    // L'utente ha corretto il canone a 920 sulla singola istanza. Resta una
    // spesa generata, quindi resta fuori dal budget: cambiare l'importo non
    // trasforma una fissa in una decisione.
    const corretta = makeExpense({
      date: '2026-08-01',
      amountCents: 92_000,
      source: 'recurring',
      recurringId: 'r-affitto',
      updatedAt: '2026-08-02T09:00:00.000Z',
    })
    expect(budgetSpent([corretta], agosto)).toBe(0)
    expect(recurringSpent([corretta], agosto)).toBe(92_000)
  })

  it('il filtro per categoria vale su entrambi i versanti', () => {
    const miste = [
      makeExpense({ date: '2026-08-03', amountCents: 4_000, categoryId: 'cat-cibo' }),
      makeExpense({ date: '2026-08-04', amountCents: 7_000, categoryId: 'cat-casa' }),
      makeExpense({
        date: '2026-08-01',
        amountCents: 90_000,
        categoryId: 'cat-casa',
        source: 'recurring',
        recurringId: 'r-affitto',
      }),
    ]
    expect(budgetSpent(miste, agosto, 'cat-casa')).toBe(7_000)
    expect(recurringSpent(miste, agosto, 'cat-casa')).toBe(90_000)
    expect(recurringSpent(miste, agosto, 'cat-cibo')).toBe(0)
  })
})
