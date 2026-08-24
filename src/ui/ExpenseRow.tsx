import type { Category, Expense } from '../core/types'
import { money, t } from './i18n'
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
        <span class="row__name">{category?.name ?? t('row.categoryRemoved')}</span>
        {expense.note === undefined ? null : <span class="row__note">{expense.note}</span>}
      </span>
      {/* Da dove arriva questa riga: `source === 'recurring'`, cioe' l'ha
          scritta una regola e non un tap in cassa (ADR 016).

          **Discreto, non un badge urlato**: e' un'informazione, non un avviso.
          Non c'e' niente da fare e niente da correggere — la spesa e' vera,
          conta nello Storico e nelle statistiche come tutte, e si modifica e si
          cancella come tutte. L'unica cosa che cambia e' che il budget non la
          conta, e quello lo dice la Home.

          Sta prima dell'importo e non dentro `.row__text`: li' spingerebbe il
          nome della categoria a mandare a capo su un nome lungo, cioe'
          cambierebbe l'altezza della riga a seconda del dato. Qui e'
          `flex: none` fra due blocchi che si adattano, e non muove niente.

          Il simbolo e' due frecce in cerchio: a 14px un orologio o un
          calendario sono una macchia, questo si legge. Il nome accessibile e'
          testo vero accanto all'icona, non un `title` — un `title` non lo legge
          nessun lettore di schermo in modo affidabile e nessuno lo vede al
          tocco. */}
      {expense.source === 'recurring' ? (
        <>
          <span class="visually-hidden">{t('row.fixed')}</span>
          <svg class="row__fixed" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5" />
            <path d="M20 4v4.5h-4.5M4 20v-4.5h4.5" />
          </svg>
        </>
      ) : null}
      <span class="row__amount">{money(expense.amountCents)}</span>
      <svg class="row__go" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="m9 5 7 7-7 7" />
      </svg>
    </button>
  )
}
