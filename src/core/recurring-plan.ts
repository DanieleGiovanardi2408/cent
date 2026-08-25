/**
 * Le tre domande che si fanno su una regola **prima** di scrivere qualcosa.
 *
 * 1. **Quanto pesa al mese** (`monthlyCostCents`, `monthlyFixedCosts`): il
 *    numero che sta accanto al budget e che ADR 016 rende obbligatorio.
 * 2. **Cosa succede se la salvo** (`previewMaterialization`): quante spese
 *    arretrate, da quando a quando, per quanto.
 * 3. **Posso cancellarla** (`planRecurringRuleDeletion`).
 * 4. **Posso farla ripartire da prima** (`planRecurringRuleRewind`, ADR 018):
 *    l'unica operazione che fa **arretrare** il segnaposto, e l'unica di questo
 *    file che gira dentro una transazione invece che davanti alla schermata.
 *
 * Tutto puro e sincrono, come `categories.ts`: nessun I/O, nessun orologio
 * implicito, il giorno di riferimento arriva sempre come argomento. Il motore
 * vero — quello che scrive — sta in `recurrence.ts` e non lo si duplica qui:
 * l'anteprima riusa `materializationWindow` e `occurrencesBetween`, che sono le
 * stesse funzioni che la materializzazione esegue davvero.
 */

import { addDays, isAfter, isBefore, isIsoDate } from './date'
import type { IsoDate } from './date'
import type { Cents } from './money'
import {
  materializationWindow,
  nextOccurrenceOnOrAfter,
  occurrencesBetween,
  validateRule,
} from './recurrence'
import type { Cadence, Expense, RecurringRule, Timestamp, WithCadence } from './types'

/* ------------------------------------------------------------------------- *
 * 1. Il totale mensile delle fisse
 * ------------------------------------------------------------------------- */

/**
 * Giorni dell'anno medio gregoriano: 146097 giorni ogni 400 anni.
 *
 * E' il solo punto in cui questo file usa un numero non intero, ed e' il costo
 * dichiarato della normalizzazione a mese.
 */
export const DAYS_PER_YEAR = 365.2425

/** Settimane dell'anno medio: 52,17750. */
export const WEEKS_PER_YEAR = DAYS_PER_YEAR / 7

const MONTHS_PER_YEAR = 12

/**
 * Quante volte all'anno scatta questa regola, ignorando `startDate`, `endDate`
 * e `active`. Un tasso, non un conteggio: e' un numero con la virgola apposta.
 */
function occurrencesPerYear(cadence: Cadence, interval: number): number {
  switch (cadence) {
    case 'daily':
      return DAYS_PER_YEAR / interval
    case 'weekly':
      return WEEKS_PER_YEAR / interval
    case 'monthly':
      return MONTHS_PER_YEAR / interval
  }
}

/**
 * Quanto costa al mese questa regola, in centesimi interi.
 *
 * ## La convenzione, per esteso, perche' e' un'approssimazione dichiarata
 *
 * Si passa **dall'anno**: `mensile = importo x occorrenze_all_anno / 12`, dove
 * l'anno e' l'anno medio gregoriano (365,2425 giorni, cioe' 52,1775 settimane).
 * Poi si arrotonda al centesimo, una volta sola, per regola.
 *
 * Non e' l'unica convenzione possibile ed e' scelta di proposito:
 *
 * - **Il caso piu' comune resta esatto.** Una mensile con `interval: 1` da'
 *   `12/12 = 1`, cioe' l'importo tale e quale. L'affitto — il motivo per cui
 *   questo numero esiste — non subisce nessuna approssimazione.
 * - **L'anno torna.** Dodici volte il numero mensile e' il costo annuo vero, a
 *   meno dell'arrotondamento. E' la proprieta' che conta, perche' questa cifra
 *   verra' confrontata con uno stipendio. Le convenzioni piu' "rotonde" — 4
 *   settimane al mese, 30 giorni al mese — non ce l'hanno: una settimanale da
 *   100 diventerebbe 400 al mese, cioe' 4.800 all'anno contro i 5.217 che escono
 *   davvero. Quattrocento euro di errore l'anno, sempre in difetto, e sempre nel
 *   verso che fa sembrare le fisse piu' leggere di quanto sono.
 *
 * ## Cosa questo numero **non** e'
 *
 * Non e' quanto uscira' **questo** mese. Una settimanale da 100 vale 434,81 al
 * mese, ma il mese con cinque scadenze ne vedra' uscire 500. E' un tasso, non
 * una previsione di cassa: chi vuole sapere che cosa scatta in un mese preciso
 * usa `occurrencesBetween`, che risponde esatto.
 *
 * Non tiene conto di `startDate` ne' di `endDate`: una regola che finisce fra
 * tre giorni pesa qui come una senza scadenza. Il filtro su chi e' in vigore lo
 * fa `monthlyFixedCosts`, che e' l'unico posto in cui quella domanda ha una data
 * a cui riferirsi.
 *
 * ## Una regola non valida vale zero
 *
 * `interval: 0` o `anchorDay: 40` non lanciano: restituiscono 0. E' la stessa
 * dottrina di `resolveBudget` e di `activeCategories` — una funzione di lettura
 * totale, perche' un dato sporco arrivato da un import non deve poter svuotare
 * la schermata che lo mostra.
 */
export function monthlyCostCents(rule: RecurringRule): Cents {
  if (validateRule(rule) !== null) return 0
  const perYear = occurrencesPerYear(rule.cadence, rule.interval)
  return Math.round((rule.amountCents * perYear) / MONTHS_PER_YEAR)
}

export interface FixedCostLine {
  readonly rule: RecurringRule
  /** Il costo mensile normalizzato di questa sola regola. */
  readonly monthlyCents: Cents
}

export interface MonthlyFixedCosts {
  /** La somma delle righe. Interi sommati fra loro: nessun errore accumulato. */
  readonly totalCents: Cents
  /** Le regole che ci sono dentro, dalla piu' pesante. Ordine totale. */
  readonly lines: readonly FixedCostLine[]
}

/**
 * "Fisse: 1.040 € al mese" — il secondo dei due numeri di ADR 016, quello senza
 * il quale il budget mostrato da solo e' un'omissione.
 *
 * Conta le regole **in vigore il giorno `onDate`**, cioe':
 *
 * - `active`;
 * - `startDate <= onDate`: una regola che comincia il mese prossimo non e'
 *   ancora un costo, e metterla dentro direbbe che escono soldi che non escono;
 * - `endDate` assente o `>= onDate`: una regola finita non e' piu' un costo.
 *
 * Le due esclusioni sono deliberate e sono anche il limite dichiarato di questo
 * numero: e' la fotografia di **adesso**, non un piano. Chi vuole vedere in
 * anticipo il peso di una regola futura ha `monthlyCostCents` sulla singola
 * regola, che non guarda le date.
 *
 * L'arrotondamento e' per riga e poi si sommano interi: il totale mostrato e'
 * sempre esattamente la somma delle righe mostrate. L'alternativa — sommare i
 * float e arrotondare alla fine — darebbe un totale che a volte non torna con
 * l'elenco sotto, che e' il modo piu' rapido per far dubitare di tutti i numeri
 * della schermata.
 */
