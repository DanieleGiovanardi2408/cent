/**
 * Budget storicizzati e metriche del periodo.
 *
 * ## Perche' i budget non si modificano
 *
 * Un budget non e' un'impostazione, e' un fatto datato: "da meta' luglio in poi
 * la soglia era 800". Se cambiare il numero riscrivesse il record, luglio
 * cambierebbe risposta a posteriori e lo storico direbbe una cosa diversa ogni
 * volta che lo si guarda. Quindi un record non si tocca mai: si **chiude** con
 * `effectiveTo` e se ne apre uno nuovo. Chi decide quali record scrivere e'
 * `planResolvedBudgetChange`, e gira **dentro la transazione** di scrittura.
 *
 * ## Quale record vale per un periodo
 *
 * Il budget di un periodo e' quello in vigore il giorno `min(oggi, ultimo giorno
 * del periodo)`.
 *
 * - Per un periodo passato e' l'ultimo giorno del periodo: il budget con cui quel
 *   mese e' stato vissuto. Un cambio fatto oggi ha `effectiveFrom` di oggi, non
 *   copre quel giorno, e non lo tocca. E' l'invariante che il test protegge.
 * - Per il periodo corrente e' oggi: alzare il budget stamattina si vede subito
 *   sulla Home. L'alternativa (il budget del primo giorno del periodo) renderebbe
 *   ogni modifica invisibile fino al periodo successivo, che e' un bug travestito
 *   da coerenza.
 *
 * ## Quali spese conta (ADR 016)
 *
 * **Non tutte.** Le spese con `source: 'recurring'` restano fuori: il budget
 * serve a decidere se prendere quel caffe', e l'affitto non e' una decisione.
 * Un canone da 900 dentro una settimana da 200 renderebbe la settimana del
 * primo sempre catastrofica, e "puoi spendere ~X al giorno" — il numero che il
 * brief chiama il piu' utile — diventerebbe un numero che nessuno guarda piu'.
 *
 * Il confine e' `countsTowardBudget`, e vale **solo in questo file**: Storico e
 * statistiche continuano a mostrare tutto, perche' quelle uscite sono uscite
 * vere. Perche' l'esclusione non diventi un'omissione, `BudgetMetrics` porta
 * anche `recurringSpentCents`: il numero che il budget non conta, disponibile a
 * chi deve dirlo.
 */

import { addDays, daysBetween, endOfMonth, endOfWeek, isAfter, isBefore, startOfMonth, startOfWeek } from './date'
import type { IsoDate } from './date'
import { divideCents, sumCents } from './money'
import type { Cents } from './money'
import type { Budget, BudgetPeriod, Expense, Timestamp } from './types'

export interface PeriodRange {
  readonly start: IsoDate
  readonly end: IsoDate
}

/** Il periodo (settimana con lunedi', o mese) che contiene `onDate`. */
export function periodRange(period: BudgetPeriod, onDate: IsoDate): PeriodRange {
  return period === 'weekly'
    ? { start: startOfWeek(onDate), end: endOfWeek(onDate) }
    : { start: startOfMonth(onDate), end: endOfMonth(onDate) }
}

function coversDay(budget: Budget, day: IsoDate): boolean {
  if (isBefore(day, budget.effectiveFrom)) return false
  return budget.effectiveTo === undefined || !isAfter(day, budget.effectiveTo)
}

/**
 * Vero se `candidate` deve prevalere su `best`. **Ordine totale**: due record
 * distinti non sono mai a pari merito, quindi l'esito non dipende dall'ordine in
 * cui l'array li presenta.
 *
 * 1. `effectiveFrom` piu' recente. E' la regola vera: l'ultima decisione
 *    dell'utente vince sulle precedenti.
 * 2. A parita' di giorno, `createdAt` piu' recente. Confronto lessicografico su
 *    ISO 8601 in UTC (`nowTimestamp`), che per queste stringhe coincide con
 *    l'ordine cronologico.
 * 3. A parita' anche di quello, `id` piu' grande. Non ha nessun significato di
 *    dominio: e' li' perche' due record scritti nello stesso millisecondo
 *    esistono (un import generato a macchina, un orologio a bassa risoluzione) e
 *    un pareggio residuo riporterebbe la scelta a dipendere dall'ordine
 *    dell'array — cioe' la Home mostrerebbe due numeri diversi a seconda di come
 *    IndexedDB ha restituito i record.
 */
