/**
 * Export e import del backup JSON.
 *
 * `parseBackup` **non applica niente**: legge, migra, valida e restituisce
 * un'anteprima. Applicare e' un'altra chiamata (`Repository.importBackup`), e in
 * mezzo ci sta la conferma dell'utente. E' il requisito "import con anteprima e
 * conferma, mai sovrascrittura silenziosa" scritto come firma di funzione invece
 * che come promessa nella UI: chi importa non ha modo di saltare il passaggio.
 *
 * Il file dichiara la propria `schemaVersion`. Un backup vecchio passa dalle
 * stesse migrazioni del database (`schema.ts`) prima di essere validato, quindi
 * il validatore vede sempre e solo la forma corrente.
 *
 * Fuori da qui, di proposito: l'export CSV — **fase 8**, deciso il 7 settembre
 * 2026 — e la fusione con i dati esistenti. L'import sostituisce tutto.
 *
 * Il numero di fase qui e' un rinvio con una data, non un fatto derivato: e'
 * stato *"fase 7"* fino a oggi, cioe' fino alla fase che ha chiuso senza
 * costruirlo. Quando arrivera' non passera' comunque da questo modulo, perche'
 * un CSV non e' un file che `parseBackup` sappia rileggere.
 */

import { activeCategories } from './categories'
import { isIsoDate, isTimeMinutes, toDateParts } from './date'
import type { IsoDate } from './date'
import { buildDefaultSettings } from './defaults'
import { SCHEMA_VERSION, emptyRawDataSet, migrateRawData } from './schema'
import type { RawDataSet, RawRecord } from './schema'
import { isLive } from './stats'
import type {
  Budget,
  Category,
  DataSet,
  Expense,
  RecurringRule,
  Settings,
  StoreName,
  Timestamp,
} from './types'
import { SETTINGS_ID, nowTimestamp } from './types'

export interface BackupFile {
  readonly app: 'cent'
  readonly schemaVersion: number
  readonly exportedAt: Timestamp
  readonly data: {
    readonly expenses: readonly Expense[]
    readonly categories: readonly Category[]
    readonly recurringRules: readonly RecurringRule[]
    readonly budgets: readonly Budget[]
    readonly settings: Settings
  }
}

export function buildBackup(data: DataSet, now: () => Timestamp = nowTimestamp): BackupFile {
  return {
    app: 'cent',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now(),
    data: {
      expenses: data.expenses,
      categories: data.categories,
      recurringRules: data.recurringRules,
      budgets: data.budgets,
      settings: data.settings,
    },
  }
}

export type IssueSeverity = 'error' | 'warning'

/**
 * Un rilievo sulla lettura del file: **quanto grave** e **dove**. Mai in che
 * parole.
 *
 * ## Il dominio non parla nessuna lingua
 *
 * `src/core` non conosce i dizionari e non deve. Una frase emessa da qui
 * sarebbe italiana per costruzione, in un'app il cui default e' **inglese**:
 * e' presentazione dentro il dominio, la stessa cosa gia' corretta togliendo
 * `it-IT` da `money.ts`.
 *
 * C'e' stato un campo `message`, e non e' stato tradotto: e' stato **tolto**.
 * Aveva zero lettori di produzione — `refusalOf` classifica su `severity`,
 * `path` e `recordId`, e le quattro coppie di frasi stanno nei due dizionari —
 * quindi viveva delle sole asserzioni dei test, come `RecurringRule.note` e
 * `expensesInRange` prima di lui.
 *
 * Cio' che resta sono **fatti**: una severita' che decide, un punto che si
 * legge, e — quando c'e' — un id che si cerca dentro il file. Le parole le
 * sceglie chi mostra, nella lingua di chi guarda.
 */
export interface ImportIssue {
  readonly severity: IssueSeverity
  /** Dove, in forma leggibile: `expenses[12].amountCents`. */
  readonly path: string
  /**
   * **L'id del record, quando c'e' — ed e' l'unica cosa di questa issue che si
   * puo' cercare dentro il file.**
   *
   * `path` porta un **indice**: `expenses[12]` e' la tredicesima posizione di un
   * array, e nel JSON quella stringa **non compare**. Il commento che
   * giustificava di mostrarlo diceva *"e' la stringa da cercare in un editor"*,
   * e non lo era: chi ci provava con Cmd-F non trovava niente, e il rimedio
   * *"da un computer apri il file e togli quel record"* — l'unica cosa che rende
   * accettabile il rifiuto totale (DEBITO §13) — non portava da nessuna parte.
   *
   * `recordId` invece nel file c'e' **davvero**, ed e' unico: `"id": "e-42"` si
   * trova. Il nome non e' `id` di proposito — DEBITO §11: il controllo A di
   * `dead-surface` cerca il **nome** e non il tipo, e un campo chiamato `id`
   * risulterebbe vivo per omonimia con mezzo progetto.
   *
   * E' `undefined` **se e solo se e' l'id stesso a mancare**: li' non c'e'
   * niente da cercare, e la schermata ripiega sull'indice **dicendo che e' una
   * posizione**. Onesto invece che comodo.
   *
   * ## Il "se e solo se" e' stato falso per un commit
   *
   * Questa riga diceva gia' *"e' `undefined` quando e' l'id stesso a mancare"*,
   * e due `c.error` la smentivano: `campi opzionali di tipo sbagliato` in
   * `parseExpense` e `lastMaterializedDate` in `parseRule` passavano il solo
   * `path` **avendo `b.id` in mano**. Li' la schermata diceva *"conta la quarta
   * spesa"* dove poteva dire *"cerca questo id"* — cioe' il ripiego onesto usato
   * dove non serviva, che e' il modo in cui un ripiego smette di essere onesto.
   *
   * L'invariante non e' piu' sorvegliato da questa frase: `backup.test.ts`
   * rompe **ogni** campo di **ogni** entita' tenendo l'id intatto e chiede che
   * ogni `error` porti il suo `recordId`. Un sito nuovo che se lo dimentica cade
   * li', senza che nessuno debba ricordarsi di questo capoverso.
   */
  readonly recordId?: string
}

