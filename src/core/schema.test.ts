import { describe, expect, it } from 'vitest'
import {
  MIGRATIONS,
  SCHEMA_VERSION,
  SchemaTooNewError,
  emptyRawDataSet,
  migrateRawData,
  pendingMigrations,
} from './schema'
import { MIGRATED_STORES, REPLACED_STORES } from './schema'
import type { MigrationStep, RawDataSet, RawRecord } from './schema'
import { ALL_STORES, ARCHIVE_STORES, SYSTEM_STORES } from './types'

/**
 * Due gruppi di test, e fanno due mestieri diversi.
 *
 * 1. **Il motore**, con passi finti che rappresentano un cambio di forma vero
 *    (importo da stringa in euro a intero in centesimi). Servono a coprire cio'
 *    che i passi pubblicati non hanno ancora: la conversione di un campo, il
 *    salto di due versioni. Restano utili anche quando la versione corrente sara'
 *    la 5.
 * 2. **I passi veri pubblicati** — la 2 (`Expense.timeMinutes`) e la 3
 *    (`Settings.language`, `Settings.onboardingCompletedAt`) — sui dati veri e
 *    con `MIGRATIONS` di produzione. E' l'unico modo per verificare cio' che di
 *    quei passi conta: che non tocchino niente di cio' che c'era.
 *
 * I passi finti del gruppo 1 vivono solo dentro gli array `steps` passati a
 * mano, quindi il loro numero non collide con quelli pubblicati.
 */
const passoV2: MigrationStep = {
  to: 2,
  summary: 'amount (stringa in euro) -> amountCents (intero)',
  transform: (data) => ({
    ...data,
    expenses: data.expenses.map((raw) => {
      const { amount, ...rest } = raw
      return { ...rest, amountCents: Math.round(Number(amount) * 100) }
    }),
  }),
}

const passoV3: MigrationStep = {
  to: 3,
  summary: 'ogni spesa dichiara la propria origine',
  transform: (data) => ({
    ...data,
    expenses: data.expenses.map((raw) => ({ source: 'manual', ...raw })),
  }),
}

function datiV1(): RawDataSet {
  const data = emptyRawDataSet()
  data.expenses = [
    { id: 'e1', date: '2026-08-01', amount: '12.50', categoryId: 'c1' },
    { id: 'e2', date: '2026-08-02', amount: '3', categoryId: 'c1' },
    { id: 'e3', date: '2026-08-03', amount: '0.05', categoryId: 'c2' },
  ]
  data.categories = [{ id: 'c1', name: 'Spesa' }, { id: 'c2', name: 'Caffe' }]
  data.settings = [{ id: 'settings', schemaVersion: 1 }]
  return data
}

describe('selezione dei passi', () => {
  it('prende solo quelli fra la versione attuale e quella di arrivo, in ordine', () => {
    const steps = [passoV3, passoV2]
    expect(pendingMigrations(1, 3, steps).map((s) => s.to)).toEqual([2, 3])
    expect(pendingMigrations(2, 3, steps).map((s) => s.to)).toEqual([3])
    expect(pendingMigrations(3, 3, steps)).toEqual([])
  })
})

describe('migrazione da N-1 a N', () => {
  it('non perde nessun record', () => {
    const prima = datiV1()
    const dopo = migrateRawData(prima, 1, 2, [passoV2])

    expect(dopo.expenses).toHaveLength(prima.expenses.length)
    expect(dopo.categories).toHaveLength(2)
    expect(dopo.settings).toHaveLength(1)
    expect(dopo.expenses.map((e) => e['id'])).toEqual(['e1', 'e2', 'e3'])
  })

  it('converte davvero la forma, senza lasciare il campo vecchio', () => {
    const dopo = migrateRawData(datiV1(), 1, 2, [passoV2])
    expect(dopo.expenses.map((e) => e['amountCents'])).toEqual([1250, 300, 5])
    expect(dopo.expenses.every((e) => !('amount' in e))).toBe(true)
  })

  it('non tocca i dati in ingresso', () => {
    const prima = datiV1()
    migrateRawData(prima, 1, 2, [passoV2])
    expect(prima.expenses[0]?.['amount']).toBe('12.50')
  })

  it('salta due versioni applicando i passi in ordine', () => {
    const dopo = migrateRawData(datiV1(), 1, 3, [passoV2, passoV3])
    expect(dopo.expenses).toHaveLength(3)
    expect(dopo.expenses.every((e) => e['source'] === 'manual')).toBe(true)
    expect(dopo.expenses.every((e) => typeof e['amountCents'] === 'number')).toBe(true)
  })

  it('dati che sono gia alla versione di arrivo passano intatti', () => {
    const gia = migrateRawData(datiV1(), 1, 2, [passoV2])
    expect(migrateRawData(gia, 2, 2, [passoV2])).toEqual(gia)
  })

  it('rifiuta dati scritti da una versione futura invece di mutilarli', () => {
    expect(() => migrateRawData(emptyRawDataSet(), 99, SCHEMA_VERSION)).toThrow(SchemaTooNewError)
  })
})

