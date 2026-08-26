import { describe, expect, it } from 'vitest'
import { makeBudget, makeCategory, makeExpense, makeRule } from '../core/testing'
import { sumCents } from '../core/money'
import type { Cents } from '../core/money'
import type { Budget, Category, Expense, RecurringRule } from '../core/types'
import {
  BAR_MIN_FRACTION,
  BREAKDOWN_MIN_ROWS,
  TREND_MIN_ROWS,
  TREND_PERIODS,
  statsView,
  trendRanges,
} from './stats-view'
import type { BreakdownKind, BreakdownSection, CategorySlice, StatsInput } from './stats-view'

/*
 * ## Come si testa un grafico, in questo progetto
 *
 * **Si asserisce la geometria contro i dati, non la presenza degli elementi.**
 * Un test che conta i `<rect>` e' verde anche se le barre sono tutte alte
 * uguali. Qui il rapporto fra le lunghezze deve essere quello fra i valori, e
 * ogni caso ha almeno un'asserzione che **cadrebbe** se il modulo calcolasse il
 * caso sbagliato.
 *
 * ### "Il rapporto fra le lunghezze" e' cambiato di forma, non di sostanza
 *
 * Da quando esiste `BAR_MIN_FRACTION`, ogni lunghezza porta una traslazione
 * costante: il **rapporto** fra due barre non e' piu' il rapporto fra due
 * importi, la **differenza** si'. Le asserzioni qui sotto sono scritte sulla
 * differenza, che e' la cosa rimasta esatta, piu' l'invariante che chiude la
 * scala in alto (la piu' grande vale 1).
 *
 * ## E i dati sono ostili almeno una volta
 *
 * La prima consegna aveva dieci mutazioni provate a mano, tutte prese, e il
 * difetto grave stava dove non erano state guardate: **le mutazioni scelte da
 * chi conosce le risposte misurano la propria immaginazione**. Quindi almeno un
 * caso non e' fatto di 40,00 / 20,00 / 10,00 ma di nomi da trenta caratteri,
 * un centesimo contro novecento euro, una categoria di soli fissi, una che sta
 * in tutte e due le sezioni, una a zero e **due** righe orfane (vedi
 * `describe('dati ostili')`).
 */

const CIBO: Category = makeCategory({ id: 'c-cibo', name: 'Fuori', color: '#f26b00' })
const SPESA: Category = makeCategory({ id: 'c-spesa', name: 'Spesa', color: '#81a369' })
const CASA: Category = makeCategory({ id: 'c-casa', name: 'Casa', color: '#bc85ec' })
const CATS = [CIBO, SPESA, CASA]

/** Mercoledi 26 agosto 2026. La settimana e' 24-30. */
const OGGI = '2026-08-26'

/*
 * Le due larghezze di `.stat__plot`, in px. Non sono ipotesi: sono misure, e
 * servono solo dove un test parla di **pixel** — cioe' dove una garanzia o un
 * limite del pavimento vanno provati invece che creduti.
 */

/**
 * La piu' stretta possibile: `--plot-min: 7rem` (Stats.css). E' la colonna su
 * cui il pavimento e' **esatto**, ed e' anche l'ordine di grandezza su cui e'
 * stato misurato il difetto che l'ha prodotto (a 320 punti, 9,00 € su una scala
 * da 507,00 € cadevano a 1,99 px e si dipingevano 2).
 */
const COLONNA_MIN_PX = 112

/**
 * La larghezza naturale a 390 punti, misurata. Qui il pavimento **sovrastima**:
 * la barra minima si dipinge 3,44 px invece di 2. La garanzia e' `>= 2 px`, non
 * `= 2 px`, e i test che parlano del limite usano questa perche' e' la colonna su
 * cui l'utente guarda davvero.
 */
const COLONNA_PX = 192.73

function view(over: Partial<StatsInput>) {
  return statsView({
    expenses: [],
    categories: CATS,
    rules: [] as readonly RecurringRule[],
    budgets: [] as readonly Budget[],
    period: 'weekly',
    day: OGGI,
    ...over,
  })
}

function ready(over: Partial<StatsInput>) {
  const v = view(over)
  if (v.kind !== 'ready') throw new Error('atteso ready')
  return v
}

type Ready = ReturnType<typeof ready>

function sezione(v: Ready, kind: BreakdownKind): BreakdownSection | undefined {
  return v.byCategory.sections.find((s) => s.kind === kind)
}

/**
 * Il totale **dichiarato** di una sezione, o `undefined` dove la sezione ha una
 * riga sola e quindi non ne ha uno.
 *
 * Non e' una comodita' per accorciare i test: e' l'unico modo in cui un test
 * puo' nominare quella cifra, perche' sul ramo a una riga il campo **non
 * esiste** e la lettura diretta del campo non compila piu'. E' esattamente cio'
 * che si voleva ottenere — disegnare un totale che non serve e' un errore di
 * compilazione, non una svista che si scopre misurando lo schermo.
 */
function totale(s: BreakdownSection | undefined): Cents | undefined {
  return s === undefined || s.single ? undefined : s.totalCents
}

/**
 * La riga di una sezione che ne ha **una sola**, e fallisce se la sezione non e'
 * quella: dove il totale non c'e', la cifra a schermo e' questa, e un test che
 * la leggesse con un `?.` sarebbe verde anche sulla sezione sbagliata.
 */
function unica(s: BreakdownSection | undefined): CategorySlice {
  if (s === undefined || !s.single) throw new Error('attesa una sezione con una riga sola')
  return s.rows[0]
}

/**
 * **Gli invarianti di A**, e si asseriscono invece di sperarci. Sono tre, e
 * ognuno e' una promessa che il componente usa senza poterla verificare:
 *
 * 1. **le righe spiegano il totale della propria sezione**, e i due totali
 *    vengono dalle metriche — non da una seconda somma che un giorno divergera'.
 *    Sono le due identita' `somma(Fisse) === recurringSpentCents` e
 *    `somma(Variabili) === spentCents`. Il totale **dichiarato** c'e' se e solo
 *    se le righe sono piu' di una: con una sola sarebbe la cifra della riga,
 *    scritta una seconda volta sullo stesso bordo destro;
 * 2. **in ogni sezione la barra piu' lunga arriva a fondo colonna** (frazione
 *    esattamente 1). E' l'unica cosa che dichiara all'occhio che le scale sono
 *    due: due barre piene con due importi diversi non si possono leggere come
 *    una scala sola;
 * 3. **nessuna lunghezza sta fra zero e il pavimento.** E' la promessa che
 *    toglie al CSS ogni ragione di correggere una larghezza.
 *
 * Si chiamano su **tutte** le fixture, orfane e dati ostili compresi: un
 * invariante provato sul caso comodo e' un commento.
 */
function invariantiDiA(v: Ready) {
  const fisse = sezione(v, 'fixed')
  const variabili = sezione(v, 'variable')

  expect(sumCents((fisse?.rows ?? []).map((r) => r.cents))).toBe(v.current.recurringSpentCents)
  expect(sumCents((variabili?.rows ?? []).map((r) => r.cents))).toBe(v.current.spentCents)
  if (fisse !== undefined && !fisse.single) {
    expect(fisse.totalCents).toBe(v.current.recurringSpentCents)
  }
  if (variabili !== undefined && !variabili.single) {
    expect(variabili.totalCents).toBe(v.current.spentCents)
  }

  for (const s of v.byCategory.sections) {
    // Una sezione senza righe non e' una sezione: non c'e'.
    expect(s.rows.length).toBeGreaterThan(0)
    // Il totale c'e' **se e solo se** le righe sono piu' di una, e dove non c'e'
    // la cifra e' gia' a schermo: e' la riga. Se `single` potesse essere in
    // disaccordo con le righe, il componente disegnerebbe un totale sopra un
    // elenco che non lo spiega — o lo toglierebbe dove serve.
    expect(s.single).toBe(s.rows.length === 1)
    expect(totale(s)).toBe(s.single ? undefined : sumCents(s.rows.map((r) => r.cents)))
    const importi = s.rows.map((r) => r.cents)
    // Dalla piu' grande, sempre: la prima riga e' anche quella che porta la scala.
    expect(importi).toEqual([...importi].sort((a, b) => b - a))
    const massima = Math.max(...s.rows.map((r) => r.fraction))
    expect(massima).toBe(Math.max(...importi) > 0 ? 1 : 0)
    for (const r of s.rows) {
      if (r.cents > 0) expect(r.fraction).toBeGreaterThanOrEqual(BAR_MIN_FRACTION)
      else expect(r.fraction).toBe(0)
    }
  }
}

describe('lo stato vuoto', () => {
  it('senza nessuna spesa la schermata e vuota, non un grafico da zero', () => {
    expect(view({}).kind).toBe('blank')
  })

  it('una spesa cancellata non fa uscire dal vuoto', () => {
    const v = view({
      expenses: [makeExpense({ date: OGGI, categoryId: 'c-cibo', deletedAt: '2026-08-26T10:00:00Z' })],
    })
    // Se le lapidi contassero, questo sarebbe 'ready' con una riga da 10,00
    // che nello Storico non si vede.
    expect(v.kind).toBe('blank')
  })

  it('con spese solo nei periodi passati A non ha sezioni, e non due sezioni vuote', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: '2026-08-12', categoryId: 'c-cibo', amountCents: 5000 }),
        makeExpense({ date: '2026-08-19', categoryId: 'c-spesa', amountCents: 2500 }),
      ],
    })
    // Questa settimana non e' ancora uscito niente, quindi A non ha niente da
    // ripartire. Un titolo sopra il nulla, due volte, sarebbe peggio di prima:
    // la sezione vuota non esiste, non e' una sezione con zero righe.
    expect(v.byCategory.sections).toHaveLength(0)
    // **E la schermata non e' vuota**: B ha tre righe e l'ultima vale zero, che
    // e' un'informazione vera. E' la differenza fra "niente in questo periodo" e
    // "niente in cio' che questa schermata guarda" — il secondo e' `outside`,
    // qui sotto, e prima di distinguerli restava a schermo la sola scheda in
    // testa sopra 400 px di niente.
    expect(v.byPeriod.rows.map((r) => r.range.start)).toEqual([
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
    ])
    expect(v.byPeriod.rows[2]?.cents).toBe(0)
    invariantiDiA(v)
  })

  it('con tutte le spese fuori da cio che la schermata guarda non resta una scheda sola', () => {
    const v = view({
      // L'unica spesa viva e' datata **oltre** la fine del periodo corrente.
      // Non la scrive nessuna schermata: gli scrittori sono `parseBackup` e
      // l'orologio del dispositivo che torna indietro (vedi `StatsView`).
      expenses: [makeExpense({ date: '2026-09-20', categoryId: 'c-cibo', amountCents: 5000 })],
    })
    // Non e' `blank` — una spesa viva c'e' — e non e' `ready`: senza questo
    // stato la schermata restava `Quotidiane · 0,00 € · 24–30 ago` e basta, una
    // scheda in mezzo al vuoto senza una parola che dicesse perche'.
    expect(v.kind).toBe('outside')
  })
})

