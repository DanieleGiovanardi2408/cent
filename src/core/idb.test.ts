/**
 * I test di `idb.ts`, cioe' dell'unico file che tocca il disco davvero.
 *
 * Girano su `fake-indexeddb` (ADR 001): non su un doppio scritto da noi. E' la
 * differenza fra verificare IndexedDB e verificare il nostro sostituto, e conta
 * per le tre cose che qui non si possono sbagliare — l'atomicita' delle
 * transazioni, le migrazioni di schema, e il comportamento con **due contesti
 * aperti sullo stesso database**, che e' il setup reale della PWA installata
 * mentre una scheda Safari sullo stesso sito e' ancora viva.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { createIdbPersistence, openCentDatabase } from './idb'
import { MIGRATIONS, SCHEMA_VERSION } from './schema'
import type { MigrationStep } from './schema'
import { openRepository } from './repository'
import type { Persistence, WriteBatch } from './persistence'
import { recurringExpenseId } from './recurrence'
import {
  creaRegola,
  makeBudget,
  makeCategory,
  makeExpense,
  makeRule,
  makeSettings,
  sequentialIds,
  TEST_CATEGORY_NAMES,
  tickingClock,
} from './testing'
import type { Expense } from './types'
import type { RecurringMarkerAdvance } from './persistence'

/** Un avanzamento di segnaposto qualsiasi, per non ripeterlo in ogni test. */
const MARKER: RecurringMarkerAdvance = {
  id: 'r-1',
  lastMaterializedDate: '2026-08-10',
  updatedAt: '2026-08-10T00:00:00.000Z',
}

let counter = 0
/** Un database per test: nessuno eredita lo stato di nessun altro. */
function dbName(): string {
  counter += 1
  return `cent-test-${counter}`
}

function expense(fields: Partial<Expense> & { date: string }): Expense {
  return makeExpense(fields)
}

describe('scrittura e rilettura', () => {
  it('quello che scrive esce identico, e le spese tornano ordinate per data', async () => {
    const persistence = createIdbPersistence({ name: dbName() })
    await persistence.write({
      settings: makeSettings(),
      expenses: [
        expense({ id: 'e-3', date: '2026-08-22', amountCents: 300 }),
        expense({ id: 'e-1', date: '2026-08-01', amountCents: 100 }),
        expense({ id: 'e-2', date: '2026-08-10', amountCents: 200, note: 'Caffe' }),
      ],
    })

    const loaded = await persistence.loadAll()
    expect(loaded.expenses.map((e) => e.id)).toEqual(['e-1', 'e-2', 'e-3'])
    expect(loaded.expenses[1]?.note).toBe('Caffe')
    expect(loaded.settings?.weekStartsOn).toBe(1)
    persistence.close()
  })

  it('un database mai inizializzato dice settings null invece di inventarsele', async () => {
    const persistence = createIdbPersistence({ name: dbName() })
    const loaded = await persistence.loadAll()
    expect(loaded.settings).toBeNull()
    expect(loaded.expenses).toEqual([])
    persistence.close()
  })
})

describe('atomicita della transazione', () => {
  it('se un record del batch non e scrivibile non si scrive nemmeno gli altri', async () => {
    const name = dbName()
    const persistence = createIdbPersistence({ name })
    await persistence.write({ settings: makeSettings() })

    // Una funzione non passa lo structured clone: IndexedDB rifiuta il record e
    // abortisce la transazione. E' il modo piu' onesto di far fallire una
    // scrittura vera senza istruire la nostra implementazione a fallire.
    const impossibile = {
      ...expense({ id: 'e-rotta', date: '2026-08-02' }),
      note: (() => 'niente') as unknown as string,
    }

    await expect(
      persistence.write({
        expenses: [expense({ id: 'e-buona', date: '2026-08-01' }), impossibile],
      }),
    ).rejects.toBeTruthy()

    // Il perno dell'interrompibilita' delle ricorrenze: mezzo batch non esiste.
    const loaded = await persistence.loadAll()
    expect(loaded.expenses).toEqual([])
    persistence.close()
  })

  it('spese e regola di un blocco arrivano insieme o non arrivano', async () => {
    const name = dbName()
    const persistence = createIdbPersistence({ name })
    await persistence.write({ settings: makeSettings() })
    const rotta = {
      ...expense({ id: 'e-x', date: '2026-08-01' }),
      note: (() => '') as unknown as string,
    }
    await expect(
      persistence.write({
        addExpenses: [rotta],
        recurringRules: [
          {
            id: 'r-1',
            createdAt: '2020-01-01T00:00:00.000Z',
            updatedAt: '2020-01-01T00:00:00.000Z',
            amountCents: 900,
            categoryId: 'cat-1',
            cadence: 'daily',
            interval: 1,
            startDate: '2026-08-01',
            lastMaterializedDate: '2026-08-01',
            active: true,
          },
        ],
      }),
    ).rejects.toBeTruthy()

    const loaded = await persistence.loadAll()
    // Nessun segnaposto avanzato su spese che non ci sono.
    expect(loaded.recurringRules).toEqual([])
    expect(loaded.expenses).toEqual([])
    persistence.close()
  })
})