describe('schema corrente', () => {
  it('le migrazioni creano tutti gli store dichiarati, delle due famiglie', () => {
    const creati = MIGRATIONS.flatMap((s) => s.createStores ?? []).map((s) => s.name)
    expect([...creati].sort()).toEqual([...ALL_STORES].sort())
  })

  it('lo store di sistema non e nelle liste dell archivio', () => {
    // Il terzo dei tre danni di ADR 026 §2, e l'unico fatale: se lo scatto
    // fosse in `REPLACED_STORES` verrebbe cancellato dalla stessa transazione
    // che deve proteggerlo.
    //
    // Non e' un doppione del tipo, ed e' stato verificato invece che dedotto:
    // il compilatore prende un nome di **sistema** messo fra quelli
    // d'archivio, e non prende il verso opposto. Aggiungendo `'budgets'` a
    // `SYSTEM_STORES`, `tsc` tace — `AnyStoreName` e' gia' la loro unione — e a
    // cadere sono questo test e quello qui sopra. Sono l'unica guardia che
    // esista in quella direzione.
    for (const nome of SYSTEM_STORES) {
      expect([...MIGRATED_STORES]).not.toContain(nome)
      expect([...REPLACED_STORES]).not.toContain(nome)
      expect([...ARCHIVE_STORES]).not.toContain(nome)
    }
    expect([...ALL_STORES]).toContain('preImportSnapshot')
  })

  it('le spese hanno l indice per data, ed e l unico', () => {
    const expenses = MIGRATIONS.flatMap((s) => s.createStores ?? []).find(
      (s) => s.name === 'expenses',
    )
    expect(expenses?.indexes.map((i) => i.name)).toEqual(['by-date'])
    expect(expenses?.indexes[0]?.keyPath).toBe('date')
  })

  it('i passi sono numerati senza buchi e senza doppioni fino a SCHEMA_VERSION', () => {
    const versioni = MIGRATIONS.map((s) => s.to)
    expect(versioni).toEqual([...versioni].sort((a, b) => a - b))
    expect(new Set(versioni).size).toBe(versioni.length)
    expect(versioni.at(-1)).toBe(SCHEMA_VERSION)
    expect(versioni[0]).toBe(1)
  })

  it('alla versione corrente non c e nulla da trasformare', () => {
    const dati = emptyRawDataSet()
    dati.expenses = [{ id: 'e1' }]
    expect(migrateRawData(dati, SCHEMA_VERSION)).toEqual(dati)
  })
})

