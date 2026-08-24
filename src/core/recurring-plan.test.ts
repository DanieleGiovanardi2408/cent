import { describe, expect, it } from 'vitest'
import { createMemoryPersistence } from './memory-persistence'
import type { MemoryDisk } from './memory-persistence'
import { materializeRecurring } from './recurrence'
import {
  DAYS_PER_YEAR,
  monthlyCostCents,
  monthlyFixedCosts,
  planRecurringRuleDeletion,
  previewMaterialization,
  redeemPreview,
} from './recurring-plan'
import type { RecurrenceDraft } from './recurring-plan'
import { makeExpense, makeRule, tickingClock } from './testing'
import type { RecurringRule } from './types'

/* ------------------------------------------------------------------------- *
 * 1. Il totale mensile delle fisse
 * ------------------------------------------------------------------------- */

describe('monthlyCostCents: la convenzione dichiarata', () => {
  it('una mensile con interval 1 e esatta: nessuna approssimazione sul caso piu comune', () => {
    // E' il motivo per cui la normalizzazione passa dall anno: 12/12 = 1, quindi
    // l affitto — la ragione per cui questo numero esiste — non viene toccato.
    const affitto = makeRule({ startDate: '2026-01-01', cadence: 'monthly', amountCents: 90_000 })
    expect(monthlyCostCents(affitto)).toBe(90_000)
  })

  it('una mensile ogni 2 mesi pesa meta', () => {
    const rule = makeRule({
      startDate: '2026-01-01',
      cadence: 'monthly',
      interval: 2,
      amountCents: 90_000,
    })
    expect(monthlyCostCents(rule)).toBe(45_000)
  })

  it('una settimanale da 100 vale 434,81 al mese, non 400', () => {
    // 10000 * 52,1775 / 12 = 43481,25 -> 43481.
    // La convenzione "4 settimane al mese" darebbe 40000, cioe' 4.800 all anno
    // invece di 5.217: 417 euro l anno di errore, sempre in difetto.
    const rule = makeRule({ startDate: '2026-01-01', cadence: 'weekly', amountCents: 10_000 })
    expect(monthlyCostCents(rule)).toBe(43_481)
  })

  it('una giornaliera da 5 vale 152,18 al mese, non 150', () => {
    const rule = makeRule({ startDate: '2026-01-01', cadence: 'daily', amountCents: 500 })
    expect(monthlyCostCents(rule)).toBe(15_218)
  })

  it('giornaliera ogni 7 giorni e settimanale ogni settimana danno lo stesso numero', () => {
    const ogniSette = makeRule({
      startDate: '2026-01-01',
      cadence: 'daily',
      interval: 7,
      amountCents: 10_000,
    })
    const settimanale = makeRule({
      startDate: '2026-01-01',
      cadence: 'weekly',
      amountCents: 10_000,
    })
    expect(monthlyCostCents(ogniSette)).toBe(monthlyCostCents(settimanale))
  })

  it('la proprieta che conta: dodici mesi fanno l anno vero, a meno del centesimo', () => {
    // E' cio' per cui la convenzione e' stata scelta. Il numero verra'
    // confrontato con uno stipendio, quindi e' l anno a dover tornare.
    const casi: { rule: RecurringRule; perAnno: number }[] = [
      {
        rule: makeRule({ startDate: '2026-01-01', cadence: 'weekly', amountCents: 10_000 }),
        perAnno: (10_000 * DAYS_PER_YEAR) / 7,
      },
      {
        rule: makeRule({ startDate: '2026-01-01', cadence: 'daily', amountCents: 500 }),
        perAnno: 500 * DAYS_PER_YEAR,
      },
      {
        rule: makeRule({
          startDate: '2026-01-01',
          cadence: 'monthly',
          interval: 3,
          amountCents: 30_000,
        }),
        perAnno: (30_000 * 12) / 3,
      },
    ]
    for (const { rule, perAnno } of casi) {
      // Al massimo 12 centesimi di scarto: un arrotondamento per mese.
      expect(Math.abs(monthlyCostCents(rule) * 12 - perAnno)).toBeLessThanOrEqual(12)
    }
  })

  it('una regola non valida vale zero e non lancia', () => {
    const rotta = makeRule({ startDate: '2026-01-01', cadence: 'monthly', interval: 0 })
    expect(() => monthlyCostCents(rotta)).not.toThrow()
    expect(monthlyCostCents(rotta)).toBe(0)
    const anchor = makeRule({ startDate: '2026-01-01', cadence: 'monthly', anchorDay: 40 })
    expect(monthlyCostCents(anchor)).toBe(0)
  })

  it('e sempre un intero: mai un centesimo con la virgola', () => {
    for (const amount of [1, 7, 333, 99_999, 1_234_567]) {
      for (const cadence of ['daily', 'weekly', 'monthly'] as const) {
        for (const interval of [1, 2, 3, 5, 13]) {
          const value = monthlyCostCents(
            makeRule({ startDate: '2026-01-01', cadence, interval, amountCents: amount }),
          )
          expect(Number.isInteger(value)).toBe(true)
        }
      }
    }
  })
})