describe('semantica add: si salta, non si sovrascrive', () => {
  it('un id gia presente non viene riscritto e viene riportato fra i saltati', async () => {
    const persistence = createIdbPersistence({ name: dbName() })
    await persistence.write({
      addExpenses: [expense({ id: 'rec:r:2026-08-01', date: '2026-08-01', amountCents: 900 })],
    })

    const second = await persistence.write({
      addExpenses: [
        expense({ id: 'rec:r:2026-08-01', date: '2026-08-01', amountCents: 900 }),
        expense({ id: 'rec:r:2026-08-02', date: '2026-08-02', amountCents: 900 }),
      ],
    })

    expect(second.skippedIds).toEqual(['rec:r:2026-08-01'])
    const loaded = await persistence.loadAll()
    expect(loaded.expenses).toHaveLength(2)
    persistence.close()
  })

  it('la correzione dell utente sulla singola istanza sopravvive', async () => {
    const persistence = createIdbPersistence({ name: dbName() })
    const id = recurringExpenseId('r-canone', '2026-08-01')
    await persistence.write({ addExpenses: [expense({ id, date: '2026-08-01', amountCents: 90_000 })] })
    // L'utente corregge: 920 invece di 900. Questa e' una put, ed e' giusto.
    await persistence.write({ expenses: [expense({ id, date: '2026-08-01', amountCents: 92_000 })] })
    // Il catch-up successivo ripropone l'occorrenza con l'importo della regola.
    await persistence.write({ addExpenses: [expense({ id, date: '2026-08-01', amountCents: 90_000 })] })

    const loaded = await persistence.loadAll()
    expect(loaded.expenses).toHaveLength(1)
    expect(loaded.expenses[0]?.amountCents).toBe(92_000)
    persistence.close()
  })

  it('una spesa cancellata non viene resuscitata', async () => {
    const persistence = createIdbPersistence({ name: dbName() })
    const id = recurringExpenseId('r-canone', '2026-08-01')
    await persistence.write({ addExpenses: [expense({ id, date: '2026-08-01' })] })
    await persistence.write({
      expenses: [expense({ id, date: '2026-08-01', deletedAt: '2026-08-01T10:00:00.000Z' })],
    })
    await persistence.write({ addExpenses: [expense({ id, date: '2026-08-01' })] })

    const loaded = await persistence.loadAll()
    expect(loaded.expenses).toHaveLength(1)
    expect(loaded.expenses[0]?.deletedAt).toBe('2026-08-01T10:00:00.000Z')
    persistence.close()
  })

  it('due batch add paralleli sullo stesso id ne scrivono uno solo', async () => {
    // Controllo e inserimento stanno nella stessa transazione: IndexedDB
    // serializza le readwrite sullo stesso store, quindi fra i due non si
    // infila nessuno. Senza, questo test scriverebbe due volte.
    const name = dbName()
    const a = createIdbPersistence({ name })
    const b = createIdbPersistence({ name })
    const record = (): Expense => expense({ id: 'rec:r:2026-08-01', date: '2026-08-01' })

    const [ra, rb] = await Promise.all([
      a.write({ addExpenses: [record()] }),
      b.write({ addExpenses: [record()] }),
    ])

    expect(ra.skippedIds.length + rb.skippedIds.length).toBe(1)
    const loaded = await a.loadAll()
    expect(loaded.expenses).toHaveLength(1)
    a.close()
    b.close()
  })
})