describe('il passo vero alla versione 2', () => {
  /** Dati scritti dalla versione 1, cioe' prima che `timeMinutes` esistesse. */
  function datiVersione1(): RawDataSet {
    const data = emptyRawDataSet()
    data.expenses = [
      { id: 'e1', date: '2026-08-01', amountCents: 1_250, categoryId: 'c1', source: 'manual' },
      { id: 'e2', date: '2026-08-02', amountCents: 300, categoryId: 'c1', source: 'manual' },
    ]
    data.categories = [{ id: 'c1', name: 'Spesa', order: 10 }]
    data.recurringRules = [{ id: 'r1', startDate: '2026-01-01' }]
    data.budgets = [{ id: 'b1', amountCents: 100_000, effectiveFrom: '2026-01-01' }]
    data.settings = [{ id: 'settings', weekStartsOn: 1, theme: 'auto', schemaVersion: 1 }]
    return data
  }

  it('le spese escono esattamente come sono entrate: nessun orario inventato', () => {
    const prima = datiVersione1()
    const dopo = migrateRawData(prima, 1, 2)

    expect(dopo.expenses).toEqual(prima.expenses)
    expect(dopo.expenses.every((e) => !('timeMinutes' in e))).toBe(true)
    // Piu' forte di `toEqual`: non e' stato riscritto nemmeno un record. E' il
    // riferimento su cui `idb.ts` decide di non toccare lo store (applyTransforms).
    expect(dopo.expenses).toBe(prima.expenses)
    expect(dopo.categories).toBe(prima.categories)
    expect(dopo.recurringRules).toBe(prima.recurringRules)
    expect(dopo.budgets).toBe(prima.budgets)
  })

  it('aggiorna solo le impostazioni, e solo il numero di versione', () => {
    const prima = datiVersione1()
    const dopo = migrateRawData(prima, 1, 2)

    expect(dopo.settings).toHaveLength(1)
    expect(dopo.settings[0]).toEqual({
      id: 'settings',
      weekStartsOn: 1,
      theme: 'auto',
      schemaVersion: 2,
    })
    // L'insieme di partenza non e' stato mutato.
    expect(prima.settings[0]?.['schemaVersion']).toBe(1)
  })

  it('un archivio senza impostazioni non diventa un errore', () => {
    const vuoto = emptyRawDataSet()
    expect(() => migrateRawData(vuoto, 1, 2)).not.toThrow()
    expect(migrateRawData(vuoto, 1, 2).settings).toEqual([])
  })

  it('applicarlo due volte da lo stesso risultato', () => {
    const unaVolta = migrateRawData(datiVersione1(), 1, 2)
    expect(migrateRawData(unaVolta, 1, 2)).toEqual(unaVolta)
  })
})

describe('il passo vero alla versione 3', () => {
  /** Dati scritti dalla versione 2: la forma del backup reale del 23 agosto. */
  function datiVersione2(): RawDataSet {
    const data = emptyRawDataSet()
    data.expenses = [
      {
        id: 'e1',
        createdAt: '2026-08-22T23:13:38.067Z',
        updatedAt: '2026-08-22T23:13:38.067Z',
        amountCents: 2_300,
        categoryId: 'c1',
        date: '2026-08-23',
        timeMinutes: 73,
        source: 'manual',
      },
      {
        id: 'e2',
        createdAt: '2026-08-23T09:01:00.000Z',
        updatedAt: '2026-08-23T09:40:00.000Z',
        amountCents: 25,
        categoryId: 'c1',
        date: '2026-08-23',
        source: 'manual',
        deletedAt: '2026-08-23T09:40:00.000Z',
      },
    ]
    data.categories = [
      {
        id: 'c1',
        createdAt: '2026-08-22T23:13:13.861Z',
        updatedAt: '2026-08-22T23:13:13.861Z',
        name: 'Spesa',
        emoji: '🛒',
        color: '#81a369',
        order: 10,
        archived: false,
      },
    ]
    data.budgets = [
      {
        id: 'b1',
        createdAt: '2026-08-23T13:21:04.998Z',
        updatedAt: '2026-08-23T13:21:04.998Z',
        period: 'weekly',
        amountCents: 20_000,
        effectiveFrom: '2026-08-23',
      },
    ]
    data.settings = [
      {
        id: 'settings',
        createdAt: '2026-08-22T23:13:13.861Z',
        updatedAt: '2026-08-22T23:13:13.861Z',
        weekStartsOn: 1,
        theme: 'auto',
        schemaVersion: 2,
      },
    ]
    return data
  }

  it('non scrive niente su nessun record esistente', () => {
    const prima = datiVersione2()
    const dopo = migrateRawData(prima, 2, 3)

    expect(dopo.expenses).toBe(prima.expenses)
    expect(dopo.categories).toBe(prima.categories)
    expect(dopo.recurringRules).toBe(prima.recurringRules)
    expect(dopo.budgets).toBe(prima.budgets)
  })

  it('i due campi nuovi nascono assenti, e l assenza e il loro default', () => {
    const dopo = migrateRawData(datiVersione2(), 2, 3)
    const settings = dopo.settings[0]

    // Non `=== undefined`: la chiave non deve proprio esserci. Un `language:
    // undefined` scritto su disco sarebbe indistinguibile da una scelta, e
    // sopravviverebbe a `JSON.stringify` come chiave mancante solo per caso.
    expect(settings && 'language' in settings).toBe(false)
    expect(settings && 'onboardingCompletedAt' in settings).toBe(false)
  })

  it('aggiorna solo il numero di versione delle impostazioni', () => {
    const prima = datiVersione2()
    const dopo = migrateRawData(prima, 2, 3)

    expect(dopo.settings[0]).toEqual({ ...prima.settings[0], schemaVersion: 3 })
    // `updatedAt` compreso: la migrazione non e' una modifica dell'utente.
    expect(dopo.settings[0]?.['updatedAt']).toBe('2026-08-22T23:13:13.861Z')
    expect(prima.settings[0]?.['schemaVersion']).toBe(2)
  })

  it('una lingua gia scelta sopravvive al passo', () => {
    const prima = datiVersione2()
    prima.settings = [{ ...prima.settings[0], language: 'en', onboardingCompletedAt: 'X' }]
    const dopo = migrateRawData(prima, 2, 3)

    expect(dopo.settings[0]?.['language']).toBe('en')
    expect(dopo.settings[0]?.['onboardingCompletedAt']).toBe('X')
  })

  it('da 1 a 3 in un colpo solo: due passi, nessun record perso', () => {
    const prima = datiVersione2()
    prima.settings = [{ id: 'settings', weekStartsOn: 1, theme: 'auto', schemaVersion: 1 }]
    const dopo = migrateRawData(prima, 1, 3)

    expect(dopo.expenses).toHaveLength(2)
    expect(dopo.categories).toHaveLength(1)
    expect(dopo.budgets).toHaveLength(1)
    expect(dopo.settings[0]?.['schemaVersion']).toBe(3)
  })

  it('applicarlo due volte da lo stesso risultato', () => {
    const unaVolta = migrateRawData(datiVersione2(), 2, 3)
    expect(migrateRawData(unaVolta, 2, 3)).toEqual(unaVolta)
  })
})

