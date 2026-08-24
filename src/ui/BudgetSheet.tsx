import { useEffect, useRef, useState } from 'preact/hooks'
import type { BudgetPeriod } from '../core/types'
import { Keypad } from './Keypad'
import { amountCells, cadenceLabel, money, t } from './i18n'
import './sheet.css'
import './BudgetSheet.css'

/**
 * Il budget: un importo e un periodo. Niente di piu', ed e' voluto — le
 * Impostazioni sono la fase 5, questa e' la parte minima senza la quale la Home
 * non ha un numero da mostrare.
 *
 * ## Qui il periodo **non** e' il tasto di conferma, e non e' un'incoerenza
 *
 * Nell'inserimento il chip della categoria salva (ADR 004). Quella e'
 * un'eccezione, e ADR 004 la giustifica con tre condizioni che valgono **li'**:
 * si inserisce una spesa dieci volte al giorno e di fretta, il tap che salva e'
 * anche l'ultima informazione che mancava, e c'e' l'Annulla del toast per sei
 * secondi.
 *
 * Nessuna delle tre vale qui. Un budget si imposta una volta al mese, con
 * calma; il periodo non e' l'ultima informazione ma la **prima**, perche' decide
 * anche quale importo ha senso; e il record e' storicizzato, quindi non c'e'
 * niente da annullare — al massimo si scrive sopra. Con il periodo come
 * conferma bastava un tap per trasformare "200 a settimana" in "200 al mese",
 * cioe' 6,45 € al giorno, senza aver digitato niente e senza rete.
 *
 * Quindi qui il periodo si **seleziona** e il salvataggio e' un atto a se'.
 * Il tap in piu' e' il prezzo giusto: si paga una volta al mese, e compra il
 * fatto che nessun budget venga scritto senza che qualcuno lo abbia voluto.
 *
 * ## L'importo proposto segue il periodo selezionato
 *
 * Finche' non si digita, l'importo mostrato e' quello **di quel periodo**: si
 * tocca "Al mese" e compare il budget mensile in vigore (o zero, se non c'e').
 * Un importo pensato per la settimana che resta li' mentre l'etichetta dice
 * "al mese" e' esattamente il numero sbagliato pronto per essere salvato.
 *
 * Appena si digita, invece, l'importo e' una scelta dell'utente e cambiare
 * periodo non la cancella: la prima cifra sostituisce la proposta (non la
 * appende — da 200,00 € un tap sul 5 farebbe 2000,05 €, cioe' un numero che
 * nessuno ha voluto), quelle dopo la allungano.
 */

interface Props {
  /** L'importo in vigore per ciascun periodo, o `null` se non c'e'. */
  readonly weeklyCents: number | null
  readonly monthlyCents: number | null
  /** Il periodo che la Home sta mostrando: il foglio si apre selezionato li'. */
  readonly period: BudgetPeriod
  readonly leaving: boolean
  /** `false` = non e' andata. Il foglio resta aperto e riprovabile. */
  readonly onSave: (period: BudgetPeriod, amountCents: number) => boolean
  readonly onClose: () => void
}

/** Lo stesso tetto dell'inserimento: 99.999,99 €. Vedi AddSheet. */
const MAX_CENTS = 9_999_999