function prevails(candidate: Budget, best: Budget): boolean {
  if (candidate.effectiveFrom !== best.effectiveFrom) {
    return isAfter(candidate.effectiveFrom, best.effectiveFrom)
  }
  if (candidate.createdAt !== best.createdAt) return candidate.createdAt > best.createdAt
  return candidate.id > best.id
}

/**
 * Il record di budget in vigore il giorno `onDay`, o `null` se non ce n'e'.
 *
 * ## La risoluzione e' totale: mai un throw, mai una scelta arbitraria
 *
 * Le sovrapposizioni non dovrebbero esistere — `planResolvedBudgetChange` chiude
 * il record vecchio nella stessa transazione in cui apre il nuovo — ma possono
 * arrivare lo stesso: un JSON modificato a mano e reimportato, un bug futuro.
 * Di fronte a due record aperti sullo stesso `period` questa funzione applica
 * `prevails`, che e' un ordine totale: stesso dato, stessa risposta, sempre.
 *
 * Non lancia. Un comparatore che lancia rende inutilizzabile l'intera vista che
 * lo usa: qui vorrebbe dire la Home bianca al posto di "quanto posso spendere",
 * per un dato sporco che l'utente non ha modo di aver causato e non ha modo di
 * correggere. E' la stessa dottrina di `compareIsoDates`.
 */
export function resolveBudget(
  budgets: readonly Budget[],
  period: BudgetPeriod,
  onDay: IsoDate,
): Budget | null {
  let best: Budget | null = null
  for (const budget of budgets) {
    if (budget.period !== period) continue
    if (!coversDay(budget, onDay)) continue
    if (best === null || prevails(budget, best)) best = budget
  }
  return best
}

