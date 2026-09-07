import { describe, expect, it } from 'vitest'
import {
  MAX_ACTIVE_CATEGORIES,
  activeCategories,
  archivedCategories,
  freeCategorySlots,
  planCategoryDeletion,
  planCategoryPlacement,
} from './categories'
import { makeCategory, makeExpense, makeRule } from './testing'
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
    expect(planCategoryDeletion(cats, [], [], { id: 'c-4' })).toEqual({
      ok: true,
      deleted: cats.find((c) => c.id === 'c-4'),
    })
  })

  it('le spese cancellate bloccano ma non si contano: il numero e quello dello Storico', () => {
    // La lapide trattiene la categoria — `restoreExpense` la riporta in vita in
    // un tap, e la riga che torna dereferenzia `categoryId` — ma **non entra nel
    // numero**: nessuna schermata mostra le spese cancellate, e un rifiuto che
    // dicesse "2" davanti a uno Storico che ne mostra 1 e' un no non
    // verificabile.
    const spese = [
      makeExpense({ date: '2026-08-01', categoryId: 'c-4' }),
      makeExpense({ date: '2026-08-02', categoryId: 'c-4', deletedAt: '2026-08-02T10:00:00.000Z' }),
      makeExpense({ date: '2026-08-03', categoryId: 'c-1' }),
    ]
    expect(planCategoryDeletion(cats, spese, [], { id: 'c-4' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 1,
      recurringRules: 0,
    })
  })

  it('sole lapidi: si cancella, perche la riga che tornerebbe non e rotta', () => {
    // Prima qui c'era un rifiuto (`deleted-only`), e l'argomento era che la
    // spesa ripristinata avrebbe avuto un `categoryId` orfano — *"non un orfano
    // inerte: una riga rotta e visibile"*.
    //
    // L'argomento era falso. Tutti e quattro i posti che mostrano la categoria
    // di una spesa — `ExpenseRow`, `ExpenseActions`, `AmountSheet`,
    // `FixedCosts` — hanno gia' `category?.name ?? t('row.categoryRemoved')`, e
    // quel ramo e' gia' raggiungibile: `parseBackup` importa di proposito le
    // spese orfane, con un avviso.
    //
    // Quindi la cosa da togliere era il rifiuto, non il numero dentro la frase:
    // *"ci sono spese cancellate che la usano"* resta un fatto che l'utente non
    // puo' verificare anche senza cifre.
    const spese = [
      makeExpense({ date: '2026-08-01', categoryId: 'c-4', deletedAt: '2026-08-01T10:00:00.000Z' }),
      makeExpense({ date: '2026-08-02', categoryId: 'c-4', deletedAt: '2026-08-02T10:00:00.000Z' }),
    ]
    const esito = planCategoryDeletion(cats, spese, [], { id: 'c-4' })
    expect(esito.ok).toBe(true)
    expect(esito.ok === true && esito.deleted.id).toBe('c-4')
  })

  it('caso misto: 1 viva e 2 lapidi danno in-use con 1, cioe il numero che lo Storico mostra', () => {
    // Il rifiuto resta dove c'e' qualcosa di visibile, e cita **uno**, non tre:
    // il numero delle lapidi non e' riconciliabile con nessuna schermata.
    const spese = [
      makeExpense({ date: '2026-08-01', categoryId: 'c-4' }),
      makeExpense({ date: '2026-08-02', categoryId: 'c-4', deletedAt: '2026-08-02T10:00:00.000Z' }),
      makeExpense({ date: '2026-08-03', categoryId: 'c-4', deletedAt: '2026-08-03T10:00:00.000Z' }),
    ]
    expect(planCategoryDeletion(cats, spese, [], { id: 'c-4' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 1,
      recurringRules: 0,
    })
  })

  it('lapidi piu una regola: in-use, e il numero visibile e quello della regola', () => {
    // Cio' che blocca in modo visibile ha la precedenza: `expenses: 0` e'
    // corretto — di spese nello Storico non ce n'e' nessuna — e la frase la
    // regge la regola, che in Impostazioni si vede.
    const spese = [
      makeExpense({ date: '2026-08-01', categoryId: 'c-4', deletedAt: '2026-08-01T10:00:00.000Z' }),
    ]
    const regole = [makeRule({ startDate: '2026-01-01', categoryId: 'c-4' })]
    expect(planCategoryDeletion(cats, spese, regole, { id: 'c-4' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 0,
      recurringRules: 1,
    })
  })

  it('una regola ricorrente basta da sola', () => {
    const regole = [makeRule({ startDate: '2026-01-01', categoryId: 'c-4' })]
    expect(planCategoryDeletion(cats, [], regole, { id: 'c-4' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 0,
      recurringRules: 1,
    })
  })

  it('i due conteggi arrivano insieme, non uno alla volta', () => {
    // Il rifiuto porta i numeri da mostrare: la UI dice "2 spese e 1 regola la
    // usano", e per dirlo deve averli tutti in una risposta sola. La terza
    // spesa e' una lapide e resta fuori dal conteggio.
    //
    // I budget non sono piu' fra i record che possono nominare una categoria:
    // `Budget.categoryId` aveva zero produttori ed e' stato tolto, quindi
    // `usedByBudgets` valeva zero a ogni chiamata — un ramo che nessuna
    // schermata poteva raggiungere, e tre test che lo tenevano in vita.
    const spese = [
      makeExpense({ date: '2026-08-01', categoryId: 'c-4' }),
      makeExpense({ date: '2026-08-02', categoryId: 'c-4' }),
      makeExpense({ date: '2026-08-03', categoryId: 'c-4', deletedAt: '2026-08-03T09:00:00.000Z' }),
    ]
    const regole = [makeRule({ startDate: '2026-01-01', categoryId: 'c-4' })]
    expect(planCategoryDeletion(cats, spese, regole, { id: 'c-4' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 2,
      recurringRules: 1,
    })
  })

  it('archiviata ma inutilizzata si cancella comunque: sono due cose diverse', () => {
    const conArchiviata = [...cats, makeCategory({ id: 'arc', name: 'Arc', archived: true })]
    expect(planCategoryDeletion(conArchiviata, [], [], { id: 'arc' }).ok).toBe(true)
  })

  it('un id che non esiste e una risposta, non un errore', () => {
    expect(planCategoryDeletion(cats, [], [], { id: 'mai-vista' })).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })
})

describe('cancellare davvero: il pavimento della griglia', () => {
  it('otto cancellazioni di fila si fermano alla settima: l ultima resta', () => {
    // Il difetto, misurato: su un'installazione appena aperta — zero spese,
    // zero regole — la condizione sui record e' vera per tutte e otto. Senza
    // pavimento la griglia si svuota in otto tap, e da li' non si puo' piu'
    // inserire nessuna spesa: il salvataggio **e'** il tap sulla categoria.
    let rimaste: Category[] = grigliaPiena()
    const esiti: string[] = []
    for (const target of grigliaPiena()) {
      const esito = planCategoryDeletion(rimaste, [], [], { id: target.id })
      esiti.push(esito.ok ? 'ok' : esito.reason)
      if (esito.ok) rimaste = rimaste.filter((c) => c.id !== target.id)
    }

    expect(esiti).toEqual([...Array(7).fill('ok'), 'last-active'])
    expect(activeCategories(rimaste)).toHaveLength(1)
  })

  it('il rifiuto non porta nessun numero: il fatto lo dice la griglia', () => {
    // "E' l'ultima" e' l'unico fatto di questa funzione che si vede senza
    // andare da nessuna parte — sta a schermo, dietro al foglio. Un numero qui
    // sarebbe una cifra in piu' da riconciliare per dire cio' che si conta a
    // occhio.
    const una = [makeCategory({ id: 'sola', name: 'Sola', order: 10 })]
    expect(planCategoryDeletion(una, [], [], { id: 'sola' })).toEqual({
      ok: false,
      reason: 'last-active',
    })
  })

  it('e l ultima ATTIVA, non l ultima in assoluto: le archiviate non fanno pavimento', () => {
    // Le due formulazioni divergono qui, e "in assoluto" sarebbe piu' debole
    // **proprio dove serve di piu'**: con una attiva e tre archiviate,
    // cancellare l'unica attiva lascia tre record. `openRepository` non
    // risemina (guarda i record, non i chip) e `parseBackup` accetta (conta i
    // record, archiviate comprese). E' lo stato rotto che nessun'altra porta
    // prende.
    const cats = [
      makeCategory({ id: 'attiva', name: 'Attiva', order: 10 }),
      makeCategory({ id: 'arc-1', name: 'Vecchia 1', order: 20, archived: true }),
      makeCategory({ id: 'arc-2', name: 'Vecchia 2', order: 30, archived: true }),
      makeCategory({ id: 'arc-3', name: 'Vecchia 3', order: 40, archived: true }),
    ]
    expect(planCategoryDeletion(cats, [], [], { id: 'attiva' })).toEqual({
      ok: false,
      reason: 'last-active',
    })
    // E l'archivio resta cancellabile: non toglie nessun chip.
    expect(planCategoryDeletion(cats, [], [], { id: 'arc-2' }).ok).toBe(true)
  })

  it('a griglia gia vuota il pavimento non blocca la pulizia dell archivio', () => {
    // Il controllo rifiuta un **gesto** ("questa toglie l'ultimo chip"), non
    // uno **stato** ("dopo deve restarne almeno uno"). La seconda forma, in uno
    // stato gia' a zero attive — che un file importato puo' consegnare —
    // bloccherebbe anche le archiviate: una pulizia vietata per proteggere una
    // griglia che e' gia' vuota.
    const tutteArchiviate = grigliaPiena().map((c) => ({ ...c, archived: true }))
    expect(activeCategories(tutteArchiviate)).toEqual([])
    expect(planCategoryDeletion(tutteArchiviate, [], [], { id: 'c-3' }).ok).toBe(true)
  })

  it('il pavimento viene prima di in-use, perche il rimedio e un altro', () => {
    // Su un'ultima categoria che ha delle spese, `in-use` direbbe
    // "archiviala": un consiglio che produce lo stesso stato rotto passando
    // dall'altra porta. Chi guarda l'ultima ha un rimedio solo — prima
    // un'altra, poi questa — e l'esito deve dire quello.
    const una = [makeCategory({ id: 'sola', name: 'Sola', order: 10 })]
    const spese = [makeExpense({ date: '2026-08-01', categoryId: 'sola' })]
    const regole = [makeRule({ startDate: '2026-01-01', categoryId: 'sola' })]
    expect(planCategoryDeletion(una, spese, regole, { id: 'sola' })).toEqual({
      ok: false,
      reason: 'last-active',
    })
  })

  it('un id che non esiste resta unknown anche quando la griglia ha una sola casella', () => {
    // L'ordine dei controlli non e' libero in quel verso: senza un bersaglio
    // non c'e' nessun gesto da valutare.
    const una = [makeCategory({ id: 'sola', name: 'Sola', order: 10 })]
    expect(planCategoryDeletion(una, [], [], { id: 'mai-vista' })).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('la nona non e in griglia, quindi cancellarla non tocca nessun pavimento', () => {
    // `activeCategories` taglia al tetto: la nona si comporta come archiviata,
    // e il pavimento la vede cosi'. E' la stessa totalita' che regge la griglia
    // davanti a dati illegali.
    const cats = [...grigliaPiena(), makeCategory({ id: 'c-9', name: 'Nona', order: 90 })]
    expect(planCategoryDeletion(cats, [], [], { id: 'c-9' }).ok).toBe(true)
  })
})
