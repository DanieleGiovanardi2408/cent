// Il profilo dimostrativo: `docs/demo.json`.
//
//   node scripts/demo.mjs        riscrive docs/demo.json
//
// ## Cos'e', e perche' e' un backup vero e non una fixture qualunque
//
// E' un **backup Cent valido**: stessa forma di quello che produce l'export, e
// reimportabile dall'app per ricostruire lo stesso archivio. Non e' un dettaglio
// di comodita' — e' cio' che gli fa fare due mestieri con un file solo:
//
//  1. la sorgente degli screenshot (`scripts/screenshots.mjs` lo semina);
//  2. **i dati illustrativi di `scripts/audit.mjs`**, che prima venivano dal
//     backup vero di chi scrive l'app ed erano finiti in un commento pubblico.
//
// Il secondo e' il punto. La regola *"i dati veri non si committano"* c'era, ed
// e' stata violata da una derivazione fatta bene: un caso reale, studiato e
// scritto nel posto sbagliato. Finche' l'unico materiale realistico disponibile
// e' quello vero, quella regola chiede di ricordarsene **nel momento in cui si
// sta pensando ad altro**. Questo file toglie la scusa: c'e' del materiale
// realistico che si puo' citare.
//
// ## Inventato per intero
//
// Nessun nome, importo, negozio o descrizione viene dai backup di chi scrive
// l'app. Le cifre sono plausibili per uno studente Erasmus ad Amsterdam e basta:
// nessuna e' stata osservata.
//
// ## Cosa deve contenere, e perche' ognuna
//
//  - **nove settimane** di storia: la finestra delle Statistiche e' fissa a
//    otto, e lo Storico mostra le frecce solo se c'e' dove andare;
//  - **entrambe le ciambelle popolate**: le Quotidiane vogliono piu' categorie,
//    le Fisse vogliono piu' di una regola;
//  - **due regole sulla stessa categoria con descrizioni diverse**: e' la prova
//    visiva del perche' `RecurringRule.note` esiste. Senza, le due righe
//    sarebbero identiche — stessa emoji, stesso nome, stessa cadenza;
//  - **"Restano" a un valore intermedio**: a budget pieno il numero grande non
//    dimostra niente, e sotto zero dimostra un'altra cosa.
//
// Le prime due sono verificate da `src/core/demo.test.ts`, non promesse qui.
//
// ## Deterministico
//
// Nessun `Math.random` e nessun orologio: stesso comando, stesso file, byte per
// byte. Un file dimostrativo che cambia a ogni rigenerazione produrrebbe un diff
// a ogni giro e degli screenshot che non si possono rifare uguali.

import { writeFileSync } from 'node:fs'

/** Il giorno in cui il profilo e' "oggi". Lo screenshot ci fissa l'orologio. */
const OGGI = '2026-09-17'
const ESPORTATO = '2026-09-17T13:20:00.000Z'

/**
 * Generatore lineare congruenziale: due righe, nessuna dipendenza, e **stessa
 * sequenza a ogni esecuzione**. `Math.random` avrebbe prodotto un file diverso
 * a ogni giro, cioe' un diff senza contenuto e degli screenshot irripetibili.
 */
function rng(seed) {
  let stato = seed
  return () => {
    stato = (stato * 1_103_515_245 + 12_345) % 2_147_483_648
    return stato / 2_147_483_648
  }
}

const giorno = (iso, delta) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

const istante = (iso, ore, minuti) =>
  `${iso}T${String(ore).padStart(2, '0')}:${String(minuti).padStart(2, '0')}:00.000Z`

/* --- le otto categorie, nella palette e nell'ordine della griglia ---------- *
 *
 * Nomi in inglese: il default dell'app fuori dall'italiano, e la lingua del
 * README. Emoji, colori e ordine sono quelli veri di `src/core/defaults.ts` —
 * gli unici valori di questo file che **non** sono inventati, perche' sono del
 * prodotto e non di una persona. */
