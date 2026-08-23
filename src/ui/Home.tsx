import { useMemo } from 'preact/hooks'
import { computeBudgetMetrics } from '../core/budget'
import type { BudgetMetrics } from '../core/budget'
import type { IsoDate } from '../core/date'
import { formatCents } from '../core/money'
import { groupByDay } from '../core/stats'
import type { Budget, Category, Expense } from '../core/types'
import type { AppPhase } from '../app/boot'
import { ArchiveError } from './Blank'
import { ExpenseRow } from './ExpenseRow'
import { activePeriod, allowanceCopy, budgetStart, heroCopy, paceParts, spentRatio, startNote } from './budget-view'
import { periodName, periodRangeLabel } from './labels'
import './Home.css'

/**
 * La Home: quanto resta, e quanto si puo' spendere oggi.
 *
 * ## Cosa c'e' e in che ordine
 *
 * 1. il periodo, in due parole e con le sue date;
 * 2. **il numero grande, che e' il residuo** — non la spesa. Quello che si
 *    guarda prima di entrare in un bar e' quanto rimane;
 * 3. la barra del periodo;
 * 4. **"puoi spendere ~X al giorno"**, gia' diviso: e' il numero per cui si apre
 *    l'app quando non si sta pagando, ed e' l'unico che nessuno ha voglia di
 *    calcolare a mente in mezzo alla strada;
 * 5. passo attuale contro passo sostenibile;
 * 6. le spese di oggi, con il loro totale.
 *
 * ## Ordine di pittura: la Home e' la schermata dove un salto si vedrebbe
 *
 * Il numero grande cambia larghezza al cambiare delle cifre e cambia contenuto
 * appena il database si apre. Per questo **la struttura e' sempre la stessa**,
 * dati o non dati: le stesse righe, le stesse altezze, riservate in CSS. Prima
 * dei dati i testi sono vuoti; all'arrivo si riempiono e non si sposta niente
 * (CLS = 0). Il numero grande e' un blocco: cambiare larghezza non muove nulla,
 * cambiare altezza si', e l'altezza e' fissata a `--fs-hero` per il line-height.
 *
 * ## Senza budget la Home non e' vuota
 *
 * Mostra il totale del periodo e il passo di spesa — cose vere, che l'app
 * conosce comunque — e invita a impostare un budget spiegando che cosa
 * cambierebbe. Uno stato vuoto che non dice niente e' una schermata sprecata.
 */

interface Props {
  readonly phase: AppPhase
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly budgets: readonly Budget[]
  /** Il giorno civile corrente, ricalcolato al risveglio (ADR 007). */
  readonly day: IsoDate
  readonly onPick: (expense: Expense) => void
  readonly onEditBudget: () => void
}

