import { describe, expect, it } from 'vitest'
import {
  MIGRATIONS,
  SCHEMA_VERSION,
  STORE_NAMES,
  SchemaTooNewError,
  emptyRawDataSet,
  migrateRawData,
  pendingMigrations,
} from './schema'
import type { MigrationStep, RawDataSet } from './schema'

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
  it('la versione 1 crea tutti gli store dichiarati', () => {
    const creati = MIGRATIONS.flatMap((s) => s.createStores ?? []).map((s) => s.name)
    expect([...creati].sort()).toEqual([...STORE_NAMES].sort())
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
