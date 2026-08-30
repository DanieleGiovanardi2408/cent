import { describe, expect, it } from 'vitest'
import { computeBudgetMetrics } from '../core/budget'
import type { BudgetMetrics } from '../core/budget'
import { addDays } from '../core/date'
import { makeBudget, makeExpense } from '../core/testing'
import type { Budget, Expense } from '../core/types'
import { setLanguage } from './i18n'
import type { AllowanceCopy, Week } from './budget-view'
import {
  COLUMN_MIN_FRACTION,
  activePeriod,
  allowanceCopy,
  budgetStart,
  heroCopy,
  paceParts,
  startNote,
  weekStrip,
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

/** Una spesa generata da una regola: il budget non la conta (ADR 016). */
const fissa = (date: string, amountCents: number): Expense =>
  makeExpense({ date, amountCents, source: 'recurring' })

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

  it('dichiara le spese fisse che non conta: un esclusione taciuta e una bugia', () => {
    // ADR 016 §2. `remainingCents` esclude le ricorrenti, quindi il numero
    // grande e' giusto **solo se si sa cosa non c'e' dentro**.
    const hero = heroCopy(
      metrics({
        today: MERCOLEDI,
        budgetCents: 20_000,
        spese: [spesa(LUNEDI, 5000), fissa(LUNEDI, 90_000)],
      }),
    )
    // Il residuo non cambia: la fissa non entra nel calcolo.
    expect(hero.value).toContain('150,00')
    expect(hero.fixed).not.toBeNull()
    expect(hero.fixed).toContain('900,00')
  })

  it('senza fisse nel periodo la riga non compare affatto', () => {
    // E' il ramo che tiene onesto l'altro: annunciare un'esclusione dove non ha
    // tolto niente e' lo stesso difetto di `startNote` che spiegava un numero
    // normale.
    const hero = heroCopy(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 5000)] }),
    )
    expect(hero.fixed).toBeNull()
  })

  it('lo dice anche senza budget, dove il numero grande e lo speso', () => {
    // La decisione non nomina il ramo col budget: `spentCents` esclude le
    // ricorrenti in tutti e due, quindi la dichiarazione vale in tutti e due.
    const hero = heroCopy(metrics({ today: MERCOLEDI, spese: [spesa(LUNEDI, 5000), fissa(LUNEDI, 90_000)] }))
    expect(hero.label).toBe('Spesi')
    expect(hero.value).toContain('50,00')
    expect(hero.fixed).toContain('900,00')
  })

  it('una fissa cancellata non e piu un uscita, ne dentro ne fuori dal budget', () => {
    const cancellata = makeExpense({
      date: LUNEDI,
      amountCents: 90_000,
      source: 'recurring',
      deletedAt: '2026-08-19T10:00:00.000Z',
    })
    const hero = heroCopy(metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [cancellata] }))
    expect(hero.fixed).toBeNull()
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

