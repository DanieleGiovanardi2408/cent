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
import type {
  BreakdownKind,
  BreakdownSection,
  CategorySlice,
  PeriodBar,
  StatsInput,
  Trend,
} from './stats-view'

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

/**
 * `showFixed: true` e' il valore con cui l'app apre la schermata (decisione 0c:
 * **acceso di default**), quindi e' il valore su cui gira quasi tutta la suite.
 * I casi che lo spengono lo dicono, e sono pochi apposta: uno stato che si
 * raggiunge con un tap non deve diventare la premessa implicita di un test che
 * parla d'altro.
 */
function view(over: Partial<StatsInput>) {
  return statsView({
    expenses: [],
    categories: CATS,
    rules: [] as readonly RecurringRule[],
    budgets: [] as readonly Budget[],
    period: 'weekly',
    day: OGGI,
    showFixed: true,
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
 * B **quando c'e'**, e fallisce dove non c'e'.
 *
 * Non e' una comodita' per accorciare: `byPeriod` e' `Trend | null`, e un test
 * che leggesse `v.byPeriod?.current` sarebbe verde anche sulla schermata in cui
 * la sezione non esiste affatto — cioe' verde per il motivo sbagliato, che e'
 * esattamente la malattia per cui questa forma e' nata. Dove il caso *e'*
 * l'assenza, si asserisce `toBeNull()` e basta.
 */
function periodi(v: Ready): Trend {
  const { byPeriod } = v
  if (byPeriod === null) throw new Error('attesa la sezione dei periodi')
  return byPeriod
}

/**
 * Tutte le righe di B — le chiuse e quella di oggi — nell'ordine in cui vanno a
 * schermo.
 *
 * **Si usa solo per le affermazioni universali**: *"nessuna riga ha una
 * traccia"*, *"il passo e' lo stesso ovunque"*, *"la piu' alta non e' quella di
 * oggi"*. L'identita' della riga corrente si legge da `Trend.current` e **mai**
 * da una posizione qui dentro: rimettere le righe in un array per poi
 * interrogarne l'ultima sarebbe ricostruire a mano la confusione che il tipo ha
 * appena reso inesprimibile, ed e' gia' successo una volta: ventotto test del
 * componente restavano verdi sostituendo `row.current` con
 * `index === rows.length - 1` (la misura sta in `docs/DEBITO.md`).
 */
function tutteLeRighe(t: Trend): readonly PeriodBar[] {
  return [...t.closed, t.current]
}

/**
 * **Gli invarianti di A**, e si asseriscono invece di sperarci. Ognuno e' una
 * promessa che il componente usa senza poterla verificare:
 *
 * 1. **le righe spiegano il totale della propria sezione**, e i due totali
 *    vengono dalle metriche — non da una seconda somma che un giorno divergera'.
 *    Sono le due identita' `somma(Fisse) === recurringSpentCents` e
 *    `somma(Variabili) === spentCents`. Il totale **dichiarato** c'e' se e solo
 *    se le righe sono piu' di una: con una sola sarebbe la cifra della riga,
 *    scritta una seconda volta sullo stesso bordo destro;
 * 2. **in ogni sezione la barra piu' lunga arriva a fondo colonna, e la sezione
 *    dichiara quanto vale.** Sono due asserzioni accoppiate e non una:
 *    `scaleCents` e' l'importo della riga piu' grande, **e** quella riga ha
 *    frazione 1. La prima da sola lascerebbe passare un numero scritto accanto a
 *    lunghezze calcolate su un'altra scala; la seconda da sola e' la geometria,
 *    che — e' la lezione di 0a rovesciata — non dichiara niente: due barre piene
 *    accanto a `507,00 €` e `42,00 €` dicono che qualcosa non torna, non cosa;
 * 3. **`asChart` e' deciso sull'insieme delle righe visibili**, non per sezione:
 *    la soglia per sezione era la causa misurata del peso visivo inverso agli
 *    importi;
 * 4. **`split` c'e' se e solo se tutte e due le meta' sono maggiori di zero**, e
 *    i suoi due importi sono i due totali del periodo. La divisione di una cosa
 *    sola non e' una divisione;
 * 5. **nessuna lunghezza sta fra zero e il pavimento.** E' la promessa che
 *    toglie al CSS ogni ragione di correggere una larghezza.
 *
 * Si chiamano su **tutte** le fixture, orfane e dati ostili compresi: un
 * invariante provato sul caso comodo e' un commento.
 *
 * `mostraFisse` non e' una comodita': con il selettore spento la sezione delle
 * fisse **non c'e'**, quindi l'identita' 1 su `recurringSpentCents` parlerebbe di
 * righe che nessuno ha chiesto di vedere. Le altre valgono identiche, `split`
 * compreso — ed e' proprio quello il punto di `split`.
 */
function invariantiDiA(v: Ready, mostraFisse = true) {
  const fisse = sezione(v, 'fixed')
  const variabili = sezione(v, 'variable')

  if (mostraFisse) {
    expect(sumCents((fisse?.rows ?? []).map((r) => r.cents))).toBe(v.current.recurringSpentCents)
    if (fisse !== undefined && !fisse.single) {
      expect(fisse.totalCents).toBe(v.current.recurringSpentCents)
    }
  } else {
    // Spente, non svuotate: la sezione non esiste, e non e' una sezione con zero
    // righe. La cifra che portava non e' persa — sta in `split`.
    expect(fisse).toBeUndefined()
  }
  expect(sumCents((variabili?.rows ?? []).map((r) => r.cents))).toBe(v.current.spentCents)
  if (variabili !== undefined && !variabili.single) {
    expect(variabili.totalCents).toBe(v.current.spentCents)
  }

  const tutte = v.byCategory.sections.flatMap((s) => s.rows)
  // La soglia guarda cio' che si vede, **tutto insieme**. E' l'unica delle due
  // regole per sezione che non e' tornata con 0a, e la ragione e' che era la
  // causa misurata del difetto: l'argomento sta su `BREAKDOWN_MIN_ROWS`.
  expect(v.byCategory.asChart).toBe(tutte.length >= BREAKDOWN_MIN_ROWS)

  const { split } = v.byCategory
  const fisseCents = v.current.recurringSpentCents
  const variabiliCents = v.current.spentCents
  if (fisseCents > 0 && variabiliCents > 0) {
    expect(split).not.toBeNull()
    expect(split?.fixedCents).toBe(fisseCents)
    expect(split?.variableCents).toBe(variabiliCents)
    // Una meta' sola: l'altra e' `1 - questa`, e non c'e' modo di scriverle in
    // disaccordo. E sta in `[0,1]` perche' e' una quota di una somma di addendi
    // non negativi, non perche' qualcuno la ritagli.
    expect(split?.fixedFraction).toBeCloseTo(fisseCents / (fisseCents + variabiliCents), 12)
    expect(split!.fixedFraction).toBeGreaterThan(0)
    expect(split!.fixedFraction).toBeLessThan(1)
  } else {
    expect(split).toBeNull()
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
    // Dalla piu' grande, sempre — dentro la sezione.
    expect(importi).toEqual([...importi].sort((a, b) => b - a))
    // **La scala e' della sezione, e la sezione la dichiara**: le due meta' si
    // asseriscono insieme, perche' ognuna da sola lascia passare l'altra
    // sbagliata. Con tutte le righe a zero `scaleCents` vale 0 e nessuna barra si
    // disegna — non e' un'ipotesi: la ricorrente da zero centesimi ci arriva.
    const massimo = Math.max(0, ...importi)
    expect(s.scaleCents).toBe(massimo)
    for (const r of s.rows) expect(r.fraction === 1).toBe(massimo > 0 && r.cents === massimo)
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
    const b = periodi(v)
    expect(b.closed.map((r) => r.range.start)).toEqual(['2026-08-10', '2026-08-17'])
    expect(b.current.range.start).toBe('2026-08-24')
    // **Zero speso nel periodo corrente**, letto dal campo che dice "corrente".
    // Qui c'era `rows[2]`, cioe' la terza posizione: la stessa riga, nominata
    // per dove capitava di stare invece che per cio' che e'.
    expect(b.current.cents).toBe(0)
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

  it('la scala e per sezione, e la sezione dichiara quanto vale una barra piena', () => {
    const v = ready({ expenses: spese })
    const fisse = sezione(v, 'fixed')!
    const variabili = sezione(v, 'variable')!
    // **Due barre piene con due importi diversi**: 507,00 e 42,00 arrivano tutte
    // e due a fondo colonna. E' la geometria delle small multiples — colonne
    // diverse, fondo colonna uguale — ed e' anche cio' che la scala unica era
    // venuta a togliere. Si accetta perche' il difetto dell'altra forma e'
    // misurato e piu' grande (tabella in cima a `stats-view.ts`).
    expect(fisse.rows[0]?.cents).toBe(50700)
    expect(fisse.rows[0]?.fraction).toBe(1)
    expect(variabili.rows[0]?.cents).toBe(4200)
    expect(variabili.rows[0]?.fraction).toBe(1)
    // **E questa e' la condizione che le rende accettabili**: quanto vale un
    // fondo colonna e' scritto, non da inferire. Senza queste due cifre le due
    // barre piene qui sopra sono una bugia grafica — dicono che qualcosa non
    // torna, non cosa.
    expect(fisse.scaleCents).toBe(50700)
    expect(variabili.scaleCents).toBe(4200)
    // **Il prezzo della forma precedente, misurato al contrario.** Qui c'era
    // `casaAMano.fraction * 112 < 10` — le sei righe dentro dieci pixel, scritte
    // come prezzo dichiarato della scala unica — e non descrive piu' l'albero:
    // 26,00 su una scala da 42,00 e' piu' di meta' colonna.
    const casaAMano = variabili.rows.find((r) => r.name === 'Casa')
    expect(casaAMano?.cents).toBe(2600)
    expect(casaAMano!.fraction).toBeGreaterThan(0.6)
    expect(casaAMano!.fraction * COLONNA_MIN_PX).toBeGreaterThan(60)
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
    // **La conseguenza dichiarata delle due scale: la riga piu' corta e'
    // disegnata piu' lunga.** 10,00 su una scala da 42,00 batte 23,00 su una da
    // 507,00, ed e' l'unica cosa che la scala unica dava e che qui non c'e'.
    //
    // Non e' la vecchia asserzione rimessa dov'era. Quella si chiamava *"e le due
    // scale lo dichiarano"*, e la geometria non dichiara niente: a dichiararlo e'
    // `scaleCents`, quindi i due fatti si asseriscono **insieme** — la
    // disuguaglianza da sola tornerebbe a essere una deduzione chiesta al lettore.
    expect(variabile!.cents).toBeLessThan(fissa!.cents)
    expect(variabile!.fraction).toBeGreaterThan(fissa!.fraction)
    expect(sezione(v, 'fixed')!.scaleCents).toBe(50700)
    expect(sezione(v, 'variable')!.scaleCents).toBe(4200)
    // E **dentro** la propria sezione la lettura resta esatta: due lunghezze
    // differiscono della differenza dei due importi sulla scala della sezione.
    // E' la meta' che il pavimento lascia esatta, e vale solo qui dentro.
    const spesaVar = sezione(v, 'variable')!.rows.find((r) => r.name === 'Spesa')!
    expect(spesaVar.fraction - variabile!.fraction).toBeCloseTo(
      (1 - BAR_MIN_FRACTION) * (3200 / 4200),
      12,
    )
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

/*
 * **La soglia si applica ad A, non a una sezione**, e questo blocco asseriva
 * l'opposto in ogni riga. Non e' churn: la soglia per sezione era la **causa
 * misurata** del difetto piu' grosso della fase — la sezione che pesava 530,00 €
 * su 642,00 € restava senza barre perche' le sue righe erano due, e la barra piu'
 * lunga della schermata ne valeva 42,00. Il peso visivo era l'inverso degli
 * importi, e nessun gate poteva vederlo perche' ogni regola, presa da sola,
 * faceva il suo mestiere.
 *
 * Quel che la soglia dice resta identico — *"due categorie non sono una
 * ripartizione"* — e cambia solo **su cosa** lo dice: sulle righe a schermo.
 *
 * **E ci resta anche adesso che la scala e' tornata alla sezione (0a).** Le due
 * regole erano simmetriche di forma e non di prove: una delle due ha una misura
 * contro, l'altra no. Rimetterla per sezione insieme alla scala sarebbe la
 * simmetria che ricostruisce l'incrocio da cui e' nata tutta questa fase.
 */
describe('la soglia del grafico vale sull insieme delle righe visibili', () => {
  const tre: readonly Expense[] = [
    makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 4000 }),
    makeExpense({ date: OGGI, categoryId: 'c-spesa', amountCents: 2000 }),
    makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 1000 }),
  ]
  const dueFisse: readonly Expense[] = [
    makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 9000, source: 'recurring' }),
    makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 50000, source: 'recurring' }),
  ]

  it('due fisse non perdono le barre perche sono due: A ne ha cinque', () => {
    const v = ready({ expenses: [...dueFisse, ...tre] })
    // Qui c'era `asChart: false` sulle fisse, con accanto la ragione per cui
    // andava bene: ogni sezione fa la propria domanda, quindi ha il proprio
    // minimo. **La ragione contro non e' che la scala sia una** — non lo e' piu' —
    // e' che quella forma lasciava senza barre la meta' che pesava 530,00 € su
    // 642,00 €. `asChart` non chiede quanto e' lunga una barra: chiede se su
    // questo schermo c'e' una ripartizione da leggere, e cinque righe lo sono.
    expect(sezione(v, 'fixed')?.rows).toHaveLength(2)
    expect(sezione(v, 'variable')?.rows).toHaveLength(BREAKDOWN_MIN_ROWS)
    expect(v.byCategory.asChart).toBe(true)
    // E la riga da 500,00 € ha la barra che le tocca: e' la piu' grande della sua
    // sezione, e la sezione dichiara che il fondo colonna vale 500,00 €.
    expect(sezione(v, 'fixed')?.rows[0]?.cents).toBe(50000)
    expect(sezione(v, 'fixed')?.rows[0]?.fraction).toBe(1)
    expect(sezione(v, 'fixed')?.scaleCents).toBe(50000)
    invariantiDiA(v)
  })

  it('e vale anche a parti invertite: due variabili sotto tre fisse tengono le barre', () => {
    const v = ready({
      expenses: [
        ...tre.map((e) => ({ ...e, source: 'recurring' as const })),
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 700 }),
        makeExpense({ date: OGGI, categoryId: 'c-spesa', amountCents: 300 }),
      ],
    })
    expect(sezione(v, 'variable')?.rows).toHaveLength(2)
    expect(v.byCategory.asChart).toBe(true)
    invariantiDiA(v)
  })

  it('con due righe in tutto A non e un grafico, e le due sezioni non ne fanno tre', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 50000, source: 'recurring' }),
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 4000 }),
      ],
    })
    // La soglia non e' sparita insieme alla sua versione per sezione: due
    // categorie non sono una ripartizione, e due intestazioni sopra due righe non
    // ne fanno diventare tre. E' anche il caso piu' comune del primo giorno —
    // l'affitto e un caffe'.
    expect(v.byCategory.sections).toHaveLength(2)
    expect(v.byCategory.asChart).toBe(false)
    // Due categorie non sono una ripartizione, ma **due periodi sono** un
    // confronto: se le due soglie fossero un numero solo, uno dei due test
    // sulle soglie cadrebbe.
    expect(BREAKDOWN_MIN_ROWS).toBeGreaterThan(TREND_MIN_ROWS)
    invariantiDiA(v)
  })

  it('le righe restano anche dove le barre non ci sono', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 50000, source: 'recurring' }),
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 4000 }),
      ],
    })
    // Sotto la soglia si legge nome e importo: la riga non sparisce, o il
    // totale della sezione smetterebbe di essere la somma di cio' che si vede.
    // **E le lunghezze restano calcolate**: `asChart` dice al componente di non
    // dipingerle, non a questo modulo di non produrle — sono la stessa cosa a
    // schermo e due cose diverse nei test, e la seconda e' quella che permette a
    // un solo campo di governare la forma.
    expect(unica(sezione(v, 'fixed')).cents).toBe(50000)
    expect(unica(sezione(v, 'fixed')).fraction).toBe(1)
    expect(unica(sezione(v, 'variable')).cents).toBe(4000)
  })
})

