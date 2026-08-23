/**
 * Tutto quello che la Home decide **prima** e **dopo** `computeBudgetMetrics`, e
 * che il dominio non puo' decidere al posto suo:
 *
 * - prima: quale periodo sta guardando, cioe' quale budget;
 * - dopo: che parole mettere intorno ai numeri, i due `null` compresi.
 *
 * Sono decisioni di presentazione, quindi stanno in `src/ui`. Sono in un modulo
 * senza DOM, quindi hanno un test.
 */

import { resolveBudget, totalSpent } from '../core/budget'
import type { BudgetMetrics } from '../core/budget'
import { addDays, isAfter } from '../core/date'
import type { IsoDate } from '../core/date'
import { formatCents } from '../core/money'
import type { Cents } from '../core/money'
import type { Budget, BudgetPeriod, Expense } from '../core/types'
import { daysLabel, fromDayLabel } from './labels'

/**
 * Il periodo che la Home mostra: **quello dell'ultimo budget impostato**.
 *
 * Non c'e' un campo in `Settings` che lo dica, e non e' una mancanza da
 * colmare: aggiungerlo significherebbe una migrazione di schema su dati veri
 * (vedi "Da qui in avanti i dati sono veri" in CLAUDE.md) per memorizzare
 * un'informazione che i budget gia' contengono. Impostare un budget mensile
 * **e'** dire "guardo il mese"; non serve dirlo due volte in due posti che poi
 * divergono.
 *
 * Settimanale e mensile possono essere aperti insieme — `planResolvedBudgetChange`
 * chiude solo i record dello stesso periodo — quindi la scelta dev'essere un
 * **ordine totale**, o la Home mostrerebbe un numero diverso a seconda di come
 * IndexedDB ha restituito i record: `effectiveFrom` piu' recente, poi
 * `updatedAt`, poi `id`.
 *
 * Senza nessun budget in vigore: settimanale. Una settimana e' l'orizzonte che
 * si controlla davvero stando in piedi davanti a una cassa, e "quanto posso
 * spendere oggi" diviso 30 giorni e' un numero che nessuno usa.
 */
export function activePeriod(budgets: readonly Budget[], onDay: IsoDate): BudgetPeriod {
  const weekly = resolveBudget(budgets, 'weekly', onDay)
  const monthly = resolveBudget(budgets, 'monthly', onDay)
  if (monthly === null) return 'weekly'
  if (weekly === null) return 'monthly'
  return newer(monthly, weekly) ? 'monthly' : 'weekly'
}

/**
 * "L'ultimo budget impostato" significa l'ultimo **impostato**, quindi a parita'
 * di `effectiveFrom` il confronto e' su `updatedAt`, non su `createdAt`.
 *
 * Non e' un dettaglio: `planResolvedBudgetChange`, quando si cambia idea due
 * volte nello stesso giorno, **aggiorna il record sul posto** conservando il suo
 * `createdAt` e toccando solo `updatedAt` — ed e' giusto cosi', un record che
 * vale da oggi resta lo stesso fatto datato. Con `createdAt` la sequenza
 * "200 a settimana, 800 al mese, 300 a settimana" lasciava la Home sul mese
 * mentre il toast diceva di aver salvato la settimana: l'app dichiarava una cosa
 * e ne mostrava un'altra, senza via d'uscita fino a mezzanotte.
 *
 * E' l'unico punto in cui questo ordinamento **diverge** da `prevails` in
 * `budget.ts`, che a parita' di giorno guarda `createdAt`: li' la domanda e'
 * un'altra — quale di due record sovrapposti della *stessa* chiave descrive il
 * giorno — e la risposta giusta e' il record nato per ultimo. Qui la domanda e'
 * "quale periodo sta guardando l'utente", e la risposta e' l'ultimo gesto.
 */
function newer(candidate: Budget, best: Budget): boolean {
  if (candidate.effectiveFrom !== best.effectiveFrom) {
    return candidate.effectiveFrom > best.effectiveFrom
  }
  if (candidate.updatedAt !== best.updatedAt) return candidate.updatedAt > best.updatedAt
  return candidate.id > best.id
}

