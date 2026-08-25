import { describe, expect, it } from 'vitest'
import { addDays, daysBetween } from './date'
import { createMemoryPersistence, SimulatedCrashError } from './memory-persistence'
import type { MemoryDisk } from './memory-persistence'
import {
  buildOccurrenceIndex,
  materializeRecurring,
  nextOccurrenceOnOrAfter,
  occurrencesBetween,
  recurringExpenseId,
  validateRule,
} from './recurrence'
import { makeExpense, makeRule, tickingClock } from './testing'
import type { Expense, RecurringRule } from './types'

describe('calendario mensile: anchorDay e mesi corti', () => {
  it('anchorDay 31 cade il 28 febbraio in un anno normale', () => {
    const rule = makeRule({ startDate: '2026-01-31', anchorDay: 31, cadence: 'monthly' })
    expect(occurrencesBetween(rule, '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ])
  })

  it('anchorDay 31 cade il 29 febbraio in un anno bisestile', () => {
    const rule = makeRule({ startDate: '2028-01-31', anchorDay: 31, cadence: 'monthly' })
    expect(occurrencesBetween(rule, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
  })

  it('il taglio non e permanente: dopo febbraio si torna al 31', () => {
    // Il bug classico e memorizzare il giorno tagliato: 31 -> 28 -> 28 -> 28.
    const rule = makeRule({ startDate: '2026-01-31', anchorDay: 31, cadence: 'monthly' })
    const dates = occurrencesBetween(rule, '2026-01-01', '2026-12-31')
    expect(dates.filter((d) => d.endsWith('-31')).length).toBe(7)
  })

  it('non sconfina mai nel mese successivo: una occorrenza per mese, mai due', () => {
    // Il bug da evitare e' febbraio + 31 giorni = 3 marzo, che darebbe due
    // occorrenze a marzo e nessuna a febbraio.
    const rule = makeRule({ startDate: '2026-01-31', anchorDay: 31, cadence: 'monthly' })
    const dates = occurrencesBetween(rule, '2026-01-01', '2027-12-31')
    const months = dates.map((d) => d.slice(0, 7))
    expect(months).toHaveLength(24)
    expect(new Set(months).size).toBe(24)
    expect(dates).toContain('2026-02-28')
    expect(dates).not.toContain('2026-03-03')
  })

  it('anchorDay 30 salta al 28/29 solo a febbraio', () => {
    const rule = makeRule({ startDate: '2026-01-30', anchorDay: 30, cadence: 'monthly' })
    expect(occurrencesBetween(rule, '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-28',
      '2026-03-30',
      '2026-04-30',
    ])
  })

  it('chi non nomina l ancora la riceve dal giorno di startDate', () => {
    // La derivazione non e' piu' nel motore: la fa chi **crea** il record —
    // qui la fabbrica dei test, sul disco la migrazione allo schema 4. Il
    // calendario che ne esce e' lo stesso di sempre; a cambiare e' chi lo decide.
    const rule = makeRule({ startDate: '2026-01-15', cadence: 'monthly' })
    expect(rule.anchorDay).toBe(15)
    expect(occurrencesBetween(rule, '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ])
  })

  it('retrodatare non sposta il giorno del mese: l ancora e un campo, non una conseguenza', () => {
    // **Il difetto che ha prodotto lo schema 4.** Finche' l'ancora si derivava
    // da `startDate`, una regola "il 1 del mese" retrodatata al 23 giugno
    // diventava "il 23 del mese" — in silenzio, e con le istanze gia' generate
    // il 1 rimaste fuori calendario.
    //
    // La riparazione non e' un terzo campo scritto dal rewind: e' che l'ancora
    // sia scritta nel record. Cosi' `startDate` decide **da quando**, e nessuna
    // operazione futura che la sposti puo' ridefinire la regola.
    const prima = makeRule({ startDate: '2026-08-01', cadence: 'monthly' })
    expect(prima.anchorDay).toBe(1)

    const retrodatata: RecurringRule = { ...prima, startDate: '2026-06-23' }
    expect(occurrencesBetween(retrodatata, '2026-06-01', '2026-09-30')).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
    ])
  })

  it('una mensile senza ancora non e utilizzabile: non se ne inventa una', () => {
    // Non e' scrivibile dal compilatore, ma e' leggibile dal disco: `loadAll`
    // non valida. Li' la cosa giusta e' dichiarare la regola inutilizzabile —
    // il motore la salta dicendo perche' — invece di derivare un'ancora da una
    // `startDate` che a quel punto puo' gia' essere stata spostata.
    const rotta = { ...makeRule({ startDate: '2026-06-23', cadence: 'monthly' }) } as Record<
      string,
      unknown
    >
    delete rotta['anchorDay']
    expect(validateRule(rotta as unknown as RecurringRule)).toContain('anchorDay')
  })

  it('un anchorDay precedente al giorno di startDate parte dal mese dopo', () => {
    const rule = makeRule({ startDate: '2026-01-20', anchorDay: 5, cadence: 'monthly' })
    expect(occurrencesBetween(rule, '2026-01-01', '2026-03-31')).toEqual([
      '2026-02-05',
      '2026-03-05',
    ])
  })

  it('interval 3 salta di trimestre in trimestre, attraversando l anno', () => {
    const rule = makeRule({ startDate: '2026-11-15', cadence: 'monthly', interval: 3 })
    expect(occurrencesBetween(rule, '2026-01-01', '2027-12-31')).toEqual([
      '2026-11-15',
      '2027-02-15',
      '2027-05-15',
      '2027-08-15',
      '2027-11-15',
    ])
  })
})

describe('calendario giornaliero e settimanale', () => {
  it('daily con interval 1 copre ogni giorno', () => {
    const rule = makeRule({ startDate: '2026-03-01', cadence: 'daily' })
    expect(occurrencesBetween(rule, '2026-03-01', '2026-03-05')).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
    ])
  })

  it('daily con interval 3 non slitta ricalcolando dall inizio', () => {
    const rule = makeRule({ startDate: '2026-03-01', cadence: 'daily', interval: 3 })
    expect(occurrencesBetween(rule, '2026-03-10', '2026-03-20')).toEqual([
      '2026-03-10',
      '2026-03-13',
      '2026-03-16',
      '2026-03-19',
    ])
  })

  it('weekly mantiene il giorno della settimana di startDate anche a cavallo del cambio ora', () => {
    // 2026-03-23 e un lunedi; l ora legale scatta domenica 29 marzo 2026.
    const rule = makeRule({ startDate: '2026-03-23', cadence: 'weekly' })
    const dates = occurrencesBetween(rule, '2026-03-01', '2026-04-30')
    expect(dates).toEqual(['2026-03-23', '2026-03-30', '2026-04-06', '2026-04-13', '2026-04-20', '2026-04-27'])
    for (let i = 1; i < dates.length; i += 1) {
      expect(daysBetween(dates[i - 1] as string, dates[i] as string)).toBe(7)
    }
  })

  it('weekly con interval 2 salta una settimana', () => {
    const rule = makeRule({ startDate: '2026-01-05', cadence: 'weekly', interval: 2 })
    expect(occurrencesBetween(rule, '2026-01-01', '2026-02-15')).toEqual([
      '2026-01-05',
      '2026-01-19',
      '2026-02-02',
    ])
  })
})

describe('confini della regola', () => {
  it('non produce niente prima di startDate', () => {
    const rule = makeRule({ startDate: '2026-05-10', cadence: 'daily' })
    expect(occurrencesBetween(rule, '2026-01-01', '2026-05-09')).toEqual([])
    expect(nextOccurrenceOnOrAfter(rule, '2026-01-01')).toBe('2026-05-10')
  })

  it('si ferma a endDate', () => {
    const rule = makeRule({ startDate: '2026-05-01', endDate: '2026-05-03', cadence: 'daily' })
    expect(occurrencesBetween(rule, '2026-05-01', '2026-12-31')).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
    ])
    expect(nextOccurrenceOnOrAfter(rule, '2026-05-04')).toBeNull()
  })

  it('finestra vuota o invertita restituisce nessuna occorrenza', () => {
    const rule = makeRule({ startDate: '2026-05-01', cadence: 'daily' })
    expect(occurrencesBetween(rule, '2026-06-01', '2026-05-01')).toEqual([])
  })

  it('validateRule segnala le regole impossibili', () => {
    expect(validateRule(makeRule({ startDate: '2026-01-01', interval: 0 }))).toContain('interval')
    expect(validateRule(makeRule({ startDate: '2026-01-01', anchorDay: 32 }))).toContain('anchorDay')
    expect(
      validateRule(makeRule({ startDate: '2026-05-01', endDate: '2026-04-01' })),
    ).toContain('endDate')
    expect(validateRule(makeRule({ startDate: '2026-01-01' }))).toBeNull()
  })

  it('una regola con interval 0 non manda in ciclo infinito: lancia', () => {
    const rule = makeRule({ startDate: '2026-01-01', cadence: 'daily', interval: 0 })
    expect(() => occurrencesBetween(rule, '2026-01-01', '2026-12-31')).toThrow(RangeError)
  })
})

