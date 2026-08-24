/**
 * Motore delle ricorrenze.
 *
 * Due meta' nettamente separate:
 *
 * 1. **Il calendario** (`nextOccurrenceOnOrAfter`, `occurrencesBetween`): pura,
 *    sincrona, senza I/O. Data una regola, quali giorni tocca.
 * 2. **La materializzazione** (`materializeRecurring`): trasforma quei giorni in
 *    spese vere e le scrive. E' l'unica parte che puo' morire a meta'.
 *
 * ## Come non si duplica, e perche' non serve un lock
 *
 * **Un'occorrenza ha una sola identita' possibile.** L'id di una spesa generata
 * e' funzione pura della coppia (regola, giorno): `rec:<recurringId>:<date>`
 * (`recurringExpenseId`). Non e' un UUID. Due contesti che materializzano lo
 * stesso giorno — la PWA aperta dalla Home Screen e una scheda Safari sullo
 * stesso sito, che sono due contesti JavaScript e una sola IndexedDB —
 * propongono lo **stesso** id, non due. Lo stato "la stessa occorrenza due
 * volte" non e' una condizione da sorvegliare: non e' rappresentabile.
 *
 * **L'inserimento ha semantica add, non put** (`WriteBatch.addExpenses`). Su
 * conflitto si salta. Questo protegge due cose dell'utente che un `put`
 * distruggerebbe a ogni avvio: la correzione dell'importo della singola istanza
 * (canone 920 invece di 900) e la cancellazione, perche' una spesa cancellata
 * e' un record che esiste — ha solo `deletedAt` — e quindi non viene resuscitata.
 *
 * Vedi `docs/adr/006-identita-deterministica-ricorrenze.md`. La serializzazione
 * delle chiamate concorrenti (in `repository.ts`) e' un'ottimizzazione: se un
 * domani sparisce, tutto quanto sopra resta vero.
 *
 * ## Le altre due difese, che restano
 *
 * **Il segnaposto avanza solo su scritture gia' concluse.** Ogni blocco di
 * occorrenze viaggia in un `WriteBatch` unico che contiene *sia* le spese
 * generate *sia* l'avanzamento di `lastMaterializedDate`. La persistenza
 * garantisce che un batch e' atomico. Quindi dopo un'interruzione lo stato su
 * disco e' sempre uno dei due estremi: o il blocco c'e' tutto e il segnaposto e'
 * avanzato, o non c'e' niente e il segnaposto e' fermo. Non esiste il caso "spese
 * scritte ma segnaposto fermo" ne' "segnaposto avanzato ma spese mancanti".
 *
 * Nel batch viaggia **solo il segnaposto**, non la regola
 * (`WriteBatch.advanceRecurringMarkers`). Chi materializza legge la regola dal
 * proprio mirror, e un mirror puo' avere ore: riscriverla intera riporterebbe
 * indietro anche `amountCents` e `active`, cioe' riaccenderebbe una regola che
 * l'utente ha spento altrove, con l'apertura dell'app come unico innesco.
 *
 * **La deduplica prima di scrivere** (`buildOccurrenceIndex`): non e' piu' cio'
 * che rende sicuro il motore, ma evita di proporre al disco migliaia di
 * scritture che verrebbero comunque saltate. Guarda una cosa sola, l'id
 * deterministico, perche' e' l'unica identita' che un'occorrenza ha.
 *
 * ## La regola puo' cambiare mentre il catch-up e' in corso
 *
 * Un catch-up di 40 giorni dura piu' di un tap. Se durante il lavoro l'utente
 * disattiva la regola o ne cambia l'importo, continuare a generare spese dalla
 * copia letta all'inizio produrrebbe spese che lui crede di aver fermato. Per
 * questo `currentRule` rilegge la regola prima di ogni blocco: disattivata, si
 * smette; importo cambiato, i blocchi successivi usano il nuovo; calendario
 * cambiato, si smette e si ricomincera' da capo alla prossima chiamata (il
 * segnaposto e' coerente, non si perde niente).
 */

import { addDays, clampDayOfMonth, daysBetween, isAfter, isBefore, toDateParts } from './date'
import type { IsoDate } from './date'
import type { RecurringMarkerAdvance, WriteBatch, WriteResult } from './persistence'
import type { Expense, RecurringRule, Timestamp } from './types'
import { nowTimestamp } from './types'

