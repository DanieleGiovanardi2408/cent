/**
 * Schema del database e migrazioni.
 *
 * Le migrazioni sono definite come **trasformazioni pure** su un insieme di
 * record grezzi (`RawDataSet`), non come codice IndexedDB. Cosi' lo stesso
 * elenco di passi serve a due consumatori diversi:
 *
 * 1. l'apertura del database (`idb.ts`), che le applica dentro la transazione
 *    di upgrade;
 * 2. l'**import** di un backup JSON scritto da una versione precedente
 *    (`backup.ts`), che non passa da IndexedDB.
 *
 * Averne una copia sola e' l'unico modo perche' i due percorsi non divergano,
 * ed e' anche l'unico modo per testarle in node.
 */

import type { StoreName } from './types'

export const DB_NAME = 'cent'

/** Versione corrente. Si incrementa aggiungendo un passo a `MIGRATIONS`. */
export const SCHEMA_VERSION = 5

export const STORE_NAMES: readonly StoreName[] = [
  'expenses',
  'categories',
  'recurringRules',
  'budgets',
  'settings',
]

/** Un record letto dal database o da un file, prima di essere validato. */
export type RawRecord = Record<string, unknown>

/** Tutti i record, per store. `settings` e' un array di 0 o 1 elementi. */
export type RawDataSet = { [K in StoreName]: RawRecord[] }

export interface IndexSpec {
  readonly name: string
  readonly keyPath: string | readonly string[]
  readonly unique?: boolean
}

export interface StoreSpec {
  readonly name: StoreName
  readonly indexes: readonly IndexSpec[]
}

export interface MigrationStep {
  /** Versione raggiunta da questo passo. */
  readonly to: number
  readonly summary: string
  /** Store creati a questa versione (keyPath sempre `id`). */
  readonly createStores?: readonly StoreSpec[]
  /** Indici aggiunti a store che esistevano gia'. */
  readonly addIndexes?: readonly { readonly store: StoreName; readonly index: IndexSpec }[]
  /**
   * Trasformazione dei record. Riceve l'insieme completo e ne restituisce uno
   * nuovo: deve essere pura e non deve mai perdere record senza dirlo.
   */
  readonly transform?: (data: RawDataSet) => RawDataSet
}

/**
 * Indici.
 *
 * Sono pochi di proposito. La UI **non interroga IndexedDB**: legge dal mirror
 * in memoria caricato all'avvio (`repository.ts`), quindi raggruppamenti,
 * filtri e aggregazioni sono `Array.prototype` su dati gia' in RAM — 5.000
 * spese sono circa 700 KB, e un filtro su 5.000 elementi costa decine di
 * microsecondi. Aggiungere indici per query che nessuno esegue vorrebbe dire
 * pagarli a ogni singola scrittura in cambio di niente.
 *
 * `by-date` esiste per l'unica lettura vera che il database riceve: il
 * caricamento iniziale, che con un cursore sull'indice arriva gia' ordinato per
 * data e risparmia un sort. E' anche l'indice da cui partirebbe un eventuale
 * caricamento a finestre, se un giorno l'archivio diventasse troppo grande per
 * stare tutto in memoria.
 *
 * Non c'e' un indice su `recurringId`: la deduplica delle ricorrenze lavora sul
 * mirror, non sul database (vedi `recurrence.ts`).
 */
const INITIAL_STORES: readonly StoreSpec[] = [
  { name: 'expenses', indexes: [{ name: 'by-date', keyPath: 'date' }] },
  { name: 'categories', indexes: [] },
  { name: 'recurringRules', indexes: [] },
  { name: 'budgets', indexes: [] },
  { name: 'settings', indexes: [] },
]

/**
 * I passi, in ordine crescente di `to`.
 *
 * Regole per chi ne aggiunge uno:
 * - non modificare mai un passo gia' pubblicato, se ne aggiunge un altro;
 * - `transform` non cancella record. Se un record non e' piu' rappresentabile
 *   si converte, non si butta: l'utente non ha nessun altro posto dove averlo.
 */