// --- Materializzazione -------------------------------------------------------

interface Harness {
  readonly disk: MemoryDisk
  /** Materializza fino a `today` e restituisce quante transazioni ha scritto. */
  run: (today: string, options?: { chunkSize?: number }) => Promise<number>
}

function harness(rules: readonly RecurringRule[], expenses: readonly Expense[] = []): Harness {
  const disk: MemoryDisk = {
    expenses: [...expenses],
    categories: [],
    recurringRules: [...rules],
    budgets: [],
    settings: null,
  }
  const persistence = createMemoryPersistence(disk)
  return {
    disk,
    async run(today, options) {
      const before = persistence.writeCount
      await materializeRecurring({
        today,
        rules: disk.recurringRules,
        expenses: disk.expenses,
        currentRule: (id) => disk.recurringRules.find((r) => r.id === id),
        write: (batch) => persistence.write(batch),
        now: tickingClock(),
        ...(options?.chunkSize !== undefined ? { chunkSize: options.chunkSize } : {}),
      })
      return persistence.writeCount - before
    },
  }
}

describe('identita deterministica (ADR 006)', () => {
  it("l id di un'occorrenza e funzione pura di (regola, giorno)", () => {
    expect(recurringExpenseId('r1', '2026-08-22')).toBe('rec:r1:2026-08-22')
    expect(recurringExpenseId('r1', '2026-08-22')).toBe(recurringExpenseId('r1', '2026-08-22'))
    expect(recurringExpenseId('r2', '2026-08-22')).not.toBe(recurringExpenseId('r1', '2026-08-22'))
  })

  it('la spesa generata porta quell id, e lo si puo ricalcolare da fuori', async () => {
    const rule = makeRule({ id: 'affitto', startDate: '2026-08-01', cadence: 'daily' })
    const h = harness([rule])
    await h.run('2026-08-02')
    expect(h.disk.expenses.map((e) => e.id)).toEqual([
      'rec:affitto:2026-08-01',
      'rec:affitto:2026-08-02',
    ])
  })

  it('due materializzazioni in parallelo, senza nessun lock, fanno una spesa per giorno', async () => {
    // La riproduzione del bloccante: due chiamate avviate prima che la prima
    // finisca leggono lo stesso stato e generano gli stessi giorni. Con gli id
    // deterministici il secondo insieme collide con il primo e viene saltato.
    const rule = makeRule({ id: 'r-par', startDate: '2026-08-01', cadence: 'daily' })
    const disk: MemoryDisk = {
      expenses: [],
      categories: [],
      recurringRules: [rule],
      budgets: [],
      settings: null,
    }
    const persistence = createMemoryPersistence(disk)
    const call = (): Promise<{ created: readonly Expense[] }> =>
      materializeRecurring({
        today: '2026-08-22',
        rules: disk.recurringRules,
        expenses: [...disk.expenses],
        write: (batch) => persistence.write(batch),
        chunkSize: 5,
        now: tickingClock(),
      })

    const [a, b] = await Promise.all([call(), call()])

    expect(disk.expenses).toHaveLength(22)
    expect(new Set(disk.expenses.map((e) => e.date)).size).toBe(22)
    // `created` dice la verita': le occorrenze le ha inserite una chiamata sola.
    expect(a.created.length + b.created.length).toBe(22)
  })

  it('dieci chiamate in parallelo non fanno meglio ne peggio di una', async () => {
    const rule = makeRule({ id: 'r-dieci', startDate: '2026-08-01', cadence: 'daily' })
    const disk: MemoryDisk = {
      expenses: [],
      categories: [],
      recurringRules: [rule],
      budgets: [],
      settings: null,
    }
    const persistence = createMemoryPersistence(disk)
    await Promise.all(
      Array.from({ length: 10 }, () =>
        materializeRecurring({
          today: '2026-08-10',
          rules: disk.recurringRules,
          expenses: [...disk.expenses],
          write: (batch) => persistence.write(batch),
          chunkSize: 3,
          now: tickingClock(),
        }),
      ),
    )
    expect(disk.expenses).toHaveLength(10)
    expect(new Set(disk.expenses.map((e) => e.id)).size).toBe(10)
  })

  it('la spesa gia sul disco non viene sovrascritta, nemmeno se il mirror non la conosce', async () => {
    // Il caso dei due contesti: la scheda Safari ha gia' scritto, la PWA non lo
    // sa (il suo mirror e' fermo a prima). Passiamo `expenses: []` proprio per
    // togliere di mezzo la deduplica e lasciare sola la semantica add.
    const rule = makeRule({ id: 'r-canone', startDate: '2026-08-01', cadence: 'daily', amountCents: 900 })
    const disk: MemoryDisk = {
      expenses: [
        makeExpense({
          id: recurringExpenseId('r-canone', '2026-08-01'),
          date: '2026-08-01',
          amountCents: 920,
          recurringId: 'r-canone',
          source: 'recurring',
        }),
      ],
      categories: [],
      recurringRules: [rule],
      budgets: [],
      settings: null,
    }
    const persistence = createMemoryPersistence(disk)
    const result = await materializeRecurring({
      today: '2026-08-02',
      rules: disk.recurringRules,
      expenses: [],
      write: (batch) => persistence.write(batch),
      now: tickingClock(),
    })

    expect(disk.expenses).toHaveLength(2)
    // La correzione dell'utente sopravvive: 920, non 900.
    expect(disk.expenses.find((e) => e.date === '2026-08-01')?.amountCents).toBe(920)
    expect(result.created.map((e) => e.date)).toEqual(['2026-08-02'])
  })

  it('una spesa generata e cancellata non viene resuscitata nemmeno dal disco', async () => {
    const rule = makeRule({ id: 'r-canc', startDate: '2026-08-01', cadence: 'daily' })
    const disk: MemoryDisk = {
      expenses: [
        makeExpense({
          id: recurringExpenseId('r-canc', '2026-08-01'),
          date: '2026-08-01',
          recurringId: 'r-canc',
          source: 'recurring',
          deletedAt: '2026-08-01T10:00:00.000Z',
        }),
      ],
      categories: [],
      recurringRules: [rule],
      budgets: [],
      settings: null,
    }
    const persistence = createMemoryPersistence(disk)
    await materializeRecurring({
      today: '2026-08-01',
      rules: disk.recurringRules,
      // Anche qui il mirror non ne sa niente: resta solo il disco a difendersi.
      expenses: [],
      write: (batch) => persistence.write(batch),
      now: tickingClock(),
    })

    expect(disk.expenses).toHaveLength(1)
    expect(disk.expenses[0]?.deletedAt).toBe('2026-08-01T10:00:00.000Z')
  })

  it('spostare un canone sul giorno di un altro mese non fa sparire quell altra occorrenza', async () => {
    // L'utente paga l'affitto di agosto in ritardo e sposta la spesa al 5
    // settembre: la cosa piu' ovvia da fare. Finche' l'indice di dedup guardava
    // anche la coppia (regola, giorno), a settembre l'occorrenza vera del 5
    // veniva filtrata via, il segnaposto avanzava lo stesso e quei 900 EUR non
    // venivano piu' ritentati. Con la sola chiave-id il caso non esiste: sono
    // due record con due id diversi.
    const rule = makeRule({
      id: 'r-affitto',
      startDate: '2026-08-05',
      anchorDay: 5,
      cadence: 'monthly',
      amountCents: 90_000,
      lastMaterializedDate: '2026-08-31',
    })
    const h = harness(
      [rule],
      [
        makeExpense({
          id: recurringExpenseId('r-affitto', '2026-08-05'),
          date: '2026-09-05',
          amountCents: 90_000,
          recurringId: 'r-affitto',
          source: 'recurring',
        }),
      ],
    )
    await h.run('2026-09-30')

    expect(h.disk.expenses.map((e) => e.id)).toContain(
      recurringExpenseId('r-affitto', '2026-09-05'),
    )
    // Due spese il 5 settembre: quella di agosto pagata tardi e quella di
    // settembre. E' esattamente cio' che l'utente ha pagato.
    expect(h.disk.expenses.filter((e) => e.date === '2026-09-05')).toHaveLength(2)
  })
})