/*
 * **Il blocco `la barra del periodo` non c'e' piu'.**
 *
 * Provava `spentRatio`, e le sue quattro asserzioni erano l'unica cosa che la
 * teneva viva: zero chiamanti di produzione da quando la barra della Home e'
 * stata tolta. Cancellarla e' il precedente di `expensesInRange` e
 * `planBudgetChange`, applicato una terza volta.
 *
 * Va scritto **qui** e non solo sulla funzione, perche' e' qui che si vede la
 * forma del difetto: quattro test verdi su una funzione che nessuno chiama non
 * segnalano niente, e anzi la fanno sembrare coperta. Il controllo che trova i
 * campi senza produttore non guarda le funzioni esportate — questa classe si
 * chiude a mano, ed e' la ragione per cui il precedente e' scritto in CLAUDE.md
 * invece che meccanizzato.
 */

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
    // **I giorni stanno nella stessa riga del numero**, e non in un
    // sottotitolo: la riga di dettaglio non c'e' piu' perche' riformulava, e
    // l'unico fatto che aggiungeva — quanti giorni copre quella media — e'
    // finito dentro la frase che lo reggeva gia'.
    expect(copy.text).toContain('30,00')
    expect(copy.text).toContain('5 giorni')
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
    expect(norm(copy.text)).toBe('Puoi spendere 200,00 € oggi, ultimo giorno del periodo')
    expect(copy.text).not.toContain('~')
    expect(copy.text).not.toContain('al giorno')
    // E il "1 giorni" non compare: con un giorno solo la frase non conta
    // giorni, dice qual e'.
    expect(copy.text).not.toContain('1 giorni')
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
    expect(norm(frase(m).text)).toBe('Puoi spendere 128,55 € oggi, ultimo giorno del periodo')
  })

  it('col residuo negativo non promette un tetto negativo: dice che il budget e finito', () => {
    const copy = frase(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 25_000)] }),
    )
    expect(copy.over).toBe(true)
    // **Non dice piu' "il budget e' finito": lo dicono il segno e il colore del
    // numero grande.** Al suo posto ci sono i due numeri che quella frase non
    // dava — il passo tenuto e quello sostenibile — piu' i giorni che restano.
    // Sono 250,00 spesi in tre giorni (lunedi'-mercoledi') = 83,33 al giorno,
    // contro 200,00 su sette = 28,57.
    expect(copy.text).toContain('5 giorni')
    expect(copy.text).toContain('83,33')
    expect(copy.text).toContain('28,57')
    // Niente numeri negativi spacciati per una disponibilita'.
    expect(copy.text).not.toContain('-')
    // E nessun rimprovero: il tono e' quello di un'informazione. Nemmeno il
    // verdetto a parole ("Sopra ritmo"), che diceva cio' che i due numeri
    // accostati dicono da soli.
    expect(copy.text).not.toContain('!')
    expect(copy.text).not.toContain('Sopra ritmo')
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
    // Nessuna promessa di `~0,00 € al giorno`: la riga passa al passo, che e'
    // l'unico numero ancora azionabile.
    expect(copy.text).not.toContain('Puoi spendere')
    expect(copy.over).toBe(true)
  })

  it('col residuo esatto a zero non dice che puoi spendere zero', () => {
    const copy = frase(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 20_000)] }),
    )
    expect(copy.text).not.toContain('Puoi spendere')
    expect(copy.over).toBe(true)
  })

  it('un centesimo al giorno e ancora una disponibilita, e si dice', () => {
    // Il confine dall'altra parte: 5 centesimi su 5 giorni fanno 1 al giorno.
    const copy = frase(
      metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 19_995)] }),
    )
    expect(copy.text).toContain('0,01')
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
    expect(copy.text).toBe('Questo periodo è chiuso: il prossimo riparte da capo.')
    expect(copy.text).not.toContain('—')
  })
})

describe('il passo tenuto finora, dove non c e un budget', () => {
  // Lo spazio fra numero e simbolo dell'euro e' **non separabile** (invariante
  // di `money.ts`, sorvegliato da `money.test.ts`): qui non e' il soggetto, e si
  // normalizza come fa il grosso della suite.
  const testo = (m: BudgetMetrics): string =>
    paceParts(m)
      .map((part) => part.text)
      .join('')
      .replace(/\s/g, ' ')

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

  /**
   * **Il verdetto non c'e' piu', e con lui il terzo numero al giorno.**
   *
   * Questi due test dicevano *"sotto ritmo lo dice"* e *"sopra ritmo lo dice con
   * le stesse parole"*, e sorvegliavano una frase che sulla Home compariva
   * **solo con un budget** — cioe' accanto alla disponibilita' al giorno. Erano
   * tre velocita' con la stessa unita' sulla stessa schermata: quanto puoi
   * spendere, quanto stai spendendo, quanto sarebbe sostenibile. Per sapere
   * quale fosse quale bisognava rileggere.
   *
   * Adesso il confronto vive in `allowanceCopy` e **solo dove la disponibilita'
   * non esiste**, cioe' sforati: due numeri invece di tre, e mai insieme al
   * terzo. Qui resta il passo di chi un budget non ce l'ha, che e' l'unico
   * stato in cui questa funzione arriva a schermo.
   */
  it('il passo non porta nessun verdetto: e una frase sola, coi suoi due pezzi muti', () => {
    const m = metrics({
      today: MERCOLEDI,
      budgetCents: 20_000,
      spese: [spesa(LUNEDI, 1000), spesa('2026-08-18', 1000)],
    })
    expect(testo(m)).toBe('Finora stai spendendo 6,66 € al giorno.')
    expect(testo(m)).not.toContain('ritmo')
    // Un numero solo in evidenza, non due: il termine di paragone non e' piu'
    // qui.
    expect(paceParts(m).filter((part) => part.strong === true)).toHaveLength(1)
  })

  it('e il sostenibile non compare piu qui nemmeno quando esiste', () => {
    // 150,00 in tre giorni = 50,00 al giorno contro 28,57 sostenibili: e' il
    // caso in cui la vecchia frase diceva "Sopra ritmo". Il numero 28,57 c'e'
    // nelle metriche e **non** finisce in questa riga.
    const sopra = metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 15_000)] })
    expect(sopra.sustainablePaceCents).toBe(2857)
    expect(testo(sopra)).toBe('Finora stai spendendo 50,00 € al giorno.')
    expect(testo(sopra)).not.toContain('28,57')
    expect(testo(sopra)).not.toContain('!')
    // La forma e' identica a quella di chi sta sotto: essere sopra il passo non
    // e' un errore da annunciare diversamente.
    const forma = (m: BudgetMetrics): string => testo(m).replace(/[\d.,]+/g, 'N')
    const sotto = metrics({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 1000)] })
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
    // La riga dello sforo, che adesso e' i due passi invece della frase.
    expect(allowanceCopy(m, start)).toMatchObject({ over: true })
    expect(allowanceCopy(m, start).text).not.toContain('Puoi spendere')
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
    expect(allowanceCopy(m, start).text).toContain('Puoi spendere')
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
    // **Una riga sola**: il fatto e la data da cui il budget vale pieno erano
    // due frasi, e la seconda non aggiungeva un fatto — completava il primo.
    expect(copy.text).toContain('Questa settimana era già iniziata')
    expect(copy.text).toContain('lunedì') // il periodo dopo comincia di lunedi'
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
    expect(copy.text).not.toContain('era già iniziata')
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