describe('A — due sezioni, due scale', () => {
  /* Fisse: 507,00 di Casa + 23,00 di Trasporti. Variabili: 42,00 + 26,00 +
   * 10,00 di Trasporti. Sono i numeri del disegno, non inventati qui. */
  const spese: readonly Expense[] = [
    makeExpense({ date: '2026-08-24', categoryId: 'c-casa', amountCents: 50700, source: 'recurring' }),
    makeExpense({ date: '2026-08-24', categoryId: 'c-cibo', amountCents: 2300, source: 'recurring' }),
    makeExpense({ date: '2026-08-25', categoryId: 'c-spesa', amountCents: 4200 }),
    makeExpense({ date: '2026-08-25', categoryId: 'c-casa', amountCents: 2600 }),
    makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 1000 }),
  ]

  it('le due sezioni contano cose diverse, e ognuna dichiara il proprio totale', () => {
    const v = ready({ expenses: spese })
    expect(v.byCategory.sections.map((s) => s.kind)).toEqual(['fixed', 'variable'])
    expect(totale(sezione(v, 'fixed'))).toBe(53000)
    expect(totale(sezione(v, 'variable'))).toBe(7800)
    // I due totali sono **entrambi del periodo**, quindi confrontabili fra loro:
    // e' la cosa che le due cifre in testa non possono dire, perche' una e' al
    // mese. Con una sezione sola non sarebbe scritta da nessuna parte.
    expect(totale(sezione(v, 'fixed'))! + totale(sezione(v, 'variable'))!).toBe(60800)
    invariantiDiA(v)
  })

  it('la scala e per sezione: la piu grande di ognuna arriva a fondo colonna', () => {
    const v = ready({ expenses: spese })
    const fisse = sezione(v, 'fixed')!
    const variabili = sezione(v, 'variable')!
    // 507,00 e 42,00 sono due importi diversi disegnati entrambi pieni: e'
    // **cosi'** che la geometria dichiara che le scale sono due. Con una scala
    // sola la riga da 42,00 varrebbe 0,083 e le sei righe sotto starebbero
    // dentro dieci pixel — la misura che ha prodotto questa divisione.
    expect(fisse.rows[0]?.cents).toBe(50700)
    expect(fisse.rows[0]?.fraction).toBe(1)
    expect(variabili.rows[0]?.cents).toBe(4200)
    expect(variabili.rows[0]?.fraction).toBe(1)
    // E le righe variabili tornano confrontabili fra loro: 26,00 contro 42,00 e'
    // piu' di meta' colonna, non il 5%.
    const casaAMano = variabili.rows.find((r) => r.name === 'Casa')
    expect(casaAMano?.cents).toBe(2600)
    expect(casaAMano?.fraction).toBeGreaterThan(0.6)
  })

  it('una categoria puo stare in tutte e due, e le due righe non si sommano', () => {
    const v = ready({ expenses: spese })
    const fissa = sezione(v, 'fixed')?.rows.find((r) => r.categoryId === 'c-cibo')
    const variabile = sezione(v, 'variable')?.rows.find((r) => r.categoryId === 'c-cibo')
    // 23,00 di abbonamento e 10,00 a mano: due righe, e la divisione e'
    // informativa — dice quanto di quella spesa e' deciso e quanto e'
    // occasionale. Sommandole si otterrebbe 33,00 in una riga sola, che e'
    // esattamente il fatto che si voleva mostrare, cancellato.
    expect(fissa?.cents).toBe(2300)
    expect(variabile?.cents).toBe(1000)
    // E la conseguenza dichiarata delle due scale: **la riga piu' corta e'
    // disegnata piu' lunga**. 10,00 su 42,00 batte 23,00 su 507,00, e non e' un
    // difetto: sono due colonne con due scale, e la geometria lo dice perche' in
    // cima a ognuna c'e' una barra piena.
    expect(variabile!.cents).toBeLessThan(fissa!.cents)
    expect(variabile!.fraction).toBeGreaterThan(fissa!.fraction)
  })

  it('senza fisse resta una sezione sola, e non una vuota', () => {
    const v = ready({ expenses: spese.filter((e) => e.source !== 'recurring') })
    expect(v.byCategory.sections.map((s) => s.kind)).toEqual(['variable'])
    expect(v.current.recurringSpentCents).toBe(0)
    invariantiDiA(v)
  })

  it('senza variabili resta la sezione delle fisse', () => {
    const v = ready({ expenses: spese.filter((e) => e.source === 'recurring') })
    // La settimana in cui e' uscito solo l'affitto: A non e' vuota, e sotto un
    // titolo che chiede dove sono finiti i soldi c'e' la risposta vera.
    expect(v.byCategory.sections.map((s) => s.kind)).toEqual(['fixed'])
    expect(totale(sezione(v, 'fixed'))).toBe(53000)
    invariantiDiA(v)
  })

  it('l ordine delle sezioni non dipende dagli importi', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 500, source: 'recurring' }),
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 40000 }),
      ],
    })
    // Le fisse valgono 5,00 e le variabili 400,00, e le fisse restano prima:
    // e' una distinzione di natura, non una classifica. Una schermata che
    // riordina le proprie sezioni col mese fa cercare due volte la stessa riga.
    expect(v.byCategory.sections.map((s) => s.kind)).toEqual(['fixed', 'variable'])
  })

  it('il colore della riga e quello che l utente ha scelto per il chip', () => {
    const v = ready({ expenses: spese })
    expect(sezione(v, 'variable')?.rows.find((r) => r.name === 'Spesa')?.color).toBe(SPESA.color)
  })

  it('una categoria senza spese non e una riga da zero: non c e', () => {
    const v = ready({ expenses: [spese[2]!] })
    const variabili = sezione(v, 'variable')!
    expect(variabili.rows).toHaveLength(1)
    expect(variabili.rows.map((r) => r.name)).not.toContain('Fuori')
    // Otto righe da zero al primo avvio sarebbero un rettangolo con otto
    // etichette: e' il caso vuoto disegnato come grafico degenere.
    expect(variabili.rows.every((r) => r.cents > 0)).toBe(true)
  })
})

describe('la soglia del grafico vale per sezione', () => {
  const tre: readonly Expense[] = [
    makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 4000 }),
    makeExpense({ date: OGGI, categoryId: 'c-spesa', amountCents: 2000 }),
    makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 1000 }),
  ]
  const dueFisse: readonly Expense[] = [
    makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 9000, source: 'recurring' }),
    makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 50000, source: 'recurring' }),
  ]

  it('due fisse perdono le barre anche se sotto ci sono tre variabili', () => {
    const v = ready({ expenses: [...dueFisse, ...tre] })
    // Cinque righe in tutto: con la soglia applicata all'insieme sarebbero
    // barre dappertutto, e la sezione delle fisse deciderebbe della propria
    // forma guardando l'altra — cioe' proprio la mescolanza che dividere in due
    // serviva a togliere.
    expect(sezione(v, 'fixed')?.rows).toHaveLength(2)
    expect(sezione(v, 'fixed')?.asChart).toBe(false)
    expect(sezione(v, 'variable')?.rows).toHaveLength(BREAKDOWN_MIN_ROWS)
    expect(sezione(v, 'variable')?.asChart).toBe(true)
    invariantiDiA(v)
  })

  it('e vale anche a parti invertite', () => {
    const v = ready({
      expenses: [
        ...tre.map((e) => ({ ...e, source: 'recurring' as const })),
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 700 }),
        makeExpense({ date: OGGI, categoryId: 'c-spesa', amountCents: 300 }),
      ],
    })
    expect(sezione(v, 'fixed')?.asChart).toBe(true)
    expect(sezione(v, 'variable')?.rows).toHaveLength(2)
    // Due categorie non sono una ripartizione. E' l'argomento di A, e non e'
    // quello di B: se le due soglie fossero un numero solo, uno dei due test
    // sulle soglie cadrebbe.
    expect(sezione(v, 'variable')?.asChart).toBe(false)
    invariantiDiA(v)
  })

  it('le righe restano anche dove le barre non ci sono', () => {
    const v = ready({ expenses: [...dueFisse, ...tre] })
    // Sotto la soglia si legge nome e importo: la riga non sparisce, o il
    // totale della sezione smetterebbe di essere la somma di cio' che si vede.
    expect(sezione(v, 'fixed')?.rows.map((r) => r.cents)).toEqual([50000, 9000])
  })
})

/*
 * **Il totale di parte, e quando non c'e'.** Il difetto misurato: `Fisse in
 * questo periodo 900,00 €` e ventotto pixel sotto `Casa 900,00 €`, due stringhe
 * identiche incolonnate sullo stesso bordo destro — perche' con una regola sola
 * il totale e' la sua unica riga.
 *
 * L'invariante che giustifica la cifra ("e' sempre la somma delle righe") con
 * una riga sola e' **vacuo**, e la parte fisse con una regola sola non e' un
 * caso limite: e' il canone, cioe' quello che ADR 016 da' per scontato.
 */