export interface ImportPreview {
  /**
   * **Nessuna issue di severita' `error`**, e nient'altro. Non e' un giudizio
   * separato dalle issue: e' la loro lettura, ed e' l'unica che le rende
   * vincolanti. Un `ok: true` accanto a un `error` significherebbe che la
   * severita' non decide niente.
   *
   * `false` = il file non si importa: `data` e' `null` e `counts` e' a zero.
   */
  readonly ok: boolean
  readonly data: DataSet | null
  /**
   * **Cio' che l'utente vedra' dopo l'import**, non i record del file.
   *
   * Non e' un dettaglio di presentazione: e' il numero di un prima/dopo davanti
   * a una conferma distruttiva, e ADR 026 §6c lo mette li'. Le due liste
   * divergono su una cosa sola, e vale la pena averla scritta:
   *
   * - **le spese** si contano **vive** (`isLive`): una lapide non si vede in
   *   nessuna schermata. Sul primo backup reale questo campo diceva **6 dove
   *   lo Storico ne mostra 3**. Le lapidi restano dentro `data` — devono
   *   sopravvivere al round-trip, altrimenti un import le resusciterebbe — e
   *   quindi `counts.expenses` e' minore di `data.expenses.length` **di
   *   proposito**;
   * - **le categorie** si contano **tutte, archiviate comprese**, ed e' lo
   *   stesso criterio, non un'eccezione: una categoria archiviata sparisce
   *   dalla griglia ma resta su ogni spesa che l'ha usata, quindi Storico e
   *   Statistiche continuano a mostrarla. Il confine non e' "attiva" — che e'
   *   una proprieta' della griglia — ma "si vede da qualche parte". La lapide
   *   sta da zero parti; l'archiviata da due. Contare solo le attive
   *   mentirebbe **per difetto** proprio nel caso in cui il file ne porta piu'
   *   di otto, cioe' quando `capActiveCategories` ne archivia il surplus e
   *   l'utente le ritroverebbe tutte in Impostazioni.
   *
   * - **le regole** non hanno ne' lapidi ne' archivio: si contano tutte, spente
   *   comprese, perche' Impostazioni le elenca tutte.
   *
   * ## Tre chiavi, non cinque: le altre due non erano conteggi
   *
   * `Record<StoreName, number>` ne chiedeva cinque, e le due che avanzavano
   * dicevano il falso ognuna a modo suo.
   *
   * - **`settings` valeva `1`**, scritto a mano. Non contava niente: era la
   *   costante che serviva a soddisfare l'indice. *"Cio' che l'utente vedra'
   *   dopo l'import"* non e' mai stato "una impostazione".
   * - **`budgets`** era un conteggio vero e **non mostrabile**, e la ragione e'
   *   gia' scritta accanto a `countRows` in `src/ui/import-view.ts`: i budget
   *   sono storicizzati, quindi chi ha cambiato budget tre volte ne ha tre
   *   record e ne vede uno. Un numero che l'utente non puo' riconciliare con lo
   *   schermo non informa.
   *
   * Il tipo indicizzato faceva anche da guardiano — uno store di sistema fra
   * quelli d'archivio non compilava, qui due volte — ma era **un guardiano per
   * omonimia**, non per scelta: valeva finche' nessuno aveva una ragione di
   * prodotto per restringere il record, cioe' finche' nessuno guardava. Quello
   * scelto apposta e' `RawDataSet` in `schema.ts`, ed e' ancora li'.
   */
  readonly counts: {
    readonly expenses: number
    readonly categories: number
    readonly recurringRules: number
  }
  /* **Qui c'era `discarded`**, il numero di record scartati perche'
   * irrecuperabili. Si giustificava dicendo di portare *"quanto e' grave un
   * rifiuto"* — e a schermo quel "quanto" non l'ha mai portato lui: lo porta
   * `more` di `ImportRefusal`, che `refusalOf` conta **sulle issue**. Il campo
   * descriveva un lettore che non esisteva.
   *
   * E non porta via niente, perche' era derivabile da cio' che resta: ogni
   * scarto passa da `Collector.error`, quindi `discarded > 0` e *"c'e' almeno
   * una issue `error`"* sono la stessa frase — che e' anche l'unica riga che
   * decide `ok`. */
  readonly issues: readonly ImportIssue[]
  /**
   * Versione dichiarata dal file, prima delle migrazioni. `null` quando il file
   * non ne dichiara una leggibile — cioe' quando **non e' un backup**.
   *
   * Vale anche sui rifiuti, ed e' cambiato apposta: prima ogni rifiuto la
   * azzerava, **compreso quello di un file scritto da una versione futura**,
   * dove il numero era noto e non c'era niente da nascondere. Quel `null` e'
   * il campo che ADR 026 §5 chiama "non e' un ramo": *"aggiorna l'app"* e
   * *"questo non e' un backup"* sono messaggi opposti e avevano lo stesso
   * valore qui.
   *
   * Adesso la distinzione **si deriva** senza nessun campo nuovo:
   * `fromSchemaVersion > SCHEMA_VERSION` su un `ok: false` significa "il file
   * viene da un'app piu' nuova di questa", e `null` significa "non c'era niente
   * da leggere". Resta vero che **la UI non ramifica sul solo `null`**: il
   * resto della classificazione viene dal `path` delle issue.
   */
  readonly fromSchemaVersion: number | null
  /**
   * L'istante in cui il file e' stato esportato, come lo dichiara il file.
   *
   * **E' il fatto su cui si decide se ripristinare** — la data entra dentro la
   * frase di conferma (ADR 026 §6) — ed era l'unico che `buildBackup` scriveva
   * e l'anteprima buttava via.
   *
   * `null` quando il file non ne porta uno leggibile, e allora la frase si
   * scrive **senza data**: una data inventata qui sarebbe l'unico numero della
   * schermata che nessuno puo' verificare.
   */
  readonly exportedAt: Timestamp | null
}

