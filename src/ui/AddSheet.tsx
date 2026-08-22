import { useEffect, useRef, useState } from 'preact/hooks'
import { addDays } from '../core/date'
import type { IsoDate } from '../core/date'
import { formatCents } from '../core/money'
import type { Category } from '../core/types'
import { Keypad } from './Keypad'
import { dayChipLabel } from './labels'
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

export function AddSheet({ categories, day, leaving, onSave, onClose }: Props) {
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

  const hint = failed
    ? 'Non sono riuscito a salvare. Tocca di nuovo la categoria.'
    : atMax
      ? 'Importo massimo raggiunto'
      : empty
        ? 'Quanto hai speso?'
        : 'Tocca una categoria per salvare'

  return (
    <>
      <div class="scrim" data-leaving={leaving || undefined} onClick={onClose} />

      <div
        class="sheet"
        data-leaving={leaving || undefined}
        role="dialog"
        aria-modal="true"
        aria-label="Nuova spesa"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        <p class="sheet__hint" data-tone={failed ? 'error' : undefined} aria-live="polite">
          {hint}
        </p>

        <p class="amount" data-empty={empty || undefined} aria-live="polite">
          {formatCents(cents)}
        </p>

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
                placeholder="Per cosa?"
                enterKeyHint="done"
                aria-label="Nota"
                onInput={(event) => setNote(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setNoteOpen(false)
                }}
              />
              <button type="button" class="chip chip--done" onClick={() => setNoteOpen(false)}>
                Fatto
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
                Oggi
              </button>
              <button
                type="button"
                class="chip"
                aria-pressed={date === yesterday}
                onClick={() => setDate(yesterday)}
              >
                Ieri
              </button>

              {/* L'input e' il bersaglio: coprendo tutto il chip, il tap apre
                  direttamente la rotella di iOS. Un bottone che poi chiama
                  showPicker() non funzionerebbe su Safari. */}
              <label class="chip chip--date" data-on={date !== day && date !== yesterday || undefined}>
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="3" />
                  <path d="M3 10h18M8 3v4M16 3v4" />
                </svg>
                <span>{date !== day && date !== yesterday ? dayChipLabel(date) : 'Altra'}</span>
                <input
                  class="chip__input"
                  type="date"
                  value={date}
                  max={day}
                  min="2000-01-01"
                  aria-label="Scegli un'altra data"
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
                {trimmedNote === '' ? 'Nota' : trimmedNote}
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
              onClick={() => save(category)}
            >
              <span class="cat__emoji" aria-hidden="true">
                {category.emoji}
              </span>
              <span class="cat__name">{category.name}</span>
            </button>
          ))}
        </div>

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