export function Home({ phase, expenses, categories, budgets, day, onPick, onEditBudget }: Props) {
  const ready = phase === 'ready'

  const view = useMemo(() => {
    const period = activePeriod(budgets, day)
    const metrics = computeBudgetMetrics({ expenses, budgets, period, onDate: day, today: day })
    // `groupByDay` sul solo giorno di oggi: il filtro e' una passata su 5.000
    // record, il sort che segue e' su una manciata. E soprattutto l'ordine delle
    // righe e il totale del giorno restano decisi in un posto solo — lo stesso
    // che li decide nello Storico.
    const today = groupByDay(expenses.filter((expense) => expense.date === day))[0]
    // Il budget e' nato dentro questo periodo? (ADR 010). Si calcola qui perche'
    // serve a due righe diverse — la spiegazione e la disponibilita' — e perche'
    // costa una passata sulle spese, che non deve girare a ogni render.
    return { period, metrics, today, start: budgetStart(metrics, expenses) }
  }, [expenses, budgets, day])

  const byId = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const { metrics } = view
  const hero = heroCopy(metrics)
  const allowance = allowanceCopy(metrics, view.start)
  const since = startNote(metrics, view.start)
  const hasBudget = metrics.budgetCents !== null
  const todayRows = view.today?.expenses ?? []

  return (
    <div class="home">
      <section class="hero">
        <p class="hero__period">
          {ready ? `${periodName(view.period)} · ${periodRangeLabel(view.period, metrics.range)}` : ''}
        </p>
        <p class="hero__label">{ready ? hero.label : ''}</p>
        {/* `aria-live` no: il toast annuncia gia' la spesa appena salvata, e due
            annunci per lo stesso fatto sono peggio di uno. */}
        <p class="hero__value" data-tone={ready && hero.over ? 'over' : undefined}>
          {ready ? hero.value : ''}
        </p>
        <p class="hero__note">{ready ? hero.note : ''}</p>
      </section>

      {/* Il riquadro che cambia contenuto ma non misura: con budget tiene barra,
          disponibilita' e passo; senza, l'invito. L'altezza e' riservata in CSS
          per il piu' alto dei due, cosi' il passaggio da uno stato all'altro —
          e dal guscio a entrambi — non sposta le spese di oggi di un pixel. */}
      <div class="slot">
        {!ready ? null : hasBudget ? (
          <>
            <div
              class="track"
              data-tone={hero.over ? 'over' : undefined}
              role="img"
              aria-label={hero.note}
            >
              {/* Solo `transform`: la barra si riempie senza toccare il layout.
                  Sotto prefers-reduced-motion i token di durata valgono zero. */}
              <div class="track__fill" style={`transform:scaleX(${spentRatio(metrics)})`} />
            </div>

            <p class="allowance" data-tone={allowance.over ? 'over' : undefined}>
              {allowance.main}
            </p>
            <p class="allowance__sub">{allowance.sub}</p>

            {/* Perche' i numeri sono quelli, nel periodo in cui il budget e'
                nato (ADR 010). Compare per un periodo solo e poi sparisce da
                sola: lo spazio resta riservato in `--slot-min` perche' un salto
                costerebbe piu' di qualche pixel vuoto. */}
            {since === null ? null : <p class="since">{since}</p>}

            <Pace metrics={metrics} />
          </>
        ) : (
          <>
            <p class="invite">
              Con un budget questa riga diventa <b>quanto puoi spendere oggi</b>,
              invece di quanto hai già speso.
            </p>
            <Pace metrics={metrics} />
          </>
        )}
      </div>

      {/* Un bottone solo, sempre nello stesso posto, che cambia solo la parola:
          finche' non esiste la schermata Impostazioni (fase 5) e' l'unica via
          per il budget, e una via che si sposta e' una via che si cerca. */}
      <button type="button" class="budget" disabled={!ready} onClick={onEditBudget}>
        {hasBudget && ready ? 'Cambia il budget' : 'Imposta un budget'}
      </button>

      <section class="today">
        <h2 class="today__head">
          <span class="today__name">Oggi</span>
          <span class="today__total">{ready ? formatCents(view.today?.totalCents ?? 0) : ''}</span>
        </h2>

        {phase === 'failed' ? (
          <ArchiveError />
        ) : todayRows.length === 0 ? (
          // Mentre il database si apre non si dice niente: un messaggio che dura
          // 40 ms e' rumore che si vede lampeggiare.
          ready ? (
            <div class="blank">
              <p class="blank__title">Oggi non hai segnato niente</p>
              <p class="blank__text">
                Tocca il + qui sotto, digita l&apos;importo e scegli la categoria.
                Sono due tap: si fa in cassa, con una mano.
              </p>
            </div>
          ) : (
            <div class="blank" aria-hidden="true" />
          )
        ) : (
          <ul>
            {todayRows.map((expense) => (
              <li key={expense.id}>
                <ExpenseRow
                  expense={expense}
                  category={byId.get(expense.categoryId)}
                  onPick={onPick}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/**
 * Il passo, con i numeri in grassetto: chi guarda lo schermo per mezzo secondo
 * trova le due cifre senza leggere la frase intorno.
 */
function Pace({ metrics }: { readonly metrics: BudgetMetrics }) {
  return (
    <p class="pace">
      {paceParts(metrics).map((part, index) =>
        part.strong === true ? (
          <b class="pace__n" key={index}>
            {part.text}
          </b>
        ) : (
          part.text
        ),
      )}
    </p>
  )
}