const CATEGORIE = [
  { id: 'demo-cat-groceries', name: 'Groceries', emoji: '🛒', color: '#709951', order: 0 },
  { id: 'demo-cat-eatingout', name: 'Eating out', emoji: '🍽️', color: '#fc5401', order: 1 },
  { id: 'demo-cat-coffeeshop', name: 'Coffeeshop', emoji: '🌿', color: '#00a6c6', order: 2 },
  { id: 'demo-cat-cigarettes', name: 'Cigarettes', emoji: '🚬', color: '#895c02', order: 3 },
  { id: 'demo-cat-transport', name: 'Transport', emoji: '🚇', color: '#3157fa', order: 4 },
  { id: 'demo-cat-fun', name: 'Fun', emoji: '🎬', color: '#b90f60', order: 5 },
  { id: 'demo-cat-home', name: 'Home', emoji: '🏠', color: '#9861c7', order: 6 },
  { id: 'demo-cat-extra', name: 'Extra', emoji: '🔖', color: '#2a6198', order: 7 },
]

/* --- le spese quotidiane --------------------------------------------------- *
 *
 * Una forma per categoria: quanto spesso capita, in che fascia d'importo, a che
 * ora, e con quali descrizioni. Le descrizioni sono catene olandesi e parole
 * generiche — niente che qualcuno abbia scritto davvero da qualche parte. */
const FORME = [
  {
    cat: 'demo-cat-groceries',
    ogniQuanti: 3,
    min: 850,
    max: 3_400,
    ora: 18,
    note: ['Jumbo', 'Albert', 'market run', 'Dirk', null],
  },
  {
    cat: 'demo-cat-eatingout',
    ogniQuanti: 4,
    min: 900,
    max: 2_800,
    ora: 20,
    note: ['with the flatmates', 'kapsalon', 'lunch', null, null],
  },
  { cat: 'demo-cat-coffeeshop', ogniQuanti: 6, min: 1_200, max: 2_500, ora: 22, note: [null] },
  { cat: 'demo-cat-cigarettes', ogniQuanti: 5, min: 900, max: 1_100, ora: 11, note: [null] },
  {
    cat: 'demo-cat-transport',
    ogniQuanti: 7,
    min: 240,
    max: 1_900,
    ora: 9,
    note: ['day ticket', 'to Utrecht', null],
  },
  {
    cat: 'demo-cat-fun',
    ogniQuanti: 9,
    min: 1_100,
    max: 4_200,
    ora: 21,
    note: ['cinema', 'museum', 'concert', null],
  },
  { cat: 'demo-cat-extra', ogniQuanti: 11, min: 600, max: 3_500, ora: 15, note: ['laundry', 'stuff', null] },
]

/* --- le tre regole --------------------------------------------------------- *
 *
 * Due sulla **stessa categoria** con descrizioni diverse: senza `note` sarebbero
 * due righe identiche nell'elenco delle fisse, e la schermata non saprebbe dire
 * quale delle due si sta per toccare. E' il caso che si incontra il primo
 * giorno se si hanno due abbonamenti, e non si incontra mai se le proprie due
 * regole stanno su due categorie diverse. */
const REGOLE = [
  {
    id: 'demo-rule-room',
    categoryId: 'demo-cat-home',
    note: 'The room',
    amountCents: 52_000,
    anchorDay: 1,
    startDate: '2026-07-01',
  },
  {
    id: 'demo-rule-gym',
    categoryId: 'demo-cat-extra',
    note: 'Gym',
    amountCents: 2_990,
    anchorDay: 8,
    startDate: '2026-07-08',
  },
  {
    id: 'demo-rule-music',
    categoryId: 'demo-cat-extra',
    note: 'Music streaming',
    amountCents: 1_099,
    anchorDay: 8,
    startDate: '2026-07-08',
  },
  // **Una regola finita**, e non per completezza di campi: e' lo stato che
  // `endDate` esiste per rappresentare — le spese fisse di un Erasmus
  // finiscono tutte — e nell'elenco delle fisse porta la sua parola accanto
  // invece di un numero. Senza, la schermata mostrerebbe solo regole vive e
  // il caso piu' comune di tutti resterebbe fuori dagli screenshot.
  //
  // L'ha chiesta `demo.test.ts`: il profilo non copriva `endDate`, che
  // `completeDataSet()` popola. Un campo che il demo non porta e' una parte di
  // schermata che nessuno screenshot mostra.
  {
    id: 'demo-rule-course',
    categoryId: 'demo-cat-fun',
    note: 'Dutch course',
    amountCents: 4_500,
    anchorDay: 12,
    startDate: '2026-07-12',
    endDate: '2026-08-31',
  },
]