/*
 * **0a, detta come proprieta' invece che come implementazione.**
 *
 * Un test che asserisse `fraction === cents / scaleCents` ricopierebbe la
 * formula: sarebbe verde anche riscrivendo il modulo con lo stesso errore. Questi
 * asseriscono cose che si vedono a schermo, e cadono se qualcuno rimette una
 * scala sola per tutta A.
 *
 * **La decisione e' stata presa, rovesciata e ripresa in due giorni**, quindi qui
 * non basta provare cio' che vale: accanto va scritto **perche' l'altra forma e'
 * stata lasciata**, o il prossimo giro riparte dalle stesse buone intenzioni. Il
 * criterio che ha deciso e' *un difetto misurato batte un difetto ipotizzato*, e
 * il difetto misurato era la scala unica: sull'export vero, a 390 punti, Svago e
 * Coffeeshop distavano 0,75 px e Coffeeshop e Trasporti 0,37.
 *
 * E cio' che questa forma **costa** e' asserito qui dentro come le altre cose:
 * due righe di sezioni diverse non sono confrontabili, e la piu' piccola puo'
 * essere disegnata piu' lunga.
 */
describe('0a — la scala e della sezione, e la sezione la dichiara', () => {
  /*
   * I due 26,00 sono la coppia che decide: uno fisso e uno variabile, e
   * **nessuno dei due e' il piu' grande della propria sezione**. Se lo fossero
   * varrebbero 1 tutti e due anche con una scala sola, e il test passerebbe per
   * il motivo sbagliato.
   */
  const coppia: readonly Expense[] = [
    makeExpense({ date: '2026-08-24', categoryId: 'c-casa', amountCents: 90000, source: 'recurring' }),
    makeExpense({ date: '2026-08-25', categoryId: 'c-cibo', amountCents: 2600, source: 'recurring' }),
    makeExpense({ date: '2026-08-25', categoryId: 'c-spesa', amountCents: 4200 }),
    makeExpense({ date: '2026-08-26', categoryId: 'c-casa', amountCents: 2600 }),
  ]

  it('due righe di sezioni diverse con lo stesso importo hanno lunghezze diverse', () => {
    const v = ready({ expenses: coppia })
    const fissa = sezione(v, 'fixed')!.rows.find((r) => r.cents === 2600)!
    const variabile = sezione(v, 'variable')!.rows.find((r) => r.cents === 2600)!
    // 2600/90000 di qua, 2600/4200 di la': 0,046 contro 0,62, cioe' 5 px contro
    // 70 sulla colonna piu' stretta. **E' il costo della decisione**, e si
    // asserisce invece di lasciarlo scoprire allo schermo — qui c'era
    // l'asserzione opposta, `fissa.fraction === variabile.fraction`, con scritto
    // accanto che era l'unica cosa che una barra dovrebbe dire.
    expect(fissa.cents).toBe(variabile.cents)
    expect(variabile.fraction).toBeGreaterThan(fissa.fraction)
    // E cio' che lo rende leggibile e' che le due scale sono **scritte**: due
    // lunghezze diverse per lo stesso importo, da sole, dicono che qualcosa non
    // torna e non cosa.
    expect(sezione(v, 'fixed')!.scaleCents).toBe(90000)
    expect(sezione(v, 'variable')!.scaleCents).toBe(4200)
    invariantiDiA(v)
  })

  it('in ogni sezione con una riga sopra zero la barra piu lunga arriva a fondo colonna', () => {
    const v = ready({ expenses: coppia })
    // L'invariante che torna, e torna **per sezione**. Con la scala unica qui
    // 42,00 valeva 0,064 — 7,1 px sulla colonna piu' stretta: la colonna delle
    // quotidiane non aveva nessuna barra che toccasse il fondo e restava vuota
    // per il 94%.
    expect(sezione(v, 'variable')!.rows[0]?.cents).toBe(4200)
    expect(sezione(v, 'variable')!.rows[0]?.fraction).toBe(1)
    expect(sezione(v, 'fixed')!.rows[0]?.fraction).toBe(1)
    for (const s of v.byCategory.sections) {
      expect(Math.max(...s.rows.map((r) => r.fraction))).toBe(1)
    }
  })

  it('scaleCents e l importo della riga piu grande, e cambia quando cambia quella riga', () => {
    const prima = ready({ expenses: coppia })
    expect(sezione(prima, 'variable')!.scaleCents).toBe(4200)
    // Una spesa piu' grande della piu' grande: la scala si sposta, e con lei
    // tutte le lunghezze della sezione. Un `scaleCents` costante sarebbe un
    // numero scritto accanto a barre che non lo usano — cioe' la dichiarazione
    // che questo campo esiste per fare, fatta male.
    const dopo = ready({
      expenses: [...coppia, makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 8400 })],
    })
    expect(sezione(dopo, 'variable')!.scaleCents).toBe(8400)
    const spesa = sezione(dopo, 'variable')!.rows.find((r) => r.name === 'Spesa')!
    expect(spesa.cents).toBe(4200)
    expect(spesa.fraction).toBeCloseTo(BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * 0.5, 12)
    // E la sezione delle fisse non se n'e' accorta: sono due scale, non una
    // scala e una sua conseguenza.
    expect(sezione(dopo, 'fixed')!.scaleCents).toBe(90000)
    invariantiDiA(dopo)
  })

  it('spegnere le fisse non cambia la scala della sezione variabile', () => {
    const con = ready({ expenses: coppia })
    const senza = ready({ expenses: coppia, showFixed: false })
    // **La prova che il selettore non e' piu' quello che era.** Con la scala
    // unica questa asserzione era falsa per costruzione — nascondere l'affitto
    // ricalcolava la scala e le righe rimaste cambiavano lunghezza, e quello era
    // *"l'unica cosa che il selettore fa di utile"*. Adesso la sezione variabile
    // ha la propria scala e le fisse non ci sono mai state dentro.
    expect(sezione(senza, 'variable')!.scaleCents).toBe(sezione(con, 'variable')!.scaleCents)
    expect(sezione(senza, 'variable')!.rows.map((r) => r.fraction)).toEqual(
      sezione(con, 'variable')!.rows.map((r) => r.fraction),
    )
    invariantiDiA(senza, false)
  })

  it('a pari importo massimo, dentro una sezione, le barre piene sono due', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 5000 }),
        makeExpense({ date: OGGI, categoryId: 'c-spesa', amountCents: 5000 }),
        makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 1000 }),
      ],
    })
    const rows = sezione(v, 'variable')!.rows
    // Il caso che rende non-banale l'invariante scritto come `fraction === 1 se e
    // solo se cents === scaleCents`: due barre piene nella **stessa** colonna non
    // dicono niente sulle scale, dicono che i due importi sono uguali.
    expect(rows[0]?.fraction).toBe(1)
    expect(rows[1]?.fraction).toBe(1)
    expect(rows[2]?.fraction).toBeLessThan(1)
    expect(sezione(v, 'variable')!.scaleCents).toBe(5000)
    invariantiDiA(v)
  })
})