describe('due contesti sullo stesso database', () => {
  it('due repository, due catch-up in parallelo: una spesa per giorno e basta', async () => {
    // La PWA aperta dalla Home Screen mentre una scheda Safari sullo stesso
    // sito e' ancora viva. Due mirror, due code di scrittura, due lock in
    // memoria che non si vedono fra loro, una sola IndexedDB. Prima di ADR 006
    // questo scenario produceva ogni giorno in doppia copia.
    const name = dbName()
    const pwa = await openRepository(createIdbPersistence({ name }), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('pwa'),
      recurrenceChunkSize: 5,
    })
    const regola = creaRegola(pwa, {
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-08-01',
    })
    await pwa.flush()

    const safari = await openRepository(createIdbPersistence({ name }), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock('2021-01-01T00:00:00.000Z'),
      newId: sequentialIds('safari'),
      recurrenceChunkSize: 5,
    })
    expect(safari.getState().recurringRules.map((r) => r.id)).toEqual([regola.id])

    const [daPwa, daSafari] = await Promise.all([
      pwa.materializeRecurring('2026-08-22'),
      safari.materializeRecurring('2026-08-22'),
    ])
    await Promise.all([pwa.flush(), safari.flush()])

    // Il disco, letto da un terzo contesto che non c'entra niente.
    const terzo = createIdbPersistence({ name })
    const suDisco = await terzo.loadAll()

    expect(suDisco.expenses).toHaveLength(22)
    expect(new Set(suDisco.expenses.map((e) => e.date)).size).toBe(22)
    expect(new Set(suDisco.expenses.map((e) => e.id)).size).toBe(22)
    expect(suDisco.expenses.every((e) => e.id === recurringExpenseId(regola.id, e.date))).toBe(true)

    // Le occorrenze le ha inserite qualcuno: la somma fa 22, non 44.
    expect(daPwa.created.length + daSafari.created.length).toBe(22)

    // Nessuno dei due mirror mostra doppioni, e nessuno dei due si inventa le
    // occorrenze che il disco gli ha saltato: ognuno tiene quelle che ha
    // inserito davvero, e resta col buco. Prima ci metteva dentro la **propria**
    // copia di record che sul disco erano di qualcun altro.
    const idsPwa = pwa.getState().expenses.map((e) => e.id)
    const idsSafari = safari.getState().expenses.map((e) => e.id)
    expect(new Set(idsPwa).size).toBe(idsPwa.length)
    expect(new Set(idsSafari).size).toBe(idsSafari.length)
    expect(idsPwa).toHaveLength(daPwa.created.length)
    expect(idsSafari).toHaveLength(daSafari.created.length)

    // E il buco si chiude al risveglio, non al riavvio (ADR 007).
    expect(await pwa.reloadFromDisk()).toEqual({ reloaded: true })
    expect(await safari.reloadFromDisk()).toEqual({ reloaded: true })
    expect(pwa.getState().expenses).toHaveLength(22)
    expect(safari.getState().expenses).toHaveLength(22)

    pwa.close()
    safari.close()
    terzo.close()
  })

  it('la cancellazione fatta in un contesto non viene annullata dall altro che materializza', async () => {
    // La sequenza esatta del bloccante: B e' aperta e viva, A materializza,
    // l'utente in A cancella l'occorrenza, B materializza. Il disco salta l'id
    // gia' presente; prima il mirror di B se lo inventava comunque — la propria
    // copia, viva e a 900 — e bastava che l'utente in B toccasse quella riga
    // perche' la cancellazione sparisse per sempre.
    const name = dbName()
    const a = await openRepository(createIdbPersistence({ name }), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('a'),
    })
    creaRegola(a, {
      amountCents: 90_000,
      categoryId: 'cat-1',
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-08-01',
    })
    await a.flush()

    // B apre adesso: da qui in poi il suo mirror invecchia.
    const b = await openRepository(createIdbPersistence({ name }), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock('2021-01-01T00:00:00.000Z'),
      newId: sequentialIds('b'),
    })

    await a.materializeRecurring('2026-08-01')
    const generata = a.getState().expenses[0]
    a.deleteExpense(generata?.id ?? '')
    await a.flush()

    await b.materializeRecurring('2026-08-01')
    await b.flush()

    // Il mirror di B resta col buco invece di mostrare una spesa viva che sul
    // disco non e' viva.
    expect(b.getState().expenses).toHaveLength(0)
    expect(b.updateExpense(generata?.id ?? '', { amountCents: 92_000 })).toBeNull()
    await b.flush()

    const terzo = createIdbPersistence({ name })
    const suDisco = await terzo.loadAll()
    expect(suDisco.expenses).toHaveLength(1)
    expect(suDisco.expenses[0]?.deletedAt).toBeDefined()
    expect(suDisco.expenses[0]?.amountCents).toBe(90_000)

    // Il buco si chiude al risveglio, e da li' in poi B vede la verita': la
    // spesa c'e' ed e' cancellata. Correggerla adesso non la resuscita.
    expect(await b.reloadFromDisk()).toEqual({ reloaded: true })
    expect(b.getState().expenses[0]?.deletedAt).toBeDefined()
    expect(b.updateExpense(generata?.id ?? '', { amountCents: 92_000 })?.deletedAt).toBeDefined()
    await b.flush()

    const finale = await terzo.loadAll()
    expect(finale.expenses[0]?.deletedAt).toBeDefined()
    expect(finale.expenses[0]?.amountCents).toBe(92_000)

    a.close()
    b.close()
    terzo.close()
  })

  it('interruzione a meta e ripresa da un altro contesto: stesso insieme di record', async () => {
    const name = dbName()
    const prima = await openRepository(createIdbPersistence({ name }), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('prima'),
      recurrenceChunkSize: 5,
    })
    const regola = creaRegola(prima, {
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-07-13',
    })
    await prima.flush()

    // Muore a meta': si materializza solo fino a un giorno intermedio, poi il
    // processo se ne va (chiudiamo la connessione senza altre cerimonie).
    await prima.materializeRecurring('2026-08-01')
    await prima.flush()
    prima.close()

    const dopo = await openRepository(createIdbPersistence({ name }), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock('2021-01-01T00:00:00.000Z'),
      newId: sequentialIds('dopo'),
      recurrenceChunkSize: 5,
    })
    await dopo.materializeRecurring('2026-08-21')
    await dopo.flush()

    const controllo = createIdbPersistence({ name })
    const suDisco = await controllo.loadAll()
    expect(suDisco.expenses).toHaveLength(40)
    expect(new Set(suDisco.expenses.map((e) => e.date)).size).toBe(40)
    expect(suDisco.expenses[0]?.date).toBe('2026-07-13')
    expect(suDisco.expenses.at(-1)?.date).toBe('2026-08-21')
    expect(suDisco.recurringRules[0]?.lastMaterializedDate).toBe('2026-08-21')
    expect(suDisco.expenses.every((e) => e.recurringId === regola.id)).toBe(true)

    dopo.close()
    controllo.close()
  })
})