/** L'importo del budget in vigore oggi per quel periodo, o `null`. */
export function currentBudgetCents(
  budgets: readonly Budget[],
  period: BudgetPeriod,
  onDay: IsoDate,
): number | null {
  return resolveBudget(budgets, period, onDay)?.amountCents ?? null
}

/* ------------------------------------------------------------------------- *
 * Le parole della Home.
 *
 * Stanno qui, in una funzione pura, e non dentro il JSX per una ragione sola:
 * i due `null` di `computeBudgetMetrics` — il passo del primo giorno e la
 * disponibilita' a periodo finito — sono i due casi che nessuno prova a mano, e
 * qui hanno un test. Nel JSX sarebbero due ternari che nessuno esegue mai.
 *
 * Regola di tono, che vale per ogni stringa di questo blocco: **sforare non e'
 * un errore, e' un'informazione** (CLAUDE.md). Niente punti esclamativi, niente
 * "attenzione", niente seconda persona accusatoria. Chi ha sforato lo sa gia'.
 * ------------------------------------------------------------------------- */


/** Un pezzo di frase. `strong` = un numero, che l'occhio deve trovare da solo. */
export interface Segment {
  readonly text: string
  readonly strong?: true
}

export interface HeroCopy {
  /** Cosa e' il numero grande. Una parola, sopra il numero. */
  readonly label: string
  readonly value: string
  readonly note: string
  readonly over: boolean
}

/**
 * Il numero grande.
 *
 * Senza budget non e' una schermata vuota: e' il totale del periodo, che l'app
 * conosce comunque. Una Home che dicesse "imposta un budget" e basta sarebbe
 * una schermata sprecata.
 *
 * ## Perche' il residuo resta **col segno**, anche sforato
 *
 * L'alternativa era mostrare `12,50 €` con l'etichetta "Oltre il budget": si
 * legge meglio, e per questo e' sbagliata. Spendendo, il numero scenderebbe
 * 20 -> 10 -> 0 e poi ricomincerebbe a **salire** 2 -> 12 -> 22. Un numero che
 * torna a crescere mentre si spende e' la cosa sbagliata da mettere davanti a
 * chi guarda lo schermo per mezzo secondo. Col segno il numero e' monotono: piu'
 * si spende, piu' scende, sempre.
 */
export function heroCopy(m: BudgetMetrics): HeroCopy {
  if (m.budgetCents === null || m.remainingCents === null) {
    return {
      label: 'Spesi',
      value: formatCents(m.spentCents),
      note: 'nessun budget impostato per questo periodo',
      over: false,
    }
  }
  return {
    label: 'Restano',
    value: formatCents(m.remainingCents),
    note: `di ${formatCents(m.budgetCents)} · ${formatCents(m.spentCents)} spesi`,
    over: m.remainingCents < 0,
  }
}

/** Quanto e' pieno il periodo, 0..1. Oltre il budget: pieno, non oltre il bordo. */
export function spentRatio(m: BudgetMetrics): number {
  if (m.budgetCents === null) return 0
  if (m.budgetCents <= 0) return m.spentCents > 0 ? 1 : 0
  return Math.max(0, Math.min(1, m.spentCents / m.budgetCents))
}

/* ------------------------------------------------------------------------- *
 * Il budget nato a periodo gia' cominciato (ADR 010).
 * ------------------------------------------------------------------------- */

export interface BudgetStart {
  /**
   * Il budget in vigore e' nato **dentro** questo periodo e prima non ce n'era
   * nessuno. E' l'unico caso in cui la Home ha qualcosa da spiegare: le spese
   * dei giorni precedenti contano contro un tetto che allora non esisteva.
   */
  readonly late: boolean
  /** Speso nel periodo **prima** che il budget esistesse. `0` se `late` e' falso. */
  readonly beforeCents: Cents
}