export interface BudgetMetrics {
  readonly period: BudgetPeriod
  readonly range: PeriodRange
  /** `null` = nessun budget definito per questo periodo. */
  readonly budgetCents: Cents | null
  /**
   * `effectiveFrom` del record risolto, cioe' **da che giorno il budget e' in
   * vigore**. `null` esattamente quando `budgetCents` e' `null`.
   *
   * Serve a distinguere due situazioni che senza questo campo hanno gli stessi
   * numeri e sono fatti diversi:
   *
   * - **budget nato a meta' periodo** (`> range.start`): si imposta il primo
   *   budget settimanale mercoledi' avendo gia' speso 240,00 lunedi' e martedi'.
   *   `remainingCents` esce negativo, ma non si e' sforato niente: il budget non
   *   c'era ancora quando quei soldi sono usciti.
   * - **budget bruciato** (`=== range.start`, o precedente): il budget copriva
   *   tutto il periodo e le spese lo hanno consumato davvero.
   *
   * Chi mostra i numeri puo' cosi' dire "budget attivo da mercoledi'" invece di
   * far passare per sforamento un budget appena nato.
   *
   * **Non e' un pro-rata**: il budget non viene ridotto in proporzione ai giorni
   * rimasti, e `budgetCents`/`remainingCents` non cambiano significato. "200 a
   * settimana" dichiara un ritmo, non un fondo per i giorni che restano. Questo
   * campo e' un fatto in piu' da raccontare, non un correttivo al calcolo.
   *
   * Puo' anche essere **precedente** a `range.start` (il caso normale: un budget
   * aperto mesi fa). Il confronto utile e' `budgetEffectiveFrom > range.start`.
   *
   * Da solo non basta: `> range.start` vuol dire "il record in vigore oggi e'
   * stato aperto a periodo gia' cominciato", e questo succede sia al primo budget
   * in assoluto sia a un budget **modificato** a meta' periodo. A separarli c'e'
   * `budgetCoveredPeriodStart`.
   */
  readonly budgetEffectiveFrom: IsoDate | null
  /**
   * Vero se un budget dello stesso `period` era in vigore il **primo giorno
   * del periodo** (`range.start`).
   *
   * Esiste per qualificare `budgetEffectiveFrom > range.start`, che da solo
   * confonde due storie diverse:
   *
   * - `false` -> **non c'era nessuna regola** all'inizio del periodo. E' il primo
   *   budget, nato a periodo gia' cominciato: le spese fatte prima sono state
   *   fatte senza budget, e un `remainingCents` negativo non e' uno sforamento.
   *   Qui la Home ha qualcosa da spiegare.
   * - `true` -> un budget c'era gia' dal primo giorno, e mercoledi' l'utente lo ha
   *   semplicemente **cambiato**. Non c'e' niente da spiegare: la regola esisteva
   *   e il residuo negativo e' un residuo negativo.
   *
   * Senza questo campo la frase "prima non avevi un budget" verrebbe mostrata
   * anche a chi un budget ce l'aveva: l'app rimprovererebbe per una regola che
   * non esisteva. E' il difetto che ADR 010 esiste per correggere.
   *
   * **Vale `false` quando non c'e' budget oggi** (`budgetCents === null`), senza
   * guardare il passato. Scelta deliberata: il campo qualifica
   * `budgetEffectiveFrom`, e se non c'e' un budget da qualificare non c'e' niente
   * da dire. L'unico caso in cui questo diverge dalla domanda letterale e' un
   * record chiuso a meta' periodo e mai riaperto — che `planResolvedBudgetChange`
   * non produce mai (chiude solo aprendo) e che quindi puo' arrivare solo da un
   * JSON modificato a mano. Chi avesse davvero bisogno della domanda letterale la
   * faccia a `resolveBudget(budgets, period, range.start)`.
   */
  readonly budgetCoveredPeriodStart: boolean
  /**
   * **Un solo budget ha coperto questo periodo per intero**, quindi il periodo si
   * puo' confrontare con un tetto e il confronto ha una risposta.
   *
   * ## L'argomento, che e' il campo
   *
   * Un periodo e' confrontabile con un budget **solo se un unico budget lo ha
   * coperto dal primo all'ultimo giorno**. Altrimenti il confronto non ha una
   * risposta — non una risposta approssimata, **nessuna** — e chi disegna non
   * deve suggerirne una.
   *
   * I due casi in cui e' falso pur essendoci un budget oggi:
   *
   * - **nato dentro il periodo.** Budget creato domenica 23, settimana 17–23:
   *   copriva **un giorno su sette**. Una barra da 136,45 su una traccia da 200
   *   legge "sei stato bravo", e non e' una lettura sbagliata del grafico — e' il
   *   grafico che afferma una cosa che i dati non sostengono. E' **la prima
   *   settimana di chiunque**: si installa l'app, si segna, e il budget si mette
   *   dopo.
   * - **cambiato dentro il periodo.** Budget 200 da lunedi', portato a 250
   *   mercoledi'. `budgetCoveredPeriodStart` e' **vero** (un budget c'era il
   *   primo giorno) e la traccia sarebbe 250, con i primi tre giorni confrontati
   *   con un tetto che allora non esisteva. E' lo stesso difetto del bordo,
   *   spostato al centro.
   *
   * ## Perche' non basta `budgetCoveredPeriodStart`
   *
   * Quel campo risponde a *"c'era una regola il primo giorno?"*, ed esiste per
   * una domanda diversa: distinguere **"non avevi un budget"** da **"l'hai
   * cambiato"**, cioe' decidere se la Home ha qualcosa da spiegare. La sua
   * documentazione dice, del secondo caso, *"non c'e' niente da spiegare"* — ed
   * e' vero **del residuo**, dove ADR 010 stabilisce che il budget e' del periodo
   * intero e il residuo e' quello che e'. Non dice niente sulla
   * **confrontabilita' fra periodi**, che e' un'altra domanda. Stesso fatto, due
   * domande, e "taci" vale solo per la prima.
   *
   * I due campi restano entrambi: hanno insiemi di verita' diversi e servono a
   * decisioni diverse. Non si semplifica l'uno nell'altro.
   *
   * ## La forma, e perche' non e' una scansione
   *
   * Si risolve il budget sui **due estremi** e si confrontano gli id. Basta
   * perche' `coversDay` e' un test su intervallo contiguo: **un record che copre
   * i due estremi copre ogni giorno in mezzo**, per costruzione.
   *
   * Una scansione dei record con `effectiveFrom` interno all'intervallo avrebbe
   * preso il cambio a meta' periodo — che `planResolvedBudgetChange` produce
   * sempre cosi', chiudendo l'aperto a `effectiveFrom - 1` e aprendone uno nuovo
   * — ma **non** avrebbe preso un buco: record A fino a mercoledi', record B da
   * venerdi', giovedi' scoperto. L'app non lo produce (chiude solo aprendo), un
   * JSON scritto a mano si'. Qui gli id sono diversi e il campo e' falso.
   *
   * ## Chi lo legge, e la conseguenza su `referenceDay`
   *
   * Le statistiche (fase 6): la traccia del budget si disegna **se e solo se**
   * questo campo e' vero. Il predicato sta qui e non nel componente perche' una
   * congiunzione scritta al chiamante viene "semplificata" in
   * `budgetCents !== null` da qualcuno fra sei mesi, con i test verdi perche' nei
   * dati di prova le due cose coincidono. E' la mossa dell'id deterministico e di
   * `ConfirmedPreview`: la scelta sbagliata non e' sconsigliata, e'
   * inesprimibile.
   *
   * E ne segue che **chi si fida di questo campo non dipende dal giorno su cui
   * `referenceDay` risolve** (vedi il suo commento in `computeBudgetMetrics`): se
   * un solo record copre tutto il periodo, risolverlo all'inizio, alla fine o in
   * mezzo da' lo stesso record; e se non lo copre, il campo e' falso e non c'e'
   * nessuna traccia da disegnare.
   */
  readonly comparableToBudget: boolean
  /**
   * Speso nel periodo **secondo il budget**: spese vive, ricorrenti escluse
   * (ADR 016). Non e' il totale del periodo — quello lo mostrano Storico e
   * statistiche, e vale `spentCents + recurringSpentCents`.
   */
  readonly spentCents: Cents
  /**
   * Speso in ricorrenti nello stesso periodo: la parte **esclusa** dal budget.
   *
   * E' qui perche' l'esclusione si possa dire invece che subire. Zero quando
   * nel periodo non e' scattata nessuna regola, ed e' il segnale con cui la
   * Home decide di **non** dire niente: annunciare "oltre alle spese fisse"
   * dove le fisse non ci sono e' lo stesso difetto di `startNote` che spiegava
   * un numero normale.
   *
   * Non entra in nessun altro campo di questa struttura: non tocca
   * `remainingCents`, ne' il passo, ne' la disponibilita' giornaliera.
   */
  readonly recurringSpentCents: Cents
  /** Budget meno speso. Negativo se si e' sforato. `null` senza budget. */
  readonly remainingCents: Cents | null
  readonly daysTotal: number
  /** Giorni gia' passati, oggi escluso. Da mostrare, non da usare come divisore. */
  readonly daysElapsed: number
  /** Giorni che restano, **oggi incluso**. 0 se il periodo e' finito. */
  readonly daysRemaining: number
  /**
   * I giorni del periodo **davvero vissuti, oggi compreso**. Su un periodo
   * passato vale `daysTotal`; su uno futuro, 1.
   *
   * E' il divisore di `currentPaceCents` — l'arco su cui `spentCents` e' stato
   * speso — ed era una costante locale finche' lo usava solo lui.
   *
   * Esce allo scoperto per **un secondo lettore**: le statistiche disegnano la
   * parte di periodo **non ancora accaduta** come `daysTotal - daysLived`, che a
   * periodo chiuso vale zero. Cosi' l'incompletezza di un periodo in corso e' un
   * dato e non un ramo del disegno — la settimana finita e quella a meta' passano
   * per la stessa espressione, e la differenza sta nei numeri.
   *
   * ## Questo elenco diceva due lettori, e uno e' durato meno di un giorno
   *
   * Il secondo era il **budget maturato** (`budgetCents * daysLived / daysTotal`),
   * il segno contro cui leggere se il passo e' alto. E' stato calcolato,
   * dichiarato in un campo, difeso in un paragrafo di commit — e **mai dipinto**:
   * il componente posizionava il segno con una moltiplicazione di frazioni, e
   * l'unico lettore del campo era il suo test. E' stato tagliato al primo gate
   * come cucitura aperta solo per i test, terzo caso dopo `expensesInRange` e
   * `planBudgetChange`.
   *
   * Resta qui la parte che vale ancora, perche' il giorno in cui il maturato
   * tornera' come numero **da mostrare** qualcuno rifara' la domanda: si calcola
   * dal budget e dai giorni, **mai** come `sustainablePaceCents * daysLived`.
   * Sembrano la stessa cosa e non lo sono — 28,57 x 7 fa **199,99**, quindi a
   * periodo chiuso il segno cadrebbe un centesimo prima della fine della traccia,
   * per sempre e invisibile a occhio.
   *
   * E la lezione che il campo si porta dietro: **un argomento che elenca i propri
   * lettori va riletto quando uno se ne va**, o motiva un'esistenza pubblica con
   * qualcuno che non c'e' piu'.
   *
   * **Oggi conta come vissuto**, e la ragione e' gia' scritta sotto
   * `currentPaceCents`: `spentCents` somma tutto il periodo fino a oggi incluso,
   * quindi mettere i giorni di spesa contro i giorni finiti sarebbe n/(n-1) —
   * uno sforo dichiarato per costruzione, ogni giorno, proprio quando c'e' ancora
   * tempo per correggere. Quell'argomento non nomina il passo: nomina cosa
   * contiene `spentCents`, e vale identico qui.
   */
  readonly daysLived: number
  /** Rimanente diviso i giorni che restano. `null` a periodo finito o senza budget. */
  readonly dailyAllowanceCents: Cents | null
  /**
   * Media spesa al giorno **sui giorni vissuti, oggi compreso**.
   *
   * Il divisore e' `daysElapsed + 1`, non `daysElapsed`: `spentCents` somma
   * tutto il periodo fino a oggi incluso, quindi dividere per i giorni finiti
   * sarebbe n/(n-1) — il secondo giorno del periodo raddoppierebbe il passo, e
   * sempre in eccesso, proprio nei giorni in cui c'e' ancora tempo per
   * correggere. Su un periodo passato il divisore vale `daysTotal`.
   *
   * `null` il primo giorno e prima che il periodo cominci: una media su un
   * giorno appena iniziato non e' un passo, e' l'ultima spesa.
   */
  readonly currentPaceCents: Cents | null
  /** Budget diviso i giorni totali: il passo che si potrebbe tenere. */
  readonly sustainablePaceCents: Cents | null
}