describe('il budget si pianifica dentro la transazione', () => {
  /** Una richiesta di cambio budget, con istante e id gia' risolti. */
  function cambio(effectiveFrom: string, amountCents: number, newRecordId: string): WriteBatch {
    return {
      budgetChange: {
        period: 'monthly',
        amountCents,
        effectiveFrom,
        timestamp: `${effectiveFrom}T09:00:00.000Z`,
        newRecordId,
      },
    }
  }

  it('chiude il record che sta sul disco, anche se chi scrive non l ha mai visto', async () => {
    const name = dbName()
    const primo = createIdbPersistence({ name })
    const apertura = await primo.write(cambio('2026-08-01', 100_000, 'b-1'))
    expect(apertura.budgets.map((b) => b.id)).toEqual(['b-1'])

    // Un secondo contesto che non ha mai letto il database: e' il mirror vecchio
    // portato all'estremo. La pianificazione avviene qui dentro, sul disco.
    const secondo = createIdbPersistence({ name })
    const cambiato = await secondo.write(cambio('2026-08-22', 80_000, 'b-2'))
    expect(cambiato.budgets.map((b) => b.id)).toEqual(['b-1', 'b-2'])
    expect(cambiato.budgets[0]?.effectiveTo).toBe('2026-08-21')

    const suDisco = await primo.loadAll()
    expect(suDisco.budgets).toHaveLength(2)
    expect(suDisco.budgets.filter((b) => b.effectiveTo === undefined)).toHaveLength(1)

    primo.close()
    secondo.close()
  })

  it('la stessa richiesta scritta due volte non apre due record', async () => {
    // E' la rete del ritentativo: quando la connessione muore, `idb.ts` riapre e
    // rifa' la stessa scrittura. L'id del record nuovo viaggia dentro la
    // richiesta proprio per questo.
    const name = dbName()
    const persistence = createIdbPersistence({ name })
    const richiesta = cambio('2026-08-22', 80_000, 'b-1')
    await persistence.write(richiesta)
    const seconda = await persistence.write(richiesta)

    expect(seconda.budgets.map((b) => b.id)).toEqual(['b-1'])
    const suDisco = await persistence.loadAll()
    expect(suDisco.budgets).toHaveLength(1)
    expect(suDisco.budgets[0]?.amountCents).toBe(80_000)
    persistence.close()
  })

  it('i budget di categoria e quello complessivo non si chiudono a vicenda', async () => {
    const name = dbName()
    const persistence = createIdbPersistence({ name })
    await persistence.write(cambio('2026-08-01', 100_000, 'b-generale'))
    await persistence.write({
      budgetChange: {
        period: 'monthly',
        amountCents: 20_000,
        categoryId: 'cat-spesa',
        effectiveFrom: '2026-08-10',
        timestamp: '2026-08-10T09:00:00.000Z',
        newRecordId: 'b-categoria',
      },
    })

    const suDisco = await persistence.loadAll()
    expect(suDisco.budgets).toHaveLength(2)
    expect(suDisco.budgets.every((b) => b.effectiveTo === undefined)).toBe(true)
    persistence.close()
  })
})

