import { describe, expect, it } from 'vitest'
import { makeBudget, makeCategory, makeExpense } from '../core/testing'
import type { Budget, Category, Expense, RecurringRule } from '../core/types'
import { BREAKDOWN_MIN_ROWS, TREND_PERIODS, breakdownTotal, statsView, trendRanges } from './stats-view'
import type { StatsInput } from './stats-view'

/*
 * ## Come si testa un grafico, in questo progetto
 *
 * **Si asserisce la geometria contro i dati, non la presenza degli elementi.**
 * Un test che conta i `<rect>` e' verde anche se le barre sono tutte alte
 * uguali. Qui il rapporto fra le frazioni deve essere il rapporto fra i valori,
 * e ogni caso ha almeno un'asserzione che **cadrebbe** se il modulo disegnasse
 * il caso sbagliato.
 *
 * Le mutazioni provate a mano su questo file, tutte prese: barre tutte uguali,
 * traccia disegnata sempre, soglia del grafico ignorata, categorie a zero
 * incluse, lapidi contate.
 */

const CIBO: Category = makeCategory({ id: 'c-cibo', name: 'Fuori', color: '#f26b00' })
const SPESA: Category = makeCategory({ id: 'c-spesa', name: 'Spesa', color: '#81a369' })
const CASA: Category = makeCategory({ id: 'c-casa', name: 'Casa', color: '#bc85ec' })
const CATS = [CIBO, SPESA, CASA]

/** Mercoledi 26 agosto 2026. La settimana e' 24-30. */
const OGGI = '2026-08-26'

function view(over: Partial<StatsInput>) {
  return statsView({
    expenses: [],
    categories: CATS,
    rules: [] as readonly RecurringRule[],
    budgets: [] as readonly Budget[],
    period: 'weekly',
    day: OGGI,
    ...over,
  })
}

describe('lo stato vuoto', () => {
  it('senza nessuna spesa la schermata e vuota, non un grafico da zero', () => {
    expect(view({}).kind).toBe('blank')
  })

  it('una spesa cancellata non fa uscire dal vuoto', () => {
    const v = view({
      expenses: [makeExpense({ date: OGGI, categoryId: 'c-cibo', deletedAt: '2026-08-26T10:00:00Z' })],
    })
    // Se le lapidi contassero, questo sarebbe 'ready' con una riga da 10,00
    // che nello Storico non si vede.
    expect(v.kind).toBe('blank')
  })
})

describe('A — dove sono finiti i soldi', () => {
  const spese: readonly Expense[] = [
    makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 4000 }),
    makeExpense({ date: '2026-08-25', categoryId: 'c-spesa', amountCents: 2000 }),
    makeExpense({ date: '2026-08-24', categoryId: 'c-casa', amountCents: 1000 }),
  ]

  it('il rapporto fra le lunghezze e il rapporto fra gli importi', () => {
    const v = view({ expenses: spese })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    const [primo, secondo, terzo] = v.byCategory.rows
    expect(primo?.name).toBe('Fuori')
    // La piu' grande satura la scala.
    expect(primo?.fraction).toBe(1)
    // 2000 su 4000: **meta'**. Con barre tutte uguali questa cade.
    expect(secondo?.fraction).toBeCloseTo(0.5, 10)
    expect(terzo?.fraction).toBeCloseTo(0.25, 10)
    // E il rapporto e' quello dei centesimi, non un numero scelto a mano.
    expect((secondo?.fraction ?? 0) / (primo?.fraction ?? 1)).toBeCloseTo(2000 / 4000, 10)
  })

  it('una categoria senza spese non e una riga da zero: non c e', () => {
    const v = view({ expenses: [spese[0]!] })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    expect(v.byCategory.rows).toHaveLength(1)
    expect(v.byCategory.rows.map((r) => r.name)).not.toContain('Casa')
    // Otto righe da zero al primo avvio sarebbero un rettangolo con otto
    // etichette: e' il caso vuoto disegnato come grafico degenere.
    expect(v.byCategory.rows.every((r) => r.cents > 0)).toBe(true)
  })

  it('sotto tre categorie le righe restano e il grafico no', () => {
    const due = view({ expenses: spese.slice(0, 2) })
    if (due.kind !== 'ready') throw new Error('atteso ready')
    expect(due.byCategory.rows).toHaveLength(2)
    expect(due.byCategory.asChart).toBe(false)

    const tre = view({ expenses: spese })
    if (tre.kind !== 'ready') throw new Error('atteso ready')
    expect(tre.byCategory.rows).toHaveLength(BREAKDOWN_MIN_ROWS)
    expect(tre.byCategory.asChart).toBe(true)
  })

  it('le ricorrenti non entrano nella ripartizione (ADR 016)', () => {
    const v = view({
      expenses: [
        ...spese,
        makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 90000, source: 'recurring' }),
      ],
    })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    // Se entrasse, Casa sarebbe la prima riga e saturerebbe la scala.
    expect(v.byCategory.rows[0]?.name).toBe('Fuori')
    expect(v.byCategory.rows.find((r) => r.name === 'Casa')?.cents).toBe(1000)
  })

  /*
   * **Identita' con la Home**, non due calcoli confrontati. La riga del periodo
   * corrente e il numero "speso" della Home sono la stessa quantita': se
   * divergessero, nessuno se ne accorgerebbe perche' entrambe sarebbero
   * "corrette".
   */
  it('la somma delle righe di A e esattamente lo speso del periodo', () => {
    const v = view({ expenses: spese })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    expect(breakdownTotal(v.byCategory)).toBe(v.current.spentCents)
    expect(v.tiles.variableCents).toBe(v.current.spentCents)
  })

  it('il colore della riga e quello che l utente ha scelto per il chip', () => {
    const v = view({ expenses: spese })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    expect(v.byCategory.rows.find((r) => r.name === 'Fuori')?.color).toBe(CIBO.color)
  })
})