export interface BudgetMetricsInput {
  readonly expenses: readonly Expense[]
  readonly budgets: readonly Budget[]
  readonly period: BudgetPeriod
  /** Un giorno qualsiasi del periodo da calcolare. */
  readonly onDate: IsoDate
  /** Oggi: decide giorni rimanenti e budget vigente. */
  readonly today: IsoDate
}

/**
 * Vero se questa spesa entra nel budget (ADR 016).
 *
 * Due condizioni, e sono due fatti diversi:
 *
 * - **non cancellata**: un soft delete non e' un'uscita. Vale ovunque, ed e' la
 *   stessa regola di `isLive` in `stats.ts`;
 * - **non generata da una regola**: il budget serve a decidere se prendere quel
 *   caffe', e l'affitto non e' una decisione. Vale **solo qui**.
 *
 * ## Perche' `source` e non un campo nuovo
 *
 * Creare una regola ricorrente **e'** l'atto con cui l'utente dichiara che
 * quella spesa e' fissa. Il proxy non e' un'euristica che indovina: e' un fatto
 * gia' scritto, con un gesto che aveva gia' un altro scopo e che quindi non puo'
 * essere frainteso. Stessa forma dell'identita' deterministica (ADR 006): non si
 * sorveglia una condizione, si usa qualcosa che esiste gia'. Nessun campo nuovo,
 * nessuna migrazione.
 *
 * ## Dove **non** vale
 *
 * Storico e statistiche mostrano tutto: `groupByDay`, `spentByCategory` e
 * `lastWeeksTotals` filtrano solo `deletedAt` e continueranno a farlo. Quelle
 * sono uscite vere, uscite davvero. Una spesa che sparisce dallo Storico
 * sarebbe una bugia sui dati; una che non entra nel budget e' una scelta su
 * cosa quel numero misura.
 */
