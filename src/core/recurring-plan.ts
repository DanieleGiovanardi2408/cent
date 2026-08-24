/**
 * Le tre domande che si fanno su una regola **prima** di scrivere qualcosa.
 *
 * 1. **Quanto pesa al mese** (`monthlyCostCents`, `monthlyFixedCosts`): il
 *    numero che sta accanto al budget e che ADR 016 rende obbligatorio.
 * 2. **Cosa succede se la salvo** (`previewMaterialization`): quante spese
 *    arretrate, da quando a quando, per quanto.
 * 3. **Posso cancellarla** (`planRecurringRuleDeletion`).
 *
 * Tutto puro e sincrono, come `categories.ts`: nessun I/O, nessun orologio
 * implicito, il giorno di riferimento arriva sempre come argomento. Il motore
 * vero — quello che scrive — sta in `recurrence.ts` e non lo si duplica qui:
 * l'anteprima riusa `materializationWindow` e `occurrencesBetween`, che sono le
 * stesse funzioni che la materializzazione esegue davvero.
 */

import { isAfter, isBefore, isIsoDate } from './date'
import type { IsoDate } from './date'
import type { Cents } from './money'
import { materializationWindow, occurrencesBetween, validateRule } from './recurrence'
import type { Cadence, Expense, RecurringRule } from './types'

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
export interface RecurrenceDraft {
  readonly amountCents: Cents
  readonly cadence: Cadence
  readonly interval: number
  readonly anchorDay?: number
  readonly startDate: IsoDate
  readonly endDate?: IsoDate
  /**
   * Presente solo per una regola che esiste gia'. Assente su una regola nuova,
   * ed e' l'assenza che produce l'arretrato: si parte da `startDate`.
   */
  readonly lastMaterializedDate?: IsoDate
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
   * La prima occorrenza cade **prima di oggi**: salvare riscrive dei periodi
   * gia' passati.
   *
   * E' la condizione con cui si decide se chiedere conferma. Senza, si
   * chiederebbe conferma anche a chi crea "spesa di oggi in poi", che e' il caso
   * normale e non ha niente da confermare — e una conferma che compare sempre
   * smette di essere letta, come l'indicatore che grida tutti i mesi.
   */
  readonly backdated: boolean
  /** Le prime `maxDates` occorrenze, per mostrarne un elenco. */
  readonly dates: readonly IsoDate[]
  /** Vero se `dates` e' stato tagliato: `count` resta il numero vero. */
  readonly truncated: boolean
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

const DEFAULT_MAX_DATES = 12

/**
 * Che cosa scriverebbe il motore se questa regola venisse salvata adesso.
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
  maxDates: number = DEFAULT_MAX_DATES,
): MaterializationPreviewResult {
  // Una regola sintetica: `occurrencesBetween` chiede una `RecurringRule` e
  // legge solo i campi del calendario. L'id non finisce da nessuna parte —
  // l'anteprima non scrive — ma serve a `validateRule` per il messaggio.
  const rule: RecurringRule = {
    id: 'anteprima',
    createdAt: '',
    updatedAt: '',
    amountCents: draft.amountCents,
    categoryId: '',
    cadence: draft.cadence,
    interval: draft.interval,
    startDate: draft.startDate,
    active: true,
    ...(draft.anchorDay !== undefined ? { anchorDay: draft.anchorDay } : {}),
    ...(draft.endDate !== undefined ? { endDate: draft.endDate } : {}),
    ...(draft.lastMaterializedDate !== undefined
      ? { lastMaterializedDate: draft.lastMaterializedDate }
      : {}),
  }

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
  const cap = Math.max(0, maxDates)
  // La bozza si ricopia campo per campo invece di tenere il riferimento
  // ricevuto: `RecurrenceDraft` e' `readonly` per il compilatore, non a
  // runtime, e chi ha chiamato l'anteprima resta padrone dell'oggetto che ha
  // passato. Senza la copia, cambiargli `startDate` dopo cambierebbe cio' che
  // il permesso autorizza a scrivere — cioe' esattamente il buco che questo
  // valore esiste per chiudere.
  const frozen: RecurrenceDraft = {
    amountCents: draft.amountCents,
    cadence: draft.cadence,
    interval: draft.interval,
    startDate: draft.startDate,
    ...(draft.anchorDay !== undefined ? { anchorDay: draft.anchorDay } : {}),
    ...(draft.endDate !== undefined ? { endDate: draft.endDate } : {}),
    ...(draft.lastMaterializedDate !== undefined
      ? { lastMaterializedDate: draft.lastMaterializedDate }
      : {}),
  }
  return {
    ok: true,
    confirmed: { [CONFIRMED]: { day: today, draft: frozen } },
    count: dates.length,
    firstDate: first,
    lastDate: last,
    totalCents: draft.amountCents * dates.length,
    backdated: first !== null && isBefore(first, today),
    dates: dates.slice(0, cap),
    truncated: dates.length > cap,
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
      /** Spese generate dalla regola, **cancellate comprese**. */
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
 * L'unica condizione e' che nessuna spesa la nomini. Le spese generate
 * **restano** — la storia non cambia mai retroattivamente, e cancellare la
 * regola non e' un pentimento sui soldi gia' usciti — quindi cancellare il
 * record lascerebbe dei `recurringId` che puntano al vuoto: righe che nessuna
 * schermata sa piu' spiegare e che nessuno puo' riparare.
 *
 * Contano anche le spese **con `deletedAt`**, per la stessa ragione delle
 * categorie: un soft delete resta nello Storico e resta nell'export, quindi il
 * suo riferimento e' vivo a tutti gli effetti.
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
  const generated = expenses.filter((e) => e.recurringId === request.id).length
  if (generated > 0) return { ok: false, reason: 'in-use', expenses: generated }
  return { ok: true, deleted: target }
}
