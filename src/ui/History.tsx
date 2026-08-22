import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { IsoDate } from '../core/date'
import { formatCents } from '../core/money'
import { groupByDay } from '../core/stats'
import type { Category, Expense } from '../core/types'
import type { AppPhase } from '../app/boot'
import { insecureContext } from './env'
import { dayHeading } from './labels'
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
              <span class="day__total">{formatCents(group.totalCents)}</span>
            </h2>
            <ul>
              {group.expenses.map((expense) => {
                const category = byId.get(expense.categoryId)
                return (
                  <li key={expense.id}>
                    {/* La riga e' un bottone, non un testo: era l'unico elemento
                        dell'app che si poteva toccare senza che succedesse
                        niente. La freccia e lo stato premuto sono l'affordance
                        che un long-press non avrebbe avuto. */}
                    <button type="button" class="row" onClick={() => onPick(expense)}>
                      <span class="row__emoji" aria-hidden="true">
                        {category?.emoji ?? '•'}
                      </span>
                      <span class="row__text">
                        <span class="row__name">{category?.name ?? 'Categoria rimossa'}</span>
                        {expense.note === undefined ? null : (
                          <span class="row__note">{expense.note}</span>
                        )}
                      </span>
                      <span class="row__amount">{formatCents(expense.amountCents)}</span>
                      <svg class="row__go" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                        <path d="m9 5 7 7-7 7" />
                      </svg>
                    </button>
                  </li>
                )
              })}
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
 * ## La diagnosi prima del rimedio
 *
 * Qui c'era scritto "Succede in navigazione privata: Safari non lascia salvare
 * niente sul dispositivo". Era **una diagnosi indovinata**, e quando sbagliava
 * mandava a cercare il guasto in una finestra privata che non era stata aperta.
 * L'unica causa che l'app puo' davvero osservare e' il contesto non sicuro: se
 * e' quella, si dice quella. Se non lo e', si dicono le possibilita' come
 * possibilita', senza spacciarne una per la risposta.
 */
function Blank({ phase }: { readonly phase: AppPhase }) {
  if (phase === 'opening') return <div class="blank" aria-hidden="true" />

  if (phase === 'failed') {
    return (
      <div class="blank">
        <p class="blank__title">Non riesco ad aprire l'archivio</p>
        {insecureContext ? (
          <p class="blank__text">
            Cent è aperto su una connessione non sicura (http). Fuori da https il
            browser toglie una parte delle API che servono all'archivio locale:
            apri Cent da un indirizzo https, o da localhost, e i dati tornano.
          </p>
        ) : (
          <p class="blank__text">
            Può dipendere da una finestra privata, dallo spazio esaurito o da un
            profilo che blocca l'archiviazione: non so dire quale sia. Prova a
            riaprire Cent da una finestra normale. Finché l'archivio non si apre
            non si possono inserire spese — quello che scrivessi qui andrebbe perso.
          </p>
        )}
      </div>
    )
  }

  return (
    <div class="blank">
      <p class="blank__title">Nessuna spesa, per ora</p>
      <p class="blank__text">
        Tocca il + qui sotto, digita quanto hai speso e scegli la categoria.
        Sono due tap: si fa in cassa, con una mano.
      </p>
      <p class="blank__text hint--install">
        Aggiungi Cent alla schermata Home: si apre a schermo intero e parte anche senza rete.
      </p>
    </div>
  )
}