/**
 * Distingue le tre situazioni che ADR 010 tiene separate, usando i due campi che
 * `computeBudgetMetrics` espone apposta:
 *
 * - `budgetEffectiveFrom <= range.start` -> il budget copriva tutto il periodo:
 *   niente da dire, `late` e' falso;
 * - `> range.start` con `budgetCoveredPeriodStart === true` -> un budget c'era
 *   gia' il primo giorno e l'utente lo ha **cambiato** a meta' periodo: niente da
 *   dire, un residuo negativo e' un residuo negativo;
 * - `> range.start` con `budgetCoveredPeriodStart === false` -> **primo budget**,
 *   nato a periodo iniziato. Qui `late` e' vero e serve anche quanto era gia'
 *   uscito prima, che le metriche non riportano perche' `spentCents` e' del
 *   periodo intero.
 *
 * Niente pro-rata: nessuno dei numeri cambia (ADR 010). Questo e' solo il fatto
 * in piu' da raccontare.
 *
 * `expenses` sono quelle di cui la Home dispone gia'; il filtro per data e'
 * un'altra passata sullo stesso array, e gira solo nel periodo in cui il budget
 * e' nato — un periodo solo, una volta sola.
 */
export function budgetStart(m: BudgetMetrics, expenses: readonly Expense[]): BudgetStart {
  const from = m.budgetEffectiveFrom
  if (from === null || m.budgetCoveredPeriodStart || !isAfter(from, m.range.start)) {
    return { late: false, beforeCents: 0 }
  }
  return {
    late: true,
    beforeCents: totalSpent(expenses, { start: m.range.start, end: addDays(from, -1) }),
  }
}

/**
 * La riga che spiega un residuo che sembra uno sforamento e non lo e'.
 * `null` quando non c'e' niente da spiegare, che e' quasi sempre.
 *
 * Dura un periodo solo: dal successivo il budget copre il primo giorno, `late`
 * diventa falso e la frase sparisce da sola, senza che nessuno la spenga.
 */
export function startNote(m: BudgetMetrics, start: BudgetStart): string | null {
  if (!start.late || m.budgetEffectiveFrom === null) return null
  const since = `Budget attivo ${fromDayLabel(m.period, m.budgetEffectiveFrom)}`
  // Senza spese precedenti non c'e' nessun numero da giustificare: la mezza
  // frase in piu' direbbe "prima avevi gia' speso 0,00 €", cioe' niente.
  if (start.beforeCents === 0) return `${since}.`
  return `${since} · prima avevi già speso ${formatCents(start.beforeCents)}`
}

export interface AllowanceCopy {
  /** La riga piu' utile della schermata. */
  readonly main: string
  readonly sub: string
  readonly over: boolean
}

/**
 * "Puoi spendere ~X al giorno": rimanente diviso i giorni che restano, **gia'
 * calcolato**. E' il numero per cui si apre l'app quando non si sta pagando.
 *
 * I due casi in cui `dailyAllowanceCents` e' `null` non diventano un trattino:
 *
 * - **residuo negativo** (`divideCents` arrotonda verso il basso, quindi qui
 *   darebbe un numero negativo "da recuperare": ma le spese non si disfano, e
 *   un tetto giornaliero negativo non e' una cosa che si possa fare). Si dice
 *   che il budget e' finito e quanti giorni mancano, senza aggiungere altro;
 * - **periodo finito** (`daysRemaining === 0`): dalla Home non e' raggiungibile,
 *   perche' il periodo si calcola sempre intorno a oggi e oggi e' sempre dentro.
 *   Resta scritto lo stesso: e' un ramo che una schermata futura (un periodo
 *   passato, un archivio) raggiungera' senza accorgersene.
 *
 * ## Il terzo caso: `dailyAllowanceCents === 0`
 *
 * Con un residuo fra 0 e `giorni - 1` centesimi `divideCents` da' 0 mentre
 * `remainingCents` e' ancora positivo, quindi nessuno dei due rami sopra
 * scattava: la riga piu' importante dell'app diceva `~0,00 € al giorno` nel
 * colore normale, come se andasse tutto bene. Vale lo stesso per il residuo
 * esatto a zero. Il messaggio si aggancia al numero che l'utente legge — la
 * disponibilita' — non al segno del residuo.
 *
 * ## Il quarto: il periodo era gia' iniziato (ADR 010)
 *
 * Se il residuo e' negativo **solo** perche' il budget e' nato a periodo
 * cominciato — cioe' se togliendo le spese di prima ne resterebbe — la frase non
 * e' "il budget e' finito", che sarebbe un rimprovero per una regola che non
 * esisteva. E' il fatto: il periodo era gia' iniziato, il budget vale pieno dal
 * prossimo. Tono neutro, quindi `over: false`: l'ambra dice "hai sforato", e qui
 * nessuno ha sforato. Il numero grande resta col segno e resta ambra, perche'
 * quello e' il residuo del periodo e ADR 010 non lo tocca.
 */
