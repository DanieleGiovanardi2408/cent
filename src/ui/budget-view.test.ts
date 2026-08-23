import { describe, expect, it } from 'vitest'
import { computeBudgetMetrics } from '../core/budget'
import type { BudgetMetrics } from '../core/budget'
import { addDays } from '../core/date'
import { makeBudget, makeExpense } from '../core/testing'
import type { Budget, Expense } from '../core/types'
import { setLanguage } from './i18n'
import type { AllowanceCopy } from './budget-view'
import {
  activePeriod,
  allowanceCopy,
  budgetStart,
  heroCopy,
  paceParts,
  spentRatio,
  startNote,
} from './budget-view'

/**
 * I test della Home stanno qui e non in un test di componente: quello che puo'
 * sbagliare sono **le parole intorno ai numeri**, e in particolare i due `null`
 * di `computeBudgetMetrics` — il passo del primo giorno e la disponibilita' a
 * periodo finito. Sono i due rami che a mano non si provano mai, perche' per
 * vederli bisogna aprire l'app il lunedi' mattina o su un periodo passato.
 *
 * Il resto (dove sta il numero grande, quanto e' alto il riquadro) e' geometria,
 * e la geometria la misura la sonda in `tests/e2e`.
 */

/**
 * Le frasi si provano in **italiano**, dichiarato.
 *
 * Prima della fase 3 era implicito — `formatCents` aveva `it-IT` dentro e le
 * stringhe erano scritte nel modulo — e questa riga e' la parte visibile di
 * quella correzione: non e' un'impalcatura di test, e' la lingua che smette di
 * essere una premessa nascosta. L'inglese non ha un test gemello qui e non deve
 * averlo: quello che cambia sono le parole, e la parita' delle chiavi la
 * garantisce il compilatore. Quello che questo file prova — i due `null` di
 * `computeBudgetMetrics`, i rami che a mano non si toccano mai — non dipende
 * dalla lingua.
 */
setLanguage('it')

// Lunedi' 17 agosto 2026 e' l'inizio della settimana; domenica 23 la fine.
const LUNEDI = '2026-08-17'
const MERCOLEDI = '2026-08-19'
const DOMENICA = '2026-08-23'

function metrics(options: {
  readonly today: string
  readonly budgetCents?: number
  readonly spese?: readonly Expense[]
  /** Da che giorno vale il budget. Senza, vale da molto prima del periodo. */
  readonly dal?: string
  /** Un budget precedente, chiuso il giorno prima di `dal`: c'era gia' una regola. */
  readonly primaCera?: number
}): BudgetMetrics {
  const from = options.dal ?? '2026-01-01'
  const budgets: Budget[] = []
  if (options.primaCera !== undefined) {
    budgets.push(
      makeBudget({
        period: 'weekly',
        amountCents: options.primaCera,
        effectiveFrom: '2026-01-01',
        effectiveTo: addDays(from, -1),
      }),
    )
  }
  if (options.budgetCents !== undefined) {
    budgets.push(
      makeBudget({ period: 'weekly', amountCents: options.budgetCents, effectiveFrom: from }),
    )
  }
  return computeBudgetMetrics({
    expenses: options.spese ?? [],
    budgets,
    period: 'weekly',
    onDate: options.today,
    today: options.today,
  })
}

const spesa = (date: string, amountCents: number): Expense => makeExpense({ date, amountCents })