export const MIGRATIONS: readonly MigrationStep[] = [
  {
    to: 1,
    summary: 'Schema iniziale: expenses, categories, recurringRules, budgets, settings',
    createStores: INITIAL_STORES,
  },
  {
    to: 2,
    summary: 'Expense.timeMinutes (opzionale); le impostazioni dichiarano la versione 2',
    /**
     * `timeMinutes` e' **opzionale**, quindi le spese gia' scritte non hanno
     * niente da ricevere: una spesa inserita prima di questa versione non ha un
     * orario, e l'unica cosa vera da scrivere sarebbe nessuna. Riempirle con uno
     * zero (mezzanotte) o con l'ora di `createdAt` significherebbe fabbricare a
     * tavolino un dato che nessuno ha mai osservato, e le statistiche per fascia
     * oraria della fase 6 non avrebbero modo di distinguerlo da uno vero.
     *
     * Quello che invece va aggiornato e' il record delle impostazioni: porta
     * scritto con quale versione dello schema questi dati sono stati scritti, e
     * dopo l'upgrade continuerebbe a dire 1 per sempre — l'unico campo che
     * mentirebbe. E' un record solo, il singleton.
     *
     * Le altre sezioni escono da qui **con lo stesso riferimento** con cui sono
     * entrate: e' cosi' che `idb.ts` sa di non doverle riscrivere (vedi
     * `applyTransforms`), ed e' la forma verificabile di "la migrazione non tocca
     * i record esistenti".
     */
    transform: (data) => ({
      ...data,
      settings: data.settings.map((raw) => ({ ...raw, schemaVersion: 2 })),
    }),
  },
  {
    to: 3,
    summary: 'Settings.language e Settings.onboardingCompletedAt (opzionali, default assente)',
    /**
     * **Una migrazione sola per due campi**, ed entrambi entrano assenti.
     *
     * Non c'e' niente da scrivere sui record esistenti, e non e' pigrizia: per
     * tutti e due il default previsto **e' l'assenza**, e l'assenza e' un dato.
     *
     * - `language` assente = "nessuno l'ha mai scelta". Il default di prodotto
     *   (inglese se il telefono non e' italiano) dipende da `navigator`, che
     *   `src/core` non conosce e non deve conoscere. Se questa migrazione
     *   scrivesse `'it'` — l'unica ipotesi plausibile per chi ha gia' un
     *   database — registrerebbe una decisione che l'utente non ha preso, e da
     *   quel momento nessuno potrebbe piu' distinguerla da una scelta vera.
     * - `onboardingCompletedAt` assente = "guida mai vista". Scriverci un
     *   istante vorrebbe dire dichiarare completata una guida che non e' mai
     *   esistita, e togliere proprio a chi usa gia' l'app la spiegazione del
     *   cents-first — cioe' l'errore che quell'utente ha commesso due volte in
     *   sessanta secondi.
     *
     * E' la stessa dottrina del passo alla versione 2 con `timeMinutes`: un
     * campo opzionale nuovo non si riempie a tavolino.
     *
     * Resta quindi l'unico campo che mentirebbe, il numero di versione del
     * singleton delle impostazioni. Le altre sezioni escono **con lo stesso
     * riferimento** con cui sono entrate: e' cosi' che `idb.ts` sa di non dover
     * riscrivere nessuna spesa (vedi `applyTransforms`), ed e' la forma
     * verificabile di "la migrazione non tocca i record esistenti".
     */
    transform: (data) => ({
      ...data,
      settings: data.settings.map((raw) => ({ ...raw, schemaVersion: 3 })),
    }),
  },
  {
    to: 4,
    summary: 'RecurringRule.anchorDay esplicito e obbligatorio sulle regole mensili',
    /**
     * **L'unica migrazione che scrive un campo sui record esistenti**, e la sola
     * ragione per cui puo' farlo e' che il valore da scrivere e' ancora
     * ricavabile con certezza.
     *
     * Fino allo schema 3 una regola mensile poteva non avere `anchorDay`, e il
     * motore derivava il giorno del mese da `startDate`. Il significato della
     * regola dipendeva quindi da un campo che un'altra operazione puo'
     * cambiare: retrodatare una regola "il 1 del mese" al 23 giugno la
     * trasformava in "il 23 del mese", in silenzio.
     *
     * ## Perche' adesso, e non dopo
     *
     * E' aritmetica, non fretta: **in questo momento `startDate` non e' ancora
     * stato spostato da nessuno**, quindi il giorno che se ne ricava e' esattamente
     * quello che il motore stava gia' usando. La stessa derivazione fatta dopo il
     * primo rewind ricaverebbe l'ancora **sbagliata** e la scriverebbe come se
     * fosse quella giusta — un dato falso, plausibile, e senza piu' nessun posto
     * da cui rileggere quello vero.
     *
     * Non e' quindi il caso di `timeMinutes` ne' di `language`, dove riempire a
     * tavolino un campo opzionale avrebbe registrato un'osservazione che nessuno
     * ha fatto. Qui il valore **e' gia' in uso**: si sta scrivendo cio' che il
     * motore calcolava a ogni apertura. La migrazione non cambia il calendario
     * di nessuna regola, lo rende soltanto esplicito.
     *
     * ## Cosa non tocca
     *
     * - Le cadenze `daily` e `weekly`: li' l'ancora non significa niente, e dallo
     *   schema 4 il tipo non la lascia nemmeno esprimere. Se un record ne porta
     *   una — nessun writer l'ha mai scritta, ma un JSON a mano puo' — resta sul
     *   record grezzo e la scarta `parseRule` in import.
     * - Le mensili che ce l'hanno gia': si lasciano come sono. Il valore scritto
     *   vince sempre su quello derivabile.
     * - Le mensili con `startDate` illeggibile: **il record resta**, senza
     *   ancora. Non si inventa un giorno. Da li' in poi `validateRule` la
     *   dichiara non utilizzabile e il motore la salta dicendolo, che e' il
     *   comportamento che gia' aveva — era rotta prima e resta rotta, ma non
     *   sparisce.
     *
     * Le sezioni non toccate escono **con lo stesso riferimento** con cui sono
     * entrate, e `recurringRules` pure quando non c'e' niente da derivare: e'
     * cosi' che `idb.ts` sa di non dover riscrivere niente (vedi
     * `applyTransforms`), ed e' la forma verificabile di "la migrazione non tocca
     * i record che non la riguardano".
     */
    transform: (data) => ({
      ...data,
      recurringRules: withExplicitAnchorDay(data.recurringRules),
      settings: data.settings.map((raw) => ({ ...raw, schemaVersion: 4 })),
    }),
  },
  {
    to: 5,
    summary: 'Le otto tinte delle categorie passano alla palette che regge i pavimenti',
    /**
     * **Cambiare `defaults.ts` non cambia niente a chi l'app ce l'ha gia'.**
     *
     * Le categorie di default si **seminano** al primo avvio
     * (`repository.ts`, `if (settings === null)`) e da quel momento sono dati
     * dell'utente: nessuno rilegge `DEFAULT_CATEGORY_SEEDS`. Le otto tinte nuove
     * — quelle che passano i quattro pavimenti di `scripts/palette.mjs` e ΔE00
     * 12,64 a schermo — sarebbero quindi arrivate **solo alle installazioni
     * nuove**, e ogni telefono esistente avrebbe continuato a dipingere la
     * palette vecchia, quella a ΔE 9,4 fra `Spesa` e `Coffeeshop`.
     *
     * Il difetto che questo giro e' venuto a togliere sarebbe rimasto intero
     * esattamente dove qualcuno stava per guardarlo: **nella ciambella**, dove
     * il colore non e' ornamento ma **e' il dato**.
     *
     * ## Il criterio e' "quale pastiglia hai scelto", non "l'hai toccata"
     *
     * La formulazione naturale sarebbe *"aggiorna le categorie che l'utente non
     * ha mai toccato, lascia stare quelle personalizzate"*. **Non e'
     * applicabile, e per un fatto dell'albero**: la tavolozza dell'editor offre
     * **esattamente le otto tinte di default** (`CategorySheet.tsx`, `PALETTE`
     * deriva da `DEFAULT_CATEGORY_SEEDS`). Una categoria ricolorata a mano porta
     * quindi **un esadecimale della palette vecchia** come una mai toccata: il
     * colore non distingue i due casi, perche' non c'e' nessun terzo colore da
     * cui distinguerli.
     *
     * E il ripiego `updatedAt !== createdAt` sarebbe peggio: si muove per
     * **qualunque** modifica — un rinomina, uno spostamento, un'archiviazione.
     * Lascerebbe la palette vecchia proprio a chi ha usato l'app come e'
     * progettata, visto che rinominare le categorie e' *"esattamente cio' che
     * l'editor serve a fare"* (CLAUDE.md).
     *
     * Quindi la migrazione mappa **pastiglia su pastiglia**, per posizione nella
     * palette: chi aveva scelto la terza pastiglia si ritrova la terza pastiglia
     * nuova. Non conserva un esadecimale, conserva **la scelta** — ed e' la
     * lettura giusta perche' i colori sono *"un sistema, non otto scelte
     * separate"* (CLAUDE.md): quando il sistema si sostituisce, si sostituisce
     * l'elemento, non lo si abbandona.
     *
     * Il caso che lo rende evidente: chi avesse messo su una categoria il grigio
     * di `Extra` (`#676c75`). Tenerglielo non sarebbe rispetto di una scelta —
     * dalla palette nuova **il grigio non e' piu' una tinta di categoria**, e'
     * il colore con cui l'interfaccia dice *"qui non c'e' un dato"* ed e' quello
     * che indossa l'aggregato delle orfane **nella stessa figura** (ADR 025).
     * Lasciarlo vorrebbe dire lasciare una categoria travestita da assenza.
     *
     * ## Cosa non tocca
     *
     * - **Un colore fuori dalla palette vecchia resta dov'e'.** Oggi nessun
     *   writer dell'app puo' produrne uno — la tavolozza ha otto chiavi — ma un
     *   backup importato si': quello e' un valore che viene da fuori, e su cui
     *   questa mappa non ha niente da dire.
     * - **Nessun altro campo.** Nomi, emoji, ordine, archiviazione: intatti.
     *   Questa migrazione cambia un solo campo e solo dove sa cosa scriverci.
     *
     * `categories` esce **con lo stesso riferimento** se non c'e' niente da
     * cambiare, cosi' `applyTransforms` in `idb.ts` non riscrive uno store che
     * non e' cambiato — la forma verificabile di "non tocca i record che non la
     * riguardano".
     */
    transform: (data) => ({
      ...data,
      categories: withPaletteV2(data.categories),
      settings: data.settings.map((raw) => ({ ...raw, schemaVersion: 5 })),
    }),
  },
]

