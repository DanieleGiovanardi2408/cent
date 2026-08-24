import { useEffect, useRef, useState } from 'preact/hooks'
import { addDays } from '../core/date'
import type { IsoDate } from '../core/date'
import type { Category } from '../core/types'
import { Keypad } from './Keypad'
import { amountCells, dayChipLabel, t } from './i18n'
import './sheet.css'
import './AddSheet.css'

/**
 * Il flusso "aggiungi spesa". E' il prodotto: tutto il resto dell'app e' contorno.
 *
 * **FAB -> cifre -> tap sulla categoria -> salvata.** Due tap oltre alle cifre,
 * e le cifre non contano come attrito perche' non esiste modo di far entrare un
 * importo senza digitarlo (ADR 004).
 *
 * Il chip della categoria **e'** il tasto di conferma. Non c'e' un "Salva" e non
 * c'e' un riepilogo: sarebbe un terzo tap che non aggiunge nessuna informazione
 * a quelle che l'utente ha appena dato. Il prezzo di questa scelta e' che il tap
 * che salva e' anche una scelta di contenuto — se sbagli chip, salvi la cosa
 * sbagliata — e la rete di sicurezza sono **due**, perche' una non bastava: il
 * toast con Annulla per i sei secondi successivi, e il tap sulla riga nello
 * Storico (`ExpenseActions`) per l'errore che si vede riguardando la lista un
 * minuto dopo. Chi togliesse tutte e due dovrebbe rimettere la conferma.
 *
 * Cosa NON e' nel percorso dei due tap, di proposito:
 * - la **data**, che e' oggi. "Ieri" costa un tap perche' e' il caso comune (te
 *   ne accorgi la mattina dopo) e non deve costare un calendario;
 * - la **nota**, collassata: costa un tap in piu' ed e' giusto cosi'.
 *
 * ## Le due convenzioni che nessuno indovina, e chi le dice
 *
 * Sono **due**, non una, e hanno canali diversi perche' sbagliano in modi
 * diversi.
 *
 * **1. Il chip salva.** Non esiste in nessun'altra app. Lo dicono tre canali
 * con tre tempi: la guida al primo avvio lo spiega una volta, la riga qui in
 * cima lo ricorda per le prime tre spese (`coach`), e gli otto chip che si
 * accendono alla prima cifra lo mostrano ogni volta (`.cat:disabled` in
 * AddSheet.css). Nessuno dei tre e' un doppione: chi salta la guida ha ancora
 * la riga, e chi ha imparato ha ancora i chip che si accendono.
 *
 * **2. L'importo si riempie da destra**, stile bancomat: `2` `3` fa 0,23, non
 * 23,00. Qui il canale "lo spiega una volta" e' la stessa guida, ma non basta
 * da sola — l'errore non e' di comprensione, e' di **percezione al momento del
 * tap**: `0,23 €` e `23,00 €` avevano la stessa quantita' di inchiostro e il
 * discriminante era una virgola da 3 px, invisibile a ~7 gradi di eccentricita'
 * mentre l'occhio e' gia' sul chip da toccare. E' l'errore che ha morso **due
 * volte in sessanta secondi** chi il meccanismo l'aveva progettato, con il
 * secondo sopravvissuto 13 ore.
 *
 * Il canale permanente e' quindi la **tipografia dell'importo**: i centesimi
 * (separatore e frazione) si dipingono al 55% del corpo, quindi la magnitudine
 * smette di essere codificata in *quale* glifo e diventa **quanto inchiostro
 * grande c'e'** — una cifra grande contro due. Si legge in periferia, dove una
 * virgola no. Le misure e la regola stanno in sheet.css, sotto `.amount`.
 */

export interface SaveInput {
  readonly amountCents: number
  readonly categoryId: string
  readonly date: IsoDate
  readonly note?: string
}

interface Props {
  readonly categories: readonly Category[]
  /** Il giorno civile corrente, calcolato al risveglio e non a ogni render. */
  readonly day: IsoDate
  /**
   * I primi giorni: l'utente non ha ancora salvato tre spese a mano, quindi la
   * riga in cima spiega come si salva invece di tacere. Il conteggio lo fa
   * `App` (`savedByHand`), che e' l'unico posto che vede tutte le spese.
   */
  readonly coach: boolean
  /** Sta uscendo: l'animazione e' partita, i tap non contano piu'. */
  readonly leaving: boolean
  /**
   * Salva. **`false` significa che non e' andata**, e il foglio resta aperto e
   * riprovabile: prima alzava la bandiera "fatto" prima ancora di chiamare, e
   * dopo un fallimento ogni tap su ogni chip veniva scartato in silenzio —
   * il messaggio diceva "Riprova" e la UI aveva reso il riprovare impossibile.
   */
  readonly onSave: (input: SaveInput) => boolean
  readonly onClose: () => void
}