/** Perche' una regola non e' utilizzabile. `null` = e' valida. */
export function validateRule(rule: RecurringRule): string | null {
  if (!Number.isInteger(rule.interval) || rule.interval < 1) {
    return `interval non valido: ${rule.interval}`
  }
  if (rule.anchorDay !== undefined) {
    if (!Number.isInteger(rule.anchorDay) || rule.anchorDay < 1 || rule.anchorDay > 31) {
      return `anchorDay non valido: ${rule.anchorDay}`
    }
  }
  if (rule.endDate !== undefined && isBefore(rule.endDate, rule.startDate)) {
    return `endDate (${rule.endDate}) precede startDate (${rule.startDate})`
  }
  return null
}

function assertValid(rule: RecurringRule): void {
  const problem = validateRule(rule)
  if (problem !== null) throw new RangeError(`Regola ${rule.id} non valida: ${problem}`)
}

/** L'occorrenza mensile numero `k`, con il giorno tagliato al mese. */
function monthlyOccurrence(rule: RecurringRule, anchorDay: number, k: number): IsoDate {
  const start = toDateParts(rule.startDate)
  const totalMonths = start.month - 1 + k * rule.interval
  const year = start.year + Math.floor(totalMonths / 12)
  const month = (((totalMonths % 12) + 12) % 12) + 1
  return clampDayOfMonth(year, month, anchorDay)
}

/**
 * La prima occorrenza il giorno `from` o dopo. `null` se la regola e' finita.
 *
 * Non guarda `active`: descrive il calendario della regola, non se sia il caso
 * di applicarlo. Non fa nemmeno un ciclo giorno per giorno: l'indice
 * dell'occorrenza si calcola, cosi' un catch-up di 40 giorni e uno di 4 anni
 * costano uguale per occorrenza prodotta.
 */
export function nextOccurrenceOnOrAfter(rule: RecurringRule, from: IsoDate): IsoDate | null {
  assertValid(rule)
  const floor = isBefore(from, rule.startDate) ? rule.startDate : from

  let date: IsoDate
  if (rule.cadence === 'monthly') {
    const anchorDay = rule.anchorDay ?? toDateParts(rule.startDate).day
    const start = toDateParts(rule.startDate)
    const target = toDateParts(floor)
    const monthsDiff = (target.year - start.year) * 12 + (target.month - start.month)
    let k = Math.max(0, Math.floor(monthsDiff / rule.interval))
    date = monthlyOccurrence(rule, anchorDay, k)
    // Al massimo due passi: l'indice calcolato puo' cadere un intervallo indietro
    // per via del troncamento o del taglio del giorno a fine mese.
    while (isBefore(date, floor)) {
      k += 1
      date = monthlyOccurrence(rule, anchorDay, k)
    }
  } else {
    const step = rule.cadence === 'weekly' ? rule.interval * 7 : rule.interval
    const delta = daysBetween(rule.startDate, floor)
    const k = Math.max(0, Math.ceil(delta / step))
    date = addDays(rule.startDate, k * step)
  }

  if (rule.endDate !== undefined && isAfter(date, rule.endDate)) return null
  return date
}

/** Tutte le occorrenze in `[from, to]`, in ordine crescente. Estremi inclusi. */
export function occurrencesBetween(
  rule: RecurringRule,
  from: IsoDate,
  to: IsoDate,
): readonly IsoDate[] {
  if (isAfter(from, to)) return []
  const dates: IsoDate[] = []
  let cursor: IsoDate | null = nextOccurrenceOnOrAfter(rule, from)
  while (cursor !== null && !isAfter(cursor, to)) {
    dates.push(cursor)
    cursor = nextOccurrenceOnOrAfter(rule, addDays(cursor, 1))
  }
  return dates
}

export interface MaterializationWindow {
  /** Primo giorno da esaminare, incluso. */
  readonly from: IsoDate
  /** Ultimo giorno da esaminare, incluso. */
  readonly to: IsoDate
}