describe('il totale di parte esiste solo dove ha qualcosa da spiegare', () => {
  const caffe = makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 400 })
  const canone = makeExpense({
    date: '2026-08-24',
    categoryId: 'c-casa',
    amountCents: 90000,
    source: 'recurring',
  })

  it('con una regola sola la cifra non si scrive due volte', () => {
    const fisse = sezione(ready({ expenses: [canone, caffe] }), 'fixed')
    // `totale()` restituisce `undefined` perche' il campo **non esiste** su
    // questo ramo: leggerlo direttamente non compila. E' la forma scelta al
    // posto di un `Cents | null`, che chi disegna avrebbe potuto interpretare
    // con un `?? 0` rimettendo lo `0,00 €` sotto il titolo.
    expect(totale(fisse)).toBeUndefined()
    // E il numero non e' perso: e' la riga, che a schermo c'e' gia'.
    expect(unica(fisse).cents).toBe(90000)
  })

  it('vale anche per le variabili: la regola e sulle righe, non sulla natura', () => {
    const v = ready({ expenses: [canone, caffe] })
    // Le variabili qui sono una riga sola — un caffe' — e la cifra sarebbe
    // ripetuta identica esattamente come per le fisse. La condizione non nomina
    // la natura della sezione, quindi vale per tutte e due.
    expect(totale(sezione(v, 'variable'))).toBeUndefined()
    expect(unica(sezione(v, 'variable')).cents).toBe(400)
    // La cifra del periodo resta leggibile dove ha una casa: le metriche, e la
    // scheda in testa che le usa.
    expect(v.tiles.variableCents).toBe(400)
    expect(v.current.recurringSpentCents).toBe(90000)
  })

  it('con due righe il totale torna, ed e la cosa che le due righe non dicono', () => {
    const v = ready({
      expenses: [
        canone,
        makeExpense({ date: '2026-08-25', categoryId: 'c-cibo', amountCents: 2300, source: 'recurring' }),
        caffe,
      ],
    })
    const fisse = sezione(v, 'fixed')!
    expect(fisse.single).toBe(false)
    expect(totale(fisse)).toBe(92300)
    // Due cifre che nessuna delle due righe porta: e' questa la ragione per cui
    // il totale esiste, ed e' anche quella per cui con una riga non serve.
    expect(fisse.rows.map((r) => r.cents)).toEqual([90000, 2300])
    invariantiDiA(v)
  })
})

describe('il pavimento della barra', () => {
  /*
   * Il caso misurato che l'ha prodotto: a 320 punti con l'affitto a 507,00 €,
   * tutto cio' che stava sotto ~11,00 € si dipingeva 2,00 px — `9,00 €` e
   * `7,50 €` identiche, rapporto vero 1,2:1 — perche' `.stat__bar` ha un bordo
   * da 1px e `box-sizing: border-box`. La frazione la calcolava il modello e la
   * correggeva il CSS: due proprietari per la stessa quantita'.
   */
  const affittoEBriciole: readonly Expense[] = [
    makeExpense({ date: '2026-08-24', categoryId: 'c-casa', amountCents: 50700 }),
    makeExpense({ date: '2026-08-25', categoryId: 'c-cibo', amountCents: 900 }),
    makeExpense({ date: '2026-08-26', categoryId: 'c-spesa', amountCents: 750 }),
  ]

  function briciole() {
    return sezione(ready({ expenses: affittoEBriciole }), 'variable')!
  }

  it('nessuna barra viva sta fra zero e il pavimento', () => {
    const rows = briciole().rows
    const nove = rows.find((r) => r.cents === 900)!
    const setteEmezzo = rows.find((r) => r.cents === 750)!
    // Senza pavimento uscirebbero 0,0177 e 0,0148, cioe' **1,99 e 1,66 px** sulla
    // colonna piu' stretta: sotto i 2 px del bordo, e quindi dipinte identiche.
    // La garanzia si prova li', dove e' piu' difficile da tenere.
    expect(nove.fraction * COLONNA_MIN_PX).toBeGreaterThanOrEqual(2)
    expect(setteEmezzo.fraction * COLONNA_MIN_PX).toBeGreaterThanOrEqual(2)
    expect(nove.fraction).toBeGreaterThanOrEqual(BAR_MIN_FRACTION)
    // E su una colonna piu' larga la stessa barra minima e' piu' larga: 3,44 px
    // a 390 punti. Sovrastima innocua, dichiarata dove sta la costante.
    expect(BAR_MIN_FRACTION * COLONNA_PX).toBeCloseTo(3.44, 2)
  })

  it('una frazione zero resta zero: l assenza non si arrotonda a un pochino', () => {
    const v = ready({
      // Una spesa corretta a zero invece che cancellata: la riga esiste e vale
      // niente.
      categories: [...CATS, makeCategory({ id: 'c-svago', name: 'Svago', color: '#e0b000' })],
      expenses: [
        ...affittoEBriciole,
        makeExpense({ date: OGGI, categoryId: 'c-svago', amountCents: 0 }),
      ],
    })
    const zero = sezione(v, 'variable')!.rows.find((r) => r.cents === 0)
    // Se il pavimento fosse un `max(f, MIN)` scritto a valle, questa cadrebbe:
    // zero prenderebbe l'inchiostro minimo e un periodo davvero a zero
    // leggerebbe "un pochino". E' l'argomento con cui era nato `[data-zero]`,
    // riscritto qui perche' la sua condizione — una lunghezza sotto i 2 px si
    // dipinge 2 px — vale anche sopra lo zero.
    expect(zero?.fraction).toBe(0)
    expect(zero?.fraction).toBeLessThan(BAR_MIN_FRACTION)
  })

  it('due importi a un centesimo di distanza restano due lunghezze diverse', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: '2026-08-24', categoryId: 'c-casa', amountCents: 90000 }),
        makeExpense({ date: '2026-08-25', categoryId: 'c-cibo', amountCents: 1 }),
        makeExpense({ date: '2026-08-26', categoryId: 'c-spesa', amountCents: 2 }),
      ],
    })
    const rows = sezione(v, 'variable')!.rows
    const uno = rows.find((r) => r.cents === 1)!
    const due = rows.find((r) => r.cents === 2)!
    // Un minimo a soglia dura (`Math.max(f, MIN)`) le schiaccerebbe sullo stesso
    // valore: e' il difetto di prima, spostato di quattro ordini di grandezza.
    // La mappa e' strettamente crescente, quindi l'ordine si conserva fin qui.
    expect(due.fraction).toBeGreaterThan(uno.fraction)
    expect(uno.fraction).not.toBe(due.fraction)
    // E la differenza fra due lunghezze e' proporzionale alla differenza fra gli
    // importi: e' la meta' della lettura che la traslazione lascia esatta.
    expect(due.fraction - uno.fraction).toBeCloseTo((1 - BAR_MIN_FRACTION) * (1 / 90000), 12)
  })

  it('il pavimento non tocca la piu grande, che vale esattamente 1', () => {
    const rows = briciole().rows
    // Non `toBeCloseTo`, ed e' voluto: `MIN + (1 - MIN) · 1` fa **esattamente**
    // 1 anche in virgola mobile, per qualunque MIN in (0,1) — non perche' il
    // numero sia una potenza di due, che era la ragione scritta finche' il
    // pavimento e' stato `2/64` e che con `2/112` sarebbe scaduta. Se la
    // rimappatura cambiasse forma (traslare senza comprimere, per dire) la barra
    // piu' lunga smetterebbe di arrivare a fondo colonna, e cadrebbe con lei la
    // cosa che dichiara le due scale.
    expect(rows[0]?.cents).toBe(50700)
    expect(rows[0]?.fraction).toBe(1)
  })

  it('sotto una certa scala l ordine resta nel modello e non nei pixel', () => {
    const rows = briciole().rows
    const nove = rows.find((r) => r.cents === 900)!
    const setteEmezzo = rows.find((r) => r.cents === 750)!
    // Il limite dichiarato, scritto qui invece che lasciato scoprire: 9,00 € e
    // 7,50 € su una scala da 507,00 € differiscono di 0,0029, cioe' **0,56 px**
    // a 390 punti. Il pavimento garantisce che si vedano entrambe, non che si
    // vedano diverse. E' anche la ragione per cui `--plot-min` e' salito a 7rem:
    // allargare la colonna sposta questo confine, non lo toglie.
    expect(nove.fraction).toBeGreaterThan(setteEmezzo.fraction)
    expect((nove.fraction - setteEmezzo.fraction) * COLONNA_PX).toBeLessThan(1)
    // Cio' che le distingue li' e' l'importo scritto accanto — e il fatto che
    // A e' divisa in due: sulla scala delle sole variabili, senza l'affitto,
    // quelle stesse due righe distano 31,5 px.
    const senzaAffitto = sezione(
      ready({ expenses: affittoEBriciole.filter((e) => e.amountCents !== 50700) }),
      'variable',
    )!.rows
    const a = senzaAffitto.find((r) => r.cents === 900)!
    const b = senzaAffitto.find((r) => r.cents === 750)!
    expect((a.fraction - b.fraction) * COLONNA_PX).toBeGreaterThan(30)
  })
})