describe('quale periodo guarda la Home', () => {
  it('senza nessun budget parte dalla settimana', () => {
    expect(activePeriod([], MERCOLEDI)).toBe('weekly')
  })

  it('segue il periodo dell unico budget in vigore', () => {
    const mensile = makeBudget({ period: 'monthly', amountCents: 80_000, effectiveFrom: '2026-08-01' })
    expect(activePeriod([mensile], MERCOLEDI)).toBe('monthly')
  })

  it('con due budget aperti insieme vince quello impostato per ultimo', () => {
    // Succede davvero: `planResolvedBudgetChange` chiude solo i record dello
    // stesso periodo, quindi settimanale e mensile possono restare aperti
    // entrambi.
    const settimanale = makeBudget({ period: 'weekly', amountCents: 20_000, effectiveFrom: '2026-08-01' })
    const mensile = makeBudget({ period: 'monthly', amountCents: 80_000, effectiveFrom: '2026-08-10' })
    expect(activePeriod([settimanale, mensile], MERCOLEDI)).toBe('monthly')
    expect(activePeriod([mensile, settimanale], MERCOLEDI)).toBe('monthly')
  })

  it('a parita di giorno decide chi e stato impostato dopo, e l ordine dell array non conta', () => {
    const a = makeBudget({
      id: 'a',
      period: 'weekly',
      amountCents: 20_000,
      effectiveFrom: '2026-08-10',
      createdAt: '2026-08-10T08:00:00.000Z',
      updatedAt: '2026-08-10T08:00:00.000Z',
    })
    const b = makeBudget({
      id: 'b',
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: '2026-08-10',
      createdAt: '2026-08-10T09:00:00.000Z',
      updatedAt: '2026-08-10T09:00:00.000Z',
    })
    expect(activePeriod([a, b], MERCOLEDI)).toBe('monthly')
    expect(activePeriod([b, a], MERCOLEDI)).toBe('monthly')
  })

  /**
   * La sequenza che aveva rotto la Home: 200 a settimana, 800 al mese, 300 a
   * settimana, tutte nello stesso giorno.
   *
   * Il terzo gesto non crea un record: `planResolvedBudgetChange` trova un
   * settimanale con lo stesso `effectiveFrom` e lo **aggiorna sul posto**,
   * conservando `createdAt` e toccando `updatedAt`. Guardando `createdAt`, il
   * settimanale restava piu' vecchio del mensile e la Home continuava a mostrare
   * il mese mentre il toast diceva "Budget: 300,00 € a settimana".
   */
  it('tornare al periodo di prima nello stesso giorno riporta la Home li', () => {
    const settimanale = makeBudget({
      id: 'w',
      period: 'weekly',
      amountCents: 30_000,
      effectiveFrom: MERCOLEDI,
      createdAt: '2026-08-19T10:00:00.000Z', // il primo dei tre gesti
      updatedAt: '2026-08-19T10:02:00.000Z', // il terzo: aggiornato sul posto
    })
    const mensile = makeBudget({
      id: 'm',
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: MERCOLEDI,
      createdAt: '2026-08-19T10:01:00.000Z',
      updatedAt: '2026-08-19T10:01:00.000Z',
    })
    expect(activePeriod([settimanale, mensile], MERCOLEDI)).toBe('weekly')
    expect(activePeriod([mensile, settimanale], MERCOLEDI)).toBe('weekly')
  })

  it('un budget chiuso ieri non decide piu niente', () => {
    const chiuso = makeBudget({
      period: 'monthly',
      amountCents: 80_000,
      effectiveFrom: '2026-01-01',
      effectiveTo: '2026-08-18',
    })
    expect(activePeriod([chiuso], MERCOLEDI)).toBe('weekly')
  })
})

describe('il numero grande', () => {
  it('senza budget mostra quanto si e speso, non una schermata vuota', () => {
    const hero = heroCopy(metrics({ today: MERCOLEDI, spese: [spesa(LUNEDI, 5000)] }))
    expect(hero.label).toBe('Spesi')
    expect(hero.value).toContain('50,00')
    expect(hero.over).toBe(false)
    expect(hero.note).not.toBe('')
  })

  it('con budget mostra il residuo, non la spesa', () => {
    const hero = heroCopy(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 5000)] }),
    )
    expect(hero.label).toBe('Restano')
    expect(hero.value).toContain('150,00')
  })

  it('sforando resta il residuo, col segno: il numero non torna mai a salire', () => {
    const hero = heroCopy(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 21_250)] }),
    )
    expect(hero.over).toBe(true)
    expect(hero.value).toContain('-')
    expect(hero.value).toContain('12,50')
    // Piu' si spende, piu' scende. E' l'invariante che rende leggibile il numero
    // in mezzo secondo.
    const dopo = heroCopy(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 22_250)] }),
    )
    expect(dopo.value).toContain('22,50')
  })

  it('il tono "sforato" scatta al primo centesimo oltre, non prima', () => {
    const esatto = heroCopy(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 20_000)] }),
    )
    expect(esatto.over).toBe(false)
    const oltre = heroCopy(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 20_001)] }),
    )
    expect(oltre.over).toBe(true)
  })
})