/**
 * Il passo alla versione 4, cioe' **l'unico che scrive un campo sui record
 * esistenti**.
 *
 * Non e' un caso a parte per capriccio: e' l'unico in cui il valore da scrivere
 * non va inventato, perche' e' gia' quello che il motore calcolava a ogni
 * apertura. Da qui in poi lo calcola una volta sola e lo conserva.
 *
 * Il file di backup vero del 23 agosto **non contiene nessuna regola**
 * (`recurringRules: []`), quindi su quei dati questo passo e' un no-op: la
 * prova che la catena non li danneggia non esercita la derivazione. Le due cose
 * sono verificate qui separate — la catena sotto, la derivazione qui sopra —
 * e nessuna delle due va letta come se coprisse l'altra.
 */
describe('il passo vero alla versione 4', () => {
  /** Un archivio di schema 3 con dentro tutte e tre le cadenze. */
  function datiVersione3(): RawDataSet {
    const data = emptyRawDataSet()
    data.expenses = [
      {
        id: 'e1',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        amountCents: 90_000,
        categoryId: 'c1',
        date: '2026-08-01',
        source: 'recurring',
        recurringId: 'r-affitto',
      },
    ]
    data.categories = [
      {
        id: 'c1',
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        name: 'Casa',
        emoji: '🏠',
        color: '#81a369',
        order: 70,
        archived: false,
      },
    ]
    data.recurringRules = [
      // L'affitto: mensile, senza ancora, cominciata il primo del mese. E' il
      // record intorno a cui esiste questo passo.
      {
        id: 'r-affitto',
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        amountCents: 90_000,
        categoryId: 'c1',
        cadence: 'monthly',
        interval: 1,
        startDate: '2026-06-01',
        lastMaterializedDate: '2026-08-22',
        active: true,
      },
      // Una mensile che l'ancora ce l'ha gia': non si tocca.
      {
        id: 'r-rata',
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        amountCents: 12_000,
        categoryId: 'c1',
        cadence: 'monthly',
        interval: 1,
        anchorDay: 15,
        startDate: '2026-06-02',
        active: true,
      },
      // Una settimanale: l'ancora non la vuole e non la riceve.
      {
        id: 'r-lavanderia',
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        amountCents: 800,
        categoryId: 'c1',
        cadence: 'weekly',
        interval: 1,
        startDate: '2026-06-03',
        active: true,
      },
    ]
    data.budgets = [
      {
        id: 'b1',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        period: 'weekly',
        amountCents: 20_000,
        effectiveFrom: '2026-08-01',
      },
    ]
    data.settings = [
      {
        id: 'settings',
        createdAt: '2026-06-01T10:00:00.000Z',
        updatedAt: '2026-06-01T10:00:00.000Z',
        weekStartsOn: 1,
        theme: 'auto',
        schemaVersion: 3,
      },
    ]
    return data
  }

  it('una mensile senza ancora la riceve dal giorno di startDate', () => {
    const dopo = migrateRawData(datiVersione3(), 3, 4)
    const affitto = dopo.recurringRules.find((r) => r['id'] === 'r-affitto')
    expect(affitto?.['anchorDay']).toBe(1)
    // E nient'altro del record cambia: il calendario resta quello che era, e
    // adesso c'e' scritto.
    expect(affitto).toEqual({ ...datiVersione3().recurringRules[0], anchorDay: 1 })
  })

  it('una mensile che ce l ha gia non viene toccata: il valore scritto vince sempre', () => {
    // `r-rata` comincia il 2 giugno ma scatta il 15. Derivare da `startDate`
    // qui vorrebbe dire riscriverle il calendario, che e' esattamente il
    // difetto che questo passo esiste per chiudere.
    const dopo = migrateRawData(datiVersione3(), 3, 4)
    const rata = dopo.recurringRules.find((r) => r['id'] === 'r-rata')
    expect(rata?.['anchorDay']).toBe(15)
    expect(rata).toEqual(datiVersione3().recurringRules[1])
  })

  it('le altre cadenze non ricevono niente: sulla settimanale l ancora non esiste', () => {
    const dopo = migrateRawData(datiVersione3(), 3, 4)
    const lavanderia = dopo.recurringRules.find((r) => r['id'] === 'r-lavanderia')
    expect(lavanderia && 'anchorDay' in lavanderia).toBe(false)
    expect(lavanderia).toEqual(datiVersione3().recurringRules[2])
  })

  it('non tocca nessuno degli altri store', () => {
    const prima = datiVersione3()
    const dopo = migrateRawData(prima, 3, 4)
    // Stesso riferimento, non solo stesso contenuto: e' cosi' che `idb.ts` sa
    // di non dover riscrivere niente (vedi `applyTransforms`).
    expect(dopo.expenses).toBe(prima.expenses)
    expect(dopo.categories).toBe(prima.categories)
    expect(dopo.budgets).toBe(prima.budgets)
  })

  it('se non c e niente da derivare l array delle regole esce com e entrato', () => {
    // Il caso del backup vero del 23 agosto: `recurringRules` vuoto. E anche
    // quello di un archivio in cui tutte le mensili hanno gia' l'ancora.
    const vuoto = datiVersione3()
    vuoto.recurringRules = []
    expect(migrateRawData(vuoto, 3, 4).recurringRules).toBe(vuoto.recurringRules)

    const gia = datiVersione3()
    gia.recurringRules = [gia.recurringRules[1] as RawDataSet['recurringRules'][number]]
    expect(migrateRawData(gia, 3, 4).recurringRules).toBe(gia.recurringRules)
  })

  it('aggiorna il numero di versione delle impostazioni e nient altro di loro', () => {
    const prima = datiVersione3()
    const dopo = migrateRawData(prima, 3, 4)
    expect(dopo.settings[0]).toEqual({ ...prima.settings[0], schemaVersion: 4 })
    expect(dopo.settings[0]?.['updatedAt']).toBe('2026-06-01T10:00:00.000Z')
  })

  it('una startDate illeggibile non fa sparire il record: resta, senza ancora', () => {
    // Non si inventa un giorno. La regola era gia' rotta prima e resta rotta,
    // ma esiste ancora: `transform` non cancella record, mai.
    const dati = datiVersione3()
    dati.recurringRules = [{ ...(dati.recurringRules[0] as object), startDate: 'chissa' }]
    const dopo = migrateRawData(dati, 3, 4)
    expect(dopo.recurringRules).toHaveLength(1)
    expect(dopo.recurringRules[0] && 'anchorDay' in dopo.recurringRules[0]).toBe(false)
    expect(dopo.recurringRules[0]?.['amountCents']).toBe(90_000)
  })

  it('applicarlo due volte da lo stesso risultato', () => {
    const unaVolta = migrateRawData(datiVersione3(), 3, 4)
    expect(migrateRawData(unaVolta, 3, 4)).toEqual(unaVolta)
  })

  it('la catena 2 -> 3 -> 4 in un colpo solo: nessun record perso, l ancora c e', () => {
    // Un telefono fermo allo schema 2 che apre un'app allo schema 4 esegue i
    // due passi **nella stessa transazione di upgrade**, non uno per apertura.
    // La prova va fatta sulla catena, non sui due passi separati.
    const prima = datiVersione3()
    prima.settings = [{ ...prima.settings[0], schemaVersion: 2 }]
    const dopo = migrateRawData(prima, 2, 4)

    expect(pendingMigrations(2, 4).map((s) => s.to)).toEqual([3, 4])
    expect(dopo.expenses).toHaveLength(1)
    expect(dopo.categories).toHaveLength(1)
    expect(dopo.recurringRules).toHaveLength(3)
    expect(dopo.budgets).toHaveLength(1)
    expect(dopo.settings[0]?.['schemaVersion']).toBe(4)
    expect(dopo.recurringRules[0]?.['anchorDay']).toBe(1)
    expect(dopo.recurringRules[1]?.['anchorDay']).toBe(15)
    expect(dopo.recurringRules[2] && 'anchorDay' in dopo.recurringRules[2]).toBe(false)
    // I due campi della 2 -> 3 restano assenti: la catena non li inventa.
    expect(dopo.settings[0] && 'language' in dopo.settings[0]).toBe(false)
  })
})