export function monthlyFixedCosts(
  rules: readonly RecurringRule[],
  onDate: IsoDate,
): MonthlyFixedCosts {
  const lines: FixedCostLine[] = []
  let totalCents = 0
  for (const rule of rules) {
    if (!rule.active) continue
    if (isBefore(onDate, rule.startDate)) continue
    if (rule.endDate !== undefined && isAfter(onDate, rule.endDate)) continue
    // Una regola non valida non compare nemmeno come riga da zero: non e' un
    // costo, e' un record rotto. `monthlyCostCents` la porterebbe a 0 lo stesso,
    // ma una riga "Affitto — 0,00 €" e' un numero sbagliato con l'aria di
    // essere giusto.
    if (validateRule(rule) !== null) continue
    const monthlyCents = monthlyCostCents(rule)
    lines.push({ rule, monthlyCents })
    totalCents += monthlyCents
  }
  // Ordine totale: importo, poi id. Due regole da 900 non devono scambiarsi di
  // posto a seconda di come il mirror le ha restituite.
  lines.sort((a, b) => b.monthlyCents - a.monthlyCents || (a.rule.id < b.rule.id ? -1 : 1))
  return { totalCents, lines }
}

/* ------------------------------------------------------------------------- *
 * 2. L'anteprima, prima di scrivere
 * ------------------------------------------------------------------------- */

/**
 * Una regola **non ancora salvata**: i campi che decidono il calendario e
 * l'importo, senza id ne' timestamp.
 *
 * `categoryId` non c'e' perche' non entra in nessuno dei numeri qui sotto. Una
 * `RecurringRule` vera e' comunque assegnabile a questo tipo — e va bene, con
 * `lastMaterializedDate` incluso: l'anteprima di una regola gia' esistente
 * risponde alla stessa domanda ("cosa scrive la prossima materializzazione"),
 * ed e' cio' che serve per riattivare una regola rimasta ferma dei mesi.
 */
export interface RecurrenceDraftCommon {
  readonly amountCents: Cents
  readonly interval: number
  readonly startDate: IsoDate
  readonly endDate?: IsoDate
  /**
   * Presente solo per una regola che esiste gia'. Assente su una regola nuova,
   * ed e' l'assenza che produce l'arretrato: si parte da `startDate`.
   */
  readonly lastMaterializedDate?: IsoDate
}

/**
 * La bozza si divide sulla cadenza **con lo stesso tipo della regola**
 * (`WithCadence`), e non con una copia che gli somiglia.
 *
 * E' la riga che impedisce di riaprire il buco da un'altra parte: la bozza e'
 * l'unico ingresso da cui un calendario entra in un record, quindi se qui
 * l'ancora tornasse opzionale, il compilatore ammetterebbe di nuovo una mensile
 * senza ancora e a raccoglierla sarebbe `ruleShape`. Con un tipo solo, una
 * mensile senza ancora non e' scrivibile ne' come regola ne' come bozza.
 */
export type RecurrenceDraft = WithCadence<RecurrenceDraftCommon>

/**
 * **L'impronta economica di un'anteprima**: quante spese ha annunciato e per
 * quanti centesimi in tutto.
 *
 * Non e' un riassunto per comodita': e' la parte dell'annuncio che chi scrive
 * puo' **ri-derivare da solo** e confrontare, dentro la transazione, con quello
 * che era stato mostrato.
 *
 * ## Perche' non viaggiano le date gia' calcolate
 *
 * L'implementazione naturale sarebbe che l'anteprima calcoli le date e la
 * conferma le passi allo scrittore. E' esattamente il caso che ADR 008 vieta:
 * attraversa il confine della persistenza l'**intenzione**, non il **risultato
 * gia' calcolato**. L'anteprima produce numeri **da mostrare**; la transazione
 * **ri-deriva** dai record che ci sono sul disco in quel momento, e confronta.
 *
 * Se i due non coincidono non si scrive niente: l'anteprima non descrive piu'
 * cio' che accadrebbe, e cio' che l'utente ha letto e' scaduto.
 *
 * ## Che cosa questo confronto aggiunge alla guardia di ADR 017
 *
 * La guardia di ADR 017 e' **temporale**: protegge dal cambio di giorno civile
 * fra il calcolo e la conferma. Questa la estende a cio' che conta davvero:
 * **che l'insieme sia ancora quello**. *"L'anteprima ha detto il vero"* smette
 * di essere una speranza e diventa una condizione **verificata al momento della
 * scrittura**.
 *
 * ## Perche' ci sono anche i due estremi, e non solo i due numeri
 *
 * `count` e somma da soli sono un'impronta **economica**, e lasciano passare
 * esattamente il caso che si e' presentato: **l'ancora mensile che si sposta**.
 * Una regola mensile la cui anteprima e' stata calcolata sul giorno 1 e che sul
 * disco, nel frattempo, ha preso `anchorDay: 23` produce lo **stesso numero di
 * occorrenze** e la **stessa somma** — ma su giorni tutti diversi. L'utente ha
 * confermato "8 spese, 7.200 €, dal 1 gennaio al 1 agosto" e otterrebbe 8 spese
 * da 7.200 € su otto date che non ha mai letto, in otto periodi diversi da
 * quelli che gli erano stati mostrati.
 *
 * Quindi `firstDate` e `lastDate` viaggiano nell'impronta e si confrontano come
 * gli altri due. Non sono le date **tutte** — quelle restano fuori, ADR 008: chi
 * scrive le ri-deriva — sono i due estremi dell'intervallo annunciato, cioe' la
 * parte del calendario che l'anteprima ha davvero messo sotto gli occhi
 * dell'utente ("dal ... al ...").
 *
 * ## Cosa resta scoperto, dichiarato
 *
 * Due insiemi con stesso conteggio, stessa somma **e** stessi estremi ma con i
 * giorni in mezzo diversi passano ancora. Serve un calendario cambiato in modo
 * da conservare quattro numeri invece di due: nessuna delle modifiche
 * raggiungibili da questa app lo fa.
 */
