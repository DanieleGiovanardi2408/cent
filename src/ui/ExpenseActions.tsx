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
 * ## Perche' adesso c'e' anche "Correggi l'importo"
 *
 * Perche' su una spesa **generata da una regola** cancellare e reinserire non e'
 * un rimedio completo: e' una perdita. La spesa riscritta a mano ha
 * `source: 'manual'`, quindi esce dalle spese fisse ed **entra nel budget del
 * periodo** (ADR 016) — il numero grande della Home si muove per una correzione
 * che non e' una spesa nuova — e ha un id nuovo, mentre l'occorrenza generata ha
 * un'identita' deterministica che serve al motore (ADR 006).
 *
 * Sta **prima** di "Elimina" per questo: e' la mossa giusta, e la si legge per
 * prima. Su una spesa manuale non toglie niente a nessuno — correggere 12,00 in
 * 12,50 e' un tap in meno di cancella-e-riscrivi — quindi non e' condizionata a
 * `source`: un bottone che compare solo su certe righe si cerca proprio quando
 * non c'e'.
 */

interface Props {
  readonly expense: Expense
  /** Puo' mancare: una categoria archiviata o cancellata resta referenziata. */
  readonly category: Category | undefined
  readonly day: IsoDate
  /** Apre il foglio che corregge l'importo, conservando `id` e `source`. */
  readonly onFixAmount: () => void
  readonly onDelete: () => void
  readonly onClose: () => void
}

export function ExpenseActions({
  expense,
  category,
  day,
  onFixAmount,
  onDelete,
  onClose,
}: Props) {
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
        <button type="button" class="acts__fix" onClick={onFixAmount}>
          {t('acts.amount')}
        </button>
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
