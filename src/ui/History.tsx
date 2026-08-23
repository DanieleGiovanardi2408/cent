import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { IsoDate } from '../core/date'
import { groupByDay } from '../core/stats'
import type { Category, Expense } from '../core/types'
import type { AppPhase } from '../app/boot'
import { ArchiveError } from './Blank'
import { ExpenseRow } from './ExpenseRow'
import { dayHeading, money, t } from './i18n'
import './History.css'

/**
 * Lo storico: un giorno per blocco, con il totale del giorno in testa.
 *
 * ## 5.000 spese
 *
 * `groupByDay` e' un sort e una passata: su 5.000 record e' sotto il
 * millisecondo, e non e' quello il problema. Il problema sarebbe **dipingerle
 * tutte**: 5.000 righe fanno ~20.000 nodi, che costano centinaia di millisecondi
 * al primo frame e un'occupazione di memoria che su iPhone finisce con la scheda
 * ricaricata.
 *
 * Qui non c'e' una libreria di virtualizzazione: c'e' una finestra che cresce.
 * Si dipingono `PAGE` giorni e se ne aggiungono altrettanti quando la sentinella
 * in fondo entra nella vista. Nessun elemento viene mai riciclato e nessuna
 * altezza viene stimata — cioe' nessuno dei due modi in cui la virtualizzazione
 * vera sbaglia (righe di altezza diversa per via delle note, salti dello scroll,
 * ricerca del testo del browser che non trova quello che non c'e').
 *
 * Il prezzo: chi scorre indietro per mille giorni accumula DOM. E' un prezzo che
 * si paga scorrendo, non aprendo l'app, e la virtualizzazione vera resta da
 * scrivere solo se una misura dira' che serve davvero.
 */

interface Props {
  readonly phase: AppPhase
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly day: IsoDate
  /** Tap sulla riga: apre le azioni su quella spesa. */
  readonly onPick: (expense: Expense) => void
}

/** Giorni dipinti per volta. Un mese abbondante: piu' di uno schermo pieno. */
const PAGE = 20

export function History({ phase, expenses, categories, day, onPick }: Props) {
  const groups = useMemo(() => groupByDay(expenses), [expenses])
  const byId = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )
  const [limit, setLimit] = useState(PAGE)
  const scroller = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = sentinel.current
    const root = scroller.current
    if (!target || !root || groups.length <= limit) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setLimit((current) => current + PAGE)
      },
      { root, rootMargin: '600px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [groups.length, limit])

  return (
    <div class="list" ref={scroller}>
      {groups.length === 0 ? (
        <Blank phase={phase} />
      ) : (
        groups.slice(0, limit).map((group) => (
          <section class="day" key={group.date}>
            <h2 class="day__head">
              <span class="day__name">{dayHeading(group.date, day)}</span>
              <span class="day__total">{money(group.totalCents)}</span>
            </h2>
            <ul>
              {group.expenses.map((expense) => (
                <li key={expense.id}>
                  <ExpenseRow
                    expense={expense}
                    category={byId.get(expense.categoryId)}
                    onPick={onPick}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <div class="list__end" ref={sentinel} />
    </div>
  )
}

/**
 * Lo stato senza righe. Tre casi diversi, tre testi diversi: mentre il database
 * si apre non c'e' niente da dire e non si dice niente — un "Caricamento..."
 * che dura 40 ms e' rumore che l'utente vede lampeggiare.
 *
 * Il caso "archivio non aperto" e' in `Blank.tsx`: lo dice anche la Home, con le
 * stesse parole.
 */
function Blank({ phase }: { readonly phase: AppPhase }) {
  if (phase === 'opening') return <div class="blank" aria-hidden="true" />
  if (phase === 'failed') return <ArchiveError />

  return (
    <div class="blank">
      <p class="blank__title">{t('history.blank.title')}</p>
      <p class="blank__text">{t('history.blank.text')}</p>
      <p class="blank__text hint--install">{t('history.blank.install')}</p>
    </div>
  )
}