/*
 * **0c — il selettore delle fisse, e cosa gli e' rimasto da fare.**
 *
 * Questo blocco diceva che il selettore **non e' un filtro**, perche' ricalcolava
 * la scala. Con la scala tornata alla sezione (0a) quell'affermazione e' falsa:
 * toglie righe e non tocca nessuna lunghezza. Gli restano due effetti, e uno solo
 * dei due giustifica ancora `showFixed` come ingresso del modello —
 * `Breakdown.asChart`, che si decide sull'insieme delle righe a schermo.
 *
 * Il resto del blocco non e' cambiato, e non e' una svista: sono i vincoli che il
 * selettore deve rispettare **qualunque cosa faccia** — `split` che resta, B che
 * non lo guarda, il vicolo cieco di `outside` che non si riapre.
 */
describe('0c — spegnere le fisse toglie righe, e non tocca le lunghezze', () => {
  const spese: readonly Expense[] = [
    makeExpense({ date: '2026-08-24', categoryId: 'c-casa', amountCents: 90000, source: 'recurring' }),
    makeExpense({ date: '2026-08-25', categoryId: 'c-spesa', amountCents: 4200 }),
    makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 2600 }),
  ]

  it('le righe rimaste sono le stesse, con gli stessi importi', () => {
    const con = sezione(ready({ expenses: spese }), 'variable')!
    const senza = ready({ expenses: spese, showFixed: false })
    // Resta una sezione sola, e non una vuota: la sezione delle fisse **non
    // c'e'**, esattamente come quando nel periodo non ne e' uscita nessuna. La
    // differenza fra i due vuoti non sta qui — sta in `split`, che nel primo caso
    // resta e nel secondo e' `null`.
    expect(senza.byCategory.sections.map((s) => s.kind)).toEqual(['variable'])
    expect(sezione(senza, 'variable')!.rows.map((r) => r.cents)).toEqual(
      con.rows.map((r) => r.cents),
    )
    expect(sezione(senza, 'variable')!.rows.map((r) => r.name)).toEqual(con.rows.map((r) => r.name))
  })

  it('le righe rimaste non cambiano di lunghezza, e prima cambiavano', () => {
    const con = sezione(ready({ expenses: spese }), 'variable')!
    const senza = sezione(ready({ expenses: spese, showFixed: false }), 'variable')!
    // **Questa asserzione e' l'opposto di quella che stava qui**, e l'opposto era
    // l'intera ragione per cui `showFixed` era finito nel modello: con la scala
    // unica `con.rows[0]` valeva 4200/90000 e `senza.rows[0]` valeva 1, cioe' da
    // 7,1 px a 112, e la riga da 26,00 passava da 5,2 px a 70,1. Con la scala per
    // sezione le quotidiane si misurano contro
    // 42,00 **anche a fisse accese**: il tap non ha piu' niente da restituire,
    // perche' e' gia' tutto li'.
    expect(con.rows[0]?.fraction).toBe(1)
    expect(con.scaleCents).toBe(4200)
    expect(senza.scaleCents).toBe(con.scaleCents)
    expect(senza.rows.map((r) => r.fraction)).toEqual(con.rows.map((r) => r.fraction))
    // La misura da cui erano nate le due scale, sulla colonna piu' stretta e
    // senza toccare niente: 26,00 su 42,00 sono 70,1 px, non 5,2.
    expect(con.rows[1]!.fraction * COLONNA_MIN_PX).toBeGreaterThan(60)
    invariantiDiA(ready({ expenses: spese, showFixed: false }), false)
  })

  it('la proporzione resta: e cio che dice cosa si sta nascondendo', () => {
    const v = ready({ expenses: spese, showFixed: false })
    // ADR 016 §1 vieta di nascondere le fisse; 0c lo ripete perche' un selettore
    // e' esattamente il modo in cui l'esclusione rientrerebbe dalla porta di
    // servizio. `split` e' cio' che lo impedisce: 900,00 € restano scritti anche
    // quando le loro righe non ci sono.
    expect(v.byCategory.sections.map((s) => s.kind)).toEqual(['variable'])
    expect(v.byCategory.split?.fixedCents).toBe(90000)
    expect(v.byCategory.split?.variableCents).toBe(6800)
    expect(v.current.recurringSpentCents).toBe(90000)
  })

  it('la soglia guarda le righe rimaste, ed e cio che tiene il selettore nel modello', () => {
    // Tre righe con le fisse — A e' un grafico — e due senza: due categorie non
    // sono una ripartizione, e non lo diventano perche' prima ce n'erano tre.
    expect(ready({ expenses: spese }).byCategory.asChart).toBe(true)
    expect(ready({ expenses: spese, showFixed: false }).byCategory.asChart).toBe(false)
    // **E' rimasta l'unica cosa che `showFixed` fa e che un filtro in `Stats.tsx`
    // non potrebbe fare**: filtrando a valle, `asChart` resterebbe deciso su tre
    // righe mentre a schermo ne restano due, cioe' due barre disegnate sotto la
    // soglia che dice di non disegnarne. Il test qui sopra prova che le lunghezze
    // non cambiano piu'; questo prova che qualcosa cambia ancora.
  })

  it('B non lo guarda: la traccia del budget e il confronto che esclude le fisse', () => {
    const conStorico: readonly Expense[] = [
      ...spese,
      makeExpense({ date: '2026-08-17', categoryId: 'c-spesa', amountCents: 7000 }),
    ]
    const con = ready({ expenses: conStorico })
    const senza = ready({ expenses: conStorico, showFixed: false })
    // Byte per byte: se un giorno `showFixed` toccasse B, le barre si
    // misurerebbero contro una traccia che le fisse non comprende — due unita' di
    // misura sullo stesso asse, che e' il difetto per cui ADR 016 esiste.
    expect(senza.byPeriod).toEqual(con.byPeriod)
    // E c'e' qualcosa da confrontare byte per byte: senza questa, due `null`
    // uguali sarebbero un test verde su una sezione che non esiste.
    expect(periodi(con).closed.length).toBeGreaterThan(0)
  })

  it('spegnendo le fisse in un periodo di sole fisse la schermata resta ready', () => {
    const v = view({
      expenses: [
        makeExpense({ date: '2026-08-25', categoryId: 'c-casa', amountCents: 90000, source: 'recurring' }),
      ],
      showFixed: false,
    })
    // **Il vicolo cieco che questo test tiene chiuso.** `outside` non porta ne'
    // sezioni ne' `split`, quindi non ha niente su cui appendere il selettore:
    // arrivandoci con le fisse spente, l'utente resterebbe chiuso fuori dai propri
    // dati con l'unico interruttore che li riaccende dentro il ramo che non si
    // disegna. Un controllo che puo' cancellare se stesso non e' un controllo.
    //
    // E prima ancora sarebbe una frase falsa: `outside` dice *"niente cade dove
    // questa schermata guarda"*, e li' cadono 900,00 €.
    expect(v.kind).toBe('ready')
    if (v.kind !== 'ready') return
    expect(v.byCategory.sections).toHaveLength(0)
    // A e' vuota **e non c'e' niente da dividere**: `split` non e' il rimedio a
    // questo stato, e il modello non finge che lo sia. Cosa si scrive sopra
    // un'unica sezione nascosta e' del componente, che ha il dizionario — qui c'e'
    // il fatto che ci sia un posto dove scriverlo.
    expect(v.byCategory.split).toBeNull()
    invariantiDiA(v, false)
  })

  it('accese, la schermata di prima e la stessa di sempre', () => {
    // La controprova del test qui sopra: non e' `outside` perche' le fisse ci
    // sono, non perche' `outside` sia sparito. Gli altri suoi casi hanno i loro
    // test, e sono rimasti verdi.
    const v = ready({
      expenses: [
        makeExpense({ date: '2026-08-25', categoryId: 'c-casa', amountCents: 90000, source: 'recurring' }),
      ],
    })
    expect(unica(sezione(v, 'fixed')).cents).toBe(90000)
    expect(v.byCategory.split).toBeNull()
  })
})