describe('la barra del periodo', () => {
  it('resta fra 0 e 1 anche sforando', () => {
    expect(spentRatio(metrics({ today: MERCOLEDI, budgetCents: 20_000 }))).toBe(0)
    expect(
      spentRatio(metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 10_000)] })),
    ).toBe(0.5)
    expect(
      spentRatio(metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 90_000)] })),
    ).toBe(1)
  })

  it('senza budget non c e niente da riempire', () => {
    expect(spentRatio(metrics({ today: MERCOLEDI, spese: [spesa(LUNEDI, 9000)] }))).toBe(0)
  })
})

describe('quanto puoi spendere al giorno', () => {
  /**
   * `allowanceCopy` vuole `BudgetStart` per obbligo: senza, il caso di ADR 010
   * si perde in silenzio e la Home torna a dire "il budget e' finito" a chi il
   * budget lo ha appena creato. Qui il budget copre tutto il periodo, quindi
   * `budgetStart` risponde `late: false` qualunque cosa gli si passi.
   */
  const frase = (m: BudgetMetrics): AllowanceCopy => allowanceCopy(m, budgetStart(m, []))

  /**
   * Fra numero e simbolo dell'euro `Intl` mette uno spazio **non separabile**
   * (e' un invariante, sorvegliato da `money.test.ts`). Qui non e' quello che si
   * sta provando: si normalizza, come fa il grosso della suite.
   */
  const norm = (text: string): string => text.replace(/\s/g, ' ')

  it('e il residuo diviso i giorni che restano, oggi compreso', () => {
    // Mercoledi': restano mercoledi'-domenica, cioe' 5 giorni. 150,00 / 5 = 30,00.
    const copy = frase(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 5000)] }),
    )
    expect(copy.main).toContain('30,00')
    expect(copy.sub).toContain('5 giorni')
    expect(copy.over).toBe(false)
  })

  /**
   * L'ultimo giorno non e' un ritmo: e' un totale. Con `daysRemaining === 1` la
   * divisione e' per uno, quindi il numero e' esattamente il residuo — e la
   * tilde, che esiste per dire "e' una media", direbbe il falso. Visto sul
   * dispositivo: "Puoi spendere ~128,55 € al giorno" con sotto "per oggi, che
   * e' l'ultimo giorno", cioe' due righe che si contraddicono.
   */
  it('l ultimo giorno e un totale, non un ritmo: niente tilde e niente "al giorno"', () => {
    const copy = frase(metrics({ today: DOMENICA, budgetCents: 20_000 }))
    expect(norm(copy.main)).toBe('Puoi spendere 200,00 € oggi')
    expect(copy.main).not.toContain('~')
    expect(copy.main).not.toContain('al giorno')
    expect(copy.sub).toContain('Ultimo giorno')
    expect(copy.sub).not.toContain('1 giorni')
  })

  /**
   * E il numero e' il residuo **esatto**, non un arrotondamento: con un giorno
   * solo `divideCents` divide per uno. Se un giorno cambiasse, la tilde tolta
   * qui sopra tornerebbe a servire — questo test se ne accorgerebbe.
   */
  it('e il numero dell ultimo giorno e il residuo esatto', () => {
    const m = metrics({ today: DOMENICA, budgetCents: 20_000, spese: [spesa(LUNEDI, 7145)] })
    expect(m.daysRemaining).toBe(1)
    expect(m.dailyAllowanceCents).toBe(m.remainingCents)
    expect(norm(frase(m).main)).toBe('Puoi spendere 128,55 € oggi')
  })

  it('col residuo negativo non promette un tetto negativo: dice che il budget e finito', () => {
    const copy = frase(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 25_000)] }),
    )
    expect(copy.over).toBe(true)
    expect(copy.main).toBe('Il budget del periodo è finito.')
    expect(copy.sub).toContain('5 giorni')
    // Niente numeri negativi spacciati per una disponibilita'.
    expect(copy.main).not.toContain('-')
    // E nessun rimprovero: il tono e' quello di un'informazione.
    expect(copy.main + copy.sub).not.toContain('!')
  })

  /**
   * Il buco fra "positivo" e "negativo": con un residuo fra 0 e `giorni - 1`
   * centesimi `divideCents` da' 0 ma `remainingCents` e' ancora positivo, quindi
   * nessuno dei due rami scattava e la riga piu' importante dell'app diceva
   * `~0,00 € al giorno` nel colore normale, come se andasse tutto bene.
   */
  it('con zero al giorno lo dice, invece di promettere ~0,00 in tono neutro', () => {
    // 200,00 di budget, 199,97 spesi: restano 3 centesimi su 5 giorni.
    const copy = frase(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 19_997)] }),
    )
    expect(copy.main).toBe('Il budget del periodo è finito.')
    expect(copy.main).not.toContain('0,00')
    expect(copy.over).toBe(true)
  })

  it('col residuo esatto a zero non dice che puoi spendere zero', () => {
    const copy = frase(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 20_000)] }),
    )
    expect(copy.main).toBe('Il budget del periodo è finito.')
    expect(copy.over).toBe(true)
  })

  it('un centesimo al giorno e ancora una disponibilita, e si dice', () => {
    // Il confine dall'altra parte: 5 centesimi su 5 giorni fanno 1 al giorno.
    const copy = frase(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 19_995)] }),
    )
    expect(copy.main).toContain('0,01')
    expect(copy.over).toBe(false)
  })

  it('a periodo finito lo dice, invece di mostrare un trattino', () => {
    // Ramo difensivo: dalla Home non e' raggiungibile (il periodo si calcola
    // sempre intorno a oggi), ma esiste ed e' scritto.
    const passato = computeBudgetMetrics({
      expenses: [],
      budgets: [makeBudget({ period: 'weekly', amountCents: 20_000, effectiveFrom: '2026-01-01' })],
      period: 'weekly',
      onDate: '2026-08-10',
      today: MERCOLEDI,
    })
    expect(passato.daysRemaining).toBe(0)
    expect(passato.dailyAllowanceCents).toBeNull()
    const copy = frase(passato)
    expect(copy.main).toBe('Questo periodo è chiuso.')
    expect(copy.main).not.toContain('—')
  })
})

