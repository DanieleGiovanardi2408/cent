/**
 * Le entita' del dominio. Nessun comportamento, solo forma.
 *
 * Regole valide per tutte:
 * - `id` e' un UUID generato da `crypto.randomUUID()`;
 * - `createdAt` / `updatedAt` sono timestamp ISO 8601 completi (istanti, non
 *   date civili): servono per l'ordinamento stabile e per i log di import;
 * - gli importi sono `Cents`, interi. Mai float.
 * - le date di dominio sono `IsoDate` (`YYYY-MM-DD`), mai `Date`.
 */

import type { Cents } from './money'
import type { IsoDate } from './date'

/** Istante ISO 8601 con fuso, es. `2026-08-22T14:03:11.482Z`. */
export type Timestamp = string

export interface EntityBase {
  readonly id: string
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

export type ExpenseSource = 'manual' | 'recurring'

export interface Expense extends EntityBase {
  readonly amountCents: Cents
  readonly categoryId: string
  readonly date: IsoDate
  /**
   * Minuti dalla mezzanotte **locale** del giorno `date`: intero 0..1439.
   *
   * Stessa disciplina dei centesimi e delle date civili: un intero, nessun fuso,
   * nessun `Date` che sopravviva al calcolo. 20:40 e' `1240`.
   *
   * **Opzionale, e la sua assenza e' un dato.** Viene impostato solo quando la
   * spesa nasce nel giorno in cui viene inserita, cioe' quando l'orologio sa
   * davvero che ora era: una spesa retrodatata (Ieri, o una data scelta a mano)
   * non ha un orario, e inventarglielo sarebbe peggio che lasciarlo vuoto —
   * le statistiche per fascia oraria della fase 6 lo tratterebbero come vero.
   * Per la stessa ragione non ce l'hanno le spese generate da una ricorrenza.
   *
   * Non e' modificabile dalla UI: e' un'informazione che il telefono ha gia', e
   * che non deve costare un tap a nessuno.
   */
  readonly timeMinutes?: number
  readonly note?: string
  readonly source: ExpenseSource
  /** Presente solo se `source === 'recurring'`: la regola che l'ha generata. */
  readonly recurringId?: string
  /** Soft delete. Se valorizzato la spesa non entra in nessun totale. */
  readonly deletedAt?: Timestamp
}

export interface Category extends EntityBase {
  readonly name: string
  readonly emoji: string
  /** Colore in formato `#rrggbb`. */
  readonly color: string
  /** Posizione nella lista dei chip. Interi, non necessariamente contigui. */
  readonly order: number
  readonly archived: boolean
}

export type Cadence = 'daily' | 'weekly' | 'monthly'

/**
 * `note` non c'e', e non e' una dimenticanza.
 *
 * C'e' stata: tre lettori (l'etichetta della riga in `App.tsx`, quella in
 * `FixedCosts.tsx`, e la copia sulla spesa generata) e **zero produttori** —
 * nessuna schermata l'ha mai scritta, perche' il foglio della regola non ha mai
 * avuto un campo nota. Un campo cosi' non e' "pronto per quando servira'": e'
 * un ramo di codice che nessun test puo' raggiungere passando dal prodotto, e
 * tre `?? fallback` che sembrano coprire un caso vivo.
 *
 * La regola generale: **un campo si spedisce insieme al suo produttore, o non
 * si spedisce.** Il giorno in cui il foglio avra' il campo nota, questo torna
 * insieme a lui.
 *
 * Nessuna migrazione: nessun record puo' averlo (l'unico modo di scriverlo era
 * un `addRecurringRule` che nessuno ha mai chiamato con `note`). Se ne
 * arrivasse uno da un JSON scritto a mano, IndexedDB lo conserva — `loadAll`
 * non valida — e `parseRule` lo scarta in import.
 *
 * ---
 *
 * **`endDate` non c'e' piu', per la stessa ragione e in forma piu' netta.**
 *
 * Aveva lettori dappertutto — la finestra di materializzazione, `validateRule`,
 * `monthlyFixedCosts`, `sameCalendar`, l'anteprima, due chiavi di dizionario per
 * lingua — e **zero produttori**: nessun foglio la scriveva. `RuleSheet` si
 * limitava a ricopiarla da un record che non poteva averla, e l'unico posto che
 * sapesse costruirne una era `parseBackup`.
 *
 * Ed e' qui che e' piu' netta che con `note`: **con zero produttori nemmeno un
 * backup puo' contenerla**, perche' un backup e' l'export di dati scritti da
 * quest'app. Quindi era morto anche il supporto in `parseRule` — quindici rami
 * raggiungibili solo da un JSON scritto a mano.
 *
 * La motivazione **e' questa e nessun'altra**: zero produttori. Non "toglie una
 * scorciatoia di performance": `amountCents: 1`, la doppia anteprima e i due
 * `useMemo` di `RuleSheet` restano da valutare per conto loro, con il loro
 * argomento.
 *
 * Nessuna migrazione, per lo stesso motivo di `note`: nessun record puo' averla.
 *
 * **L'idea non e' morta**, ed e' in `docs/ROADMAP.md` per la fase 7 con il suo
 * argomento vero — le spese fisse di un Erasmus finiscono tutte: la palestra a
 * giugno, il tram ad agosto, l'affitto con il contratto. Torna **insieme al suo
 * campo di input**, nello stesso commit.
 *
 * Qui ci sono i campi che **non dipendono dalla cadenza**. Gli altri due —
 * `cadence` e `anchorDay` — stanno in `WithCadence` qui sotto, insieme, perche'
 * il secondo esiste solo per uno dei valori del primo.
 */
export interface RecurringRuleCommon extends EntityBase {
  readonly amountCents: Cents
  readonly categoryId: string
  /** Ogni quanti giorni / settimane / mesi. Intero >= 1. */
  readonly interval: number
  readonly startDate: IsoDate
  /**
   * Ultimo giorno **gia' materializzato e persistito**. Avanza solo dopo che la
   * transazione che ha scritto le spese di quel giorno e' andata a buon fine.
   * Assente = la regola non ha mai prodotto nulla.
   */
  readonly lastMaterializedDate?: IsoDate
  readonly active: boolean
}

/**
 * Il calendario, attaccato a una forma qualunque: e' cio' che divide in due
 * ogni cosa che abbia una cadenza — la regola sul disco e la bozza che la UI
 * sta ancora scrivendo.
 *
 * ## Perche' l'ancora e' obbligatoria sulle mensili
 *
 * Fino allo schema 3 `anchorDay` era opzionale e il motore, quando mancava, lo
 * derivava da `startDate`. Il significato della regola dipendeva quindi da un
 * campo che **un'altra operazione puo' cambiare**: `rewindRecurringRule`
 * retrodata `startDate`, e una regola "il 1 del mese" retrodatata al 23 giugno
 * diventava "il 23 del mese" — in silenzio, e con le istanze gia' generate il 1
 * rimaste fuori calendario.
 *
 * Riparare il rewind facendogli scrivere anche l'ancora avrebbe lasciato in
 * piedi la causa: **ogni** operazione futura che tocca `startDate` avrebbe
 * dovuto ricordarsi di congelarla. I writer sono gia' due (`addRecurringRule`
 * e `RuleSheet`), e il secondo l'invariante non la stabiliva.
 *
 * Quindi l'ancora e' esplicita, e a renderla obbligatoria e' **il compilatore**:
 * `{ cadence: 'monthly' }` senza `anchorDay` non e' un record che un controllo
 * a runtime rifiuta, e' un record che non si puo' scrivere. Le altre cadenze
 * non la vogliono affatto (`?: never`), perche' li' non significa niente e un
 * campo che non significa niente e' un campo che qualcuno leggera'.
 *
 * Un `anchorDay` > giorni del mese cade sull'ultimo giorno (`clampDayOfMonth`)
 * senza mai sconfinare nel mese successivo: 31 a febbraio e' il 28 (o il 29).
 */
export type WithCadence<T> =
  | (T & { readonly cadence: 'monthly'; readonly anchorDay: number })
  | (T & { readonly cadence: 'daily' | 'weekly'; readonly anchorDay?: never })

export type RecurringRule = WithCadence<RecurringRuleCommon>

export type BudgetPeriod = 'weekly' | 'monthly'

/**
 * Budget storicizzato: non si modifica, si chiude e se ne apre uno nuovo.
 * Un record vale per i giorni in `[effectiveFrom, effectiveTo]`; senza
 * `effectiveTo` vale fino a nuovo ordine.
 *
 * ## `categoryId` non c'e', ed e' il terzo caso della stessa malattia
 *
 * Dopo `RecurringRule.note` (tre lettori) e `RecurringRule.endDate` (quindici),
 * questo ne aveva **diciassette nel solo `budget.ts`** e zero produttori.
 *
 * L'unico chiamante di produzione di `setBudget` passa
 * `{ period, amountCents, effectiveFrom }`: il foglio del budget non ha, e non
 * ha mai avuto, un selettore di categoria. Le tre scritture che esistevano
 * ricopiavano `change.categoryId` da un `BudgetChange` che nessuno riempiva —
 * cioe' una catena di sole copie, che gira a vuoto. E' la definizione che vale
 * qui: **un campo e' prodotto quando un valore entra da fuori almeno una
 * volta.**
 *
 * Cosa faceva quel campo mentre era assente: `resolveBudget` confrontava
 * `budget.categoryId !== categoryId` con `undefined` da entrambe le parti,
 * `inRange` e `budgetSpent` avevano un filtro per categoria che nessuno
 * attivava, `planResolvedBudgetChange` partizionava i record per una chiave
 * composta il cui secondo membro era costante. Diciassette rami raggiungibili
 * solo da un test.
 *
 * **Nessuna migrazione**, per lo stesso motivo di `note` e `endDate`: nessun
 * record puo' averlo. Con zero produttori nemmeno un backup puo' contenerlo,
 * perche' un backup e' l'export di dati scritti da quest'app. Se ne arrivasse
 * uno da un JSON scritto a mano, `parseBudget` lo scarta e IndexedDB conserva
 * la proprieta' in piu' senza che nessuno la legga.
 *
 * **L'idea non e' morta, ma non e' `endDate`.** `endDate` era
 * un'implementazione rimandata, di forma nota e piccola; il budget per categoria
 * e' una **domanda di design** — ogni categoria con il suo periodo? il
 * complessivo resta? come si sommano? — e si incrocia con ADR 016, che tiene le
 * ricorrenti fuori dal budget. Sta in `docs/ROADMAP.md` come domanda, non come
 * arretrato.
 */
export interface Budget extends EntityBase {
  readonly period: BudgetPeriod
  readonly amountCents: Cents
  readonly effectiveFrom: IsoDate
  readonly effectiveTo?: IsoDate
}

export type ThemePreference = 'light' | 'dark' | 'auto'

/** Le due lingue dell'app. Non e' una stringa qualsiasi: e' un insieme chiuso. */
export type Language = 'it' | 'en'

export function isLanguage(value: unknown): value is Language {
  return value === 'it' || value === 'en'
}

/** Record singolo: esiste una sola riga, con questo id. */
export const SETTINGS_ID = 'settings'

export interface Settings extends EntityBase {
  readonly id: typeof SETTINGS_ID
  /** Lunedi'. Il tipo e' letterale: cambiarlo e' una decisione, non un'opzione. */
  readonly weekStartsOn: 1
  readonly theme: ThemePreference
  readonly lastBackupAt?: Timestamp
  /** Versione dello schema con cui questi dati sono stati scritti. */
  readonly schemaVersion: number
  /**
   * La lingua **scelta dall'utente**. Opzionale, e la sua assenza e' un dato:
   * significa "nessuno l'ha mai scelta", non "italiano".
   *
   * Il core non sa niente di `navigator`, e non deve: il default di prodotto
   * — inglese se la lingua del telefono non e' italiano — dipende
   * dall'ambiente, e un ambiente non e' un dato di dominio. Quindi qui il campo
   * nasce **assente** e chi disegna la UI lo risolve leggendo l'ambiente a ogni
   * avvio, finche' l'utente non entra in Impostazioni e sceglie davvero.
   *
   * Scriverci un valore al posto suo — nella migrazione, o al primo avvio —
   * vorrebbe dire registrare una decisione che nessuno ha preso, e da quel
   * momento non ci sarebbe piu' modo di distinguere "ha scelto italiano" da
   * "gliel'abbiamo indovinato": chi cambia la lingua del telefono si
   * ritroverebbe l'app ferma su una scelta che non ricorda di aver fatto. E' la
   * stessa ragione per cui `Expense.timeMinutes` resta assente invece di
   * ricevere mezzanotte.
   */
  readonly language?: Language
  /**
   * Quando la guida al primo avvio e' stata completata **o saltata**. Opzionale:
   * assente = mai vista, ed e' lo stato a cui la guida e' agganciata.
   *
   * E' uno **stato**, non un evento: la guida si mostra a ogni apertura finche'
   * questo campo e' assente, quindi mostrarla e' idempotente e ripetibile —
   * l'unica forma che ADR 009 accetta per qualcosa che deve succedere "al primo
   * avvio" su una piattaforma dove l'avvio non e' un evento affidabile.
   *
   * Chi rivede la guida da Impostazioni non lo azzera: rivederla e' una lettura,
   * non un ritorno allo stato iniziale.
   */
  readonly onboardingCompletedAt?: Timestamp
}

/*
 * Nota su un campo che non c'e': `storagePersisted`.
 *
 * L'esito di `navigator.storage.persist()` non e' un dato dell'app: e' uno
 * stato che il browser gia' tiene e che `navigator.storage.persisted()` sa dire
 * a ogni avvio, gratis e sempre aggiornato. Cacharlo qui voleva dire tenerne una
 * copia che puo' solo divergere — il permesso si puo' revocare, i dati si
 * possono spostare — per non fare una chiamata che costa niente. Chi in fase 5
 * lo vorra' mostrare in Impostazioni lo legga vivo.
 */

/**
 * Tutti i dati dell'app in memoria. E' anche la forma del mirror letto dalla UI
 * e il corpo dell'export JSON.
 */
export interface DataSet {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly recurringRules: readonly RecurringRule[]
  readonly budgets: readonly Budget[]
  readonly settings: Settings
}

export type StoreName = 'expenses' | 'categories' | 'recurringRules' | 'budgets' | 'settings'

/**
 * UUID v4 costruito a mano da 16 byte casuali.
 *
 * Esiste perche' `crypto.randomUUID` e' `[SecureContext]`: su
 * `http://192.168.1.x:5173` — cioe' `npm run dev -- --host`, il modo piu' corto
 * per provare l'app su un iPhone vero — in Safari e' `undefined`. Senza questo
 * fallback il primo avvio muore in `buildDefaultCategories` con un `TypeError` e
 * l'app non parte proprio nel percorso in cui la si va a misurare.
 *
 * `crypto.getRandomValues` invece c'e' anche fuori da un contesto sicuro, ed e'
 * la stessa sorgente di entropia che `randomUUID` userebbe. Restano da imporre a
 * mano i due campi che l'RFC 4122 non lascia casuali: i 4 bit alti del byte 6
 * sono la versione (`0100` = 4), i 2 bit alti del byte 8 sono la variante (`10`).
 */
function uuidV4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let hex = ''
  for (let i = 0; i < 16; i += 1) {
    let byte = bytes[i] ?? 0
    if (i === 6) byte = (byte & 0x0f) | 0x40
    if (i === 8) byte = (byte & 0x3f) | 0x80
    hex += byte.toString(16).padStart(2, '0')
    if (i === 3 || i === 5 || i === 7 || i === 9) hex += '-'
  }
  return hex
}

/**
 * Genera un id. Estratto per poterlo rendere deterministico nei test.
 *
 * `randomUUID` quando c'e' (e' l'implementazione del browser, non la nostra);
 * `uuidV4` quando non c'e', cioe' fuori da un contesto sicuro.
 */
export function newId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : uuidV4()
}

export function nowTimestamp(): Timestamp {
  return new Date().toISOString()
}