/**
 * L'intervallo che `materializeRecurring` esaminerebbe **adesso** per questa
 * regola. `null` se non c'e' niente da esaminare.
 *
 * Due estremi, e nessuno dei due e' ovvio:
 *
 * - `from` e' il giorno dopo il segnaposto, o `startDate` se la regola non ha
 *   mai prodotto niente. E' qui che nasce l'arretrato: una regola nuova con
 *   `startDate` a gennaio parte da gennaio, non da oggi;
 * - `to` e' oggi, tagliato a `endDate` se la regola e' gia' finita.
 *
 * Sta in una funzione sola perche' ha **due** chiamanti: il motore e
 * `previewMaterialization`. Se l'anteprima ricalcolasse la finestra per conto
 * suo, il giorno in cui uno dei due estremi cambiasse l'anteprima resterebbe
 * indietro — e un'anteprima che non descrive la scrittura che segue non e' una
 * conferma, e' una bugia con un bottone sotto.
 *
 * Non guarda `active` e non guarda la validita': descrive il calendario, non se
 * sia il caso di applicarlo. Chi la chiama filtra prima.
 */
export function materializationWindow(
  rule: RecurringRule,
  today: IsoDate,
): MaterializationWindow | null {
  const from =
    rule.lastMaterializedDate === undefined ? rule.startDate : addDays(rule.lastMaterializedDate, 1)
  const to =
    rule.endDate !== undefined && isBefore(rule.endDate, today) ? rule.endDate : today
  if (isAfter(from, to)) return null
  return { from, to }
}

/**
 * L'id di una spesa generata: funzione pura di (regola, giorno).
 *
 * E' il cuore di ADR 006. La forma e' leggibile di proposito, niente hash: chi
 * apre un export JSON deve poter capire al volo perche' quel record e' li'.
 *
 * Non contiene mai caratteri ambigui perche' `recurringId` e' un UUID e `date`
 * e' `YYYY-MM-DD`: la coppia si rilegge dall'id senza ambiguita'.
 */
export function recurringExpenseId(recurringId: string, date: IsoDate): string {
  return `rec:${recurringId}:${date}`
}

/**
 * Gli id delle occorrenze gia' materializzate, per non riproporle al disco.
 * **Comprese le cancellate**: un record con `deletedAt` esiste, e riproporlo
 * significherebbe cercare di resuscitarlo.
 *
 * Una chiave sola, l'`id`, perche' dopo ADR 006 un'occorrenza ha una sola
 * identita' possibile. C'era anche la coppia `recurringId|date`, per gli
 * archivi scritti prima di ADR 006: e' stata tolta perche' guardava `date`, che
 * l'utente puo' cambiare. Chi sposta l'affitto di agosto al 5 settembre perche'
 * l'ha pagato in ritardo — la cosa piu' ovvia da fare — a settembre si vedeva
 * filtrare via l'occorrenza vera del 5 settembre; il segnaposto avanzava lo
 * stesso, quindi quel canone non veniva piu' ritentato. Nessun segnale, 900 EUR
 * in meno nel budget. I record pre-ADR 006 non esistono (l'app non e' mai stata
 * usata con dati veri e un backup riporta gli id com'erano), quindi la coppia
 * costava un caso di perdita silenziosa e non copriva niente.
 *
 * Questa non e' la difesa che garantisce la correttezza — quella e' l'id
 * deterministico piu' la semantica add — ma senza, un catch-up ripetuto
 * proporrebbe migliaia di scritture destinate a essere saltate.
 */
export function buildOccurrenceIndex(expenses: readonly Expense[]): Set<string> {
  const index = new Set<string>()
  for (const expense of expenses) {
    if (expense.recurringId !== undefined) index.add(expense.id)
  }
  return index
}