/**
 * Tetto dell'importo: 99.999,99 EUR (sette cifre).
 *
 * Non e' un limite di dominio, e' un limite di **stato assurdo**: serve a
 * impedire che una cifra rimasta premuta produca un numero che non sta nel
 * display e che nessuno ha voluto digitare. Sopra il tetto le cifre si spengono
 * e si vede perche' — un tasto che non risponde senza dire niente sarebbe
 * peggio del numero assurdo.
 */
const MAX_CENTS = 9_999_999

export function AddSheet({ categories, day, coach, leaving, onSave, onClose }: Props) {
  const [cents, setCents] = useState(0)
  const [date, setDate] = useState<IsoDate>(day)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  /** Il salvataggio non e' andato: si dice qui dentro, perche' qui si riprova. */
  const [failed, setFailed] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const noteField = useRef<HTMLInputElement>(null)
  /** Il primo chip toccato vince: durante l'uscita il foglio e' ancora nel DOM. */
  const done = useRef(false)

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (noteOpen) noteField.current?.focus()
  }, [noteOpen])

  const yesterday = addDays(day, -1)
  const empty = cents === 0
  const atMax = cents > Math.floor(MAX_CENTS / 10)
  const trimmedNote = note.trim()

  function save(category: Category): void {
    if (done.current || empty) return
    const saved = onSave({
      amountCents: cents,
      categoryId: category.id,
      date,
      ...(trimmedNote === '' ? {} : { note: trimmedNote }),
    })
    // La bandiera si alza **solo** in caso di successo: se si alzasse comunque,
    // il foglio resterebbe aperto e sordo, e l'unica uscita sarebbe ridigitare
    // l'importo da zero.
    if (saved) done.current = true
    else setFailed(true)
  }

  /**
   * La riga in cima al foglio.
   *
   * ## I primi giorni dice come si salva, poi smette
   *
   * Il chip-come-conferma **non esiste in nessun'altra app**: nessuno lo
   * indovina. Finche' l'utente non ha salvato tre spese a mano (`coach`), la
   * riga porta l'istruzione, e sono **due**, non una:
   *
   *     importo vuoto    ->  "Digita l'importo, poi tocca una categoria"
   *     importo scritto  ->  "Tocca una categoria per salvare"
   *
   * Due e non una perche' con l'importo vuoto i chip sono spenti: dire "tocca
   * una categoria per salvare" quando toccare non fa niente **invita a un gesto
   * che fallisce**, nel momento peggiore. La prima variante dice l'ordine delle
   * due cose; la seconda dice quella che serve adesso.
   *
   * Dopo la terza spesa la riga torna a parlare **solo quando ha una notizia**:
   * il tetto e' una sorpresa, un salvataggio non andato e' una brutta sorpresa,
   * e con l'importo digitato tace. Chi ha imparato non ha bisogno che glielo si
   * ripeta: a quel punto il canale vero e' l'accendersi degli otto chip.
   *
   * ## Niente `aria-live`, e non perche' il testo sia statico
   *
   * Non lo e': commuta esattamente alla prima cifra, cioe' **nello stesso frame
   * in cui cambia l'importo**, che e' l'altra regione live del foglio. Due
   * region `polite` aggiornate insieme mettono VoiceOver in coda con due
   * annunci, e quello che conta arriva secondo.
   *
   * La ragione per cui non e' una regione live e' un'altra e vale sempre:
   * **e' un'istruzione, non un valore**. Si legge esplorando, non si annuncia —
   * e annunciarla a ogni cifra sarebbe rumore anche se fosse sola in coda.
   * Scartata anche la via di mezzo (`aria-live` solo per `failed`/`max`):
   * teneva in vita la cosa sbagliata e spostava la discussione su *quando*
   * annunciare invece che sul fatto che non va annunciata mai.
   *
   * Cio' che quella regione cercava di fare vive adesso dove serve davvero: nel
   * **nome accessibile dei chip**, qui sotto.
   *
   * ## L'altezza
   *
   * La riga resta nel DOM anche vuota, e la sua altezza e' riservata in
   * sheet.css: **una stringa vuota qui non deve muovere niente.** Una versione
   * precedente faceva salire di 2,5px data, categorie, importo e tastierino alla
   * prima cifra, perche' l'altezza riservata era un valore tondo piu' basso di
   * una riga piena. Chi tocca `.sheet__hint` deve rileggere il commento li': e'
   * l'unica cosa che tiene il salto a zero.
   */
  const hint = failed
    ? t('add.hint.failed')
    : atMax
      ? t('add.hint.max')
      : empty
        ? t(coach ? 'add.hint.type' : 'add.hint.empty')
        : coach
          ? t('add.hint.pick')
          : ''

  return (
    <>
      <div class="scrim" data-leaving={leaving || undefined} onClick={onClose} />

      <div
        class="sheet sheet--add"
        data-leaving={leaving || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t('add.label')}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <p class="sheet__hint" data-tone={failed ? 'error' : undefined}>{hint}</p>

        {/* Data e nota sulla stessa riga: due cose fuori dal percorso dei due
            tap, che insieme costano una riga sola di altezza. Quando la nota si
            apre prende il posto della riga invece di aggiungersene una: il
            tastierino non si muove di un pixel. */}
        <div class="meta">
          {noteOpen ? (
            <>
              <input
                ref={noteField}
                class="meta__note"
                type="text"
                value={note}
                maxLength={120}
                placeholder={t('add.note.placeholder')}
                enterKeyHint="done"
                aria-label={t('add.note')}
                onInput={(event) => setNote(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setNoteOpen(false)
                }}
              />
              <button type="button" class="chip chip--done" onClick={() => setNoteOpen(false)}>
                {t('add.note.done')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                class="chip"
                aria-pressed={date === day}
                onClick={() => setDate(day)}
              >
                {t('day.today')}
              </button>
              <button
                type="button"
                class="chip"
                aria-pressed={date === yesterday}
                onClick={() => setDate(yesterday)}
              >
                {t('day.yesterday')}
              </button>

              {/* L'input e' il bersaglio: coprendo tutto il chip, il tap apre
                  direttamente la rotella di iOS. Un bottone che poi chiama
                  showPicker() non funzionerebbe su Safari. */}
              <label class="chip chip--date" data-on={date !== day && date !== yesterday || undefined}>
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="3" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </svg>
                <span>
                  {date !== day && date !== yesterday ? dayChipLabel(date) : t('add.date.other')}
                </span>
                <input
                  class="chip__input"
                  type="date"
                  value={date}
                  max={day}
                  min="2000-01-01"
                  aria-label={t('add.date.pick')}
                  onChange={(event) => {
                    const chosen = event.currentTarget.value
                    if (chosen !== '') setDate(chosen)
                  }}
                />
              </label>

              <button
                type="button"
                class="chip chip--note"
                data-on={trimmedNote !== '' || undefined}
                onClick={() => setNoteOpen(true)}
              >
                {trimmedNote === '' ? t('add.note') : trimmedNote}
              </button>
            </>
          )}
        </div>

        {/* Tutte e otto insieme al tastierino, senza scroll: se il chip da
            toccare richiedesse uno scroll, i due tap diventerebbero
            scroll + tap e la promessa morirebbe in silenzio. */}
        <div class="cats">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              class="cat"
              style={`--cat:${category.color}`}
              disabled={empty}
              /* Il nome accessibile porta **cosa fa il tap**: "Spesa, tocca due
                 volte per salvare". E' li' che l'informazione serve — sul
                 controllo che si sta per toccare — invece che in un annuncio
                 che puo' arrivare secondo. Non e' agganciato a `coach`: non e'
                 un suggerimento dei primi giorni, e' il nome dell'azione, e
                 l'equivalente visivo (i chip che si accendono) non scade
                 nemmeno lui. */
              aria-label={`${category.name}, ${t('add.cat.hint')}`}
              onClick={() => save(category)}
            >
              <span class="cat__emoji" aria-hidden="true">
                {category.emoji}
              </span>
              <span class="cat__name">{category.name}</span>
            </button>
          ))}
        </div>

        {/* L'importo sta fra le categorie e il tastierino, e non sopra: e' la
            sola posizione che cade sul percorso dell'occhio fra il tasto appena
            premuto e il chip da toccare. Il perche' per esteso, con la misura
            che l'ha deciso, sta in AddSheet.css.

            Non e' una stringa: sono **le parti del formato**, ciascuna nella
            propria cella, perche' i centesimi si dipingono al 55% del corpo
            (sheet.css). Sulle parti e non sui glifi perche' il simbolo cambia
            lato con la lingua — `0,23 €` in italiano, `€0.23` in inglese — e
            una `split` sulla stringa avrebbe rimpicciolito il pezzo sbagliato
            nella lingua di default. E' lo stesso modello della guida
            (`amountCells` in i18n), non una seconda copia. */}
        <p class="amount" data-empty={empty || undefined} aria-live="polite">
          {amountCells(cents).map((cell, index) => (
            <span class="amount__cell" data-kind={cell.kind} key={index}>
              {cell.text}
            </span>
          ))}
        </p>

        <Keypad
          atMax={atMax}
          canDelete={!empty}
          onDigit={(digit) => setCents((current) => (current > Math.floor(MAX_CENTS / 10) ? current : current * 10 + digit))}
          onBackspace={() => setCents((current) => Math.floor(current / 10))}
          onClear={() => setCents(0)}
        />
      </div>
    </>
  )
}