class Collector {
  readonly issues: ImportIssue[] = []
  error(path: string, recordId?: string): null {
    this.issues.push({ severity: 'error', path, ...(recordId === undefined ? {} : { recordId }) })
    return null
  }
  warn(path: string): void {
    this.issues.push({ severity: 'warning', path })
  }
}

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function optionalStr(value: unknown): string | undefined | false {
  if (value === undefined || value === null) return undefined
  return typeof value === 'string' ? value : false
}

function intCents(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

function isoDate(value: unknown): IsoDate | null {
  return typeof value === 'string' && isIsoDate(value) ? value : null
}

function optionalIsoDate(value: unknown): IsoDate | undefined | false {
  if (value === undefined || value === null) return undefined
  return isoDate(value) ?? false
}

/**
 * `timeMinutes`: assente e' la norma, sbagliato si butta.
 *
 * Un orario fuori scala o non intero non giustifica la perdita della spesa —
 * l'importo, la data e la categoria sono intatti e sono cio' che conta — ma non
 * si aggiusta nemmeno: arrotondare `1500` a `1439` vorrebbe dire inventare le
 * 23:59, e il campo assente e' gia' il modo che il modello ha per dire "di
 * questa spesa non sappiamo l'ora". Si scarta, e lo scarto **resta segnato**:
 * una `warning` sul campo. Cosa ci sia scritto accanto non lo decide questo
 * modulo — vedi `ImportIssue`.
 */
function optionalTimeMinutes(value: unknown, path: string, c: Collector): number | undefined {
  if (value === undefined || value === null) return undefined
  if (isTimeMinutes(value)) return value
  c.warn(path)
  return undefined
}

interface BaseFields {
  readonly id: string
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

function base(raw: RawRecord, path: string, c: Collector): BaseFields | null {
  const id = str(raw['id'])
  if (id === null) return c.error(`${path}.id`)
  // I timestamp mancanti non giustificano la perdita del record: quello che
  // conta di una spesa e' l'importo, non l'ora in cui e' stata digitata.
  const fallback = new Date(0).toISOString()
  const createdAt = typeof raw['createdAt'] === 'string' ? raw['createdAt'] : fallback
  const updatedAt = typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : createdAt
  return { id, createdAt, updatedAt }
}

function parseExpense(raw: RawRecord, path: string, c: Collector): Expense | null {
  const b = base(raw, path, c)
  if (b === null) return null
  const amountCents = intCents(raw['amountCents'])
  if (amountCents === null) return c.error(`${path}.amountCents`, b.id)
  const categoryId = str(raw['categoryId'])
  if (categoryId === null) return c.error(`${path}.categoryId`, b.id)
  const date = isoDate(raw['date'])
  if (date === null) return c.error(`${path}.date`, b.id)
  const source = raw['source'] === 'recurring' ? 'recurring' : 'manual'
  const note = optionalStr(raw['note'])
  const recurringId = optionalStr(raw['recurringId'])
  const deletedAt = optionalStr(raw['deletedAt'])
  if (note === false || recurringId === false || deletedAt === false) {
    // `b.id` e non niente: il record ce l'ha, e senza la schermata direbbe
    // "conta la quarta spesa" dove poteva dire "cerca questo id". Vedi
    // `ImportIssue.recordId`.
    return c.error(path, b.id)
  }
  const timeMinutes = optionalTimeMinutes(raw['timeMinutes'], `${path}.timeMinutes`, c)
  return {
    ...b,
    amountCents,
    categoryId,
    date,
    source,
    ...(timeMinutes !== undefined ? { timeMinutes } : {}),
    ...(note !== undefined ? { note } : {}),
    ...(recurringId !== undefined ? { recurringId } : {}),
    ...(deletedAt !== undefined ? { deletedAt } : {}),
  }
}

function parseCategory(raw: RawRecord, path: string, c: Collector): Category | null {
  const b = base(raw, path, c)
  if (b === null) return null
  const name = str(raw['name'])
  if (name === null) return c.error(`${path}.name`, b.id)
  const order = raw['order']
  return {
    ...b,
    name,
    emoji: typeof raw['emoji'] === 'string' ? raw['emoji'] : '🔖',
    color: typeof raw['color'] === 'string' ? raw['color'] : '#6b7280',
    order: typeof order === 'number' && Number.isFinite(order) ? order : 0,
    archived: raw['archived'] === true,
  }
}

function parseRule(raw: RawRecord, path: string, c: Collector): RecurringRule | null {
  const b = base(raw, path, c)
  if (b === null) return null
  const amountCents = intCents(raw['amountCents'])
  if (amountCents === null) return c.error(`${path}.amountCents`, b.id)
  const categoryId = str(raw['categoryId'])
  if (categoryId === null) return c.error(`${path}.categoryId`, b.id)
  const cadence = raw['cadence']
  if (cadence !== 'daily' && cadence !== 'weekly' && cadence !== 'monthly') {
    return c.error(`${path}.cadence`, b.id)
  }
  const interval = raw['interval']
  if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1) {
    return c.error(`${path}.interval`, b.id)
  }
  const startDate = isoDate(raw['startDate'])
  if (startDate === null) return c.error(`${path}.startDate`, b.id)
  // `endDate` non si legge piu', e non e' una perdita: il campo non esiste piu'
  // sul record (vedi `RecurringRuleCommon`), e **con zero produttori nemmeno un
  // backup poteva contenerlo** — un backup e' l'export di dati scritti da
  // quest'app. Un `endDate` in un JSON scritto a mano viene ignorato in
  // silenzio, come qualunque altra chiave sconosciuta: non e' un dato che
  // qualcuno abbia perso, e' una chiave che questa app non ha mai emesso.
  const lastMaterializedDate = optionalIsoDate(raw['lastMaterializedDate'])
  if (lastMaterializedDate === false) {
    return c.error(path, b.id)
  }
  const common = {
    ...b,
    amountCents,
    categoryId,
    interval,
    startDate,
    active: raw['active'] !== false,
    ...(lastMaterializedDate !== undefined ? { lastMaterializedDate } : {}),
  }
  const anchorRaw = raw['anchorDay']
  const anchorDay =
    typeof anchorRaw === 'number' && Number.isInteger(anchorRaw) && anchorRaw >= 1 && anchorRaw <= 31
      ? anchorRaw
      : null

  // Fuori dalle mensili l'ancora non esiste: dallo schema 4 il tipo non la
  // lascia nemmeno esprimere. Nessun writer di questa app ne ha mai scritta una
  // su una giornaliera o una settimanale, ma un JSON a mano puo': si scarta, e
  // resta segnato — una `warning` su `anchorDay` — perche' scartarla senza
  // lasciare traccia farebbe sparire un numero che qualcuno aveva scritto
  // apposta.
  if (cadence !== 'monthly') {
    if (anchorRaw !== undefined && anchorRaw !== null) {
      c.warn(`${path}.anchorDay`)
    }
    return { ...common, cadence }
  }

  // Una mensile senza ancora leggibile la riceve da `startDate`, ed e' **la
  // stessa derivazione della migrazione 3 -> 4**.
  //
  // Questa e' la strada che la migrazione non copre: un file puo' dichiarare
  // gia' lo schema 4 — scritto a mano, o esportato da una versione futura di
  // se stesso — e allora `migrateRawData` non ha nessun passo da applicargli.
  // Senza questa riga quel file perderebbe la regola (`c.error` scarta il
  // record), cioe' l'unico esito che un import non puo' produrre.
  //
  // Vale anche per un'ancora fuori scala (0, 45, 1.5): prima faceva scartare
  // **tutta** la regola, e un importo, una categoria e un calendario perduti
  // per un campo derivabile sono una perdita che non serve a niente.
  if (anchorDay === null) {
    if (anchorRaw !== undefined && anchorRaw !== null) {
      c.warn(`${path}.anchorDay`)
    }
    return { ...common, cadence, anchorDay: toDateParts(startDate).day }
  }
  return { ...common, cadence, anchorDay }
}

function parseBudget(raw: RawRecord, path: string, c: Collector): Budget | null {
  const b = base(raw, path, c)
  if (b === null) return null
  const period = raw['period']
  if (period !== 'weekly' && period !== 'monthly') {
    return c.error(`${path}.period`, b.id)
  }
  const amountCents = intCents(raw['amountCents'])
  if (amountCents === null) return c.error(`${path}.amountCents`, b.id)
  const effectiveFrom = isoDate(raw['effectiveFrom'])
  if (effectiveFrom === null) return c.error(`${path}.effectiveFrom`, b.id)
  const effectiveTo = optionalIsoDate(raw['effectiveTo'])
  if (effectiveTo === false) return c.error(`${path}.effectiveTo`, b.id)
  // `categoryId` non si legge: il campo non esiste piu' su `Budget` (vedi
  // `types.ts`). Con zero produttori nemmeno un backup puo' contenerlo, quindi
  // sostenerlo qui sarebbe un ramo raggiungibile solo da un JSON scritto a
  // mano — lo stesso che `endDate` aveva in `parseRule`. Un file che lo porta
  // perde quel campo e tiene il budget: e' un budget complessivo, che e'
  // l'unica cosa che questa app sa calcolare.
  return {
    ...b,
    period,
    amountCents,
    effectiveFrom,
    ...(effectiveTo !== undefined ? { effectiveTo } : {}),
  }
}

/**
 * Le impostazioni **che entrano dal file**, che sono meno di quelle che il file
 * contiene.
 *
 * CLAUDE.md divide `Settings` in due da giorni: `language`, `theme`,
 * `onboardingCompletedAt` (e `createdAt`, che dice quando l'app e' stata
 * installata **qui**) descrivono il dispositivo; `weekStartsOn` e
 * `schemaVersion` descrivono i dati. Qui si smette di leggere la prima meta'.
 *
 * **Non si legge invece di leggere-e-ignorare** perche' `data` di
 * `ImportPreview` e' esattamente cio' che viene passato a
 * `Repository.importBackup`: un `theme: 'dark'` letto dal file e mai applicato
 * sarebbe un valore che dice cosa succedera' e si sbaglia, e il primo che lo
 * mostrasse nell'anteprima mostrerebbe una cosa falsa.
 *
 * Il `theme` che esce da qui e' quindi un **segnaposto**: sta nell'oggetto
 * perche' `Settings.theme` e' obbligatorio, non perche' qualcuno lo legga —
 * `settingsAfterImport` lo sostituisce con quello di questo telefono. Nessun
 * altro chiamante esiste: `parseBackup` non applica niente.
 *
 * `lastBackupAt` non si legge dal file per un'altra ragione ancora: non e'
 * conservato **ne'** importato, e' **derivato** dall'`exportedAt` del file.
 * Vedi `settingsAfterImport`.
 */
function parseSettings(raw: RawRecord | undefined, exportedAt: Timestamp | null, c: Collector): Settings {
  const fallback = buildDefaultSettings()
  const derived = exportedAt === null ? {} : { lastBackupAt: exportedAt }
  if (raw === undefined) {
    c.warn('settings')
    return { ...fallback, ...derived }
  }
  if (raw['weekStartsOn'] !== undefined && raw['weekStartsOn'] !== 1) {
    c.warn('settings.weekStartsOn')
  }
  return {
    id: SETTINGS_ID,
    createdAt: typeof raw['createdAt'] === 'string' ? raw['createdAt'] : fallback.createdAt,
    updatedAt: typeof raw['updatedAt'] === 'string' ? raw['updatedAt'] : fallback.updatedAt,
    weekStartsOn: 1,
    theme: fallback.theme,
    // La versione la decide questa app, non il file: i dati sono appena passati
    // dalle migrazioni e sono nella forma corrente qualunque cosa dica il file.
    schemaVersion: SCHEMA_VERSION,
    ...derived,
  }
}

/**
 * Le impostazioni da scrivere quando un import viene **applicato**: il
 * dispositivo da una parte, i dati dall'altra.
 *
 * Sta qui e non dentro `Repository.importBackup` perche' e' la seconda meta'
 * di `parseSettings` — una legge il file sapendo cosa non prendere, l'altra
 * scrive sapendo cosa conservare — e leggerle a due file di distanza vorrebbe
 * dire tenere la divisione a mente. Ma **si applica solo qui**, dove il
 * dispositivo esiste: `parseBackup` e' pura e non sa niente di questo telefono.
 *
 * - `theme`, `language`, `onboardingCompletedAt`, `createdAt`: di `device`.
 *   Chi ha appena scelto un file da ripristinare ha dimostrato di non essere
 *   alle prime armi, e rimettergli la guida davanti ai dati appena importati
 *   sarebbe il modo peggiore di accoglierlo.
 * - `weekStartsOn` e `schemaVersion`: di `imported`. Il primo perche'
 *   cambiarlo **reinterpreta ogni confine di periodo dello storico**, quindi
 *   descrive i dati (oggi vale 1 per tipo: la riga conta il giorno in cui quel
 *   vincolo cadesse); il secondo perche' `parseSettings` l'ha gia' portato
 *   alla versione corrente.
 * - `lastBackupAt`: **derivato**. Dopo un ripristino l'ultimo backup e' proprio
 *   il file appena importato, e quello e' il suo `exportedAt`. Se il file non
 *   ne dichiarava uno, il campo esce **assente** invece di conservare quello
 *   del dispositivo: quella data parlava di un archivio che non c'e' piu', e un
 *   indicatore di sicurezza che puo' sbagliare deve sbagliare **verso
 *   l'allarme**.
 * - `updatedAt`: `writtenAt`. Questo record non viene ne' dal file ne' dal
 *   disco — e' il loro innesto — e l'unico istante vero e' quello in cui viene
 *   scritto. Arriva da fuori gia' generato, come ogni altro timestamp che
 *   attraversa il confine della persistenza, cosi' un ritentativo riscrive lo
 *   stesso record invece di spostarne la data.
 */
export function settingsAfterImport(
  device: Settings,
  imported: Settings,
  writtenAt: Timestamp,
): Settings {
  return {
    id: SETTINGS_ID,
    createdAt: device.createdAt,
    updatedAt: writtenAt,
    theme: device.theme,
    ...(device.language !== undefined ? { language: device.language } : {}),
    ...(device.onboardingCompletedAt !== undefined
      ? { onboardingCompletedAt: device.onboardingCompletedAt }
      : {}),
    weekStartsOn: imported.weekStartsOn,
    schemaVersion: imported.schemaVersion,
    ...(imported.lastBackupAt !== undefined ? { lastBackupAt: imported.lastBackupAt } : {}),
  }
}

/**
 * Riporta le categorie sotto il tetto di otto attive, se il file le sfora.
 *
 * L'import e' l'unica porta da cui entrano dati scritti da qualcun altro — un
 * JSON modificato a mano, una versione futura — quindi e' anche l'unico punto in
 * cui uno stato che il resto dell'app non sa produrre puo' arrivare sul disco.
 * `replaceAll` scrive in blocco e non passa da `planCategoryPlacement`: se non
 * si normalizzasse qui, il tetto sarebbe garantito da tutte le vie tranne una.
 *
 * Si archivia il **surplus**, non si scarta niente: archiviare non perde nessun
 * dato — la categoria resta su tutte le spese che l'hanno usata — ed e'
 * reversibile con uno scambio. Quali restino in griglia lo decide
 * `activeCategories`, cioe' `order` e poi due livelli deterministici: mai
 * l'ordine in cui il file le elencava.
 *
 * **E oggi e' silenzioso, che e' il contrario di quello che qui c'era scritto.**
 *
 * La riga diceva *"non e' silenzioso: l'anteprima lo dice, e l'anteprima e' il
 * posto dove l'utente decide se importare"*. Falsa: `ImportStep.ready` non porta
 * le issue, e la schermata nel ramo "pronto" disegna solo la frase e la tabella
 * del prima/dopo. La `warning` di questa funzione — come quella sulle
 * impostazioni assenti e quella sulle spese orfane — **non arriva a schermo**.
 * Chi importa un file con dieci categorie ne trova due in archivio, e lo scopre
 * aprendo il tastierino.
 *
 * Era **la giustificazione per archiviare invece di rifiutare**, ed e' stata
 * scritta contro un canale che non esiste — la sesta affermazione falsa di
 * questa fase, e la quarta dentro un documento o un commento scritto durante la
 * fase stessa. Vedi la nota in testa ad ADR 026.
 *
 * **Perche' archiviare resta comunque la scelta giusta**, e adesso l'argomento e'
 * un altro: rifiutare un file per una categoria di troppo butterebbe un archivio
 * intero per una cosa che l'app **sa gia' fare da sola** — il tetto di otto
 * attive e' un invariante che `capActiveCategories` mantiene a ogni ingresso,
 * non una condizione che il file deve soddisfare. E' la stessa forma della
 * ri-semina: si ripara, non si rifiuta.
 *
 * **Cio' che resta aperto e' il canale**, ed e' scritto in `docs/DEBITO.md` §15
 * con la sua condizione: le warning che cambiano cio' che l'utente vedra' devono
 * comparire nell'anteprima, dove la decisione si prende.
 */
function capActiveCategories(categories: readonly Category[], c: Collector): Category[] {
  const keep = new Set(activeCategories(categories).map((cat) => cat.id))
  const surplus = categories.filter((cat) => !cat.archived && !keep.has(cat.id))
  if (surplus.length === 0) return [...categories]
  c.warn('categories')
  return categories.map((cat) =>
    keep.has(cat.id) || cat.archived ? cat : { ...cat, archived: true },
  )
}

function rawArray(source: RawRecord, key: StoreName, c: Collector): RawRecord[] {
  const value = source[key]
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    c.warn(key)
    return []
  }
  return value.filter((item): item is RawRecord => {
    if (isRecord(item)) return true
    c.warn(key)
    return false
  })
}

