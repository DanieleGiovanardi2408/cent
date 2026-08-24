/**
 * Le parole intorno alle spese fisse, e le due liste che le schermate mostrano.
 *
 * Stessa collocazione e stesse ragioni di `budget-view.ts`: `src/core` risponde
 * con numeri (`monthlyFixedCosts`, `previewMaterialization`), qui si decide
 * **cosa dire** di quei numeri — compresi i casi che nessuno prova a mano. E'
 * un modulo senza DOM, quindi ha un test.
 *
 * Le due cose che vivono qui:
 *
 * 1. **L'elenco delle fisse** (`fixedList`), che non coincide con
 *    `monthlyFixedCosts`: quella conta solo le regole in vigore *oggi*, e una
 *    regola che parte il mese prossimo sparirebbe dalla schermata nell'istante
 *    in cui la si crea. Qui si vedono tutte; il totale resta quello del core.
 * 2. **L'anteprima** (`previewCopy`), cioe' la frase che dichiara cosa succede
 *    se si salva, e **se serve una conferma**.
 */

import { isAfter, isBefore } from '../core/date'
import type { IsoDate } from '../core/date'
import type { Cents } from '../core/money'
import { monthlyCostCents, monthlyFixedCosts } from '../core/recurring-plan'
import type { MaterializationPreviewResult } from '../core/recurring-plan'
import type { RecurringRule } from '../core/types'
import { cadencePhrase, dayRangeLabel, fullDayLabel, money, t } from './i18n'

/* ------------------------------------------------------------------------- *
 * 1. L'elenco delle spese fisse
 * ------------------------------------------------------------------------- */

export interface FixedLine {
  readonly rule: RecurringRule
  /**
   * Il costo mensile normalizzato, oppure `null` se questa regola **non e' nel
   * totale**: non e' ancora cominciata, e' finita, o e' spenta.
   *
   * `null` non e' zero, ed e' la differenza che la schermata deve poter dire:
   * una riga da `0,00 €` accanto a "Affitto" e' un numero sbagliato con l'aria
   * di essere giusto, mentre "parte: 1 settembre" e' il fatto.
   */
  readonly monthlyCents: Cents | null
  /** Perche' non e' nel totale. `null` quando ci sta dentro. */
  readonly aside: string | null
}

export interface FixedList {
  /** Esattamente `monthlyFixedCosts(...).totalCents`: la somma delle righe contate. */
  readonly totalCents: Cents
  /** Prima quelle che pesano, dalla piu' grande; poi le altre per data d'inizio. */
  readonly lines: readonly FixedLine[]
  /**
   * Vero se almeno una regola contata **non** e' mensile con `interval: 1`.
   *
   * E' la condizione con cui si decide di dire che il totale e' una media.
   * Una mensile da 900 vale 900 al mese esatti (12/12 = 1), quindi avvertire di
   * un'approssimazione che li' non c'e' insegnerebbe a saltare l'avviso proprio
   * quando serve — la stessa ragione per cui la conferma dell'arretrato non
   * compare sempre.
   */
  readonly approximate: boolean
}

/**
 * L'elenco che Impostazioni mostra, con il totale del core dentro.
 *
 * Il totale e le righe contate arrivano da `monthlyFixedCosts`, che e' anche
 * l'unico posto in cui si decide chi e' "in vigore oggi": rifare qui quel
 * filtro vorrebbe dire due risposte alla stessa domanda, e il giorno che
 * divergono il totale non e' piu' la somma di cio' che si vede sotto.
 *
 * Le regole che quel filtro scarta **non spariscono**: prendono `monthlyCents:
 * null` e una parola che dice perche'. Una regola creata con `startDate` al
 * mese prossimo altrimenti non comparirebbe da nessuna parte, cioe' l'utente
 * avrebbe appena confermato una creazione e non ne vedrebbe traccia.
 */
export function fixedList(rules: readonly RecurringRule[], onDate: IsoDate): FixedList {
  const counted = monthlyFixedCosts(rules, onDate)
  const inTotal = new Set(counted.lines.map((line) => line.rule.id))

  const lines: FixedLine[] = counted.lines.map((line) => ({
    rule: line.rule,
    monthlyCents: line.monthlyCents,
    aside: null,
  }))

  const rest = rules.filter((rule) => !inTotal.has(rule.id))
  // Ordine totale anche qui: data d'inizio, poi id. Due regole che partono lo
  // stesso giorno non devono scambiarsi di posto a seconda di come il mirror le
  // ha restituite.
  rest.sort((a, b) =>
    a.startDate === b.startDate ? (a.id < b.id ? -1 : 1) : a.startDate < b.startDate ? -1 : 1,
  )
  for (const rule of rest) {
    lines.push({ rule, monthlyCents: null, aside: asideFor(rule, onDate) })
  }

  return {
    totalCents: counted.totalCents,
    lines,
    approximate: counted.lines.some(
      (line) => line.rule.cadence !== 'monthly' || line.rule.interval !== 1,
    ),
  }
}