/** Il primo giorno della storia: nove settimane pieni prima di oggi. */
const INIZIO = giorno(OGGI, -62)

/**
 * Il lunedi' in cui il budget e' stato alzato da 140 a 160.
 *
 * Su un **confine di periodo** e non a meta' settimana: un budget che cambia il
 * mercoledi' lascia quella settimana con due tetti, che e' uno stato vero e
 * rappresentabile ma non quello da mostrare per primo.
 */
const CAMBIO_BUDGET = giorno(OGGI, -31)

function costruisci() {
  // **Il seme e' scelto contro un requisito, non a caso.** "Restano" deve essere
  // intermedio: a budget pieno il numero grande non dimostra niente, e sotto
  // zero dimostra un'altra cosa. Provati dieci semi e misurato per ognuno quanto
  // resta — il primo produceva **−32,30 €**, cioe' proprio lo stato che il
  // profilo non deve mostrare. Questo lascia il 36% del budget, con cinque
  // spese oggi. Il requisito e' asserito da `demo.test.ts`: se un giorno la
  // generazione cambia e il numero esce dall'intervallo, cade li'.
  const rand = rng(77)
  const expenses = []

  // Le quotidiane. **Giorno per giorno e non a passo fisso**: con `d % ogni`
  // le sette forme cadono tutte sui multipli, e il risultato aveva quattro
  // spese nella settimana corrente e **niente negli ultimi due giorni** — cioe'
  // una Home in stato vuoto, che e' esattamente la schermata che il profilo non
  // deve mostrare. Misurato prima di riscriverlo.
  let seq = 0
  const scrivi = (forma, data) => {
    const nota = forma.note[Math.floor(rand() * forma.note.length)]
    const minuti = Math.floor(rand() * 60)
    seq += 1
    expenses.push({
      id: `demo-exp-${String(seq).padStart(4, '0')}`,
      createdAt: istante(data, forma.ora, minuti),
      updatedAt: istante(data, forma.ora, minuti),
      amountCents: forma.min + Math.floor(rand() * (forma.max - forma.min)),
      categoryId: forma.cat,
      date: data,
      timeMinutes: forma.ora * 60 + minuti,
      source: 'manual',
      ...(nota === null ? {} : { note: nota }),
    })
  }
  for (let d = 0; d <= 62; d += 1) {
    const data = giorno(INIZIO, d)
    if (data > OGGI) continue
    for (const forma of FORME) {
      if (rand() < 1 / forma.ogniQuanti) scrivi(forma, data)
    }
  }
  // **Oggi non puo' essere vuoto**, e non e' una forzatura del caso: la Home
  // mostra le spese di oggi, e un profilo dimostrativo che la apre sullo stato
  // vuoto dimostrerebbe lo stato vuoto. Le tre forme scelte sono quelle di un
  // giovedi' qualunque.
  for (const cat of ['demo-cat-coffeeshop', 'demo-cat-groceries', 'demo-cat-transport']) {
    const forma = FORME.find((f) => f.cat === cat)
    if (forma !== undefined) scrivi(forma, OGGI)
  }

  // Le generate: l'id e' `rec:<regola>:<giorno>`, che e' l'identita' con cui il
  // motore sa di non doverle riscrivere. Un file dimostrativo che le inventasse
  // con un UUID sarebbe un file che l'app rigenererebbe in doppio al primo
  // avvio.
  const recurringRules = []
  for (const r of REGOLE) {
    let ultima = null
    for (let mese = 6; mese <= 8; mese += 1) {
      const data = `2026-${String(mese + 1).padStart(2, '0')}-${String(r.anchorDay).padStart(2, '0')}`
      if (data < r.startDate || data > OGGI) continue
      // Una regola finita non genera oltre la propria fine: e' `endDate` che
      // taglia il bordo superiore della finestra, non `active`.
      if (r.endDate !== undefined && data > r.endDate) continue
      ultima = data
      expenses.push({
        id: `rec:${r.id}:${data}`,
        createdAt: istante(data, 6, 0),
        updatedAt: istante(data, 6, 0),
        amountCents: r.amountCents,
        categoryId: r.categoryId,
        date: data,
        source: 'recurring',
        recurringId: r.id,
      })
    }
    recurringRules.push({
      id: r.id,
      createdAt: istante(r.startDate, 8, 0),
      updatedAt: istante(r.startDate, 8, 0),
      amountCents: r.amountCents,
      categoryId: r.categoryId,
      note: r.note,
      cadence: 'monthly',
      interval: 1,
      anchorDay: r.anchorDay,
      startDate: r.startDate,
      ...(r.endDate === undefined ? {} : { endDate: r.endDate }),
      ...(ultima === null ? {} : { lastMaterializedDate: ultima }),
      active: true,
    })
  }

  expenses.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))

  return {
    app: 'cent',
    schemaVersion: 6,
    exportedAt: ESPORTATO,
    data: {
      expenses,
      categories: CATEGORIE.map((c) => ({
        id: c.id,
        createdAt: istante(INIZIO, 8, 0),
        updatedAt: istante(INIZIO, 8, 0),
        name: c.name,
        emoji: c.emoji,
        color: c.color,
        order: c.order,
        archived: false,
      })),
      recurringRules,
      // **Due budget e non uno**, ed e' la storicizzazione resa visibile: il
      // primo si **chiude** e il secondo comincia il giorno dopo, invece di
      // riscrivere il primo. E' cio' che impedisce a un aumento di oggi di
      // riscrivere i totali delle settimane passate — che sono gia' state
      // vissute contro un altro numero.
      //
      // L'ha chiesta `demo.test.ts`: senza il secondo record, `effectiveTo` non
      // compariva da nessuna parte e le Statistiche avrebbero mostrato otto
      // settimane confrontate con un budget solo.
      budgets: [
        {
          id: 'demo-budget-1',
          createdAt: istante(INIZIO, 8, 0),
          updatedAt: istante(CAMBIO_BUDGET, 9, 0),
          period: 'weekly',
          amountCents: 14_000,
          effectiveFrom: INIZIO,
          effectiveTo: giorno(CAMBIO_BUDGET, -1),
        },
        {
          id: 'demo-budget-2',
          createdAt: istante(CAMBIO_BUDGET, 9, 0),
          updatedAt: istante(CAMBIO_BUDGET, 9, 0),
          period: 'weekly',
          amountCents: 16_000,
          effectiveFrom: CAMBIO_BUDGET,
        },
      ],
      settings: {
        id: 'settings',
        createdAt: istante(INIZIO, 8, 0),
        updatedAt: istante(OGGI, 8, 0),
        weekStartsOn: 1,
        theme: 'auto',
        schemaVersion: 6,
        language: 'en',
        onboardingCompletedAt: istante(INIZIO, 8, 5),
        lastBackupAt: ESPORTATO,
      },
    },
  }
}

const file = costruisci()
writeFileSync('docs/demo.json', `${JSON.stringify(file, null, 2)}\n`)

const vive = file.data.expenses.filter((e) => e.deletedAt === undefined)
const settimana = vive.filter((e) => e.date >= giorno(OGGI, -3) && e.date <= OGGI)
const speso = settimana.filter((e) => e.source === 'manual').reduce((n, e) => n + e.amountCents, 0)
console.log(`\n  docs/demo.json — ${vive.length} spese, ${file.data.recurringRules.length} regole`)
console.log(`  oggi ${OGGI} (giovedi'), budget 160,00 EUR/settimana`)
console.log(`  speso da lunedi': ${(speso / 100).toFixed(2)} EUR -> restano ${((16_000 - speso) / 100).toFixed(2)} EUR\n`)
