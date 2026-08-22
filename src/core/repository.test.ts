import { describe, expect, it } from 'vitest'
import { parseBackup } from './backup'
import { computeBudgetMetrics } from './budget'
import { today } from './date'
import { DEFAULT_CATEGORY_SEEDS } from './defaults'
import { createMemoryPersistence, SimulatedCrashError } from './memory-persistence'
import type { MemoryDisk } from './memory-persistence'
import { emptyDisk } from './memory-persistence'
import {
  ImportInProgressError,
  MaterializationSupersededError,
  openRepository,
} from './repository'
import type { Repository } from './repository'
import type { Persistence } from './persistence'
import { sequentialIds, tickingClock } from './testing'
import type { DataSet } from './types'

interface Fixture {
  readonly repo: Repository
  readonly disk: MemoryDisk
}

async function open(disk: MemoryDisk = emptyDisk(), prefix = 'id'): Promise<Fixture> {
  const repo = await openRepository(createMemoryPersistence(disk), {
    now: tickingClock(),
    newId: sequentialIds(prefix),
  })
  return { repo, disk }
}

describe('primo avvio', () => {
  it('crea impostazioni e categorie di default, e le scrive', async () => {
    const { repo, disk } = await open()
    expect(disk.settings?.weekStartsOn).toBe(1)
    expect(disk.settings?.theme).toBe('auto')
    expect(disk.categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
    expect(repo.getState().categories[0]?.name).toBe('Spesa')
    expect(repo.getState().categories.map((c) => c.order)).toEqual([10, 20, 30, 40, 50, 60, 70, 80])
  })

  it('riaprendo non ricrea niente', async () => {
    const { disk } = await open()
    const idsPrima = disk.categories.map((c) => c.id)
    const { repo } = await open(disk, 'secondo')
    expect(disk.categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
    expect(repo.getState().categories.map((c) => c.id)).toEqual(idsPrima)
  })

  it('rilegge dal disco quello che c era', async () => {
    const { repo, disk } = await open()
    repo.addExpense({ amountCents: 1_250, categoryId: 'cat', date: '2026-08-22' })
    await repo.flush()

    const riaperto = await open(disk, 'secondo')
    expect(riaperto.repo.getState().expenses).toHaveLength(1)
    expect(riaperto.repo.getState().expenses[0]?.amountCents).toBe(1_250)
  })
})

describe('spese: scrittura ottimistica', () => {
  it('lo stato cambia e notifica prima che il disco sappia niente', async () => {
    const { repo, disk } = await open()
    let notifiche = 0
    repo.subscribe(() => (notifiche += 1))

    const spesa = repo.addExpense({ amountCents: 1_250, categoryId: 'cat-1', date: '2026-08-22' })

    // Sincrono: nessun await fra il tap e il feedback.
    expect(notifiche).toBe(1)
    expect(repo.getState().expenses).toEqual([spesa])
    expect(disk.expenses).toHaveLength(0)

    await repo.flush()
    expect(disk.expenses).toHaveLength(1)
    expect(disk.expenses[0]?.amountCents).toBe(1_250)
  })

  it('la data di default e oggi e la sorgente e manuale', async () => {
    const { repo } = await open()
    const spesa = repo.addExpense({ amountCents: 100, categoryId: 'cat-1' })
    expect(spesa.date).toBe(today())
    expect(spesa.source).toBe('manual')
    expect(spesa.recurringId).toBeUndefined()
  })

  it('rifiuta un importo che non e un intero in centesimi', async () => {
    const { repo } = await open()
    expect(() => repo.addExpense({ amountCents: 12.5, categoryId: 'cat-1' })).toThrow(TypeError)
    expect(() => repo.addExpense({ amountCents: NaN, categoryId: 'cat-1' })).toThrow(TypeError)
  })

  it('rifiuta una data inesistente', async () => {
    const { repo } = await open()
    expect(() => repo.addExpense({ amountCents: 100, categoryId: 'c', date: '2026-02-30' })).toThrow(
      RangeError,
    )
  })

  it('le scritture arrivano al disco nell ordine in cui sono state chieste', async () => {
    const { repo, disk } = await open()
    const spesa = repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })
    repo.updateExpense(spesa.id, { amountCents: 200 })
    repo.updateExpense(spesa.id, { amountCents: 300 })
    await repo.flush()
    expect(disk.expenses).toHaveLength(1)
    expect(disk.expenses[0]?.amountCents).toBe(300)
  })

  it('modifica e cancellazione della nota', async () => {
    const { repo } = await open()
    const spesa = repo.addExpense({
      amountCents: 100,
      categoryId: 'cat-1',
      date: '2026-08-22',
      note: 'con nota',
    })
    expect(repo.updateExpense(spesa.id, { note: 'altra' })?.note).toBe('altra')
    const senza = repo.updateExpense(spesa.id, { note: null })
    expect(senza?.note).toBeUndefined()
    expect(senza && 'note' in senza).toBe(false)
  })

  it('modificare una spesa inesistente restituisce null invece di lanciare', async () => {
    const { repo } = await open()
    expect(repo.updateExpense('mai-esistita', { amountCents: 1 })).toBeNull()
    expect(repo.deleteExpense('mai-esistita')).toBeNull()
    expect(repo.restoreExpense('mai-esistita')).toBeNull()
  })

  it('un errore di scrittura non si perde: lo rilancia flush e lo riceve onWriteError', async () => {
    const disk = emptyDisk()
    const persistence = createMemoryPersistence(disk)
    const errori: unknown[] = []
    const repo = await openRepository(persistence, {
      now: tickingClock(),
      newId: sequentialIds('e'),
      onWriteError: (error) => errori.push(error),
    })
    persistence.crashAfter(1)
    repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })

    await expect(repo.flush()).rejects.toBeInstanceOf(SimulatedCrashError)
    expect(errori).toHaveLength(1)
    // Il mirror resta ottimista: e' la UI a decidere cosa dire, non il repository.
    expect(repo.getState().expenses).toHaveLength(1)
    expect(disk.expenses).toHaveLength(0)
  })
})

