/**
 * Il ripristino da un backup, deciso qui e dipinto da `ImportSheet`.
 *
 * ## Cosa fa questo modulo, e cosa non fa
 *
 * `parseBackup` (dominio) dice **se un testo e' un backup e cosa contiene**.
 * Questo modulo traduce quel referto in **cio' che una persona deve leggere e
 * puo' fare**: quale dei quattro stati della lettura si sta guardando, e — nei
 * rifiuti — quale rimedio nominare.
 *
 * Non formatta niente e non conosce le stringhe: le frasi stanno nei due
 * dizionari e le sceglie il componente, con uno `switch` esaustivo. Qui c'e'
 * solo la **classificazione**, cioe' l'unica parte che si puo' provare senza un
 * browser.
 *
 * ## La sorgente del testo e' un parametro, e adesso ce n'e' una
 *
 * `BackupReader` e' la firma del selettore di file, ed e' il confine fra il
 * pezzo che dipende dal dispositivo — `<input type="file">`, `accept`, gli UTI
 * di iOS, un file su iCloud Drive che arriva lento o non arriva — e il pezzo che
 * non ci dipende, che e' tutto il resto. Il primo si verifica solo su un
 * telefono; il secondo si verifica qui.
 *
 * L'implementazione e' `pickBackup` in `src/app/backup-read.ts`, e `main.tsx`
 * la passa ad `App`: da qui la voce "Ripristina da un backup" compare in
 * Impostazioni. Il parametro resta un parametro perche' e' cio' che tiene fuori
 * il DOM da questo modulo — e perche' `App` senza sorgente e' esattamente lo
 * stato che la pagina d'installazione avrebbe (ADR 011).
 *
 * ## I quattro stati, e perche' non sono tre
 *
 * 1. **sto leggendo** — su iCloud puo' durare secondi. Va detto, o il tocco
 *    sembra non aver fatto niente e si tocca di nuovo;
 * 2. **non si e' potuto leggere** (`unreadable`) — il rimedio e' **riprovare**,
 *    o scaricare il file sul telefono. Non e' un difetto del backup;
 * 3. **letto, non e' un backup di Cent** (`not-backup`) — il rimedio e'
 *    **scegliere un altro file**: riprovare con lo stesso non serve a niente;
 * 4. **letto, e' un backup ma un record e' illeggibile** (`damaged`) — il
 *    rimedio e' **diverso dal 3**, ed e' il messaggio che rende accettabile il
 *    rifiuto totale (DEBITO §13).
 *
 * Il 2 e il 3 hanno cause opposte; il 3 e il 4 anche. Collassarli manda a
 * cercare un altro file quando il problema era la rete, o a riprovare
 * all'infinito quando il problema era il file.
 */

import { parseBackup } from '../core/backup'
import { toIsoDate } from '../core/date'
import type { IsoDate } from '../core/date'
import type { ImportIssue, ImportPreview } from '../core/backup'
import { SCHEMA_VERSION } from '../core/schema'
import { isLive } from '../core/stats'
import type { Category, DataSet, Expense, RecurringRule, Timestamp } from '../core/types'

/**
 * L'esito di una lettura, come lo racconta la sorgente.
 *
 * Tre esiti e non due, per la stessa ragione per cui `ExportResult` ne ha
 * quattro: **annullare non e' fallire**. Chi chiude il foglio File del sistema
 * non ha incontrato nessun problema e non deve leggere nessun messaggio — la
 * schermata si chiude e basta. Un `cancelled` letto come `unreadable`
 * accuserebbe la rete di una cosa che ha fatto l'utente.
 */
export type BackupRead =
  /** Il testo e' arrivato tutto. Che sia un backup lo dira' `stepFromText`. */
  | { readonly kind: 'text'; readonly text: string }
  /** L'utente ha chiuso il selettore: non e' successo niente. */
  | { readonly kind: 'cancelled' }
  /**
   * Il file non si e' potuto leggere: iCloud, permessi, un file sparito.
   *
   * **`again` non e' un extra: e' cio' che rende questo esito diverso dagli
   * altri.** E' l'unico stato in cui riprovare ha senso — il file va bene, e' la
   * lettura che e' fallita — e portarsi dietro il modo di rifarla rende il
   * "Riprova" della schermata **vero per costruzione**: non si puo' costruire
   * questo esito senza dire come si ritenta, e non si puo' ritentare qualcosa
   * che non sia lo stesso file.
   *
   * Il giro A aveva un'azione sola con due etichette — il bottone diceva
   * *"Riprova"* e faceva *"Scegli un altro file"* — e l'esito prevedibile era:
   * l'utente ripesca lo stesso file, ottiene lo stesso errore, e conclude che
   * l'app e' rotta (ADR 026 §6f).
   */
  | { readonly kind: 'unreadable'; readonly again: BackupReader }