/**
 * Perche' questa regola non pesa sul mese. Tre motivi, in ordine di quanto
 * capitano; il quarto — record non valido — non ha una parola sua di proposito:
 * dire "regola non valida" a chi non l'ha scritta a mano non aiuta nessuno, e
 * la riga si legge comunque per intero (importo, cadenza, data d'inizio).
 */
function asideFor(rule: RecurringRule, onDate: IsoDate): string | null {
  if (isBefore(onDate, rule.startDate)) {
    return t('fixed.later', { day: fullDayLabel(rule.startDate, onDate) })
  }
  if (rule.endDate !== undefined && isAfter(onDate, rule.endDate)) {
    return t('fixed.ended', { day: fullDayLabel(rule.endDate, onDate) })
  }
  return null
}

/** La riga sotto il nome: `ogni mese · 900,00 €`. */
export function fixedLineNote(rule: RecurringRule): string {
  const every = cadencePhrase(rule.cadence, rule.interval)
  // L'importo si ripete accanto alla cadenza **solo quando il numero a destra
  // e' un altro numero**: per una mensile da 900 la colonna dice gia' 900, e
  // scriverlo due volte sulla stessa riga fa dubitare che siano la stessa cosa.
  const normalized = monthlyCostCents(rule)
  return normalized === rule.amountCents ? every : `${every} · ${money(rule.amountCents)}`
}

/* ------------------------------------------------------------------------- *
 * 2. L'anteprima, prima di scrivere
 * ------------------------------------------------------------------------- */

export interface PreviewCopy {
  /**
   * La frase da mostrare. **Mai vuota quando la regola e' leggibile**: dice
   * sempre almeno quando cade la prima spesa.
   */
  readonly text: string
  /**
   * Serve una conferma esplicita: la regola scriverebbe delle spese con data
   * **precedente a oggi**, cioe' riscriverebbe dei periodi gia' chiusi.
   *
   * E' `backdated` del core, e non e' vero quasi mai: una regola che parte oggi
   * non ha niente da confermare, e una conferma che compare sempre smette di
   * essere letta.
   */
  readonly confirm: boolean
  /** L'etichetta della conferma. `null` quando non serve. */
  readonly confirmLabel: string | null
  /** Cosa scrive il bottone che salva. */
  readonly saveLabel: string
}

/**
 * Le parole dell'anteprima, dai numeri che `previewMaterialization` restituisce.
 *
 * ## Il caso `ok: false` non arriva qui
 *
 * `previewMaterialization` rifiuta su una regola non valida, e il foglio la
 * interroga **mentre l'utente sta ancora scrivendo**: quel rifiuto e' uno stato
 * di transito, non un errore da mostrare. Chi chiama tiene la riga di aiuto sul
 * suo messaggio ("Quanto esce ogni volta?") finche' l'anteprima non ha una
 * risposta. Il tipo lo rende esplicito: qui entra solo un `ok: true`.
 *
 * ## `count: 0`
 *
 * Succede con una data d'inizio nel futuro: la finestra di materializzazione e'
 * vuota, quindi non c'e' nessuna data da elencare — ma la prima spesa esiste
 * eccome, ed e' `startDate`. Dirlo e' l'unico modo perche' "non succede niente
 * adesso" non si legga come "non succedera' niente".
 */
export function previewCopy(
  preview: Extract<MaterializationPreviewResult, { ok: true }>,
  startDate: IsoDate,
  today: IsoDate,
): PreviewCopy {
  if (!preview.backdated) {
    return {
      text:
        preview.firstDate === today || (preview.count === 0 && startDate === today)
          ? t('rule.preview.today')
          : t('rule.preview.later', {
              day: fullDayLabel(preview.firstDate ?? startDate, today),
            }),
      confirm: false,
      confirmLabel: null,
      saveLabel: t('rule.save'),
    }
  }

  const total = money(preview.totalCents)
  const first = preview.firstDate ?? startDate
  const last = preview.lastDate ?? first
  return {
    text:
      preview.count === 1
        ? t('rule.preview.back.one', { from: fullDayLabel(first, today), total })
        : t('rule.preview.back.other', {
            count: preview.count,
            range: dayRangeLabel(first, last, today),
            total,
          }),
    confirm: true,
    confirmLabel:
      preview.count === 1
        ? t('rule.confirm.one')
        : t('rule.confirm.other', { count: preview.count }),
    saveLabel:
      preview.count === 1
        ? t('rule.save.back.one', { total })
        : t('rule.save.back.other', { count: preview.count, total }),
  }
}