describe('materializzazione: la regola cambia durante il catch-up', () => {
  /** Materializza lasciando modificare la regola sul disco fra un blocco e l'altro. */
  async function catchUpWith(
    edit: (rule: RecurringRule) => RecurringRule,
    afterWrites: number,
  ): Promise<MemoryDisk> {
    const rule = makeRule({
      id: 'r-viva',
      startDate: '2026-07-01',
      cadence: 'daily',
      amountCents: 900,
      lastMaterializedDate: '2026-07-12',
    })
    const disk: MemoryDisk = {
      expenses: [],
      categories: [],
      recurringRules: [rule],
      budgets: [],
      settings: null,
    }
    const persistence = createMemoryPersistence(disk)
    let writes = 0
    await materializeRecurring({
      today: '2026-08-21',
      rules: disk.recurringRules,
      expenses: disk.expenses,
      currentRule: (id) => disk.recurringRules.find((r) => r.id === id),
      write: async (batch) => {
        const result = await persistence.write(batch)
        writes += 1
        if (writes === afterWrites) {
          // L'utente tocca la regola mentre il catch-up e' in corso.
          disk.recurringRules = disk.recurringRules.map((r) =>
            r.id === 'r-viva' ? edit(r) : r,
          )
        }
        return result
      },
      chunkSize: 7,
      now: tickingClock(),
    })
    return disk
  }

  it('disattivarla la ferma, e la disattivazione non viene riscritta dallo stato vecchio', async () => {
    const disk = await catchUpWith((r) => ({ ...r, active: false }), 2)
    expect(disk.recurringRules[0]?.active).toBe(false)
    // Due blocchi da 7 scritti, poi stop: non i 40 giorni interi.
    expect(disk.expenses).toHaveLength(14)
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe('2026-07-26')
  })

  it('cambiare l importo vale dal blocco successivo, e non viene perso', async () => {
    const disk = await catchUpWith((r) => ({ ...r, amountCents: 920 }), 2)
    expect(disk.recurringRules[0]?.amountCents).toBe(920)
    expect(disk.expenses).toHaveLength(40)
    const primi = disk.expenses.filter((e) => e.amountCents === 900)
    const dopo = disk.expenses.filter((e) => e.amountCents === 920)
    expect(primi).toHaveLength(14)
    expect(dopo).toHaveLength(26)
  })

  it('cambiare il calendario ferma il giro invece di scrivere date calcolate col vecchio', async () => {
    // Passa da `makeRule`, non da uno spread: cambiare cadenza cambia **la
    // forma** del record — una settimanale l'ancora non ce l'ha proprio — e la
    // fabbrica e' l'unico posto che sa ricomporla.
    const disk = await catchUpWith((r) => makeRule({ ...r, cadence: 'weekly' }), 1)
    expect(disk.recurringRules[0]?.cadence).toBe('weekly')
    expect(disk.expenses).toHaveLength(7)
    // Il segnaposto non promette piu' di quello che c'e': si riparte da qui.
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe('2026-07-19')
  })

  it('se la regola sparisce dal mirror si smette invece di riscriverla', async () => {
    const rule = makeRule({
      id: 'r-sparita',
      startDate: '2026-07-01',
      cadence: 'daily',
      lastMaterializedDate: '2026-07-12',
    })
    const disk: MemoryDisk = {
      expenses: [],
      categories: [],
      recurringRules: [rule],
      budgets: [],
      settings: null,
    }
    const persistence = createMemoryPersistence(disk)
    let writes = 0
    const result = await materializeRecurring({
      today: '2026-08-21',
      rules: disk.recurringRules,
      expenses: disk.expenses,
      currentRule: (id) => disk.recurringRules.find((r) => r.id === id),
      write: async (batch) => {
        const done = await persistence.write(batch)
        writes += 1
        if (writes === 1) disk.recurringRules = []
        return done
      },
      chunkSize: 7,
      now: tickingClock(),
    })

    expect(disk.expenses).toHaveLength(7)
    expect(result.skipped).toEqual([
      { ruleId: 'r-sparita', reason: 'regola sparita durante il catch-up' },
    ])
    expect(result.advancedRuleIds).toEqual([])
  })

  it('il segnaposto non torna indietro se qualcun altro e andato piu avanti', async () => {
    const rule = makeRule({
      id: 'r-avanti',
      startDate: '2026-07-01',
      cadence: 'daily',
      lastMaterializedDate: '2026-07-12',
    })
    const disk: MemoryDisk = {
      expenses: [],
      categories: [],
      recurringRules: [rule],
      budgets: [],
      settings: null,
    }
    const persistence = createMemoryPersistence(disk)
    let writes = 0
    await materializeRecurring({
      today: '2026-08-21',
      rules: disk.recurringRules,
      expenses: disk.expenses,
      currentRule: (id) => disk.recurringRules.find((r) => r.id === id),
      write: async (batch) => {
        const done = await persistence.write(batch)
        writes += 1
        if (writes === 1) {
          // L'altro contesto ha gia' finito tutto mentre noi eravamo al primo blocco.
          disk.recurringRules = disk.recurringRules.map((r) => ({
            ...r,
            lastMaterializedDate: '2026-08-21',
          }))
        }
        return done
      },
      chunkSize: 7,
      now: tickingClock(),
    })

    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe('2026-08-21')
  })

  it('senza currentRule il comportamento resta quello di prima: la copia iniziale', async () => {
    // Il getter e' opzionale: chi non lo passa accetta di riscrivere la propria
    // copia. Serve a documentare che l'assenza non rompe niente.
    const rule = makeRule({ id: 'r-senza', startDate: '2026-08-01', cadence: 'daily' })
    const h = harness([rule])
    await h.run('2026-08-05')
    expect(h.disk.expenses).toHaveLength(5)
  })
})