describe('passo attuale contro passo sostenibile', () => {
  const testo = (m: BudgetMetrics): string => paceParts(m).map((part) => part.text).join('')

  it('senza nessuna spesa non inventa un passo da zero euro al giorno', () => {
    const m = metrics({ today: MERCOLEDI, budgetCents: 20_000 })
    expect(m.currentPaceCents).toBe(0)
    expect(testo(m)).toBe('Nessuna spesa in questo periodo, per ora.')
  })

  it('il primo giorno spiega perche il passo non c e ancora', () => {
    const m = metrics({ today: LUNEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 5000)] })
    expect(m.currentPaceCents).toBeNull()
    expect(testo(m)).toContain('primo giorno')
    expect(testo(m)).not.toContain('—')
    expect(paceParts(m).some((part) => part.strong === true)).toBe(false)
  })

  it('sotto ritmo lo dice, e mette in evidenza i due numeri', () => {
    // Lunedi' e martedi' 20,00 in tutto su 3 giorni vissuti = 6,66 al giorno,
    // contro 200,00/7 = 28,57 sostenibili.
    const m = metrics({
      today: MERCOLEDI,
      budgetCents: 20_000,
      spese: [spesa(LUNEDI, 1000), spesa('2026-08-18', 1000)],
    })
    expect(testo(m)).toContain('Sotto ritmo')
    expect(paceParts(m).filter((part) => part.strong === true)).toHaveLength(2)
  })

  it('sopra ritmo lo dice con le stesse parole, cambiando una sola', () => {
    const sotto = metrics({
      today: MERCOLEDI,
      budgetCents: 20_000,
      spese: [spesa(LUNEDI, 1000), spesa('2026-08-18', 1000)],
    })
    const sopra = metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 15_000)] })
    expect(testo(sopra)).toContain('Sopra ritmo')
    expect(testo(sopra)).not.toContain('!')
    // La frase e' la stessa: cambia una parola, non il tono. Essere sopra ritmo
    // non e' un errore da annunciare diversamente.
    const forma = (m: BudgetMetrics): string =>
      testo(m).replace(/^S(otto|opra) ritmo/, 'X').replace(/[\d.,]+/g, 'N')
    expect(forma(sopra)).toBe(forma(sotto))
  })

  it('senza budget il passo si dice comunque: e l unica cosa vera che si sa', () => {
    const m = metrics({ today: MERCOLEDI, spese: [spesa(LUNEDI, 9000)] })
    expect(m.sustainablePaceCents).toBeNull()
    expect(testo(m)).toContain('30,00')
  })
})