/**
 * Da dove arriva il testo del backup.
 *
 * **Due implementazioni, e la stessa firma**: `pickBackup`, che apre il
 * selettore del sistema, e la chiusura `again` di un esito `unreadable`, che
 * rilegge lo stesso `File` **senza** riaprire niente. Che siano la stessa firma
 * e' cio' che permette ad `App` di avere **una sola sequenza** con due ingressi,
 * invece di due sequenze che divergeranno.
 *
 * **Non rifiuta**: un rifiuto sarebbe un quarto esito senza nome, e il chiamante
 * dovrebbe indovinare se e' un annullamento o un guasto. `App` tratta comunque
 * una promessa rifiutata come `unreadable`, perche' un errore che nessuno ha
 * previsto non puo' finire in un `catch` vuoto — ma non e' il contratto.
 */
export type BackupReader = () => Promise<BackupRead>

/**
 * Perche' un backup non si importa. Quattro forme, quattro rimedi diversi.
 *
 * Non contiene nessuna frase: le frasi stanno nei dizionari. Contiene i
 * **fatti** che le frasi useranno, e ognuno di quei fatti e' verificabile da
 * chi legge — `where` e' come si trova, dentro il file che l'utente ha in
 * mano, il record che non si e' potuto leggere.
 */
export type ImportRefusal =
  /** Il file si e' letto e non parla di Cent: JSON di qualcun altro, o non JSON. */
  | { readonly kind: 'not-backup' }
  /** Scritto da una versione piu' nuova: aprirlo qui mutilerebbe cio' che non conosciamo. */
  | { readonly kind: 'too-new' }
  /**
   * E' un backup di Cent, ben formato, e descrive uno stato che l'app non
   * tiene: zero categorie. Non e' un record rotto, ed e' per questo che non e'
   * `damaged` — il rimedio "aprilo da un computer e togli quella riga" qui non
   * vuol dire niente, perche' non c'e' nessuna riga da togliere.
   */
  | { readonly kind: 'no-categories' }
  /**
   * E' il file giusto con un difetto localizzato. `more` dice quanti altri ce
   * ne sono, e `where` **come si trova quello**.
   *
   * ## `where` era un indice, e un indice non si cerca
   *
   * Qui c'era scritto: *"il punto si mostra per esteso, ed e' la stringa da
   * cercare dentro il file"*. Era **falso**: `expenses[12].amountCents` e' una
   * **posizione** in un array, e nel JSON quella stringa non compare. Chi
   * provava con Cmd-F non trovava niente — e il rimedio *"da un computer apri il
   * file e togli quel record"* e' l'unica cosa che rende accettabile il rifiuto
   * totale ([DEBITO.md](../../docs/DEBITO.md) §13). Un rimedio con
   * un'indicazione che non porta da nessuna parte non e' un rimedio.
   *
   * Adesso `where` porta l'**id del record**, che nel file c'e' davvero ed e'
   * unico: `"id": "e-42"` si trova.
   *
   * ## E quando l'id manca, si dice che e' una posizione
   *
   * Se il campo rotto e' proprio l'id, non c'e' niente da cercare. Li' si
   * ripiega sull'indice **dichiarandolo** (`kind: 'posizione'`), e la frase lo
   * dice: non e' una stringa da cercare, e' la tredicesima spesa da contare.
   * **Onesto invece che comodo** — il ripiego silenzioso avrebbe rimesso in piedi
   * lo stesso difetto, con l'aggravante di sembrare riparato.
   */
  | {
      readonly kind: 'damaged'
      readonly where: string
      readonly comeSiTrova: 'id' | 'posizione'
      readonly more: number
    }