describe('A comprende le fisse, B no (ADR 016 §1)', () => {
  const spese: readonly Expense[] = [
    makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 4000 }),
    makeExpense({ date: '2026-08-25', categoryId: 'c-spesa', amountCents: 2000 }),
    makeExpense({ date: '2026-08-24', categoryId: 'c-casa', amountCents: 1000 }),
  ]
  const affitto = makeExpense({
    date: '2026-08-24',
    categoryId: 'c-casa',
    amountCents: 90000,
    source: 'recurring',
  })

  it('l affitto si vede in A, con la sua categoria, e non si nasconde', () => {
    const v = ready({ expenses: [...spese, affitto] })
    const casa = sezione(v, 'fixed')?.rows.find((r) => r.name === 'Casa')
    // Se le ricorrenti tornassero fuori da A, una settimana di solo affitto
    // leggerebbe 0,00 sotto "dove sono finiti i soldi". Nasconderle in una
    // sezione che non c'e' sarebbe la stessa cosa con un nome piu' gentile.
    expect(casa?.cents).toBe(90000)
    expect(casa?.fraction).toBe(1)
    // E Casa ha anche 10,00 a mano, che restano di la'.
    expect(sezione(v, 'variable')?.rows.find((r) => r.name === 'Casa')?.cents).toBe(1000)
    invariantiDiA(v)
  })

  it('B resta variabile, perche B e il confronto col budget', () => {
    // La spesa della settimana prima non serve a questo test: serve **a
    // esistere**. Con tutte le spese di oggi B non c'e' (`TREND_MIN_ROWS`), e
    // un test che leggesse `undefined` passerebbe per il motivo sbagliato.
    const prima = makeExpense({ date: '2026-08-17', categoryId: 'c-cibo', amountCents: 500 })
    const v = ready({ expenses: [...spese, affitto, prima] })
    const corrente = v.byPeriod.rows.find((r) => r.current)
    // 7000 e non 97000: la barra si legge contro la traccia del budget, e il
    // budget le fisse le esclude. Se entrassero, la settimana del primo
    // sarebbe sempre la piu' lunga di tutte e otto — il difetto per cui ADR
    // 016 esiste.
    expect(corrente?.cents).toBe(7000)
    expect(v.current.spentCents).toBe(7000)
    // E A conta l'altra cosa, in due sezioni che lo dichiarano.
    expect(totale(sezione(v, 'variable'))).toBe(7000)
    // Le fisse qui sono **una riga sola** — il canone — quindi la sezione non
    // porta un totale: quella cifra e' gia' la riga, e scriverla sopra sarebbe
    // la stessa stringa due volte.
    expect(unica(sezione(v, 'fixed')).cents).toBe(90000)
    expect(totale(sezione(v, 'fixed'))).toBeUndefined()
  })

  it('i totali delle sezioni vengono dalle metriche, non da una seconda somma', () => {
    // **Due** fisse, non solo il canone: con una riga sola la sezione non porta
    // nessun totale, e le due asserzioni qui sotto confronterebbero `undefined`
    // con `undefined` — verdi per il motivo sbagliato.
    const abbonamento = makeExpense({
      date: '2026-08-25',
      categoryId: 'c-cibo',
      amountCents: 2300,
      source: 'recurring',
    })
    const v = ready({ expenses: [...spese, affitto, abbonamento] })
    // Le due identita' su cui poggia tutto il resto: se il filtro di A e quello
    // delle metriche divergessero, queste cadono.
    expect(v.current.recurringSpentCents).toBe(92300)
    expect(totale(sezione(v, 'fixed'))).toBe(v.current.recurringSpentCents)
    expect(totale(sezione(v, 'variable'))).toBe(v.current.spentCents)
    invariantiDiA(v)
  })

  it('senza nessuna fissa nel periodo la sezione non c e, e le variabili tornano', () => {
    const v = ready({ expenses: spese })
    expect(sezione(v, 'fixed')).toBeUndefined()
    expect(v.current.recurringSpentCents).toBe(0)
    expect(totale(sezione(v, 'variable'))).toBe(7000)
    invariantiDiA(v)
  })

  /*
   * **Identita' con la Home**, non due calcoli confrontati. La cifra grande
   * della Home e' lo speso *del budget*: e' `tiles.variableCents` a doverla
   * ripetere al centesimo.
   */
  it('la cifra variabile in testa e esattamente lo speso del periodo', () => {
    const v = ready({ expenses: [...spese, affitto] })
    expect(v.tiles.variableCents).toBe(v.current.spentCents)
    expect(v.tiles.variableCents).toBe(7000)
  })
})

describe('le spese la cui categoria non esiste piu', () => {
  const cibo = makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 4000 })
  /** Tre categorie sparite diverse: un import di un backup piu' vecchio. */
  const sparite: readonly Expense[] = [
    makeExpense({ date: '2026-08-24', categoryId: 'c-sparita-1', amountCents: 1500 }),
    makeExpense({ date: '2026-08-25', categoryId: 'c-sparita-2', amountCents: 2500 }),
    makeExpense({ date: '2026-08-25', categoryId: 'c-sparita-3', amountCents: 1000, source: 'recurring' }),
  ]

  it('sono una riga sola per sezione, anche se le categorie sparite erano tre', () => {
    const v = ready({ expenses: [cibo, ...sparite] })
    const orfaneVariabili = sezione(v, 'variable')!.rows.filter((r) => r.orphan)
    const orfaneFisse = sezione(v, 'fixed')!.rows.filter((r) => r.orphan)
    // Tre righe senza nome sarebbero tre parafrasi dello stesso fatto, e
    // nessuna delle tre l'utente potrebbe andare a guardare.
    expect(orfaneVariabili).toHaveLength(1)
    expect(orfaneVariabili[0]?.cents).toBe(4000)
    // **Ma due sono due fatti diversi**: canoni che non si sa piu' a cosa erano,
    // e spese a mano che non si sa piu' a cosa erano. Fondendole si
    // rimetterebbero insieme le due nature che A divide, in una riga che non
    // potrebbe stare in nessuna delle due scale.
    expect(orfaneFisse).toHaveLength(1)
    expect(orfaneFisse[0]?.cents).toBe(1000)
    // E non si sono attaccate a una categoria che esiste: se confluissero in
    // una riga vera, Fuori direbbe 8000 e la cifra sarebbe verificabile e
    // falsa, che e' peggio.
    expect(sezione(v, 'variable')?.rows.find((r) => r.categoryId === 'c-cibo')?.cents).toBe(4000)
    invariantiDiA(v)
  })

  it('non portano ne un nome ne un colore: li sceglie chi ha il dizionario', () => {
    const v = ready({ expenses: [cibo, ...sparite] })
    const orfana = sezione(v, 'variable')!.rows.find((r) => r.orphan)
    expect(orfana?.categoryId).toBeNull()
    // `row.categoryRemoved` e' una chiave i18n, e lo strato puro non ha
    // dizionari: inventare qui "Senza categoria" darebbe all'utente due parole
    // diverse per lo stesso fatto, una qui e una nello Storico.
    expect(orfana?.name).toBeNull()
    expect(orfana?.color).toBeNull()
  })

  it('stanno con le altre per importo, non in fondo per convenzione', () => {
    const v = ready({
      expenses: [cibo, ...sparite, makeExpense({ date: OGGI, categoryId: 'c-sparita-4', amountCents: 2000 })],
    })
    const rows = sezione(v, 'variable')!.rows
    // 60,00 di orfane contro 40,00 di Fuori: l'aggregato e' la risposta alla
    // domanda, quindi e' la prima riga. In fondo "perche' e' un caso strano"
    // sarebbe una barra lunga sotto una barra corta.
    expect(rows[0]?.orphan).toBe(true)
    expect(rows[0]?.cents).toBe(6000)
    expect(rows[0]?.fraction).toBe(1)
    invariantiDiA(v)
  })

  it('contano come riga per la soglia del grafico: sono spesa vera', () => {
    const v = ready({
      expenses: [
        cibo,
        makeExpense({ date: OGGI, categoryId: 'c-spesa', amountCents: 2000 }),
        makeExpense({ date: OGGI, categoryId: 'c-sparita-1', amountCents: 1500 }),
      ],
    })
    expect(sezione(v, 'variable')?.rows).toHaveLength(BREAKDOWN_MIN_ROWS)
    expect(sezione(v, 'variable')?.asChart).toBe(true)
  })

  it('un aggregato da zero centesimi non divide per zero', () => {
    const v = ready({
      expenses: [makeExpense({ date: OGGI, categoryId: 'c-sparita-1', amountCents: 0 })],
    })
    const orfana = sezione(v, 'variable')!.rows.find((r) => r.orphan)
    expect(orfana?.cents).toBe(0)
    // Una sezione in cui tutte le righe valgono zero non mette in scala niente:
    // dipingere una barra piena per zero euro sarebbe la scala a dire una cosa
    // che i dati non dicono. E `0 / 0` e' `NaN`, che in un attributo SVG e' una
    // barra che sparisce senza errore.
    expect(orfana?.fraction).toBe(0)
    expect(Number.isNaN(orfana?.fraction)).toBe(false)
    invariantiDiA(v)
  })
})