export interface PreviewFootprint {
  /** Quante spese l'anteprima ha annunciato. */
  readonly count: number
  /** La somma annunciata, in centesimi interi. */
  readonly totalCents: Cents
  /** Il primo giorno annunciato, `null` se non c'era nessuna occorrenza. */
  readonly firstDate: IsoDate | null
  /** L'ultimo giorno annunciato, `null` se non c'era nessuna occorrenza. */
  readonly lastDate: IsoDate | null
}

export interface MaterializationPreview {
  /** Quante spese verrebbero scritte. Esatto, non un campione. */
  readonly count: number
  /** La prima, o `null` se non ce n'e' nessuna. */
  readonly firstDate: IsoDate | null
  /** L'ultima, o `null`. */
  readonly lastDate: IsoDate | null
  /** `count` per l'importo della regola. */
  readonly totalCents: Cents
  /**
   * La prima occorrenza **fuori** dalla finestra: quella che questa
   * materializzazione **non** genera e che nessuna materializzazione precedente
   * ha gia' generato. `null` se la regola e' finita (`endDate` passata).
   *
   * ## Il punto d'ancoraggio, che e' l'unica cosa da decidere qui
   *
   * E' `nextOccurrenceOnOrAfter(rule, addDays(bordoConsiderato, 1))`, dove
   * `bordoConsiderato` e' **il piu' avanti fra `today` e il segnaposto**.
   *
   * `today` perche' la finestra di `materializationWindow` chiude li', incluso:
   * tutto cio' che cade fino a oggi lo scrive questa materializzazione, quindi
   * la prima che *non* scrive e' la prima da domani in poi.
   *
   * Il segnaposto perche' puo' trovarsi **oltre** `today` senza che nessuno
   * abbia sbagliato: un orologio che arretra, un fuso attraversato verso ovest,
   * un import. In quel caso la finestra e' vuota (`from > to`) e le occorrenze
   * fra domani e il segnaposto sono gia' nello Storico — annunciarle come
   * "prima spesa" sarebbe di nuovo un numero che lo schermo non conferma. Il
   * segnaposto **non** viene mai arretrato da qui: si legge e basta (ADR 018).
   *
   * ## Perche' non e' `window.from`
   *
   * L'altro ancoraggio proposto era il bordo **inferiore** della finestra
   * (`max(startDate, segnaposto + 1)`, cioe' `window.from`). Sulla finestra
   * vuota — regola che parte nel futuro, il caso che ha motivato questo campo —
   * i due coincidono, perche' `nextOccurrenceOnOrAfter` alza comunque il pavimento
   * a `startDate`: entrambi rispondono 15 settembre per un'ancora 15 che parte il
   * 5 settembre.
   *
   * Divergono dove la finestra **non** e' vuota, e li' `window.from` e'
   * sbagliato in tutti e due i versi:
   *
   * - regola retrodatata (`count > 0`): risponderebbe la **prima occorrenza
   *   arretrata**, cioe' esattamente `firstDate` — una spesa che fra un secondo
   *   sara' nello Storico, non la prossima;
   * - regola gia' finita (`endDate` passata) e mai materializzata: risponderebbe
   *   un'occorrenza dentro la finestra invece di `null`, cioe' direbbe che c'e'
   *   una prossima spesa per una regola che non ne avra' piu'.
   *
   * ## Non entra in `PreviewFootprint`, ed e' una conseguenza del suo significato
   *
   * L'impronta e' cio' che si **scrive**, ri-derivato dentro la transazione e
   * confrontato con cio' che era stato annunciato. `nextDate` e' per
   * definizione cio' che **non** si scrive: metterlo li' farebbe rifiutare una
   * scrittura per un giorno futuro che nessuna scrittura tocca.
   */
  readonly nextDate: IsoDate | null
  /**
   * La prima occorrenza cade **prima di oggi**: salvare riscrive dei periodi
   * gia' passati.
   *
   * E' la condizione con cui si decide se chiedere conferma. Senza, si
   * chiederebbe conferma anche a chi crea "spesa di oggi in poi", che e' il caso
   * normale e non ha niente da confermare — e una conferma che compare sempre
   * smette di essere letta, come l'indicatore che grida tutti i mesi.
   */
  readonly backdated: boolean
}

export type MaterializationPreviewResult =
  | ({
      readonly ok: true
      /**
       * La prova che questi numeri sono stati calcolati, e in che giorno.
       *
       * E' l'unico modo di ottenere una `ConfirmedPreview`, ed e' quello che
       * rende impossibile scrivere una regola senza aver chiesto prima cosa
       * succede. Chi vuole solo mostrare l'anteprima lo ignora.
       */
      readonly confirmed: ConfirmedPreview
    } & MaterializationPreview)
  /** La regola non e' salvabile. `reason` e' il messaggio di `validateRule`. */
  | { readonly ok: false; readonly reason: string }

/**
 * Che cosa scriverebbe il motore se questa regola venisse salvata adesso — e,
 * con `nextDate`, la prima cosa che **non** scriverebbe.
 *
 * ## Perche' esiste
 *
 * *"Affitto, 900, mensile, dal 1 gennaio"* creata ad agosto scrive **otto**
 * spese per 7.200 € e cambia i totali di otto periodi passati, all'istante e
 * senza dire niente. Le date passate sono legittime — e' cosi' che si registra
 * un affitto che esiste da mesi — quindi non si vietano: **si dichiara cosa
 * succede**. E' la stessa dottrina dell'import, che mostra l'anteprima e chiede
 * conferma invece di sovrascrivere in silenzio.
 *
 * ## Perche' non ricalcola niente per conto suo
 *
 * Usa `materializationWindow` e `occurrencesBetween`, cioe' **le stesse due
 * funzioni** che `materializeRecurring` esegue. Se l'anteprima avesse una copia
 * propria del calendario, il giorno in cui una delle due cambiasse l'utente
 * confermerebbe un numero e ne otterrebbe un altro: un'anteprima che diverge
 * dalla scrittura e' peggio di nessuna anteprima, perche' e' una bugia con un
 * bottone di conferma sotto.
 *
 * ## Cosa **non** copre
 *
 * Non sa se sul disco esistano gia' spese con quegli id. Per una regola nuova
 * non possono esistere (l'id contiene un UUID appena generato), e per una regola
 * esistente la finestra parte dopo il segnaposto, che per costruzione dichiara
 * gia' scritto tutto cio' che sta prima. Resta un solo caso scoperto: un altro
 * contesto che ha materializzato mentre questa schermata era aperta. Li'
 * l'anteprima conta di piu' di quel che verra' scritto — mai di meno, perche'
 * `addExpenses` salta e non sovrascrive. E' l'unico verso accettabile: si
 * annuncia piu' di quanto si fa.
 *
 * ## Il caso che violava quel verso, e che adesso non passa piu'
 *
 * Ce n'era uno, ed era il tempo. Un'anteprima calcolata alle 23:59:50 e spesa
 * alle 00:00:05 descrive una finestra piu' stretta di quella vera: annuncia
 * **meno** di quanto si scrive. Per questo l'esito positivo non porta solo dei
 * numeri, porta un **permesso** (`confirmed`) con dentro il giorno civile su
 * cui i numeri sono stati calcolati, e chi scrive lo confronta con il proprio
 * (`redeemPreview`). Un'anteprima di ieri non si spende: si ricalcola.
 */