/* ------------------------------------------------------------------------- *
 * La striscia dei sette giorni.
 *
 * Quello che puo' sbagliare qui non sono le parole: e' **l'aritmetica di una
 * geometria**, cioe' esattamente cio' che si prova senza un browser. I casi che
 * a mano non si toccano mai sono quattro — il confine della domenica, la
 * settimana del cambio d'ora, la settimana con solo importi a zero, e la spesa
 * datata in avanti che solo un import puo' scrivere.
 * ------------------------------------------------------------------------- */

const MARTEDI = '2026-08-18'
const GIOVEDI = '2026-08-20'
const VENERDI = '2026-08-21'
const SABATO = '2026-08-22'

/** `1/24`. Scritto qui in forma diversa: se la costante cambia, questa cade. */
const PAVIMENTO = COLUMN_MIN_FRACTION

/** L'altezza dipinta di una quota, riscritta a mano: la mappa, non la funzione. */
const alto = (quota: number): number => PAVIMENTO + (1 - PAVIMENTO) * quota

function striscia(options: {
  readonly today: string
  readonly budgetCents?: number
  readonly spese?: readonly Expense[]
}): Week | null {
  const spese = options.spese ?? []
  return weekStrip(metrics({ ...options, spese }), spese, options.today)
}

describe('la striscia dei sette giorni', () => {
  it('sono sempre sette, da lunedi a domenica', () => {
    const week = striscia({ today: MERCOLEDI, spese: [spesa(MERCOLEDI, 1000)] })
    expect(week?.days.map((d) => d.date)).toEqual([
      '2026-08-17',
      '2026-08-18',
      '2026-08-19',
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ])
  })

  /**
   * Il confine che si sbaglia sempre: con la settimana che comincia di lunedi',
   * **domenica e' l'ultima colonna**, non la prima della settimana dopo. Con
   * `startOfWeek` di una libreria tarata sulla domenica questa cade.
   */
  it('la domenica e l ultima colonna, non la prima della settimana dopo', () => {
    const week = striscia({ today: DOMENICA, spese: [spesa(DOMENICA, 1000)] })
    expect(week?.days[0]?.date).toBe(LUNEDI)
    expect(week?.days[6]?.date).toBe(DOMENICA)
    expect(week?.days[6]?.cents).toBe(1000)
    expect(week?.days[6]?.current).toBe(true)
  })

  it('e il lunedi e la prima, con sei giorni ancora davanti', () => {
    const week = striscia({ today: LUNEDI, spese: [spesa(LUNEDI, 1000)] })
    expect(week?.days[0]?.current).toBe(true)
    expect(week?.days.filter((d) => d.future)).toHaveLength(6)
  })

  /**
   * La settimana in cui in Europa finisce l'ora legale (domenica 25 ottobre
   * 2026). Sette date civili, nessuna saltata e nessuna doppia: e' il caso che
   * un'aritmetica su `Date` in millisecondi sbaglia di un giorno.
   */
  it('la settimana del cambio d ora ha sette giorni come tutte le altre', () => {
    const domenicaDelCambio = '2026-10-25'
    const week = striscia({
      today: domenicaDelCambio,
      spese: [spesa('2026-10-19', 500), spesa(domenicaDelCambio, 700)],
    })
    expect(week?.days.map((d) => d.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ])
    expect(week?.days[0]?.cents).toBe(500)
    expect(week?.days[6]?.cents).toBe(700)
  })

  it('le spese fuori dalla settimana non entrano in nessuna colonna', () => {
    const week = striscia({
      today: MERCOLEDI,
      spese: [
        spesa('2026-08-16', 50_000), // la domenica prima
        spesa('2026-08-24', 50_000), // il lunedi dopo
        spesa(MERCOLEDI, 1000),
      ],
    })
    expect(week?.days.map((d) => d.cents)).toEqual([0, 0, 1000, 0, 0, 0, 0])
  })

  /* --- decisione 2: quali spese conta ------------------------------------ */

  it('le ricorrenti restano fuori, come nel numero grande', () => {
    // L'affitto e' la spesa piu' grande della settimana e non e' una decisione:
    // una colonna che lo comprendesse andrebbe letta contro una linea che non
    // lo comprende (ADR 016).
    const week = striscia({
      today: MERCOLEDI,
      spese: [fissa(LUNEDI, 90_000), spesa(MARTEDI, 1000)],
    })
    expect(week?.days[0]?.cents).toBe(0)
    expect(week?.days[1]?.cents).toBe(1000)
    expect(week?.peak).toBe(MARTEDI)
  })

  it('una settimana di sole ricorrenti non ha striscia', () => {
    expect(striscia({ today: MERCOLEDI, spese: [fissa(LUNEDI, 90_000)] })).toBeNull()
  })

  it('le cancellate non sono un uscita, ne dentro ne fuori dal budget', () => {
    const morta = makeExpense({ date: LUNEDI, amountCents: 5000, deletedAt: '2026-08-17T10:00:00.000Z' })
    expect(striscia({ today: MERCOLEDI, spese: [morta] })).toBeNull()
  })

  /**
   * L'invariante che tiene la striscia e il numero grande sulla stessa moneta:
   * su un periodo settimanale le sette colonne **sommano a `spentCents`**. Se
   * un giorno qualcuno cambiasse il filtro di una delle due, questa cade.
   */
  it('su una settimana le sette colonne sommano allo speso del periodo', () => {
    const spese = [
      spesa(LUNEDI, 1234),
      spesa(MARTEDI, 5678),
      spesa(MERCOLEDI, 99),
      fissa(GIOVEDI, 90_000),
      makeExpense({ date: VENERDI, amountCents: 4000, deletedAt: '2026-08-21T10:00:00.000Z' }),
      spesa(DOMENICA, 4321),
    ]
    const m = metrics({ today: MERCOLEDI, budgetCents: 20_000, spese })
    const week = weekStrip(m, spese, MERCOLEDI)
    const somma = week?.days.reduce((total, d) => total + d.cents, 0)
    expect(somma).toBe(m.spentCents)
    expect(somma).toBe(1234 + 5678 + 99 + 4321)
  })

  /* --- decisione 1: la scala --------------------------------------------- */

  it('senza budget la scala e il giorno piu alto, e quella colonna e piena', () => {
    const week = striscia({ today: MERCOLEDI, spese: [spesa(LUNEDI, 1000), spesa(MARTEDI, 4000)] })
    expect(week?.sustainable).toBeNull()
    expect(week?.scaleCents).toBe(4000)
    expect(week?.days[1]?.fraction).toBe(1)
  })

  /**
   * La settimana in cui si e' speso pochissimo: la scala e' **il sostenibile**,
   * non il giorno piu' alto. La linea sta in cima e le colonne sono basse — che
   * e' cio' che e' successo davvero, non un disegno rotto: scalare sul giorno
   * piu' alto avrebbe messo la linea fuori dalla striscia, cioe' avrebbe tolto
   * l'unica cosa contro cui quelle colonne si leggono.
   */
  it('sotto il sostenibile la scala e il sostenibile, e la linea sta in cima', () => {
    const week = striscia({
      today: MERCOLEDI,
      budgetCents: 20_000, // 2857 al giorno
      spese: [spesa(LUNEDI, 200), spesa(MARTEDI, 300)],
    })
    expect(week?.scaleCents).toBe(2857)
    expect(week?.sustainable?.cents).toBe(2857)
    expect(week?.sustainable?.fraction).toBe(1)
    expect(week?.days[1]?.fraction).toBeCloseTo(alto(300 / 2857), 12)
    // Nessuna colonna arriva in cima: e' il fatto, e si vede.
    expect(week?.days.every((d) => d.fraction < 1)).toBe(true)
  })

  /**
   * Il caso opposto: un giorno vale dieci volte il sostenibile. La linea cade a
   * un decimo dell'altezza e **si vede ancora**, perche' passa dal pavimento
   * come le colonne.
   */
  it('con un giorno dieci volte il sostenibile la linea resta sopra il pavimento', () => {
    const week = striscia({
      today: DOMENICA,
      budgetCents: 20_000, // 2857 al giorno
      spese: [spesa(SABATO, 28_570), spesa(LUNEDI, 2857)],
    })
    expect(week?.scaleCents).toBe(28_570)
    expect(week?.sustainable?.fraction).toBeCloseTo(alto(0.1), 12)
    expect(week?.sustainable?.fraction).toBeGreaterThan(PAVIMENTO)
    expect(week?.days[5]?.fraction).toBe(1)
  })

  /**
   * Il difetto che la mappa condivisa impedisce: se la linea non passasse dal
   * pavimento, il giorno in cui si e' speso **esattamente** il sostenibile
   * disegnerebbe una colonna piu' alta della linea — cioe' "sei sopra" stando
   * sopra il pari. E' lo stesso difetto che `stats-view.ts` chiude fra la barra
   * e la sua traccia.
   */
  it('il giorno esattamente sul sostenibile disegna alla stessa altezza della linea', () => {
    const week = striscia({
      today: DOMENICA,
      budgetCents: 20_000, // 2857 al giorno
      spese: [spesa(MARTEDI, 2857), spesa(SABATO, 5000)],
    })
    expect(week?.scaleCents).toBe(5000)
    expect(week?.days[1]?.fraction).toBe(week?.sustainable?.fraction)
    // E un centesimo sopra il sostenibile sta sopra la linea, non a pari.
    const sopra = striscia({
      today: DOMENICA,
      budgetCents: 20_000,
      spese: [spesa(MARTEDI, 2858), spesa(SABATO, 5000)],
    })
    expect(sopra?.days[1]?.fraction).toBeGreaterThan(sopra?.sustainable?.fraction ?? 1)
  })

  /* --- decisione 4: il pavimento ----------------------------------------- */

  it('il pavimento vale due pixel sulla striscia piu bassa ammessa', () => {
    // `2 / 48`: due pixel di inchiostro su una striscia di 3rem. Il legame col
    // CSS e' un contratto scritto, non ancora una misura: se `--strip-h` scende
    // sotto 3rem, questa riga resta verde e le colonne piu' corte spariscono.
    expect(PAVIMENTO * 48).toBeCloseTo(2, 12)
  })

  it('un centesimo contro novecento euro resta un centesimo, e si vede', () => {
    const week = striscia({
      today: DOMENICA,
      spese: [spesa(LUNEDI, 1), spesa(SABATO, 90_000)],
    })
    expect(week?.days[0]?.fraction).toBeGreaterThanOrEqual(PAVIMENTO)
    expect(week?.days[0]?.fraction).toBeCloseTo(alto(1 / 90_000), 12)
  })

  it('un giorno senza spese non prende inchiostro: zero resta zero', () => {
    const week = striscia({ today: DOMENICA, spese: [spesa(LUNEDI, 90_000)] })
    expect(week?.days[1]?.fraction).toBe(0)
    expect(week?.days[1]?.fraction).toBeLessThan(PAVIMENTO)
  })

  it('due giorni che differiscono di un centesimo non disegnano uguale', () => {
    const week = striscia({
      today: DOMENICA,
      spese: [spesa(LUNEDI, 1), spesa(MARTEDI, 2), spesa(SABATO, 90_000)],
    })
    const uno = week?.days[0]?.fraction ?? 0
    const due = week?.days[1]?.fraction ?? 0
    expect(due).toBeGreaterThan(uno)
    // La differenza e' esatta: la traslazione e' la stessa per tutte, la scala
    // e' quella della striscia.
    expect(due - uno).toBeCloseTo((1 - PAVIMENTO) * (1 / 90_000), 15)
  })

  it('la colonna piu alta arriva esattamente in cima, non a 0,999', () => {
    const week = striscia({ today: DOMENICA, spese: [spesa(LUNEDI, 3), spesa(SABATO, 7)] })
    expect(week?.days[5]?.fraction).toBe(1)
  })

  /**
   * Un budget da 0,05 € a settimana: `divideCents` arrotonda verso il basso e il
   * passo sostenibile e' **zero**. La linea c'e' — un budget c'e' — e si posa
   * sulla base, perche' zero resta zero anche per lei. E' vero, non e' un guasto.
   */
  it('un sostenibile a zero mette la linea sulla base, non al pavimento', () => {
    const week = striscia({ today: MERCOLEDI, budgetCents: 5, spese: [spesa(LUNEDI, 1000)] })
    expect(week?.sustainable?.cents).toBe(0)
    expect(week?.sustainable?.fraction).toBe(0)
    expect(week?.scaleCents).toBe(1000)
  })

  /**
   * La linea si disegna anche su un budget nato a meta' settimana, e **non** e'
   * una dimenticanza: B delle Statistiche nasconde la traccia se un solo record
   * non ha coperto il periodo intero, ma li' la traccia confronta un **totale**
   * con un tetto di periodo. Qui ogni colonna e' un giorno e la linea e' un passo
   * al giorno: non c'e' niente che si accumuli.
   */
  it('la linea c e anche col budget nato a meta settimana', () => {
    const spese = [spesa(LUNEDI, 4000), spesa(MERCOLEDI, 1000)]
    const m = metrics({ today: MERCOLEDI, budgetCents: 20_000, dal: MERCOLEDI, spese })
    expect(m.comparableToBudget).toBe(false)
    expect(weekStrip(m, spese, MERCOLEDI)?.sustainable?.cents).toBe(2857)
  })

  /* --- decisione 3: quando non c e' striscia ----------------------------- */

  it('senza nessuna spesa non c e striscia', () => {
    expect(striscia({ today: MERCOLEDI })).toBeNull()
    expect(striscia({ today: MERCOLEDI, budgetCents: 20_000 })).toBeNull()
  })

  /**
   * Il criterio e' **zero centesimi da disegnare**, non zero spese. Una spesa
   * da 0,00 € esiste — la scrive un import — e `columnHeight(0)` vale zero,
   * quindi contarla come "attivita'" produrrebbe sette colonne vuote sotto una
   * linea: il telaio di un grafico senza dati.
   */
  it('una settimana di soli importi a zero non fa sette colonne vuote', () => {
    const week = striscia({
      today: MERCOLEDI,
      budgetCents: 20_000,
      spese: [spesa(LUNEDI, 0), spesa(MARTEDI, 0), spesa(MERCOLEDI, 0)],
    })
    expect(week).toBeNull()
  })

  it('ma un solo centesimo basta: la striscia c e', () => {
    const week = striscia({ today: MERCOLEDI, budgetCents: 20_000, spese: [spesa(LUNEDI, 1)] })
    expect(week).not.toBeNull()
    expect(week?.peak).toBe(LUNEDI)
    expect(week?.days[0]?.fraction).toBeGreaterThanOrEqual(PAVIMENTO)
  })

  /* --- il giorno da etichettare ------------------------------------------ */

  it('il picco e il giorno piu alto', () => {
    const week = striscia({
      today: DOMENICA,
      spese: [spesa(LUNEDI, 1000), spesa(GIOVEDI, 9000), spesa(SABATO, 2000)],
    })
    expect(week?.peak).toBe(GIOVEDI)
  })

  it('a parita vince il giorno prima: la domanda e quando parte la mano', () => {
    const week = striscia({
      today: DOMENICA,
      spese: [spesa(MARTEDI, 5000), spesa(VENERDI, 5000)],
    })
    expect(week?.peak).toBe(MARTEDI)
  })

  it('il picco somma le spese del giorno, non guarda la piu grande', () => {
    const week = striscia({
      today: DOMENICA,
      spese: [
        spesa(LUNEDI, 4000),
        spesa(MARTEDI, 2000),
        spesa(MARTEDI, 2000),
        spesa(MARTEDI, 1000),
      ],
    })
    expect(week?.peak).toBe(MARTEDI)
    expect(week?.days[1]?.cents).toBe(5000)
  })

  /* --- decisione 5: oggi e i giorni che non sono arrivati ---------------- */

  it('oggi e uno solo, e i giorni dopo sono futuri', () => {
    const week = striscia({ today: MERCOLEDI, spese: [spesa(LUNEDI, 1000)] })
    expect(week?.days.map((d) => d.current)).toEqual([false, false, true, false, false, false, false])
    expect(week?.days.map((d) => d.future)).toEqual([false, false, false, true, true, true, true])
  })

  /**
   * Un giorno futuro vale zero perche' e' **vuoto**, non perche' e' futuro: la
   * distinzione la porta `future`, e la porta perche' a schermo sono due cose
   * diverse — una colonna a pavimento e una colonna che non c'e'.
   *
   * Le spese datate in avanti esistono: non le scrive nessuna schermata
   * (`AddSheet` ha `max={day}`), le scrivono `parseBackup` e l'orologio del
   * telefono che torna indietro. Contarle non e' un capriccio: `spentCents` le
   * conta gia', quindi zerarle qui farebbe sette colonne che non sommano al
   * numero grande scritto sopra.
   */
  it('una spesa datata in avanti riempie la sua colonna e resta futura', () => {
    const spese = [spesa(LUNEDI, 1000), spesa(VENERDI, 3000)]
    const m = metrics({ today: MERCOLEDI, budgetCents: 20_000, spese })
    const week = weekStrip(m, spese, MERCOLEDI)
    expect(week?.days[4]?.cents).toBe(3000)
    expect(week?.days[4]?.future).toBe(true)
    expect(week?.peak).toBe(VENERDI)
    expect(week?.days.reduce((total, d) => total + d.cents, 0)).toBe(m.spentCents)
  })

  /* --- col budget mensile ------------------------------------------------ */

  /**
   * Con un budget mensile il periodo e' il mese, e sette colonne di un mese non
   * sono niente: la striscia resta **la settimana di oggi**. La linea regge
   * perche' `sustainablePaceCents` e' al giorno in tutti e due i periodi.
   */
  it('col budget mensile la striscia e ancora la settimana, e la linea e al giorno', () => {
    const spese = [spesa(LUNEDI, 1000), spesa(MERCOLEDI, 2000)]
    const m = computeBudgetMetrics({
      expenses: spese,
      budgets: [makeBudget({ period: 'monthly', amountCents: 80_000, effectiveFrom: '2026-01-01' })],
      period: 'monthly',
      onDate: MERCOLEDI,
      today: MERCOLEDI,
    })
    const week = weekStrip(m, spese, MERCOLEDI)
    expect(week?.days[0]?.date).toBe(LUNEDI)
    expect(week?.days[6]?.date).toBe(DOMENICA)
    // 80.000 / 31 giorni di agosto = 2580, arrotondato verso il basso.
    expect(week?.sustainable?.cents).toBe(2580)
    expect(week?.scaleCents).toBe(2580)
  })

  /**
   * La settimana a cavallo di due mesi: le colonne sono sette lo stesso, e i
   * giorni del mese prima ci sono. E' il limite dichiarato — la linea e' quella
   * del budget di **oggi**, non quella che valeva a luglio — e il test lo fissa
   * invece di lasciarlo alla prossima lettura.
   */
  it('a cavallo di due mesi le colonne restano sette, con i giorni del mese prima', () => {
    // Lunedi 27 luglio 2026 - domenica 2 agosto 2026.
    const spese = [spesa('2026-07-28', 4000), spesa('2026-08-01', 1000)]
    const m = computeBudgetMetrics({
      expenses: spese,
      budgets: [makeBudget({ period: 'monthly', amountCents: 80_000, effectiveFrom: '2026-01-01' })],
      period: 'monthly',
      onDate: '2026-08-01',
      today: '2026-08-01',
    })
    const week = weekStrip(m, spese, '2026-08-01')
    expect(week?.days[0]?.date).toBe('2026-07-27')
    expect(week?.days[1]?.cents).toBe(4000)
    expect(week?.days[5]?.cents).toBe(1000)
    // Lo speso del **mese** conta solo l'1 agosto: la striscia guarda altrove,
    // e le due somme non devono coincidere fuori dal periodo settimanale.
    expect(m.spentCents).toBe(1000)
  })
})