describe('materializzazione: idempotenza', () => {
  it('dieci aperture nello stesso giorno creano zero duplicati', async () => {
    const rule = makeRule({ startDate: '2026-08-01', cadence: 'daily' })
    const h = harness([rule])

    const firstWrites = await h.run('2026-08-05')
    expect(h.disk.expenses).toHaveLength(5)
    expect(firstWrites).toBe(1)

    for (let i = 0; i < 9; i += 1) {
      const writes = await h.run('2026-08-05')
      // Non solo niente duplicati: proprio nessuna scrittura.
      expect(writes).toBe(0)
    }
    expect(h.disk.expenses).toHaveLength(5)
    expect(new Set(h.disk.expenses.map((e) => e.date)).size).toBe(5)
  })

  it('il segnaposto avanza anche nei giorni senza occorrenze', async () => {
    const rule = makeRule({ startDate: '2026-01-15', cadence: 'monthly' })
    const h = harness([rule])
    await h.run('2026-01-20')
    expect(h.disk.recurringRules[0]?.lastMaterializedDate).toBe('2026-01-20')
    await h.run('2026-01-25')
    expect(h.disk.recurringRules[0]?.lastMaterializedDate).toBe('2026-01-25')
    expect(h.disk.expenses).toHaveLength(1)
  })

  it('una spesa generata e poi cancellata non ricompare', async () => {
    const rule = makeRule({ startDate: '2026-08-01', cadence: 'daily' })
    const h = harness([rule])
    await h.run('2026-08-03')
    expect(h.disk.expenses).toHaveLength(3)

    // Soft delete della seconda, e segnaposto riportato indietro come farebbe
    // il ripristino di un backup fatto prima.
    h.disk.expenses = h.disk.expenses.map((e) =>
      e.date === '2026-08-02' ? { ...e, deletedAt: '2026-08-02T10:00:00.000Z' } : e,
    )
    h.disk.recurringRules = h.disk.recurringRules.map((r) => ({
      ...r,
      lastMaterializedDate: '2026-07-31',
    }))

    await h.run('2026-08-03')
    expect(h.disk.expenses.filter((e) => e.date === '2026-08-02')).toHaveLength(1)
    expect(h.disk.expenses).toHaveLength(3)
  })

  it("l indice di dedup guarda solo l id, che e l unica identita di un'occorrenza", () => {
    const index = buildOccurrenceIndex([
      makeExpense({
        id: 'rec:rule-x:2026-08-01',
        date: '2026-08-01',
        recurringId: 'rule-x',
        source: 'recurring',
      }),
      // Una spesa manuale non e' un'occorrenza di niente e non entra.
      makeExpense({ date: '2026-08-02' }),
    ])
    expect(index.has('rec:rule-x:2026-08-01')).toBe(true)
    // La coppia `regola|data` non c'e' piu': guardava `date`, che l'utente puo'
    // cambiare a mano.
    expect(index.has('rule-x|2026-08-01')).toBe(false)
    expect(index.size).toBe(1)
  })
})