export function BudgetSheet({
  weeklyCents,
  monthlyCents,
  period,
  leaving,
  onSave,
  onClose,
}: Props) {
  const amountOf = (which: BudgetPeriod): number =>
    (which === 'weekly' ? weeklyCents : monthlyCents) ?? 0

  /** Il periodo **selezionato**, che non e' ancora niente di scritto. */
  const [chosen, setChosen] = useState<BudgetPeriod>(period)
  const [cents, setCents] = useState(() => amountOf(period))
  /** Finche' e' falso, l'importo e' una proposta: la prima cifra lo sostituisce. */
  const [typed, setTyped] = useState(false)
  const [failed, setFailed] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const done = useRef(false)

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
  }, [])

  const empty = cents === 0
  const atMax = cents > Math.floor(MAX_CENTS / 10)

  function digit(value: number): void {
    setTyped(true)
    setCents((amount) => {
      const base = typed ? amount : 0
      return base > Math.floor(MAX_CENTS / 10) ? base : base * 10 + value
    })
  }

  function pick(next: BudgetPeriod): void {
    setChosen(next)
    setFailed(false)
    if (!typed) setCents(amountOf(next))
  }

  function save(): void {
    if (done.current || empty) return
    if (onSave(chosen, cents)) done.current = true
    else setFailed(true)
  }

  const weekly = chosen === 'weekly'
  const hint = failed
    ? t('budget.hint.failed')
    : atMax
      ? t('add.hint.max')
      : empty
        ? t(weekly ? 'budget.hint.weekly' : 'budget.hint.monthly')
        : t('budget.hint.check')

  return (
    <>
      <div class="scrim" data-leaving={leaving || undefined} onClick={onClose} />

      <div
        class="sheet sheet--budget"
        data-leaving={leaving || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t('budget.label')}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        {/* Niente `aria-live`, per la stessa ragione di `AddSheet`, che non
            nominava `AddSheet`: **e' un'istruzione, non un valore**. Si legge
            esplorando, non si annuncia. Qui il difetto era anche peggiore che
            la': questa riga commuta **alla prima cifra**, cioe' nello stesso
            frame in cui cambia `.amount`, che e' l'altra regione live del
            foglio. Due region `polite` aggiornate insieme mettono VoiceOver in
            coda con due annunci, e quello che conta — l'importo — arriva
            secondo. Vedi CLAUDE.md, "Una decisione vale dove vale il suo
            argomento". */}
        <p class="sheet__hint" data-tone={failed ? 'error' : undefined}>{hint}</p>

        {/* Le parti, non la stringa: i centesimi al 55% del corpo (sheet.css).
            Anche questa e' una decisione che non nominava `AddSheet` — il suo
            argomento e' *l'importo si digita cents-first e la magnitudine e'
            appesa a una virgola da 3 px*, e qui c'e' lo stesso tastierino, lo
            stesso cents-first e la stessa virgola. Un budget sbagliato di un
            fattore cento e' meno frequente di una spesa sbagliata e altrettanto
            silenzioso: riscrive ogni "puoi spendere ~X al giorno" del periodo.
            Vedi CLAUDE.md, "Una decisione vale dove vale il suo argomento". */}
        <p class="amount" data-empty={empty || undefined} aria-live="polite">
          {amountCells(cents).map((cell, index) => (
            <span class="amount__cell" data-kind={cell.kind} key={index}>
              {cell.text}
            </span>
          ))}
        </p>

        {/* Due bersagli larghi mezzo foglio. Sotto il nome, l'importo che c'e'
            adesso: cosi' si vede cosa si sta per sostituire senza aprire altro. */}
        <div class="periods" role="group" aria-label={t('budget.periods')}>
          <Period
            label={t('budget.weekly')}
            current={weeklyCents}
            selected={weekly}
            onPick={() => pick('weekly')}
          />
          <Period
            label={t('budget.monthly')}
            current={monthlyCents}
            selected={!weekly}
            onPick={() => pick('monthly')}
          />
        </div>

        <Keypad
          atMax={atMax}
          canDelete={!empty}
          onDigit={digit}
          onBackspace={() => {
            setTyped(true)
            setCents((amount) => Math.floor(amount / 10))
          }}
          onClear={() => {
            setTyped(true)
            setCents(0)
          }}
        />

        {/* L'unico tap che scrive, in fondo al foglio: il punto piu' comodo per
            il pollice, e l'ultimo posto dove si arriva. Senza importo non c'e'
            niente da salvare e lo dice spegnendosi, invece di accettare un tap
            che scriverebbe un budget da zero euro. */}
        <button type="button" class="save" disabled={empty} onClick={save}>
          {/* Il bottone dice cosa salva, non "Salva": e' l'unico posto in cui
              importo e periodo si leggono nella stessa riga, ed e' l'ultima
              cosa che si guarda prima di scrivere un record storicizzato. */}
          {empty
            ? t('budget.save')
            : t('budget.saveAmount', {
                amount: money(cents),
                cadence: cadenceLabel(chosen),
              })}
        </button>
      </div>
    </>
  )
}

function Period({
  label,
  current,
  selected,
  onPick,
}: {
  readonly label: string
  readonly current: number | null
  readonly selected: boolean
  readonly onPick: () => void
}) {
  return (
    <button
      type="button"
      class="period"
      data-selected={selected || undefined}
      aria-pressed={selected}
      onClick={onPick}
    >
      <span class="period__name">{label}</span>
      <span class="period__now">
        {current === null ? t('budget.none') : t('budget.now', { amount: money(current) })}
      </span>
    </button>
  )
}