describe('monthlyFixedCosts: "Fisse: X al mese"', () => {
  const oggi = '2026-08-22'

  it('somma le regole in vigore e il totale e esattamente la somma delle righe', () => {
    const rules = [
      makeRule({ id: 'r-affitto', startDate: '2026-01-01', cadence: 'monthly', amountCents: 90_000 }),
      makeRule({ id: 'r-palestra', startDate: '2026-01-01', cadence: 'weekly', amountCents: 2_500 }),
      makeRule({ id: 'r-caffe', startDate: '2026-01-01', cadence: 'daily', amountCents: 150 }),
    ]
    const { totalCents, lines } = monthlyFixedCosts(rules, oggi)
    expect(lines).toHaveLength(3)
    expect(totalCents).toBe(lines.reduce((sum, line) => sum + line.monthlyCents, 0))
    expect(lines.map((l) => l.rule.id)).toEqual(['r-affitto', 'r-palestra', 'r-caffe'])
    expect(lines[0]?.monthlyCents).toBe(90_000)
  })

  it('le regole disattivate non contano', () => {
    const rules = [
      makeRule({ startDate: '2026-01-01', cadence: 'monthly', amountCents: 90_000 }),
      makeRule({ startDate: '2026-01-01', cadence: 'monthly', amountCents: 50_000, active: false }),
    ]
    expect(monthlyFixedCosts(rules, oggi).totalCents).toBe(90_000)
  })

  it('una regola gia finita non conta; una che finisce oggi si', () => {
    const finita = makeRule({
      startDate: '2026-01-01',
      cadence: 'monthly',
      amountCents: 50_000,
      endDate: '2026-08-21',
    })
    const finisceOggi = makeRule({
      startDate: '2026-01-01',
      cadence: 'monthly',
      amountCents: 30_000,
      endDate: '2026-08-22',
    })
    expect(monthlyFixedCosts([finita], oggi).totalCents).toBe(0)
    expect(monthlyFixedCosts([finisceOggi], oggi).totalCents).toBe(30_000)
  })

  it('una regola che comincia domani non conta ancora; una che comincia oggi si', () => {
    // Limite dichiarato: e' la fotografia di adesso, non un piano.
    const domani = makeRule({
      startDate: '2026-08-23',
      cadence: 'monthly',
      amountCents: 70_000,
    })
    const oggiStesso = makeRule({
      startDate: '2026-08-22',
      cadence: 'monthly',
      amountCents: 70_000,
    })
    expect(monthlyFixedCosts([domani], oggi).lines).toHaveLength(0)
    expect(monthlyFixedCosts([oggiStesso], oggi).totalCents).toBe(70_000)
  })

  it('una regola rotta non compare nemmeno come riga da zero', () => {
    const rotta = makeRule({ startDate: '2026-01-01', cadence: 'monthly', interval: 0 })
    expect(monthlyFixedCosts([rotta], oggi)).toEqual({ totalCents: 0, lines: [] })
  })

  it('l ordine e totale: due regole dello stesso peso non si scambiano di posto', () => {
    const a = makeRule({ id: 'r-a', startDate: '2026-01-01', cadence: 'monthly', amountCents: 5_000 })
    const b = makeRule({ id: 'r-b', startDate: '2026-01-01', cadence: 'monthly', amountCents: 5_000 })
    expect(monthlyFixedCosts([a, b], oggi).lines.map((l) => l.rule.id)).toEqual(['r-a', 'r-b'])
    expect(monthlyFixedCosts([b, a], oggi).lines.map((l) => l.rule.id)).toEqual(['r-a', 'r-b'])
  })

  it('nessuna regola: zero e nessuna riga, senza lanciare', () => {
    expect(monthlyFixedCosts([], oggi)).toEqual({ totalCents: 0, lines: [] })
  })
})