/**
 * La palette che si ritira, nell'ordine dei seed, e quella che la sostituisce.
 *
 * **Le due liste sono scritte qui a mano, ed e' l'unico posto del progetto in
 * cui una copia degli esadecimali e' giusta.** Altrove — `palette.mjs`,
 * `palette.test.ts` — le tinte si leggono da `defaults.ts` proprio per non avere
 * una seconda fonte di verita'. Qui no: una migrazione descrive **una
 * transizione fra due stati passati**, e `defaults.ts` conosce solo il presente.
 * Se questa mappa leggesse da li', il giorno della prossima palette
 * riscriverebbe le tinte di ieri con quelle di domani saltando un passaggio, e
 * lo farebbe **retroattivamente su chi non ha ancora migrato**.
 *
 * Una migrazione e' un fatto storico. I fatti storici si scrivono.
 */
const PALETTE_V1: readonly string[] = [
  '#81a369', // groceries
  '#f26b00', // eatingOut
  '#06b0a0', // coffeeshop
  '#845e23', // cigarettes
  '#3f5db6', // transport
  '#b90e5c', // leisure
  '#bc85ec', // home
  '#676c75', // extra — il grigio che la palette nuova non ha piu'
]

const PALETTE_V2: readonly string[] = [
  '#709951',
  '#fc5401',
  '#00a6c6',
  '#895c02',
  '#3157fa',
  '#b90f60',
  '#9861c7',
  '#2a6198',
]