/** I tre numeri del prima/dopo. Ognuno e' visibile in una schermata. */
export interface ImportCounts {
  /** Spese **vive**: le lapidi non si vedono da nessuna parte, quindi non si contano. */
  readonly expenses: number
  /** Tutte, archiviate comprese: un'archiviata resta su ogni spesa che l'ha usata. */
  readonly categories: number
  /** Tutte, spente comprese: Impostazioni le elenca tutte. */
  readonly rules: number
}

/**
 * Lo stato della schermata. `reading` e' il primo e non e' un caricamento
 * generico: e' il primo dei quattro stati, ed e' quello che si dimentica.
 */
export type ImportStep =
  | { readonly kind: 'reading' }
  /** Porta con se' il modo di rileggere **lo stesso file**: vedi `BackupRead`. */
  | { readonly kind: 'unreadable'; readonly again: BackupReader }
  | { readonly kind: 'refused'; readonly refusal: ImportRefusal }
  | {
      readonly kind: 'ready'
      /** Cio' che si scrivera'. Non si ricalcola alla conferma: e' quello mostrato. */
      readonly data: DataSet
      /** La data che entra **dentro** la frase. `null` = la frase si scrive senza. */
      readonly exportedAt: Timestamp | null
      /** Il "dopo" del prima/dopo, come `parseBackup` l'ha contato. */
      readonly counts: ImportCounts
    }

/** Quale riga del prima/dopo: l'etichetta la sceglie il componente. */
export type CountKind = 'expenses' | 'categories' | 'rules'

export interface CountRow {
  readonly kind: CountKind
  readonly now: number
  readonly next: number
}

/**
 * Il testo letto, classificato.
 *
 * `JSON.parse` che lancia **non** e' "non si e' potuto leggere": il file e'
 * arrivato tutto, quindi il fatto e' che non e' un backup di Cent e il rimedio
 * e' un altro file. E' la differenza fra il secondo e il terzo stato, presa nel
 * punto in cui si decide.
 */
export function stepFromText(text: string): ImportStep {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { kind: 'refused', refusal: { kind: 'not-backup' } }
  }
  const preview = parseBackup(parsed)
  if (!preview.ok || preview.data === null) {
    return { kind: 'refused', refusal: refusalOf(preview) }
  }
  return {
    kind: 'ready',
    data: preview.data,
    exportedAt: preview.exportedAt,
    counts: {
      expenses: preview.counts.expenses,
      categories: preview.counts.categories,
      rules: preview.counts.recurringRules,
    },
  }
}

/** Le issue che decidono: `ok` e' esattamente "nessuna di queste". */
function errorsOf(issues: readonly ImportIssue[]): readonly ImportIssue[] {
  return issues.filter((issue) => issue.severity === 'error')
}

/**
 * Un rifiuto, letto **dalle issue** e non da un campo.
 *
 * `fromSchemaVersion` da solo non e' un ramo (ADR 026 §5): *"aggiorna l'app"* e
 * *"questo non e' un backup"* sono messaggi opposti. Qui il numero si guarda
 * **insieme** alla soglia dello schema — `> SCHEMA_VERSION` significa una cosa
 * sola e la dice l'app, non il file — e tutto il resto si decide sul `path`
 * delle issue, che e' l'unica parte di `ImportIssue` che non e' prosa italiana
 * (DEBITO §12): il `message` non arriva mai a schermo.
 *
 * ## Il `path` come discriminante: fragile, e sorvegliato
 *
 * Classificare su un prefisso di stringa e' fragile — se `backup.ts` rinomina
 * `file.app`, qui non se ne accorge nessuno a compilazione. Per questo il test
 * non costruisce issue a mano: **fabbrica file rotti veri e li fa passare da
 * `parseBackup`**. Il giorno che un path cambia, cade li'.
 *
 * ## L'elenco vuoto
 *
 * `errors.length === 0` con `ok: false` non e' producibile: in `backup.ts` la
 * riga che decide `ok` e' `issues.some(severity === 'error')`, ed e' l'unica.
 * L'unico scrittore di `ImportPreview` in produzione e' `parseBackup` (nessun
 * altro modulo lo costruisce). Resta un ramo perche' il tipo lo ammette, e
 * ripiega sul messaggio **meno** specifico: dire "un record e' illeggibile"
 * senza sapere quale sarebbe un'affermazione che lo schermo non conferma.
 */