function parseList<T extends { readonly id: string }>(
  raws: readonly RawRecord[],
  store: StoreName,
  parse: (raw: RawRecord, path: string, c: Collector) => T | null,
  c: Collector,
): T[] {
  const byId = new Map<string, T>()
  raws.forEach((raw, index) => {
    const record = parse(raw, `${store}[${index}]`, c)
    // Uno scarto non si conta qui: `parse` restituisce `null` passando da
    // `Collector.error`, quindi lo scarto **e' gia'** una issue, ed e' li' che
    // la schermata va a contare (`refusalOf`).
    if (record === null) return
    // La `warning` segna **la seconda occorrenza**, cioe' quella che vince:
    // `byId.set` sovrascrive, quindi di due record con lo stesso id resta
    // l'ultimo del file. Il fatto stava dentro la frase e adesso sta qui.
    if (byId.has(record.id)) {
      c.warn(`${store}[${index}]`)
    }
    byId.set(record.id, record)
  })
  return [...byId.values()]
}

const EMPTY_COUNTS: ImportPreview['counts'] = {
  expenses: 0,
  categories: 0,
  recurringRules: 0,
}

/**
 * Legge un backup e prepara l'anteprima.
 *
 * Non lancia su nessun output di `JSON.parse`, che e' l'unico ingresso reale
 * (`parseBackup(JSON.parse(testo))`): un file rotto e' un caso previsto, e
 * l'utente deve vederselo raccontare, non farsi esplodere l'app. Su un oggetto
 * costruito a mano con getter ostili o un `toString` che lancia, invece, lancia
 * come qualunque altro codice — e nessuno lo chiama cosi'.
 */