/**
 * Porta ogni colore della palette vecchia sulla pastiglia corrispondente della
 * nuova. Restituisce **lo stesso array** se non c'era niente da fare.
 *
 * Il confronto e' insensibile a maiuscole e minuscole: `Category.color` e' una
 * stringa, e un backup scritto a mano puo' portare `#81A369`.
 */
function withPaletteV2(categories: RawRecord[]): RawRecord[] {
  const mappa = new Map(PALETTE_V1.map((vecchio, i) => [vecchio, PALETTE_V2[i]!]))
  let changed = false
  const next = categories.map((raw) => {
    const colore = raw['color']
    if (typeof colore !== 'string') return raw
    const nuovo = mappa.get(colore.trim().toLowerCase())
    if (nuovo === undefined || nuovo === colore) return raw
    changed = true
    return { ...raw, color: nuovo }
  })
  return changed ? next : categories
}

/**
 * Il giorno del mese scritto in una `YYYY-MM-DD`, o `null` se non lo e'.
 *
 * Non passa da `toDateParts`: quella lancia, e una migrazione che lancia su un
 * record storto abortisce la transazione di upgrade e lascia l'utente con
 * un'app che non si apre piu'. Qui un record illeggibile e' un record che passa
 * oltre intatto.
 */
function dayOfMonthOf(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const day = Number(value.slice(8, 10))
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null
}