export function previewMaterialization(
  draft: RecurrenceDraft,
  today: IsoDate,
): MaterializationPreviewResult {
  // Una regola sintetica: `occurrencesBetween` chiede una `RecurringRule` e
  // legge solo i campi del calendario. L'id non finisce da nessuna parte —
  // l'anteprima non scrive — ma serve a `validateRule` per il messaggio.
  const common = {
    id: 'anteprima',
    createdAt: '',
    updatedAt: '',
    amountCents: draft.amountCents,
    categoryId: '',
    interval: draft.interval,
    startDate: draft.startDate,
    active: true,
    ...(draft.endDate !== undefined ? { endDate: draft.endDate } : {}),
    ...(draft.lastMaterializedDate !== undefined
      ? { lastMaterializedDate: draft.lastMaterializedDate }
      : {}),
  }
  // Il calendario si ricopia **insieme**, cadenza e ancora nella stessa
  // espressione: e' l'unica forma che il tipo accetta, ed e' anche l'unica in
  // cui non si puo' dimenticare la seconda meta'.
  const rule: RecurringRule =
    draft.cadence === 'monthly'
      ? { ...common, cadence: 'monthly', anchorDay: draft.anchorDay }
      : { ...common, cadence: draft.cadence }

  // Prima della finestra: `occurrencesBetween` lancia su una regola non valida,
  // e un'anteprima che lancia lascia la schermata senza risposta proprio mentre
  // l'utente sta ancora scrivendo i campi.
  //
  // Da quando l'esito positivo porta con se' il permesso di scrivere, questa
  // e' anche **l'unica porta** attraverso cui un calendario entra in una
  // regola: quindi qui si controlla tutto cio' che prima controllava
  // `addRecurringRule` con le sue `assert*`, e in piu' cio' che nessuno
  // controllava (`today` malformata). Un `ok: true` deve significare "questo si
  // puo' scrivere", altrimenti il pedaggio sposta il problema invece di
  // chiuderlo.
  if (!Number.isSafeInteger(draft.amountCents)) {
    return { ok: false, reason: `amountCents non intero: ${draft.amountCents}` }
  }
  if (!isIsoDate(draft.startDate)) {
    return { ok: false, reason: `startDate non valida: "${draft.startDate}"` }
  }
  if (draft.endDate !== undefined && !isIsoDate(draft.endDate)) {
    return { ok: false, reason: `endDate non valida: "${draft.endDate}"` }
  }
  if (draft.lastMaterializedDate !== undefined && !isIsoDate(draft.lastMaterializedDate)) {
    return {
      ok: false,
      reason: `lastMaterializedDate non valida: "${draft.lastMaterializedDate}"`,
    }
  }
  if (!isIsoDate(today)) return { ok: false, reason: `today non valida: "${today}"` }
  const problem = validateRule(rule)
  if (problem !== null) return { ok: false, reason: problem }

  const window = materializationWindow(rule, today)
  const dates = window === null ? [] : occurrencesBetween(rule, window.from, window.to)

  const first = dates[0] ?? null
  const last = dates[dates.length - 1] ?? null

  // Il bordo superiore di cio' che risulta **gia' considerato**: la finestra
  // chiude a `today`, e il segnaposto puo' stare piu' avanti senza che nessuno
  // abbia sbagliato (orologio arretrato, fuso, import). Vedi `nextDate`.
  //
  // `nextOccurrenceOnOrAfter` lancia su una regola non valida: qui non puo'
  // succedere, perche' tutti i rifiuti — compresa `validateRule` — sono gia'
  // passati sopra. E' la condizione che tiene questa funzione **senza throw**
  // su una bozza a meta', che e' cio' che serve per chiamarla dentro un render.
  const marker = rule.lastMaterializedDate
  const consideredThrough = marker !== undefined && isAfter(marker, today) ? marker : today
  const nextDate = nextOccurrenceOnOrAfter(rule, addDays(consideredThrough, 1))
  // La bozza si ricopia campo per campo invece di tenere il riferimento
  // ricevuto: `RecurrenceDraft` e' `readonly` per il compilatore, non a
  // runtime, e chi ha chiamato l'anteprima resta padrone dell'oggetto che ha
  // passato. Senza la copia, cambiargli `startDate` dopo cambierebbe cio' che
  // il permesso autorizza a scrivere — cioe' esattamente il buco che questo
  // valore esiste per chiudere.
  const frozenCommon: RecurrenceDraftCommon = {
    amountCents: draft.amountCents,
    interval: draft.interval,
    startDate: draft.startDate,
    ...(draft.endDate !== undefined ? { endDate: draft.endDate } : {}),
    ...(draft.lastMaterializedDate !== undefined
      ? { lastMaterializedDate: draft.lastMaterializedDate }
      : {}),
  }
  const frozen: RecurrenceDraft =
    draft.cadence === 'monthly'
      ? { ...frozenCommon, cadence: 'monthly', anchorDay: draft.anchorDay }
      : { ...frozenCommon, cadence: draft.cadence }
  const footprint: PreviewFootprint = {
    count: dates.length,
    totalCents: draft.amountCents * dates.length,
    firstDate: first,
    lastDate: last,
  }
  return {
    ok: true,
    confirmed: { [CONFIRMED]: { day: today, draft: frozen, footprint } },
    count: footprint.count,
    firstDate: first,
    lastDate: last,
    totalCents: footprint.totalCents,
    // Fuori dall'impronta di proposito: e' cio' che **non** si scrive.
    nextDate,
    backdated: first !== null && isBefore(first, today),
  }
}

/* ------------------------------------------------------------------------- *
 * 2 bis. La prova che l'anteprima e' stata calcolata — e quando
 * ------------------------------------------------------------------------- */

/**
 * La chiave sotto cui vive il contenuto di una `ConfirmedPreview`, e **non e'
 * esportata**: fuori da questo file non si puo' nominare, quindi non si puo'
 * scrivere un oggetto letterale che le assomigli.
 *
 * E' il motivo per cui il tipo e' nominale invece che strutturale. Con un campo
 * fantasma normale (`readonly __brand: 'confirmed'`) il valore sarebbe
 * **copiabile con uno spread** — `{ ...previewed, day: ieri }` compilerebbe — e
 * la guardia della mezzanotte sarebbe aggirabile in una riga. Con la chiave
 * privata lo spread produce una copia identica, che e' innocua, e non esiste
 * modo di cambiare il giorno di dentro.
 */