describe('cancellare una categoria: il permesso lo danno tre store', () => {
  /*
   * Il conteggio si fa dentro la transazione, sui record del disco, e i record
   * che possono nominare una categoria stanno in **tre** store: spese, regole e
   * budget. Il terzo mancava.
   *
   * Questi test girano su IndexedDB vero perche' sono l'unico posto in cui lo
   * store dimenticato si vede: `memory-persistence` non ha transazioni con uno
   * scope, quindi li' un `budgets` in meno nell'elenco non produce nessun
   * sintomo. Su IndexedDB produce un `NotFoundError` su ogni cancellazione.
   */

  async function conCategoria(name: string): Promise<Persistence> {
    const persistence = createIdbPersistence({ name })
    await persistence.write({
      settings: makeSettings(),
      categories: [makeCategory({ id: 'cat-svago', name: 'Leisure' })],
    })
    return persistence
  }

  it('un budget di categoria sul disco la trattiene, e il rifiuto lo conta', async () => {
    const persistence = await conCategoria(dbName())
    await persistence.write({
      budgets: [
        makeBudget({
          id: 'b-1',
          effectiveFrom: '2026-08-01',
          amountCents: 20_000,
          categoryId: 'cat-svago',
        }),
      ],
    })

    const esito = await persistence.write({ categoryDeletion: { id: 'cat-svago' } })
    expect(esito.categoryDeletion).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 0,
      recurringRules: 0,
      budgets: 1,
    })

    const suDisco = await persistence.loadAll()
    expect(suDisco.categories).toHaveLength(1)
    persistence.close()
  })

  it('senza nessun riferimento la cancellazione passa, budget compresi', async () => {
    const persistence = await conCategoria(dbName())
    // Un budget generale — quello che la UI scrive davvero — non nomina nessuna
    // categoria e non deve trattenere niente.
    await persistence.write({
      budgets: [makeBudget({ id: 'b-1', effectiveFrom: '2026-08-01', amountCents: 80_000 })],
    })

    const esito = await persistence.write({ categoryDeletion: { id: 'cat-svago' } })
    expect(esito.categoryDeletion?.ok).toBe(true)

    const suDisco = await persistence.loadAll()
    expect(suDisco.categories).toHaveLength(0)
    expect(suDisco.budgets).toHaveLength(1)
    persistence.close()
  })
})

describe('cancellare una regola: il permesso lo danno le spese sul disco', () => {
  /*
   * Come per le categorie, questi test girano su IndexedDB vero: lo store
   * dimenticato nello scope della transazione si vede solo qui. Su
   * `memory-persistence` non ci sono scope, quindi un `expenses` in meno
   * nell'elenco di `storesOf` non produrrebbe nessun sintomo; su IndexedDB
   * produce un `NotFoundError` su ogni cancellazione.
   */

  async function conRegola(name: string): Promise<Persistence> {
    const persistence = createIdbPersistence({ name })
    await persistence.write({
      settings: makeSettings(),
      recurringRules: [makeRule({ id: 'r-affitto', startDate: '2026-01-01', cadence: 'monthly' })],
    })
    return persistence
  }

  it('una regola senza spese generate si cancella davvero', async () => {
    const persistence = await conRegola(dbName())
    const esito = await persistence.write({ recurringRuleDeletion: { id: 'r-affitto' } })
    expect(esito.recurringRuleDeletion?.ok).toBe(true)

    const suDisco = await persistence.loadAll()
    expect(suDisco.recurringRules).toHaveLength(0)
    persistence.close()
  })

  it('una spesa generata sul disco la trattiene, e resta dov e', async () => {
    const persistence = await conRegola(dbName())
    await persistence.write({
      expenses: [
        makeExpense({
          id: 'rec:r-affitto:2026-01-01',
          date: '2026-01-01',
          source: 'recurring',
          recurringId: 'r-affitto',
        }),
      ],
    })

    const esito = await persistence.write({ recurringRuleDeletion: { id: 'r-affitto' } })
    expect(esito.recurringRuleDeletion).toEqual({ ok: false, reason: 'in-use', expenses: 1 })

    const suDisco = await persistence.loadAll()
    expect(suDisco.recurringRules).toHaveLength(1)
    // La storia non cambia mai retroattivamente: la spesa e' ancora li'.
    expect(suDisco.expenses).toHaveLength(1)
    persistence.close()
  })

  it('una spesa manuale che non nomina nessuna regola non trattiene niente', async () => {
    const persistence = await conRegola(dbName())
    await persistence.write({ expenses: [makeExpense({ id: 'e-1', date: '2026-01-01' })] })

    const esito = await persistence.write({ recurringRuleDeletion: { id: 'r-affitto' } })
    expect(esito.recurringRuleDeletion?.ok).toBe(true)

    const suDisco = await persistence.loadAll()
    expect(suDisco.recurringRules).toHaveLength(0)
    expect(suDisco.expenses).toHaveLength(1)
    persistence.close()
  })
})