describe('scritture fallite: lo stato non guarisce da solo', () => {
  /** Un repository la cui persistenza muore alla prima scrittura utile. */
  async function rotto(): Promise<Fixture> {
    const disk = emptyDisk()
    const persistence = createMemoryPersistence(disk)
    const repo = await openRepository(persistence, {
      now: tickingClock(),
      newId: sequentialIds('rotto'),
    })
    // La prima write ha gia' scritto default e categorie: si muore dalla prossima.
    persistence.crashAfter(1)
    return { repo, disk }
  }

  it('conta le scritture non arrivate al disco e lo dice nello stato osservabile', async () => {
    const { repo, disk } = await rotto()
    const visti: number[] = []
    repo.subscribe((state) => visti.push(state.writeFailures.count))

    for (let i = 0; i < 20; i += 1) {
      repo.addExpense({ amountCents: 100 + i, categoryId: 'cat-1', date: '2026-08-22' })
    }
    await expect(repo.flush()).rejects.toBeInstanceOf(SimulatedCrashError)

    // Lo scenario intero: il mirror dice 20, il disco zero, e lo stato lo ammette.
    expect(repo.getState().expenses).toHaveLength(20)
    expect(disk.expenses).toHaveLength(0)
    expect(repo.getState().writeFailures.count).toBe(20)
    expect(repo.getState().writeFailures.lastError).toBeInstanceOf(SimulatedCrashError)
    expect(repo.getState().writeFailures.lastAt).not.toBeNull()
    // La UI ha ricevuto la notifica: il contatore e' passato dai sottoscrittori.
    expect(visti.at(-1)).toBe(20)
  })

  it('la seconda flush non risolve pulita: l errore non si consuma', async () => {
    const { repo } = await rotto()
    repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })

    await expect(repo.flush()).rejects.toBeInstanceOf(SimulatedCrashError)
    // Prima questa risolveva senza dire niente, con zero spese sul disco.
    await expect(repo.flush()).rejects.toBeInstanceOf(SimulatedCrashError)
    await expect(repo.flush()).rejects.toBeInstanceOf(SimulatedCrashError)
    expect(repo.getState().writeFailures.count).toBe(1)
  })

  it('finche tutto va bene il contatore resta a zero', async () => {
    const { repo } = await open()
    repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })
    await repo.flush()
    expect(repo.getState().writeFailures).toEqual({ count: 0, lastError: null, lastAt: null })
  })

  it('un import fallito non azzera il conto di quello che non e stato salvato', async () => {
    const { repo } = await rotto()
    repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })
    await expect(repo.flush()).rejects.toBeInstanceOf(SimulatedCrashError)
    const conteggio = repo.getState().writeFailures.count
    expect(conteggio).toBe(1)

    await expect(repo.importBackup(repo.getState())).rejects.toBeInstanceOf(SimulatedCrashError)
    expect(repo.getState().writeFailures.count).toBe(conteggio)
  })
})