export function parseBackup(input: unknown): ImportPreview {
  const c = new Collector()
  /** Quello che si e' riusciti a leggere dell'intestazione, rifiuto compreso. */
  let declared: number | null = null
  let exportedAt: Timestamp | null = null
  const refused = (): ImportPreview => ({
    ok: false,
    data: null,
    // A zero, e non i record letti: `counts` dice **cosa ci sara' dopo**, e
    // dopo un rifiuto non c'e' nessun dopo. Lasciarli veri inviterebbe a
    // disegnare il prima/dopo di un import che non avverra'.
    counts: EMPTY_COUNTS,
    issues: c.issues,
    fromSchemaVersion: declared,
    exportedAt,
  })
  const reject = (path: string): ImportPreview => {
    c.error(path)
    return refused()
  }

  if (!isRecord(input)) return reject('file')
  exportedAt = str(input['exportedAt'])
  // **`app` assente non passa piu'.** Prima passava, e un `{schemaVersion, data}`
  // di 54 byte bastava a svuotare l'archivio. Rompe la retrocompatibilita' con
  // **zero file reali**: ogni file uscito da `buildBackup` ha `app: 'cent'`
  // dalla prima riga di questa funzione, quindi non esiste un backup di
  // quest'app che questa riga rifiuti. Rifiuta i JSON di qualcun altro, che e'
  // cio' che deve fare.
  //
  // **Un ramo solo, ed e' il taglio di `message` a ridurlo.** Ce n'erano due —
  // "non dice di essere un backup di Cent" e `dice di appartenere a "X"` — e la
  // loro unica differenza era la frase: stesso `path`, stessa severita', stesso
  // `not-backup` a schermo. Senza la frase erano due rami con lo stesso esito
  // osservabile, cioe' una distinzione che nessuno poteva leggere.
  //
  // Il fatto che l'utente legge non si perde: sta gia' nel file che ha in mano.
  if (input['app'] !== 'cent') return reject('file.app')
  const rawVersion = input['schemaVersion']
  if (typeof rawVersion !== 'number' || !Number.isInteger(rawVersion) || rawVersion < 1) {
    return reject('file.schemaVersion')
  }
  declared = rawVersion
  const body = input['data']
  if (!isRecord(body)) return reject('file.data')

  const raw: RawDataSet = emptyRawDataSet()
  raw.expenses = rawArray(body, 'expenses', c)
  raw.categories = rawArray(body, 'categories', c)
  raw.recurringRules = rawArray(body, 'recurringRules', c)
  raw.budgets = rawArray(body, 'budgets', c)
  const settingsRaw = body['settings']
  raw.settings = isRecord(settingsRaw) ? [settingsRaw] : []

  let migrated: RawDataSet
  try {
    migrated = migrateRawData(raw, declared)
  } catch {
    // Il caso che conta e' `SchemaTooNewError`, e **non si distingue qui**: si
    // distingue a valle, perche' `declared` e' gia' scritto sopra e sopravvive
    // al rifiuto. `refusalOf` guarda `fromSchemaVersion > SCHEMA_VERSION` e
    // dice "aggiorna l'app"; su qualunque altro guasto della migrazione il
    // numero non sfora e la schermata dice "questo non e' un backup". La
    // distinzione sta nel numero, non in una frase che non esiste piu'.
    return reject('file.schemaVersion')
  }

  const expenses = parseList(migrated.expenses, 'expenses', parseExpense, c)
  const categories = parseList(migrated.categories, 'categories', parseCategory, c)
  const recurringRules = parseList(migrated.recurringRules, 'recurringRules', parseRule, c)
  const budgets = parseList(migrated.budgets, 'budgets', parseBudget, c)
  const settings = parseSettings(migrated.settings[0], exportedAt, c)

  const cappedCategories = capActiveCategories(categories, c)

  // **Zero categorie non e' uno stato in cui quest'app puo' vivere**, e la
  // regola non e' "rifiuta i backup vuoti" — quella sarebbe una preferenza. Si
  // deriva: l'import accetta solo stati che l'app **tiene**. Zero spese lo e'
  // (l'export di un'installazione appena aperta); zero categorie no, perche'
  // `openRepository` semina la griglia ogni volta che la trova vuota, quindi
  // importare questo file scriverebbe uno stato che l'app disfa da sola alla
  // riapertura successiva — e nel frattempo lascerebbe una griglia da cui non
  // si puo' inserire nessuna spesa.
  //
  // **Il criterio cade sulle categorie, e non l'ha scelto nessuno.**
  //
  // Nota sulla derivazione, perche' ADR 026 la fa piu' corta di com'e': lo
  // dice "non producibile, il tetto di otto attive non permette di
  // archiviarle tutte". Archiviarle tutte davvero non si puo' — ma
  // `planCategoryDeletion` non ha nessun pavimento, e su un'installazione
  // nuova (nessuna spesa, nessuna regola) le otto si **cancellano** una per
  // una. Lo stato e' quindi producibile *dentro una sessione*; quello che non
  // e' producibile e' **sopravviverci a una riapertura**. La riga sotto e la
  // semina di `openRepository` dicono la stessa cosa da due porte.
  if (cappedCategories.length === 0) {
    c.error('categories')
  }

  const knownCategories = new Set(cappedCategories.map((cat) => cat.id))
  const orphans = expenses.filter((e) => !knownCategories.has(e.categoryId)).length
  if (orphans > 0) {
    c.warn('expenses')
  }

  // ## L'unica riga che decide `ok`
  //
  // Prima `ok` era `true` per costruzione appena il file aveva una forma: un
  // backup in cui **tutte** le spese erano illeggibili tornava
  // `ok: true` con `counts.expenses: 0` e due issue `error` accanto. La
  // severita' esisteva e non decideva niente.
  //
  // Il costo di questa riga e' dichiarato: **una sola spesa illeggibile su
  // cento rende il file non importabile**, e non e' un effetto collaterale.
  // L'import sostituisce tutto, quindi accettare un file monco vuol dire
  // scambiare un archivio intero con una copia mutilata, dopo un "va bene".
  // **Il rimedio esiste ed e' nelle mani di chi importa**, e questa riga
  // diceva quale sbagliando: *"la issue nomina il punto esatto
  // (`expenses[12].amountCents`) dentro un file di testo che ha gia' in
  // mano"*. Quella stringa nel JSON **non compare** — e' un indice, non un
  // testo — e chi la cercava non trovava niente.
  //
  // Cio' che porta davvero il rimedio e' `recordId`: nel file c'e' (`"id":
  // "e-42"`), e' unico, e si cerca. Quando a mancare e' l'id stesso non c'e'
  // niente da cercare, e la schermata ripiega sull'indice **dicendo che e' una
  // posizione**. E' con quell'id in mano che il rifiuto totale resta
  // verificabile invece di essere un vicolo cieco (DEBITO §13).
  const fatal = c.issues.some((issue) => issue.severity === 'error')
  if (fatal) return refused()

  return {
    ok: true,
    data: {
      expenses,
      categories: cappedCategories,
      recurringRules,
      budgets,
      settings,
    },
    counts: {
      // Vive, non tutte: vedi `ImportPreview.counts`. Le lapidi restano dentro
      // `data` — un import che le perdesse resusciterebbe cio' che l'utente ha
      // cancellato — e non entrano in nessun numero a schermo.
      expenses: expenses.filter(isLive).length,
      categories: cappedCategories.length,
      recurringRules: recurringRules.length,
    },
    issues: c.issues,
    fromSchemaVersion: declared,
    exportedAt,
  }
}