const CONFIRMED = Symbol('cent.confirmed-preview')

/**
 * Cio' che una `ConfirmedPreview` porta con se'. Si legge con `redeemPreview`,
 * e nessun altro modo di leggerlo o di costruirlo e' esposto.
 */
export interface PreviewedWrite {
  /**
   * Il **giorno civile** su cui i numeri annunciati sono stati calcolati.
   *
   * E' l'mtime di questa istantanea. `materializationWindow` chiude la finestra
   * su `today`: se il giorno cambia fra il calcolo e la scrittura, la finestra
   * si allarga di un giorno e la scrittura produce **un'occorrenza in piu' di
   * quelle annunciate** — cioe' il verso sbagliato, quello in cui si annuncia
   * meno di quanto si fa.
   */
  readonly day: IsoDate
  /**
   * L'importo e il calendario esatti a cui i numeri si riferiscono. E' anche
   * **cio' che verra' scritto**: chi scrive non riceve questi campi da nessuna
   * altra parte, quindi non esiste modo di annunciare una cosa e scriverne
   * un'altra.
   *
   * ## La trappola che questo apre, dichiarata
   *
   * `RuleSheet` chiama `previewMaterialization` **con `amountCents: 1`** a ogni
   * render, di proposito: cosi' digitare una cifra costa una moltiplicazione
   * invece di ricalcolare 9.728 occorrenze (misurate a 8,85 ms). Il totale vero
   * lo riattacca sopra.
   *
   * Da adesso quell'anteprima porta con se' anche **il permesso di scrivere una
   * regola da 0,01 €**. Il calendario e' giusto, l'importo no.
   *
   * Il rimedio non e' qui: e' **una seconda chiamata al salvataggio**, con
   * l'importo vero, il cui permesso e' quello che si spende — `App.tsx` gia'
   * ricalcola l'anteprima in `saveRule`, per il toast. Il costo e' un calcolo
   * per tap invece che per cifra, che e' esattamente il motivo per cui la
   * scorciatoia esisteva.
   *
   * Non e' stato chiuso con un tipo perche' chiuderlo vorrebbe dire una seconda
   * funzione d'anteprima senza importo, cioe' un'API di dominio **senza
   * chiamanti di produzione oggi** — la cosa che questo repo ha gia' cancellato
   * due volte (`expensesInRange`, `planBudgetChange`).
   */
  readonly draft: RecurrenceDraft
  /**
   * **Cio' che l'anteprima ha mostrato**: quante spese e per quanti centesimi.
   *
   * Viaggia in ogni permesso, ma non tutte le porte lo spendono: lo spende chi
   * scrive **dentro una transazione**, cioe' chi ha sotto mano i record veri
   * per ri-derivarlo (`rewindRecurringRule`). Le porte sincrone
   * (`addRecurringRule`, `reviseRecurringRule`) non hanno niente su cui
   * confrontarlo che non sia il mirror da cui l'anteprima e' gia' stata
   * calcolata: un confronto li' sarebbe la funzione confrontata con se stessa.
   */
  readonly footprint: PreviewFootprint
}

/**
 * Un'anteprima calcolata, in una forma che si puo' passare a chi scrive.
 *
 * **E' opaca di proposito**: l'unico modo di ottenerne una e' chiamare
 * `previewMaterialization`, che la restituisce dentro il proprio esito
 * positivo. Non c'e' un costruttore, non c'e' una fabbrica, e il contenuto sta
 * sotto una chiave che fuori da questo file non si puo' nominare.
 *
 * ## Perche' un valore e non un booleano
 *
 * Un `confirmed: boolean` su `addRecurringRule` sarebbe stato sorvegliare
 * invece che rendere irrappresentabile: chi non chiama l'anteprima scrive
 * `true` e il compilatore e' contento. Qui **chi salta l'anteprima non
 * compila**, perche' non ha niente da passare. E' ADR 012 applicato a
 * un'operazione invece che a un campo.
 *
 * ## Cosa questo valore NON dice
 *
 * Non dice che un essere umano ha letto qualcosa e ha toccato una casella. Il
 * core non puo' saperlo e non finge di saperlo: dice che **i numeri sono stati
 * calcolati**, su quale bozza e in quale giorno. Chiedere la conferma a una
 * persona resta un lavoro della UI, e resta legato a `backdated` — perche' una
 * conferma che compare sempre smette di essere letta.
 */
export interface ConfirmedPreview {
  readonly [CONFIRMED]: PreviewedWrite
}

/**
 * Perche' un'anteprima non e' piu' spendibile.
 *
 * Sono **risultati, non eccezioni**: stessa forma di `planCategoryDeletion` e
 * `planRecurringRuleDeletion`. Chi chiama deve poter dire "ricalcola" invece di
 * finire in un `catch` che non sa distinguere questo da un disco rotto.
 */
export type PreviewRefusal =
  | {
      readonly reason: 'stale-preview'
      /** Il giorno civile su cui l'anteprima era stata calcolata. */
      readonly previewedOn: IsoDate
      /** Il giorno civile di adesso. E' diverso: e' passata la mezzanotte. */
      readonly today: IsoDate
    }
  | {
      readonly reason: 'moved-on'
      /** Il segnaposto che l'anteprima ha usato per aprire la finestra. */
      readonly previewedMarker: IsoDate | null
      /** Il segnaposto vero della regola adesso. */
      readonly currentMarker: IsoDate | null
    }

export type PreviewRedemption =
  | { readonly ok: true; readonly draft: RecurrenceDraft }
  | ({ readonly ok: false } & PreviewRefusal)

