import { useEffect, useRef, useState } from 'preact/hooks'
import type { IsoDate } from '../core/date'
import type { Category, Expense } from '../core/types'
import { Keypad } from './Keypad'
import { amountCells, dayHeading, money, t } from './i18n'
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
 * ## Perche' l'importo e basta
 *
 * Perche' e' l'unico campo che ha il difetto qui sopra. La categoria e la data
 * di una spesa generata si correggono gia' dove si correggono quelle di tutte —
 * cioe' da nessuna parte, oggi — e aggiungerle qui vorrebbe dire portarsi
 * dentro anche l'unione di ADR 019 sui chip, cioe' un secondo foglio
 * d'inserimento. Un foglio che fa una cosa sola non ha bisogno di dire quale.
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

interface Props {
  /** La spesa, **riletta dal mirror** da chi apre il foglio: mai congelata. */
  readonly expense: Expense
  /** Puo' mancare: una categoria archiviata resta referenziata dalla spesa. */
  readonly category: Category | undefined
  readonly day: IsoDate
  readonly leaving: boolean
  /** `false` = non e' andata. Il foglio resta aperto con l'importo digitato. */
  readonly onSave: (amountCents: number) => boolean
  readonly onClose: () => void
}

/** Lo stesso tetto dell'inserimento: 99.999,99 €. Vedi AddSheet. */
const MAX_CENTS = 9_999_999

export function AmountSheet({ expense, category, day, leaving, onSave, onClose }: Props) {
  const before = expense.amountCents
  const [cents, setCents] = useState(before)
  /** Finche' e' falso, l'importo e' quello di prima: la prima cifra lo sostituisce. */
  const [typed, setTyped] = useState(false)
  const [failed, setFailed] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const done = useRef(false)

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
  }, [])

  const empty = cents === 0
  const atMax = cents > Math.floor(MAX_CENTS / 10)
  /** Niente da scrivere: stesso numero di prima, o zero. */
  const same = cents === before

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
    if (onSave(cents)) done.current = true
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

        {/* Quale spesa si sta correggendo. Non e' decorazione: e' l'unica cosa
            che distingue questo foglio da quello dell'inserimento, e senza si
            correggerebbe alla cieca la riga toccata due schermate fa. */}
        <p class="fix__head">
          <span class="fix__emoji" style={`--cat:${category?.color ?? 'transparent'}`} aria-hidden="true">
            {category?.emoji ?? '•'}
          </span>
          <span class="fix__text">
            <span class="fix__name">{category?.name ?? t('row.categoryRemoved')}</span>
            <span class="fix__when">{dayHeading(expense.date, day)}</span>
          </span>
        </p>

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