export function countsTowardBudget(expense: Expense): boolean {
  return expense.deletedAt === undefined && expense.source !== 'recurring'
}

function inRange(expense: Expense, range: PeriodRange): boolean {
  return !isBefore(expense.date, range.start) && !isAfter(expense.date, range.end)
}

/**
 * Somma delle spese che il budget conta in `[start, end]`: vive **e non
 * ricorrenti** (ADR 016).
 *
 * ## Nota per chi arriva da `totalSpent`
 *
 * Questa funzione si chiamava cosi', e sommava tutte le spese vive. Il nome e'
 * cambiato insieme alla semantica, di proposito: una `totalSpent` che ne
 * escludesse silenziosamente una parte sarebbe esattamente il numero che mente
 * per omissione contro cui ADR 016 e' scritta, e ogni chiamante futuro
 * l'avrebbe usata credendo il contrario. Con il nome nuovo, chi vuole il totale
 * vero di un periodo non lo trova per sbaglio: lo chiede a `recurringSpent` in
 * piu', o passa dalle funzioni dello Storico.
 */
export function budgetSpent(expenses: readonly Expense[], range: PeriodRange): Cents {
  const values: Cents[] = []
  for (const expense of expenses) {
    if (!countsTowardBudget(expense)) continue
    if (!inRange(expense, range)) continue
    values.push(expense.amountCents)
  }
  return sumCents(values)
}