/*
 * **0b — la proporzione in cima**, cioe' il posto in cui il fatto dominante e'
 * scritto invece che dedotto da una lunghezza. Qui si prova che i due importi
 * sono i due totali del periodo, che la quota e' una sola, e che dove non c'e'
 * niente da dividere non c'e' nemmeno l'oggetto.
 */
describe('0b — la barra divisa', () => {
  it('i due importi sono i due totali del periodo, e la quota e la loro proporzione', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: '2026-08-24', categoryId: 'c-casa', amountCents: 60000, source: 'recurring' }),
        makeExpense({ date: '2026-08-25', categoryId: 'c-spesa', amountCents: 30000 }),
        makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 10000 }),
      ],
    })
    const split = v.byCategory.split!
    expect(split.fixedCents).toBe(60000)
    expect(split.variableCents).toBe(40000)
    expect(split.fixedCents + split.variableCents).toBe(
      v.current.recurringSpentCents + v.current.spentCents,
    )
    expect(split.fixedFraction).toBeCloseTo(0.6, 12)
    // **Una quota sola.** L'altra meta' e' `1 - questa`: due numeri scritti
    // accanto sarebbero uno stato che si puo' scrivere in disaccordo, e due
    // segmenti che non chiudono a 1 e' un difetto che si vede solo su certi dati.
    expect(1 - split.fixedFraction).toBeCloseTo(0.4, 12)
    // E i due importi non sono una seconda somma: sono le stesse cifre dei totali
    // di sezione, quindi non possono divergere da cio' che sta scritto sotto.
    expect(split.fixedCents).toBe(v.current.recurringSpentCents)
    expect(split.variableCents).toBe(v.current.spentCents)
    invariantiDiA(v)
  })

  it('senza fisse non c e niente da dividere', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: OGGI, categoryId: 'c-spesa', amountCents: 3000 }),
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 1000 }),
      ],
    })
    // Un cerchio pieno con una legenda a due voci di cui una a `0,00 €` afferma
    // *"ecco come si divide"* dove non c'e' niente da dividere. E' la stessa
    // forma per cui la sezione con una riga sola non porta un totale.
    expect(v.byCategory.split).toBeNull()
    expect(v.current.recurringSpentCents).toBe(0)
    invariantiDiA(v)
  })

  it('e vale anche dall altra parte: sole fisse, nessuna divisione', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: '2026-08-24', categoryId: 'c-casa', amountCents: 90000, source: 'recurring' }),
        makeExpense({ date: '2026-08-25', categoryId: 'c-cibo', amountCents: 2300, source: 'recurring' }),
      ],
    })
    // La condizione non nomina quale delle due meta' e' zero, quindi vale per
    // tutte e due: la settimana in cui e' uscito solo l'affitto e quella in cui
    // non e' uscita nessuna fissa sono lo stesso caso.
    expect(v.byCategory.split).toBeNull()
    expect(totale(sezione(v, 'fixed'))).toBe(92300)
    invariantiDiA(v)
  })

  it('una ricorrente da zero centesimi non e una meta: non c e divisione', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: OGGI, categoryId: 'c-casa', amountCents: 0, source: 'recurring' }),
        makeExpense({ date: OGGI, categoryId: 'c-spesa', amountCents: 3000 }),
      ],
    })
    // Il caso degenere che gia' fa tacere la scheda in testa: una sezione di
    // fisse c'e' e vale `0,00 €`. Una proporzione `0 / 3000` sarebbe un segmento
    // invisibile con un'etichetta a zero — la stessa affermazione senza niente da
    // affermare, e per giunta divisa per un totale che e' tutto dell'altra meta'.
    expect(sezione(v, 'fixed')?.rows).toHaveLength(1)
    expect(v.byCategory.split).toBeNull()
    invariantiDiA(v)
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
    expect(v.current.spentCents).toBe(400)
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
    // piu' lunga smetterebbe di arrivare a fondo colonna — e con lei cadrebbe la
    // sola cosa che, guardando lo schermo, dice dov'e' il fondo della scala.
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
    // Cio' che le distingue li' e' l'importo scritto accanto — **e la sezione**,
    // quando l'affitto e' una ricorrente: le briciole cadono su una scala che non
    // lo contiene e tornano a 31,5 px l'una dall'altra, **senza che l'utente
    // chieda niente**.
    //
    // Qui c'era `showFixed: false`, con scritto che la via d'uscita fosse un tap.
    // Non lo e' piu': basta che l'affitto **sia** una fissa, che e' come stanno le
    // cose nella vita vera. E prima ancora la prova si otteneva cancellando la
    // spesa piu' grande dai dati, che non e' cio' che fa nessuno.
    //
    // Il caso in cui la zona resta larga esiste ancora, ed e' l'affitto pagato a
    // mano — la fixture qui sopra: li' niente lo puo' aprire, ed e' dichiarato
    // sulla costante.
    const affittoFisso = sezione(
      ready({
        expenses: affittoEBriciole.map((e) =>
          e.amountCents === 50700 ? { ...e, source: 'recurring' as const } : e,
        ),
      }),
      'variable',
    )!
    expect(affittoFisso.scaleCents).toBe(900)
    const a = affittoFisso.rows.find((r) => r.cents === 900)!
    const b = affittoFisso.rows.find((r) => r.cents === 750)!
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
    const corrente = periodi(v).current
    // 7000 e non 97000: la barra si legge contro la traccia del budget, e il
    // budget le fisse le esclude. Se entrassero, la settimana del primo
    // sarebbe sempre la piu' lunga di tutte e otto — il difetto per cui ADR
    // 016 esiste.
    expect(corrente.cents).toBe(7000)
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
   * **Identita' con la Home**, non due calcoli confrontati.
   *
   * La portava `tiles.variableCents`, la cifra della scheda "Quotidiane". Quella
   * scheda **e' uscita** — ripeteva il totale di una sezione trenta pixel piu'
   * sotto — e con lei il campo, che il controllo D ha trovato senza lettori nel
   * giro stesso in cui e' rimasto orfano.
   *
   * **Il fatto da difendere non e' cambiato**: la cifra grande della Home e' lo
   * speso *del budget*, e questa schermata deve ripeterla al centesimo. E'
   * cambiato **chi la porta** — adesso il totale della parte variabile di A — e
   * l'asserzione lo segue invece di seguire il campo cancellato. Un'identita' che
   * si riscrive sul numero atteso quando il portatore cambia smette di essere
   * un'identita'.
   */
  it('il totale della parte variabile e esattamente lo speso del periodo', () => {
    const v = ready({ expenses: [...spese, affitto] })
    expect(totale(sezione(v, 'variable'))).toBe(v.current.spentCents)
    expect(v.current.spentCents).toBe(7000)
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
    // rimetterebbero insieme le due nature che A divide. **Il secondo argomento
    // che stava qui e' andato e tornato** — diceva che la riga fusa "non potrebbe
    // stare in nessuna delle due scale": con la scala unica era scaduto, e con la
    // scala di nuovo per sezione e' vero un'altra volta. Resta il **secondo**, e
    // la distinzione conta: se fosse il primo, la riga tornerebbe unica il giorno
    // in cui la scala cambia ancora.
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
    // La soglia conta le righe **visibili**, e l'aggregato delle orfane e' una di
    // quelle: sono spesa vera, e senza di loro il totale non tornerebbe.
    expect(v.byCategory.asChart).toBe(true)
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
    //
    // **E la scala dichiarata vale 0**, che e' il caso limite del campo nuovo:
    // una sezione senza scala non esiste, quindi qui il numero c'e' e dice zero.
    // Verificato invece che assunto — era una delle cose che il brief dava per
    // gia' vere.
    expect(sezione(v, 'variable')!.scaleCents).toBe(0)
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
      showFixed: true,
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
    expect(v.current.spentCents).toBe(5401)
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

  it('un centesimo dentro una sezione da quarantaquattro euro, e novecento nell altra', () => {
    const v = ostile()
    const briciola = sezione(v, 'variable')!.rows.find((r) => r.categoryId === 'h-bricio')!
    // **Il denominatore e' 4400 e non 90000**: la briciola si misura contro la
    // piu' grande della **propria** sezione. Il nome del test e' cambiato due
    // volte insieme al denominatore, ed e' giusto cosi' — dice contro cosa la
    // barra e' misurata, che e' il fatto che il test prova.
    //
    // Il fatto interessante di questa fixture e' adesso un altro: la stessa
    // schermata porta **due scale a quattro ordini di grandezza di distanza**,
    // che e' esattamente il caso per cui `scaleCents` esiste.
    expect(sezione(v, 'variable')!.scaleCents).toBe(4400)
    expect(sezione(v, 'fixed')!.scaleCents).toBe(90000)
    expect(briciola.fraction).toBeGreaterThanOrEqual(BAR_MIN_FRACTION)
    expect(briciola.fraction).toBeCloseTo(
      BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * (1 / 4400),
      12,
    )
    // Prima ancora questa riga asseriva `1 / 90000` per un'altra ragione e si
    // chiamava "resta un centesimo, non un minimo": non poteva cadere, perche' il
    // minimo era nel CSS. Adesso il minimo e' nel modello e si vede: la barra
    // vale il pavimento piu' un pelo, e il pelo e' proporzionale.
    //
    // E resta piu' corta della riga a zero? No: la riga a zero e' **zero**, e
    // questa no. E' la sola discontinuita' della mappa, ed e' voluta.
    const zero = sezione(v, 'variable')!.rows.find((r) => r.categoryId === 'h-zero')!
    expect(zero.fraction).toBe(0)
    expect(briciola.fraction).toBeGreaterThan(zero.fraction)
  })

  it('la riga che sta in tutte e due non si somma, e senza le due scale scritte non si spiega', () => {
    const v = ostile()
    const fissa = sezione(v, 'fixed')!.rows.find((r) => r.categoryId === 'h-trasp')!
    const variabile = sezione(v, 'variable')!.rows.find((r) => r.categoryId === 'h-trasp')!
    expect(fissa.cents).toBe(2300)
    expect(variabile.cents).toBe(1000)
    // 23,00 su una scala da 900,00 e' piu' corta di 10,00 su una da 44,00: la
    // stessa categoria, due righe a quaranta pixel di distanza, e la piu' piccola
    // piu' lunga. **E' il caso peggiore della decisione 0a**, e sta qui asserito
    // perche' non lo scopra lo schermo — non nascosto dietro un commento che
    // spiega perche' vada bene.
    expect(variabile.fraction).toBeGreaterThan(fissa.fraction)
    // Cio' che lo rende leggibile — l'unica cosa — sono le due scale **scritte**.
    // Qui c'era `piene.map(...)` a provare che la barra piena fosse una sola: era
    // la geometria a fare da dichiarazione, ed e' proprio quello che non basta.
    expect(sezione(v, 'fixed')!.scaleCents).toBe(90000)
    expect(sezione(v, 'variable')!.scaleCents).toBe(4400)
    // Due barre piene, una per colonna: la forma delle small multiples.
    const piene = v.byCategory.sections.flatMap((s) => s.rows).filter((r) => r.fraction === 1)
    expect(piene.map((r) => r.cents)).toEqual([90000, 4400])
  })
})

