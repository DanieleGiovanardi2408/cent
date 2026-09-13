import { useEffect, useRef, useState } from 'preact/hooks'
import { addDays } from '../core/date'
import type { IsoDate } from '../core/date'
import type { Category, Expense } from '../core/types'
import { Keypad } from './Keypad'
import { amountCells, dayChipLabel, money, t } from './i18n'
import './sheet.css'
import './BudgetSheet.css'
import './AmountSheet.css'

/**
 * Correggere l'importo di una spesa **sul posto**, conservando `id` e `source`.
 *
 * ## Il difetto che chiude, e perche' non era una comodita'
 *
 * Fino a ieri l'unico rimedio era cancellare e riscrivere a mano. Su una spesa
 * manuale e' un pareggio; su una **generata da una regola** e' una perdita
 * silenziosa, e sono due cose distinte:
 *
 * 1. la spesa riscritta ha `source: 'manual'`, quindi **esce dalle spese fisse
 *    ed entra nel budget del periodo** (ADR 016): l'affitto che aumenta di 12 €
 *    fa muovere il numero grande della Home di 912 €, per una correzione che
 *    non e' una spesa nuova;
 * 2. la spesa riscritta ha un id nuovo, mentre quella generata ha
 *    un'**identita' deterministica** — `rec:${ruleId}:${giorno}` (ADR 006).
 *    Conservare quell'id e' anche cio' che impedisce alla prossima
 *    materializzazione di ricreare l'occorrenza cancellata: l'inserimento ha
 *    semantica *add*, e su un id che c'e' gia' salta.
 *
 * `updateExpense` conserva entrambi per costruzione — riscrive solo i campi del
 * patch — quindi qui non c'e' niente da ricordarsi: c'e' da **non** passare
 * dalla coppia cancella + reinserisci.
 *
 * ## Quattro campi, e prima era uno solo
 *
 * **Qui c'era scritto "perche' l'importo e basta"**, con questo argomento: la
 * categoria e la data *"si correggono gia' dove si correggono quelle di tutte,
 * cioe' da nessuna parte"*. Era vero e si e' capovolto da solo — quel "da
 * nessuna parte" era il difetto, non la giustificazione — e vale la pena
 * lasciarlo scritto: un argomento che poggia su un'assenza scade nel momento in
 * cui qualcuno riempie l'assenza.
 *
 * Cio' che l'ha resa urgente non e' una richiesta di completezza: e' che
 * **digitare 15 invece di 1,50 e non poterlo correggere e' il modo di fallire
 * piu' frequente che quest'app abbia**, e il chip che salva (ADR 004) lo rende
 * possibile per costruzione dieci volte al giorno.
 *
 * L'altra meta' dell'argomento vecchio — *"portarsi dentro l'unione di ADR 019
 * sui chip"* — era giusta, e infatti e' esattamente cio' che questo foglio fa
 * adesso, qui sotto.
 *
 * ## L'intestazione se n'e' andata, e non per spazio
 *
 * C'era una riga `.fix__head` con emoji, nome della categoria e giorno: serviva
 * a dire **quale** spesa si sta correggendo, quando il foglio mostrava un numero
 * e nient'altro. Adesso la categoria e' un chip premuto, il giorno e' un chip
 * premuto e la nota e' nel suo campo: tenerla sarebbe una seconda copia di tre
 * fatti che stanno gia' a schermo, due righe piu' sotto, in forma modificabile.
 *
 * Lo spazio che libera serve — a 375x667 il tastierino non perdona — ma non e'
 * la ragione: se lo fosse, la prima idea sarebbe stata accorciarla.
 *
 * ## ADR 019: l'unione, e la marca
 *
 * I chip sono `{ categorie attive } ∪ { quella di questa spesa }`. Una spesa
 * puo' portare una categoria **archiviata** — archiviare non guarda chi la usa —
 * e senza l'unione il foglio si aprirebbe con **nessun chip premuto**, cioe' si
 * leggerebbe come *"categoria non scelta"*. Il gesto naturale a quel punto
 * sposterebbe la spesa su un'altra categoria in silenzio.
 *
 * La sua e' marcata `data-off`: presente perche' e' la sua, distinta perche'
 * non e' piu' scegliibile. Un chip uguale agli altri direbbe il falso
 * nell'altro verso.
 *
 * ## Qui il tastierino non salva
 *
 * Come nel budget e nelle spese fisse: si digita, si guarda, si tocca il
 * bottone. ADR 004 giustifica il chip-che-salva con la frequenza — dieci volte
 * al giorno, in piedi, con l'Annulla del toast per sei secondi — e una
 * correzione non e' frequente. E' pero' **distruttiva**: l'importo di prima non
 * esiste piu' da nessuna parte. Quindi il toast porta un "Annulla" che rimette
 * il numero di prima, ed e' la stessa rete di ogni altra azione dell'app.
 *
 * ## La proposta e la prima cifra
 *
 * L'importo si apre su quello che c'e' adesso, cosi' si vede cosa si sta per
 * sostituire senza aprire altro; la **prima cifra lo sostituisce** invece di
 * appendersi. Da 900,00 € un tap sul 5 farebbe 9.000,05 €, cioe' un numero che
 * nessuno ha voluto — e' la stessa decisione del foglio del budget, per la
 * stessa ragione.
 */