describe('il segnaposto viaggia da solo', () => {
  it('avanza senza portarsi dietro la copia vecchia della regola', async () => {
    // Il contesto che materializza legge la regola dal proprio mirror. Se
    // scrivesse quella copia, un mirror vecchio riaccenderebbe una regola spenta
    // altrove — e l'innesco non sarebbe un'azione dell'utente, ma l'apertura
    // dell'app.
    const persistence = createIdbPersistence({ name: dbName() })
    await persistence.write({
      recurringRules: [
        makeRule({ id: 'r-1', startDate: '2026-08-01', amountCents: 92_000, active: false }),
      ],
    })

    await persistence.write({ advanceRecurringMarkers: [MARKER] })

    const dopo = await persistence.loadAll()
    expect(dopo.recurringRules[0]?.lastMaterializedDate).toBe('2026-08-10')
    expect(dopo.recurringRules[0]?.amountCents).toBe(92_000)
    expect(dopo.recurringRules[0]?.active).toBe(false)
    expect(dopo.recurringRules[0]?.updatedAt).toBe('2026-08-10T00:00:00.000Z')
    persistence.close()
  })

  it('non torna indietro, e su una regola sparita non inventa niente', async () => {
    const persistence = createIdbPersistence({ name: dbName() })
    await persistence.write({
      recurringRules: [
        makeRule({ id: 'r-1', startDate: '2026-08-01', lastMaterializedDate: '2026-08-20' }),
      ],
    })

    // Un altro contesto era gia' andato piu' avanti: quelle spese esistono.
    await persistence.write({ advanceRecurringMarkers: [MARKER] })
    const fermo = await persistence.loadAll()
    expect(fermo.recurringRules[0]?.lastMaterializedDate).toBe('2026-08-20')
    // Niente e' cambiato, quindi nemmeno `updatedAt`.
    expect(fermo.recurringRules[0]?.updatedAt).toBe('2020-01-01T00:00:00.000Z')

    await persistence.write({ advanceRecurringMarkers: [{ ...MARKER, id: 'mai-esistita' }] })
    expect((await persistence.loadAll()).recurringRules).toHaveLength(1)
    persistence.close()
  })
})

describe('morte a meta su un database vero', () => {
  /**
   * Una persistenza che smette di funzionare dopo `n` scritture, con IndexedDB
   * vero sotto. E' il modo di riprodurre iOS che termina la web app a meta'
   * catch-up senza dover fingere il disco: il disco e' reale, e quello che ci e'
   * arrivato resta li'.
   */
  function dyingAfter(inner: Persistence, n: number): Persistence {
    let left = n
    return {
      loadAll: () => inner.loadAll(),
      async write(batch: WriteBatch) {
        if (left <= 0) throw new Error('processo terminato')
        left -= 1
        return inner.write(batch)
      },
      replaceAll: (data) => inner.replaceAll(data),
      close: () => inner.close(),
    }
  }

  it('interruzione a meta e ripresa: nessun duplicato, nessuna occorrenza persa', async () => {
    const name = dbName()
    const primo = await openRepository(createIdbPersistence({ name }), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('setup'),
    })
    const regola = creaRegola(primo, {
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-07-13',
    })
    await primo.flush()
    primo.close()

    // Vita numero due: muore dopo due blocchi da 5.
    const morente = await openRepository(dyingAfter(createIdbPersistence({ name }), 2), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock('2021-01-01T00:00:00.000Z'),
      newId: sequentialIds('morente'),
      recurrenceChunkSize: 5,
    })
    await expect(morente.materializeRecurring('2026-08-21')).rejects.toBeTruthy()

    const controllo = createIdbPersistence({ name })
    const meta = await controllo.loadAll()
    expect(meta.expenses).toHaveLength(10)
    // Il segnaposto non dichiara mai piu' di quello che c'e' davvero.
    expect(meta.recurringRules[0]?.lastMaterializedDate).toBe('2026-07-22')

    // Vita numero tre: riprende da dove si e' fermata.
    const ripresa = await openRepository(createIdbPersistence({ name }), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock('2022-01-01T00:00:00.000Z'),
      newId: sequentialIds('ripresa'),
      recurrenceChunkSize: 5,
    })
    await ripresa.materializeRecurring('2026-08-21')
    await ripresa.flush()

    const finale = await controllo.loadAll()
    expect(finale.expenses).toHaveLength(40)
    expect(new Set(finale.expenses.map((e) => e.date)).size).toBe(40)
    expect(finale.expenses.every((e) => e.id === recurringExpenseId(regola.id, e.date))).toBe(true)
    expect(finale.expenses[0]?.date).toBe('2026-07-13')
    expect(finale.expenses.at(-1)?.date).toBe('2026-08-21')

    ripresa.close()
    controllo.close()
  })
})