export interface MaterializeOptions {
  /** Fino a che giorno materializzare, incluso. Di norma `today()`. */
  readonly today: IsoDate
  /** Le regole da esaminare, lette all'inizio della chiamata. */
  readonly rules: readonly RecurringRule[]
  readonly expenses: readonly Expense[]
  /**
   * Rilettura della regola dallo stato vivo, chiamata prima di ogni blocco.
   * Senza, un catch-up lungo riscriverebbe a fine giro la copia letta
   * all'inizio, cancellando le modifiche fatte dall'utente nel frattempo.
   * Assente = si usa la copia iniziale (accettabile solo per catch-up brevi).
   */
  readonly currentRule?: (id: string) => RecurringRule | undefined
  /** Scrittura atomica di un blocco. Vedi `Persistence.write`. */
  readonly write: (batch: WriteBatch) => Promise<WriteResult>
  /**
   * Chiamata dopo ogni blocco **gia' scritto**, per aggiornare il mirror in
   * memoria.
   *
   * Riceve **solo** le occorrenze davvero inserite da questa scrittura, e il
   * solo avanzamento del segnaposto — non la regola intera.
   *
   * Le occorrenze che il disco ha saltato non passano di qui, e il mirror non
   * deve inventarsele. Prima ci passavano, con la giustificazione che "stesso
   * id" implicasse "stesso record": non e' vero. Due contesti costruiscono due
   * oggetti diversi con lo stesso id, e solo uno dei due e' quello sul disco.
   * Il mirror si riempiva della **propria** copia — importo della regola,
   * nessun `deletedAt` — e mostrava viva un'occorrenza che l'utente aveva
   * cancellato altrove; bastava toccarla per riscrivere il record cancellato e
   * perdere la cancellazione per sempre. Vedi la sezione "Correzione" di
   * ADR 006.
   *
   * Quello che resta e' un buco nel mirror: un'occorrenza c'e' sul disco e non
   * in lista. Si chiude alla prima rilettura al risveglio (ADR 007), che e'
   * l'unica cosa in grado di dire che cosa c'e' davvero sul disco.
   */
  readonly onCommitted?: (
    inserted: readonly Expense[],
    marker: RecurringMarkerAdvance,
  ) => void
  /**
   * Occorrenze per transazione. Ogni blocco e' un `await` su una transazione
   * IndexedDB, che restituisce il thread al browser: e' cosi' che un catch-up
   * lungo non congela la UI. Numeri piu' bassi = piu' reattivo e piu' lento.
   */
  readonly chunkSize?: number
  readonly now?: () => Timestamp
}

export interface MaterializeResult {
  /**
   * Le spese **davvero inserite da questa chiamata**. Un'occorrenza che un altro
   * contesto aveva gia' scritto non compare qui: e' sul disco, ma non l'abbiamo
   * creata noi.
   */
  readonly created: readonly Expense[]
  /** Regole il cui `lastMaterializedDate` e' avanzato fino a `today`. */
  readonly advancedRuleIds: readonly string[]
  /**
   * Regole non portate a termine, con il motivo: non valide, oppure cambiate
   * sotto i piedi durante il catch-up. Non bloccano le altre.
   */
  readonly skipped: readonly { readonly ruleId: string; readonly reason: string }[]
}

const DEFAULT_CHUNK_SIZE = 25

function buildExpense(rule: RecurringRule, date: IsoDate, timestamp: Timestamp): Expense {
  return {
    id: recurringExpenseId(rule.id, date),
    createdAt: timestamp,
    updatedAt: timestamp,
    amountCents: rule.amountCents,
    categoryId: rule.categoryId,
    date,
    source: 'recurring',
    recurringId: rule.id,
    ...(rule.note !== undefined ? { note: rule.note } : {}),
  }
}

/** I campi da cui dipende il calendario: se cambiano, le date calcolate scadono. */
function sameCalendar(a: RecurringRule, b: RecurringRule): boolean {
  return (
    a.cadence === b.cadence &&
    a.interval === b.interval &&
    a.anchorDay === b.anchorDay &&
    a.startDate === b.startDate &&
    a.endDate === b.endDate
  )
}

/**
 * Genera le spese mancanti di tutte le regole attive fino a `today` incluso.
 *
 * Sicura da chiamare a ogni avvio, piu' volte nello stesso giorno, e **piu'
 * volte in parallelo** — anche da contesti JavaScript diversi sullo stesso
 * database: due chiamate simultanee propongono gli stessi id e il disco ne
 * accetta uno solo.
 *
 * Se una scrittura fallisce l'errore risale al chiamante, ma i blocchi gia'
 * scritti restano validi e coerenti: la chiamata successiva riprende esattamente
 * da li'.
 */