/**
 * L'altra meta': le spese vive **generate da una regola** nello stesso
 * intervallo, cioe' esattamente cio' che il budget non conta.
 *
 * Esiste perche' l'esclusione si possa **dire con un numero**. Una Home che
 * escludesse le fisse senza nominarle mostrerebbe un residuo giusto e
 * incomprensibile; con questo, la riga "oltre a N di spese fisse" e' scrivibile,
 * e — come `startNote` — puo' sparire da sola quando il numero e' zero, invece
 * di annunciare un'esclusione che in quel periodo non ha tolto niente.
 *
 * Le spese cancellate restano fuori anche qui: un soft delete non e' un'uscita
 * ne' dentro ne' fuori dal budget.
 */
export function recurringSpent(expenses: readonly Expense[], range: PeriodRange): Cents {
  const values: Cents[] = []
  for (const expense of expenses) {
    if (expense.deletedAt !== undefined) continue
    if (expense.source !== 'recurring') continue
    if (!inRange(expense, range)) continue
    values.push(expense.amountCents)
  }
  return sumCents(values)
}

export function computeBudgetMetrics(input: BudgetMetricsInput): BudgetMetrics {
  const range = periodRange(input.period, input.onDate)
  /*
   * Il giorno su cui si risolve il budget: oggi, **limitato dentro il periodo**.
   *
   * ## I due rami di limite non hanno chiamanti di produzione
   *
   * L'unico chiamante di produzione e' `Home.tsx`, che passa
   * `onDate: day, today: day` — lo stesso valore. Oggi sta sempre dentro il
   * proprio periodo, quindi **`referenceDay` vale sempre `input.today`** e i due
   * rami non girano mai fuori dai test (cinque chiamate su diciannove in
   * `budget.test.ts`).
   *
   * Sono dichiarati qui invece di essere scoperti dal primo chiamante che li
   * raggiunge. La semantica che portano, se qualcuno li raggiunge, e': **un
   * periodo passato viene misurato contro il budget in vigore il suo ultimo
   * giorno**, qualunque frazione del periodo quel budget abbia coperto. E'
   * difendibile — e' l'ultima decisione che si applicava a quel periodo — ma non
   * era scritta, e non essere scritta e' il difetto.
   *
   * ## E le statistiche non ne dipendono, di proposito
   *
   * Il primo chiamante che passera' un `onDate` passato sono le statistiche, che
   * disegnano una riga per periodo. Non ereditano questa semantica: disegnano il
   * confronto **solo** dove `comparableToBudget` e' vero, e li' un solo record
   * copre tutto il periodo — quindi risolvere all'inizio, alla fine o in mezzo
   * da' lo stesso record e la scelta del giorno non e' osservabile. Dove
   * differirebbe, non c'e' niente da disegnare.
   */
  const referenceDay = isBefore(input.today, range.start)
    ? range.start
    : isAfter(input.today, range.end)
      ? range.end
      : input.today

  const budget = resolveBudget(input.budgets, input.period, referenceDay)
  const budgetCents = budget?.amountCents ?? null
  const spentCents = budgetSpent(input.expenses, range)
  // Calcolato ma tenuto fuori da ogni altro numero: serve a **dichiarare**
  // l'esclusione, non a correggerla.
  const recurringSpentCents = recurringSpent(input.expenses, range)

  const daysTotal = daysBetween(range.start, range.end) + 1
  const daysRemaining = isAfter(input.today, range.end)
    ? 0
    : isBefore(input.today, range.start)
      ? daysTotal
      : daysBetween(input.today, range.end) + 1
  const daysElapsed = daysTotal - daysRemaining
  // I giorni davvero vissuti del periodo, oggi compreso: e' il divisore del
  // passo attuale, perche' e' l'arco su cui `spentCents` e' stato speso. Adesso
  // esce anche nell'esito — vedi il campo, che ne ha due lettori in piu'.
  const daysLived = daysBetween(range.start, referenceDay) + 1

  /*
   * Confrontabile con un budget solo se **un unico record** copre i due estremi.
   * L'argomento per esteso sta sul campo `comparableToBudget`; qui basta notare
   * che le due risoluzioni sono su `range.start` e `range.end` e **non** su
   * `referenceDay`: la domanda riguarda il periodo, non il giorno da cui lo si
   * guarda.
   */
  const atStart = resolveBudget(input.budgets, input.period, range.start)
  const atEnd = resolveBudget(input.budgets, input.period, range.end)

  const remainingCents = budgetCents === null ? null : budgetCents - spentCents

  return {
    period: input.period,
    range,
    budgetCents,
    budgetEffectiveFrom: budget?.effectiveFrom ?? null,
    // Seconda risoluzione, sul primo giorno del periodo invece che su oggi: e'
    // la sola domanda che distingue "non avevi un budget" da "l'hai cambiato".
    budgetCoveredPeriodStart: budget !== null && atStart !== null,
    comparableToBudget: atStart !== null && atEnd !== null && atStart.id === atEnd.id,
    spentCents,
    recurringSpentCents,
    remainingCents,
    daysTotal,
    daysElapsed,
    daysRemaining,
    daysLived,
    dailyAllowanceCents:
      remainingCents === null || daysRemaining === 0 ? null : divideCents(remainingCents, daysRemaining),
    currentPaceCents: daysElapsed === 0 ? null : divideCents(spentCents, daysLived),
    sustainablePaceCents: budgetCents === null ? null : divideCents(budgetCents, daysTotal),
  }
}

