import { describe, expect, it } from 'vitest'
import { buildBackup, parseBackup } from './backup'
import { SCHEMA_VERSION } from './schema'
import { makeBudget, makeCategory, makeExpense, makeRule, makeSettings, tickingClock } from './testing'
import type { DataSet } from './types'

function dataset(): DataSet {
  return {
    expenses: [
      makeExpense({ id: 'e1', date: '2026-08-01', amountCents: 1_250, note: 'Caffe e brioche' }),
      makeExpense({
        id: 'e2',
        date: '2026-08-02',
        amountCents: 90_000,
        source: 'recurring',
        recurringId: 'r1',
      }),
      makeExpense({
        id: 'e3',
        date: '2026-08-03',
        amountCents: 500,
        deletedAt: '2026-08-03T10:00:00.000Z',
      }),
    ],
    categories: [makeCategory({ id: 'cat-1', name: 'Spesa' })],
    recurringRules: [
      makeRule({
        id: 'r1',
        startDate: '2026-01-01',
        anchorDay: 31,
        endDate: '2027-01-01',
        lastMaterializedDate: '2026-08-02',
        note: 'Affitto',
      }),
    ],
    budgets: [
      makeBudget({ id: 'b1', amountCents: 100_000, effectiveFrom: '2026-01-01', effectiveTo: '2026-07-31' }),
      makeBudget({ id: 'b2', amountCents: 80_000, effectiveFrom: '2026-08-01', categoryId: 'cat-1' }),
    ],
    settings: makeSettings({ lastBackupAt: '2026-08-01T09:00:00.000Z' }),
  }
}

/** Il file passa davvero da JSON: e' l unico modo in cui verra' usato. */
function roundTrip(data: DataSet): ReturnType<typeof parseBackup> {
  const file = buildBackup(data, tickingClock())
  return parseBackup(JSON.parse(JSON.stringify(file)))
}