/**
 * ADR 010: il budget e' del periodo e il periodo e' tutto, niente pro-rata. I
 * numeri non cambiano — cambia quello che la Home sa dire su di essi.
 *
 * Il caso non e' un limite: e' il **primo uso** della feature. Si imposta il
 * primo budget settimanale mercoledi' avendo gia' speso 240,00 fra lunedi' e
 * martedi', e senza una parola in piu' la Home dice "Il budget del periodo e'
 * finito" a chi il budget lo ha appena creato.
 */
describe('il budget nato a meta periodo', () => {
  const primaDue = [spesa(LUNEDI, 12_000), spesa('2026-08-18', 12_000)] as const

  it('quando copriva gia il primo giorno non c e niente da spiegare', () => {
    const m = metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 5000)] })
    const start = budgetStart(m, [spesa(LUNEDI, 5000)])
    expect(start.late).toBe(false)
    expect(startNote(m, start)).toBeNull()
  })

  it('lo dice, con quanto era gia uscito prima', () => {
    const m = metrics({
      today: MERCOLEDI,
      budgetCents: 20_000,
      dal: MERCOLEDI,
      spese: [...primaDue],
    })
    expect(m.budgetEffectiveFrom).toBe(MERCOLEDI)
    expect(m.budgetCoveredPeriodStart).toBe(false)
    const start = budgetStart(m, [...primaDue])
    expect(start).toEqual({ late: true, beforeCents: 24_000 })
    const note = startNote(m, start)
    expect(note).toContain('mercoledì')
    expect(note).toContain('240,00')
    // E' un fatto, non un rimprovero.
    expect(note).not.toContain('!')
  })

  /**
   * Il caso gemello, che senza `budgetCoveredPeriodStart` era indistinguibile:
   * un budget c'era gia' lunedi' e mercoledi' l'utente lo ha solo **cambiato**.
   * Qui il residuo negativo e' un residuo negativo e non ha bisogno di scuse.
   */
  it('un budget cambiato a meta periodo non si giustifica', () => {
    const m = metrics({
      today: MERCOLEDI,
      budgetCents: 20_000,
      dal: MERCOLEDI,
      primaCera: 50_000,
      spese: [...primaDue],
    })
    expect(m.budgetEffectiveFrom).toBe(MERCOLEDI)
    expect(m.budgetCoveredPeriodStart).toBe(true)
    const start = budgetStart(m, [...primaDue])
    expect(start.late).toBe(false)
    expect(startNote(m, start)).toBeNull()
    expect(allowanceCopy(m, start).main).toBe('Il budget del periodo è finito.')
  })

  /**
   * Il difetto opposto a quello per cui ADR 010 ha introdotto la frase, visto
   * sul dispositivo: "Budget attivo da domenica" compariva anche quando tutte
   * le spese erano dentro la copertura del budget. Li' non c'e' nessun numero
   * strano da giustificare, e una spiegazione senza un fatto da spiegare si
   * legge come l'annuncio di un problema che non esiste.
   */
  it('senza spese anteriori al budget non compare affatto', () => {
    const m = metrics({ today: MERCOLEDI, budgetCents: 20_000, dal: MERCOLEDI })
    const start = budgetStart(m, [])
    // Il budget e' nato davvero a meta' periodo: il caso c'e'...
    expect(start.late).toBe(true)
    // ...ma non c'e' niente da spiegare, quindi non si dice niente.
    expect(start.beforeCents).toBe(0)
    expect(startNote(m, start)).toBeNull()
  })

  it('e nemmeno quando le spese del periodo sono tutte dopo effectiveFrom', () => {
    const spese = [spesa(MERCOLEDI, 5000)]
    const m = metrics({ today: MERCOLEDI, budgetCents: 20_000, dal: MERCOLEDI, spese })
    const start = budgetStart(m, spese)
    expect(start.beforeCents).toBe(0)
    expect(startNote(m, start)).toBeNull()
    // La riga utile resta quella, e non e' toccata da questa correzione.
    expect(allowanceCopy(m, start).main).toContain('Puoi spendere')
  })

  it('col residuo negativo per le sole spese di prima, dice il fatto e non la colpa', () => {
    // 200,00 di budget da mercoledi', 240,00 spesi lunedi' e martedi': il
    // residuo e' -40,00, ma da mercoledi' non e' ancora uscito niente.
    const m = metrics({
      today: MERCOLEDI,
      budgetCents: 20_000,
      dal: MERCOLEDI,
      spese: [...primaDue],
    })
    expect(m.remainingCents).toBe(-4000)
    const copy = allowanceCopy(m, budgetStart(m, [...primaDue]))
    expect(copy.main).toBe('Questa settimana era già iniziata.')
    expect(copy.sub).toContain('lunedì') // il periodo dopo comincia di lunedi'
    // Niente ambra: l'ambra dice "hai sforato", e qui nessuno ha sforato.
    expect(copy.over).toBe(false)
  })

  it('ma se il budget e finito anche dopo, la spiegazione non vale piu', () => {
    // Stesse 240,00 di prima piu' 300,00 da mercoledi' in poi: adesso il budget
    // sarebbe finito comunque, e "il periodo era gia' iniziato" sarebbe una
    // scusa invece di una spiegazione.
    const spese = [...primaDue, spesa(MERCOLEDI, 30_000)]
    const m = metrics({ today: MERCOLEDI, budgetCents: 20_000, dal: MERCOLEDI, spese })
    const copy = allowanceCopy(m, budgetStart(m, spese))
    expect(copy.main).toBe('Il budget del periodo è finito.')
    expect(copy.over).toBe(true)
  })

  it('sul mese la data e completa: in un mese ci sono quattro mercoledi', () => {
    const m = computeBudgetMetrics({
      expenses: [spesa('2026-08-05', 10_000)],
      budgets: [makeBudget({ period: 'monthly', amountCents: 80_000, effectiveFrom: MERCOLEDI })],
      period: 'monthly',
      onDate: MERCOLEDI,
      today: MERCOLEDI,
    })
    const note = startNote(m, budgetStart(m, [spesa('2026-08-05', 10_000)]))
    expect(note).toContain('19 agosto')
    expect(note).toContain('100,00')
  })
})
