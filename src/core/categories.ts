/**
 * Il tetto di otto categorie attive, come regola di dominio.
 *
 * ## Perche' non e' una regola della UI
 *
 * Il tetto esiste per proteggere il vincolo che regge il principio guida n.1: la
 * griglia 4x2 **senza scroll**, cioe' i due tap. Uno scroll ucciderebbe la
 * promessa in silenzio — i due tap diventerebbero scroll + tap senza che nessuna
 * misura se ne accorga.
 *
 * Un vincolo cosi' non si sorveglia in una schermata: si rende impossibile da
 * rappresentare. E' la stessa dottrina dell'identita' deterministica delle
 * ricorrenze (ADR 006), dove il duplicato non viene vietato, viene reso
 * inesprimibile perche' due contesti propongono la stessa chiave.
 *
 * ## Dove sta l'impossibilita', in tre punti
 *
 * 1. **Il tipo.** `CategoryPatch` non ha `archived`: non esiste modo di scrivere
 *    `archived: false` passando dalla via generica di aggiornamento. Un futuro
 *    `updateCategory(id, { archived: false })` e' un **errore di compilazione**,
 *    non un controllo che qualcuno puo' dimenticare. L'unico verso libero e'
 *    quello sicuro: `archiveCategory` toglie dalla griglia e basta.
 * 2. **La forma dell'operazione.** L'unica via che puo' far entrare qualcosa in
 *    griglia e' `planCategoryPlacement`, e finisce con un solo controllo: il
 *    numero di categorie non archiviate **dopo** il piano deve stare sotto il
 *    tetto. Non ci sono altri rami. Lo scambio non e' un caso limite di questa
 *    funzione: e' il suo caso normale, ed e' **una scrittura sola** — archiviare
 *    e aggiungere non possono restare a meta'.
 * 3. **Il piano si fa sul disco, non sul mirror** (ADR 008). Attraversa il
 *    confine l'intenzione ("questa entra, quella esce"), non i record gia'
 *    calcolati: un mirror vecchio di ore che contasse sette attive mentre il
 *    disco ne ha otto infilerebbe la nona senza che nessuno se ne accorga.
 *
 * ## La seconda meta': rendere totale chi legge
 *
 * Impedire non basta, perche' uno stato illegale puo' arrivare da altrove (un
 * JSON scritto a mano, una versione futura, un bug). Per questo
 * `activeCategories` e' **totale e deterministica**: di fronte a nove non
 * archiviate ne restituisce otto per regola — `order`, poi `createdAt`, poi
 * `id` — invece di dipendere dall'ordine con cui IndexedDB ha restituito i
 * record, e senza mai lanciare. La nona si comporta come archiviata finche'
 * qualcuno non la archivia davvero; nessuna schermata si rompe e la griglia
 * resta 4x2. E' `resolveBudget` applicato alle categorie.
 *
 * ## Archiviare non e' cancellare
 *
 * Una categoria archiviata sparisce dalla griglia e **resta su tutte le spese
 * che l'hanno usata**: Storico e statistiche continuano a mostrarla. Archiviare
 * e' un'azione di visualizzazione, non sui dati, e non ha bisogno di nessun
 * permesso. Cancellare davvero e' un'altra cosa e ha una sola condizione:
 * nessun record la nomina piu'. Vedi `planCategoryDeletion`.
 */

import type { Category, Expense, RecurringRule, Timestamp } from './types'

/**
 * Quante categorie stanno in griglia. Otto, cioe' 4x2 senza scroll.
 *
 * Non e' una preferenza: e' il numero di celle che entrano nel viewport piu'
 * piccolo supportato insieme al tastierino. Cambiarlo significa ridisegnare la
 * griglia, non alzare un limite.
 */
export const MAX_ACTIVE_CATEGORIES = 8

/**
 * L'ordine della griglia, totale e deterministico.
 *
 * `order` e' la posizione voluta dall'utente. I due livelli sotto non hanno
 * significato di dominio: esistono perche' due categorie con lo stesso `order`
 * — possibile dopo un import — non producano un ordine che dipende da come
 * IndexedDB ha restituito i record. Stessa ragione del terzo livello di
 * `resolveBudget`.
 */
