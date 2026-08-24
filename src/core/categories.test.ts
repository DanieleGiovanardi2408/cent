import { describe, expect, it } from 'vitest'
import {
  MAX_ACTIVE_CATEGORIES,
  activeCategories,
  archivedCategories,
  freeCategorySlots,
  planCategoryDeletion,
  planCategoryPlacement,
} from './categories'
import { makeBudget, makeCategory, makeExpense, makeRule } from './testing'
import type { Category } from './types'

const T = '2026-08-23T12:00:00.000Z'

/** Otto in griglia, come al primo avvio: il tetto e' gia' pieno. */
function grigliaPiena(): Category[] {
  return ['Spesa', 'Fuori', 'Coffeeshop', 'Sigarette', 'Trasporti', 'Svago', 'Casa', 'Extra'].map(
    (name, i) => makeCategory({ id: `c-${i + 1}`, name, order: (i + 1) * 10 }),
  )
}

describe('la griglia e al massimo otto, sempre', () => {
  it('otto attive stanno tutte in griglia', () => {
    const cats = grigliaPiena()
    expect(activeCategories(cats)).toHaveLength(MAX_ACTIVE_CATEGORIES)
    expect(freeCategorySlots(cats)).toBe(0)
    expect(archivedCategories(cats)).toEqual([])
  })

  it('le archiviate non occupano posto, quante che siano', () => {
    const cats = [
      ...grigliaPiena().slice(0, 3),
      ...Array.from({ length: 40 }, (_, i) =>
        makeCategory({ id: `arc-${i}`, name: `Vecchia ${i}`, order: 500 + i, archived: true }),
      ),
    ]
    expect(activeCategories(cats)).toHaveLength(3)
    expect(freeCategorySlots(cats)).toBe(5)
    expect(archivedCategories(cats)).toHaveLength(40)
  })

  it('nove non archiviate non producono nove chip: la funzione e totale', () => {
    // Uno stato che il repository non sa produrre, ma che un JSON scritto a mano
    // puo' consegnare. La griglia deve restare 4x2 senza lanciare.
    const cats = [...grigliaPiena(), makeCategory({ id: 'c-9', name: 'Nona', order: 90 })]
    const attive = activeCategories(cats)

    expect(attive).toHaveLength(MAX_ACTIVE_CATEGORIES)
    expect(attive.some((c) => c.id === 'c-9')).toBe(false)
    // Non sparisce: sta con le altre fuori dalla griglia, finche' qualcuno non
    // la archivia davvero.
    expect(archivedCategories(cats).map((c) => c.id)).toEqual(['c-9'])
    expect(freeCategorySlots(cats)).toBe(0)
  })

  it('a parita di order l ordine non dipende da come arrivano i record', () => {
    const a = makeCategory({ id: 'b', name: 'B', order: 10, createdAt: '2026-01-02T00:00:00.000Z' })
    const b = makeCategory({ id: 'a', name: 'A', order: 10, createdAt: '2026-01-01T00:00:00.000Z' })
    expect(activeCategories([a, b]).map((c) => c.id)).toEqual(['a', 'b'])
    expect(activeCategories([b, a]).map((c) => c.id)).toEqual(['a', 'b'])

    // Anche `createdAt` pari: resta l'id, che non ha significato di dominio ed
    // esiste solo perche' il pareggio non diventi un caso indefinito.
    const x = makeCategory({ id: 'z', name: 'Z', order: 10 })
    const y = makeCategory({ id: 'k', name: 'K', order: 10 })
    expect(activeCategories([x, y]).map((c) => c.id)).toEqual(['k', 'z'])
    expect(activeCategories([y, x]).map((c) => c.id)).toEqual(['k', 'z'])
  })

  it('non muta l elenco che riceve', () => {
    const cats = grigliaPiena().reverse()
    const copia = [...cats]
    activeCategories(cats)
    expect(cats).toEqual(copia)
  })
})