/**
 * Spendere un'anteprima: si puo' ancora scrivere cio' che annunciava?
 *
 * ## La mezzanotte, che qui ha gia' morso due volte
 *
 * L'anteprima si calcola all'istante T e si conferma a T+n. Una regola creata
 * alle 23:59:50 e confermata alle 00:00:05 ha una finestra di
 * materializzazione **allargata di un giorno** rispetto a quella annunciata: la
 * scrittura produrrebbe un'occorrenza che nessuno ha visto.
 *
 * E' **il verso sbagliato**. La regola dichiarata su `previewMaterialization`
 * e' *"si annuncia piu' di quanto si fa"*, e questo caso la viola.
 *
 * Quindi il confronto e' **di uguaglianza, non di ordine**. Un'anteprima di
 * domani annuncerebbe di piu' di quanto si scrive, cioe' cadrebbe nel verso
 * accettabile — ma non descriverebbe comunque *adesso*, e un orologio che va
 * avanti (o un fuso che cambia sotto i piedi) non e' una condizione da
 * assecondare in silenzio. E' la stessa guardia dell'mtime su un file: non ci
 * si fida di un'istantanea presa in un momento diverso da quello in cui si
 * agisce.
 *
 * ## Il segnaposto, che e' la stessa istantanea vista da un altro lato
 *
 * `materializationWindow` apre la finestra al giorno dopo
 * `lastMaterializedDate`. Se fra il calcolo e la scrittura una
 * materializzazione ha fatto avanzare il segnaposto — o se l'anteprima e' stata
 * calcolata su una regola che nel frattempo non e' piu' quella — i numeri
 * annunciati non descrivono piu' la finestra vera.
 *
 * `currentMarker` e' `null` per una regola che non ha mai prodotto niente, e
 * **per una regola che ancora non esiste**: e' cosi' che
 * `addRecurringRule` rifiuta un'anteprima calcolata su una regola gia'
 * materializzata, che annuncerebbe **meno** di quanto la regola nuova
 * scriverebbe davvero.
 */
export function redeemPreview(
  confirmed: ConfirmedPreview,
  today: IsoDate,
  currentMarker: IsoDate | null,
): PreviewRedemption {
  const { day, draft } = confirmed[CONFIRMED]
  if (day !== today) {
    return { ok: false, reason: 'stale-preview', previewedOn: day, today }
  }
  const previewedMarker = draft.lastMaterializedDate ?? null
  if (previewedMarker !== currentMarker) {
    return { ok: false, reason: 'moved-on', previewedMarker, currentMarker }
  }
  return { ok: true, draft }
}

/**
 * L'esito di una scrittura che passa da un'anteprima: `addRecurringRule`,
 * `reviseRecurringRule`, `reactivateRecurringRule`.
 *
 * Stessa forma di `RecurringRuleDeletion` e di `CategoryDeletion`, e per la
 * stessa ragione: il rifiuto e' **un risultato**, e porta con se' i numeri con
 * cui la schermata sa cosa dire. "L'anteprima e' di ieri: ricalcola" e' una
 * frase che si scrive solo se si sanno i due giorni.
 */
export type RecurringRuleWrite =
  | { readonly ok: true; readonly rule: RecurringRule }
  /** L'id non esiste. Non puo' capitare su `addRecurringRule`. */
  | { readonly ok: false; readonly reason: 'unknown' }
  | ({ readonly ok: false } & PreviewRefusal)

/* ------------------------------------------------------------------------- *
 * 3. Cancellare una regola
 * ------------------------------------------------------------------------- */

export interface RecurringRuleDeletionRequest {
  readonly id: string
}

export type RecurringRuleDeletion =
  | { readonly ok: true; readonly deleted: RecurringRule }
  | { readonly ok: false; readonly reason: 'unknown' }
  | {
      readonly ok: false
      readonly reason: 'in-use'
      /**
       * Spese generate dalla regola e **ancora visibili nello Storico**: le
       * lapidi non contano. E' un numero che l'utente puo' andare a guardare.
       */
      readonly expenses: number
    }

/**
 * Il piano per cancellare **davvero** una regola ricorrente.
 *
 * E' `planCategoryDeletion` applicato a un'altra entita', e ha di proposito la
 * stessa forma: stessa purezza, stesso rifiuto con i numeri dentro, stesso
 * "chiamalo prima di disegnare il bottone". Due operazioni che rispondono alla
 * stessa domanda devono avere la stessa API, o la seconda diventa un caso
 * particolare da ricordare a memoria.
 *
 * L'unica condizione e' che nessuna spesa **viva** la nomini. Le spese generate
 * restano — la storia non cambia mai retroattivamente, e cancellare la regola
 * non e' un pentimento sui soldi gia' usciti — quindi cancellare il record
 * lascerebbe dei `recurringId` che puntano al vuoto: righe che nessuna
 * schermata sa piu' spiegare e che nessuno puo' riparare.
 *
 * ## Le lapidi non si contano, e la ragione e' il messaggio
 *
 * Fino a ieri qui si contavano anche le spese con `deletedAt`. La conseguenza
 * era che una regola le cui uniche istanze erano cancellate rifiutava la
 * cancellazione **per sempre**, citando un numero di spese che nello Storico
 * **non si vede**: il caso piu' comune e' anche il piu' innocente — si crea una
 * regola sbagliata, si cancella la spesa che ha generato, e da quel momento la
 * regola non si toglie piu' e nessuna schermata spiega perche'.
 *
 * Vale il criterio di CLAUDE.md, *"nessun messaggio cita un numero che l'utente
 * non puo' vedere"*: un rifiuto che non si puo' riconciliare con lo schermo non
 * informa, lascia davanti a un no non verificabile.
 *
 * Delle due mosse possibili — escludere le lapidi dal conteggio, oppure
 * consentire la cancellazione quando sono tutte lapidi — la prima e' l'unica
 * che regge **anche nel caso misto**: con 3 spese vive e 5 lapidi, la seconda
 * direbbe ancora "8" davanti a uno Storico che ne mostra 3.
 *
 * ## Cosa questo lascia scoperto, dichiarato
 *
 * Cancellata la regola, le lapidi restano con un `recurringId` che non punta
 * piu' a niente, e `restoreExpense` puo' riportarne una in vita. Oggi e' inerte:
 * **nessun lettore dereferenzia `recurringId`** — `buildOccurrenceIndex` guarda
 * solo se c'e', il budget guarda `source`, e nessuna schermata risale dalla
 * spesa alla regola.
 *
 * Che sia inerte era una proprieta' **accidentale**, e ADR 018 la trasforma in un
 * vincolo dichiarato: *"`recurringId` puo' restare orfano dopo la cancellazione
 * di una regola. Nessun lettore lo dereferenzia; il primo che lo fara' deve
 * gestire l'assenza esplicitamente, non assumerla impossibile."*
 *
 * E' anche la differenza con `planCategoryDeletion`, che invece **blocca** sulle
 * lapidi: un `categoryId` orfano lo dereferenzia mezza app, e la riga che torna
 * da un ripristino sarebbe rotta e visibile. Conseguenze diverse, permessi
 * diversi — ma lo stesso identico criterio sul **numero mostrato**, che in
 * entrambi i posti esclude le lapidi perche' nessuna schermata le mostra.
 *
 * Se qualcuno la usa, la risposta non e' "no": e' **disattivala**
 * (`updateRecurringRule(id, { active: false })`). Che si puo' fare sempre, non
 * perde niente, e produce esattamente cio' che l'utente voleva — che non esca
 * piu' quella spesa. La cancellazione vera serve solo a togliere di mezzo una
 * regola sbagliata appena creata, ed e' esattamente il caso in cui non ha
 * ancora generato niente.
 *
 * **`rules` ed `expenses` devono essere lo stato su cui la scrittura andra'
 * davvero ad atterrare** (ADR 008): il conteggio fatto su un mirror vecchio non
 * vede l'occorrenza materializzata da un altro contesto trenta secondi fa, e
 * l'orfano che ne resta non e' riparabile da nessuna schermata. Per questo il
 * repository non decide qui: manda l'intenzione al disco
 * (`WriteBatch.recurringRuleDeletion`) e la decisione avviene dentro la
 * transazione.
 */