describe('soft delete e ripristino', () => {
  it('cancellare marca, non toglie; ripristinare e la mossa opposta', async () => {
    const { repo, disk } = await open()
    const spesa = repo.addExpense({ amountCents: 1_000, categoryId: 'cat-1', date: '2026-08-22' })

    const cancellata = repo.deleteExpense(spesa.id)
    expect(cancellata?.deletedAt).toBeDefined()
    expect(repo.getState().expenses).toHaveLength(1)

    const ripristinata = repo.restoreExpense(spesa.id)
    expect(ripristinata?.deletedAt).toBeUndefined()
    expect(ripristinata && 'deletedAt' in ripristinata).toBe(false)

    await repo.flush()
    expect(disk.expenses).toHaveLength(1)
    expect(disk.expenses[0]?.deletedAt).toBeUndefined()
  })

  it('cancellare due volte la stessa spesa non fa niente la seconda', async () => {
    const { repo } = await open()
    const spesa = repo.addExpense({ amountCents: 1_000, categoryId: 'cat-1', date: '2026-08-22' })
    expect(repo.deleteExpense(spesa.id)).not.toBeNull()
    expect(repo.deleteExpense(spesa.id)).toBeNull()
  })

  it('una spesa cancellata sparisce dai totali del budget', async () => {
    const { repo } = await open()
    const spesa = repo.addExpense({ amountCents: 5_000, categoryId: 'cat-1', date: '2026-08-22' })
    repo.setBudget({ period: 'monthly', amountCents: 100_000, effectiveFrom: '2026-08-01' })

    const metriche = (): number =>
      computeBudgetMetrics({
        expenses: repo.getState().expenses,
        budgets: repo.getState().budgets,
        period: 'monthly',
        onDate: '2026-08-22',
        today: '2026-08-22',
      }).spentCents

    expect(metriche()).toBe(5_000)
    repo.deleteExpense(spesa.id)
    expect(metriche()).toBe(0)
    repo.restoreExpense(spesa.id)
    expect(metriche()).toBe(5_000)
  })
})