describe('dati ostili', () => {
  /** Trenta caratteri: quello che l'editor delle categorie permette davvero. */
  const LUNGO_CASA = 'Casa affitto utenze e condomin'
  const LUNGO_TRASP = 'Trasporti pubblici e taxi sera'
  const CASA_L: Category = makeCategory({ id: 'h-casa', name: LUNGO_CASA, color: '#bc85ec' })
  const TRASP: Category = makeCategory({ id: 'h-trasp', name: LUNGO_TRASP, color: '#4aa3c7' })
  const BRICIOLA: Category = makeCategory({ id: 'h-bricio', name: 'Extra', color: '#d0d0d0' })
  const CORRETTA: Category = makeCategory({ id: 'h-zero', name: 'Svago', color: '#e0b000' })
  const MAI_USATA: Category = makeCategory({ id: 'h-mai', name: 'Sigarette', color: '#999999' })

  const espese: readonly Expense[] = [
    // Solo fissi: 900,00.
    makeExpense({ date: '2026-08-24', categoryId: 'h-casa', amountCents: 90000, source: 'recurring' }),
    // In tutte e due le sezioni: 23,00 fissi e 10,00 a mano.
    makeExpense({ date: '2026-08-25', categoryId: 'h-trasp', amountCents: 2300, source: 'recurring' }),
    makeExpense({ date: '2026-08-25', categoryId: 'h-trasp', amountCents: 1000 }),
    // Un centesimo: quattro ordini di grandezza sotto la piu' grande.
    makeExpense({ date: '2026-08-26', categoryId: 'h-bricio', amountCents: 1 }),
    // Una riga che vale zero: una spesa corretta a zero invece che cancellata.
    makeExpense({ date: '2026-08-26', categoryId: 'h-zero', amountCents: 0 }),
    // Due categorie sparite in un import, una per sezione.
    makeExpense({ date: '2026-08-24', categoryId: 'h-sparita', amountCents: 4400 }),
    makeExpense({ date: '2026-08-24', categoryId: 'h-altra-sparita', amountCents: 1600, source: 'recurring' }),
  ]

  function ostile() {
    const v = statsView({
      expenses: espese,
      categories: [CASA_L, TRASP, BRICIOLA, CORRETTA, MAI_USATA],
      rules: [] as readonly RecurringRule[],
      budgets: [] as readonly Budget[],
      period: 'weekly',
      day: OGGI,
    })
    if (v.kind !== 'ready') throw new Error('atteso ready')
    return v
  }

  it('i nomi lunghi arrivano interi: tagliarli e un lavoro della presentazione', () => {
    expect(LUNGO_CASA).toHaveLength(30)
    expect(LUNGO_TRASP).toHaveLength(30)
    const v = ostile()
    expect(sezione(v, 'fixed')?.rows[0]?.name).toBe(LUNGO_CASA)
    expect(sezione(v, 'variable')?.rows.find((r) => r.categoryId === 'h-trasp')?.name).toHaveLength(30)
    invariantiDiA(v)
  })

  it('le due sezioni si spartiscono le righe, e i due totali reggono', () => {
    const v = ostile()
    expect(sezione(v, 'fixed')?.rows.map((r) => r.cents)).toEqual([90000, 2300, 1600])
    expect(sezione(v, 'variable')?.rows.map((r) => r.cents)).toEqual([4400, 1000, 1, 0])
    expect(totale(sezione(v, 'fixed'))).toBe(93900)
    expect(totale(sezione(v, 'variable'))).toBe(5401)
    expect(v.tiles.variableCents).toBe(5401)
    // La categoria mai usata non e' una riga in nessuna delle due.
    for (const s of v.byCategory.sections) {
      expect(s.rows.map((r) => r.categoryId)).not.toContain('h-mai')
    }
    invariantiDiA(v)
  })

  it('c e un orfana per sezione, e sono due importi diversi', () => {
    const v = ostile()
    expect(sezione(v, 'fixed')?.rows.find((r) => r.orphan)?.cents).toBe(1600)
    expect(sezione(v, 'variable')?.rows.find((r) => r.orphan)?.cents).toBe(4400)
    // Se l'orfana ricorrente finisse fra le variabili, il totale delle variabili
    // direbbe 7001 mentre `spentCents` dice 5401: le identita' cadono.
    invariantiDiA(v)
  })

  it('un centesimo contro quarantaquattro euro non e piu un centesimo, ed e dichiarato', () => {
    const briciola = ostile().byCategory.sections
      .find((s) => s.kind === 'variable')!
      .rows.find((r) => r.categoryId === 'h-bricio')!
    // Prima questa riga asseriva `1 / 90000` e si chiamava "resta un centesimo,
    // non un minimo". Non poteva cadere: il minimo non era nel modello, era nel
    // CSS, e quella barra si dipingeva 2 px come tutte le altre briciole.
    // Adesso il minimo e' qui e si vede: la barra vale il pavimento piu' un
    // pelo, e il pelo e' proporzionale.
    expect(briciola.fraction).toBeGreaterThanOrEqual(BAR_MIN_FRACTION)
    expect(briciola.fraction).toBeCloseTo(
      BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * (1 / 4400),
      12,
    )
    // E resta piu' corta della riga a zero? No: la riga a zero e' **zero**, e
    // questa no. E' la sola discontinuita' della mappa, ed e' voluta.
    const zero = ostile().byCategory.sections
      .find((s) => s.kind === 'variable')!
      .rows.find((r) => r.categoryId === 'h-zero')!
    expect(zero.fraction).toBe(0)
    expect(briciola.fraction).toBeGreaterThan(zero.fraction)
  })

  it('la riga che sta in tutte e due non si somma, e le due scale lo dichiarano', () => {
    const v = ostile()
    const fissa = sezione(v, 'fixed')!.rows.find((r) => r.categoryId === 'h-trasp')!
    const variabile = sezione(v, 'variable')!.rows.find((r) => r.categoryId === 'h-trasp')!
    expect(fissa.cents).toBe(2300)
    expect(variabile.cents).toBe(1000)
    // 23,00 su una scala da 900,00 e' piu' corta di 10,00 su una scala da 44,00.
    // La geometria che lo dichiara e' in cima a ogni sezione: due barre piene
    // con due importi diversi.
    expect(variabile.fraction).toBeGreaterThan(fissa.fraction)
    expect(sezione(v, 'fixed')!.rows[0]?.fraction).toBe(1)
    expect(sezione(v, 'variable')!.rows[0]?.fraction).toBe(1)
  })
})

describe('B — spese si, budget no', () => {
  const spese: readonly Expense[] = [
    makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 4000 }),
    makeExpense({ date: '2026-08-19', categoryId: 'c-spesa', amountCents: 8000 }),
  ]

  it('senza budget nessuna riga ha una traccia', () => {
    const v = ready({ expenses: spese })
    expect(v.byPeriod.rows.length).toBeGreaterThan(0)
    // Una traccia senza budget sarebbe un tetto da zero euro, cioe' un numero
    // inventato. Se la traccia si disegnasse sempre, questa cade.
    expect(v.byPeriod.rows.every((row) => row.track === null)).toBe(true)
  })

  it('le lunghezze restano confrontabili anche senza traccia', () => {
    const v = ready({ expenses: spese })
    const corrente = v.byPeriod.rows.find((r) => r.current)!
    const precedente = v.byPeriod.rows.find((r) => !r.current && r.cents > 0)!
    expect(corrente.cents).toBe(4000)
    expect(precedente.cents).toBe(8000)
    // La piu' grande arriva a fondo colonna, come in A.
    expect(precedente.fraction).toBe(1)
    // E la differenza fra le due lunghezze e' proporzionale alla differenza fra
    // gli importi: 4000 su una scala da 8000, meno il pavimento che le due
    // barre condividono.
    expect(precedente.fraction - corrente.fraction).toBeCloseTo(
      (1 - BAR_MIN_FRACTION) * (4000 / 8000),
      10,
    )
    expect(corrente.fraction).toBeGreaterThanOrEqual(BAR_MIN_FRACTION)
  })

  it('due periodi sono gia una sezione: sono letteralmente la domanda', () => {
    const v = ready({ expenses: spese })
    expect(v.byPeriod.rows).toHaveLength(TREND_MIN_ROWS)
    expect(v.byPeriod.rows.map((r) => r.cents)).toEqual([8000, 4000])
    // Questa settimana contro la scorsa. Con la soglia di A (tre) B non ci
    // sarebbe affatto, e la risposta sparirebbe proprio a chi ha appena finito
    // la seconda settimana.
    expect(TREND_MIN_ROWS).toBeLessThan(BREAKDOWN_MIN_ROWS)
  })

  it('con un periodo solo la sezione non c e: non esiste nessun prima', () => {
    // Il primo giorno d'uso, cioe' lo stato di chiunque installi l'app: tutte
    // le spese datate oggi. Con la soglia applicata alle sole barre, sotto
    // "SETTIMANA PER SETTIMANA" restava **una riga sola** — 24–30 ago, 40,00 € —
    // mentre la scheda in testa diceva gia' gli stessi due fatti.
    const v = ready({
      expenses: [
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 4000 }),
        makeExpense({ date: OGGI, categoryId: 'c-spesa', amountCents: 3500 }),
        makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 1500 }),
      ],
    })
    expect(v.byPeriod.rows).toHaveLength(0)
    // Tre spese, un periodo solo: la soglia conta i **periodi**, e sono le
    // righe di B a mancare — non i dati. A infatti ha tre righe da mostrare.
    expect(sezione(v, 'variable')?.rows).toHaveLength(3)
    // La cifra che B avrebbe ristampato e' **esattamente** quella della scheda,
    // e il periodo pure: e' per questo che ristamparla non aggiungeva niente.
    // Se un giorno la soglia tornasse a governare le sole barre, questa cade.
    expect(v.tiles.variableCents).toBe(9000)
    expect(v.current.range).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    invariantiDiA(v)
  })

  it('la riga corrente e l ultima, ed e quella che contiene oggi', () => {
    const v = ready({ expenses: spese })
    const rows = v.byPeriod.rows
    expect(rows[rows.length - 1]?.current).toBe(true)
    expect(rows[rows.length - 1]?.range).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    expect(rows.filter((r) => r.current)).toHaveLength(1)
  })
})