export function allowanceCopy(m: BudgetMetrics, start: BudgetStart): AllowanceCopy {
  if (m.daysRemaining === 0) {
    return { main: 'Questo periodo è chiuso.', sub: 'Il prossimo riparte da capo.', over: false }
  }
  const daily = m.dailyAllowanceCents
  const exhausted = daily === null || daily === 0 || m.remainingCents === null || m.remainingCents < 0
  // "Solo perche'": senza le spese fatte prima del budget ne resterebbe ancora.
  // Se non resterebbe, il periodo iniziato non e' piu' la spiegazione e la
  // frase tornerebbe a essere una scusa.
  if (
    exhausted &&
    start.late &&
    m.remainingCents !== null &&
    m.remainingCents + start.beforeCents > 0
  ) {
    return {
      main:
        m.period === 'weekly'
          ? 'Questa settimana era già iniziata.'
          : 'Questo mese era già iniziato.',
      sub: `Il budget vale pieno ${fromDayLabel(m.period, addDays(m.range.end, 1))}.`,
      over: false,
    }
  }
  if (exhausted) {
    return {
      main: 'Il budget del periodo è finito.',
      sub: `Restano ${daysLabel(m.daysRemaining)}: quello che spendi da qui è in più.`,
      over: true,
    }
  }
  return {
    main: `Puoi spendere ~${formatCents(daily)} al giorno`,
    sub:
      m.daysRemaining === 1
        ? 'per oggi, che è l’ultimo giorno del periodo'
        : `per i ${daysLabel(m.daysRemaining)} che restano, oggi compreso`,
    over: false,
  }
}

/**
 * Passo attuale contro passo sostenibile.
 *
 * `currentPaceCents` e' `null` il primo giorno del periodo, e la ragione la dice
 * `budget.ts`: una media su un giorno appena iniziato non e' un passo, e'
 * l'importo dell'ultima spesa. Quel caso qui diventa una frase che spiega
 * perche' non c'e' il numero, invece di un trattino che sembra un guasto.
 *
 * Senza budget il passo esiste comunque, e si dice: e' l'unica cosa vera che si
 * puo' dire a chi non ha ancora un budget, ed e' anche l'argomento migliore per
 * impostarne uno.
 */
export function paceParts(m: BudgetMetrics): readonly Segment[] {
  // Prima ancora del primo giorno: senza spese il passo sarebbe `0,00 € al
  // giorno`, cioe' un numero vero e inutile. Si dice il fatto invece del numero.
  if (m.spentCents === 0) {
    return [{ text: 'Nessuna spesa in questo periodo, per ora.' }]
  }
  if (m.currentPaceCents === null) {
    return [{ text: 'È il primo giorno del periodo: la media di oggi non è ancora un passo.' }]
  }
  const now: Segment = { text: formatCents(m.currentPaceCents), strong: true }
  if (m.sustainablePaceCents === null) {
    return [{ text: 'Finora stai spendendo ' }, now, { text: ' al giorno.' }]
  }
  // Il verdetto in testa, non in fondo: e' la prima parola che si legge, e su
  // due righe di testo grigio e' l'unica che si legge sempre. "Sopra ritmo" non
  // e' un rimprovero, e' dove sei — infatti la frase che segue e' identica.
  const verdict = m.currentPaceCents > m.sustainablePaceCents ? 'Sopra ritmo: ' : 'Sotto ritmo: '
  return [
    { text: verdict },
    now,
    { text: ' al giorno contro ' },
    { text: formatCents(m.sustainablePaceCents), strong: true },
    { text: ' sostenibili.' },
  ]
}