describe('materializzazione: catch-up dopo 40 giorni', () => {
  const rule = makeRule({
    startDate: '2026-07-01',
    cadence: 'daily',
    lastMaterializedDate: '2026-07-12',
  })
  const today = '2026-08-21'

  it('crea esattamente le occorrenze mancanti, una per giorno', async () => {
    const h = harness([rule])
    await h.run(today, { chunkSize: 7 })

    expect(daysBetween('2026-07-12', today)).toBe(40)
    expect(h.disk.expenses).toHaveLength(40)
    expect(h.disk.expenses[0]?.date).toBe('2026-07-13')
    expect(h.disk.expenses.at(-1)?.date).toBe(today)
    expect(new Set(h.disk.expenses.map((e) => e.date)).size).toBe(40)
    expect(h.disk.recurringRules[0]?.lastMaterializedDate).toBe(today)
  })

  it('e la riapertura subito dopo non aggiunge niente', async () => {
    const h = harness([rule])
    await h.run(today, { chunkSize: 7 })
    const writes = await h.run(today)
    expect(writes).toBe(0)
    expect(h.disk.expenses).toHaveLength(40)
  })

  it('spezza in piu transazioni invece di una sola enorme', async () => {
    const h = harness([rule])
    const writes = await h.run(today, { chunkSize: 7 })
    // 40 occorrenze in blocchi da 7: sei transazioni, ognuna e un punto in cui
    // il browser puo' riprendersi il thread.
    expect(writes).toBe(6)
  })

  it('mensile: 40 giorni fermi valgono una o due occorrenze, non quaranta', async () => {
    const monthly = makeRule({
      startDate: '2026-01-10',
      cadence: 'monthly',
      lastMaterializedDate: '2026-07-12',
    })
    const h = harness([monthly])
    await h.run(today)
    expect(h.disk.expenses.map((e) => e.date)).toEqual(['2026-08-10'])
  })
})