export function planRecurringRuleDeletion(
  rules: readonly RecurringRule[],
  expenses: readonly Expense[],
  request: RecurringRuleDeletionRequest,
): RecurringRuleDeletion {
  const target = rules.find((r) => r.id === request.id)
  if (target === undefined) return { ok: false, reason: 'unknown' }
  const generated = expenses.filter(
    (e) => e.recurringId === request.id && e.deletedAt === undefined,
  ).length
  if (generated > 0) return { ok: false, reason: 'in-use', expenses: generated }
  return { ok: true, deleted: target }
}

/* ------------------------------------------------------------------------- *
 * 4. Arretrare il segnaposto — ADR 018
 * ------------------------------------------------------------------------- */

/**
 * Perche' un'anteprima non descrive piu' cio' che verrebbe scritto.
 *
 * Due modi di scoprirlo, e sono **due momenti diversi**, non due gusti:
 *
 * - `'day'` si scopre **prima** della transazione, confrontando il giorno
 *   civile del permesso con l'orologio di adesso. E' la guardia di ADR 017, e
 *   non puo' che stare fuori: dentro una transazione non c'e' nessun orologio
 *   di cui fidarsi, e il giorno con cui si ri-deriva e' proprio quello che si
 *   sta mettendo in dubbio.
 * - `'footprint'` si scopre **dentro** la transazione, ri-derivando dai record
 *   veri e confrontando con cio' che era stato mostrato.
 *
 * Il rifiuto e' uno solo — *"l'anteprima e' scaduta: ricalcola"* — perche' per
 * chi legge lo schermo la mossa e' la stessa. Il campo dice quale delle due ha
 * ceduto, cosi' chi scrive la frase puo' essere preciso senza aprire il file.
 */
export type StalePreview =
  | {
      readonly staleness: 'day'
      /** Il giorno civile su cui l'anteprima era stata calcolata. */
      readonly previewedOn: IsoDate
      /** Il giorno civile di adesso. E' diverso: e' passata la mezzanotte. */
      readonly today: IsoDate
    }
  | {
      readonly staleness: 'footprint'
      /** Cio' che l'anteprima ha mostrato. */
      readonly announced: PreviewFootprint
      /** Cio' che la transazione ha ri-derivato dai record veri. */
      readonly actual: PreviewFootprint
    }

/**
 * L'intenzione di far arretrare una regola, e **niente di gia' calcolato**.
 *
 * Attraversa il confine della persistenza quello che l'utente ha deciso — *"la
 * data d'inizio in realta' era questa"* — piu' l'impronta di cio' che gli e'
 * stato mostrato. Le date da generare **non** viaggiano: le ri-deriva la
 * transazione, sui record che ci sono sul disco in quel momento (ADR 008).
 *
 * `today` e `updatedAt` si pregenerano fuori, come l'id e il timestamp di
 * `BudgetChangeRequest`: servono a rendere la scrittura **ripetibile**. Un
 * ritentativo dopo una connessione morta deve ri-derivare esattamente gli
 * stessi numeri, e un `today` letto dentro la transazione non lo garantirebbe.
 * Che quel `today` sia davvero oggi lo ha gia' verificato `redeemRewind` contro
 * l'orologio, fuori.
 */
export interface RecurringRuleRewindRequest {
  readonly id: string
  /**
   * La data nuova. Tocca **due campi dello stesso record**: `startDate` la
   * riceve, `lastMaterializedDate` viene **rimosso** — e nient'altro. La data
   * qui e' una sola perche' il segnaposto non ne prende nessuna.
   */
  readonly startDate: IsoDate
  /** Il giorno civile su cui l'impronta e' stata calcolata, gia' verificato. */
  readonly today: IsoDate
  readonly footprint: PreviewFootprint
  readonly updatedAt: Timestamp
}

export type RecurringRuleRewind =
  | { readonly ok: true; readonly rule: RecurringRule }
  | { readonly ok: false; readonly reason: 'unknown' }
  | {
      readonly ok: false
      /**
       * **Un solo verso: indietro.** In avanti non e' offerto, perche'
       * orfanerebbe le occorrenze gia' generate prima della data nuova.
       */
      readonly reason: 'not-earlier'
      readonly startDate: IsoDate
      readonly currentStartDate: IsoDate
    }
  | {
      readonly ok: false
      /**
       * La regola sul disco non e' utilizzabile (un import scritto a mano, un
       * record di una versione futura). Non si lancia: `occurrencesBetween`
       * lo farebbe, e un throw qui dentro abortirebbe la transazione con un
       * errore che nessuna schermata sa spiegare.
       */
      readonly reason: 'invalid'
      readonly message: string
    }
  | { readonly ok: false; readonly reason: 'stale-preview'; readonly stale: StalePreview }

/**
 * Spendere un permesso per un rewind: e' ancora di oggi?
 *
 * Restituisce **l'impronta e basta**. La bozza non serve: il rewind scrive una
 * data che gli arriva come argomento esplicito e toglie un campo, non prende un
 * calendario dall'anteprima — quindi qui non c'e' niente da "far entrare" nel
 * record, ci sono solo dei numeri da portare fino alla transazione perche' li
 * confronti.
 *
 * E' anche la ragione per cui non passa da `redeemPreview`: quella confronta il
 * segnaposto dell'anteprima con quello della regola, che per un rewind sono
 * diversi **per definizione** — l'anteprima e' calcolata sulla regola come sara'
 * dopo, cioe' **senza** segnaposto, mentre quella sul disco ce l'ha ancora.
 */
export type RewindRedemption =
  | { readonly ok: true; readonly footprint: PreviewFootprint }
  | { readonly ok: false; readonly reason: 'stale-preview'; readonly stale: StalePreview }

export function redeemRewind(confirmed: ConfirmedPreview, today: IsoDate): RewindRedemption {
  const { day, footprint } = confirmed[CONFIRMED]
  if (day !== today) {
    return {
      ok: false,
      reason: 'stale-preview',
      stale: { staleness: 'day', previewedOn: day, today },
    }
  }
  return { ok: true, footprint }
}