describe('dove comincia la finestra di B', () => {
  it('la testa si taglia sulla data della prima spesa contata, non sul primo importo > 0', () => {
    const v = ready({
      expenses: [
        // Tre settimane fa una spesa **corretta a zero** invece che cancellata:
        // vale niente e conta lo stesso, perche' il taglio e' sulla data.
        makeExpense({ date: '2026-08-10', categoryId: 'c-cibo', amountCents: 0 }),
        makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 4000 }),
      ],
    })
    const rows = v.byPeriod.rows
    // Tagliando su `cents > 0` questa finestra sarebbe una riga sola — cioe'
    // nessuna sezione — perche' il taglio leggerebbe un valore ("zero speso")
    // come un fatto ("l'app non c'era"). Sono tre.
    expect(rows.map((r) => r.range.start)).toEqual(['2026-08-10', '2026-08-17', '2026-08-24'])
    expect(rows[0]?.cents).toBe(0)
    expect(rows[0]?.fraction).toBe(0)
  })

  /*
   * **Qui c'era il difetto, e c'era un test che lo difendeva.** La fixture di
   * questo blocco era un affitto del 10 agosto con accanto scritto *"in B non si
   * vede, ma il fatto che l'app avesse dati resta"*, e asseriva tre righe.
   *
   * Quel "fatto" e' il fatto sbagliato: ogni barra di B e' `spentCents`, quindi
   * cio' che apre la finestra e' la prima spesa **che B conta**. Aprendola su una
   * ricorrente si otteneva una sezione fatta di soli zeri — una schermata che
   * chiede "sto spendendo piu' o meno degli altri periodi" e risponde otto volte
   * `0,00 €` mentre il canone a disco non compare da nessuna parte.
   */
  describe('e le ricorrenti non la aprono: ogni barra di B e lo speso variabile', () => {
    /**
     * La regola dell'affitto accesa **a ritroso di 60 giorni**, cioe' uno dei
     * percorsi che il prodotto offre. Due canoni gia' materializzati, nessuno
     * dei due nella settimana corrente.
     */
    const canoni: readonly Expense[] = [
      makeExpense({ date: '2026-06-27', categoryId: 'c-casa', amountCents: 90000, source: 'recurring' }),
      makeExpense({ date: '2026-07-27', categoryId: 'c-casa', amountCents: 90000, source: 'recurring' }),
    ]

    it('con una spesa a mano di oggi B non c e: il primo confronto e domani', () => {
      const v = ready({
        expenses: [...canoni, makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 4000 })],
      })
      // Aprendo la finestra su tutte le spese vive uscivano **otto righe, sette
      // zeri**: la finestra partiva dal 27 giugno e le barre contavano il solo
      // variabile, che prima di oggi non esiste. Il primo periodo con qualcosa
      // che B conta e' quello corrente, e uno solo non e' un confronto.
      expect(v.byPeriod.rows).toHaveLength(0)
      // E i dati ci sono davvero: la schermata non e' vuota, e' A a portarli.
      expect(sezione(v, 'variable')?.rows).toHaveLength(1)
      expect(v.tiles.variableCents).toBe(4000)
      invariantiDiA(v)
    })

    it('con il canone dentro il periodo corrente A lo mostra e B resta senza righe', () => {
      const v = ready({
        expenses: [
          ...canoni,
          makeExpense({ date: '2026-08-25', categoryId: 'c-casa', amountCents: 90000, source: 'recurring' }),
        ],
      })
      // A risponde alla propria domanda — 900,00 € di Casa, questa settimana —
      // e B non ha niente da confrontare, perche' di variabile non e' ancora
      // uscito niente. Sono due domande diverse, e una delle due ha una
      // risposta.
      expect(unica(sezione(v, 'fixed')).cents).toBe(90000)
      expect(v.byPeriod.rows).toHaveLength(0)
      invariantiDiA(v)
    })

    it('senza nemmeno una spesa a mano non resta una scheda sola in mezzo allo schermo', () => {
      const v = view({
        expenses: canoni,
        // La regola c'e' ed e' viva: la proiezione mensile varrebbe 900,00 €, e
        // la scheda delle fisse **non** basta a tenere in piedi la schermata.
        // Il canone si vede in A quando cade nel periodo corrente; fuori
        // appartiene allo Storico e alle Spese fisse, non a una scheda che
        // risponde al mese a una domanda sul periodo.
        rules: [makeRule({ startDate: '2026-06-27', amountCents: 90000, categoryId: 'c-casa' })],
      })
      // Lo stato di chi ha appena finito la configurazione: la regola c'e', il
      // canone e' a disco, e a mano non ha ancora segnato niente. Con la
      // finestra aperta sulle ricorrenti erano **otto righe, otto zeri** sotto
      // "settimana per settimana", e `0,00 €` nove volte sulla stessa schermata.
      expect(v.kind).toBe('outside')
    })
  })

  it('una settimana davvero a zero dentro la finestra resta, e vale zero', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: '2026-08-10', categoryId: 'c-cibo', amountCents: 5000 }),
        makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 2500 }),
      ],
    })
    const rows = v.byPeriod.rows
    expect(rows).toHaveLength(3)
    const vuota = rows[1]
    expect(vuota?.range.start).toBe('2026-08-17')
    expect(vuota?.cents).toBe(0)
    // Zero e' un dato, non un buco: e' la riga che dice "quella settimana non
    // hai speso niente", e per chi ha il conto corto e' quella che si cerca.
    // E vale **zero**, non il pavimento: l'assenza non prende inchiostro.
    expect(vuota?.fraction).toBe(0)
    expect(rows[2]?.fraction).toBeGreaterThanOrEqual(BAR_MIN_FRACTION)
    expect((rows[0]?.fraction ?? 0) - (rows[2]?.fraction ?? 0)).toBeCloseTo(
      (1 - BAR_MIN_FRACTION) * (2500 / 5000),
      10,
    )
  })

  it('una lapide non allarga la finestra', () => {
    const v = ready({
      expenses: [
        makeExpense({
          date: '2026-07-06',
          categoryId: 'c-cibo',
          amountCents: 5000,
          deletedAt: '2026-07-07T09:00:00Z',
        }),
        // Due spese vive in due settimane: la sezione esiste, quindi il
        // conteggio delle righe misura la finestra e non la soglia. Con una
        // sola spesa viva il risultato sarebbe zero righe **anche** se le
        // lapidi contassero — un test verde per il motivo sbagliato.
        makeExpense({ date: '2026-08-19', categoryId: 'c-cibo', amountCents: 1000 }),
        makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 2500 }),
      ],
    })
    // La spesa cancellata e' del primo periodo della finestra: se le lapidi
    // contassero come "l'app c'era", qui ci sarebbero otto righe.
    expect(v.byPeriod.rows.map((r) => r.range.start)).toEqual(['2026-08-17', '2026-08-24'])
  })

  it('non si mostrano piu di TREND_PERIODS periodi anche con anni di storico', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: '2024-01-15', categoryId: 'c-cibo', amountCents: 5000 }),
        makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 2500 }),
      ],
    })
    expect(v.byPeriod.rows).toHaveLength(TREND_PERIODS)
    expect(v.byPeriod.rows[0]?.range.start).toBe('2026-07-06')
  })

  it('una spesa datata oltre la fine del periodo non lascia ne righe ne sezioni', () => {
    const v = view({
      expenses: [
        makeExpense({ date: '2026-09-20', categoryId: 'c-cibo', amountCents: 5000 }),
        // Una seconda spesa, viva e altrettanto avanti: cosi' il caso non e'
        // "una spesa sola" ma davvero "ogni periodo della finestra finisce
        // prima della prima spesa contata".
        makeExpense({ date: '2026-09-27', categoryId: 'c-spesa', amountCents: 2000 }),
      ],
    })
    // Ne' un "prima" ne' un "adesso" che non sia zero, e niente nel periodo:
    // non e' `ready` con due elenchi vuoti — quello lasciava a schermo la sola
    // scheda in testa — ed e' lo stato che lo dichiara.
    //
    // Qui c'era anche `bars.slice(-1)`, "resta la riga di oggi": quella riga non
    // sopravviverebbe comunque alla soglia, quindi il ramo produceva un valore
    // che nessuno poteva vedere.
    expect(v.kind).toBe('outside')
  })
})

/*
 * **Otto righe a zero non sono una sezione, sono una schermata vuota con le
 * righe.** La frase esisteva gia' come asserzione, scritta per lo stato `blank`
 * in `tests/e2e/statistiche.spec.ts`: *"nessuna barra, nemmeno lunga zero. Otto
 * righe da zero sarebbero un grafico degenere spacciato per schermata vuota."*
 * Non nomina `blank` da nessuna parte — vale ovunque valga il suo argomento — e
 * non era stata cercata nel ramo accanto.
 *
 * Il taglio sulla testa risponde a una domanda sulle **date** ("da quando l'app
 * aveva dati che B conta"); questi casi ne fanno un'altra, sui **valori** ("c'e'
 * qualcosa da confrontare"). Con solo la prima, chi riapre l'app dopo mesi
 * atterrava su otto barre a zero.
 */
