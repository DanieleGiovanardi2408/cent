/**
 * La porta verso il disco.
 *
 * `src/core` non conosce IndexedDB: conosce questa interfaccia. L'implementazione
 * reale sta in `idb.ts` (l'unico file che importa `idb`), quella in memoria in
 * `memory-persistence.ts` (solo per i test).
 *
 * L'astrazione esiste per una ragione sola e concreta: tenere fuori il disco da
 * tutto il resto del core, che resta puro e sincrono. I test che devono davvero
 * verificare IndexedDB — atomicita', migrazioni, due contesti sullo stesso
 * database — girano su `idb.ts` con `fake-indexeddb` (vedi ADR 001), non su
 * questo doppio.
 */

import type { BudgetChangeRequest } from './budget'
import type { IsoDate } from './date'
import type { Budget, Category, DataSet, Expense, RecurringRule, Settings, Timestamp } from './types'

/** Quello che c'e' su disco all'avvio. `settings: null` = database mai inizializzato. */
export interface LoadedData {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly recurringRules: readonly RecurringRule[]
  readonly budgets: readonly Budget[]
  readonly settings: Settings | null
}

/**
 * Far avanzare `lastMaterializedDate` di una regola **senza riscrivere il
 * resto**. Vedi `WriteBatch.advanceRecurringMarkers`.
 */
export interface RecurringMarkerAdvance {
  readonly id: string
  readonly lastMaterializedDate: IsoDate
  /** Da usare solo se il segnaposto avanza davvero. */
  readonly updatedAt: Timestamp
}

/**
 * Un gruppo di record da scrivere **insieme**. I campi assenti non vengono
 * toccati; quelli presenti sono upsert (put per chiave `id`).
 *
 * Le eccezioni sono `addExpenses` (semantica **add**) e
 * `advanceRecurringMarkers` (tocca un campo solo, rileggendo dal disco).
 */
export interface WriteBatch {
  readonly expenses?: readonly Expense[]
  /**
   * Spese da inserire **solo se il loro id non esiste gia'**. Su conflitto il
   * record si salta: non si sovrascrive e non si fa fallire il batch.
   *
   * E' la meta' operativa di ADR 006. Le spese generate da una regola hanno un
   * id deterministico (`rec:<regola>:<giorno>`), quindi due contesti che
   * materializzano lo stesso giorno propongono lo stesso id: il primo scrive, il
   * secondo trova il posto occupato e passa oltre. Saltare invece di
   * sovrascrivere e' cio' che protegge la correzione dell'utente sulla singola
   * istanza (canone 920 invece di 900) e la sua cancellazione (un record con
   * `deletedAt` esiste, quindi non viene resuscitato).
   *
   * L'implementazione deve garantire il controllo e l'inserimento **dentro la
   * stessa transazione**: un controllo fatto fuori sarebbe di nuovo una gara.
   */
  readonly addExpenses?: readonly Expense[]
  readonly categories?: readonly Category[]
  readonly recurringRules?: readonly RecurringRule[]
  /**
   * Fa avanzare il segnaposto di una regola **senza portarsi dietro nient'altro
   * di quella regola**.
   *
   * Perche' non basta un `put` della regola letta prima: chi materializza legge
   * la regola dal proprio mirror, e un mirror puo' essere vecchio di ore. Un
   * `put` della copia vecchia riscriverebbe anche `amountCents` e `active`,
   * cioe' riporterebbe in vita una regola che l'utente aveva spento in un altro
   * contesto — e senza che l'utente abbia toccato niente: l'innesco e'
   * l'apertura dell'app. Qui viaggia solo il segnaposto, che e' l'unico campo
   * di cui chi materializza sappia qualcosa di nuovo.
   *
   * L'implementazione deve, **nella stessa transazione**:
   * 1. rileggere il record dal disco; se non c'e' piu', non fare niente;
   * 2. non far mai tornare indietro il segnaposto (un altro contesto puo'
   *    essere andato piu' avanti: quelle spese sono state scritte davvero);
   * 3. lasciare il record intatto se non c'e' niente da far avanzare, `updatedAt`
   *    compreso.
   */
  readonly advanceRecurringMarkers?: readonly RecurringMarkerAdvance[]
  readonly budgets?: readonly Budget[]
  /**
   * Cambia un budget **pianificando dentro la transazione**.
   *
   * Non e' un elenco di record da scrivere: e' l'intenzione ("da oggi il mese
   * vale 800"). Quali record ne seguano — chiudere quello aperto, aggiornarne
   * uno esistente con lo stesso `effectiveFrom`, aprirne uno nuovo — lo decide
   * l'implementazione rileggendo i budget dal disco e chiamando
   * `planResolvedBudgetChange`, come per `advanceRecurringMarkers`.
   *
   * Perche' non basta pianificare fuori e mandare i record gia' pronti: chi
   * pianifica legge i budget dal mirror, e un mirror puo' essere vecchio di ore.
   * Se in quelle ore un altro contesto ha aperto un budget, il piano fatto sul
   * mirror non lo vede e quindi non lo chiude: restano due record aperti
   * sovrapposti. E' l'unico dato dell'app che l'utente non ha nessun modo di
   * correggere dall'interfaccia — nessuna schermata mostra i record storicizzati
   * — mentre la Home continua a mostrare un numero plausibile scelto fra i due.
   *
   * L'istante e l'id del record nuovo viaggiano dentro la richiesta e non
   * vengono generati qui: cosi' un ritentativo della stessa scrittura (la
   * connessione morta che `idb.ts` riapre) riusa lo stesso id invece di aprire
   * un secondo record.
   *
   * I record effettivamente scritti tornano in `WriteResult.budgets`: sono
   * l'unica versione autorevole, e chi tiene un mirror ci si allinea.
   */
  readonly budgetChange?: BudgetChangeRequest
  readonly settings?: Settings
}

export interface WriteResult {
  /**
   * Gli id di `addExpenses` che erano gia' occupati e sono stati saltati.
   * Vuoto quando il batch non usa la semantica add.
   */
  readonly skippedIds: readonly string[]
  /**
   * I record che `budgetChange` ha scritto, nella forma in cui sono finiti sul
   * disco. Vuoto quando il batch non contiene un cambio di budget.
   */
  readonly budgets: readonly Budget[]
}

export interface Persistence {
  /** Legge tutto. Applica le migrazioni se il database e' a una versione vecchia. */
  loadAll(): Promise<LoadedData>
  /**
   * Scrive il batch in **una sola transazione**: o va tutto, o non va niente.
   *
   * E' il perno dell'interrompibilita' delle ricorrenze: le spese generate e
   * l'avanzamento di `lastMaterializedDate` viaggiano nello stesso batch, quindi
   * non esiste uno stato intermedio in cui il segnaposto e' avanti rispetto alle
   * spese davvero scritte (occorrenze perse) o indietro (duplicati al riavvio).
   * Un'implementazione che spezzasse questo batch in piu' transazioni sarebbe
   * conforme al tipo e sbagliata.
   */
  write(batch: WriteBatch): Promise<WriteResult>
  /** Svuota e riscrive tutto, in una transazione. Serve all'import. */
  replaceAll(data: DataSet): Promise<void>
  close(): void
}

export const NOTHING_SKIPPED: WriteResult = { skippedIds: [], budgets: [] }