export interface FixInput {
  readonly amountCents: number
  readonly categoryId: string
  readonly date: IsoDate
  /** `null` cancella la nota, come `ExpensePatch`. */
  readonly note: string | null
}

interface Props {
  /** La spesa, **riletta dal mirror** da chi apre il foglio: mai congelata. */
  readonly expense: Expense
  /** Puo' mancare: una categoria archiviata resta referenziata dalla spesa. */
  readonly category: Category | undefined
  /** Le otto in griglia. L'unione con quella della spesa si fa qui dentro. */
  readonly categories: readonly Category[]
  readonly day: IsoDate
  readonly leaving: boolean
  /** `false` = non e' andata. Il foglio resta aperto con quello che si e' scritto. */
  readonly onSave: (input: FixInput) => boolean
  readonly onClose: () => void
}

/** Lo stesso tetto dell'inserimento: 99.999,99 €. Vedi AddSheet. */
const MAX_CENTS = 9_999_999

export function AmountSheet({
  expense,
  category,
  categories,
  day,
  leaving,
  onSave,
  onClose,
}: Props) {
  const before = expense.amountCents
  const [cents, setCents] = useState(before)
  const [categoryId, setCategoryId] = useState(expense.categoryId)
  const [date, setDate] = useState<IsoDate>(expense.date)
  const [note, setNote] = useState(expense.note ?? '')
  const [noteOpen, setNoteOpen] = useState(false)
  /** Finche' e' falso, l'importo e' quello di prima: la prima cifra lo sostituisce. */
  const [typed, setTyped] = useState(false)
  const [failed, setFailed] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const noteField = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (noteOpen) noteField.current?.focus()
  }, [noteOpen])

  const empty = cents === 0
  const atMax = cents > Math.floor(MAX_CENTS / 10)
  const yesterday = addDays(day, -1)
  const trimmedNote = note.trim()

  /**
   * **L'unione di ADR 019**: le attive, piu' quella di questa spesa se non c'e'
   * gia'. L'ordine e' quello della griglia e la sua va **in fondo**: infilarla
   * al suo vecchio posto sposterebbe i chip che il pollice conosce, ed e' il
   * motivo per cui la griglia non si riordina mai (CLAUDE.md).
   */
  const choices =
    category === undefined || categories.some((c) => c.id === category.id)
      ? categories
      : [...categories, category]

  /** Niente da scrivere: tutti e quattro i campi sono quelli di prima. */
  const same =
    cents === before &&
    categoryId === expense.categoryId &&
    date === expense.date &&
    trimmedNote === (expense.note ?? '')

  function digit(value: number): void {
    setFailed(false)
    setTyped(true)
    setCents((amount) => {
      const base = typed ? amount : 0
      return base > Math.floor(MAX_CENTS / 10) ? base : base * 10 + value
    })
  }

  function save(): void {
    if (done.current || empty || same) return
    const input: FixInput = {
      amountCents: cents,
      categoryId,
      date,
      // `''` non e' "lascia com'era": e' "cancellala". `ExpensePatch` distingue
      // i due con `null`, e questo e' il punto in cui la distinzione si fa.
      note: trimmedNote === '' ? null : trimmedNote,
    }
    if (onSave(input)) done.current = true
    else setFailed(true)
  }

  const hint = failed
    ? t('amount.hint.failed')
    : atMax
      // La stessa stringa dell'inserimento e del budget: e' lo stesso tetto e
      // lo stesso tastierino, e tre copie della stessa frase divergono alla
      // prima riscrittura.
      ? t('add.hint.max')
      : same || empty
        ? t('amount.hint.now', { amount: money(before) })
        : t('amount.hint.check')

  return (
    <>
      <div class="scrim" data-leaving={leaving || undefined} onClick={onClose} />

      <div
        class="sheet sheet--amount"
        data-leaving={leaving || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t('amount.label')}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        {/* Niente `aria-live`: e' un'istruzione, si legge esplorando, e commuta
            **alla prima cifra** insieme a `.amount`, che e' gia' una regione
            live. Due `polite` aggiornate nello stesso frame mettono VoiceOver
            in coda e quella che conta — l'importo — arriva seconda. Stessa
            decisione di `AddSheet` e `BudgetSheet`, e la sua ragione non
            nominava nessuno dei due. */}
        <p class="sheet__hint" data-tone={failed ? 'error' : undefined}>{hint}</p>

        {/* Data e nota, la stessa riga e le stesse classi di `AddSheet`: e' lo
            stesso mestiere, e due copie della stessa geometria divergono alla
            prima riscrittura. Quando la nota si apre prende il posto della riga
            invece di aggiungersene una — il tastierino non si muove. */}
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
              <label class="chip chip--date" data-on={(date !== day && date !== yesterday) || undefined}>
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

        {/* **Qui i chip scelgono, non salvano.** In `AddSheet` il tap sul chip
            e' la conferma (ADR 004) perche' li' si sta inserendo e la frequenza
            paga il rischio; qui si sta **correggendo**, e un tap che salva
            renderebbe impossibile cambiare due campi in un gesto solo. Il tap
            che scrive resta uno, in fondo.

            Non sono `disabled` con l'importo vuoto, e non e' una svista: li' il
            chip spento diceva "prima l'importo, poi la categoria"; qui la
            categoria e' gia' scelta e l'importo gia' valorizzato — spegnerli
            direbbe che la spesa non ha una categoria, che e' falso. */}
        <div class="cats">
          {choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              class="cat"
              style={`--cat:${choice.color}`}
              aria-pressed={choice.id === categoryId}
              /* Marcata quando non e' piu' fra le scegliibili: c'e' perche' e'
                 la sua, si distingue perche' e' archiviata. Vedi ADR 019. */
              data-off={(choice.archived && choice.id === categoryId) || undefined}
              onClick={() => setCategoryId(choice.id)}
            >
              <span class="cat__emoji" aria-hidden="true">
                {choice.emoji}
              </span>
              <span class="cat__name">{choice.name}</span>
            </button>
          ))}
        </div>

        {/* Le parti, non la stringa: i centesimi al 55% del corpo (sheet.css).
            Stesso cents-first, stessa virgola da 3 px, stesso rimedio. */}
        <p class="amount" data-empty={empty || undefined} aria-live="polite">
          {amountCells(cents).map((cell, index) => (
            <span class="amount__cell" data-kind={cell.kind} key={index}>
              {cell.text}
            </span>
          ))}
        </p>

        {/* Solo sulle generate, e detto **prima** del tap che scrive: e' la
            domanda che questo foglio esiste per chiudere. Sta qui e non nel
            toast perche' dopo non serve piu' a decidere niente. L'altezza non
            e' riservata: `source` non cambia mentre il foglio e' aperto, quindi
            questa riga c'e' o non c'e' dal primo frame e non sposta niente. */}
        {expense.source === 'recurring' ? <p class="fix__note">{t('amount.fixed')}</p> : null}

        <Keypad
          atMax={atMax}
          canDelete={!empty}
          onDigit={digit}
          onBackspace={() => {
            setFailed(false)
            setTyped(true)
            setCents((amount) => Math.floor(amount / 10))
          }}
          onClear={() => {
            setFailed(false)
            setTyped(true)
            setCents(0)
          }}
        />

        {/* L'unico tap che scrive. Spento finche' il numero e' quello di prima:
            non c'e' niente da correggere, e una scrittura che non cambia niente
            produrrebbe comunque un toast con "Annulla" appeso al nulla. */}
        <button type="button" class="save" disabled={empty || same} onClick={save}>
          {t('amount.save', { amount: money(cents) })}
        </button>
      </div>
    </>
  )
}