describe('lo scambio: il percorso normale, non il caso limite', () => {
  it('griglia piena senza sostituzione: rifiutata, e il motivo e la domanda da fare', () => {
    const esito = planCategoryPlacement(grigliaPiena(), {
      incoming: { kind: 'new', id: 'nuova', name: 'Musei', emoji: '🏛️', color: '#123456' },
      timestamp: T,
    })
    expect(esito).toEqual({ ok: false, reason: 'grid-full' })
  })

  it('una esce e una entra, nella stessa cella e nella stessa scrittura', () => {
    const esito = planCategoryPlacement(grigliaPiena(), {
      incoming: { kind: 'new', id: 'nuova', name: 'Musei', emoji: '🏛️', color: '#123456' },
      replacing: 'c-4',
      timestamp: T,
    })

    expect(esito.ok).toBe(true)
    if (!esito.ok) return
    expect(esito.placed.order).toBe(40)
    expect(esito.placed.createdAt).toBe(T)
    expect(esito.archived?.id).toBe('c-4')
    expect(esito.archived?.archived).toBe(true)
    // Due record, un batch: se fossero due scritture, un'interruzione fra le due
    // lascerebbe sette categorie in griglia.
    expect(esito.written).toHaveLength(2)
    expect(esito.written[0]?.id).toBe('c-4')
  })

  it('il conto torna: dopo lo scambio le attive sono ancora otto', () => {
    const prima = grigliaPiena()
    const esito = planCategoryPlacement(prima, {
      incoming: { kind: 'new', id: 'nuova', name: 'Musei', emoji: '🏛️', color: '#123456' },
      replacing: 'c-4',
      timestamp: T,
    })
    if (!esito.ok) throw new Error('atteso ok')
    const dopo = [...prima.filter((c) => c.id !== 'c-4'), ...esito.written]
    expect(activeCategories(dopo)).toHaveLength(MAX_ACTIVE_CATEGORIES)
    expect(dopo.filter((c) => !c.archived)).toHaveLength(MAX_ACTIVE_CATEGORIES)
  })

  it('con un posto libero non serve sostituire, e la nuova va in fondo', () => {
    const cats = grigliaPiena().slice(0, 7)
    const esito = planCategoryPlacement(cats, {
      incoming: { kind: 'new', id: 'nuova', name: 'Musei', emoji: '🏛️', color: '#123456' },
      timestamp: T,
    })
    expect(esito.ok === true && esito.placed.order).toBe(80)
    expect(esito.ok === true && esito.archived).toBeNull()
  })

  it('su un archivio vuoto la prima categoria parte da 10', () => {
    const esito = planCategoryPlacement([], {
      incoming: { kind: 'new', id: 'nuova', name: 'Musei', emoji: '🏛️', color: '#123456' },
      timestamp: T,
    })
    expect(esito.ok === true && esito.placed.order).toBe(10)
  })

  it('una archiviata torna in griglia conservando nome, colore e data di nascita', () => {
    const cats = [
      ...grigliaPiena(),
      makeCategory({
        id: 'vecchia',
        name: 'Palestra',
        color: '#abcdef',
        archived: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ]
    const esito = planCategoryPlacement(cats, {
      incoming: { kind: 'existing', id: 'vecchia' },
      replacing: 'c-4',
      timestamp: T,
    })

    expect(esito.ok).toBe(true)
    if (!esito.ok) return
    expect(esito.placed.name).toBe('Palestra')
    expect(esito.placed.color).toBe('#abcdef')
    expect(esito.placed.createdAt).toBe('2026-01-01T00:00:00.000Z')
    expect(esito.placed.archived).toBe(false)
    expect(esito.placed.updatedAt).toBe(T)
  })

  it('gli scambi impossibili si nominano, uno per uno', () => {
    const cats = [...grigliaPiena(), makeCategory({ id: 'arc', name: 'Arc', archived: true })]
    const base = { timestamp: T } as const

    expect(
      planCategoryPlacement(cats, {
        ...base,
        incoming: { kind: 'existing', id: 'mai-vista' },
        replacing: 'c-1',
      }),
    ).toEqual({ ok: false, reason: 'unknown-category' })

    expect(
      planCategoryPlacement(cats, {
        ...base,
        incoming: { kind: 'existing', id: 'c-1' },
        replacing: 'c-2',
      }),
    ).toEqual({ ok: false, reason: 'already-active' })

    expect(
      planCategoryPlacement(cats, {
        ...base,
        incoming: { kind: 'new', id: 'x', name: 'X', emoji: '🔖', color: '#000000' },
        replacing: 'mai-vista',
      }),
    ).toEqual({ ok: false, reason: 'unknown-replacement' })

    // Archiviare cio' che e' gia' in archivio non libera nessuna cella.
    expect(
      planCategoryPlacement(cats, {
        ...base,
        incoming: { kind: 'new', id: 'x', name: 'X', emoji: '🔖', color: '#000000' },
        replacing: 'arc',
      }),
    ).toEqual({ ok: false, reason: 'replacement-not-active' })

    expect(
      planCategoryPlacement(cats, {
        ...base,
        incoming: { kind: 'new', id: 'c-1', name: 'X', emoji: '🔖', color: '#000000' },
        replacing: 'c-2',
      }),
    ).toEqual({ ok: false, reason: 'duplicate-id' })
  })

  it('da dati gia illegali si puo solo scendere, mai salire', () => {
    // Dieci non archiviate arrivate da chissa' dove. Uno scambio le lascerebbe
    // dieci, quindi viene rifiutato: la via d'uscita e' archiviare.
    const cats = [
      ...grigliaPiena(),
      makeCategory({ id: 'c-9', name: 'Nona', order: 90 }),
      makeCategory({ id: 'c-10', name: 'Decima', order: 100 }),
    ]
    const esito = planCategoryPlacement(cats, {
      incoming: { kind: 'new', id: 'nuova', name: 'Musei', emoji: '🏛️', color: '#123456' },
      replacing: 'c-1',
      timestamp: T,
    })
    expect(esito).toEqual({ ok: false, reason: 'grid-full' })
  })

  it('non muta l elenco che riceve', () => {
    const cats = grigliaPiena()
    const copia = structuredClone(cats)
    planCategoryPlacement(cats, {
      incoming: { kind: 'new', id: 'nuova', name: 'Musei', emoji: '🏛️', color: '#123456' },
      replacing: 'c-4',
      timestamp: T,
    })
    expect(cats).toEqual(copia)
  })
})

describe('cancellare davvero: solo se nessuno la nomina', () => {
  const cats = grigliaPiena()

  it('nessun riferimento: si puo', () => {
    expect(planCategoryDeletion(cats, [], [], [], { id: 'c-4' })).toEqual({
      ok: true,
      deleted: cats.find((c) => c.id === 'c-4'),
    })
  })

  it('le spese cancellate contano quanto quelle vive', () => {
    const spese = [
      makeExpense({ date: '2026-08-01', categoryId: 'c-4' }),
      makeExpense({ date: '2026-08-02', categoryId: 'c-4', deletedAt: '2026-08-02T10:00:00.000Z' }),
      makeExpense({ date: '2026-08-03', categoryId: 'c-1' }),
    ]
    expect(planCategoryDeletion(cats, spese, [], [], { id: 'c-4' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 2,
      recurringRules: 0,
      budgets: 0,
    })
  })

  it('una regola ricorrente basta da sola', () => {
    const regole = [makeRule({ startDate: '2026-01-01', categoryId: 'c-4' })]
    expect(planCategoryDeletion(cats, [], regole, [], { id: 'c-4' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 0,
      recurringRules: 1,
      budgets: 0,
    })
  })

  /*
   * I tre test qui sotto sono il quarto tipo di record che puo' nominare una
   * categoria, e mancava. Non e' raggiungibile dalla UI di oggi — il foglio del
   * budget non scrive `categoryId` — ma lo diventa con l'import della fase 7:
   * un file con un budget di categoria, quella categoria cancellata, e resta un
   * record che punta a un id inesistente. Nessuna schermata puo' mostrarlo ne'
   * toglierlo, e `resolveBudget` continuerebbe a sceglierlo per sempre.
   */

  it('un budget di categoria basta da solo, come una regola', () => {
    const budgets = [
      makeBudget({ effectiveFrom: '2026-08-01', amountCents: 30_000, categoryId: 'c-4' }),
    ]
    expect(planCategoryDeletion(cats, [], [], budgets, { id: 'c-4' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 0,
      recurringRules: 0,
      budgets: 1,
    })
  })

  it('un budget chiuso conta quanto uno in vigore', () => {
    // Stessa ragione delle spese cancellate: un budget storicizzato resta
    // nell'export ed e' la spiegazione di un periodo gia' passato.
    const budgets = [
      makeBudget({
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-02-28',
        amountCents: 20_000,
        categoryId: 'c-4',
      }),
    ]
    expect(planCategoryDeletion(cats, [], [], budgets, { id: 'c-4' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 0,
      recurringRules: 0,
      budgets: 1,
    })
  })

  it('il budget generale non nomina nessuna categoria, quindi non trattiene niente', () => {
    // Il budget senza `categoryId` e' quello che la UI di oggi scrive davvero:
    // se trattenesse una cancellazione, nessuna categoria sarebbe piu'
    // cancellabile dal momento in cui si imposta un budget.
    const budgets = [makeBudget({ effectiveFrom: '2026-08-01', amountCents: 80_000 })]
    expect(planCategoryDeletion(cats, [], [], budgets, { id: 'c-4' }).ok).toBe(true)
  })

  it('i quattro conteggi arrivano insieme, non uno alla volta', () => {
    // Il rifiuto porta i numeri da mostrare: la UI dice "3 spese, 1 regola e 2
    // budget la usano", e per dirlo deve averli tutti in una risposta sola.
    const spese = [
      makeExpense({ date: '2026-08-01', categoryId: 'c-4' }),
      makeExpense({ date: '2026-08-02', categoryId: 'c-4' }),
      makeExpense({ date: '2026-08-03', categoryId: 'c-4', deletedAt: '2026-08-03T09:00:00.000Z' }),
    ]
    const regole = [makeRule({ startDate: '2026-01-01', categoryId: 'c-4' })]
    const budgets = [
      makeBudget({ effectiveFrom: '2026-01-01', amountCents: 10_000, categoryId: 'c-4' }),
      makeBudget({ effectiveFrom: '2026-02-01', amountCents: 12_000, categoryId: 'c-4' }),
      makeBudget({ effectiveFrom: '2026-03-01', amountCents: 12_000, categoryId: 'c-1' }),
    ]
    expect(planCategoryDeletion(cats, spese, regole, budgets, { id: 'c-4' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 3,
      recurringRules: 1,
      budgets: 2,
    })
  })

  it('archiviata ma inutilizzata si cancella comunque: sono due cose diverse', () => {
    const conArchiviata = [...cats, makeCategory({ id: 'arc', name: 'Arc', archived: true })]
    expect(planCategoryDeletion(conArchiviata, [], [], [], { id: 'arc' }).ok).toBe(true)
  })

  it('un id che non esiste e una risposta, non un errore', () => {
    expect(planCategoryDeletion(cats, [], [], [], { id: 'mai-vista' })).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })
})