/**
 * Scrive `anchorDay` sulle mensili che non ce l'hanno, derivandolo da
 * `startDate`. Restituisce **lo stesso array** se non c'era niente da fare.
 */
function withExplicitAnchorDay(rules: RawRecord[]): RawRecord[] {
  let changed = false
  const next = rules.map((raw) => {
    if (raw['cadence'] !== 'monthly') return raw
    if (typeof raw['anchorDay'] === 'number') return raw
    const day = dayOfMonthOf(raw['startDate'])
    if (day === null) return raw
    changed = true
    return { ...raw, anchorDay: day }
  })
  return changed ? next : rules
}

export function emptyRawDataSet(): RawDataSet {
  return { expenses: [], categories: [], recurringRules: [], budgets: [], settings: [] }
}

/** I passi da applicare per portare dei dati da `fromVersion` a `toVersion`. */
export function pendingMigrations(
  fromVersion: number,
  toVersion: number,
  steps: readonly MigrationStep[] = MIGRATIONS,
): readonly MigrationStep[] {
  return steps.filter((s) => s.to > fromVersion && s.to <= toVersion).sort((a, b) => a.to - b.to)
}

export class SchemaTooNewError extends Error {
  constructor(
    readonly foundVersion: number,
    readonly supportedVersion: number,
  ) {
    super(
      `Dati scritti dalla versione ${foundVersion} dello schema, questa app arriva alla ${supportedVersion}. ` +
        `Aggiorna l'app prima di importarli.`,
    )
    this.name = 'SchemaTooNewError'
  }
}

/**
 * Porta un insieme di record grezzi da `fromVersion` a `toVersion`.
 *
 * Non valida le forme: si limita ad applicare le trasformazioni. La validazione
 * e' a valle, in `backup.ts`, e vede quindi sempre record gia' nella forma
 * corrente.
 *
 * @throws SchemaTooNewError se i dati vengono dal futuro. Rifiutarli e' l'unica
 * scelta onesta: aprirli con uno schema piu' vecchio significherebbe scartare in
 * silenzio i campi che non conosciamo e riscriverli mutilati.
 */
export function migrateRawData(
  data: RawDataSet,
  fromVersion: number,
  toVersion: number = SCHEMA_VERSION,
  steps: readonly MigrationStep[] = MIGRATIONS,
): RawDataSet {
  if (fromVersion > toVersion) throw new SchemaTooNewError(fromVersion, toVersion)
  let current = data
  for (const step of pendingMigrations(fromVersion, toVersion, steps)) {
    if (step.transform) current = step.transform(current)
  }
  return current
}