describe('migrazioni di schema', () => {
  /**
   * Un passo finto **oltre** la versione corrente. I passi finti servono ancora,
   * anche adesso che una migrazione vera esiste: coprono i casi che nessun passo
   * pubblicato ha — una trasformazione che riscrive tutte le spese, una che
   * esplode a meta' — e continueranno a coprirli quando la versione corrente
   * sara' la 5. Il passo vero ha i suoi test qui sotto, sui dati veri.
   */
  const oltreLUltimo: MigrationStep = {
    to: SCHEMA_VERSION + 1,
    summary: 'Prova: normalizza la nota delle spese',
    transform: (data) => ({
      ...data,
      expenses: data.expenses.map((e) => ({ ...e, note: 'migrata' })),
    }),
  }
  const OLTRE = [...MIGRATIONS, oltreLUltimo]
  const VERSIONE_OLTRE = SCHEMA_VERSION + 1

  it('da N-1 a N: i record passano dalla trasformazione e non ne sparisce nessuno', async () => {
    const name = dbName()
    const corrente = createIdbPersistence({ name })
    await corrente.write({
      settings: makeSettings(),
      expenses: [
        expense({ id: 'e-1', date: '2026-08-01', amountCents: 100 }),
        expense({ id: 'e-2', date: '2026-08-02', amountCents: 200 }),
        expense({ id: 'e-3', date: '2026-08-03', amountCents: 300, note: 'vecchia' }),
      ],
      categories: [
        {
          id: 'cat-1',
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
          name: 'Spesa',
          emoji: '🛒',
          color: '#4c9f70',
          order: 10,
          archived: false,
        },
      ],
    })
    corrente.close()

    const v3 = createIdbPersistence({ name, version: VERSIONE_OLTRE, migrations: OLTRE })
    const loaded = await v3.loadAll()

    expect(loaded.expenses).toHaveLength(3)
    expect(loaded.expenses.map((e) => e.amountCents).sort((a, b) => a - b)).toEqual([100, 200, 300])
    expect(loaded.expenses.every((e) => e.note === 'migrata')).toBe(true)
    // Gli store che la trasformazione non tocca restano come sono.
    expect(loaded.categories).toHaveLength(1)
    expect(loaded.settings?.weekStartsOn).toBe(1)
    v3.close()
  })

  it('una trasformazione che fallisce abortisce l upgrade invece di lasciare meta lavoro', async () => {
    const name = dbName()
    const corrente = createIdbPersistence({ name })
    await corrente.write({
      settings: makeSettings(),
      expenses: [expense({ id: 'e-1', date: '2026-08-01', amountCents: 100 })],
    })
    corrente.close()

    const esplosiva: MigrationStep = {
      to: SCHEMA_VERSION + 1,
      summary: 'Prova: una migrazione che si rompe',
      transform: () => {
        throw new Error('migrazione rotta')
      },
    }
    await expect(
      openCentDatabase({ name, version: VERSIONE_OLTRE, migrations: [...MIGRATIONS, esplosiva] }),
    ).rejects.toBeTruthy()

    // Il database e' rimasto alla versione precedente, con i suoi record intatti:
    // meglio un'app che non si apre di un archivio migrato a meta'.
    const riletto = createIdbPersistence({ name })
    const loaded = await riletto.loadAll()
    expect(loaded.expenses).toHaveLength(1)
    expect(loaded.expenses[0]?.amountCents).toBe(100)
    riletto.close()
  })

  it('aprire dati piu nuovi dell app non li tocca: rifiuta e basta', async () => {
    const name = dbName()
    const v3 = createIdbPersistence({ name, version: VERSIONE_OLTRE, migrations: OLTRE })
    await v3.write({ settings: makeSettings(), expenses: [expense({ id: 'e-1', date: '2026-08-01' })] })
    v3.close()

    const vecchia = createIdbPersistence({ name })
    await expect(vecchia.loadAll()).rejects.toBeTruthy()
    vecchia.close()
  })
})

/**
 * Le migrazioni vere sul percorso vero: un database scritto alla versione 1 che
 * viene riaperto dall'app aggiornata, e che quindi attraversa **tutti** i passi
 * pubblicati fino a `SCHEMA_VERSION`.
 *
 * Il punto di questi test non e' che le trasformazioni facciano qualcosa: e' che
 * **non facciano niente alle spese**. Un campo nuovo e opzionale non ha nessun
 * diritto di riscrivere un archivio — vale per `Expense.timeMinutes` (2) come
 * per `Settings.language` e `Settings.onboardingCompletedAt` (3) — e "non ha
 * riscritto" e' una cosa che si verifica solo guardando i record uno per uno.
 */