describe('categorie', () => {
  it('la nuova categoria va in fondo', async () => {
    const { repo } = await open()
    const nuova = repo.addCategory({ name: 'Musei', emoji: '🏛️', color: '#123456' })
    expect(nuova.order).toBe(90)
    expect(nuova.archived).toBe(false)
  })

  it('archiviare non cancella', async () => {
    const { repo } = await open()
    const prima = repo.getState().categories[0]
    const archiviata = repo.updateCategory(prima?.id ?? '', { archived: true })
    expect(archiviata?.archived).toBe(true)
    expect(repo.getState().categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
  })

  it('riordinare riscrive solo quelle che cambiano posizione', async () => {
    const { repo, disk } = await open()
    const ids = repo.getState().categories.map((c) => c.id)
    const invertite = [ids[1] as string, ids[0] as string, ...ids.slice(2)]
    const scritte = repo.reorderCategories(invertite)

    expect(scritte).toHaveLength(2)
    await repo.flush()
    const byId = new Map(disk.categories.map((c) => [c.id, c.order]))
    expect(byId.get(ids[1] as string)).toBe(10)
    expect(byId.get(ids[0] as string)).toBe(20)
  })

  it('gli id sconosciuti nel riordino vengono ignorati', async () => {
    const { repo } = await open()
    expect(repo.reorderCategories(['non-esiste'])).toEqual([])
  })
})

describe('budget dal repository', () => {
  it('setBudget storicizza: chiude il vecchio e apre il nuovo', async () => {
    const { repo, disk } = await open()
    repo.setBudget({ period: 'monthly', amountCents: 100_000, effectiveFrom: '2026-01-01' })
    repo.setBudget({ period: 'monthly', amountCents: 80_000, effectiveFrom: '2026-08-22' })
    await repo.flush()

    expect(disk.budgets).toHaveLength(2)
    const vecchio = disk.budgets.find((b) => b.amountCents === 100_000)
    expect(vecchio?.effectiveTo).toBe('2026-08-21')

    const luglio = computeBudgetMetrics({
      expenses: [],
      budgets: repo.getState().budgets,
      period: 'monthly',
      onDate: '2026-07-15',
      today: '2026-08-22',
    })
    expect(luglio.budgetCents).toBe(100_000)
  })
})

describe('ricorrenze dal repository', () => {
  it('materializza, aggiorna il mirror e non duplica alle aperture successive', async () => {
    const { repo, disk } = await open()
    repo.addRecurringRule({
      amountCents: 90_000,
      categoryId: 'cat-1',
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-06-01',
      note: 'Affitto',
    })
    await repo.flush()

    const primo = await repo.materializeRecurring('2026-08-22')
    expect(primo.created).toHaveLength(3)
    expect(repo.getState().expenses).toHaveLength(3)
    expect(repo.getState().expenses.every((e) => e.source === 'recurring')).toBe(true)
    expect(disk.expenses).toHaveLength(3)

    for (let i = 0; i < 10; i += 1) {
      const ancora = await repo.materializeRecurring('2026-08-22')
      expect(ancora.created).toHaveLength(0)
    }
    expect(repo.getState().expenses).toHaveLength(3)
    expect(disk.expenses).toHaveLength(3)
  })

  it('riaprendo l app il giorno dopo aggiunge solo il mancante', async () => {
    const { repo, disk } = await open()
    repo.addRecurringRule({
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-08-20',
    })
    await repo.materializeRecurring('2026-08-22')
    expect(disk.expenses).toHaveLength(3)

    const riaperto = await open(disk, 'giorno2')
    await riaperto.repo.materializeRecurring('2026-08-23')
    expect(disk.expenses).toHaveLength(4)
    expect(new Set(disk.expenses.map((e) => e.date)).size).toBe(4)
  })

  it('una spesa generata si modifica e si cancella senza toccare la regola', async () => {
    const { repo } = await open()
    const regola = repo.addRecurringRule({
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-08-22',
    })
    await repo.materializeRecurring('2026-08-22')
    const generata = repo.getState().expenses[0]

    repo.updateExpense(generata?.id ?? '', { amountCents: 750 })
    expect(repo.getState().expenses[0]?.amountCents).toBe(750)
    expect(repo.getState().recurringRules[0]?.amountCents).toBe(500)

    repo.deleteExpense(generata?.id ?? '')
    expect(repo.getState().recurringRules[0]?.id).toBe(regola.id)
    expect(repo.getState().recurringRules[0]?.active).toBe(true)
  })

  it('disattivare una regola ferma le occorrenze future', async () => {
    const { repo } = await open()
    const regola = repo.addRecurringRule({
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-08-20',
    })
    await repo.materializeRecurring('2026-08-21')
    repo.updateRecurringRule(regola.id, { active: false })
    await repo.materializeRecurring('2026-08-30')
    expect(repo.getState().expenses).toHaveLength(2)
  })

  it('due materializzazioni in parallelo nello stesso contesto: una spesa per giorno', async () => {
    // La riproduzione del bloccante, dal lato del repository. Passa per il lock
    // (le due chiamate si dividono la stessa promise), ma il test che conta
    // davvero e' quello su due repository distinti in `idb.test.ts`: li' il
    // lock non c'e' proprio.
    const { repo, disk } = await open()
    repo.addRecurringRule({
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-08-01',
    })
    await repo.flush()

    const [a, b] = await Promise.all([
      repo.materializeRecurring('2026-08-22'),
      repo.materializeRecurring('2026-08-22'),
    ])
    await repo.flush()

    expect(disk.expenses).toHaveLength(22)
    expect(new Set(disk.expenses.map((e) => e.date)).size).toBe(22)
    expect(repo.getState().expenses).toHaveLength(22)
    expect(new Set(repo.getState().expenses.map((e) => e.id)).size).toBe(22)
    expect(a.created).toHaveLength(22)
    expect(b.created).toHaveLength(22)
  })

  it('la spesa generata e corretta dall utente sopravvive al catch-up successivo', async () => {
    const { repo, disk } = await open()
    repo.addRecurringRule({
      amountCents: 90_000,
      categoryId: 'cat-1',
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-06-01',
    })
    await repo.materializeRecurring('2026-06-01')
    const canone = repo.getState().expenses[0]
    repo.updateExpense(canone?.id ?? '', { amountCents: 92_000 })
    await repo.flush()

    // Segnaposto riportato indietro, come dopo il ripristino di un backup
    // vecchio: la regola vuole rigenerare giugno.
    disk.recurringRules = disk.recurringRules.map((r) => {
      const { lastMaterializedDate: _via, ...resto } = r
      return resto
    })
    const riaperto = await open(disk, 'dopo')
    await riaperto.repo.materializeRecurring('2026-08-22')

    const giugno = disk.expenses.filter((e) => e.date === '2026-06-01')
    expect(giugno).toHaveLength(1)
    expect(giugno[0]?.amountCents).toBe(92_000)
    expect(disk.expenses).toHaveLength(3)
  })

  it('la spesa generata e cancellata dall utente non riappare al catch-up successivo', async () => {
    const { repo, disk } = await open()
    repo.addRecurringRule({
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-08-01',
    })
    await repo.materializeRecurring('2026-08-03')
    const seconda = repo.getState().expenses.find((e) => e.date === '2026-08-02')
    repo.deleteExpense(seconda?.id ?? '')
    await repo.flush()

    disk.recurringRules = disk.recurringRules.map((r) => ({
      ...r,
      lastMaterializedDate: '2026-07-31',
    }))
    const riaperto = await open(disk, 'dopo')
    await riaperto.repo.materializeRecurring('2026-08-03')

    const due = disk.expenses.filter((e) => e.date === '2026-08-02')
    expect(due).toHaveLength(1)
    expect(due[0]?.deletedAt).toBeDefined()
    expect(disk.expenses).toHaveLength(3)
  })

  it('rifiuta una regola con intervallo assurdo prima di salvarla', async () => {
    const { repo } = await open()
    expect(() =>
      repo.addRecurringRule({
        amountCents: 500,
        categoryId: 'cat-1',
        cadence: 'daily',
        interval: 0,
        startDate: '2026-08-20',
      }),
    ).toThrow(RangeError)
  })
})

describe('export e import dal repository', () => {
  async function popolato(): Promise<Fixture> {
    const fixture = await open()
    const { repo } = fixture
    const cat = repo.getState().categories[0]?.id ?? 'cat-1'
    repo.addExpense({ amountCents: 1_250, categoryId: cat, date: '2026-08-20', note: 'Caffe' })
    const daCancellare = repo.addExpense({ amountCents: 400, categoryId: cat, date: '2026-08-21' })
    repo.deleteExpense(daCancellare.id)
    repo.setBudget({ period: 'monthly', amountCents: 100_000, effectiveFrom: '2026-08-01' })
    repo.addRecurringRule({
      amountCents: 90_000,
      categoryId: cat,
      cadence: 'monthly',
      interval: 1,
      anchorDay: 31,
      startDate: '2026-08-01',
    })
    await repo.flush()
    return fixture
  }

  it('esporta, reimporta in un archivio vuoto e i dati sono identici', async () => {
    const sorgente = await popolato()
    const file = JSON.parse(JSON.stringify(sorgente.repo.exportBackup())) as unknown

    const preview = parseBackup(file)
    expect(preview.ok).toBe(true)
    expect(preview.data).not.toBeNull()

    const destinazione = await open(emptyDisk(), 'dest')
    await destinazione.repo.importBackup(preview.data as DataSet)

    expect(destinazione.repo.getState()).toEqual(sorgente.repo.getState())
    expect(destinazione.disk.expenses).toEqual(sorgente.disk.expenses)
    expect(destinazione.disk.budgets).toEqual(sorgente.disk.budgets)
    expect(destinazione.disk.recurringRules).toEqual(sorgente.disk.recurringRules)
    expect(destinazione.disk.settings).toEqual(sorgente.disk.settings)
  })

  it('l import sostituisce, non fonde: le categorie di default spariscono', async () => {
    const sorgente = await popolato()
    const preview = parseBackup(JSON.parse(JSON.stringify(sorgente.repo.exportBackup())))

    const destinazione = await open(emptyDisk(), 'dest')
    destinazione.repo.addExpense({ amountCents: 999, categoryId: 'cat-1', date: '2026-01-01' })
    await destinazione.repo.flush()

    await destinazione.repo.importBackup(preview.data as DataSet)
    expect(destinazione.repo.getState().expenses.some((e) => e.amountCents === 999)).toBe(false)
    expect(destinazione.disk.expenses.some((e) => e.amountCents === 999)).toBe(false)
  })

  it('dopo l import il mirror e il disco dicono la stessa cosa anche riaprendo', async () => {
    const sorgente = await popolato()
    const preview = parseBackup(JSON.parse(JSON.stringify(sorgente.repo.exportBackup())))
    const destinazione = await open(emptyDisk(), 'dest')
    await destinazione.repo.importBackup(preview.data as DataSet)

    const riaperto = await open(destinazione.disk, 'riletto')
    const atteso = sorgente.repo.getState()
    const letto = riaperto.repo.getState()
    expect([...letto.expenses].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...atteso.expenses].sort((a, b) => a.id.localeCompare(b.id)),
    )
    expect(letto.settings).toEqual(atteso.settings)
  })

  it('l import restituisce il backup di quello che c era: l Annulla e una riga', async () => {
    const sorgente = await popolato()
    const preview = parseBackup(JSON.parse(JSON.stringify(sorgente.repo.exportBackup())))

    const destinazione = await open(emptyDisk(), 'dest')
    destinazione.repo.addExpense({ amountCents: 999, categoryId: 'cat-1', date: '2026-01-01' })
    await destinazione.repo.flush()
    const prima = destinazione.repo.getState()

    // Il file sbagliato scelto dal Files di iOS: si conferma, e due mesi
    // spariscono. L'unica rete e' tornare indietro.
    const annulla = await destinazione.repo.importBackup(preview.data as DataSet)
    expect(destinazione.repo.getState().expenses.some((e) => e.amountCents === 999)).toBe(false)

    await destinazione.repo.importBackup(annulla.data)

    expect(destinazione.repo.getState().expenses).toEqual(prima.expenses)
    expect(destinazione.repo.getState().categories).toEqual(prima.categories)
    expect(destinazione.repo.getState().budgets).toEqual(prima.budgets)
    expect(destinazione.disk.expenses.some((e) => e.amountCents === 999)).toBe(true)
  })

  it('il backup restituito e la fotografia di prima, non di dopo', async () => {
    const sorgente = await popolato()
    const preview = parseBackup(JSON.parse(JSON.stringify(sorgente.repo.exportBackup())))
    const destinazione = await open(emptyDisk(), 'dest')
    const attese = destinazione.repo.getState().categories.length

    const annulla = await destinazione.repo.importBackup(preview.data as DataSet)
    expect(annulla.data.expenses).toHaveLength(0)
    expect(annulla.data.categories).toHaveLength(attese)
    expect(annulla.app).toBe('cent')
  })

  it('la spesa cancellata resta cancellata dopo il round-trip', async () => {
    const sorgente = await popolato()
    const preview = parseBackup(JSON.parse(JSON.stringify(sorgente.repo.exportBackup())))
    const cancellate = preview.data?.expenses.filter((e) => e.deletedAt !== undefined) ?? []
    expect(cancellate).toHaveLength(1)
    expect(cancellate[0]?.amountCents).toBe(400)
  })
})