describe('B — spese si, budget no', () => {
  const spese: readonly Expense[] = [
    makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 4000 }),
    makeExpense({ date: '2026-08-19', categoryId: 'c-spesa', amountCents: 8000 }),
  ]

  it('senza budget nessuna riga ha una traccia', () => {
    const v = ready({ expenses: spese })
    // Qui c'era `expect(rows.length).toBeGreaterThan(0)`, che serviva a non
    // asserire "nessuna traccia" su un elenco vuoto. Adesso lo garantiscono il
    // tipo e `periodi`, che fallisce dove la sezione non c'e': cio' che resta
    // utile e' **quante** sono, che e' un fatto sulla fixture.
    const righe = tutteLeRighe(periodi(v))
    expect(righe).toHaveLength(TREND_MIN_ROWS)
    // Una traccia senza budget sarebbe un tetto da zero euro, cioe' un numero
    // inventato. Se la traccia si disegnasse sempre, questa cade.
    //
    // **Un'affermazione universale**, quindi le righe si guardano tutte insieme:
    // la riga di oggi non e' un caso a parte, ed e' proprio quella su cui una
    // traccia inventata si vedrebbe per prima.
    expect(righe.every((row) => row.track === null)).toBe(true)
  })

  it('le lunghezze restano confrontabili anche senza traccia', () => {
    const v = ready({ expenses: spese })
    const { closed, current: corrente } = periodi(v)
    // "Non corrente e con qualcosa dentro" era un filtro su un campo; adesso
    // "non corrente" e' il posto in cui la riga sta, e resta da cercare solo il
    // valore.
    const precedente = closed.find((r) => r.cents > 0)!
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
    const b = periodi(v)
    // **La soglia conta la riga di oggi**, che nell'elenco non c'e': due
    // periodi sono un chiuso piu' il corrente. Scritta come
    // `closed.length === TREND_MIN_ROWS` sarebbe la stessa soglia spostata di
    // uno, e nessun test lo direbbe: e' il punto in cui la forma nuova cambia la
    // **premessa** dell'asserzione e non solo la sua scrittura.
    expect(b.closed.length + 1).toBe(TREND_MIN_ROWS)
    expect(tutteLeRighe(b).map((r) => r.cents)).toEqual([8000, 4000])
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
    // **La sezione non c'e'**, e non e' un elenco vuoto: `null` e' il fatto,
    // e un elenco vuoto era la sua deduzione.
    expect(v.byPeriod).toBeNull()
    // Tre spese, un periodo solo: la soglia conta i **periodi**, e sono le
    // righe di B a mancare — non i dati. A infatti ha tre righe da mostrare.
    expect(sezione(v, 'variable')?.rows).toHaveLength(3)
    // La cifra che B avrebbe ristampato e' **esattamente** quella della scheda,
    // e il periodo pure: e' per questo che ristamparla non aggiungeva niente.
    // Se un giorno la soglia tornasse a governare le sole barre, questa cade.
    expect(v.current.spentCents).toBe(9000)
    expect(v.current.range).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    invariantiDiA(v)
  })

  it('la riga di oggi e quella che contiene oggi, e non compare due volte', () => {
    const v = ready({ expenses: spese })
    const { closed, current } = periodi(v)
    expect(current.range).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    // **Questo test aveva un altro soggetto**, e il soggetto non e' piu'
    // scrivibile: diceva *"la riga corrente e' l'ultima dell'elenco"*, e un
    // elenco che finisce con lei non c'e' piu'. Cio' che di
    // `rows.filter((r) => r.current)).toHaveLength(1)` resta **falsificabile** e'
    // l'altra meta', l'unicita': l'esistenza la garantisce il tipo, la
    // non-duplicazione no. I chiusi si camminano da `current.start - 1`, e
    // sbagliando quel giorno la settimana di oggi si disegnerebbe due volte —
    // una in fondo ai chiusi e una come corrente.
    expect(closed.map((r) => r.key)).not.toContain(current.key)
    for (const riga of closed) expect(riga.range.end < current.range.start).toBe(true)
  })
})

/*
 * **Il periodo in corso non e' un periodo finito**, e per un giorno lo e' stato
 * ovunque non ci fosse un budget.
 *
 * Il difetto misurato, senza budget, di mercoledi': tre settimane piene da
 * 70,00 € e la corrente con 30,00 € su tre giorni. Barre
 * `175,98 / 175,98 / 175,98 / 77,20` px, DOM identico, **nessuna marca**. Il
 * passo e' lo stesso in tutte e quattro — 10,00 € al giorno — e la forma diceva
 * 44%. L'unica marca che dichiarava l'incompletezza era la regione fra il
 * maturato e la barra, cioe' una cosa che **esiste solo se esiste la rotaia**:
 * l'incompletezza era legata a un campo con cui non c'entra niente.
 *
 * Qui si asserisce che i due numeri escono, che escono **dalla riga giusta**, e
 * che `current` non e' nessuna delle due scorciatoie che gli somigliano. Come si
 * disegnano e' del componente: di lunghezze, in questo blocco, non ce n'e'
 * nessuna in piu' di prima — e non e' una dimenticanza, e' l'argomento su
 * `PeriodBar.daysLived`.
 */
