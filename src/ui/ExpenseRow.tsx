import { formatCents } from '../core/money'
import type { Category, Expense } from '../core/types'
import './ExpenseRow.css'

/**
 * Una spesa in elenco. La usano lo Storico e le spese di oggi nella Home, ed e'
 * la stessa riga in tutti e due: stesso bersaglio, stesso gesto, stesso esito.
 *
 * E' un bottone, non un testo: era l'unico elemento dell'app che si poteva
 * toccare senza che succedesse niente. La freccia e lo stato premuto sono
 * l'affordance che un long-press non avrebbe avuto.
 *
 * Sta in un componente suo da quando gli elenchi sono due: la stessa riga
 * ricopiata in due schermate e' la stessa decisione presa in due posti, e alla
 * prima modifica ne cambia uno solo.
 */
export function ExpenseRow({
  expense,
  category,
  onPick,
}: {
  readonly expense: Expense
  /** Puo' mancare: una categoria archiviata o cancellata resta referenziata. */
  readonly category: Category | undefined
  readonly onPick: (expense: Expense) => void
}) {
  return (
    <button type="button" class="row" onClick={() => onPick(expense)}>
      <span class="row__emoji" aria-hidden="true">
        {category?.emoji ?? '•'}
      </span>
      <span class="row__text">
        <span class="row__name">{category?.name ?? 'Categoria rimossa'}</span>
        {expense.note === undefined ? null : <span class="row__note">{expense.note}</span>}
      </span>
      <span class="row__amount">{formatCents(expense.amountCents)}</span>
      <svg class="row__go" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </button>
  )
}