describe('round-trip export -> import', () => {
  it('i dati escono e rientrano identici', () => {
    const originale = dataset()
    const preview = roundTrip(originale)
    expect(preview.ok).toBe(true)
    expect(preview.issues).toEqual([])
    expect(preview.discarded).toBe(0)
    expect(preview.data).toEqual(originale)
  })

  it('sopravvivono i campi opzionali: nota, ricorrenza, cancellazione, fine budget', () => {
    const preview = roundTrip(dataset())
    const data = preview.data
    expect(data?.expenses[0]?.note).toBe('Caffe e brioche')
    expect(data?.expenses[1]?.recurringId).toBe('r1')
    expect(data?.expenses[2]?.deletedAt).toBe('2026-08-03T10:00:00.000Z')
    expect(data?.recurringRules[0]?.anchorDay).toBe(31)
    expect(data?.recurringRules[0]?.lastMaterializedDate).toBe('2026-08-02')
    expect(data?.budgets[0]?.effectiveTo).toBe('2026-07-31')
    expect(data?.budgets[1]?.categoryId).toBe('cat-1')
    expect(data?.settings.lastBackupAt).toBe('2026-08-01T09:00:00.000Z')
  })

  it('i campi assenti restano assenti, non diventano undefined espliciti', () => {
    const preview = roundTrip(dataset())
    expect('note' in (preview.data?.expenses[1] ?? {})).toBe(false)
    expect('effectiveTo' in (preview.data?.budgets[1] ?? {})).toBe(false)
  })

  it('un archivio vuoto e un round-trip valido', () => {
    const vuoto: DataSet = {
      expenses: [],
      categories: [],
      recurringRules: [],
      budgets: [],
      settings: makeSettings(),
    }
    expect(roundTrip(vuoto).data).toEqual(vuoto)
  })

  it('l importo resta un intero, non passa mai da un float', () => {
    const data = dataset()
    const preview = roundTrip(data)
    for (const expense of preview.data?.expenses ?? []) {
      expect(Number.isSafeInteger(expense.amountCents)).toBe(true)
    }
    expect(preview.data?.expenses[1]?.amountCents).toBe(90_000)
  })

  it('il file dichiara app, versione e istante', () => {
    const file = buildBackup(dataset(), tickingClock())
    expect(file.app).toBe('cent')
    expect(file.schemaVersion).toBe(SCHEMA_VERSION)
    expect(file.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

describe('anteprima e conteggi', () => {
  it('conta i record per sezione', () => {
    const preview = roundTrip(dataset())
    expect(preview.counts).toEqual({
      expenses: 3,
      categories: 1,
      recurringRules: 1,
      budgets: 2,
      settings: 1,
    })
    expect(preview.fromSchemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe('file rotti: si racconta il problema, non si esplode', () => {
  const valido = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(buildBackup(dataset(), tickingClock()))) as Record<string, unknown>

  it('non lancia mai, qualunque cosa gli si dia', () => {
    for (const junk of [null, 42, 'ciao', [], {}, { app: 'altro' }]) {
      expect(() => parseBackup(junk)).not.toThrow()
      expect(parseBackup(junk).ok).toBe(false)
    }
  })

  it('rifiuta un file di un altra app', () => {
    const preview = parseBackup({ ...valido(), app: 'altra-app' })
    expect(preview.ok).toBe(false)
    expect(preview.issues[0]?.severity).toBe('error')
  })

  it('rifiuta un file scritto da una versione futura', () => {
    const preview = parseBackup({ ...valido(), schemaVersion: SCHEMA_VERSION + 5 })
    expect(preview.ok).toBe(false)
    expect(preview.issues[0]?.message).toContain('Aggiorna')
  })

  it('scarta la singola spesa malformata e tiene le altre', () => {
    const file = valido()
    const data = file['data'] as Record<string, unknown[]>
    data['expenses'] = [
      ...(data['expenses'] as unknown[]),
      { id: 'rotta', date: '2026-13-45', amountCents: 100, categoryId: 'cat-1' },
      { id: 'rotta2', date: '2026-08-01', amountCents: 12.5, categoryId: 'cat-1' },
    ]
    const preview = parseBackup(file)
    expect(preview.ok).toBe(true)
    expect(preview.counts.expenses).toBe(3)
    expect(preview.discarded).toBe(2)
    expect(preview.issues.filter((i) => i.severity === 'error')).toHaveLength(2)
    expect(preview.issues[0]?.path).toBe('expenses[3].date')
  })

  it('segnala le spese orfane di categoria ma le importa lo stesso', () => {
    const file = valido()
    const data = file['data'] as Record<string, unknown>
    data['categories'] = []
    const preview = parseBackup(file)
    expect(preview.ok).toBe(true)
    expect(preview.counts.expenses).toBe(3)
    expect(preview.issues.some((i) => i.severity === 'warning' && i.path === 'expenses')).toBe(true)
  })

  it('senza impostazioni usa quelle di default e lo dice', () => {
    const file = valido()
    delete (file['data'] as Record<string, unknown>)['settings']
    const preview = parseBackup(file)
    expect(preview.ok).toBe(true)
    expect(preview.data?.settings.theme).toBe('auto')
    expect(preview.data?.settings.weekStartsOn).toBe(1)
    expect(preview.issues.some((i) => i.path === 'settings')).toBe(true)
  })

  it('la settimana resta di lunedi anche se il file dice altro', () => {
    const file = valido()
    const data = file['data'] as Record<string, Record<string, unknown>>
    data['settings']!['weekStartsOn'] = 0
    const preview = parseBackup(file)
    expect(preview.data?.settings.weekStartsOn).toBe(1)
    expect(preview.issues.some((i) => i.path === 'settings.weekStartsOn')).toBe(true)
  })

  it('con id duplicati tiene l ultimo e avverte', () => {
    const file = valido()
    const data = file['data'] as Record<string, unknown[]>
    const first = data['expenses']![0] as Record<string, unknown>
    data['expenses'] = [...(data['expenses'] as unknown[]), { ...first, amountCents: 999 }]
    const preview = parseBackup(file)
    expect(preview.counts.expenses).toBe(3)
    expect(preview.data?.expenses.find((e) => e.id === 'e1')?.amountCents).toBe(999)
    expect(preview.issues.some((i) => i.message.includes('id duplicato'))).toBe(true)
  })

  it('una sezione che non e un elenco viene ignorata senza far cadere il resto', () => {
    const file = valido()
    const data = file['data'] as Record<string, unknown>
    data['budgets'] = 'non un elenco'
    const preview = parseBackup(file)
    expect(preview.ok).toBe(true)
    expect(preview.counts.budgets).toBe(0)
    expect(preview.counts.expenses).toBe(3)
  })
})