describe('impostazioni', () => {
  it('aggiornare il tema e la data dell ultimo backup', async () => {
    const { repo, disk } = await open()
    const aggiornate = repo.updateSettings({
      theme: 'dark',
      lastBackupAt: '2026-08-22T09:00:00.000Z',
    })
    expect(aggiornate.theme).toBe('dark')
    expect(aggiornate.lastBackupAt).toBe('2026-08-22T09:00:00.000Z')
    await repo.flush()
    expect(disk.settings?.theme).toBe('dark')
    expect(disk.settings?.schemaVersion).toBe(repo.getState().settings.schemaVersion)
  })
})


describe('un catch-up che muore a meta', () => {
  it('lo dice: flush lo rilancia e writeFailures lo registra', async () => {
    // Prima l'errore era visibile da zero canali: la materializzazione non
    // passava da `push`, quindi `pendingError` restava `null`, `onWriteError`
    // non veniva chiamato e `flush()` risolveva pulita su un catch-up morto.
    const disk = emptyDisk()
    const persistence = createMemoryPersistence(disk)
    const errori: unknown[] = []
    const repo = await openRepository(persistence, {
      now: tickingClock(),
      newId: sequentialIds('cu'),
      onWriteError: (error) => errori.push(error),
      recurrenceChunkSize: 5,
    })
    repo.addRecurringRule({
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-08-01',
    })
    await repo.flush()

    persistence.crashAfter(2)
    await expect(repo.materializeRecurring('2026-08-22')).rejects.toBeInstanceOf(
      SimulatedCrashError,
    )

    await expect(repo.flush()).rejects.toBeInstanceOf(SimulatedCrashError)
    expect(errori).toHaveLength(1)
    expect(repo.getState().writeFailures.lastError).toBeInstanceOf(SimulatedCrashError)
    expect(repo.getState().writeFailures.lastAt).not.toBeNull()
    // Il blocco perso non e' entrato nel mirror: non c'e' nessun record che
    // l'utente vede e il disco non ha, quindi il contatore della divergenza
    // resta a zero e la UI non dice "esporta subito" per niente.
    expect(repo.getState().writeFailures.count).toBe(0)

    // Il primo blocco e' sul disco e vale: si riprende da li'.
    expect(disk.expenses).toHaveLength(5)
    expect(repo.getState().expenses).toHaveLength(5)
  })
})