/* ------------------------------------------------------------------------- *
 * 2. L'anteprima prima di scrivere
 * ------------------------------------------------------------------------- */

function ok(result: ReturnType<typeof previewMaterialization>) {
  if (!result.ok) throw new Error(`anteprima rifiutata: ${result.reason}`)
  return result
}

describe('previewMaterialization: cosa succede se salvo', () => {
  it('affitto 900 mensile dal 1 gennaio, creato il 22 agosto: 8 spese, 7.200 euro', () => {
    // E' il caso del brief, alla lettera.
    const draft: RecurrenceDraft = {
      amountCents: 90_000,
      cadence: 'monthly',
      interval: 1,
      startDate: '2026-01-01',
    }
    const p = ok(previewMaterialization(draft, '2026-08-22'))
    expect(p.count).toBe(8)
    expect(p.firstDate).toBe('2026-01-01')
    expect(p.lastDate).toBe('2026-08-01')
    expect(p.totalCents).toBe(720_000)
    expect(p.backdated).toBe(true)
  })

  it('una regola che parte oggi non e arretrata: una occorrenza sola, nessuna conferma da chiedere', () => {
    const p = ok(
      previewMaterialization(
        { amountCents: 90_000, cadence: 'monthly', interval: 1, startDate: '2026-08-22' },
        '2026-08-22',
      ),
    )
    expect(p.count).toBe(1)
    expect(p.backdated).toBe(false)
    expect(p.totalCents).toBe(90_000)
  })

  it('una regola che parte domani non scrive niente', () => {
    const p = ok(
      previewMaterialization(
        { amountCents: 90_000, cadence: 'monthly', interval: 1, startDate: '2026-08-23' },
        '2026-08-22',
      ),
    )
    expect(p).toMatchObject({
      count: 0,
      firstDate: null,
      lastDate: null,
      totalCents: 0,
      backdated: false,
      dates: [],
      truncated: false,
    })
  })

  it('anchorDay 31 in anteprima cade a fine febbraio, esattamente come nel motore', () => {
    const p = ok(
      previewMaterialization(
        {
          amountCents: 10_000,
          cadence: 'monthly',
          interval: 1,
          anchorDay: 31,
          startDate: '2026-01-31',
        },
        '2026-05-01',
      ),
    )
    expect(p.dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
    expect(p.count).toBe(4)
  })

  it('endDate taglia la finestra: una regola gia finita mostra solo le sue occorrenze', () => {
    const p = ok(
      previewMaterialization(
        {
          amountCents: 1_000,
          cadence: 'weekly',
          interval: 1,
          startDate: '2026-01-05',
          endDate: '2026-02-02',
        },
        '2026-08-22',
      ),
    )
    expect(p.count).toBe(5)
    expect(p.lastDate).toBe('2026-02-02')
    expect(p.totalCents).toBe(5_000)
  })

  it('una regola non valida non lancia: rifiuta con il motivo di validateRule', () => {
    const r = previewMaterialization(
      { amountCents: 1_000, cadence: 'monthly', interval: 0, startDate: '2026-01-01' },
      '2026-08-22',
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('interval')

    const invertita = previewMaterialization(
      {
        amountCents: 1_000,
        cadence: 'monthly',
        interval: 1,
        startDate: '2026-08-01',
        endDate: '2026-07-01',
      },
      '2026-08-22',
    )
    expect(invertita.ok).toBe(false)
  })

  it('l elenco delle date si taglia, il conteggio no', () => {
    const p = ok(
      previewMaterialization(
        { amountCents: 100, cadence: 'daily', interval: 1, startDate: '2026-01-01' },
        '2026-08-22',
        5,
      ),
    )
    expect(p.count).toBe(234)
    expect(p.totalCents).toBe(23_400)
    expect(p.dates).toHaveLength(5)
    expect(p.truncated).toBe(true)
  })

  it('una regola gia materializzata parte dal segnaposto, non da startDate', () => {
    // Serve a riattivare una regola rimasta ferma: mostra il recupero vero.
    const p = ok(
      previewMaterialization(
        {
          amountCents: 90_000,
          cadence: 'monthly',
          interval: 1,
          startDate: '2026-01-01',
          lastMaterializedDate: '2026-06-15',
        },
        '2026-08-22',
      ),
    )
    expect(p.dates).toEqual(['2026-07-01', '2026-08-01'])
    expect(p.count).toBe(2)
  })

  /**
   * Il vincolo duro: **l'anteprima e' la scrittura**. Se i due numeri
   * divergessero, la conferma diventerebbe una bugia con un bottone sotto.
   *
   * Non e' un confronto "a occhio" su un caso: si materializza davvero, su una
   * persistenza vera, e si confrontano conteggio, estremi e totale.
   */
  it('quello che l anteprima annuncia e esattamente quello che il motore scrive', async () => {
    const casi: { rule: RecurringRule; today: string }[] = [
      {
        rule: makeRule({
          startDate: '2026-01-01',
          cadence: 'monthly',
          amountCents: 90_000,
        }),
        today: '2026-08-22',
      },
      {
        rule: makeRule({
          startDate: '2026-01-31',
          cadence: 'monthly',
          anchorDay: 31,
          amountCents: 12_345,
        }),
        today: '2026-07-15',
      },
      {
        rule: makeRule({ startDate: '2026-07-13', cadence: 'daily', amountCents: 250 }),
        today: '2026-08-22',
      },
      {
        rule: makeRule({
          startDate: '2026-01-05',
          cadence: 'weekly',
          interval: 2,
          amountCents: 3_000,
          endDate: '2026-04-30',
        }),
        today: '2026-08-22',
      },
      {
        rule: makeRule({ startDate: '2026-08-22', cadence: 'monthly', amountCents: 1_000 }),
        today: '2026-08-22',
      },
      {
        rule: makeRule({ startDate: '2026-09-01', cadence: 'monthly', amountCents: 1_000 }),
        today: '2026-08-22',
      },
    ]

    for (const { rule, today } of casi) {
      const preview = ok(previewMaterialization(rule, today))

      const disk: MemoryDisk = {
        expenses: [],
        categories: [],
        recurringRules: [rule],
        budgets: [],
        settings: null,
      }
      const persistence = createMemoryPersistence(disk)
      await materializeRecurring({
        today,
        rules: disk.recurringRules,
        expenses: disk.expenses,
        write: (batch) => persistence.write(batch),
        chunkSize: 7,
        now: tickingClock(),
      })

      const scritte = disk.expenses.map((e) => e.date).sort()
      expect(scritte).toHaveLength(preview.count)
      expect(scritte[0] ?? null).toBe(preview.firstDate)
      expect(scritte[scritte.length - 1] ?? null).toBe(preview.lastDate)
      expect(disk.expenses.reduce((sum, e) => sum + e.amountCents, 0)).toBe(preview.totalCents)
    }
  })

  it('il catch-up di 40 giorni annunciato coincide con quello scritto', async () => {
    const rule = makeRule({ startDate: '2026-07-13', cadence: 'daily', amountCents: 250 })
    const today = '2026-08-22'
    const preview = ok(previewMaterialization(rule, today))
    expect(preview.count).toBe(41)
    expect(preview.backdated).toBe(true)

    const disk: MemoryDisk = {
      expenses: [],
      categories: [],
      recurringRules: [rule],
      budgets: [],
      settings: null,
    }
    const persistence = createMemoryPersistence(disk)
    await materializeRecurring({
      today,
      rules: disk.recurringRules,
      expenses: disk.expenses,
      write: (batch) => persistence.write(batch),
      chunkSize: 5,
      now: tickingClock(),
    })
    expect(disk.expenses).toHaveLength(41)
    // E ripetere non aggiunge niente: l anteprima non cambia il motore.
    await materializeRecurring({
      today,
      rules: disk.recurringRules,
      expenses: disk.expenses,
      write: (batch) => persistence.write(batch),
      now: tickingClock(),
    })
    expect(disk.expenses).toHaveLength(41)
  })
})

/* ------------------------------------------------------------------------- *
 * 3. Cancellare una regola
 * ------------------------------------------------------------------------- */

describe('planRecurringRuleDeletion', () => {
  const regola = makeRule({ id: 'r-affitto', startDate: '2026-01-01', cadence: 'monthly' })

  it('una regola che non ha mai generato niente si cancella', () => {
    const plan = planRecurringRuleDeletion([regola], [], { id: 'r-affitto' })
    expect(plan).toEqual({ ok: true, deleted: regola })
  })

  it('una regola che ha generato spese si rifiuta, col numero da mostrare', () => {
    const spese = [
      makeExpense({ date: '2026-01-01', source: 'recurring', recurringId: 'r-affitto' }),
      makeExpense({ date: '2026-02-01', source: 'recurring', recurringId: 'r-affitto' }),
      makeExpense({ date: '2026-02-05' }),
      makeExpense({ date: '2026-02-01', source: 'recurring', recurringId: 'r-altra' }),
    ]
    expect(planRecurringRuleDeletion([regola], spese, { id: 'r-affitto' })).toEqual({
      ok: false,
      reason: 'in-use',
      expenses: 2,
    })
  })

  it('le spese cancellate contano lo stesso: restano nello Storico e nell export', () => {
    const spese = [
      makeExpense({
        date: '2026-01-01',
        source: 'recurring',
        recurringId: 'r-affitto',
        deletedAt: '2026-01-02T10:00:00.000Z',
      }),
    ]
    expect(planRecurringRuleDeletion([regola], spese, { id: 'r-affitto' })).toMatchObject({
      ok: false,
      reason: 'in-use',
      expenses: 1,
    })
  })

  it('un id sconosciuto e unknown, non in-use', () => {
    expect(planRecurringRuleDeletion([regola], [], { id: 'r-mai-esistita' })).toEqual({
      ok: false,
      reason: 'unknown',
    })
  })

  it('lastMaterializedDate valorizzato ma nessuna spesa generata: si cancella lo stesso', () => {
    // Il segnaposto avanza anche quando la finestra non conteneva occorrenze
    // (una mensile creata il 5, segnaposto a oggi, prima occorrenza il mese
    // prossimo). Guardare il segnaposto invece dei riferimenti veri bloccherebbe
    // una cancellazione perfettamente sicura.
    const ferma = makeRule({
      id: 'r-ferma',
      startDate: '2026-09-01',
      cadence: 'monthly',
      lastMaterializedDate: '2026-08-22',
    })
    expect(planRecurringRuleDeletion([ferma], [], { id: 'r-ferma' })).toMatchObject({ ok: true })
  })
})

/* ------------------------------------------------------------------------- *
 * 2 bis. Il permesso di scrivere, e la mezzanotte
 * ------------------------------------------------------------------------- */

describe('ConfirmedPreview: il permesso esiste solo se l anteprima e stata calcolata', () => {
  const bozza: RecurrenceDraft = {
    amountCents: 90_000,
    cadence: 'monthly',
    interval: 1,
    startDate: '2026-01-01',
  }

  it('un esito positivo porta il permesso, un rifiuto no', () => {
    const buona = previewMaterialization(bozza, '2026-08-22')
    expect(buona.ok).toBe(true)
    expect(buona.ok && buona.confirmed).toBeDefined()

    const rotta = previewMaterialization({ ...bozza, interval: 0 }, '2026-08-22')
    expect(rotta.ok).toBe(false)
    // Non c'e' nessun ramo da cui esca un permesso: `ok: false` ha due campi e
    // basta. E' il senso di "chi salta l'anteprima non compila" — chi la chiama
    // e la ignora non ha comunque niente da spendere.
    expect(Object.keys(rotta)).toEqual(['ok', 'reason'])
  })

  it('il permesso e opaco: non ha campi leggibili da fuori', () => {
    const esito = previewMaterialization(bozza, '2026-08-22')
    if (!esito.ok) throw new Error('anteprima rifiutata')
    // Nessuna chiave stringa: il contenuto sta sotto un simbolo che fuori da
    // `recurring-plan.ts` non si puo' nominare. E' quello che impedisce
    // `{ ...permesso, day: ieri }`, cioe' la guardia della mezzanotte aggirata
    // in una riga da chi ha fretta.
    expect(Object.keys(esito.confirmed)).toEqual([])
    expect(JSON.stringify(esito.confirmed)).toBe('{}')
  })

  it('cambiare la bozza dopo l anteprima non cambia cio che il permesso autorizza', () => {
    // `readonly` e' un fatto del compilatore, non del runtime: un oggetto
    // costruito altrove puo' essere modificato dopo. Se il permesso tenesse il
    // riferimento, si annuncerebbe gennaio e si scriverebbe il 1900.
    const mutabile = { ...bozza }
    const esito = previewMaterialization(mutabile, '2026-08-22')
    if (!esito.ok) throw new Error('anteprima rifiutata')
    ;(mutabile as { startDate: string }).startDate = '1900-01-01'

    const speso = redeemPreview(esito.confirmed, '2026-08-22', null)
    expect(speso.ok && speso.draft.startDate).toBe('2026-01-01')
  })
})

describe('redeemPreview: non ci si fida di un istantanea presa in un altro momento', () => {
  const bozza: RecurrenceDraft = {
    amountCents: 90_000,
    cadence: 'monthly',
    interval: 1,
    startDate: '2026-01-01',
  }

  function permesso(giorno: string, extra: Partial<RecurrenceDraft> = {}) {
    const esito = previewMaterialization({ ...bozza, ...extra }, giorno)
    if (!esito.ok) throw new Error(`anteprima rifiutata: ${esito.reason}`)
    return esito
  }

  it('stesso giorno: si spende', () => {
    expect(redeemPreview(permesso('2026-08-22').confirmed, '2026-08-22', null)).toMatchObject({
      ok: true,
    })
  })

  it('e passata la mezzanotte: rifiuta, e dice quali sono i due giorni', () => {
    // Anteprima calcolata alle 23:59:50 del 22, scrittura tentata alle 00:00:05
    // del 23. La finestra si e' allargata di un giorno: la scrittura
    // produrrebbe **un'occorrenza in piu' di quelle annunciate**, cioe' il verso
    // sbagliato — si annuncerebbe meno di quanto si fa.
    const giornaliera = { cadence: 'daily' as const, interval: 1, startDate: '2026-08-15' }
    const ieri = permesso('2026-08-22', giornaliera)
    expect(ieri.count).toBe(8)
    expect(ieri.lastDate).toBe('2026-08-22')
    // La stessa bozza, un giorno dopo, ne annuncia **nove**: e' esattamente cio'
    // che la scrittura produrrebbe senza questa guardia, contro una conferma
    // che ne diceva otto.
    expect(permesso('2026-08-23', giornaliera).count).toBe(9)

    expect(redeemPreview(ieri.confirmed, '2026-08-23', null)).toEqual({
      ok: false,
      reason: 'stale-preview',
      previewedOn: '2026-08-22',
      today: '2026-08-23',
    })
  })

  it('vale in tutti e due i versi: un anteprima di domani non e adesso', () => {
    // Il verso "in avanti" annuncerebbe piu' di quanto si scrive, cioe' il verso
    // accettabile. Si rifiuta lo stesso: il confronto e' di uguaglianza perche'
    // un'istantanea presa in un altro momento non descrive questo momento, e un
    // orologio che salta in avanti non e' una condizione da assecondare.
    expect(redeemPreview(permesso('2026-08-23').confirmed, '2026-08-22', null)).toMatchObject({
      ok: false,
      reason: 'stale-preview',
    })
  })

  it('il segnaposto e la stessa guardia vista dall altro estremo', () => {
    const conSegnaposto = permesso('2026-08-22', { lastMaterializedDate: '2026-07-01' })
    // Speso sulla regola giusta: passa.
    expect(redeemPreview(conSegnaposto.confirmed, '2026-08-22', '2026-07-01')).toMatchObject({
      ok: true,
    })
    // Nel frattempo una materializzazione ha fatto avanzare il segnaposto: i
    // numeri annunciati non descrivono piu' la finestra vera.
    expect(redeemPreview(conSegnaposto.confirmed, '2026-08-22', '2026-08-01')).toEqual({
      ok: false,
      reason: 'moved-on',
      previewedMarker: '2026-07-01',
      currentMarker: '2026-08-01',
    })
  })

  it('un anteprima con segnaposto non si spende su una regola che non ne ha', () => {
    // E' il caso pericoloso: la finestra annunciata parte dal 2 luglio e vale
    // **una** occorrenza, quella vera partirebbe dal 1 gennaio e ne vale otto.
    // Sette spese che nessuno ha visto.
    const conSegnaposto = permesso('2026-08-22', { lastMaterializedDate: '2026-07-01' })
    expect(conSegnaposto.count).toBe(1)
    expect(permesso('2026-08-22').count).toBe(8)
    expect(redeemPreview(conSegnaposto.confirmed, '2026-08-22', null)).toEqual({
      ok: false,
      reason: 'moved-on',
      previewedMarker: '2026-07-01',
      currentMarker: null,
    })
  })
})

describe('previewMaterialization: e l unica porta, quindi controlla tutto', () => {
  it('un importo non intero non produce nessun permesso', () => {
    // Prima lo controllava `addRecurringRule` con una `assertCents` che
    // lanciava. Adesso l'importo entra in una regola solo da qui, quindi il
    // controllo e' qui — e risponde invece di lanciare, perche' questa funzione
    // gira mentre l'utente sta ancora digitando.
    const esito = previewMaterialization(
      { amountCents: 12.5, cadence: 'daily', interval: 1, startDate: '2026-08-01' },
      '2026-08-22',
    )
    expect(esito).toEqual({ ok: false, reason: 'amountCents non intero: 12.5' })
  })

  it('una startDate malformata non produce nessun permesso', () => {
    const esito = previewMaterialization(
      { amountCents: 100, cadence: 'daily', interval: 1, startDate: '22/08/2026' },
      '2026-08-22',
    )
    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.reason).toContain('startDate')
  })

  it('un today malformato non produce nessun permesso', () => {
    // Nessuno lo controllava: un `today` sbagliato avrebbe prodotto un permesso
    // che non corrisponde a nessun giorno civile, e quindi non spendibile mai —
    // un rifiuto misterioso invece di un errore nel punto in cui nasce.
    const esito = previewMaterialization(
      { amountCents: 100, cadence: 'daily', interval: 1, startDate: '2026-08-01' },
      'oggi',
    )
    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.reason).toContain('today')
  })
})