describe('B — un periodo in corso si dichiara tale anche senza budget', () => {
  /** Vero se `range` contiene `day`. Il **fatto** che `current` afferma. */
  function contiene(range: { start: string; end: string }, day: string): boolean {
    return range.start <= day && day <= range.end
  }

  /**
   * La scena misurata: 10,00 € al giorno da tre settimane e mezza. Le tre
   * settimane chiuse fanno 70,00 €, la corrente ne ha vissuti tre e fa 30,00 €.
   */
  const passoCostante: readonly Expense[] = [
    makeExpense({ date: '2026-08-03', categoryId: 'c-cibo', amountCents: 7000 }),
    makeExpense({ date: '2026-08-10', categoryId: 'c-cibo', amountCents: 7000 }),
    makeExpense({ date: '2026-08-17', categoryId: 'c-cibo', amountCents: 7000 }),
    makeExpense({ date: '2026-08-24', categoryId: 'c-cibo', amountCents: 3000 }),
  ]

  it('la riga corrente porta i giorni vissuti, le altre no perche non ne hanno da portare', () => {
    const v = ready({ expenses: passoCostante })
    const b = periodi(v)
    const { closed, current: corrente } = b
    expect(tutteLeRighe(b).map((r) => r.cents)).toEqual([7000, 7000, 7000, 3000])
    // Le tre chiuse: vissute per intero. Se i giorni venissero dalle metriche
    // del periodo **corrente** invece che dalle proprie, qui sarebbero 3 su 7 e
    // tre settimane finite risulterebbero eternamente incomplete.
    //
    // Erano `rows.slice(0, 3)`, cioe' "tutte tranne l'ultima" scritto come un
    // taglio: adesso sono **i chiusi**, e il taglio non serve piu' perche' il
    // tipo l'ha gia' fatto.
    expect(closed).toHaveLength(3)
    for (const riga of closed) {
      expect(riga.daysLived).toBe(7)
      expect(riga.daysTotal).toBe(7)
    }
    expect(corrente.daysLived).toBe(3)
    expect(corrente.daysTotal).toBe(7)
    // Ed escono dalle metriche gia' calcolate, non da una seconda aritmetica.
    expect(corrente.daysLived).toBe(v.current.daysLived)
    expect(corrente.daysTotal).toBe(v.current.daysTotal)
  })

  it('senza i due giorni la forma dice 44% dove il passo e identico', () => {
    const v = ready({ expenses: passoCostante })
    const b = periodi(v)
    const rows = tutteLeRighe(b)
    // Nessuna traccia: e' lo stato senza budget, cioe' quello in cui la marca
    // dell'incompletezza non esisteva affatto.
    expect(rows.every((r) => r.track === null)).toBe(true)
    // Il fatto che la forma non dice e i due interi si': **lo stesso passo**.
    // Vale su tutte le righe insieme, corrente compresa: e' proprio il confronto
    // fra lei e le altre a essere il soggetto.
    expect(rows.map((r) => r.cents / r.daysLived)).toEqual([1000, 1000, 1000, 1000])
    // E la forma, che resta quella che era: la barra corrente vale il 44% della
    // piena. Non e' un difetto da correggere sull'asse — 3/7 dei soldi sono 3/7
    // dei soldi — e' un fatto che va **dichiarato** accanto, e la dichiarazione
    // sono i due numeri sopra.
    const corrente = b.current
    const piena = b.closed[0]!
    expect(piena.fraction).toBe(1)
    expect(corrente.fraction).toBeCloseTo(BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * (3 / 7), 10)
    // Il **rapporto** misurato dal gate — 77,20 px contro 175,98 — e' questo, e
    // non si scrive in pixel: la larghezza della colonna dipende dal viewport
    // (vedi `COLONNA_MIN_PX` e `COLONNA_PX`), il rapporto no. Quello che il
    // difetto diceva era 44%, ed e' ancora 44%: e' giusto che lo dica, perche'
    // 3/7 dei soldi sono 3/7 dei soldi. Cio' che mancava era il resto della
    // frase.
    expect(corrente.fraction / piena.fraction).toBeCloseTo(77.2 / 175.98, 3)
  })

  it('l ultimo giorno del periodo i giorni sono pari e il periodo e ancora in corso', () => {
    // Domenica 30 agosto, ultimo giorno della settimana 24–30. `daysLived`
    // vale 7 come `daysTotal`, e ci si puo' ancora spendere per tutto il giorno.
    //
    // **E' la mutazione che questo test esiste per prendere**, e la forma nuova
    // l'ha spostata di un piano senza toglierla: prima era `current` dedotto da
    // `daysLived < daysTotal`, che qui vale `false` e faceva sparire la riga di
    // oggi. Adesso il campo non c'e' piu' e la stessa deduzione vive in
    // `trendRanges`: una finestra che chiamasse "corrente" *il periodo non
    // ancora finito* filerebbe oggi fra i **chiusi** e prenderebbe come corrente
    // la settimana dopo. Succede una volta a settimana — la domenica, cioe' il
    // giorno in cui quanto resta e' la cosa piu' utile della schermata — e
    // l'ultimo di ogni mese sul periodo mensile.
    const v = ready({
      expenses: [
        makeExpense({ date: '2026-08-19', categoryId: 'c-cibo', amountCents: 4000 }),
        makeExpense({ date: '2026-08-30', categoryId: 'c-cibo', amountCents: 1000 }),
      ],
      day: '2026-08-30',
    })
    const { closed, current: corrente } = periodi(v)
    expect(corrente.range).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    expect(corrente.daysLived).toBe(7)
    expect(corrente.daysTotal).toBe(7)
    expect(corrente.daysLived).toBe(corrente.daysTotal)
    // Il periodo e' in corso, e non e' un'opinione: resta un giorno, che e'
    // oggi. `daysRemaining` conta oggi incluso.
    expect(v.current.daysRemaining).toBe(1)
    // **E la settimana di oggi non e' fra i chiusi.** Qui c'era
    // `rows.filter((r) => r.current)).toHaveLength(1)`, che provava due cose:
    // che la riga esiste — adesso lo dice il tipo, e un'asserzione su una cosa
    // che il compilatore garantisce e' rumore — e che non e' archiviata come
    // finita. La seconda e' quella che cade sotto la mutazione, ed e' rimasta.
    expect(closed.map((r) => r.range.start)).not.toContain('2026-08-24')
    for (const riga of closed) expect(riga.range.end < '2026-08-24').toBe(true)
  })

  it('la riga di oggi e quella che contiene oggi, non la piu alta ne l unica non nulla', () => {
    // Quattro settimane, la corrente e' la piu' **bassa** e in mezzo ce n'e' una
    // a zero: nessuna delle scorciatoie che somigliano a `current` — la barra
    // piu' alta, l'unica non nulla, quella con la traccia — la indovina.
    const v = ready({
      expenses: [
        makeExpense({ date: '2026-08-05', categoryId: 'c-cibo', amountCents: 5000 }),
        makeExpense({ date: '2026-08-19', categoryId: 'c-spesa', amountCents: 8000 }),
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 1000 }),
      ],
    })
    const b = periodi(v)
    const { closed, current: corrente } = b
    const rows = tutteLeRighe(b)
    expect(closed.map((r) => r.range.start)).toEqual(['2026-08-03', '2026-08-10', '2026-08-17'])
    expect(corrente.range.start).toBe('2026-08-24')
    expect(rows.map((r) => r.cents)).toEqual([5000, 0, 8000, 1000])
    // **Il fatto**, ricalcolato dalle date: la riga di oggi e' quella il cui
    // intervallo contiene oggi, e nessuna delle chiuse lo contiene. Era
    // `rows.map((r) => r.current)` confrontato con lo stesso conto: adesso non
    // c'e' un campo da confrontare, c'e' un posto — e cio' che resta da provare
    // e' che il posto sia quello giusto.
    expect(contiene(corrente.range, OGGI)).toBe(true)
    expect(closed.map((r) => contiene(r.range, OGGI))).toEqual([false, false, false])
    // E non e' nessuna delle tre coincidenze: la riga piu' alta non e' quella di
    // oggi, quella a zero nemmeno, e quella di oggi e' la piu' corta delle non
    // nulle.
    const piuAlta = rows.reduce((max, r) => (r.cents > max.cents ? r : max), rows[0]!)
    expect(piuAlta.key).not.toBe(corrente.key)
    expect(rows.find((r) => r.cents === 0)?.key).not.toBe(corrente.key)
  })

  it('il fondo della finestra e il periodo di oggi, e i chiusi sono tutti finiti', () => {
    // **Il soggetto di questo test e' cambiato, e vale la pena dire in cosa.**
    // Diceva *"`current` coincide con l'ultima riga, ed ecco perche'"*: quella
    // coincidenza non e' piu' scrivibile, perche' non c'e' nessun elenco che
    // finisca con lei — ed e' il motivo per cui la forma e' cambiata. La ragione
    // che allora andava dichiarata a mano adesso e' la costruzione:
    // `trendRanges` calcola per primo il periodo di `input.day` e cammina
    // all'indietro da li'.
    //
    // Cio' che resta da provare — e che nessun tipo garantisce — e' che quella
    // costruzione produca due insiemi **disgiunti e nell'ordine giusto**: oggi
    // di qua, il finito di la'. Se la finestra scorresse indietro fino a dove i
    // dati ci sono — la tentazione rifiutata accanto alla soglia — questa
    // cadrebbe qui invece che a schermo.
    const v = ready({ expenses: passoCostante })
    const { closed, current: corrente } = periodi(v)
    expect(contiene(corrente.range, OGGI)).toBe(true)
    for (const riga of closed) expect(riga.range.end < OGGI).toBe(true)
    // E la conseguenza sui giorni: un periodo chiuso e' vissuto per intero.
    for (const riga of closed) expect(riga.daysLived).toBe(riga.daysTotal)
  })

  it('un dato futuro e un orologio spostato non spostano il fondo della finestra', () => {
    // **La verifica del paragrafo qui sopra, sugli unici due scrittori che
    // potrebbero romperlo**: un backup con spese datate in avanti e l'orologio
    // del dispositivo tornato indietro (vedi `StatsView`, ramo `outside`, che li
    // enumera). Se uno dei due producesse una finestra che **non** finisce con
    // oggi, la riga consegnata come corrente sarebbe un periodo chiuso, e il
    // bordo aperto piu' i giorni vissuti finirebbero su una settimana finita.
    //
    // Oggi non succede, e non e' un caso: `trendRanges` costruisce la finestra
    // da `input.day` e il taglio sulla testa non tocca il fondo. Questo test lo
    // rende **osservabile** invece che dedotto — e cade il giorno in cui una
    // delle due cose cambia.
    const orologioIndietro = ready({
      day: '2026-08-10',
      expenses: [
        makeExpense({ date: '2026-07-20', categoryId: 'c-cibo', amountCents: 1000 }),
        // Scritta quando l'orologio era avanti: da qui e' nel futuro.
        makeExpense({ date: '2026-08-26', categoryId: 'c-spesa', amountCents: 9900 }),
      ],
    })
    const finestra = periodi(orologioIndietro)
    const corrente = finestra.current
    expect(corrente.range).toEqual({ start: '2026-08-10', end: '2026-08-16' })
    expect(contiene(corrente.range, '2026-08-10')).toBe(true)
    // La spesa futura non e' in nessuna riga: cade oltre il fondo della
    // finestra, non lo sposta. E i giorni della riga corrente sono quelli
    // vissuti fino a **quel** giorno, lunedi', cioe' uno.
    expect(tutteLeRighe(finestra).every((r) => r.cents !== 9900)).toBe(true)
    expect(corrente.daysLived).toBe(1)
    expect(corrente.daysTotal).toBe(7)

    // E il caso in cui l'unica spesa che B conta e' futura: **la riga di oggi
    // cade insieme a tutte le altre**, perche' la sua fine e' il confine piu'
    // lontano della finestra. E' l'unico stato in cui il modello non ha una riga
    // corrente da consegnare, ed e' per questo che `byPeriod` e' annullabile
    // mentre `Trend.current` non lo e'.
    const soloFuturo = view({
      expenses: [makeExpense({ date: '2026-12-01', categoryId: 'c-cibo', amountCents: 4000 })],
    })
    expect(soloFuturo.kind).toBe('outside')
  })

  it('sul mese i giorni sono quelli del mese della riga, e non sono una costante', () => {
    // Otto mesi, da gennaio ad agosto 2026: 31, 28, 31, 30, 31, 30, 31, 31.
    // Prendendo i giorni da un periodo diverso da quello della riga — per
    // esempio dalle metriche correnti — febbraio ne avrebbe 31, che e' la forma
    // in cui questo errore si vede a occhio nudo.
    const v = ready({
      period: 'monthly',
      expenses: [
        makeExpense({ date: '2026-01-15', categoryId: 'c-cibo', amountCents: 5000 }),
        makeExpense({ date: '2026-02-10', categoryId: 'c-cibo', amountCents: 4000 }),
        makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 3000 }),
      ],
    })
    const b = periodi(v)
    const { closed, current: corrente } = b
    expect(closed.length + 1).toBe(TREND_PERIODS)
    expect(tutteLeRighe(b).map((r) => r.daysTotal)).toEqual([31, 28, 31, 30, 31, 30, 31, 31])
    // I sette mesi chiusi sono vissuti per intero, ognuno per i **propri**
    // giorni. Era `rows.slice(0, -1)`: adesso i chiusi sono i chiusi.
    expect(closed.map((r) => r.daysLived)).toEqual([31, 28, 31, 30, 31, 30, 31])
    // Agosto: 26 giorni vissuti su 31, oggi compreso.
    expect(corrente.range).toEqual({ start: '2026-08-01', end: '2026-08-31' })
    expect(corrente.daysLived).toBe(26)
    expect(corrente.daysTotal).toBe(31)
    // Febbraio 2026 non e' bisestile, e il numero viene da `periodRange` — non
    // da un'aritmetica scritta una seconda volta qui accanto.
    expect(closed[1]?.range).toEqual({ start: '2026-02-01', end: '2026-02-28' })
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
    const { closed, current: corrente } = periodi(v)
    // Tagliando su `cents > 0` questa finestra sarebbe una riga sola — cioe'
    // nessuna sezione — perche' il taglio leggerebbe un valore ("zero speso")
    // come un fatto ("l'app non c'era"). Sono tre: due chiuse piu' oggi.
    expect(closed.map((r) => r.range.start)).toEqual(['2026-08-10', '2026-08-17'])
    expect(corrente.range.start).toBe('2026-08-24')
    expect(closed[0]?.cents).toBe(0)
    expect(closed[0]?.fraction).toBe(0)
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
      expect(v.byPeriod).toBeNull()
      // E i dati ci sono davvero: la schermata non e' vuota, e' A a portarli.
      expect(sezione(v, 'variable')?.rows).toHaveLength(1)
      expect(v.current.spentCents).toBe(4000)
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
      expect(v.byPeriod).toBeNull()
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
    const { closed, current: corrente } = periodi(v)
    expect(closed).toHaveLength(2)
    const vuota = closed[1]
    expect(vuota?.range.start).toBe('2026-08-17')
    expect(vuota?.cents).toBe(0)
    // Zero e' un dato, non un buco: e' la riga che dice "quella settimana non
    // hai speso niente", e per chi ha il conto corto e' quella che si cerca.
    // E vale **zero**, non il pavimento: l'assenza non prende inchiostro.
    expect(vuota?.fraction).toBe(0)
    expect(corrente.fraction).toBeGreaterThanOrEqual(BAR_MIN_FRACTION)
    expect((closed[0]?.fraction ?? 0) - corrente.fraction).toBeCloseTo(
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
    expect(tutteLeRighe(periodi(v)).map((r) => r.range.start)).toEqual(['2026-08-17', '2026-08-24'])
  })

  it('non si mostrano piu di TREND_PERIODS periodi anche con anni di storico', () => {
    const v = ready({
      expenses: [
        makeExpense({ date: '2024-01-15', categoryId: 'c-cibo', amountCents: 5000 }),
        makeExpense({ date: '2026-08-26', categoryId: 'c-cibo', amountCents: 2500 }),
      ],
    })
    // La finestra e' larga `TREND_PERIODS`, e la riga di oggi e' una di quelle:
    // i chiusi sono sette. Contarli senza sommare la corrente farebbe passare
    // una finestra da nove.
    const { closed } = periodi(v)
    expect(closed.length + 1).toBe(TREND_PERIODS)
    expect(closed[0]?.range.start).toBe('2026-07-06')
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
    const { closed, current: corrente } = periodi(v)
    expect(closed.length + 1).toBe(TREND_PERIODS)
    // **Le sette a zero sono tutte e sole le chiuse**, e la viva e' quella di
    // oggi. Era `rows.filter(cents === 0)).toHaveLength(TREND_PERIODS - 1)`, che
    // contava senza dire quali: contando solo, sette zeri fra i chiusi e una
    // corrente a zero avrebbero dato lo stesso numero.
    expect(closed.every((r) => r.cents === 0)).toBe(true)
    expect(corrente.cents).toBe(3000)
    // La riga viva porta la scala, cioe' arriva a fondo colonna; le altre non
    // prendono inchiostro. E' la differenza fra "zero dentro la finestra" e
    // "finestra senza niente da confrontare": qui gli zeri si dipingono.
    expect(corrente.fraction).toBe(1)
    expect(closed[0]?.fraction).toBe(0)
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
    expect(v.byPeriod).toBeNull()
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
  it('sono otto, contigui, e quello che contiene oggi non e fra i chiusi', () => {
    const { closed, current } = trendRanges('weekly', OGGI)
    // La finestra e' larga `TREND_PERIODS` **compreso** il periodo di oggi, che
    // non sta nell'elenco: e' la stessa aritmetica della soglia, e per la stessa
    // ragione va scritta e non dedotta.
    expect(closed.length + 1).toBe(TREND_PERIODS)
    expect(current).toEqual({ start: '2026-08-24', end: '2026-08-30' })
    // **Che il fondo contenga oggi adesso e' vero per costruzione** — `current`
    // e' `periodRange(period, day)` e non "l'ultimo elemento" — quindi cio' che
    // resta da provare e' la **cucitura**: la finestra arriva in due pezzi, e un
    // giorno di scarto o di sovrapposizione fra l'ultimo chiuso e oggi non si
    // vedrebbe da nessun'altra parte. Prima il conto girava su una lista sola e
    // quel punto non era un punto.
    const tutti = [...closed, current]
    for (let i = 1; i < tutti.length; i += 1) {
      // Contigui davvero: nessun giorno fra la fine di uno e l'inizio del dopo.
      const prima = tutti[i - 1]!
      const dopo = tutti[i]!
      expect(new Date(dopo.start).getTime() - new Date(prima.end).getTime()).toBe(86400000)
    }
  })

  it('i mesi non hanno tutti la stessa lunghezza, e i confini vengono da periodRange', () => {
    const { closed, current } = trendRanges('monthly', '2026-03-15')
    expect(current).toEqual({ start: '2026-03-01', end: '2026-03-31' })
    // Febbraio 2026: 28 giorni. Se si camminasse a passi di 30 giorni, questo
    // confine sarebbe sbagliato. E' l'ultimo dei chiusi, cioe' il periodo
    // dall'altra parte della cucitura.
    expect(closed[closed.length - 1]).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
})

/*
 * **Le fisse sono due quantita', e da oggi stanno in due moduli.**
 *
 * La **proiezione** — quanto costeranno al mese le regole in vigore — non passa
 * piu' di qui: viveva in `StatsTiles`, letta da una riga in testa alle
 * Statistiche, ed e' uscita col suo ultimo lettore. La sua casa e' Impostazioni,
 * dove ADR 016 §3 la vuole *"accanto al budget"*, che e' la meta' senza cui non
 * significa niente.
 *
 * Qui resta il **fatto**: quanto e' uscito davvero nel periodo, che vive nel
 * totale della sezione fisse di A e in `current.recurringSpentCents`.
 *
 * **Questo blocco diceva "C — le due cifre in testa", e non e' stato rinominato
 * per estetica.** Sei asserzioni leggevano `tiles`, e tolte quelle restava un
 * blocco il cui nome prometteva un confronto che nessuna riga faceva piu'. Il
 * nome di un test e' cio' che si legge quando cade: un nome che promette due
 * cifre sopra asserzioni che ne guardano una manda a cercare il difetto dalla
 * parte sbagliata.
 *
 * Cio' che i test provano adesso e' **piu' stretto e piu' vero**: che A conta
 * cio' che e' uscito e non cio' che e' previsto. Una regola nuova che non ha
 * ancora generato niente non entra; una regola disattivata dopo aver generato
 * lascia la sua spesa dentro. Sono i due versi della stessa proprieta', ed erano
 * gia' provati qui — solo che prima stavano accanto a un confronto che li
 * copriva.
 */
describe('Le fisse in A sono un fatto retrospettivo, non una proiezione', () => {
  /** L'affitto uscito questa settimana: un fatto, gia' a disco. */
  const affitto = makeExpense({
    date: '2026-08-24',
    categoryId: 'c-casa',
    amountCents: 50700,
    source: 'recurring',
  })
  const caffe = makeExpense({ date: OGGI, categoryId: 'c-cibo', amountCents: 400 })

  it('senza fisse ne regole la sezione delle fisse non esiste', () => {
    const v = ready({ expenses: [caffe] })
    expect(v.current.recurringSpentCents).toBe(0)
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
    // **A e' retrospettiva, e questo test lo prova sul caso che lo distingue.**
    // Ci sono due regole in vigore per 537,00 € al mese, e in A c'e' **una riga
    // sola** da 507,00: la seconda regola non ha ancora generato niente.
    //
    // Qui c'era anche il confronto con `tiles.fixedMonthlyCents` (53700), cioe'
    // con la proiezione. Non e' piu' scrivibile: `StatsTiles` e' uscita col suo
    // ultimo lettore, e la proiezione vive in Impostazioni — che e' dove ADR 016
    // §3 la vuole, *"accanto al budget"*. Il fatto che quel test provava — le due
    // quantita' sono diverse — resta vero, ma **non e' piu' una proprieta' di
    // questo modulo**: qui c'e' solo il fatto, e la proiezione sta altrove.
    // Asserirla di qui vorrebbe dire importare `monthlyFixedCosts` per il solo
    // test, cioe' tenere in vita una superficie che nessuno chiama.
    expect(sezione(v, 'fixed')?.rows).toHaveLength(1)
    expect(unica(sezione(v, 'fixed')).cents).toBe(50700)
    expect(v.current.recurringSpentCents).toBe(50700)
  })

  it('una regola disattivata dopo aver generato la spesa: il fatto resta in A', () => {
    const v = ready({
      expenses: [affitto, caffe],
      // Disattivare e' **quello che l'app consiglia** quando una regola ha gia'
      // generato spese: `toast.ruleInUse` dice "si puo' solo disattivare".
      rules: [makeRule({ startDate: '2026-01-01', amountCents: 50700, active: false })],
    })
    // Le regole in vigore sono zero, quindi non c'e' nessun tasso mensile da
    // nessuna parte — ed e' la cosa giusta. **Il fatto non si perde: e' in A, sotto un'etichetta che dice un'altra
    // cosa (`stats.fixedInPeriod`, "Fisse in questo periodo"). E' li' che quella
    // cifra ha un invariante — e' la somma delle righe che le stanno sotto —
    // ed e' quell'etichetta a togliere la contraddizione che il disgiunto
    // copriva.
    expect(unica(sezione(v, 'fixed')).cents).toBe(50700)
    expect(unica(sezione(v, 'fixed')).cents).toBe(v.current.recurringSpentCents)
    invariantiDiA(v)
  })

  it('una regola attiva che non ha ancora generato niente non entra in A', () => {
    const v = ready({
      expenses: [caffe],
      rules: [makeRule({ startDate: '2026-08-01', amountCents: 3000 })],
    })
    // Il verso opposto del test qui sopra: una regola in vigore da 30,00 € al
    // mese, e in A **niente**. E' la definizione di retrospettivo, ed e' la
    // ragione per cui la proiezione non poteva vivere qui: A risponde a "cosa e'
    // uscito", non a "cosa uscira'".
    expect(v.current.recurringSpentCents).toBe(0)
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
    // A schermo: sotto "Fisse in questo periodo" una riga che dice `0,00 €`,
    // una volta sola. Il totale di parte non c'e' perche' con una riga sola
    // sarebbe la stessa cifra due volte.
    invariantiDiA(v)
  })

  it('il budget non serve per contare cosa e uscito', () => {
    const v = ready({ expenses: [caffe], budgets: [] })
    // E' l'unica delle tre domande a cui l'app risponde dal primo giorno.
    expect(v.current.spentCents).toBe(400)
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
    const corrente = periodi(v).current
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
    const passato = periodi(v).closed[0]!
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
    // **Qui c'era un `expect(corrente).toBeDefined()`, e adesso e' rumore.**
    // Difendeva da un `find` che torna `undefined` e da un `?.` che rende verde
    // una riga assente: due modi di passare per il motivo sbagliato che il tipo
    // ha appena chiusi — `periodi` fallisce dove la sezione non c'e', e
    // `current` non e' annullabile. Un'asserzione su cio' che il compilatore
    // garantisce non protegge, insegna solo a scriverne altre.
    const corrente = periodi(v).current
    // Il budget si risolve (200) e la traccia comunque non si disegna: e' la
    // differenza fra "c'e' un budget" e "il confronto ha una risposta".
    expect(corrente.track).toBeNull()
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
    const { closed, current: corrente } = periodi(v)
    expect(closed.map((r) => r.range.start)).toEqual(['2026-08-17'])
    expect(corrente.range.start).toBe('2026-08-24')
    // 17–23: il budget copriva **un giorno su sette**. Una barra da 60,00 su una
    // traccia da 200,00 leggerebbe "sei stato bravo", e non e' una lettura
    // sbagliata del grafico: e' il grafico che afferma una cosa che i dati non
    // sostengono.
    expect(closed[0]?.track).toBeNull()
    expect(closed[0]?.cents).toBe(6000)
    // 24–30: lo stesso identico record copre tutti e sette i giorni. E' la riga
    // di oggi, ed e' quella che il test deve nominare: "la seconda" era vero
    // finche' erano due.
    expect(corrente.track).not.toBeNull()
    expect(corrente.track?.fraction).toBe(1)
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
    // di lei B avrebbe una riga sola, cadrebbe sotto `TREND_MIN_ROWS` e la
    // sezione non ci sarebbe affatto — `periodi` fallirebbe, che e' cio' che
    // deve fare: prima il test passava leggendo `undefined?.track`.
    const domenica = ready({
      expenses: [makeExpense({ date: '2026-08-12', categoryId: 'c-cibo', amountCents: 1000 }), ...SPESE],
      budgets: [BUDGET],
      day: '2026-08-23',
    })
    expect(domenica.current.budgetCents).toBe(20000)
    expect(domenica.current.comparableToBudget).toBe(false)
    expect(periodi(domenica).current.track).toBeNull()
  })

  it('la barra nuda resta in scala con le altre: e l assenza del confronto, non del dato', () => {
    const v = ready({ expenses: SPESE, budgets: [BUDGET] })
    const { closed, current: dopo } = periodi(v)
    const prima = closed[0]!
    // La scala di B e' una sola e comprende il budget delle righe confrontabili
    // (200,00), quindi 60,00 e 40,00 stanno sulla stessa scala e la loro
    // differenza e' quella degli importi. **La scala e' una anche adesso che le
    // righe arrivano in due campi**: se la riga di oggi avesse una scala sua,
    // questa differenza non tornerebbe.
    expect(prima.fraction - dopo.fraction).toBeCloseTo(
      (1 - BAR_MIN_FRACTION) * (2000 / 20000),
      10,
    )
    expect(prima.fraction).toBeGreaterThanOrEqual(BAR_MIN_FRACTION)
    invariantiDiA(v)
  })
})