describe('materializzazione: interrompibile', () => {
  it('un crash a meta non lascia ne duplicati ne buchi', async () => {
    const rule = makeRule({
      startDate: '2026-07-01',
      cadence: 'daily',
      lastMaterializedDate: '2026-07-12',
    })
    const today = '2026-08-21'
    const disk: MemoryDisk = {
      expenses: [],
      categories: [],
      recurringRules: [rule],
      budgets: [],
      settings: null,
    }

    // Prima vita dell app: muore durante la terza transazione.
    const first = createMemoryPersistence(disk)
    first.crashAfter(3)
    await expect(
      materializeRecurring({
        today,
        rules: disk.recurringRules,
        expenses: disk.expenses,
        write: (batch) => first.write(batch),
        chunkSize: 7,
        now: tickingClock(),
      }),
    ).rejects.toBeInstanceOf(SimulatedCrashError)

    // Quello che e' sopravvissuto e' coerente: 14 spese e un segnaposto che le
    // dichiara esattamente, non una in piu' ne una in meno.
    expect(disk.expenses).toHaveLength(14)
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe('2026-07-26')
    expect(disk.expenses.at(-1)?.date).toBe('2026-07-26')

    // Seconda vita: si riapre sullo stesso disco e si riprende.
    const second = createMemoryPersistence(disk)
    await materializeRecurring({
      today,
      rules: disk.recurringRules,
      expenses: disk.expenses,
      write: (batch) => second.write(batch),
      chunkSize: 7,
      now: tickingClock(),
    })

    expect(disk.expenses).toHaveLength(40)
    const dates = disk.expenses.map((e) => e.date).sort()
    expect(new Set(dates).size).toBe(40)
    expect(dates[0]).toBe('2026-07-13')
    expect(dates.at(-1)).toBe(today)
    expect(disk.recurringRules[0]?.lastMaterializedDate).toBe(today)
  })

  it('anche crashando a ogni singolo blocco si converge senza duplicati', async () => {
    const rule = makeRule({
      startDate: '2026-07-01',
      cadence: 'daily',
      lastMaterializedDate: '2026-07-12',
    })
    const today = '2026-08-21'
    const disk: MemoryDisk = {
      expenses: [],
      categories: [],
      recurringRules: [rule],
      budgets: [],
      settings: null,
    }

    let lives = 0
    let done = false
    while (!done && lives < 100) {
      lives += 1
      const persistence = createMemoryPersistence(disk)
      // Muore sempre alla seconda transazione della sessione.
      persistence.crashAfter(2)
      try {
        await materializeRecurring({
          today,
          rules: disk.recurringRules,
          expenses: disk.expenses,
          write: (batch) => persistence.write(batch),
          chunkSize: 5,
          now: tickingClock(),
        })
        done = true
      } catch (error) {
        expect(error).toBeInstanceOf(SimulatedCrashError)
      }
      // Invariante dopo ogni vita: il segnaposto non promette mai piu' di cio'
      // che e' stato scritto davvero.
      const marker = disk.recurringRules[0]?.lastMaterializedDate
      const written = new Set(disk.expenses.map((e) => e.date))
      let cursor = '2026-07-13'
      while (marker !== undefined && cursor <= marker) {
        expect(written.has(cursor)).toBe(true)
        cursor = addDays(cursor, 1)
      }
    }

    expect(done).toBe(true)
    expect(disk.expenses).toHaveLength(40)
    expect(new Set(disk.expenses.map((e) => e.date)).size).toBe(40)
  })
})

