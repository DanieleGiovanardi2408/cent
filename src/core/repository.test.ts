import { describe, expect, it } from 'vitest'
import { parseBackup } from './backup'
import { MAX_ACTIVE_CATEGORIES, activeCategories } from './categories'
import { computeBudgetMetrics } from './budget'
import { isTimeMinutes, today } from './date'
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
import { previewMaterialization } from './recurring-plan'
import type { Persistence } from './persistence'
import { creaRegola, rivediRegola, sequentialIds, TEST_CATEGORY_NAMES, tickingClock } from './testing'
import type { DataSet, RecurringRule } from './types'

interface Fixture {
  readonly repo: Repository
  readonly disk: MemoryDisk
}

async function open(disk: MemoryDisk = emptyDisk(), prefix = 'id'): Promise<Fixture> {
  const repo = await openRepository(createMemoryPersistence(disk), {
    defaultCategoryNames: TEST_CATEGORY_NAMES,
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
    // Il nome della prima casella e' quello che il chiamante ha passato, non
    // uno che il core conosce: e' l'intera differenza fra prima e adesso.
    expect(repo.getState().categories[0]?.name).toBe(TEST_CATEGORY_NAMES.groceries)
    expect(repo.getState().categories.map((c) => c.order)).toEqual([10, 20, 30, 40, 50, 60, 70, 80])
  })

  it('riaprendo non ricrea niente', async () => {
    const { disk } = await open()
    const idsPrima = disk.categories.map((c) => c.id)
    const { repo } = await open(disk, 'secondo')
    expect(disk.categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
    expect(repo.getState().categories.map((c) => c.id)).toEqual(idsPrima)
  })

  it('semina i nomi che riceve, non nomi suoi', async () => {
    // La prova che nel core non e' rimasta nessuna parola: con un altro
    // dizionario esce un'altra griglia, e nient'altro cambia.
    const disk = emptyDisk()
    const repo = await openRepository(createMemoryPersistence(disk), {
      defaultCategoryNames: {
        groceries: 'Spesa',
        eatingOut: 'Fuori',
        coffeeshop: 'Coffeeshop',
        cigarettes: 'Sigarette',
        transport: 'Trasporti',
        leisure: 'Svago',
        home: 'Casa',
        extra: 'Extra',
      },
      now: tickingClock(),
      newId: sequentialIds('it'),
    })

    expect(repo.getState().categories.map((c) => c.name)).toEqual([
      'Spesa',
      'Fuori',
      'Coffeeshop',
      'Sigarette',
      'Trasporti',
      'Svago',
      'Casa',
      'Extra',
    ])
    expect(disk.categories.map((c) => c.order)).toEqual([10, 20, 30, 40, 50, 60, 70, 80])
  })

  it('riaprendo in un altra lingua non ritraduce niente: quelle categorie sono dell utente', async () => {
    // Il seme scrive una volta sola. Da quel momento i nomi sono dati
    // dell'utente — rinominarli e' cio' che l'editor serve a fare — e nessuna
    // riapertura, in nessuna lingua, li tocca. Non esiste nessuna migrazione
    // che li riscriva.
    const { disk } = await open()
    const primaScritti = disk.categories.map((c) => ({ id: c.id, name: c.name }))

    const riaperto = await openRepository(createMemoryPersistence(disk), {
      defaultCategoryNames: {
        groceries: 'Spesa',
        eatingOut: 'Fuori',
        coffeeshop: 'Coffeeshop',
        cigarettes: 'Sigarette',
        transport: 'Trasporti',
        leisure: 'Svago',
        home: 'Casa',
        extra: 'Extra',
      },
      now: tickingClock(),
      newId: sequentialIds('secondo'),
    })

    expect(riaperto.getState().categories.map((c) => ({ id: c.id, name: c.name }))).toEqual(
      primaScritti,
    )
    expect(disk.categories.map((c) => c.name)).toEqual(primaScritti.map((c) => c.name))
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
      defaultCategoryNames: TEST_CATEGORY_NAMES,
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

describe("l orario dell inserimento", () => {
  /** Un repository con l'orologio fermo su un istante deciso dal test. */
  async function apriAlle(istante: Date, disk: MemoryDisk = emptyDisk()): Promise<Fixture> {
    const repo = await openRepository(createMemoryPersistence(disk), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('id'),
      nowInstant: () => istante,
    })
    return { repo, disk }
  }

  const alle2040 = (): Date => new Date(2026, 7, 22, 20, 40, 12, 345)

  it('una spesa di oggi porta l ora in minuti dalla mezzanotte, senza chiederla', async () => {
    const { repo, disk } = await apriAlle(alle2040())
    const spesa = repo.addExpense({ amountCents: 1_250, categoryId: 'cat-1' })

    expect(spesa.date).toBe('2026-08-22')
    expect(spesa.timeMinutes).toBe(20 * 60 + 40)
    expect(Number.isInteger(spesa.timeMinutes)).toBe(true)

    // Ed e' un campo come gli altri: arriva al disco.
    await repo.flush()
    expect(disk.expenses[0]?.timeMinutes).toBe(1240)
  })

  it('vale anche quando la data di oggi e passata esplicitamente', async () => {
    const { repo } = await apriAlle(alle2040())
    const spesa = repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-22' })
    expect(spesa.timeMinutes).toBe(1240)
  })

  it('una spesa retrodatata non ha orario, e il campo non c e proprio', async () => {
    const { repo, disk } = await apriAlle(alle2040())
    const ieri = repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-21' })
    const altroGiorno = repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-01-03' })

    expect(ieri.timeMinutes).toBeUndefined()
    expect('timeMinutes' in ieri).toBe(false)
    expect(altroGiorno.timeMinutes).toBeUndefined()

    await repo.flush()
    expect(disk.expenses.every((e) => e.timeMinutes === undefined)).toBe(true)
  })

  it('una data futura non riceve un orario inventato', async () => {
    const { repo } = await apriAlle(alle2040())
    const domani = repo.addExpense({ amountCents: 100, categoryId: 'cat-1', date: '2026-08-23' })
    expect('timeMinutes' in domani).toBe(false)
  })

  it('legge l orologio una volta sola: a mezzanotte data e orario non si dividono', async () => {
    // Il bug che questo test esclude: chiedere prima il giorno e poi l'ora sono
    // due letture, e fra le due puo' passare la mezzanotte — spesa datata ieri
    // con l'orario di oggi, cioe' `2026-08-22` alle 00:00.
    const istanti = [
      new Date(2026, 7, 22, 23, 59, 59, 999),
      new Date(2026, 7, 23, 0, 0, 0, 0),
    ]
    let letture = 0
    const repo = await openRepository(createMemoryPersistence(emptyDisk()), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('id'),
      nowInstant: () => {
        const istante = istanti[Math.min(letture, istanti.length - 1)] as Date
        letture += 1
        return istante
      },
    })

    const spesa = repo.addExpense({ amountCents: 100, categoryId: 'cat-1' })
    expect(letture).toBe(1)
    expect(spesa.date).toBe('2026-08-22')
    expect(spesa.timeMinutes).toBe(1439)
  })

  it('mezzanotte in punto e 0, non "assente"', async () => {
    const { repo } = await apriAlle(new Date(2026, 7, 22, 0, 0, 0, 0))
    const spesa = repo.addExpense({ amountCents: 100, categoryId: 'cat-1' })
    expect(spesa.timeMinutes).toBe(0)
    expect('timeMinutes' in spesa).toBe(true)
  })

  it('correggere importo, categoria o nota non tocca l orario', async () => {
    const { repo } = await apriAlle(alle2040())
    const spesa = repo.addExpense({ amountCents: 100, categoryId: 'cat-1' })

    expect(repo.updateExpense(spesa.id, { amountCents: 250 })?.timeMinutes).toBe(1240)
    expect(repo.updateExpense(spesa.id, { categoryId: 'cat-2' })?.timeMinutes).toBe(1240)
    expect(repo.updateExpense(spesa.id, { note: 'poi' })?.timeMinutes).toBe(1240)
    // Anche riscrivere la stessa data e' restare sullo stesso giorno.
    expect(repo.updateExpense(spesa.id, { date: '2026-08-22' })?.timeMinutes).toBe(1240)
  })

  it('spostare la spesa a un altro giorno fa cadere l orario invece di portarselo dietro', async () => {
    const { repo, disk } = await apriAlle(alle2040())
    const spesa = repo.addExpense({ amountCents: 100, categoryId: 'cat-1' })
    expect(spesa.timeMinutes).toBe(1240)

    const spostata = repo.updateExpense(spesa.id, { date: '2026-08-20' })
    expect(spostata?.date).toBe('2026-08-20')
    expect(spostata?.timeMinutes).toBeUndefined()
    expect(spostata && 'timeMinutes' in spostata).toBe(false)

    // E non resuscita rimettendo la data di prima: quell'ora non e' mai stata
    // osservata sul giorno 22 piu' di quanto lo sia sul 20.
    const tornata = repo.updateExpense(spesa.id, { date: '2026-08-22' })
    expect(tornata && 'timeMinutes' in tornata).toBe(false)

    await repo.flush()
    expect(disk.expenses[0]?.timeMinutes).toBeUndefined()
  })

  it('cancellare e ripristinare non perdono l orario', async () => {
    const { repo } = await apriAlle(alle2040())
    const spesa = repo.addExpense({ amountCents: 100, categoryId: 'cat-1' })
    expect(repo.deleteExpense(spesa.id)?.timeMinutes).toBe(1240)
    expect(repo.restoreExpense(spesa.id)?.timeMinutes).toBe(1240)
  })

  it('le spese generate da una ricorrenza non hanno orario: nessuno le ha inserite', async () => {
    const { repo } = await apriAlle(alle2040())
    // L'orologio del repository e' fermo al 22 agosto: l'anteprima va calcolata
    // **su quel giorno**, o la scrittura rifiuta con `stale-preview`. E' la
    // guardia che fa il suo mestiere, non un fastidio del test.
    creaRegola(
      repo,
      {
        amountCents: 900,
        categoryId: 'cat-1',
        cadence: 'daily',
        interval: 1,
        startDate: '2026-08-20',
      },
      '2026-08-22',
    )
    await repo.materializeRecurring()

    const generate = repo.getState().expenses.filter((e) => e.source === 'recurring')
    expect(generate.length).toBeGreaterThan(0)
    expect(generate.every((e) => !('timeMinutes' in e))).toBe(true)
    // Anche quella di oggi: la regola l'avrebbe generata comunque, a qualunque ora.
    expect(generate.some((e) => e.date === '2026-08-22')).toBe(true)
  })

  it('senza orologio iniettato la data di default resta quella di sistema', async () => {
    const { repo } = await open()
    const spesa = repo.addExpense({ amountCents: 100, categoryId: 'cat-1' })
    expect(spesa.date).toBe(today())
    expect(isTimeMinutes(spesa.timeMinutes)).toBe(true)
  })
})

describe('scritture fallite: lo stato non guarisce da solo', () => {
  /** Un repository la cui persistenza muore alla prima scrittura utile. */
  async function rotto(): Promise<Fixture> {
    const disk = emptyDisk()
    const persistence = createMemoryPersistence(disk)
    const repo = await openRepository(persistence, {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
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

describe('categorie: il tetto di otto attive', () => {
  it('con la griglia piena, aggiungere senza sostituire viene rifiutato', async () => {
    const { repo, disk } = await open()
    // Le otto di default riempiono esattamente il tetto: e' lo stato in cui si
    // trova ogni utente al primo avvio.
    const esito = await repo.addCategory({ name: 'Musei', emoji: '🏛️', color: '#123456' })

    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.reason).toBe('grid-full')
    // Rifiutata davvero: niente nel mirror e niente sul disco.
    expect(repo.getState().categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
    expect(disk.categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
  })

  it('lo scambio e una scrittura sola: una esce, una entra, e prende il suo posto', async () => {
    const { repo, disk } = await open()
    const sigarette = repo.getState().categories.find((c) => c.name === 'Cigarettes')

    const esito = await repo.addCategory(
      { name: 'Musei', emoji: '🏛️', color: '#123456' },
      sigarette?.id,
    )

    expect(esito.ok).toBe(true)
    if (!esito.ok) return
    expect(esito.placed.name).toBe('Musei')
    expect(esito.archived?.name).toBe('Cigarettes')
    // Prende la cella di chi esce: le altre sette non si spostano.
    expect(esito.placed.order).toBe(sigarette?.order)
    expect(activeCategories(disk.categories)).toHaveLength(MAX_ACTIVE_CATEGORIES)
    expect(disk.categories.find((c) => c.id === sigarette?.id)?.archived).toBe(true)
  })

  it('lo scambio non puo restare a meta: se la scrittura muore, non cambia niente', async () => {
    const { repo, disk } = await open()
    const persistence = createMemoryPersistence(disk)
    const secondo = await openRepository(persistence, {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('due'),
    })
    const sigarette = secondo.getState().categories.find((c) => c.name === 'Cigarettes')
    persistence.crashAfter(1)

    await expect(
      secondo.addCategory({ name: 'Musei', emoji: '🏛️', color: '#123456' }, sigarette?.id),
    ).rejects.toThrow(SimulatedCrashError)

    // Ne' l'archiviazione ne' l'aggiunta: sono lo stesso gesto e la stessa
    // transazione. Sette categorie in griglia sarebbero lo stato peggiore.
    expect(disk.categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
    expect(disk.categories.every((c) => !c.archived)).toBe(true)
    expect(secondo.getState().categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
    expect(activeCategories(secondo.getState().categories)).toHaveLength(MAX_ACTIVE_CATEGORIES)
    repo.close()
  })

  it('il tetto lo conta il disco, non il mirror', async () => {
    const { repo, disk } = await open()
    // Due contesti sullo stesso database. Il primo archivia; il secondo ha il
    // mirror di prima, quindi crede che ci sia posto.
    const secondo = await openRepository(createMemoryPersistence(disk), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('due'),
    })
    const casa = repo.getState().categories.find((c) => c.name === 'Home')
    repo.archiveCategory(casa?.id ?? '')
    await repo.flush()

    // Il secondo contesto vede ancora otto attive nel proprio mirror e chiede
    // uno scambio; il primo ne vede sette. Nessuno dei due decide: decide il disco.
    const esito = await secondo.addCategory({ name: 'Musei', emoji: '🏛️', color: '#123456' })

    expect(esito.ok).toBe(true)
    expect(activeCategories(disk.categories)).toHaveLength(MAX_ACTIVE_CATEGORIES)
  })

  it('rinominare da un mirror vecchio non riporta in griglia cio che e stato archiviato altrove', async () => {
    const { repo, disk } = await open()
    const secondo = await openRepository(createMemoryPersistence(disk), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('due'),
    })
    const casa = repo.getState().categories.find((c) => c.name === 'Home')
    repo.archiveCategory(casa?.id ?? '')
    await repo.flush()

    // Il secondo ha in mirror la copia con `archived: false`: un put del record
    // intero la rimetterebbe in griglia, e sarebbe la nona.
    secondo.updateCategory(casa?.id ?? '', { name: 'Affitto' })
    await secondo.flush()

    const suDisco = disk.categories.find((c) => c.id === casa?.id)
    expect(suDisco?.name).toBe('Affitto')
    expect(suDisco?.archived).toBe(true)
    expect(activeCategories(disk.categories)).toHaveLength(MAX_ACTIVE_CATEGORIES - 1)
  })

  it('archiviare libera un posto, e allora aggiungere basta', async () => {
    const { repo } = await open()
    const svago = repo.getState().categories.find((c) => c.name === 'Leisure')
    expect(repo.archiveCategory(svago?.id ?? '')?.archived).toBe(true)
    // Archiviata due volte: la seconda non e' un cambiamento.
    expect(repo.archiveCategory(svago?.id ?? '')).toBeNull()

    const esito = await repo.addCategory({ name: 'Musei', emoji: '🏛️', color: '#123456' })
    expect(esito.ok).toBe(true)
    // In fondo, non nella cella liberata: senza `replacing` non c'e' nessun
    // posto da ereditare.
    expect(esito.ok === true && esito.placed.order).toBe(90)
  })

  it('archiviare non cancella: la categoria resta su tutte le spese', async () => {
    const { repo, disk } = await open()
    const svago = repo.getState().categories.find((c) => c.name === 'Leisure')
    repo.addExpense({ amountCents: 1_200, categoryId: svago?.id ?? '', date: '2026-08-22' })
    repo.archiveCategory(svago?.id ?? '')
    await repo.flush()

    expect(disk.categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
    expect(disk.expenses[0]?.categoryId).toBe(svago?.id)
  })

  it('una archiviata torna in griglia solo scambiandola', async () => {
    const { repo } = await open()
    const svago = repo.getState().categories.find((c) => c.name === 'Leisure')
    const casa = repo.getState().categories.find((c) => c.name === 'Home')
    repo.archiveCategory(svago?.id ?? '')
    await repo.addCategory({ name: 'Musei', emoji: '🏛️', color: '#123456' })

    // Griglia di nuovo piena: senza sostituzione non rientra.
    const rifiutata = await repo.unarchiveCategory(svago?.id ?? '')
    expect(rifiutata.ok === false && rifiutata.reason).toBe('grid-full')

    const esito = await repo.unarchiveCategory(svago?.id ?? '', casa?.id)
    expect(esito.ok).toBe(true)
    expect(esito.ok === true && esito.placed.name).toBe('Leisure')
    expect(esito.ok === true && esito.archived?.name).toBe('Home')
    expect(activeCategories(repo.getState().categories)).toHaveLength(MAX_ACTIVE_CATEGORIES)
  })

  it('gli id impossibili si dicono, non si indovinano', async () => {
    const { repo } = await open()
    const primo = repo.getState().categories[0]
    const perFarPosto = repo.getState().categories[1]

    const sconosciuta = await repo.unarchiveCategory('non-esiste', perFarPosto?.id)
    expect(sconosciuta.ok === false && sconosciuta.reason).toBe('unknown-category')

    const giaAttiva = await repo.unarchiveCategory(primo?.id ?? '', perFarPosto?.id)
    expect(giaAttiva.ok === false && giaAttiva.reason).toBe('already-active')

    const sostituzioneIgnota = await repo.addCategory(
      { name: 'Musei', emoji: '🏛️', color: '#123456' },
      'non-esiste',
    )
    expect(sostituzioneIgnota.ok === false && sostituzioneIgnota.reason).toBe('unknown-replacement')

    expect(repo.archiveCategory('non-esiste')).toBeNull()
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

describe('categorie: cancellare davvero', () => {
  it('si puo solo se nessuno la nomina', async () => {
    const { repo, disk } = await open()
    const svago = repo.getState().categories.find((c) => c.name === 'Leisure')
    const esito = await repo.deleteCategory(svago?.id ?? '')

    expect(esito.ok).toBe(true)
    expect(repo.getState().categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length - 1)
    expect(disk.categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length - 1)
  })

  it('una spesa viva la trattiene, e il rifiuto dice quante', async () => {
    const { repo, disk } = await open()
    const svago = repo.getState().categories.find((c) => c.name === 'Leisure')
    repo.addExpense({ amountCents: 1_200, categoryId: svago?.id ?? '', date: '2026-08-22' })
    repo.addExpense({ amountCents: 300, categoryId: svago?.id ?? '', date: '2026-08-22' })
    await repo.flush()

    const esito = await repo.deleteCategory(svago?.id ?? '')
    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.reason).toBe('in-use')
    expect(esito.ok === false && esito.reason === 'in-use' && esito.expenses).toBe(2)
    expect(disk.categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
  })

  it('una spesa cancellata la trattiene lo stesso, ma con deleted-only e senza numeri', async () => {
    // La lapide blocca — `restoreExpense` la riporta in vita in un tap, e la
    // riga che torna dereferenzia `categoryId` — ma non e' citabile: nello
    // Storico non si vede. Quindi il rifiuto cambia forma, non severita'.
    const { repo, disk } = await open()
    const svago = repo.getState().categories.find((c) => c.name === 'Leisure')
    const spesa = repo.addExpense({
      amountCents: 1_200,
      categoryId: svago?.id ?? '',
      date: '2026-08-22',
    })
    repo.deleteExpense(spesa.id)
    await repo.flush()

    const esito = await repo.deleteCategory(svago?.id ?? '')
    expect(esito).toEqual({ ok: false, reason: 'deleted-only' })
    expect(disk.categories.some((c) => c.id === svago?.id)).toBe(true)

    // E il ripristino, che e' la ragione per cui blocca, funziona ancora.
    repo.restoreExpense(spesa.id)
    await repo.flush()
    const dopo = await repo.deleteCategory(svago?.id ?? '')
    expect(dopo).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 1,
      recurringRules: 0,
      budgets: 0,
    })
  })

  it('una regola ricorrente la trattiene: genererebbe orfane per sempre', async () => {
    const { repo } = await open()
    const svago = repo.getState().categories.find((c) => c.name === 'Leisure')
    creaRegola(repo, {
      amountCents: 90_000,
      categoryId: svago?.id ?? '',
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-08-01',
    })
    await repo.flush()

    const esito = await repo.deleteCategory(svago?.id ?? '')
    expect(esito.ok === false && esito.reason).toBe('in-use')
    expect(esito.ok === false && esito.reason === 'in-use' && esito.recurringRules).toBe(1)
  })

  it('un budget di categoria la trattiene: e un orfano che nessuna schermata vedrebbe', async () => {
    // Non e' raggiungibile dalla UI di oggi (il foglio del budget non scrive
    // `categoryId`), lo diventa con l'import della fase 7. Un budget che punta a
    // una categoria cancellata resta li' per sempre: `resolveBudget` continua a
    // sceglierlo e nessuna schermata puo' ne' mostrarlo ne' toglierlo.
    const { repo, disk } = await open()
    const leisure = repo.getState().categories.find((c) => c.name === 'Leisure')
    repo.setBudget({
      period: 'monthly',
      amountCents: 20_000,
      categoryId: leisure?.id ?? '',
      effectiveFrom: '2026-08-01',
    })
    await repo.flush()

    const esito = await repo.deleteCategory(leisure?.id ?? '')
    expect(esito.ok === false && esito.reason).toBe('in-use')
    expect(esito.ok === false && esito.reason === 'in-use' && esito.budgets).toBe(1)
    expect(disk.categories).toHaveLength(DEFAULT_CATEGORY_SEEDS.length)
  })

  it('il budget generale non trattiene niente: altrimenti niente sarebbe piu cancellabile', async () => {
    const { repo } = await open()
    const leisure = repo.getState().categories.find((c) => c.name === 'Leisure')
    repo.setBudget({ period: 'monthly', amountCents: 80_000, effectiveFrom: '2026-08-01' })
    await repo.flush()

    const esito = await repo.deleteCategory(leisure?.id ?? '')
    expect(esito.ok).toBe(true)
  })

  it('il permesso lo da il disco: una spesa scritta da un altro contesto conta', async () => {
    const { repo, disk } = await open()
    const secondo = await openRepository(createMemoryPersistence(disk), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('due'),
    })
    const svago = repo.getState().categories.find((c) => c.name === 'Leisure')
    // Il secondo contesto scrive una spesa che il mirror del primo non vedra' mai.
    secondo.addExpense({ amountCents: 500, categoryId: svago?.id ?? '', date: '2026-08-22' })
    await secondo.flush()

    const esito = await repo.deleteCategory(svago?.id ?? '')
    expect(esito.ok === false && esito.reason).toBe('in-use')
    expect(disk.categories.some((c) => c.id === svago?.id)).toBe(true)
  })

  it('un id che non esiste non e un errore, e una risposta', async () => {
    const { repo } = await open()
    const esito = await repo.deleteCategory('non-esiste')
    expect(esito.ok === false && esito.reason).toBe('unknown')
  })
})

describe('ricorrenti: cancellare davvero una regola', () => {
  const nuovaRegola = {
    amountCents: 90_000,
    categoryId: 'cat-1',
    cadence: 'monthly' as const,
    interval: 1,
    startDate: '2026-08-01',
  }

  it('una regola che non ha mai generato niente si cancella, dal mirror e dal disco', async () => {
    const { repo, disk } = await open()
    const regola = creaRegola(repo, nuovaRegola)
    await repo.flush()

    const esito = await repo.deleteRecurringRule(regola.id)
    expect(esito.ok).toBe(true)
    expect(repo.getState().recurringRules).toHaveLength(0)
    expect(disk.recurringRules).toHaveLength(0)
  })

  it('dopo la materializzazione non si cancella piu, e le spese restano', async () => {
    const { repo, disk } = await open()
    const regola = creaRegola(repo, nuovaRegola)
    await repo.flush()
    await repo.materializeRecurring('2026-08-22')

    const generate = disk.expenses.filter((e) => e.recurringId === regola.id).length
    expect(generate).toBe(1)

    const esito = await repo.deleteRecurringRule(regola.id)
    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.reason).toBe('in-use')
    expect(esito.ok === false && esito.reason === 'in-use' && esito.expenses).toBe(1)
    // La regola resta, e soprattutto la storia non cambia: le spese generate
    // sono ancora tutte li'.
    expect(disk.recurringRules).toHaveLength(1)
    expect(disk.expenses.filter((e) => e.recurringId === regola.id)).toHaveLength(1)
  })

  it('disattivare si puo sempre, anche quando cancellare non si puo', async () => {
    const { repo } = await open()
    const regola = creaRegola(repo, nuovaRegola)
    await repo.flush()
    await repo.materializeRecurring('2026-08-22')

    expect((await repo.deleteRecurringRule(regola.id)).ok).toBe(false)
    const spenta = repo.deactivateRecurringRule(regola.id)
    expect(spenta?.active).toBe(false)
  })

  it('cancellate tutte le istanze, la regola si cancella davvero', async () => {
    // L uscita che prima non c era: una regola creata per sbaglio, le cui spese
    // sono state cancellate, restava per sempre citando un numero invisibile.
    const { repo, disk } = await open()
    const regola = creaRegola(repo, nuovaRegola)
    await repo.flush()
    await repo.materializeRecurring('2026-08-22')
    const generate = disk.expenses.filter((e) => e.recurringId === regola.id)
    expect(generate.length).toBeGreaterThan(0)
    for (const spesa of generate) repo.deleteExpense(spesa.id)
    await repo.flush()

    const esito = await repo.deleteRecurringRule(regola.id)
    expect(esito.ok).toBe(true)
    expect(disk.recurringRules).toHaveLength(0)
    // Le lapidi restano dove sono: la storia non cambia retroattivamente.
    expect(disk.expenses.filter((e) => e.recurringId === regola.id)).toHaveLength(generate.length)
  })

  it('basta una istanza viva per trattenere, e il numero e quello visibile', async () => {
    const { repo, disk } = await open()
    const regola = creaRegola(repo, { ...nuovaRegola, cadence: 'daily', startDate: '2026-08-20' })
    await repo.flush()
    await repo.materializeRecurring('2026-08-22')
    const generate = disk.expenses.filter((e) => e.recurringId === regola.id)
    expect(generate).toHaveLength(3)
    for (const spesa of generate.slice(1)) repo.deleteExpense(spesa.id)
    await repo.flush()

    const esito = await repo.deleteRecurringRule(regola.id)
    expect(esito).toMatchObject({ ok: false, reason: 'in-use', expenses: 1 })
  })

  it('il permesso lo da il disco: una spesa materializzata da un altro contesto conta', async () => {
    const { repo, disk } = await open()
    const regola = creaRegola(repo, nuovaRegola)
    await repo.flush()

    const secondo = await openRepository(createMemoryPersistence(disk), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('due'),
    })
    await secondo.materializeRecurring('2026-08-22')

    // Il mirror del primo contesto non ha mai visto quella spesa.
    expect(repo.getState().expenses.filter((e) => e.recurringId === regola.id)).toHaveLength(0)
    const esito = await repo.deleteRecurringRule(regola.id)
    expect(esito.ok === false && esito.reason).toBe('in-use')
    expect(disk.recurringRules).toHaveLength(1)
  })

  it('un id che non esiste non e un errore, e una risposta', async () => {
    const { repo } = await open()
    expect((await repo.deleteRecurringRule('non-esiste')).ok === false).toBe(true)
    const esito = await repo.deleteRecurringRule('non-esiste')
    expect(esito.ok === false && esito.reason).toBe('unknown')
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

  it('il piano ottimistico e quello del disco coincidono quando nessuno ha scritto altrove', async () => {
    const { repo, disk } = await open()
    repo.setBudget({ period: 'monthly', amountCents: 100_000, effectiveFrom: '2026-01-01' })
    await repo.flush()
    const restituito = repo.setBudget({
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: '2026-08-22',
    })
    const mirrorPrimaDelDisco = repo.getState().budgets
    await repo.flush()

    // Il valore restituito serve al feedback immediato; a scrittura conclusa il
    // mirror non si e' mosso di nuovo, perche' il disco ha deciso lo stesso.
    expect(restituito).toHaveLength(2)
    expect(repo.getState().budgets).toEqual(mirrorPrimaDelDisco)
    expect(disk.budgets).toHaveLength(2)
  })
})

/**
 * La sovrapposizione di budget e' l'unico dato sporco di quest'app che l'utente
 * non ha nessun modo di correggere: nessuna schermata mostra i record
 * storicizzati, e la Home continua a mostrare un numero plausibile scelto fra i
 * due. Per questo il piano non si fa piu' sul mirror.
 */
describe('budget: quali record chiudere lo decide il disco', () => {
  it('un contesto con il mirror vecchio chiude comunque il budget aperto altrove', async () => {
    const disk = emptyDisk()
    const a = await open(disk, 'a')
    // B apre e resta viva: da qui il suo mirror invecchia.
    const b = await open(disk, 'b')

    a.repo.setBudget({ period: 'monthly', amountCents: 100_000, effectiveFrom: '2026-08-01' })
    await a.repo.flush()

    // B quel record non l'ha mai visto. Pianificando dal proprio mirror apriva
    // il secondo senza chiudere il primo: due record aperti sovrapposti, sul
    // disco, per sempre.
    b.repo.setBudget({ period: 'monthly', amountCents: 80_000, effectiveFrom: '2026-08-22' })
    await b.repo.flush()

    expect(disk.budgets).toHaveLength(2)
    const aperti = disk.budgets.filter((x) => x.effectiveTo === undefined)
    expect(aperti).toHaveLength(1)
    expect(aperti[0]?.amountCents).toBe(80_000)
    expect(disk.budgets.find((x) => x.amountCents === 100_000)?.effectiveTo).toBe('2026-08-21')

    // E il mirror di B si allinea a cio' che la transazione ha scritto davvero:
    // si ritrova anche il record che non sapeva di aver chiuso.
    expect(b.repo.getState().budgets).toHaveLength(2)
    expect(b.repo.getState().budgets.filter((x) => x.effectiveTo === undefined)).toHaveLength(1)
  })

  it('due contesti, lo stesso giorno: un record solo, e nessun fantasma nel mirror', async () => {
    const disk = emptyDisk()
    const a = await open(disk, 'a')
    const b = await open(disk, 'b')

    a.repo.setBudget({ period: 'monthly', amountCents: 100_000, effectiveFrom: '2026-08-22' })
    await a.repo.flush()
    b.repo.setBudget({ period: 'monthly', amountCents: 80_000, effectiveFrom: '2026-08-22' })
    await b.repo.flush()

    // Stesso `effectiveFrom`: il disco aggiorna sul posto invece di aprirne un
    // altro, altrimenti resterebbero due record che valgono dallo stesso giorno.
    expect(disk.budgets).toHaveLength(1)
    expect(disk.budgets[0]?.amountCents).toBe(80_000)

    // B aveva aperto un record in via ottimistica: il disco non l'ha aperto, e
    // il mirror se ne libera invece di tenersi la sovrapposizione in casa.
    const suB = b.repo.getState().budgets
    expect(suB).toHaveLength(1)
    expect(suB[0]?.id).toBe(disk.budgets[0]?.id)
    expect(suB[0]?.amountCents).toBe(80_000)
  })

  it('due cambi di fila nello stesso contesto restano un record solo', async () => {
    const { repo, disk } = await open()
    repo.setBudget({ period: 'monthly', amountCents: 100_000, effectiveFrom: '2026-08-22' })
    repo.setBudget({ period: 'monthly', amountCents: 90_000, effectiveFrom: '2026-08-22' })
    await repo.flush()

    expect(disk.budgets).toHaveLength(1)
    expect(disk.budgets[0]?.amountCents).toBe(90_000)
    expect(repo.getState().budgets).toHaveLength(1)
    expect(repo.getState().budgets[0]?.amountCents).toBe(90_000)
  })

  it('se la scrittura non arriva al disco il mirror tiene il piano ottimistico', async () => {
    const disk = emptyDisk()
    const persistence = createMemoryPersistence(disk)
    const repo = await openRepository(persistence, {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('x'),
    })
    persistence.crashAfter(1)
    repo.setBudget({ period: 'monthly', amountCents: 100_000, effectiveFrom: '2026-08-22' })
    await expect(repo.flush()).rejects.toBeInstanceOf(SimulatedCrashError)

    // Nessuna riconciliazione: il mirror e' l'unica copia di quel record, come
    // per ogni altra scrittura persa, e lo stato lo dice.
    expect(repo.getState().budgets).toHaveLength(1)
    expect(repo.getState().writeFailures.count).toBe(1)
    expect(disk.budgets).toHaveLength(0)
  })
})

describe('ricorrenze dal repository', () => {
  it('materializza, aggiorna il mirror e non duplica alle aperture successive', async () => {
    const { repo, disk } = await open()
    creaRegola(repo, {
      amountCents: 90_000,
      categoryId: 'cat-1',
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-06-01',
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
    creaRegola(repo, {
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
    const regola = creaRegola(repo, {
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
    const regola = creaRegola(repo, {
      amountCents: 500,
      categoryId: 'cat-1',
      cadence: 'daily',
      interval: 1,
      startDate: '2026-08-20',
    })
    await repo.materializeRecurring('2026-08-21')
    repo.deactivateRecurringRule(regola.id)
    await repo.materializeRecurring('2026-08-30')
    expect(repo.getState().expenses).toHaveLength(2)
  })

  it('due materializzazioni in parallelo nello stesso contesto: una spesa per giorno', async () => {
    // La riproduzione del bloccante, dal lato del repository. Passa per il lock
    // (le due chiamate si dividono la stessa promise), ma il test che conta
    // davvero e' quello su due repository distinti in `idb.test.ts`: li' il
    // lock non c'e' proprio.
    const { repo, disk } = await open()
    creaRegola(repo, {
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
    creaRegola(repo, {
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
    creaRegola(repo, {
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

  it('una regola con intervallo assurdo non arriva nemmeno a un permesso di scrittura', async () => {
    // Prima questo controllo stava in `addRecurringRule`, che lanciava. Adesso
    // il calendario entra in una regola **solo** passando dall'anteprima,
    // quindi il controllo sta li' — e non lancia: risponde. E' la stessa
    // ragione per cui non lanciava gia' prima, cioe' che questa funzione gira
    // mentre l'utente sta ancora scrivendo i campi.
    const { repo } = await open()
    const anteprima = previewMaterialization(
      { amountCents: 500, cadence: 'daily', interval: 0, startDate: '2026-08-20' },
      today(),
    )
    expect(anteprima.ok).toBe(false)
    expect(anteprima.ok === false && anteprima.reason).toContain('interval')
    // E senza `ok: true` non c'e' nessun `confirmed` da passare: la scrittura
    // di una regola con `interval: 0` non e' vietata, e' inesprimibile.
    expect(repo.getState().recurringRules).toHaveLength(0)
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
    creaRegola(repo, {
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

  it('al primo avvio lingua e guida nascono assenti, non indovinate', async () => {
    const { repo, disk } = await open()
    const settings = repo.getState().settings

    // `src/core` non conosce `navigator`: scrivere una lingua qui vorrebbe dire
    // registrare una scelta che nessuno ha fatto.
    expect('language' in settings).toBe(false)
    expect('onboardingCompletedAt' in settings).toBe(false)
    expect(disk.settings && 'language' in disk.settings).toBe(false)
  })

  it('la lingua si sceglie, e si puo tornare a non averla scelta', async () => {
    const { repo, disk } = await open()

    expect(repo.updateSettings({ language: 'en' }).language).toBe('en')
    await repo.flush()
    expect(disk.settings?.language).toBe('en')

    // `null` la riporta ad assente: senza questo verso, "Automatica" non
    // potrebbe esistere in Impostazioni e la prima scelta sarebbe definitiva.
    const azzerata = repo.updateSettings({ language: null })
    expect('language' in azzerata).toBe(false)
    await repo.flush()
    expect(disk.settings && 'language' in disk.settings).toBe(false)
  })

  it('la guida si chiude una volta sola, e si puo far riapparire', async () => {
    const { repo } = await open()
    const chiusa = repo.updateSettings({ onboardingCompletedAt: '2026-08-23T10:00:00.000Z' })
    expect(chiusa.onboardingCompletedAt).toBe('2026-08-23T10:00:00.000Z')

    // Cambiare tema non la riapre: un patch parziale non tocca gli altri campi.
    expect(repo.updateSettings({ theme: 'dark' }).onboardingCompletedAt).toBe(
      '2026-08-23T10:00:00.000Z',
    )
    expect('onboardingCompletedAt' in repo.updateSettings({ onboardingCompletedAt: null })).toBe(
      false,
    )
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
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('cu'),
      onWriteError: (error) => errori.push(error),
      recurrenceChunkSize: 5,
    })
    creaRegola(repo, {
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
    const regola = creaRegola(a.repo, {
      amountCents: 90_000,
      categoryId: 'cat-1',
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-06-01',
    })
    await a.repo.flush()

    // B apre e resta viva: da qui il suo mirror invecchia.
    const b = await open(disk, 'b')

    rivediRegola(a.repo, regola.id, {
      amountCents: 92_000,
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-06-01',
    })
    a.repo.deactivateRecurringRule(regola.id)
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
    const regola = creaRegola(a.repo, {
      amountCents: 90_000,
      categoryId: 'cat-1',
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-06-01',
    })
    await a.repo.flush()

    const b = await open(disk, 'b')
    a.repo.deactivateRecurringRule(regola.id)
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
      defaultCategoryNames: TEST_CATEGORY_NAMES,
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
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('lenta'),
    })
    creaRegola(repo, {
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
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('imp'),
      recurrenceChunkSize: 5,
    })
    creaRegola(repo, {
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
      defaultCategoryNames: TEST_CATEGORY_NAMES,
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

describe('l anteprima e obbligatoria nel tipo, e scade a mezzanotte', () => {
  /** Un repository il cui giorno civile lo decide il test, e puo' cambiare. */
  async function apriConOrologio(
    orologio: () => Date,
    disk: MemoryDisk = emptyDisk(),
  ): Promise<Fixture> {
    const repo = await openRepository(createMemoryPersistence(disk), {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('mn'),
      nowInstant: orologio,
    })
    return { repo, disk }
  }

  const bozzaAffitto = {
    amountCents: 90_000,
    cadence: 'monthly' as const,
    interval: 1,
    startDate: '2026-01-01',
  }

  /* --------------------------------------------------------------------- *
   * Il tipo
   * --------------------------------------------------------------------- */

  it('senza anteprima non compila, e senza anteprima valida non c e niente da passare', async () => {
    // Queste tre righe sono l'asserzione: `tsc --noEmit` gira su questo file, e
    // un `@ts-expect-error` che **non** trova un errore fa fallire il
    // typecheck. E' il modo in cui questa suite verifica una cosa che a runtime
    // non si puo' verificare — che una chiamata sbagliata non esista.
    const { repo } = await apriConOrologio(() => new Date(2026, 7, 22, 12, 0))

    /** Mai eseguita: se lo fosse lancerebbe. Serve solo a farla leggere a `tsc`. */
    const nonCompila = (): void => {
      // @ts-expect-error manca il permesso: chi salta l'anteprima non compila.
      repo.addRecurringRule({ categoryId: 'cat-1' })
      // @ts-expect-error un booleano non e' un permesso, ed e' tutto il punto.
      repo.addRecurringRule({ categoryId: 'cat-1' }, true)
      // @ts-expect-error il calendario non entra piu' da questa porta.
      repo.addRecurringRule({ categoryId: 'cat-1', startDate: '2026-01-01' }, undefined)
    }

    expect(nonCompila).toBeTypeOf('function')
    // E niente e' finito nel mirror: le righe qui sopra non sono mai girate, e
    // soprattutto non esistono.
    expect(repo.getState().recurringRules).toHaveLength(0)
  })

  it('cio che puo generare arretrati non e scrivibile dalla porta senza pedaggio', async () => {
    const { repo } = await apriConOrologio(() => new Date(2026, 7, 22, 12, 0))
    const regola = creaRegola(repo, { ...bozzaAffitto, categoryId: 'cat-1' }, '2026-08-22')

    /** Mai eseguita, come sopra: l'asserzione la fa il typecheck. */
    const nonCompila = (): void => {
      // @ts-expect-error spostare `startDate` indietro e' generazione retroattiva.
      repo.updateRecurringRule(regola.id, { startDate: '2020-01-01' })
      // @ts-expect-error riaccendere una regola dormiente lo e' altrettanto.
      repo.updateRecurringRule(regola.id, { active: true })
      // @ts-expect-error `amountCents` entra in `totalCents`, cioe' in un numero annunciato.
      repo.updateRecurringRule(regola.id, { amountCents: 95_000 })
    }

    expect(nonCompila).toBeTypeOf('function')
    expect(repo.getState().recurringRules[0]?.startDate).toBe('2026-01-01')
    expect(repo.getState().recurringRules[0]?.amountCents).toBe(90_000)
  })

  /* --------------------------------------------------------------------- *
   * La mezzanotte, davvero
   * --------------------------------------------------------------------- */

  it('anteprima calcolata il 22, scrittura tentata il 23: rifiuta e non scrive niente', async () => {
    // Il caso vero: foglio aperto alle 23:59:50, confermato alle 00:00:05. Non
    // si aspetta nessun orologio — lo si sposta, che e' l'unica cosa che nella
    // realta' lo sposta.
    let istante = new Date(2026, 7, 22, 23, 59, 50)
    const { repo, disk } = await apriConOrologio(() => istante)

    const giornaliera = {
      amountCents: 1_000,
      cadence: 'daily' as const,
      interval: 1,
      startDate: '2026-08-15',
    }
    const anteprima = previewMaterialization(giornaliera, '2026-08-22')
    if (!anteprima.ok) throw new Error('anteprima rifiutata')
    // Cio' che l'utente ha letto e confermato: otto spese, 80,00 €.
    expect(anteprima.count).toBe(8)
    expect(anteprima.totalCents).toBe(8_000)
    expect(anteprima.backdated).toBe(true)

    // Passa la mezzanotte mentre il foglio e' aperto.
    istante = new Date(2026, 7, 23, 0, 0, 5)

    const esito = repo.addRecurringRule({ categoryId: 'cat-1' }, anteprima.confirmed)
    expect(esito).toEqual({
      ok: false,
      reason: 'stale-preview',
      previewedOn: '2026-08-22',
      today: '2026-08-23',
    })

    // E il rifiuto e' un rifiuto: niente nel mirror, niente sul disco.
    expect(repo.getState().recurringRules).toHaveLength(0)
    await repo.flush()
    expect(disk.recurringRules).toHaveLength(0)
    expect(disk.expenses).toHaveLength(0)
  })

  it('l occorrenza in piu che il rifiuto ha evitato e reale: nove invece di otto', async () => {
    // La prova che il rifiuto non e' pedanteria. Stessa bozza, stesso foglio:
    // ricalcolando dopo la mezzanotte l'anteprima ne annuncia **nove**, e nove
    // sono quelle che la materializzazione scrive. Senza la guardia, la nona
    // sarebbe uscita sotto una conferma che diceva otto.
    let istante = new Date(2026, 7, 23, 0, 0, 5)
    const { repo } = await apriConOrologio(() => istante)
    const giornaliera = {
      amountCents: 1_000,
      cadence: 'daily' as const,
      interval: 1,
      startDate: '2026-08-15',
    }
    const ricalcolata = previewMaterialization(giornaliera, '2026-08-23')
    if (!ricalcolata.ok) throw new Error('anteprima rifiutata')
    expect(ricalcolata.count).toBe(9)

    const esito = repo.addRecurringRule({ categoryId: 'cat-1' }, ricalcolata.confirmed)
    expect(esito.ok).toBe(true)
    await repo.materializeRecurring('2026-08-23')
    expect(repo.getState().expenses.filter((e) => e.source === 'recurring')).toHaveLength(9)
  })

  it('la guardia vale anche sulla modifica: e la porta di servizio dello stesso difetto', async () => {
    let istante = new Date(2026, 7, 22, 23, 59, 50)
    const { repo } = await apriConOrologio(() => istante)
    const regola = creaRegola(
      repo,
      { amountCents: 1_000, cadence: 'daily', interval: 1, startDate: '2026-08-22', categoryId: 'cat-1' },
      '2026-08-22',
    )

    // Si sposta `startDate` indietro: stesso effetto retroattivo di crearla.
    const anteprima = previewMaterialization(
      { amountCents: 1_000, cadence: 'daily', interval: 1, startDate: '2026-08-15' },
      '2026-08-22',
    )
    if (!anteprima.ok) throw new Error('anteprima rifiutata')
    istante = new Date(2026, 7, 23, 0, 0, 5)

    expect(repo.reviseRecurringRule(regola.id, anteprima.confirmed)).toMatchObject({
      ok: false,
      reason: 'stale-preview',
    })
    expect(repo.getState().recurringRules[0]?.startDate).toBe('2026-08-22')
  })

  it('un anteprima calcolata su una regola gia materializzata non crea una regola nuova', async () => {
    // `addRecurringRule` passa `currentMarker: null` perche' una regola nuova non
    // ha segnaposto. Questo test difende proprio quel `null`: un'anteprima presa
    // su una regola esistente parte dal giorno dopo il segnaposto e annuncia
    // **una** occorrenza, mentre la regola nuova ne scriverebbe otto. E'
    // l'unico verso inaccettabile — annunciare meno di quanto si fa — e per una
    // creazione non e' nemmeno un caso di corsa: basta duplicare una regola
    // riusando l'anteprima che l'elenco aveva gia' in mano.
    const { repo, disk } = await apriConOrologio(() => new Date(2026, 7, 22, 12, 0))
    const conSegnaposto = previewMaterialization(
      { ...bozzaAffitto, lastMaterializedDate: '2026-07-01' },
      '2026-08-22',
    )
    if (!conSegnaposto.ok) throw new Error('anteprima rifiutata')
    expect(conSegnaposto.count).toBe(1)

    expect(repo.addRecurringRule({ categoryId: 'cat-1' }, conSegnaposto.confirmed)).toEqual({
      ok: false,
      reason: 'moved-on',
      previewedMarker: '2026-07-01',
      currentMarker: null,
    })
    expect(repo.getState().recurringRules).toHaveLength(0)
    await repo.flush()
    expect(disk.recurringRules).toHaveLength(0)

    // Ricalcolata senza segnaposto — cioe' su cio' che la regola nuova e'
    // davvero — annuncia otto, e passa.
    const giusta = previewMaterialization(bozzaAffitto, '2026-08-22')
    if (!giusta.ok) throw new Error('anteprima rifiutata')
    expect(giusta.count).toBe(8)
    expect(repo.addRecurringRule({ categoryId: 'cat-1' }, giusta.confirmed).ok).toBe(true)
  })

  it('un id che non esiste e unknown, e lo si scopre prima della mezzanotte', async () => {
    const { repo } = await apriConOrologio(() => new Date(2026, 7, 22, 12, 0))
    const anteprima = previewMaterialization(bozzaAffitto, '2026-08-22')
    if (!anteprima.ok) throw new Error('anteprima rifiutata')
    expect(repo.reviseRecurringRule('r-mai-esistita', anteprima.confirmed)).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  /* --------------------------------------------------------------------- *
   * Il pedaggio lo paga chi puo' generare qualcosa
   * --------------------------------------------------------------------- */

  it('spostare startDate indietro su una regola gia materializzata non genera niente', async () => {
    // La verifica che il proprietario ha chiesto di fare invece di dedurre: il
    // motore riparte da `lastMaterializedDate`, non da `startDate`. Quindi
    // questa modifica **non** e' generazione retroattiva, e l'anteprima lo dice
    // con `backdated: false` — cioe' la UI non deve chiedere nessuna conferma.
    const { repo, disk } = await apriConOrologio(() => new Date(2026, 7, 22, 12, 0))
    const regola = creaRegola(
      repo,
      { amountCents: 1_000, cadence: 'daily', interval: 1, startDate: '2026-08-20', categoryId: 'cat-1' },
      '2026-08-22',
    )
    await repo.materializeRecurring('2026-08-22')
    expect(disk.expenses).toHaveLength(3)
    const segnaposto = repo.getState().recurringRules[0]?.lastMaterializedDate ?? ''
    expect(segnaposto).toBe('2026-08-22')

    const anteprima = previewMaterialization(
      {
        amountCents: 1_000,
        cadence: 'daily',
        interval: 1,
        startDate: '2026-01-01',
        lastMaterializedDate: segnaposto,
      },
      '2026-08-22',
    )
    if (!anteprima.ok) throw new Error('anteprima rifiutata')
    // Zero arretrati annunciati, e nessuna conferma da chiedere: il pedaggio e'
    // una chiamata di funzione, non un cartello davanti all'utente.
    expect(anteprima.count).toBe(0)
    expect(anteprima.backdated).toBe(false)

    const esito = repo.reviseRecurringRule(regola.id, anteprima.confirmed)
    expect(esito.ok).toBe(true)
    expect(esito.ok && esito.rule.startDate).toBe('2026-01-01')
    // Il segnaposto non e' tornato indietro: e' del motore, non della bozza.
    expect(esito.ok && esito.rule.lastMaterializedDate).toBe('2026-08-22')

    await repo.materializeRecurring('2026-08-22')
    await repo.flush()
    expect(disk.expenses).toHaveLength(3)
  })

  it('la stessa modifica su una regola mai materializzata genera eccome', async () => {
    // Lo specchio del test qui sopra, e la ragione per cui la porta e' comunque
    // sotto pedaggio: e' la stessa modifica, e qui vale sette spese.
    const { repo } = await apriConOrologio(() => new Date(2026, 7, 22, 12, 0))
    const regola = creaRegola(
      repo,
      { amountCents: 1_000, cadence: 'daily', interval: 1, startDate: '2026-08-22', categoryId: 'cat-1' },
      '2026-08-22',
    )
    const anteprima = previewMaterialization(
      { amountCents: 1_000, cadence: 'daily', interval: 1, startDate: '2026-08-15' },
      '2026-08-22',
    )
    if (!anteprima.ok) throw new Error('anteprima rifiutata')
    expect(anteprima.count).toBe(8)
    expect(anteprima.backdated).toBe(true)

    expect(repo.reviseRecurringRule(regola.id, anteprima.confirmed).ok).toBe(true)
    await repo.materializeRecurring('2026-08-22')
    expect(repo.getState().expenses).toHaveLength(8)
  })

  it('una materializzazione passata nel frattempo fa rifiutare con moved-on', async () => {
    const { repo } = await apriConOrologio(() => new Date(2026, 7, 22, 12, 0))
    const regola = creaRegola(
      repo,
      { amountCents: 1_000, cadence: 'daily', interval: 1, startDate: '2026-08-20', categoryId: 'cat-1' },
      '2026-08-22',
    )
    const anteprima = previewMaterialization(
      { amountCents: 1_000, cadence: 'daily', interval: 1, startDate: '2026-08-01' },
      '2026-08-22',
    )
    if (!anteprima.ok) throw new Error('anteprima rifiutata')

    // Fra il calcolo e la scrittura il motore ha girato: il segnaposto e'
    // avanzato e i numeri annunciati non descrivono piu' la finestra vera.
    await repo.materializeRecurring('2026-08-22')

    expect(repo.reviseRecurringRule(regola.id, anteprima.confirmed)).toEqual({
      ok: false,
      reason: 'moved-on',
      previewedMarker: null,
      currentMarker: '2026-08-22',
    })
    expect(repo.getState().recurringRules[0]?.startDate).toBe('2026-08-20')
  })

  /* --------------------------------------------------------------------- *
   * Le due direzioni di `active`
   * --------------------------------------------------------------------- */

  it('spegnere va sempre e non chiede niente; riaccendere passa dall anteprima', async () => {
    const { repo } = await apriConOrologio(() => new Date(2026, 7, 22, 12, 0))
    const regola = creaRegola(
      repo,
      { amountCents: 1_000, cadence: 'daily', interval: 1, startDate: '2026-08-22', categoryId: 'cat-1' },
      '2026-08-22',
    )
    await repo.materializeRecurring('2026-08-22')

    // Spegnere: nessun permesso, nessun esito da controllare, va e basta.
    expect(repo.deactivateRecurringRule(regola.id)?.active).toBe(false)
    // Idempotente, e non riscrive: spegnere due volte non e' un errore.
    expect(repo.deactivateRecurringRule(regola.id)?.active).toBe(false)
    expect(repo.deactivateRecurringRule('r-mai-esistita')).toBeNull()

    // Riaccendere: qui il pedaggio c'e', ed e' il terzo innesco.
    const anteprima = previewMaterialization(
      {
        amountCents: 1_000,
        cadence: 'daily',
        interval: 1,
        startDate: '2026-08-22',
        lastMaterializedDate: '2026-08-22',
      },
      '2026-08-22',
    )
    if (!anteprima.ok) throw new Error('anteprima rifiutata')
    const riaccesa = repo.reactivateRecurringRule(regola.id, anteprima.confirmed)
    expect(riaccesa.ok && riaccesa.rule.active).toBe(true)
  })

  it('riaccendere una regola dormiente da mesi e generazione retroattiva, e l anteprima lo dice', async () => {
    // Il caso che rende il pedaggio necessario su questa porta: il segnaposto e'
    // rimasto dov'era. Chi riaccende si aspetta "da adesso in poi" e otterrebbe
    // ottantasei spese.
    let istante = new Date(2026, 4, 28, 12, 0)
    const { repo } = await apriConOrologio(() => istante)
    const regola = creaRegola(
      repo,
      { amountCents: 1_000, cadence: 'daily', interval: 1, startDate: '2026-05-28', categoryId: 'cat-1' },
      '2026-05-28',
    )
    await repo.materializeRecurring('2026-05-28')
    repo.deactivateRecurringRule(regola.id)

    istante = new Date(2026, 7, 22, 12, 0)
    const anteprima = previewMaterialization(
      {
        amountCents: 1_000,
        cadence: 'daily',
        interval: 1,
        startDate: '2026-05-28',
        lastMaterializedDate: '2026-05-28',
      },
      '2026-08-22',
    )
    if (!anteprima.ok) throw new Error('anteprima rifiutata')
    expect(anteprima.count).toBe(86)
    expect(anteprima.backdated).toBe(true)

    expect(repo.reactivateRecurringRule(regola.id, anteprima.confirmed).ok).toBe(true)
    await repo.materializeRecurring('2026-08-22')
    expect(repo.getState().expenses.filter((e) => e.source === 'recurring')).toHaveLength(87)
  })

  /* --------------------------------------------------------------------- *
   * La porta senza pedaggio resta senza pedaggio
   * --------------------------------------------------------------------- */

  it('la categoria si cambia senza anteprima, anche il giorno dopo', async () => {
    let istante = new Date(2026, 7, 22, 23, 59, 50)
    const { repo, disk } = await apriConOrologio(() => istante)
    const regola = creaRegola(repo, { ...bozzaAffitto, categoryId: 'cat-1' }, '2026-08-22')

    istante = new Date(2026, 7, 23, 0, 0, 5)
    const cambiata = repo.updateRecurringRule(regola.id, { categoryId: 'cat-2' })
    expect(cambiata?.categoryId).toBe('cat-2')
    expect(repo.updateRecurringRule('r-mai-esistita', { categoryId: 'cat-3' })).toBeNull()

    await repo.flush()
    expect(disk.recurringRules[0]?.categoryId).toBe('cat-2')
    // E il calendario non l'ha sfiorato nessuno.
    expect(disk.recurringRules[0]?.startDate).toBe('2026-01-01')
  })
})

/* ------------------------------------------------------------------------- *
 * ADR 018 — Il segnaposto arretra solo se glielo si chiede
 * ------------------------------------------------------------------------- */

describe('ADR 018: il segnaposto arretra solo su richiesta', () => {
  const OGGI = '2026-08-22'

  async function apri(
    orologio: () => Date,
    disk: MemoryDisk = emptyDisk(),
  ): Promise<{
    readonly repo: Repository
    readonly disk: MemoryDisk
    readonly writeCount: () => number
  }> {
    const persistence = createMemoryPersistence(disk)
    const repo = await openRepository(persistence, {
      defaultCategoryNames: TEST_CATEGORY_NAMES,
      now: tickingClock(),
      newId: sequentialIds('rw'),
      nowInstant: orologio,
    })
    return { repo, disk, writeCount: () => persistence.writeCount }
  }

  const quotidiana = {
    amountCents: 900,
    categoryId: 'cat-1',
    cadence: 'daily' as const,
    interval: 1,
    startDate: '2026-08-20',
  }

  /**
   * L'anteprima di un rewind e' quella della regola **come sara' dopo**:
   * `startDate` alla data nuova e **nessun segnaposto**.
   *
   * Cioe' e' esattamente la bozza di una regola **nuova** con quella data
   * d'inizio: nessun campo la distingue. E' il punto di ADR 018 dopo la
   * correzione — retrodatare e ricreare percorrono lo stesso ramo di
   * `materializationWindow`, quindi la coerenza fra i due gesti non e' una
   * proprieta' da verificare caso per caso.
   *
   * Non esiste una funzione di dominio che la costruisca, e non e' una
   * dimenticanza: chi sbaglia la bozza non ottiene una scrittura sbagliata,
   * ottiene un `stale-preview` dalla transazione — l'impronta non torna. La
   * guardia sta nel confronto, non in un aiutante.
   */
  function anteprimaRewind(
    regola: RecurringRule,
    nuovaData: string,
    giorno: string,
  ): Extract<ReturnType<typeof previewMaterialization>, { ok: true }> {
    const p = previewMaterialization(
      {
        amountCents: regola.amountCents,
        cadence: regola.cadence,
        interval: regola.interval,
        ...(regola.anchorDay !== undefined ? { anchorDay: regola.anchorDay } : {}),
        startDate: nuovaData,
        ...(regola.endDate !== undefined ? { endDate: regola.endDate } : {}),
      },
      giorno,
    )
    if (!p.ok) throw new Error(`anteprima rifiutata: ${p.reason}`)
    return p
  }

  /* --------------------------------------------------------------------- *
   * 1. L'orologio che torna indietro
   * --------------------------------------------------------------------- */

  it('1. orologio a ieri: nessuna scrittura, e il segnaposto resta a oggi', async () => {
    // Il segnaposto non arretra per causa di un orologio: non per un fuso, non
    // per una data rimessa a mano, non per un ripristino. Arretra solo per
    // `rewindRecurringRule`.
    let istante = new Date(2026, 7, 22, 12, 0)
    const { repo, disk, writeCount } = await apri(() => istante)
    creaRegola(repo, quotidiana, OGGI)
    await repo.flush()
    await repo.materializeRecurring()
    await repo.flush()
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe(OGGI)
    const spesePrima = disk.expenses.length
    const scritturePrima = writeCount()

    istante = new Date(2026, 7, 21, 12, 0)
    const esito = await repo.materializeRecurring()
    await repo.flush()

    expect(esito.created).toHaveLength(0)
    expect(disk.expenses).toHaveLength(spesePrima)
    // Nemmeno una transazione aperta: la finestra e' vuota e non si tocca il disco.
    expect(writeCount()).toBe(scritturePrima)
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe(OGGI)
    expect(repo.getState().recurringRules[0]?.lastMaterializedDate).toBe(OGGI)
  })

  /* --------------------------------------------------------------------- *
   * 2. Amsterdam -> Tokyo
   * --------------------------------------------------------------------- */

  it('2. Amsterdam -> Tokyo: il salto scavalca la mezzanotte e vale una istanza, non due', async () => {
    // Sette ore di volo e la data civile locale avanza di uno. L'app vede solo
    // la data civile: deve valere come **un** giorno, e la riapertura subito
    // dopo non deve aggiungere niente.
    let istante = new Date(2026, 7, 22, 23, 30)
    const { repo, disk } = await apri(() => istante)
    const regola = creaRegola(repo, quotidiana, OGGI)
    await repo.flush()
    await repo.materializeRecurring()
    await repo.flush()
    expect(disk.expenses.filter((e) => e.recurringId === regola.id)).toHaveLength(3)
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe('2026-08-22')

    istante = new Date(2026, 7, 23, 6, 30)
    const atterrato = await repo.materializeRecurring()
    await repo.flush()
    expect(atterrato.created).toHaveLength(1)
    expect(atterrato.created[0]?.date).toBe('2026-08-23')
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe('2026-08-23')

    const riaperta = await repo.materializeRecurring()
    await repo.flush()
    expect(riaperta.created).toHaveLength(0)
    expect(disk.expenses.filter((e) => e.recurringId === regola.id)).toHaveLength(4)
  })

  /* --------------------------------------------------------------------- *
   * 3. La correzione manuale sopravvive
   * --------------------------------------------------------------------- */

  it('3. rewind a 60 giorni con una correzione a 920 in mezzo: l importo resta 920', async () => {
    // E' la proprieta' che rende sicuro arretrare il segnaposto: l'occorrenza
    // corretta occupa gia' il suo id, e `addExpenses` salta invece di
    // sovrascrivere (ADR 006).
    const istante = new Date(2026, 7, 22, 12, 0)
    const { repo, disk } = await apri(() => istante)
    const regola = creaRegola(repo, quotidiana, OGGI)
    await repo.flush()
    await repo.materializeRecurring(OGGI)
    await repo.flush()

    const corretta = disk.expenses.find((e) => e.date === '2026-08-21')
    expect(corretta).toBeDefined()
    repo.updateExpense(corretta?.id ?? '', { amountCents: 920 })
    await repo.flush()

    const anteprima = anteprimaRewind(regola, '2026-06-23', OGGI)
    // 23 giugno .. 22 agosto inclusi: sessantuno, perche' il segnaposto sparisce
    // e la finestra si apre **sulla** data scelta, non il giorno dopo.
    expect(anteprima.count).toBe(61)
    expect(anteprima.totalCents).toBe(54_900)

    const esito = await repo.rewindRecurringRule(regola.id, '2026-06-23', anteprima.confirmed)
    expect(esito.ok).toBe(true)
    await repo.flush()
    expect(disk.recurringRules[0]?.startDate).toBe('2026-06-23')
    // Il segnaposto non c'e': la regola e' tornata allo stato di una appena
    // creata. Assente, non `undefined` — la chiave non esiste proprio.
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBeUndefined()
    expect(Object.hasOwn(disk.recurringRules[0] ?? {}, 'lastMaterializedDate')).toBe(false)

    const generate = await repo.materializeRecurring(OGGI)
    await repo.flush()
    // 61 annunciate meno le 3 che erano gia' sul disco: si annuncia piu' di
    // quanto si scrive, che e' l'unico verso accettabile.
    expect(generate.created).toHaveLength(58)
    expect(disk.expenses.find((e) => e.date === '2026-08-21')?.amountCents).toBe(920)
    expect(disk.expenses.filter((e) => e.date === '2026-08-21')).toHaveLength(1)
  })

  /* --------------------------------------------------------------------- *
   * 4. La cancellazione sopravvive
   * --------------------------------------------------------------------- */

  it('4. rewind con una istanza cancellata in mezzo: resta cancellata', async () => {
    // L'obiezione contro il rewind era "riaprire la finestra fa tornare le
    // istanze cancellate". E' falsa: il soft delete lascia una lapide **sotto
    // lo stesso id**, quindi la chiave resta occupata e `add` fallisce.
    const istante = new Date(2026, 7, 22, 12, 0)
    const { repo, disk } = await apri(() => istante)
    const regola = creaRegola(repo, quotidiana, OGGI)
    await repo.flush()
    await repo.materializeRecurring(OGGI)
    await repo.flush()

    const daCancellare = disk.expenses.find((e) => e.date === '2026-08-21')
    repo.deleteExpense(daCancellare?.id ?? '')
    await repo.flush()
    expect(disk.expenses.find((e) => e.date === '2026-08-21')?.deletedAt).toBeDefined()

    const anteprima = anteprimaRewind(regola, '2026-06-23', OGGI)
    expect((await repo.rewindRecurringRule(regola.id, '2026-06-23', anteprima.confirmed)).ok).toBe(
      true,
    )
    await repo.flush()
    const generate = await repo.materializeRecurring(OGGI)
    await repo.flush()

    expect(generate.created).toHaveLength(58)
    const lapide = disk.expenses.filter((e) => e.date === '2026-08-21')
    expect(lapide).toHaveLength(1)
    expect(lapide[0]?.deletedAt).toBeDefined()
    expect(generate.created.some((e) => e.date === '2026-08-21')).toBe(false)
  })

  /* --------------------------------------------------------------------- *
   * 5. Due rewind di fila
   * --------------------------------------------------------------------- */

  it('5. due rewind di fila: il secondo non scrive niente', async () => {
    // Un solo verso. La seconda richiesta chiede la stessa data, che non e' piu'
    // precedente: si rifiuta, e il record resta identico byte per byte.
    const istante = new Date(2026, 7, 22, 12, 0)
    const { repo, disk } = await apri(() => istante)
    const regola = creaRegola(repo, quotidiana, OGGI)
    await repo.flush()
    await repo.materializeRecurring(OGGI)
    await repo.flush()

    const primo = await repo.rewindRecurringRule(
      regola.id,
      '2026-06-23',
      anteprimaRewind(regola, '2026-06-23', OGGI).confirmed,
    )
    expect(primo.ok).toBe(true)
    await repo.flush()
    const dopoIlPrimo = structuredClone(disk.recurringRules[0])

    const corrente = repo.getState().recurringRules[0]
    expect(corrente).toBeDefined()
    const secondo = await repo.rewindRecurringRule(
      regola.id,
      '2026-06-23',
      anteprimaRewind(corrente as RecurringRule, '2026-06-23', OGGI).confirmed,
    )
    await repo.flush()

    expect(secondo).toMatchObject({
      ok: false,
      reason: 'not-earlier',
      startDate: '2026-06-23',
      currentStartDate: '2026-06-23',
    })
    expect(disk.recurringRules[0]).toEqual(dopoIlPrimo)
    expect(repo.getState().recurringRules[0]).toEqual(dopoIlPrimo)
  })

  /* --------------------------------------------------------------------- *
   * L'impronta economica
   * --------------------------------------------------------------------- */

  it('l impronta si ri-deriva dal disco: importo cambiato sotto, niente scrittura', async () => {
    // Non attraversa il confine il risultato gia' calcolato (le date), ma
    // l'intenzione piu' i numeri mostrati. La transazione li rifa' sui record
    // veri: se l'insieme non e' piu' quello, non si scrive (ADR 008 + ADR 017).
    const istante = new Date(2026, 7, 22, 12, 0)
    const { repo, disk } = await apri(() => istante)
    const regola = creaRegola(repo, quotidiana, OGGI)
    await repo.flush()
    await repo.materializeRecurring(OGGI)
    await repo.flush()

    const anteprima = anteprimaRewind(regola, '2026-06-23', OGGI)
    expect(anteprima.totalCents).toBe(54_900)

    // Un altro contesto alza il canone fra il calcolo e la conferma.
    rivediRegola(
      repo,
      regola.id,
      { ...quotidiana, amountCents: 1_000, lastMaterializedDate: OGGI },
      OGGI,
    )
    await repo.flush()

    const esito = await repo.rewindRecurringRule(regola.id, '2026-06-23', anteprima.confirmed)
    await repo.flush()

    expect(esito.ok).toBe(false)
    if (!esito.ok && esito.reason === 'stale-preview') {
      expect(esito.stale.staleness).toBe('footprint')
      if (esito.stale.staleness === 'footprint') {
        expect(esito.stale.announced).toEqual({
          count: 61,
          totalCents: 54_900,
          firstDate: '2026-06-23',
          lastDate: '2026-08-22',
        })
        expect(esito.stale.actual).toEqual({
          count: 61,
          totalCents: 61_000,
          firstDate: '2026-06-23',
          lastDate: '2026-08-22',
        })
      }
    } else {
      throw new Error(`atteso stale-preview, arrivato ${JSON.stringify(esito)}`)
    }
    // Il calendario non e' stato toccato: non e' stato scritto niente.
    expect(disk.recurringRules[0]?.startDate).toBe('2026-08-20')
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe(OGGI)
  })

  it('un anteprima di ieri non si spende, nemmeno per un rewind', async () => {
    let istante = new Date(2026, 7, 22, 23, 59, 50)
    const { repo, disk } = await apri(() => istante)
    const regola = creaRegola(repo, quotidiana, OGGI)
    await repo.flush()
    await repo.materializeRecurring(OGGI)
    await repo.flush()
    const anteprima = anteprimaRewind(regola, '2026-06-23', OGGI)

    istante = new Date(2026, 7, 23, 0, 0, 5)
    const esito = await repo.rewindRecurringRule(regola.id, '2026-06-23', anteprima.confirmed)
    await repo.flush()

    expect(esito.ok).toBe(false)
    if (!esito.ok && esito.reason === 'stale-preview') {
      expect(esito.stale).toEqual({
        staleness: 'day',
        previewedOn: '2026-08-22',
        today: '2026-08-23',
      })
    } else {
      throw new Error(`atteso stale-preview, arrivato ${JSON.stringify(esito)}`)
    }
    expect(disk.recurringRules[0]?.startDate).toBe('2026-08-20')
  })

  it('un id sconosciuto e unknown, e il disco resta com era', async () => {
    const istante = new Date(2026, 7, 22, 12, 0)
    const { repo, disk } = await apri(() => istante)
    const regola = creaRegola(repo, quotidiana, OGGI)
    await repo.flush()
    const esito = await repo.rewindRecurringRule(
      'r-mai-esistita',
      '2026-06-23',
      anteprimaRewind(regola, '2026-06-23', OGGI).confirmed,
    )
    await repo.flush()
    expect(esito).toEqual({ ok: false, reason: 'unknown' })
    expect(disk.recurringRules[0]?.startDate).toBe('2026-08-20')
  })

  /* --------------------------------------------------------------------- *
   * Il bordo della finestra: l'occorrenza sulla data scelta **nasce**
   * --------------------------------------------------------------------- */

  it('l occorrenza sulla data scelta nasce: il segnaposto si azzera, non si sposta', async () => {
    // Il bordo, capovolto rispetto a com'era. Portare il segnaposto alla data
    // nuova apriva la finestra al **giorno dopo** e toglieva in silenzio proprio
    // la spesa che l'utente stava chiedendo — dice "l'inizio era il 10 agosto" e
    // il 10 agosto e' il giorno che gli interessa.
    //
    // Azzerandolo, la finestra si apre **sulla** data scelta: e' lo stesso ramo
    // di `materializationWindow` che percorre ogni creazione.
    const istante = new Date(2026, 7, 22, 12, 0)
    const { repo, disk } = await apri(() => istante)
    const regola = creaRegola(repo, quotidiana, OGGI)
    await repo.flush()
    await repo.materializeRecurring(OGGI)
    await repo.flush()

    const anteprima = anteprimaRewind(regola, '2026-08-10', OGGI)
    // 10..22 agosto: tredici, non dodici.
    expect(anteprima.count).toBe(13)
    expect(anteprima.firstDate).toBe('2026-08-10')

    expect((await repo.rewindRecurringRule(regola.id, '2026-08-10', anteprima.confirmed)).ok).toBe(
      true,
    )
    await repo.flush()
    await repo.materializeRecurring(OGGI)
    await repo.flush()

    expect(disk.expenses.some((e) => e.date === '2026-08-10')).toBe(true)
    expect(disk.expenses.filter((e) => e.recurringId === regola.id)).toHaveLength(13)
  })

  /* --------------------------------------------------------------------- *
   * Retrodatare e ricreare: otto e otto, perche' e' lo stesso ramo
   * --------------------------------------------------------------------- */

  it('mensile retrodatata al 1 gennaio: otto occorrenze, le stesse di una regola creata cosi', async () => {
    // Il caso canonico del brief — "Affitto, 900, mensile, dal 1 gennaio, creata
    // ad agosto: otto spese per 7.200 €" — chiesto per rewind invece che per
    // creazione. I due numeri devono coincidere **e coincidono per costruzione**:
    // dopo il rewind i due record hanno esattamente gli stessi campi rilevanti,
    // quindi la finestra la apre la stessa riga di codice.
    const istante = new Date(2026, 7, 22, 12, 0)
    const { repo, disk } = await apri(() => istante)
    const mensile = {
      amountCents: 90_000,
      categoryId: 'cat-1',
      cadence: 'monthly' as const,
      interval: 1,
      startDate: '2026-08-01',
    }
    const regola = creaRegola(repo, mensile, OGGI)
    await repo.flush()
    await repo.materializeRecurring(OGGI)
    await repo.flush()
    expect(disk.expenses.filter((e) => e.recurringId === regola.id)).toHaveLength(1)

    const anteprima = anteprimaRewind(regola, '2026-01-01', OGGI)
    expect(anteprima.count).toBe(8)
    expect(anteprima.totalCents).toBe(720_000)
    expect(anteprima.firstDate).toBe('2026-01-01')
    expect(anteprima.lastDate).toBe('2026-08-01')

    expect((await repo.rewindRecurringRule(regola.id, '2026-01-01', anteprima.confirmed)).ok).toBe(
      true,
    )
    await repo.flush()
    await repo.materializeRecurring(OGGI)
    await repo.flush()

    const generate = disk.expenses.filter((e) => e.recurringId === regola.id)
    expect(generate).toHaveLength(8)
    expect(generate.map((e) => e.date).sort()).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
    ])

    // L'altra meta' dell'"otto e otto": la stessa regola **creata** con quella
    // data d'inizio produce lo stesso identico calendario. Non e' una coincidenza
    // da riverificare a ogni cambiamento del motore, e' lo stesso ramo.
    const { repo: repoB, disk: diskB } = await apri(() => istante)
    const nuova = creaRegola(repoB, { ...mensile, startDate: '2026-01-01' }, OGGI)
    await repoB.flush()
    await repoB.materializeRecurring(OGGI)
    await repoB.flush()
    expect(diskB.expenses.filter((e) => e.recurringId === nuova.id).map((e) => e.date).sort()).toEqual(
      generate.map((e) => e.date).sort(),
    )
  })

  /* --------------------------------------------------------------------- *
   * I due estremi dell'impronta
   * --------------------------------------------------------------------- */

  it('ancora mensile spostata sotto: stesso count e stessa somma, ma le date cambiano e si rifiuta', async () => {
    // Il caso che l'impronta economica lasciava passare, ed e' il motivo per cui
    // `firstDate` e `lastDate` ci sono. Fra il calcolo e la conferma un altro
    // contesto sposta `anchorDay` dal 1 al 15: **otto occorrenze** prima e otto
    // dopo, **720.000 centesimi** prima e dopo — e otto giorni tutti diversi da
    // quelli che l'utente ha letto.
    const istante = new Date(2026, 7, 22, 12, 0)
    const { repo, disk } = await apri(() => istante)
    const mensile = {
      amountCents: 90_000,
      categoryId: 'cat-1',
      cadence: 'monthly' as const,
      interval: 1,
      startDate: '2026-08-01',
    }
    const regola = creaRegola(repo, mensile, OGGI)
    await repo.flush()
    await repo.materializeRecurring(OGGI)
    await repo.flush()

    const anteprima = anteprimaRewind(regola, '2026-01-01', OGGI)
    expect(anteprima.count).toBe(8)
    expect(anteprima.totalCents).toBe(720_000)

    rivediRegola(repo, regola.id, { ...mensile, anchorDay: 15, lastMaterializedDate: OGGI }, OGGI)
    await repo.flush()

    const esito = await repo.rewindRecurringRule(regola.id, '2026-01-01', anteprima.confirmed)
    await repo.flush()

    expect(esito.ok).toBe(false)
    if (!esito.ok && esito.reason === 'stale-preview' && esito.stale.staleness === 'footprint') {
      const { announced, actual } = esito.stale
      // I due numeri vecchi coincidono: da soli avrebbero lasciato passare
      // la scrittura. E' esattamente questa riga a rendere il test una prova
      // dei due estremi e non della loro presenza.
      expect(actual.count).toBe(announced.count)
      expect(actual.totalCents).toBe(announced.totalCents)
      // Sono i due estremi a non tornare.
      expect(announced.firstDate).toBe('2026-01-01')
      expect(announced.lastDate).toBe('2026-08-01')
      expect(actual.firstDate).toBe('2026-01-15')
      expect(actual.lastDate).toBe('2026-08-15')
    } else {
      throw new Error(`atteso stale-preview/footprint, arrivato ${JSON.stringify(esito)}`)
    }

    // Non e' stato scritto niente: il calendario sul disco e' quello di prima.
    expect(disk.recurringRules[0]?.startDate).toBe('2026-08-01')
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe(OGGI)
  })
})
