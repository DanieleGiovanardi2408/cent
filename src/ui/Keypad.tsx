import { useRef } from 'preact/hooks'
import './Keypad.css'

/**
 * Tastierino cents-first (ADR 004).
 *
 * Dieci cifre e una cancellazione. **Non c'e' il tasto virgola** e non e' una
 * dimenticanza: le cifre riempiono l'importo da destra come al bancomat, quindi
 * il separatore non ha niente da separare. Con lui spariscono il doppio
 * separatore, la virgola in prima posizione e i tre decimali — cioe' tutti gli
 * stati malformati che un parser avrebbe dovuto gestire.
 *
 * Non e' la tastiera di iOS, e non e' una questione di stile: quella impiega un
 * istante ad aprirsi, sposta il layout mentre sale e su un `input` sotto i 16px
 * zooma la pagina. Il tastierino e' gia' li', disegnato, alla stessa distanza
 * dal pollice a ogni apertura.
 *
 * Lo zero occupa due colonne: e' la cifra piu' battuta (ogni importo tondo
 * finisce con due) e il bersaglio piu' grande della griglia.
 */

interface Props {
  readonly onDigit: (digit: number) => void
  readonly onBackspace: () => void
  readonly onClear: () => void
  /** L'importo ha raggiunto il tetto: le cifre non accettano piu' niente. */
  readonly atMax: boolean
  readonly canDelete: boolean
}

const ROWS: readonly (readonly number[])[] = [
  [1, 2, 3],
  [4, 5, 6],
  [7, 8, 9],
]

/** Oltre questa soglia il tocco lungo azzera invece di togliere una cifra. */
const CLEAR_HOLD_MS = 500

export function Keypad({ onDigit, onBackspace, onClear, atMax, canDelete }: Props) {
  const holdTimer = useRef(0)
  const cleared = useRef(false)

  function startHold(): void {
    if (!canDelete) return
    cleared.current = false
    holdTimer.current = window.setTimeout(() => {
      cleared.current = true
      onClear()
    }, CLEAR_HOLD_MS)
  }

  function endHold(): void {
    clearTimeout(holdTimer.current)
  }

  return (
    <div class="pad">
      {ROWS.flat().map((digit) => (
        <button
          key={digit}
          type="button"
          class="pad__key"
          disabled={atMax}
          onClick={() => onDigit(digit)}
        >
          {digit}
        </button>
      ))}

      <button
        type="button"
        class="pad__key pad__key--zero"
        disabled={atMax}
        onClick={() => onDigit(0)}
      >
        0
      </button>

      <button
        type="button"
        class="pad__key pad__key--erase"
        disabled={!canDelete}
        aria-label="Cancella l'ultima cifra. Tieni premuto per azzerare"
        onPointerDown={startHold}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
        onClick={() => {
          // Il tocco lungo ha gia' azzerato: il click che lo segue non deve
          // togliere anche una cifra di un importo che non c'e' piu'.
          if (cleared.current) {
            cleared.current = false
            return
          }
          onBackspace()
        }}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path d="M9 5h11v14H9L3 12z" />
          <path d="m12.5 9.5 5 5m0-5-5 5" />
        </svg>
      </button>
    </div>
  )
}