describe('due contesti, mai simultanei', () => {
  it('un contesto con il mirror vecchio non riaccende una regola spenta altrove', async () => {
    const disk = emptyDisk()
    const a = await open(disk, 'a')
    const regola = a.repo.addRecurringRule({
      amountCents: 90_000,
      categoryId: 'cat-1',
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-06-01',
    })
    await a.repo.flush()

    // B apre e resta viva: da qui il suo mirror invecchia.
    const b = await open(disk, 'b')

    a.repo.updateRecurringRule(regola.id, { amountCents: 92_000, active: false })
    await a.repo.flush()

    // B materializza con il mirror vecchio. Prima il suo batch scriveva la
    // regola intera: 900 e attiva, cioe' l'annullamento di quello che l'utente
    // aveva appena fatto, innescato dalla sola apertura dell'app.
    await b.repo.materializeRecurring('2026-08-22')
    await b.repo.flush()

    expect(disk.recurringRules[0]?.amountCents).toBe(92_000)
    expect(disk.recurringRules[0]?.active).toBe(false)
    // Il segnaposto, che e' l'unica cosa che B sapeva davvero, e' avanzato.
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe('2026-08-22')
  })

  it('e con la rilettura al risveglio non genera nemmeno le occorrenze', async () => {
    // Il segnaposto non basta: le spese B le aveva comunque generate, da una
    // regola che per l'utente era spenta. Quello lo risolve solo rileggere
    // prima di scrivere (ADR 007).
    const disk = emptyDisk()
    const a = await open(disk, 'a')
    const regola = a.repo.addRecurringRule({
      amountCents: 90_000,
      categoryId: 'cat-1',
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-06-01',
    })
    await a.repo.flush()

    const b = await open(disk, 'b')
    a.repo.updateRecurringRule(regola.id, { active: false })
    await a.repo.flush()

    expect(await b.repo.reloadFromDisk()).toEqual({ reloaded: true })
    const esito = await b.repo.materializeRecurring('2026-08-22')
    await b.repo.flush()

    expect(esito.created).toHaveLength(0)
    expect(disk.expenses).toHaveLength(0)
  })
})