export function compareCategories(a: Category, b: Category): number {
  if (a.order !== b.order) return a.order - b.order
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

/**
 * Le categorie che la griglia mostra: non archiviate, in ordine, **al massimo
 * `MAX_ACTIVE_CATEGORIES`**.
 *
 * Il taglio non e' una difesa in piu' da mantenere allineata: e' cio' che rende
 * la funzione totale. Se sul disco ci fossero nove non archiviate — un file
 * importato a mano, un bug futuro — questa funzione continua a rispondere con
 * una griglia 4x2 valida invece di lanciare o di restituirne nove. La nona non
 * viene toccata: resta li' finche' qualcuno non la archivia, e nel frattempo
 * non ha nessun effetto visibile.
 */
export function activeCategories(categories: readonly Category[]): readonly Category[] {
  return categories
    .filter((c) => !c.archived)
    .sort(compareCategories)
    .slice(0, MAX_ACTIVE_CATEGORIES)
}

/** Le altre. Quante se ne vuole: l'archivio non ha tetto. */
export function archivedCategories(categories: readonly Category[]): readonly Category[] {
  const active = new Set(activeCategories(categories).map((c) => c.id))
  return categories.filter((c) => !active.has(c.id)).sort(compareCategories)
}

/**
 * **Togliere questa dalla griglia la lascerebbe vuota.**
 *
 * Un fatto solo, in un posto solo, perche' ha **tre lettori** che rispondono
 * alla stessa domanda da tre porte: `planCategoryDeletion` (cancellare),
 * `Repository.archiveCategory` (archiviare) e il foglio, che rifiuta prima di
 * far toccare il bottone.
 *
 * ## Perche' non e' una proprieta' della cancellazione
 *
 * Il pavimento e' nato sulla cancellazione, e l'argomento che lo giustifica non
 * la nomina: *"senza chip non esiste il tap che salva una spesa"*. Vale identico
 * per l'archiviazione — otto archiviazioni lasciano otto record e **zero chip**,
 * e quello stato non lo prende nessuno: `openRepository` risemina a zero
 * **record**, non a zero chip, e `parseBackup` conta i record, archiviate
 * comprese.
 *
 * Scriverlo dentro `planCategoryDeletion` avrebbe legato il fatto alla porta da
 * cui e' entrato. E' *"una decisione vale dove vale il suo argomento"*, presa
 * **mentre** si scriveva la riparazione invece che due gate dopo.
 *
 * ## E' la griglia, non l'archivio
 *
 * Si misura su `activeCategories`, che e' esattamente cio' che i chip mostrano.
 * "L'ultima in assoluto" sarebbe piu' debole proprio dove serve di piu': con una
 * attiva e tre archiviate, toglierla lascia tre record e zero chip — nessuna
 * delle altre porte se ne accorge.
 *
 * ## Rifiuta un gesto, non uno stato
 *
 * *"Questa e' l'ultima"*, non *"dopo non ne resta nessuna"*: la seconda, in uno
 * stato gia' a zero attive (un file importato puo' produrlo), bloccherebbe anche
 * di toccare **le archiviate** — una pulizia che non toglie niente a nessuno,
 * impedita per proteggere una griglia gia' vuota. Da uno stato illegale si puo'
 * solo scendere o restare, mai peggiorare.
 */
export function isLastOnGrid(categories: readonly Category[], id: string): boolean {
  const grid = activeCategories(categories)
  return grid.length === 1 && grid[0]?.id === id
}

/** Quanti posti liberi restano in griglia. Mai negativo. */
export function freeCategorySlots(categories: readonly Category[]): number {
  return Math.max(0, MAX_ACTIVE_CATEGORIES - activeCategories(categories).length)
}

/**
 * Cosa deve finire in griglia: una categoria nuova, o una che sta in archivio.
 *
 * L'id di quella nuova **si pregenera fuori** e viaggia dentro la richiesta
 * (corollario di ADR 008): se la connessione muore e la scrittura viene
 * ritentata, il secondo tentativo scrive lo stesso record invece di crearne un
 * secondo con un altro id.
 */
export type IncomingCategory =
  | {
      readonly kind: 'new'
      readonly id: string
      readonly name: string
      readonly emoji: string
      readonly color: string
    }
  | { readonly kind: 'existing'; readonly id: string }

/**
 * L'intenzione, non il risultato: "questa entra in griglia, e per farle posto
 * esce quella".
 *
 * `replacing` e' cio' che rende lo **scambio un gesto solo**. Le otto categorie
 * di default riempiono esattamente il tetto, quindi la primissima cosa che fa
 * chi ne vuole una sua e' sostituirne una: se per aggiungerne una bisognasse
 * prima andare ad archiviarne un'altra e tornare indietro, il tetto si
 * sentirebbe come un dispetto invece che come una scelta. E se fossero due
 * scritture separate, un'interruzione fra le due lascerebbe sette categorie in
 * griglia e nessuna nuova.
 */
export interface CategoryPlacementRequest {
  readonly incoming: IncomingCategory
  /**
   * Quale archiviare per far posto. Obbligatoria quando la griglia e' piena:
   * senza, il piano viene rifiutato con `grid-full`.
   */
  readonly replacing?: string
  /** L'istante: finisce in `updatedAt` di entrambe, e in `createdAt` della nuova. */
  readonly timestamp: Timestamp
}

export type CategoryPlacementRejection =
  /** Otto in griglia e nessuna indicata da sostituire. La UI chiede quale. */
  | 'grid-full'
  /** L'id da sostituire non esiste. */
  | 'unknown-replacement'
  /** L'id da sostituire non e' in griglia: non libera nessun posto. */
  | 'replacement-not-active'
  /** La categoria da riportare in griglia non esiste. */
  | 'unknown-category'
  /** E' gia' in griglia: non c'e' niente da fare. */
  | 'already-active'
  /** L'id pregenerato della nuova e' gia' occupato. */
  | 'duplicate-id'

export type CategoryPlacement =
  | {
      readonly ok: true
      /** La categoria che ora e' in griglia. */
      readonly placed: Category
      /** Quella archiviata per farle posto, se c'e' stato uno scambio. */
      readonly archived: Category | null
      /** I record da scrivere, tutti insieme o nessuno. */
      readonly written: readonly Category[]
    }
  | { readonly ok: false; readonly reason: CategoryPlacementRejection }

/**
 * Il piano per far entrare una categoria in griglia.
 *
 * **`categories` deve essere lo stato su cui la scrittura andra' davvero ad
 * atterrare**, cioe' i record riletti dentro la transazione. Pianificare su un
 * mirror vecchio significa contare le attive che c'erano ore fa: e' il modo
 * esatto in cui la nona arriva sul disco senza che nessuno l'abbia chiesta.
 *
 * Finisce sempre con lo stesso controllo, e non ce ne sono altri: **quante
 * categorie non archiviate restano dopo**. Sotto il tetto si scrive, sopra si
 * rifiuta. Vale anche se i dati erano gia' illegali (dieci attive arrivate da
 * un import): da li' si puo' solo scendere o restare, mai salire.
 *
 * Chi sostituisce **prende il posto** di chi esce (`order` compreso): e' cio'
 * che vuol dire "sostituisce", ed e' anche la scelta che disturba meno la
 * memoria muscolare — le altre sette non si spostano di una cella.
 */
export function planCategoryPlacement(
  categories: readonly Category[],
  request: CategoryPlacementRequest,
): CategoryPlacement {
  const { incoming, timestamp } = request
  const byId = new Map(categories.map((c) => [c.id, c]))

  // 1. Il posto: quale cella, e chi esce per lasciargliela.
  let archived: Category | null = null
  let order: number
  if (request.replacing === undefined) {
    const orders = categories.map((c) => c.order)
    order = orders.length === 0 ? 10 : Math.max(...orders) + 10
  } else {
    const target = byId.get(request.replacing)
    if (target === undefined) return { ok: false, reason: 'unknown-replacement' }
    if (target.archived) return { ok: false, reason: 'replacement-not-active' }
    archived = { ...target, archived: true, updatedAt: timestamp }
    order = target.order
  }

  // 2. Chi entra.
  let placed: Category
  if (incoming.kind === 'new') {
    if (byId.has(incoming.id)) return { ok: false, reason: 'duplicate-id' }
    placed = {
      id: incoming.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      name: incoming.name,
      emoji: incoming.emoji,
      color: incoming.color,
      order,
      archived: false,
    }
  } else {
    const found = byId.get(incoming.id)
    if (found === undefined) return { ok: false, reason: 'unknown-category' }
    if (!found.archived) return { ok: false, reason: 'already-active' }
    placed = { ...found, archived: false, order, updatedAt: timestamp }
  }

  // 3. L'invariante, per intero e in un controllo solo: quante categorie non
  // archiviate restano quando questo piano sara' stato scritto.
  const remaining = categories.filter(
    (c) => !c.archived && c.id !== archived?.id && c.id !== placed.id,
  ).length
  if (remaining + 1 > MAX_ACTIVE_CATEGORIES) return { ok: false, reason: 'grid-full' }

  return {
    ok: true,
    placed,
    archived,
    // Prima si libera il posto, poi lo si occupa: un `put` per uno, nella stessa
    // transazione.
    written: archived === null ? [placed] : [archived, placed],
  }
}

export interface CategoryDeletionRequest {
  readonly id: string
}

export type CategoryDeletion =
  | { readonly ok: true; readonly deleted: Category }
  | { readonly ok: false; readonly reason: 'unknown' }
  /**
   * **E' l'ultima della griglia.** Cancellarla lascerebbe zero chip, e senza
   * chip non esiste il tap che salva una spesa: il principio guida n.1 non
   * peggiora di un tap, si azzera.
   *
   * Non porta nessun numero, e non e' una svista: il fatto affermato — *"e'
   * l'ultima"* — lo conferma la griglia che sta dietro al velo mentre si legge
   * il rifiuto. E' l'unico esito di questa funzione il cui fatto si vede senza
   * andare da nessuna parte.
   */
  | { readonly ok: false; readonly reason: 'last-active' }
  | {
      readonly ok: false
      readonly reason: 'in-use'
      /**
       * Spese **vive** che la nominano: le lapidi non ci sono. E' un numero che
       * l'utente puo' andare a guardare nello Storico.
       */
      readonly expenses: number
      /** Regole ricorrenti che la nominano. Si vedono tutte in Impostazioni. */
      readonly recurringRules: number
    }

/**
 * Il piano per cancellare **davvero** una categoria.
 *
 * Due condizioni, e non sono parenti. La prima e' un **pavimento**: non si
 * cancella l'ultima categoria della griglia. La seconda e' che nessun record
 * **visibile** la nomini — spese vive e regole ricorrenti. **Le lapidi non
 * bloccano piu'.**
 *
 * ## Il pavimento, e perche' e' sulla cancellazione
 *
 * Per un pezzo questa funzione non ne aveva nessuno, e la conseguenza si
 * misurava in otto tap: su un'installazione appena aperta — zero spese, zero
 * regole — **tutte e otto** le categorie passano il controllo dei record, una
 * per una, e la griglia resta vuota. Non serve nessun file esterno, e non serve
 * nessuno stato strano: e' la strada piu' corta che c'e'.
 *
 * Cosa lascia dietro, e sono due cose, non una:
 *
 * 1. **Non si puo' piu' inserire una spesa.** Il salvataggio *e'* il tap sulla
 *    categoria: senza chip non esiste il gesto che conferma. La ri-semina che
 *    ripara questo stato sta in `openRepository`, cioe' non succede finche'
 *    l'app non viene chiusa davvero — e chi la sta usando non lo sa.
 * 2. **L'export prodotto li' e' un file che `parseBackup` rifiuta**
 *    (`error` su `categories`). L'app scrive una copia che l'app non riprende.
 *
 * Il pavimento va **qui e non sull'export**: un export non si rifiuta mai. Un
 * indicatore di sicurezza sbaglia verso l'allarme, e negare l'uscita dei propri
 * dati e' il verso opposto — si negherebbe all'utente la sua copia per
 * proteggere una coerenza che non ha chiesto.
 *
 * ## E' l'ultima **attiva**, non l'ultima in assoluto
 *
 * Le due divergono appena c'e' qualcosa in archivio, e la risposta viene da
 * cosa lo stato rotto rende impossibile — inserire una spesa dalla griglia —
 * non da cosa sembra simmetrico. La griglia e' `activeCategories`, quindi il
 * pavimento si misura li'.
 *
 * La prova che "in assoluto" sarebbe **piu' debole proprio dove serve di
 * piu'**: con una attiva e tre archiviate, cancellare l'unica attiva lascia
 * `categories.length === 3`. `openRepository` non risemina (risemina a zero
 * record, non a zero chip) e `parseBackup` accetta (conta i record, archiviate
 * comprese). Quello e' lo stato rotto che **nessun'altra porta prende**, ed e'
 * esattamente quello che il pavimento "in assoluto" lascerebbe passare.
 *
 * ## Il pavimento rifiuta un gesto, non uno stato
 *
 * Il controllo non e' *"dopo il piano resta almeno una attiva"*: e' *"questa
 * cancellazione toglie l'ultima attiva"*. La differenza si vede in uno stato
 * gia' rotto — zero attive e qualcosa in archivio, che un file importato puo'
 * produrre: li' la prima forma rifiuterebbe anche di cancellare **le
 * archiviate**, cioe' bloccherebbe una pulizia che non toglie niente a nessuno
 * per proteggere una griglia gia' vuota. Da uno stato illegale si puo' solo
 * scendere o restare, mai peggiorare: e' la stessa lettura di
 * `planCategoryPlacement` davanti a dieci attive arrivate da un import.
 *
 * ## Il pavimento viene **prima** di `in-use`, e cambia il rimedio
 *
 * L'ordine non e' estetico. Il rimedio di `in-use` e' *"archiviala"*, e
 * sull'ultima della griglia sarebbe un consiglio che produce lo stesso stato
 * rotto per un'altra porta — `archiveCategory` non ha nessun pavimento e non
 * passa di qui. Chi sta guardando l'ultima categoria ha un rimedio solo, e non
 * e' nessuno dei due: **prima un'altra, poi questa.**
 *
 * ## Le lapidi: perche' bloccavano, e perche' l'argomento era falso
 *
 * L'argomento era: `restoreExpense` puo' riportare in vita una lapide in un tap,
 * e la riga che torna avrebbe un `categoryId` che non punta a niente — *"un
 * orfano non inerte: una riga rotta e visibile"*.
 *
 * **Non e' rotta.** Tutti e quattro i posti in cui una spesa mostra la propria
 * categoria — `ExpenseRow` (Storico e Home), `ExpenseActions`, `AmountSheet`,
 * `FixedCosts` — leggono `category?.name ?? t('row.categoryRemoved')`, con
 * `category?.emoji ?? '•'` e `category?.color ?? 'transparent'` accanto. Il
 * fallback esiste, ha un nome che dice esattamente questo caso, ed e' **gia'
 * raggiungibile**: `parseBackup` importa le spese orfane di proposito, con un
 * avviso e non un rifiuto ("vengono importate lo stesso"). Non era codice morto
 * tenuto in vita dal blocco; era codice vivo che il blocco nascondeva.
 *
 * Consentire la cancellazione lo rende raggiungibile da una **seconda** strada,
 * ordinaria: e' un argomento a favore, non contro.
 *
 * ## Il criterio, che e' piu' largo di come era stato scritto
 *
 * Il rifiuto diceva *"ci sono spese cancellate che la usano"* — un fatto che
 * nessuna schermata mostra. Non e' il caso di *"nessun messaggio cita un numero
 * che l'utente non puo' vedere"*: quello era il caso particolare visto per
 * primo. Il criterio e' **nessun messaggio afferma un fatto che l'utente non
 * puo' verificare**, e togliere il numero da una frase inverificabile la lascia
 * inverificabile.
 *
 * Fra riformulare la frase e togliere il rifiuto, si toglie il rifiuto: la
 * conseguenza che lo giustificava non esiste.
 *
 * ## Cosa questo lascia scoperto, dichiarato
 *
 * Una lapide puo' restare con un `categoryId` orfano, e `restoreExpense` puo'
 * riportarla in vita. La riga che torna dice "Categoria rimossa", con il pallino
 * al posto dell'emoji: e' vero, ed e' esattamente quello che e' successo.
 * **Non c'e' modo di riassegnarle una categoria** — nessun foglio lo offre — e
 * quel nome le resta.
 *
 * Va detto quanto e' stretta la finestra in cui la cosa capita: l'unico
 * chiamante di produzione di `restoreExpense` e' l'"Annulla" del toast, cioe'
 * la spesa cancellata pochi secondi prima. Una lapide vecchia abbastanza perche'
 * si stia cancellando la sua categoria non ha nessuna strada per tornare viva.
 *
 * Stesso vincolo di `recurringId`, ora esteso: **`categoryId` puo' restare
 * orfano dopo la cancellazione di una categoria. Ogni lettore deve gestire
 * l'assenza esplicitamente, non assumerla impossibile.** Oggi tutti e quattro lo
 * fanno; `spentByCategory` raggruppa per id e non dereferenzia, quindi la
 * schermata delle statistiche della fase 6 dovra' portarsi dietro lo stesso
 * fallback.
 *
 * ## I numeri del rifiuto restano quelli visibili
 *
 * Le lapidi **non entrano in `expenses`**: nessuna schermata mostra le spese
 * cancellate, quindi un rifiuto che dicesse "la usano 8 spese" citerebbe un
 * numero che l'utente non puo' riconciliare con niente. Con 3 spese vive e 5
 * lapidi l'esito e' `in-use` con `expenses: 3`, cioe' il numero che lo Storico
 * mostra davvero.
 *
 * Contano anche le regole ricorrenti: una regola che nomina una categoria
 * inesistente genererebbe spese orfane per sempre, cioe' lo stesso danno che
 * arriva da solo invece che una volta.
 *
 * ## I budget non contano piu', e non e' un'eccezione: e' che non possono
 *
 * Per un po' qui si contavano anche i **budget di categoria**, storici
 * compresi, con l'argomento che l'import poteva farne entrare uno e la
 * cancellazione lo avrebbe lasciato orfano e invisibile. L'argomento e' caduto
 * insieme al campo: `Budget.categoryId` non esiste piu' (vedi `types.ts`),
 * quindi **nessun budget puo' nominare una categoria** — nemmeno uno importato,
 * perche' `parseBudget` non legge piu' quel campo.
 *
 * Contarli era un ramo che esisteva solo per lui: `usedByBudgets` valeva zero
 * a ogni chiamata dal giorno in cui il foglio del budget e' nato senza
 * selettore di categoria, e la frase "e 2 budget" non e' mai stata mostrata a
 * nessuno. Il giorno in cui il budget per categoria esistera' davvero, questo
 * conteggio torna **insieme al suo campo di input**, nello stesso commit.
 *
 * Se qualcuno la usa, la risposta non e' "no": e' **archiviala**. Che e' gratis,
 * non perde niente, e produce esattamente cio' che l'utente voleva — la
 * categoria fuori dalla griglia.
 *
 * E' anche la domanda che la UI fa **prima** di offrire il bottone: la funzione
 * e' pura, e il rifiuto porta con se' i numeri da mostrare.
 */
export function planCategoryDeletion(
  categories: readonly Category[],
  expenses: readonly Expense[],
  recurringRules: readonly RecurringRule[],
  request: CategoryDeletionRequest,
): CategoryDeletion {
  const target = categories.find((c) => c.id === request.id)
  if (target === undefined) return { ok: false, reason: 'unknown' }
  // Il pavimento. La domanda — e con lei tutto l'argomento — sta in
  // `isLastOnGrid`, perche' non e' una proprieta' della cancellazione: vale
  // identica per l'archiviazione, che e' l'altra porta per arrivare a zero chip.
  if (isLastOnGrid(categories, target.id)) return { ok: false, reason: 'last-active' }
  // Solo le vive: sono quelle che lo Storico mostra, cioe' le uniche che si
  // possono citare in un messaggio — **e le uniche che bloccano**. Una lapide
  // che tornasse in vita mostrerebbe "Categoria rimossa", che e' un fallback che
  // esiste in tutti e quattro i lettori, non una riga rotta.
  const usedByExpenses = expenses.filter(
    (e) => e.categoryId === request.id && e.deletedAt === undefined,
  ).length
  const usedByRules = recurringRules.filter((r) => r.categoryId === request.id).length
  if (usedByExpenses > 0 || usedByRules > 0) {
    return { ok: false, reason: 'in-use', expenses: usedByExpenses, recurringRules: usedByRules }
  }
  return { ok: true, deleted: target }
}