describe('migrazioni pubblicate: i campi nuovi non toccano cio che c era', () => {
  const V1 = MIGRATIONS.filter((s) => s.to <= 1)

  /** Un database fermo alla versione 1, come quello di chi aggiorna l'app. */
  async function scriviV1(name: string): Promise<void> {
    const v1 = createIdbPersistence({ name, version: 1, migrations: V1 })
    await v1.write({
      settings: makeSettings({ schemaVersion: 1, lastBackupAt: '2026-08-01T09:00:00.000Z' }),
      expenses: [
        expense({ id: 'e-1', date: '2026-08-01', amountCents: 100, note: 'vecchia' }),
        expense({ id: 'e-2', date: '2026-08-02', amountCents: 200 }),
        expense({ id: 'e-3', date: '2026-08-03', amountCents: 300, deletedAt: '2026-08-03T10:00:00.000Z' }),
      ],
      categories: [makeCategory({ id: 'cat-1', name: 'Spesa' })],
      recurringRules: [makeRule({ id: 'r-1', startDate: '2026-01-01', lastMaterializedDate: '2026-08-02' })],
      budgets: [makeBudget({ id: 'b-1', amountCents: 100_000, effectiveFrom: '2026-01-01' })],
    })
    v1.close()
  }

  it('le spese gia scritte restano identiche e senza orario', async () => {
    const name = dbName()
    await scriviV1(name)

    const aggiornata = createIdbPersistence({ name })
    const loaded = await aggiornata.loadAll()

    expect(loaded.expenses).toHaveLength(3)
    expect(loaded.expenses.every((e) => e.timeMinutes === undefined)).toBe(true)
    expect(loaded.expenses.every((e) => !('timeMinutes' in e))).toBe(true)
    // Niente e' stato "aggiornato": stessi importi, stesse note, stessi timestamp.
    expect(loaded.expenses.map((e) => [e.id, e.amountCents, e.updatedAt])).toEqual([
      ['e-1', 100, '2020-01-01T00:00:00.000Z'],
      ['e-2', 200, '2020-01-01T00:00:00.000Z'],
      ['e-3', 300, '2020-01-01T00:00:00.000Z'],
    ])
    expect(loaded.expenses[0]?.note).toBe('vecchia')
    expect(loaded.expenses[2]?.deletedAt).toBe('2026-08-03T10:00:00.000Z')
    // E nemmeno gli altri store: categorie, regole e budget passano interi.
    expect(loaded.categories).toHaveLength(1)
    expect(loaded.recurringRules[0]?.lastMaterializedDate).toBe('2026-08-02')
    expect(loaded.budgets[0]?.amountCents).toBe(100_000)
    aggiornata.close()
  })

  it('le impostazioni smettono di dichiarare la versione 1, e il resto resta', async () => {
    const name = dbName()
    await scriviV1(name)

    const aggiornata = createIdbPersistence({ name })
    const loaded = await aggiornata.loadAll()
    expect(loaded.settings?.schemaVersion).toBe(SCHEMA_VERSION)
    expect(loaded.settings?.lastBackupAt).toBe('2026-08-01T09:00:00.000Z')
    expect(loaded.settings?.theme).toBe('auto')
    aggiornata.close()
  })

  it('e idempotente: riaprire una seconda volta non fa piu niente', async () => {
    const name = dbName()
    await scriviV1(name)

    const prima = createIdbPersistence({ name })
    const dopoUpgrade = await prima.loadAll()
    prima.close()

    const seconda = createIdbPersistence({ name })
    const riletto = await seconda.loadAll()
    expect(riletto).toEqual(dopoUpgrade)
    seconda.close()
  })

  it('una spesa inserita dopo l aggiornamento ha l orario, quelle di prima no', async () => {
    const name = dbName()
    await scriviV1(name)

    const persistence = createIdbPersistence({ name })
    const repo = await openRepository(persistence, {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('nuovo'),
      nowInstant: () => new Date(2026, 7, 22, 20, 40),
    })
    repo.addExpense({ amountCents: 500, categoryId: 'cat-1' })
    await repo.flush()

    const loaded = await persistence.loadAll()
    const nuova = loaded.expenses.find((e) => e.id === 'nuovo-1')
    expect(nuova?.date).toBe('2026-08-22')
    expect(nuova?.timeMinutes).toBe(20 * 60 + 40)
    expect(loaded.expenses.filter((e) => e.timeMinutes !== undefined)).toHaveLength(1)
    persistence.close()
  })
})

describe('la connessione non e per sempre', () => {
  it('quando un altro contesto deve aggiornare lo schema, questo si fa da parte', async () => {
    // Senza `blocking` la scheda vecchia terrebbe in ostaggio la finestra nuova:
    // l'upgrade non parte, la PWA non si apre, schermata bianca. Qui la prova e'
    // che la cancellazione (che chiede la stessa cortesia) va a termine invece
    // di restare appesa per sempre.
    const name = dbName()
    let bloccati = 0
    const persistence = createIdbPersistence({ name, blocking: () => (bloccati += 1) })
    await persistence.write({
      settings: makeSettings(),
      expenses: [expense({ id: 'e-1', date: '2026-08-01' })],
    })

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(new Error('cancellazione fallita'))
    })

    expect(bloccati).toBe(1)

    // E alla prossima scrittura si riapre da sola, senza che nessuno la avvisi.
    await persistence.write({ settings: makeSettings() })
    const loaded = await persistence.loadAll()
    expect(loaded.settings).not.toBeNull()
    expect(persistence.reopenCount).toBe(1)
    persistence.close()
  })

  it('dopo close non si riapre: una persistenza chiusa resta chiusa', async () => {
    const persistence = createIdbPersistence({ name: dbName() })
    await persistence.write({ settings: makeSettings() })
    persistence.close()
    await expect(persistence.write({ settings: makeSettings() })).rejects.toBeTruthy()
  })
})
