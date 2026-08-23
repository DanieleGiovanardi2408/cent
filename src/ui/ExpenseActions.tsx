import { useEffect, useRef } from 'preact/hooks'
import type { IsoDate } from '../core/date'
import type { Category, Expense } from '../core/types'
import { dayHeading, money, t } from './i18n'
import './sheet.css'
import './ExpenseActions.css'

/**
 * Le azioni su una spesa gia' inserita. Oggi ce n'e' una sola: **Elimina**.
 *
 * ## Perche' esiste
 *
 * Il chip della categoria e' anche il tasto di conferma (ADR 004): il tocco sul
 * chip sbagliato salva all'istante, e l'app ha accettato quella classe di errore
 * dichiarando il toast come rete. Ma una rete che dura sei secondi non copre
 * l'errore che si vede riguardando la lista un minuto dopo. Senza questo foglio
 * l'app produrrebbe un errore e poi si rifiuterebbe di correggerlo.
 *
 * ## Perche' un tap e non un long-press
 *
 * Un long-press non ha affordance: se non ci si ricorda che c'e', non esiste.
 * La riga era inerte — toccarla non faceva niente — cioe' un'affordance morta.
 * Ora la riga e' un bottone, con la freccia e lo stato premuto che lo dicono.
 *
 * ## Perche' Elimina e non Modifica
 *
 * L'importo della spesa e' scritto qui sopra, nell'intestazione: lo si legge, si
 * cancella e si reinserisce in cinque secondi. Cancellare e reinserire e' un
 * rimedio **completo**, non una versione lossy della modifica. La modifica in
 * posto e' comodita', e arriva in fase 3 aggiungendo un bottone a questo foglio.
 */

interface Props {
  readonly expense: Expense
  /** Puo' mancare: una categoria archiviata o cancellata resta referenziata. */
  readonly category: Category | undefined
  readonly day: IsoDate
  readonly onDelete: () => void
  readonly onClose: () => void
}

export function ExpenseActions({ expense, category, day, onDelete, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Chi aveva il fuoco se lo ritrova quando il foglio se ne va: senza, VoiceOver
    // riparte dall'inizio della lista a ogni chiusura.
    const before = document.activeElement
    dialog.current?.focus({ preventScroll: true })
    return () => {
      if (before instanceof HTMLElement && before.isConnected) {
        before.focus({ preventScroll: true })
      }
    }
  }, [])

  const note = expense.note === undefined ? '' : ` · ${expense.note}`

  return (
    <>
      <div class="scrim" onClick={onClose} />

      <div
        class="acts"
        role="dialog"
        aria-modal="true"
        aria-label={t('acts.label')}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        {/* L'importo sta qui, leggibile, e non e' decorazione: e' il dato che
            serve per reinserire la spesa dopo averla cancellata. */}
        <div class="acts__head">
          <span class="acts__emoji" aria-hidden="true">
            {category?.emoji ?? '•'}
          </span>
          <span class="acts__text">
            <span class="acts__name">{category?.name ?? t('row.categoryRemoved')}</span>
            <span class="acts__when">
              {dayHeading(expense.date, day)}
              {note}
            </span>
          </span>
          <span class="acts__amount">{money(expense.amountCents)}</span>
        </div>

        {/* "Chiudi" e' l'ultimo, cioe' il piu' vicino al pollice: se il tap che
            ha aperto il foglio rimbalza, atterra sulla cosa che non fa niente.
            E' anche l'ordine delle action sheet di iOS, per la stessa ragione. */}
        <button type="button" class="acts__delete" onClick={onDelete}>
          {t('acts.delete')}
        </button>
        <button type="button" class="acts__close" onClick={onClose}>
          {t('acts.close')}
        </button>
      </div>
    </>
  )
}
