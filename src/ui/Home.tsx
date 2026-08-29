import { useMemo } from 'preact/hooks'
import { computeBudgetMetrics } from '../core/budget'
import type { BudgetMetrics } from '../core/budget'
import type { IsoDate } from '../core/date'
import { groupByDay } from '../core/stats'
import type { Budget, Category, Expense } from '../core/types'
import type { AppPhase } from '../app/boot'
import { ArchiveError } from './Blank'
import { ExpenseRow } from './ExpenseRow'
import { activePeriod, allowanceCopy, budgetStart, heroCopy, paceParts, spentRatio, startNote } from './budget-view'
import { money, periodName, periodRangeLabel, t } from './i18n'
import './Home.css'

/**
 * La Home: quanto resta, e quanto si puo' spendere oggi.
 *
 * ## Cosa c'e' e in che ordine
 *
 * ## Quattro livelli, e ognuno dice un fatto che gli altri non dicono
 *
 * 1. **il numero grande**, col suo segno e col suo colore: quanto resta (o di
 *    quanto si e' andati oltre). Sopra, una parola che dice **cosa** e';
 * 2. **una riga**: da quale budget viene, e quanto e' gia' uscito;
 * 3. **una riga, l'unica azionabile**: quanto si puo' spendere al giorno e per
 *    quanti giorni — oppure, sforati, il passo tenuto contro quello sostenibile;
 * 4. **una nota in fondo**: le spese fisse che quel numero non conta
 *    (ADR 016 §2), obbligatoria.
 *
 * Piu' la barra del periodo, che e' il livello 1 in geometria, e le spese di
 * oggi in fondo.
 *
 * ## Cosa c'era prima, e perche' era troppo
 *
 * **Sei affermazioni per un fatto solo.** Nello stato sforato, misurato:
 * `−88,00 €`, il colore ambra, la barra piena, *"Il budget del periodo e'
 * finito."*, *"Restano 2 giorni: quello che spendi da qui e' in piu'."*,
 * *"Sopra ritmo: 48,00 € al giorno contro 28,57 € sostenibili."*
 *
 * Le tre frasi dicevano cio' che il segno e il colore dicevano gia'. Sono
 * diventate **una**, e i numeri hanno preso il posto delle parole: la regola che
 * tiene insieme questa riparazione e quella dello stato vuoto e' *dove ci sono
 * dati si mostrano numeri, dove non ce ne sono si parla*.
 *
 * Ed e' per questo che **lo stato vuoto di oggi non e' stato toccato**: li' non
 * ci sono dati, quindi si parla — ma il `0,00 €` che gli stava accanto se n'e'
 * andato, perche' era lo stesso fatto detto due volte, un numero e una frase.
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
        {/* Il livello 2, e adesso e' **una** riga sola sotto il numero.
            Accanto le stava la dichiarazione delle spese fisse: due didascalie
            appaiate, e la seconda si leggeva come la coda della prima. E'
            scesa in fondo al riquadro, dove il livello 4 la vuole. */}
        <p class="hero__note">{ready ? hero.note : ''}</p>
      </section>

      {/* Il riquadro che cambia contenuto ma non misura: con budget tiene barra,
          disponibilita' e passo; senza, l'invito. L'altezza e' riservata in CSS
          per il piu' alto dei due, cosi' il passaggio da uno stato all'altro —
          e dal guscio a entrambi — non sposta le spese di oggi di un pixel. */}
      <div class="slot">
        {!ready ? null : (
          <>
            {hasBudget ? (
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

                {/* Il livello 3: **una riga**, dove ce n'erano tre. La
                    disponibilita' col suo numero di giorni dentro; sforati, il
                    passo contro il sostenibile. Mai le due cose insieme —
                    l'argomento sta su `allowanceCopy`. */}
                <p class="allowance" data-tone={allowance.over ? 'over' : undefined}>
                  {allowance.text}
                </p>

                {/* Perche' i numeri sono quelli, nel periodo in cui il budget e'
                    nato (ADR 010). Compare per un periodo solo e poi sparisce da
                    sola: lo spazio resta riservato in `--slot-min` perche' un salto
                    costerebbe piu' di qualche pixel vuoto. */}
                {since === null ? null : <p class="since">{since}</p>}
              </>
            ) : (
              <>
                <p class="invite">
                  {t('home.invite.before')}
                  <b>{t('home.invite.strong')}</b>
                  {t('home.invite.after')}
                </p>
                <Pace metrics={metrics} />
              </>
            )}

            {/* Il livello 4: cosa **non** c'e' dentro il numero grande
                (ADR 016 §2), in fondo e in tutti e due gli stati — senza budget
                il numero grande e' lo speso, che le fisse le esclude
                identicamente.

                L'altezza e' riservata anche da vuota, come le altre righe di
                questo blocco: la riga compare e sparisce da sola a seconda che
                nel periodo sia scattata o no una regola — settimana del canone
                si', quella dopo no — e senza riserva le spese di oggi
                scenderebbero di una riga a settimane alterne. */}
            <p class="slot__fixed">{hero.fixed ?? ''}</p>
          </>
        )}
      </div>

      {/* Un bottone solo, sempre nello stesso posto, che cambia solo la parola:
          finche' non esiste la schermata Impostazioni (fase 5) e' l'unica via
          per il budget, e una via che si sposta e' una via che si cerca. */}
      <button type="button" class="budget" disabled={!ready} onClick={onEditBudget}>
        {t(hasBudget && ready ? 'home.budget.change' : 'home.budget.set')}
      </button>

      <section class="today">
        <h2 class="today__head">
          <span class="today__name">{t('day.today')}</span>
          {/* **Dove non ci sono dati non si scrive un numero.** `Oggi 0,00 €`
              sopra `Oggi non hai segnato niente` erano lo stesso fatto due
              volte, un numero e una frase — e lo zero e' il piu' inutile dei
              due, perche' e' vero per costruzione ogni mattina.

              Lo stato vuoto qui sotto **non si tocca**: e' l'esempio giusto
              della regola, non la sua eccezione. Cade lo zero, resta il copy.

              Il `null` e la stringa vuota si comportano uguale per il layout —
              l'altezza della riga la fissa `.today__name` — quindi togliere la
              cifra non muove niente. */}
          <span class="today__total">
            {ready && todayRows.length > 0 ? money(view.today?.totalCents ?? 0) : ''}
          </span>
        </h2>

        {phase === 'failed' ? (
          <ArchiveError />
        ) : todayRows.length === 0 ? (
          // Mentre il database si apre non si dice niente: un messaggio che dura
          // 40 ms e' rumore che si vede lampeggiare.
          ready ? (
            <div class="blank">
              <p class="blank__title">{t('home.blank.title')}</p>
              <p class="blank__text">{t('home.blank.text')}</p>
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
 * trova le cifre senza leggere la frase intorno.
 *
 * **Vive solo nello stato senza budget**, dove e' l'unica cosa vera che si possa
 * dire — e dove il grassetto serve davvero, perche' la frase intorno e' muta.
 * Il livello 3, che e' la riga con budget, e' invece gia' tutto in 20px semibold
 * sul colore del testo: li' un grassetto dentro un grassetto non
 * distinguerebbe niente, ed e' per questo che `allowanceCopy` restituisce una
 * stringa e non dei pezzi.
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