describe('il passo vero alla versione 5', () => {
  /**
   * Un archivio di schema 4 con le otto categorie **come le ha un telefono
   * vero**: seminate al primo avvio con la palette di allora, piu' una che
   * l'utente ha ricolorato scegliendo la pastiglia di un'altra, piu' una con un
   * colore che nessuna tavolozza dell'app ha mai offerto — arrivata da un
   * import.
   */
  function datiVersione4(): RawDataSet {
    const data = emptyRawDataSet()
    const seed = (
      id: string,
      name: string,
      color: string,
      order: number,
      toccata = false,
    ): RawRecord => ({
      id,
      createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: toccata ? '2026-08-20T09:00:00.000Z' : '2026-07-01T10:00:00.000Z',
      name,
      emoji: '🏠',
      color,
      order,
      archived: false,
    })
    data.categories = [
      seed('c1', 'Spesa', '#81a369', 10),
      seed('c2', 'Fuori', '#f26b00', 20),
      seed('c3', 'Coffeeshop', '#06b0a0', 30),
      seed('c4', 'Sigarette', '#845e23', 40),
      seed('c5', 'Trasporti', '#3f5db6', 50),
      seed('c6', 'Svago', '#b90e5c', 60),
      // Rinominata **e** ricolorata: ha preso la pastiglia del grigio di Extra.
      seed('c7', 'Affitto', '#676c75', 70, true),
      // Colore fuori da qualunque tavolozza dell'app: viene da un backup altrui.
      seed('c8', 'Extra', '#123456', 80, true),
    ]
    data.expenses = [
      {
        id: 'e1',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        amountCents: 1250,
        categoryId: 'c1',
        date: '2026-08-01',
        source: 'manual',
      },
    ]
    data.settings = [
      {
        id: 'settings',
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        weekStartsOn: 1,
        theme: 'auto',
        schemaVersion: 4,
        language: 'it',
      },
    ]
    return data
  }

  it('porta le sei mai toccate sulla palette nuova, pastiglia per pastiglia', () => {
    const dopo = migrateRawData(datiVersione4(), 4, 5)
    expect(dopo.categories.slice(0, 6).map((c) => c['color'])).toEqual([
      '#709951',
      '#fc5401',
      '#00a6c6',
      '#895c02',
      '#3157fa',
      '#b90f60',
    ])
  })

  it('porta avanti anche una ricolorata a mano: si conserva la scelta, non l esadecimale', () => {
    // `c7` aveva preso il grigio di Extra. Tenerglielo non sarebbe rispetto:
    // dalla palette nuova il grigio **non e' piu' una tinta di categoria**, e'
    // cio' che indossa l'aggregato delle orfane nella stessa figura (ADR 025).
    const dopo = migrateRawData(datiVersione4(), 4, 5)
    const c7 = dopo.categories.find((c) => c['id'] === 'c7')
    expect(c7?.['color']).toBe('#2a6198')
    // E nient'altro di lei si muove: il nome che si e' scelta resta.
    expect(c7?.['name']).toBe('Affitto')
  })

  it('un colore fuori dalla palette vecchia resta dov e: da fuori non si mappa', () => {
    const dopo = migrateRawData(datiVersione4(), 4, 5)
    expect(dopo.categories.find((c) => c['id'] === 'c8')?.['color']).toBe('#123456')
  })

  it('non tocca nessun altro campo delle categorie', () => {
    const prima = datiVersione4()
    const dopo = migrateRawData(prima, 4, 5)
    dopo.categories.forEach((c, i) => {
      const p = prima.categories[i]!
      for (const campo of ['id', 'createdAt', 'updatedAt', 'name', 'emoji', 'order', 'archived']) {
        expect(c[campo], `${campo} di ${c['id']} e' cambiato`).toEqual(p[campo])
      }
    })
  })

  it('non tocca nessuno degli altri store', () => {
    const prima = datiVersione4()
    const dopo = migrateRawData(prima, 4, 5)
    expect(dopo.expenses).toEqual(prima.expenses)
    expect(dopo.recurringRules).toBe(prima.recurringRules)
    expect(dopo.budgets).toBe(prima.budgets)
  })

  it('aggiorna il numero di versione delle impostazioni e nient altro di loro', () => {
    const prima = datiVersione4()
    const dopo = migrateRawData(prima, 4, 5)
    expect(dopo.settings[0]?.['schemaVersion']).toBe(5)
    expect(dopo.settings[0]?.['language']).toBe('it')
    expect(dopo.settings[0]?.['theme']).toBe('auto')
    expect(dopo.settings[0]?.['weekStartsOn']).toBe(1)
  })

  it('se nessun colore e da mappare l array delle categorie esce com e entrato', () => {
    // Stessa proprieta' verificata sul passo 4: e' cosi' che `applyTransforms`
    // in `idb.ts` sa di non dover riscrivere uno store che non e' cambiato.
    const prima = datiVersione4()
    prima.categories = [
      {
        id: 'solo',
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
        name: 'Fuori palette',
        emoji: '🔖',
        color: '#123456',
        order: 10,
        archived: false,
      },
    ]
    const dopo = migrateRawData(prima, 4, 5)
    expect(dopo.categories).toBe(prima.categories)
  })

  it('un colore scritto in maiuscolo si mappa lo stesso', () => {
    // `Category.color` e' una stringa: un backup scritto a mano puo' portare
    // `#81A369`, e mancarlo lascerebbe quella categoria sulla palette vecchia.
    const prima = datiVersione4()
    prima.categories = [{ ...prima.categories[0]!, color: '#81A369' }]
    expect(migrateRawData(prima, 4, 5).categories[0]?.['color']).toBe('#709951')
  })

  it('applicarlo due volte da lo stesso risultato', () => {
    // Le due palette non hanno tinte in comune, quindi un colore gia' migrato
    // non e' piu' una chiave della mappa. Se un giorno la nuova contenesse una
    // tinta della vecchia, questo test cadrebbe — ed e' il posto giusto.
    const una = migrateRawData(datiVersione4(), 4, 5)
    const due = migrateRawData(una, 4, 5)
    expect(due.categories.map((c) => c['color'])).toEqual(una.categories.map((c) => c['color']))
  })

  it('la catena 3 -> 5 in un colpo solo: nessun record perso, i colori nuovi', () => {
    const prima = datiVersione4()
    prima.settings = [{ ...prima.settings[0]!, schemaVersion: 3 }]
    const dopo = migrateRawData(prima, 3, 5)

    expect(pendingMigrations(3, 5).map((s) => s.to)).toEqual([4, 5])
    expect(dopo.categories).toHaveLength(8)
    expect(dopo.expenses).toHaveLength(1)
    expect(dopo.settings[0]?.['schemaVersion']).toBe(5)
    expect(dopo.categories[0]?.['color']).toBe('#709951')
  })

  it('nessuna tinta della palette nuova sopravvive per caso nella vecchia', () => {
    // La premessa che rende sensato il test di idempotenza qui sopra, asserita
    // invece che sperata.
    const dopo = migrateRawData(datiVersione4(), 4, 5)
    const nuovi = dopo.categories.map((c) => c['color'])
    const vecchi = datiVersione4().categories.map((c) => c['color'])
    const restati = nuovi.filter((c) => vecchi.includes(c) && c !== '#123456')
    expect(restati, 'una tinta vecchia e sopravvissuta alla migrazione').toEqual([])
  })
})