/**
 * Il record che un rewind scriverebbe, deciso **sui record del disco**.
 *
 * Gira dentro la transazione (`WriteBatch.recurringRuleRewind`), come
 * `planRecurringRuleDeletion` e `planResolvedBudgetChange`.
 *
 * ## Che cosa scrive: la regola torna **appena creata con quella data**
 *
 * Tocca **due campi dello stesso record** e nient'altro: `startDate` prende la
 * data nuova, e il **segnaposto viene rimosso**. Non lo si porta alla data
 * nuova: lo si azzera.
 *
 * La differenza vale un'occorrenza — quella che cade **esattamente sulla data
 * scelta** — ma la ragione non e' contarne una in piu'. Con il segnaposto
 * assente, questa regola diventa indistinguibile da una **creata adesso con
 * quella data d'inizio**, e la finestra la apre lo **stesso ramo** che
 * `materializationWindow` percorre a ogni creazione:
 * `lastMaterializedDate === undefined ? rule.startDate : addDays(...)`.
 *
 * Non e' quindi un'eccezione del motore da tenere allineata a mano: retrodatare
 * e ricreare **sono la stessa riga di codice**, gia' sotto test da prima che il
 * rewind esistesse. La coerenza fra i due gesti smette di essere una proprieta'
 * da verificare caso per caso.
 *
 * Portare il segnaposto alla data nuova aveva anche l'effetto opposto a quello
 * per cui il rewind esiste: chi scrive *"la data d'inizio in realta' era il 10
 * agosto"* si aspetta la spesa del 10 agosto, e la finestra aperta al giorno
 * **dopo** il segnaposto gliela toglieva in silenzio.
 *
 * ## Rimosso, non `undefined`
 *
 * Il campo si toglie con una destrutturazione, come in
 * `Repository.rewriteFromPreview`. Non e' uno stile: `exactOptionalPropertyTypes`
 * rende `lastMaterializedDate: undefined` **non assegnabile** a
 * `RecurringRule` — il compilatore rifiuta la forma sbagliata prima che si possa
 * scegliere. E la differenza conta davvero a valle: `store.put` di `idb` passa
 * per lo structured clone, che **conserva le proprieta' proprie con valore
 * `undefined`**, quindi il record riletto avrebbe la chiave presente; l'export
 * JSON invece la perderebbe (`JSON.stringify` scarta `undefined`), e un
 * round-trip export -> import cambierebbe la forma del record. Con la rimozione
 * le due strade coincidono.
 *
 * Non cancella niente, non crea id nuovi, il `ruleId` resta. Le occorrenze le
 * generera' la successiva `materializeRecurring`, **fuori** da questa
 * transazione: vedi ADR 018, e la riga di `Repository.rewindRecurringRule` che
 * spiega perche' allungarla sarebbe un rischio pagato per niente.
 *
 * ## Perche' arretrare il segnaposto e' sicuro
 *
 * Il segnaposto non e' il meccanismo di correttezza: l'idempotenza la garantisce
 * l'id deterministico `rec:<ruleId>:<date>` piu' la semantica *add* (ADR 006).
 * Riaprire la finestra su un intervallo gia' materializzato non duplica niente,
 * **non resuscita le istanze cancellate** — un soft delete lascia una lapide
 * sotto lo stesso id, quindi la chiave resta occupata e `add` fallisce — e
 * **non riscrive le correzioni manuali**: il canone corretto a 920 occupa gia'
 * il suo id.
 *
 * ## L'impronta si ri-deriva qui, e si confronta
 *
 * `count`, somma **e i due estremi** vengono ricalcolati con le **stesse** due
 * funzioni che la materializzazione esegue (`materializationWindow`,
 * `occurrencesBetween`), sulla regola letta dal disco con il rewind gia'
 * applicato. Se anche uno solo dei quattro non coincide con quello mostrato,
 * non si scrive niente.
 *
 * I due estremi non sono completezza teorica: senza di loro passerebbe
 * **l'ancora mensile spostata** — stesso numero di occorrenze, stessa somma,
 * tutte su giorni diversi da quelli letti. Vedi `PreviewFootprint`.
 *
 * L'importo usato e' quello **del disco**, non quello dell'anteprima: se un
 * altro contesto ha cambiato l'importo della regola nel frattempo, la somma non
 * torna e il rewind si rifiuta. E' il verso giusto — chi ha confermato
 * "7 spese, 6.300 €" non deve poterne ottenere 7 da 9.200.
 */
export function planRecurringRuleRewind(
  rules: readonly RecurringRule[],
  request: RecurringRuleRewindRequest,
): RecurringRuleRewind {
  const target = rules.find((r) => r.id === request.id)
  if (target === undefined) return { ok: false, reason: 'unknown' }
  if (!isBefore(request.startDate, target.startDate)) {
    return {
      ok: false,
      reason: 'not-earlier',
      startDate: request.startDate,
      currentStartDate: target.startDate,
    }
  }

  // Il segnaposto si **toglie**: la regola torna nello stato di una appena
  // creata con questa data d'inizio, e la finestra la aprira' lo stesso ramo di
  // `materializationWindow` che percorre ogni creazione. Rimosso e non
  // `undefined`: vedi il commento della funzione — `exactOptionalPropertyTypes`
  // non lascerebbe compilare l'altra forma, e lo structured clone di `idb` la
  // conserverebbe.
  const { lastMaterializedDate: _marker, ...withoutMarker } = target
  const rewound: RecurringRule = {
    ...withoutMarker,
    startDate: request.startDate,
    updatedAt: request.updatedAt,
  }
  const problem = validateRule(rewound)
  if (problem !== null) return { ok: false, reason: 'invalid', message: problem }

  const window = materializationWindow(rewound, request.today)
  const dates = window === null ? [] : occurrencesBetween(rewound, window.from, window.to)
  const actual: PreviewFootprint = {
    count: dates.length,
    totalCents: rewound.amountCents * dates.length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
  }
  const announced = request.footprint
  if (
    actual.count !== announced.count ||
    actual.totalCents !== announced.totalCents ||
    // I due estremi, e il caso concreto che li ha messi qui: l'ancora mensile
    // spostata dal 1 al 23 da' **stesso count e stessa somma** su otto giorni
    // tutti diversi. Senza queste due righe l'utente confermerebbe "dal 1
    // gennaio al 1 agosto" e otterrebbe otto spese su date che non ha letto.
    actual.firstDate !== announced.firstDate ||
    actual.lastDate !== announced.lastDate
  ) {
    return {
      ok: false,
      reason: 'stale-preview',
      stale: { staleness: 'footprint', announced, actual },
    }
  }

  return { ok: true, rule: rewound }
}