describe('rilettura al risveglio', () => {
  it('allinea un mirror vecchio a quello che c e sul disco', async () => {
    const disk = emptyDisk()
    const a = await open(disk, 'a')
    const b = await open(disk, 'b')

    const spesa = a.repo.addExpense({
      amountCents: 1_250,
      categoryId: 'cat-1',
      date: '2026-08-22',
    })
    const daCancellare = a.repo.addExpense({
      amountCents: 400,
      categoryId: 'cat-1',
      date: '2026-08-22',
    })
    a.repo.deleteExpense(daCancellare.id)
    await a.repo.flush()

    expect(b.repo.getState().expenses).toHaveLength(0)
    expect(await b.repo.reloadFromDisk()).toEqual({ reloaded: true })

    expect(b.repo.getState().expenses.map((e) => e.id).sort()).toEqual(
      [spesa.id, daCancellare.id].sort(),
    )
    expect(
      b.repo.getState().expenses.find((e) => e.id === daCancellare.id)?.deletedAt,
    ).toBeDefined()
  })

  it('notifica i sottoscrittori: la UI non resta ferma su dati vecchi', async () => {
    const disk = emptyDisk()
    const a = await open(disk, 'a')
    const b = await open(disk, 'b')
    a.repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })
    await a.repo.flush()

    let notifiche = 0
    b.repo.subscribe(() => (notifiche += 1))
    await b.repo.reloadFromDisk()
    expect(notifiche).toBe(1)
  })

  it('non rilegge se ci sono scritture in coda, e non tocca il mirror', async () => {
    const { repo } = await open()
    const spesa = repo.addExpense({
      amountCents: 100,
      categoryId: 'cat-1',
      date: '2026-08-22',
    })

    expect(await repo.reloadFromDisk()).toEqual({ reloaded: false, reason: 'pending-writes' })
    expect(repo.getState().expenses).toEqual([spesa])
    await repo.flush()
  })

  it('non rilegge se ci sono scritture perse: le cancellerebbe', async () => {
    const disk = emptyDisk()
    const persistence = createMemoryPersistence(disk)
    const repo = await openRepository(persistence, {
      now: tickingClock(),
      newId: sequentialIds('perse'),
    })
    persistence.crashAfter(1)
    repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })
    await expect(repo.flush()).rejects.toBeInstanceOf(SimulatedCrashError)

    expect(await repo.reloadFromDisk()).toEqual({ reloaded: false, reason: 'write-failures' })
    // Il mirror e' l'unica copia rimasta di quella spesa: si esporta, non si
    // butta.
    expect(repo.getState().expenses).toHaveLength(1)
    expect(disk.expenses).toHaveLength(0)
  })

  it('non si adegua a un disco svuotato da qualcun altro', async () => {
    const disk = emptyDisk()
    const { repo } = await open(disk, 'svuotato')
    repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })
    await repo.flush()

    disk.expenses = []
    disk.categories = []
    disk.settings = null

    expect(await repo.reloadFromDisk()).toEqual({ reloaded: false, reason: 'uninitialized-disk' })
    expect(repo.getState().expenses).toHaveLength(1)
    expect(repo.getState().categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
  })

  it('si tira indietro se qualcuno scrive mentre lei legge', async () => {
    const disk = emptyDisk()
    const { repo } = await open(disk, 'gara')
    const rilettura = repo.reloadFromDisk()
    // Nello stesso giro di eventi in cui la lettura e' in volo, l'utente tocca.
    const spesa = repo.addExpense({
      amountCents: 100,
      categoryId: 'cat-1',
      date: '2026-08-22',
    })

    expect(await rilettura).toEqual({ reloaded: false, reason: 'pending-writes' })
    expect(repo.getState().expenses).toEqual([spesa])
    await repo.flush()
  })

  it('si tira indietro anche se il mirror cambia senza scritture in coda', async () => {
    // Il caso vero: il risveglio e un catch-up che finisce mentre la lettura e'
    // in volo. La materializzazione riempie il mirror **dopo** che la sua
    // scrittura si e' conclusa, quindi qui non c'e' niente in coda: quello che
    // se ne accorge e' il contatore delle revisioni.
    const disk = emptyDisk()
    const inner = createMemoryPersistence(disk)
    let trattieni = false
    let rilascia: () => void = () => undefined
    const persistence: Persistence = {
      async loadAll() {
        if (trattieni) await new Promise<void>((resolve) => (rilascia = resolve))
        return inner.loadAll()
      },
      write: (batch) => inner.write(batch),
      replaceAll: (data) => inner.replaceAll(data),
      close: () => inner.close(),
    }
    const repo = await openRepository(persistence, {
      now: tickingClock(),
      newId: sequentialIds('lenta'),
    })
    repo.addRecurringRule({
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-08-01',
    })
    await repo.flush()

    trattieni = true
    const rilettura = repo.reloadFromDisk()
    await repo.materializeRecurring('2026-08-05')
    await repo.flush()
    rilascia()

    expect(await rilettura).toEqual({ reloaded: false, reason: 'mirror-changed' })
    expect(repo.getState().expenses).toHaveLength(5)
  })
})