describe('quando la finestra ha righe e non ha niente da confrontare', () => {
  /**
   * L'Erasmus che riapre l'app dopo la pausa estiva: tre spese vere, tutte piu'
   * vecchie della finestra di otto settimane, che si apre il 2026-07-06.
   */
  const primavera: readonly Expense[] = [
    makeExpense({ date: '2026-02-07', categoryId: 'c-cibo', amountCents: 4000 }),
    makeExpense({ date: '2026-01-28', categoryId: 'c-spesa', amountCents: 2500 }),
    makeExpense({ date: '2026-01-18', categoryId: 'c-cibo', amountCents: 1200 }),
  ]

  it('tre spese di sei mesi fa non lasciano otto barre a zero', () => {
    const v = view({ expenses: primavera })
    // Misurato a 390x844 prima della condizione sui valori: `firstCounted` non
    // e' `null`, quindi `firstShown` valeva 0, quindi **otto barre** e `0,00 €`
    // nove volte sulla stessa schermata — il conteggio piu' alto mai registrato
    // in questo repo con quella metrica — mentre i 77,00 € a disco non
    // comparivano da nessuna parte.
    expect(v.kind).toBe('outside')
  })

  it('la finestra non scorre indietro fino a dove i dati ci sono', () => {
    // La domanda che segue dalla condizione, e la risposta e' no: otto periodi
    // di sei mesi fa non sono il *normale recente* che B esiste per confrontare
    // — sono una storia, che e' un'altra domanda e non ha una schermata.
    // Facendo scorrere la finestra questo caso avrebbe tre righe vive, e l'asse
    // vorrebbe dire due cose diverse a due utenti senza dirlo a nessuno dei due.
    const v = view({ expenses: primavera })
    expect(v.kind).not.toBe('ready')
  })

  it('con una sola spesa dentro la finestra la sezione torna, e la riga vecchia resta a zero', () => {
    const v = ready({
      expenses: [
        ...primavera,
        // Rientrato: una spesa a mano nel periodo corrente. Adesso la finestra
        // **ha** qualcosa da confrontare, e le sette settimane a zero prima di
        // oggi tornano a essere un dato — sono le settimane in cui non ha
        // speso, non le settimane in cui l'app non c'era.
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 3000 }),
      ],
    })
    const rows = v.byPeriod.rows
    expect(rows).toHaveLength(TREND_PERIODS)
    expect(rows.filter((r) => r.cents === 0)).toHaveLength(TREND_PERIODS - 1)
    expect(rows[TREND_PERIODS - 1]?.cents).toBe(3000)
    // La riga viva porta la scala, cioe' arriva a fondo colonna; le altre non
    // prendono inchiostro. E' la differenza fra "zero dentro la finestra" e
    // "finestra senza niente da confrontare": qui gli zeri si dipingono.
    expect(rows[TREND_PERIODS - 1]?.fraction).toBe(1)
    expect(rows[0]?.fraction).toBe(0)
  })

  it('una traccia di budget non e qualcosa da confrontare: e il tetto, non una spesa', () => {
    // Il budget c'e' da gennaio, quindi ogni riga della finestra sarebbe
    // confrontabile e porterebbe la propria rotaia. Non basta: le otto barre
    // valgono zero lo stesso, e otto rotaie sopra otto zeri leggono "sei stato
    // bravissimo per due mesi" a chi semplicemente non ha aperto l'app. Cio'
    // che B confronta e' lo speso; il tetto e' il metro, non il confronto.
    const v = view({
      expenses: primavera,
      budgets: [makeBudget({ period: 'weekly', effectiveFrom: '2026-01-01', amountCents: 20000 })],
    })
    expect(v.kind).toBe('outside')
  })

  /*
   * **Il caso da non trascinare dentro `outside`.** A conta tutto (ADR 016 §1),
   * B solo il variabile: un periodo con **solo l'affitto** ha una sezione in A e
   * zero righe in B. E' "B assente, A presente", uno stato che esiste gia' — e
   * `outside` vale solo quando non c'e' niente ne' di qua ne' di la'.
   */
  it('con solo l affitto nel periodo A resta e B se ne va, e non e outside', () => {
    const v = ready({
      expenses: [
        ...primavera,
        makeExpense({
          date: '2026-08-25',
          categoryId: 'c-casa',
          amountCents: 90000,
          source: 'recurring',
        }),
      ],
    })
    // Se la condizione nuova avesse svuotato anche A, o se `outside` avesse
    // guardato il solo B, qui la schermata direbbe "niente da confrontare" con
    // 900,00 € di canone uscito questa settimana.
    expect(unica(sezione(v, 'fixed')).cents).toBe(90000)
    expect(v.byPeriod.rows).toHaveLength(0)
    invariantiDiA(v)
  })
})

/*
 * **`outside` e' l'unico stato che parla del confine del periodo, ed era
 * l'unico a non disegnarlo.** Misurato: affitto datato l'11 agosto, oggi il 19,
 * periodo settimanale — il testo di tutta la pagina non conteneva **una sola
 * data**. L'utente ha pagato otto giorni fa, legge che non cade "in questo
 * periodo", e sullo schermo non c'e' niente che dica che il periodo comincia il
 * 17: e' *"nessun messaggio afferma un fatto che l'utente non puo' verificare"*
 * nella forma senza cifre che la regola dichiara di coprire.
 *
 * La decisione "niente numeri" resta, ed e' sugli **importi** (vedi `StatsView`,
 * ramo `outside`). Il confine non e' un importo: e' cio' di cui la frase parla.
 */
describe('outside dice di quale periodo sta parlando', () => {
  function outside(over: Partial<StatsInput>) {
    const v = view(over)
    if (v.kind !== 'outside') throw new Error('atteso outside')
    return v
  }

  it('porta il periodo corrente, quello di cui la frase parla', () => {
    // Il caso esatto della misura, riportato al lunedi' 17 con oggi mercoledi'
    // 19: unica spesa viva un canone dell'11 agosto, cioe' la settimana prima.
    const v = outside({
      day: '2026-08-19',
      expenses: [
        makeExpense({
          date: '2026-08-11',
          categoryId: 'c-casa',
          amountCents: 90000,
          source: 'recurring',
        }),
      ],
    })
    // Il 17 e' il numero che manca a schermo: senza di lui la frase "non cade in
    // questo periodo" non e' verificabile da nessuna parte.
    expect(v.range).toEqual({ start: '2026-08-17', end: '2026-08-23' })
    // Il periodo serve al componente per scegliere la forma dell'etichetta
    // (`periodRangeLabel`): "17–23 ago" contro "agosto".
    expect(v.period).toBe('weekly')
  })

  it('il confine e quello del periodo scelto, non della settimana per abitudine', () => {
    const v = outside({
      period: 'monthly',
      day: '2026-08-19',
      expenses: [
        makeExpense({
          date: '2026-07-11',
          categoryId: 'c-casa',
          amountCents: 90000,
          source: 'recurring',
        }),
      ],
    })
    expect(v.range).toEqual({ start: '2026-08-01', end: '2026-08-31' })
    expect(v.period).toBe('monthly')
  })
})

describe('la finestra dei periodi', () => {
  it('sono otto, contigui, e l ultimo contiene oggi', () => {
    const ranges = trendRanges('weekly', OGGI)
    expect(ranges).toHaveLength(TREND_PERIODS)
    expect(ranges[TREND_PERIODS - 1]).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    for (let i = 1; i < ranges.length; i += 1) {
      // Contigui davvero: nessun giorno fra la fine di uno e l'inizio del dopo.
      const prima = ranges[i - 1]!
      const dopo = ranges[i]!
      expect(new Date(dopo.start).getTime() - new Date(prima.end).getTime()).toBe(86400000)
    }
  })

  it('i mesi non hanno tutti la stessa lunghezza, e i confini vengono da periodRange', () => {
    const ranges = trendRanges('monthly', '2026-03-15')
    expect(ranges[TREND_PERIODS - 1]).toEqual({ start: '2026-03-01', end: '2026-03-31' })
    // Febbraio 2026: 28 giorni. Se si camminasse a passi di 30 giorni, questo
    // confine sarebbe sbagliato.
    expect(ranges[TREND_PERIODS - 2]).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})

/*
 * **Le fisse sono due quantita' e stanno in due posti**: la proiezione mensile
 * qui in testa, il fatto del periodo nel totale della sezione fisse di A. I test
 * di questo blocco leggono l'una e l'altra da dove vivono davvero, che e' anche
 * il modo in cui le legge il componente — un test che leggesse il fatto da un
 * campo dei tiles terrebbe in vita un campo che nessuno chiama.
 */
describe('C — le due cifre in testa, e le fisse che sono due quantita', () => {
  /** L'affitto uscito questa settimana: un fatto, gia' a disco. */
  const affitto = makeExpense({
    date: '2026-08-24',
    categoryId: 'c-casa',
    amountCents: 50700,
    source: 'recurring',
  })
  const caffe = makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 400 })

  it('senza fisse ne regole la seconda cifra non si mostra', () => {
    const v = ready({ expenses: [caffe] })
    expect(v.tiles.hasFixed).toBe(false)
    expect(v.tiles.fixedMonthlyCents).toBe(0)
    expect(sezione(v, 'fixed')).toBeUndefined()
  })

  it('la proiezione e il fatto sono due numeri diversi in due posti diversi', () => {
    const v = ready({
      expenses: [affitto, caffe],
      rules: [
        makeRule({ startDate: '2026-01-01', amountCents: 50700, categoryId: 'c-casa' }),
        // Una regola nuova, che non ha ancora generato niente: la proiezione la
        // conta, il fatto no.
        makeRule({ startDate: '2026-08-01', amountCents: 3000, categoryId: 'c-cibo' }),
      ],
    })
    expect(v.tiles.fixedMonthlyCents).toBe(53700)
    // Il fatto e' una riga sola — il canone di questa settimana — quindi la
    // sezione non porta un totale e la cifra da confrontare e' la riga. Con un
    // `totale()` a `undefined` la disuguaglianza qui sotto sarebbe vera per
    // assenza invece che per differenza.
    expect(unica(sezione(v, 'fixed')).cents).toBe(50700)
    // Due quantita' legittime e diverse. Con un nome solo, una delle due
    // mentiva: il tasso mensile non e' quello che e' uscito questa settimana.
    expect(v.tiles.fixedMonthlyCents).not.toBe(unica(sezione(v, 'fixed')).cents)
    expect(v.tiles.hasFixed).toBe(true)
  })

  it('una regola disattivata dopo aver generato la spesa: il fatto resta in A, la scheda tace', () => {
    const v = ready({
      expenses: [affitto, caffe],
      // Disattivare e' **quello che l'app consiglia** quando una regola ha gia'
      // generato spese: `toast.ruleInUse` dice "si puo' solo disattivare".
      rules: [makeRule({ startDate: '2026-01-01', amountCents: 50700, active: false })],
    })
    // Non c'e' nessun tasso mensile: le regole in vigore sono zero. La scheda
    // e' quella cifra, quindi non si mostra — se `hasFixed` tornasse a
    // comprendere "c'e' una sezione di fisse", questo test stamperebbe
    // **"Spese fisse / 0,00 € / ogni mese"** in cifre grandi.
    expect(v.tiles.fixedMonthlyCents).toBe(0)
    expect(v.tiles.hasFixed).toBe(false)
    // E il fatto non si perde: e' in A, sotto un'etichetta che dice un'altra
    // cosa (`stats.fixedInPeriod`, "Fisse in questo periodo"). E' li' che quella
    // cifra ha un invariante — e' la somma delle righe che le stanno sotto —
    // ed e' quell'etichetta a togliere la contraddizione che il disgiunto
    // copriva.
    expect(unica(sezione(v, 'fixed')).cents).toBe(50700)
    expect(unica(sezione(v, 'fixed')).cents).toBe(v.current.recurringSpentCents)
    invariantiDiA(v)
  })

  it('una regola attiva che non ha ancora generato niente basta a parlarne', () => {
    const v = ready({
      expenses: [caffe],
      rules: [makeRule({ startDate: '2026-08-01', amountCents: 3000 })],
    })
    // Il verso opposto: nessuna fissa uscita nel periodo, ma il costo mensile
    // c'e' ed e' il secondo dei due numeri di ADR 016 §3.
    expect(v.current.recurringSpentCents).toBe(0)
    expect(v.tiles.fixedMonthlyCents).toBe(3000)
    expect(v.tiles.hasFixed).toBe(true)
    expect(sezione(v, 'fixed')).toBeUndefined()
  })

  it('una ricorrente da zero centesimi: la sezione c e, la scheda tace, e non si contraddicono', () => {
    const v = ready({
      expenses: [
        caffe,
        makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 0, source: 'recurring' }),
      ],
    })
    // Il caso degenere, ed e' quello da guardare quando il predicato cambia:
    // nessuna regola in vigore, `recurringSpentCents` a zero, e sotto una
    // sezione di fisse con una riga vera.
    expect(v.current.recurringSpentCents).toBe(0)
    expect(sezione(v, 'fixed')?.rows).toHaveLength(1)
    expect(unica(sezione(v, 'fixed')).cents).toBe(0)
    expect(totale(sezione(v, 'fixed'))).toBeUndefined()
    // A schermo: nessuna scheda "Spese fisse", e sotto "Fisse in questo periodo"
    // una riga che dice `0,00 €` — una volta, non due. Sono **un silenzio e un
    // fatto**, non due fatti in disaccordo: la contraddizione di prima nasceva
    // da due etichette uguali sopra due numeri diversi, e le etichette adesso
    // sono due.
    expect(v.tiles.hasFixed).toBe(false)
    expect(v.tiles.fixedMonthlyCents).toBe(0)
    invariantiDiA(v)
  })

  it('il budget non serve per rispondere a C', () => {
    const v = ready({ expenses: [caffe], budgets: [] })
    // E' l'unica delle tre domande a cui l'app risponde dal primo giorno.
    expect(v.tiles.variableCents).toBe(400)
  })
})