export function refusalOf(preview: ImportPreview): ImportRefusal {
  const version = preview.fromSchemaVersion
  if (version !== null && version > SCHEMA_VERSION) return { kind: 'too-new' }

  const errors = errorsOf(preview.issues)
  // Le issue dell'intestazione (`file`, `file.app`, `file.schemaVersion`,
  // `file.data`) dicono tutte la stessa cosa a chi legge: questo non e' un
  // backup di Cent. Distinguerle sarebbe un dettaglio di parsing travestito da
  // informazione.
  if (errors.some((issue) => issue.path === 'file' || issue.path.startsWith('file.'))) {
    return { kind: 'not-backup' }
  }

  // Cio' che nomina un record: e' il caso 4. La riga sulle categorie assenti non
  // e' un record, quindi non entra ne' in `where` ne' in `more` — contarla
  // direbbe "altri record illeggibili: 1" dove il record illeggibile non c'e'.
  const records = errors.filter((issue) => issue.path !== 'categories')
  const first = records[0]
  if (first === undefined) {
    return errors.length > 0 ? { kind: 'no-categories' } : { kind: 'not-backup' }
  }
  return first.recordId === undefined
    ? { kind: 'damaged', where: first.path, comeSiTrova: 'posizione', more: records.length - 1 }
    : { kind: 'damaged', where: first.recordId, comeSiTrova: 'id', more: records.length - 1 }
}

/**
 * Il "prima" del prima/dopo, contato **con lo stesso criterio del "dopo"**.
 *
 * Non e' una comodita': due conteggi che rispondono alla stessa domanda e si
 * calcolano in due posti divergono al primo cambio di criterio, e qui
 * divergerebbero **dentro la stessa riga a schermo** — 47 contro 18 dove il 47
 * conta le lapidi e il 18 no. L'invariante che li tiene insieme e' un test:
 * i conteggi di un backup costruito dallo stato corrente sono identici a
 * questi, per costruzione e non per coincidenza.
 */
export function currentCounts(
  expenses: readonly Expense[],
  categories: readonly Category[],
  rules: readonly RecurringRule[],
): ImportCounts {
  return {
    expenses: expenses.filter(isLive).length,
    categories: categories.length,
    rules: rules.length,
  }
}

/**
 * Le righe del prima/dopo, nell'ordine in cui si leggono.
 *
 * **Tre righe, e non cinque.** Il backup sostituisce anche i budget, che qui non
 * compaiono: il numero di record di budget non e' verificabile in nessuna
 * schermata — i budget sono storicizzati, quindi chi ha cambiato budget tre
 * volte ne ha tre, e ne vede uno. Un numero che l'utente non puo' riconciliare
 * con lo schermo non informa. Le tre che ci sono si contano tutte e tre:
 * Storico, Impostazioni → Categorie, Impostazioni → Spese fisse.
 */
export function countRows(now: ImportCounts, next: ImportCounts): readonly CountRow[] {
  return [
    { kind: 'expenses', now: now.expenses, next: next.expenses },
    { kind: 'categories', now: now.categories, next: next.categories },
    { kind: 'rules', now: now.rules, next: next.rules },
  ]
}

/**
 * Il giorno civile in cui il backup e' stato esportato. `null` quando il file
 * non lo dice **o dice qualcosa che non e' una data**.
 *
 * I due casi collassano di proposito: la frase senza data e' gia' scritta e
 * dice il vero in tutti e due. La forma che non si puo' spedire e' la terza —
 * `new Date('non una data')` da' `Invalid Date`, e `toIsoDate` ne fa
 * `NaN-NaN-NaN`: un'etichetta illeggibile dentro la frase su cui si decide se
 * cancellare il proprio archivio.
 *
 * `parseBackup` lascia passare qualunque stringa non vuota (`str`), quindi il
 * caso non e' teorico: basta un `exportedAt: "boh"` in un JSON scritto a mano.
 */
export function exportedDay(exportedAt: Timestamp | null): IsoDate | null {
  if (exportedAt === null) return null
  const when = new Date(exportedAt)
  return Number.isNaN(when.getTime()) ? null : toIsoDate(when)
}