export async function materializeRecurring(
  options: MaterializeOptions,
): Promise<MaterializeResult> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  const clock = options.now ?? nowTimestamp
  const seen = buildOccurrenceIndex(options.expenses)

  const created: Expense[] = []
  const advancedRuleIds: string[] = []
  const skipped: { ruleId: string; reason: string }[] = []

  for (const rule of options.rules) {
    if (!rule.active) continue
    const problem = validateRule(rule)
    if (problem !== null) {
      skipped.push({ ruleId: rule.id, reason: problem })
      continue
    }

    // La finestra la decide `materializationWindow`, che e' anche cio' che
    // l'anteprima mostra all'utente prima di salvare la regola.
    const window = materializationWindow(rule, options.today)
    if (window === null) continue
    const windowTo = window.to

    const dates = occurrencesBetween(rule, window.from, windowTo).filter(
      (date) => !seen.has(recurringExpenseId(rule.id, date)),
    )

    let current = rule
    let completed = true
    // Anche senza occorrenze da creare il segnaposto avanza: e' l'unica cosa che
    // evita di riesaminare ogni volta la stessa finestra gia' vuota.
    for (let i = 0; i < Math.max(dates.length, 1); i += chunkSize) {
      // Rilettura prima di ogni blocco: fra un blocco e l'altro l'utente ha
      // avuto tutto il tempo di cambiare idea, e la sua copia della regola vince
      // sempre sulla nostra.
      const fresh = options.currentRule === undefined ? current : options.currentRule(rule.id)
      if (fresh === undefined) {
        skipped.push({ ruleId: rule.id, reason: 'regola sparita durante il catch-up' })
        completed = false
        break
      }
      if (!fresh.active) {
        skipped.push({ ruleId: rule.id, reason: 'regola disattivata durante il catch-up' })
        completed = false
        break
      }
      if (!sameCalendar(fresh, rule)) {
        // Le date del blocco sono state calcolate sul vecchio calendario: non
        // sono piu' quelle giuste. Si smette qui; il segnaposto e' coerente con
        // quello che c'e' su disco, quindi la prossima chiamata ricomincia dal
        // punto giusto con il calendario nuovo.
        skipped.push({ ruleId: rule.id, reason: 'calendario della regola cambiato durante il catch-up' })
        completed = false
        break
      }

      const slice = dates.slice(i, i + chunkSize)
      const timestamp = clock()
      const batchExpenses = slice.map((date) => buildExpense(fresh, date, timestamp))
      const isLast = i + chunkSize >= dates.length
      const reached = isLast ? windowTo : (slice[slice.length - 1] ?? windowTo)
      // Il segnaposto non torna mai indietro. Se la regola riletta e' gia' piu'
      // avanti — un altro contesto ha materializzato mentre eravamo in mezzo al
      // giro — la sua posizione vale piu' della nostra: quelle spese sono state
      // scritte davvero, nella stessa transazione che ha spostato il segnaposto.
      // Riportarlo indietro non perderebbe niente, ma farebbe rifare il giro.
      const previous = fresh.lastMaterializedDate
      const marker = previous !== undefined && isAfter(previous, reached) ? previous : reached
      const advance: RecurringMarkerAdvance = {
        id: rule.id,
        lastMaterializedDate: marker,
        updatedAt: timestamp,
      }

      // Un'unica transazione: le spese e il segnaposto che le dichiara scritte.
      // `addExpenses` e non `expenses`: su id gia' presente si salta.
      // `advanceRecurringMarkers` e non `recurringRules`: della regola non
      // sappiamo niente di piu' fresco di quello che c'e' gia' sul disco.
      const result = await options.write({
        addExpenses: batchExpenses,
        advanceRecurringMarkers: [advance],
      })

      const skippedIds = new Set(result.skippedIds)
      const inserted: Expense[] = []
      for (const expense of batchExpenses) {
        // Saltate o inserite, adesso sono sul disco: non vanno riproposte.
        seen.add(expense.id)
        if (skippedIds.has(expense.id)) continue
        inserted.push(expense)
        created.push(expense)
      }
      current = { ...fresh, lastMaterializedDate: marker, updatedAt: timestamp }
      options.onCommitted?.(inserted, advance)
    }
    if (completed) advancedRuleIds.push(rule.id)
  }

  return { created, advancedRuleIds, skipped }
}