describe('B — spese si, budget no', () => {
  const spese: readonly Expense[] = [
    makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 4000 }),
    makeExpense({ date: '2026-08-19', categoryId: 'c-spesa', amountCents: 8000 }),
  ]

  it('senza budget nessuna riga ha una traccia', () => {
    const v = view({ expenses: spese })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    expect(v.byPeriod.rows.length).toBeGreaterThan(0)
    // Una traccia senza budget sarebbe un tetto da zero euro, cioe' un numero
    // inventato. Se la traccia si disegnasse sempre, questa cade.
    expect(v.byPeriod.rows.every((row) => row.track === null)).toBe(true)
  })

  it('le lunghezze restano confrontabili anche senza traccia', () => {
    const v = view({ expenses: spese })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    const corrente = v.byPeriod.rows.find((r) => r.current)
    const precedente = v.byPeriod.rows.find((r) => !r.current && r.cents > 0)
    expect(corrente?.cents).toBe(4000)
    expect(precedente?.cents).toBe(8000)
    // 4000 contro 8000 su una scala sola: meta'.
    expect(precedente?.fraction).toBe(1)
    expect(corrente?.fraction).toBeCloseTo(0.5, 10)
  })

  it('i periodi prima della prima spesa non sono righe da zero', () => {
    const v = view({ expenses: [spese[0]!] })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    // Un periodo prima che l'app esistesse non e' "zero speso".
    expect(v.byPeriod.rows).toHaveLength(1)
    expect(v.byPeriod.asChart).toBe(false)
  })

  it('con un periodo solo non e un grafico', () => {
    const v = view({ expenses: [spese[0]!] })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    expect(v.byPeriod.asChart).toBe(false)
  })

  it('la riga corrente e l ultima, ed e quella che contiene oggi', () => {
    const v = view({ expenses: spese })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    const rows = v.byPeriod.rows
    expect(rows[rows.length - 1]?.current).toBe(true)
    expect(rows[rows.length - 1]?.range).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    expect(rows.filter((r) => r.current)).toHaveLength(1)
  })
})

describe('la finestra dei periodi', () => {
  it('sono otto, contigui, e l ultimo contiene oggi', () => {
    const ranges = trendRanges('weekly', OGGI)
    expect(ranges).toHaveLength(TREND_PERIODS)
    expect(ranges[TREND_PERIODS - 1]).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    for (let i = 1; i < ranges.length; i += 1) {
      // Contigui davvero: nessun giorno fra la fine di uno e l'inizio del dopo.
      const prima = ranges[i - 1]!
      const dopo = ranges[i]!
      expect(new Date(dopo.start).getTime() - new Date(prima.end).getTime()).toBe(86400000)
    }
  })

  it('i mesi non hanno tutti la stessa lunghezza, e i confini vengono da periodRange', () => {
    const ranges = trendRanges('monthly', '2026-03-15')
    expect(ranges[TREND_PERIODS - 1]).toEqual({ start: '2026-03-01', end: '2026-03-31' })
    // Febbraio 2026: 28 giorni. Se si camminasse a passi di 30 giorni, questo
    // confine sarebbe sbagliato.
    expect(ranges[TREND_PERIODS - 2]).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})

describe('C — le due cifre in testa', () => {
  it('senza spese fisse la seconda cifra non si mostra', () => {
    const v = view({ expenses: [makeExpense({ date: OGGI, categoryId: 'c-cibo' })] })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    expect(v.tiles.hasFixed).toBe(false)
    expect(v.tiles.fixedMonthlyCents).toBe(0)
  })

  it('il budget non serve per rispondere a C', () => {
    const v = view({
      expenses: [makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 4000 })],
      budgets: [],
    })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    // E' l'unica delle tre domande a cui l'app risponde dal primo giorno.
    expect(v.tiles.variableCents).toBe(4000)
  })
})

describe('la traccia esiste solo dove il confronto ha una risposta', () => {
  const spesa = makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 4000 })

  it('con un budget che copre tutto il periodo la traccia c e', () => {
    const v = view({
      expenses: [spesa],
      budgets: [makeBudget({ period: 'weekly', effectiveFrom: '2026-08-01', amountCents: 20000 })],
    })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    const corrente = v.byPeriod.rows.find((r) => r.current)
    expect(corrente?.track).not.toBeNull()
    // 3 giorni su 7 vissuti: il maturato e 200 x 3/7 = 85,71.
    expect(corrente?.track?.accruedCents).toBe(8571)
    expect(corrente?.track?.livedFraction).toBeCloseTo(3 / 7, 10)
  })

  it('con un budget nato dentro il periodo la traccia non c e', () => {
    const v = view({
      expenses: [spesa],
      budgets: [makeBudget({ period: 'weekly', effectiveFrom: '2026-08-26', amountCents: 20000 })],
    })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    const corrente = v.byPeriod.rows.find((r) => r.current)
    // Il budget si risolve (200) e la traccia comunque non si disegna: e' la
    // differenza fra "c'e' un budget" e "il confronto ha una risposta".
    expect(corrente?.track).toBeNull()
  })
})