describe('materializzazione: regole ignorate', () => {
  it('salta le regole disattivate', async () => {
    const h = harness([makeRule({ startDate: '2026-08-01', cadence: 'daily', active: false })])
    await h.run('2026-08-10')
    expect(h.disk.expenses).toHaveLength(0)
  })

  it('salta le regole non valide senza fermare le altre', async () => {
    const broken = makeRule({ id: 'rotta', startDate: '2026-08-01', cadence: 'daily', interval: 0 })
    const good = makeRule({ id: 'buona', startDate: '2026-08-01', cadence: 'daily' })
    const disk: MemoryDisk = {
      expenses: [],
      categories: [],
      recurringRules: [broken, good],
      budgets: [],
      settings: null,
    }
    const persistence = createMemoryPersistence(disk)
    const result = await materializeRecurring({
      today: '2026-08-03',
      rules: disk.recurringRules,
      expenses: disk.expenses,
      write: (batch) => persistence.write(batch),
      now: tickingClock(),
    })
    expect(result.skipped).toEqual([{ ruleId: 'rotta', reason: 'interval non valido: 0' }])
    expect(result.created).toHaveLength(3)
    expect(disk.expenses.every((e) => e.recurringId === 'buona')).toBe(true)
  })

  it('una regola che inizia domani non produce niente oggi', async () => {
    const h = harness([makeRule({ startDate: '2026-09-01', cadence: 'daily' })])
    await h.run('2026-08-31')
    expect(h.disk.expenses).toHaveLength(0)
    expect(h.disk.recurringRules[0]?.lastMaterializedDate).toBeUndefined()
  })

  it('una regola scaduta si ferma a endDate e non riparte piu', async () => {
    const h = harness([
      makeRule({ startDate: '2026-08-01', endDate: '2026-08-03', cadence: 'daily' }),
    ])
    await h.run('2026-08-20')
    expect(h.disk.expenses).toHaveLength(3)
    expect(h.disk.recurringRules[0]?.lastMaterializedDate).toBe('2026-08-03')
    expect(await h.run('2026-09-20')).toBe(0)
  })

  it('la spesa generata porta importo e categoria della regola, e nessuna nota', () => {
    // La nota **non** c e: una regola non ne ha piu una, perche non esisteva
    // nessuna schermata capace di scriverla. Vedi la nota su `RecurringRule`.
    const h = harness([
      makeRule({
        startDate: '2026-08-01',
        cadence: 'daily',
        amountCents: 1234,
        categoryId: 'cat-affitto',
      }),
    ])
    return h.run('2026-08-01').then(() => {
      const expense = h.disk.expenses[0]
      expect(expense?.amountCents).toBe(1234)
      expect(expense?.categoryId).toBe('cat-affitto')
      expect(expense?.note).toBeUndefined()
      expect(expense?.source).toBe('recurring')
      expect(expense?.recurringId).toBe(h.disk.recurringRules[0]?.id)
    })
  })
})
