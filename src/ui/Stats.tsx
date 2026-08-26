import { useMemo } from 'preact/hooks'
import type { Budget, BudgetPeriod, Category, Expense, RecurringRule } from '../core/types'
import type { IsoDate } from '../core/date'
import { money, periodRangeLabel, t } from './i18n'
import { statsView } from './stats-view'
import type { Breakdown, CategorySlice, PeriodBar, Trend } from './stats-view'
import './Stats.css'

/**
 * Le Statistiche. **Questo file non decide niente**: `stats-view.ts` gli
 * consegna righe con frazioni gia' calcolate, e qui diventano larghezze.
 *
 * ## Perche' non c'e' un tooltip
 *
 * La regola della disciplina dei grafici e' *"il lettore deve poter ottenere il
 * valore esatto"*, e il tooltip e' **un'implementazione** di quella regola su uno
 * schermo grande, dove il valore non e' scritto. Qui il valore e' scritto
 * accanto a ogni barra: la regola e' soddisfatta, non aggirata.
 *
 * E due ragioni pratiche che chiuderebbero comunque il caso: su iOS un tooltip a
 * tap introduce un secondo gesto per chiuderlo, che compete con la chiusura del
 * foglio; e un overlay in alto finisce sotto il notch, che e' proprio la classe
 * di difetti che la suite non puo' vedere per costruzione.
 *
 * ## E perche' non c'e' una vista tabellare gemella
 *
 * Perche' **il grafico e' gia' la tabella**: nome a sinistra, barra al centro,
 * importo a destra. Una seconda vista sarebbe una parafrasi del grafico promossa
 * a schermata — due rappresentazioni dello stesso dato che possono divergere
 * senza che nessun test se ne accorga, perche' entrambe sarebbero "corrette".
 *
 * Il vincolo che una tabella avrebbe soddisfatto — tre degli otto colori stanno
 * sotto 3:1 sul fondo, misurato — e' soddisfatto qui in due modi: **l'etichetta
 * e' sempre visibile**, e ogni barra porta un **contorno**, cosi' la forma si
 * vede anche dove il riempimento non si stacca.
 */

interface Props {
  readonly phase: string
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly rules: readonly RecurringRule[]
  readonly budgets: readonly Budget[]
  readonly period: BudgetPeriod
  readonly day: IsoDate
}

/**
 * Una riga: etichetta, barra, importo. E' la marca unica della schermata — A e B
 * la condividono, e la differenza fra le due sta **nei dati** (B porta una
 * traccia, A no, perche' un budget per categoria non esiste) invece che in due
 * invenzioni grafiche.
 */
function Row({
  label,
  amount,
  fraction,
  color,
  track,
  bar,
}: {
  readonly label: string
  readonly amount: string
  readonly fraction: number
  readonly color?: string
  readonly track?: PeriodBar['track']
  readonly bar: boolean
}) {
  const pct = (value: number) => `${(Math.max(0, Math.min(1, value)) * 100).toFixed(4)}%`
  return (
    <li class="stat">
      {/* L'equivalente testuale sta nel markup e non e' una vista in piu': i due
          pezzi che lo compongono — l'etichetta e l'importo formattato — sono
          gia' a schermo, e la barra accanto e' dichiarata decorativa. */}
      <span class="stat__label">{label}</span>
      {bar ? (
        <span class="stat__plot" aria-hidden="true">
          {track ? (
            <>
              {/* La traccia: il budget del periodo. C'e' **solo** dove il
                  confronto ha una risposta. */}
              <span class="stat__track" style={{ inlineSize: pct(track.fraction) }} />
              {/* La parte di periodo non ancora accaduta. A periodo chiuso e'
                  larga zero, quindi l'incompletezza e' un dato e non un ramo. */}
              <span
                class="stat__unlived"
                style={{
                  insetInlineStart: pct(track.fraction * track.livedFraction),
                  inlineSize: pct(track.fraction * (1 - track.livedFraction)),
                }}
              />
              {/* Il maturato: il segno contro cui si legge se il passo e' alto. */}
              <span
                class="stat__accrued"
                style={{ insetInlineStart: pct(track.fraction * track.livedFraction) }}
              />
            </>
          ) : null}
          <span
            class="stat__bar"
            style={{ inlineSize: pct(fraction), backgroundColor: color ?? 'var(--brand)' }}
          />
        </span>
      ) : null}
      <span class="stat__value">{amount}</span>
    </li>
  )
}

function Categories({ breakdown }: { readonly breakdown: Breakdown }) {
  if (breakdown.rows.length === 0) return null
  return (
    <section class="stats__section">
      <h2 class="stats__title">{t('stats.byCategory')}</h2>
      <ul class="stats__rows" data-chart={breakdown.asChart ? '' : undefined}>
        {breakdown.rows.map((row: CategorySlice) => (
          <Row
            key={row.categoryId}
            label={row.name}
            amount={money(row.cents)}
            fraction={row.fraction}
            color={row.color}
            bar={breakdown.asChart}
          />
        ))}
      </ul>
    </section>
  )
}

function Periods({ trend, period }: { readonly trend: Trend; readonly period: BudgetPeriod }) {
  if (trend.rows.length === 0) return null
  return (
    <section class="stats__section">
      <h2 class="stats__title">
        {t(period === 'weekly' ? 'stats.byPeriod.weekly' : 'stats.byPeriod.monthly')}
      </h2>
      <ul class="stats__rows" data-chart={trend.asChart ? '' : undefined}>
        {trend.rows.map((row: PeriodBar) => (
          <Row
            key={row.key}
            label={periodRangeLabel(period, row.range)}
            amount={money(row.cents)}
            fraction={row.fraction}
            track={row.track}
            bar={trend.asChart}
          />
        ))}
      </ul>
    </section>
  )
}

export function Stats({ phase, expenses, categories, rules, budgets, period, day }: Props) {
  const ready = phase === 'ready'
  const view = useMemo(
    () => statsView({ expenses, categories, rules, budgets, period, day }),
    [expenses, categories, rules, budgets, period, day],
  )

  // Il guscio si dipinge prima dei dati ("Ordine di pittura"): finche' non sono
  // arrivati non si mostra ne' il vuoto ne' il pieno, perche' dichiarare "niente
  // da mostrare" mentre si sta ancora leggendo il disco sarebbe un messaggio che
  // afferma un fatto non ancora accertato.
  if (!ready) return <div class="stats stats--shell" />

  if (view.kind === 'blank') {
    return (
      <div class="stats">
        <div class="blank">
          <p class="blank__title">{t('stats.blank.title')}</p>
          <p class="blank__text">{t('stats.blank.text')}</p>
        </div>
      </div>
    )
  }

  return (
    <div class="stats">
      {/* Le due cifre (ADR 016 §3). Sono in testa perche' senza di loro i due
          grafici sotto escluderebbero le fisse in silenzio. */}
      <div class="stats__tiles">
        <div class="tile">
          <p class="tile__label">{t('stats.variable')}</p>
          <p class="tile__value">{money(view.tiles.variableCents)}</p>
          <p class="tile__sub">{periodRangeLabel(view.period, view.current.range)}</p>
        </div>
        {view.tiles.hasFixed ? (
          <div class="tile">
            <p class="tile__label">{t('stats.fixed')}</p>
            <p class="tile__value">{money(view.tiles.fixedMonthlyCents)}</p>
            <p class="tile__sub">{t('stats.perMonth')}</p>
          </div>
        ) : null}
      </div>

      <Categories breakdown={view.byCategory} />
      <Periods trend={view.byPeriod} period={view.period} />
    </div>
  )
}