describe('la traccia esiste solo dove il confronto ha una risposta', () => {
  const spesa = makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 4000 })
  /**
   * Una spesa nella settimana prima. Non entra in nessuna delle asserzioni:
   * serve perche' **B esista**, visto che sotto `TREND_MIN_ROWS` non c'e'
   * nessuna riga da cui leggere una traccia. Vale poco (5,00 €) e non tocca la
   * scala, che qui la fa il budget.
   */
  const settimanaPrima = makeExpense({
    date: '2026-08-19',
    categoryId: 'c-cibo',
    amountCents: 500,
  })

  it('con un budget che copre tutto il periodo la traccia c e', () => {
    const v = ready({
      expenses: [spesa, settimanaPrima],
      budgets: [makeBudget({ period: 'weekly', effectiveFrom: '2026-08-01', amountCents: 20000 })],
    })
    const corrente = v.byPeriod.rows.find((r) => r.current)!
    expect(corrente.track).not.toBeNull()
    // Il budget satura la scala (200,00 contro 40,00 spesi).
    expect(corrente.track?.fraction).toBe(1)
    // La barra e la traccia stanno nella stessa mappa, quindi la differenza fra
    // le due lunghezze e' quella fra gli importi: se una sola delle due portasse
    // il pavimento, questa cade — e sarebbe una barra che supera la propria
    // traccia stando esattamente sul budget.
    expect(corrente.track!.fraction - corrente.fraction).toBeCloseTo(
      (1 - BAR_MIN_FRACTION) * (16000 / 20000),
      10,
    )
    // Mercoledi: 3 giorni su 7 vissuti, oggi compreso. Il maturato e' il punto a
    // cui arriverebbe una barra da 85,71 € — non i 3/7 di una lunghezza gia'
    // traslata, che cadrebbero fino a `MIN * 4/7` di colonna prima del dovuto.
    expect(corrente.track?.accruedFraction).toBeCloseTo(
      BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * (3 / 7),
      10,
    )
    // La lettura che quel segno serve a permettere: 40,00 speso contro 85,71
    // maturato, cioe' sotto il passo. E' un confronto fra lunghezze, e vale
    // perche' le due lunghezze vengono dalla stessa mappa.
    expect(corrente.fraction).toBeLessThan(corrente.track!.accruedFraction)
  })

  it('su un periodo chiuso non resta niente da disegnare come non accaduto', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: '2026-08-19', categoryId: 'c-cibo', amountCents: 4000 }),
        spesa,
      ],
      budgets: [makeBudget({ period: 'weekly', effectiveFrom: '2026-08-01', amountCents: 20000 })],
    })
    const passato = v.byPeriod.rows.find((r) => !r.current)!
    // Se `daysLived` contasse i giorni finiti invece dei vissuti, qui sarebbe
    // 6/7 e la settimana scorsa risulterebbe eternamente incompleta. La parte
    // non accaduta e' `[accruedFraction, fraction]`, e qui e' larga zero.
    expect(passato.track?.accruedFraction).toBe(passato.track?.fraction)
  })

  it('con un budget nato dentro il periodo la traccia non c e', () => {
    const v = ready({
      expenses: [spesa, settimanaPrima],
      budgets: [makeBudget({ period: 'weekly', effectiveFrom: '2026-08-26', amountCents: 20000 })],
    })
    const corrente = v.byPeriod.rows.find((r) => r.current)
    // La riga c'e' davvero: senza questa, `find` tornerebbe `undefined` e
    // `toBeNull()` fallirebbe invece di passare — ma il verso opposto, cioe' un
    // `?.` che rende verde una riga assente, e' l'errore che qui va escluso.
    expect(corrente).toBeDefined()
    // Il budget si risolve (200) e la traccia comunque non si disegna: e' la
    // differenza fra "c'e' un budget" e "il confronto ha una risposta".
    expect(corrente?.track).toBeNull()
  })
})

/*
 * **Il budget piu' giovane dei dati**, che e' il caso reale e non un caso
 * limite: si installa l'app, si segna qualche giorno, e il budget si mette dopo.
 *
 * Sta in un `describe` suo perche' fino a ieri **nessun test lo esercitava**:
 * tutte le fixture avevano un `effectiveFrom` piu' vecchio di ogni spesa, quindi
 * `comparableToBudget` era sempre vero e il ramo della **barra nuda** — la
 * geometria che dichiara l'assenza del confronto — non era mai stato eseguito.
 * Un ramo mai eseguito non e' coperto da nessuna delle asserzioni che lo
 * nominano.
 */
describe('un budget piu giovane dei dati', () => {
  /** Creato domenica 23, a settimana 17–23 gia' cominciata. */
  const BUDGET = makeBudget({ period: 'weekly', effectiveFrom: '2026-08-23', amountCents: 20000 })
  const SPESE: readonly Expense[] = [
    makeExpense({ date: '2026-08-19', categoryId: 'c-cibo', amountCents: 6000 }),
    makeExpense({ date: '2026-08-26', categoryId: 'c-spesa', amountCents: 4000 }),
  ]

  it('la settimana in cui e nato non ha traccia, quella dopo si — nella stessa vista', () => {
    const v = ready({ expenses: SPESE, budgets: [BUDGET] })
    const rows = v.byPeriod.rows
    expect(rows.map((r) => r.range.start)).toEqual(['2026-08-17', '2026-08-24'])
    // 17–23: il budget copriva **un giorno su sette**. Una barra da 60,00 su una
    // traccia da 200,00 leggerebbe "sei stato bravo", e non e' una lettura
    // sbagliata del grafico: e' il grafico che afferma una cosa che i dati non
    // sostengono.
    expect(rows[0]?.track).toBeNull()
    expect(rows[0]?.cents).toBe(6000)
    // 24–30: lo stesso identico record copre tutti e sette i giorni.
    expect(rows[1]?.track).not.toBeNull()
    expect(rows[1]?.track?.fraction).toBe(1)
  })

  it('e non e che il budget manchi: manca la risposta', () => {
    // La domenica in cui e' nato, il budget si risolve — la Home ci fa i suoi
    // numeri sopra — e il confronto fra periodi comunque non ha una risposta.
    // Se il ramo guardasse `budgetCents !== null` invece di
    // `comparableToBudget`, la barra nuda non esisterebbe e questo test
    // fallirebbe **e** quello sopra.
    //
    // La spesa del 12 non e' del caso: e' li' perche' guardando la schermata di
    // **domenica 23** la settimana 24–30 non e' ancora cominciata, quindi senza
    // di lei B avrebbe una riga sola e non ci sarebbe nessuna riga corrente da
    // interrogare — il test passerebbe leggendo `undefined?.track`.
    const domenica = ready({
      expenses: [makeExpense({ date: '2026-08-12', categoryId: 'c-cibo', amountCents: 1000 }), ...SPESE],
      budgets: [BUDGET],
      day: '2026-08-23',
    })
    expect(domenica.current.budgetCents).toBe(20000)
    expect(domenica.current.comparableToBudget).toBe(false)
    const corrente = domenica.byPeriod.rows.find((r) => r.current)
    expect(corrente).toBeDefined()
    expect(corrente?.track).toBeNull()
  })

  it('la barra nuda resta in scala con le altre: e l assenza del confronto, non del dato', () => {
    const v = ready({ expenses: SPESE, budgets: [BUDGET] })
    const [prima, dopo] = v.byPeriod.rows
    // La scala di B e' una sola e comprende il budget delle righe confrontabili
    // (200,00), quindi 60,00 e 40,00 stanno sulla stessa scala e la loro
    // differenza e' quella degli importi. Senza traccia si perde il verdetto,
    // non la lunghezza.
    expect((prima?.fraction ?? 0) - (dopo?.fraction ?? 0)).toBeCloseTo(
      (1 - BAR_MIN_FRACTION) * (2000 / 20000),
      10,
    )
    expect(prima?.fraction).toBeGreaterThanOrEqual(BAR_MIN_FRACTION)
    invariantiDiA(v)
  })
})