describe('import: la coda e sua', () => {
  /** Una persistenza che si puo' rompere e riparare, per provare la ripresa. */
  function fragile(disk: MemoryDisk): { persistence: Persistence; fail: (on: boolean) => void } {
    const inner = createMemoryPersistence(disk)
    let failing = false
    return {
      persistence: {
        loadAll: () => inner.loadAll(),
        write: (batch) =>
          failing ? Promise.reject(new Error('disco non disponibile')) : inner.write(batch),
        replaceAll: (data) => inner.replaceAll(data),
        close: () => inner.close(),
      },
      fail: (on) => {
        failing = on
      },
    }
  }

  function vuoto(repo: Repository): DataSet {
    return {
      expenses: [],
      categories: [],
      recurringRules: [],
      budgets: [],
      settings: repo.getState().settings,
    }
  }

  it('un catch-up in volo non sopravvive all import: niente fusione fra due dataset', async () => {
    const disk = emptyDisk()
    const persistence = createMemoryPersistence(disk)
    const repo = await openRepository(persistence, {
      now: tickingClock(),
      newId: sequentialIds('imp'),
      recurrenceChunkSize: 5,
    })
    repo.addRecurringRule({
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-08-01',
    })
    await repo.flush()

    // Import chiesto mentre il catch-up e' a meta'. Prima `await queue`
    // fotografava la catena di quel momento e il catch-up la rilasciava fra un
    // blocco e l'altro: venti spese della regola precedente restavano sul disco
    // **insieme** ai dati importati.
    const catchUp = repo.materializeRecurring('2026-08-22')
    const annulla = await repo.importBackup(vuoto(repo))
    await expect(catchUp).rejects.toBeInstanceOf(MaterializationSupersededError)
    await repo.flush()

    expect(disk.expenses).toHaveLength(0)
    expect(disk.recurringRules).toHaveLength(0)
    expect(repo.getState().expenses).toHaveLength(0)
    // L'Annulla resta possibile: la regola e' nella fotografia di prima.
    expect(annulla.data.recurringRules).toHaveLength(1)
  })

  it('le mutazioni durante l import falliscono invece di mentire', async () => {
    const { repo } = await open()
    // Tutte chieste dentro la finestra dell'import, senza `await` in mezzo:
    // l'import in memoria dura una manciata di microtask.
    const inCorso = repo.importBackup(vuoto(repo))

    // Il caso vero: il toast dice "salvata", la riga sparisce un istante dopo e
    // la spesa fantasma riappare al prossimo avvio.
    expect(() =>
      repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' }),
    ).toThrow(ImportInProgressError)
    const durante = repo.materializeRecurring('2026-08-22')
    const secondo = repo.importBackup(vuoto(repo))
    const rilettura = repo.reloadFromDisk()

    await expect(durante).rejects.toBeInstanceOf(ImportInProgressError)
    await expect(secondo).rejects.toBeInstanceOf(ImportInProgressError)
    expect(await rilettura).toEqual({ reloaded: false, reason: 'import-in-progress' })

    await inCorso
    // Finito l'import si torna a lavorare normalmente.
    expect(repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })).toBeDefined()
    await repo.flush()
  })

  it('un import riuscito azzera il conto delle scritture perse, e solo lui', async () => {
    const disk = emptyDisk()
    const rotta = fragile(disk)
    const repo = await openRepository(rotta.persistence, {
      now: tickingClock(),
      newId: sequentialIds('az'),
    })

    rotta.fail(true)
    repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })
    await expect(repo.flush()).rejects.toThrow('disco non disponibile')
    expect(repo.getState().writeFailures.count).toBe(1)

    // Dopo un `replaceAll` riuscito mirror e disco sono uguali per costruzione:
    // e' l'unico punto in cui l'app sa che la divergenza non c'e' piu'.
    rotta.fail(false)
    await repo.importBackup(vuoto(repo))

    expect(repo.getState().writeFailures).toEqual({ count: 0, lastError: null, lastAt: null })
    await expect(repo.flush()).resolves.toBeUndefined()
    // E la rilettura al risveglio torna disponibile.
    expect(await repo.reloadFromDisk()).toEqual({ reloaded: true })
  })
})