export interface BudgetChange {
  readonly period: BudgetPeriod
  readonly amountCents: Cents
  /** Da quando vale il nuovo importo. Di norma oggi. */
  readonly effectiveFrom: IsoDate
}

/**
 * La stessa richiesta di `BudgetChange` con orologio e id **gia' risolti**.
 *
 * E' la forma che viaggia fino alla transazione di scrittura (vedi
 * `WriteBatch.budgetChange`): la pianificazione va fatta sui budget che stanno
 * sul disco in quel momento, ma l'istante della modifica e l'id del record nuovo
 * restano decisi da chi ha premuto il tasto. Cosi' la pianificazione e' una
 * funzione pura dei suoi ingressi, e rifare la stessa scrittura dopo una
 * connessione caduta riusa lo stesso id invece di creare un secondo record.
 */
export interface BudgetChangeRequest {
  readonly period: BudgetPeriod
  readonly amountCents: Cents
  readonly effectiveFrom: IsoDate
  /** L'istante della modifica: finisce in `updatedAt`, e in `createdAt` del nuovo. */
  readonly timestamp: Timestamp
  /** L'id del record da aprire. Usato solo se un record nuovo serve davvero. */
  readonly newRecordId: string
}

/**
 * I record da scrivere per cambiare un budget senza riscrivere il passato.
 *
 * Restituisce sempre l'insieme completo dei record modificati o creati: chiude
 * quello aperto al giorno prima di `effectiveFrom` e ne apre uno nuovo.
 *
 * Unica eccezione: se esiste gia' un record con lo stesso `effectiveFrom` (si e'
 * cambiato idea due volte nello stesso giorno) quello viene aggiornato sul posto.
 * Chiuderlo produrrebbe un record di durata negativa, cioe' spazzatura che non
 * vale per nessun giorno.
 *
 * **`budgets` deve essere lo stato su cui la scrittura andra' davvero ad
 * atterrare.** Pianificare su un mirror vecchio significa non vedere il record
 * aperto da un altro contesto e quindi non chiuderlo: restano due record aperti
 * sovrapposti, per sempre e senza che nessuna schermata li mostri. Per questo il
 * repository non chiama questa funzione per decidere cosa scrivere: manda la
 * richiesta al disco e la pianificazione avviene dentro la transazione.
 */
export function planResolvedBudgetChange(
  budgets: readonly Budget[],
  change: BudgetChangeRequest,
): readonly Budget[] {
  const timestamp = change.timestamp
  const sameKey = budgets.filter((b) => b.period === change.period)

  const sameDay = sameKey.find((b) => b.effectiveFrom === change.effectiveFrom)
  if (sameDay) {
    return [{ ...sameDay, amountCents: change.amountCents, updatedAt: timestamp }]
  }

  const previousDay = addDays(change.effectiveFrom, -1)
  const toClose = sameKey.filter((b) => coversDay(b, previousDay) && b.effectiveTo === undefined)
  const closed = toClose.map<Budget>((b) => ({ ...b, effectiveTo: previousDay, updatedAt: timestamp }))

  const created: Budget = {
    id: change.newRecordId,
    createdAt: timestamp,
    updatedAt: timestamp,
    period: change.period,
    amountCents: change.amountCents,
    effectiveFrom: change.effectiveFrom,
  }
  return [...closed, created]
}
