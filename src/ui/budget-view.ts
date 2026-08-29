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

import { budgetSpent, resolveBudget } from '../core/budget'
import type { BudgetMetrics } from '../core/budget'
import { addDays, isAfter } from '../core/date'
import type { IsoDate } from '../core/date'
import type { Cents } from '../core/money'
import type { Budget, BudgetPeriod, Expense } from '../core/types'
import { daysLabel, fromDayLabel, money, t } from './i18n'

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
 *
 * Le stringhe non sono piu' qui: stanno in `src/ui/i18n`, e queste funzioni le
 * chiedono con `t()`. Il modulo resta senza DOM e resta testabile in node —
 * cambia solo che il test dichiara la lingua invece di ereditarla, il che e' un
 * miglioramento: prima l'italiano era implicito e nessuno lo sapeva.
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
  /**
   * **Cosa non c'e' dentro il numero grande**: le spese fisse del periodo
   * (ADR 016 §2). `null` quando non ce n'e' nessuna.
   *
   * Non e' un dettaglio in piu': `spentCents` e `remainingCents` escludono le
   * ricorrenti, e **un'esclusione taciuta e' un numero che mente per
   * omissione**. E' la stessa famiglia dell'indicatore di backup che tace a
   * torto — con la differenza che qui il numero e' persino giusto: e' giusto
   * solo se si sa cosa non conta.
   *
   * `null` e non stringa vuota, e non e' pignoleria: la riga esiste **solo**
   * quando `recurringSpentCents` non e' zero, cioe' quando in questo periodo
   * una regola e' davvero scattata. Annunciare "oltre alle spese fisse" dove le
   * fisse non hanno tolto niente e' esattamente il difetto per cui `startNote`
   * ha smesso di spiegare un numero normale.
   */
  readonly fixed: string | null
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
  // Vale per **tutti e due** i rami, budget o non budget: senza budget il
  // numero grande e' `spentCents`, che le fisse le esclude allo stesso modo.
  // Una riga attaccata al solo ramo col budget avrebbe lasciato senza
  // dichiarazione proprio chi non ha ancora un tetto — cioe' chi ha meno
  // strumenti per accorgersi che manca qualcosa.
  const fixed = m.recurringSpentCents === 0 ? null : t('hero.fixed', { amount: money(m.recurringSpentCents) })
  if (m.budgetCents === null || m.remainingCents === null) {
    return {
      label: t('hero.spent'),
      value: money(m.spentCents),
      note: t('hero.noBudget'),
      fixed,
      over: false,
    }
  }
  const over = m.remainingCents < 0
  return {
    // **La parola segue il segno.** `over` era gia' calcolato e guidava il
    // colore (`data-tone`) senza toccare l'etichetta: "Restano −88,00 €" e' una
    // contraddizione, ed e' vissuta dalla fase 4 perche' il fatto c'era ed era
    // usato per la decorazione invece che per la frase.
    //
    // Il numero **non** perde il segno per farlo: l'argomento sopra questa
    // funzione — un residuo che ricomincia a salire mentre si spende — vale
    // identico adesso. Cambia solo cio' che lo nomina.
    label: t(over ? 'hero.over' : 'hero.remaining'),
    value: money(m.remainingCents),
    note: t('hero.note', { budget: money(m.budgetCents), spent: money(m.spentCents) }),
    fixed,
    over,
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
    beforeCents: budgetSpent(expenses, { start: m.range.start, end: addDays(from, -1) }),
  }
}

/**
 * La riga che spiega un residuo che sembra uno sforamento e non lo e'.
 * `null` quando non c'e' niente da spiegare, che e' quasi sempre.
 *
 * Dura un periodo solo: dal successivo il budget copre il primo giorno, `late`
 * diventa falso e la frase sparisce da sola, senza che nessuno la spenga.
 *
 * ## Senza spese anteriori la frase non compare affatto
 *
 * Prima diceva "Budget attivo da domenica." anche quando **tutte** le spese del
 * periodo erano gia' dentro la copertura del budget — cioe' quando non c'era
 * niente di anomalo da spiegare. Visto sul dispositivo: la riga comparve su una
 * Home che tornava perfettamente, e una spiegazione senza un fatto da spiegare
 * si legge come l'annuncio di un problema. **E' il difetto opposto a quello per
 * cui ADR 010 l'ha introdotta**: li' la Home non sapeva giustificare un numero
 * strano, qui insinuava che un numero normale non lo fosse.
 *
 * La condizione e' quella che `budgetStart` calcola gia': esiste spesa anteriore
 * a `effectiveFrom`. Se `beforeCents` e' zero, non c'e' nessun numero da
 * giustificare e non si dice niente.
 */
export function startNote(m: BudgetMetrics, start: BudgetStart): string | null {
  if (!start.late || m.budgetEffectiveFrom === null || start.beforeCents === 0) return null
  return t('startNote', {
    from: fromDayLabel(m.period, m.budgetEffectiveFrom),
    amount: money(start.beforeCents),
  })
}

export interface AllowanceCopy {
  /**
   * **Il livello 3 della Home: una riga sola, e l'unica azionabile.**
   *
   * Erano due — `main` in 20px e `sub` in 13px — e la seconda non aggiungeva un
   * fatto: lo riformulava. `Il budget del periodo e' finito.` sopra
   * `Restano 2 giorni: quello che spendi da qui e' in piu'.` sono due frasi per
   * cio' che il numero grande, negativo e ambra, ha gia' detto due volte.
   *
   * **Una stringa e non pezzi**, a differenza di `paceParts`: li' il grassetto
   * serve perche' la frase e' muta e i numeri devono staccarsi da lei. Qui la
   * riga e' gia' tutta in 20px semibold sul colore del testo — e' *la* riga
   * della schermata dopo il numero grande — quindi un grassetto dentro un
   * grassetto non distinguerebbe niente, e spezzare la frase in quattro chiavi
   * per ottenerlo la renderebbe solo piu' difficile da tradurre.
   */
  readonly text: string
  readonly over: boolean
}

/**
 * Quanto si puo' spendere, in **una riga**.
 *
 * "Puoi spendere ~X al giorno": rimanente diviso i giorni che restano, **gia'
 * calcolato**. E' il numero per cui si apre l'app quando non si sta pagando.
 *
 * ## Perche' i giorni sono dentro questa riga e non sotto
 *
 * Perche' erano l'unica cosa che il sottotitolo aggiungeva davvero (*"per i 2
 * che restano, oggi compreso"*), e un fatto che serve non si toglie: si cuce
 * dentro la frase che lo reggeva. Il resto del sottotitolo — *"domani riparte
 * da capo"*, *"quello che spendi da qui e' in piu'"* — era parafrasi.
 *
 * I due casi in cui `dailyAllowanceCents` e' `null` non diventano un trattino:
 *
 * - **residuo negativo** (`divideCents` arrotonda verso il basso, quindi qui
 *   darebbe un numero negativo "da recuperare": ma le spese non si disfano, e
 *   un tetto giornaliero negativo non e' una cosa che si possa fare). Al suo
 *   posto va il **passo**, che e' l'unico numero ancora azionabile quando non
 *   c'e' piu' niente da spendere;
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
 *
 * ## Perche' qui ci sono al massimo **due** velocita' al giorno, e non tre
 *
 * La schermata ne aveva tre insieme: la disponibilita' (`~44,00 €`), il passo
 * tenuto (`18,66 €`) e il passo sostenibile (`28,57 €`). Tre numeri con la
 * stessa unita' e tre significati diversi, a due righe di distanza: per sapere
 * quale sia quale bisogna rileggere, e chi guarda per mezzo secondo non
 * rilegge.
 *
 * La divisione e' per **stato**, non per gusto:
 *
 * - finche' resta qualcosa, l'unico numero che serve e' **quanto si puo'
 *   spendere**. Il passo tenuto e quello sostenibile rispondono a una domanda
 *   che la disponibilita' ha gia' chiuso;
 * - quando non resta niente, la disponibilita' **non esiste** (sarebbe
 *   negativa), e allora i due numeri utili sono il passo tenuto e quello
 *   sostenibile — che dicono di quanto si sta andando oltre.
 *
 * In nessuno dei due stati ce ne sono tre.
 */
export function allowanceCopy(m: BudgetMetrics, start: BudgetStart): AllowanceCopy {
  if (m.daysRemaining === 0) {
    return { text: t('allowance.closed'), over: false }
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
      text: t(m.period === 'weekly' ? 'allowance.late.weekly' : 'allowance.late.monthly', {
        from: fromDayLabel(m.period, addDays(m.range.end, 1)),
      }),
      over: false,
    }
  }
  if (exhausted) {
    const days = daysLabel(m.daysRemaining)
    // Il primo giorno del periodo non c'e' nessun passo da confrontare
    // (`currentPaceCents` e' `null`: una media su un giorno appena iniziato e'
    // l'ultima spesa, non un passo — vedi `budget.ts`). Restano i giorni, da
    // soli. **E' uno stato raggiungibile**, non un ramo teorico: basta spendere
    // in un giorno piu' del budget dell'intera settimana.
    if (m.currentPaceCents === null || m.sustainablePaceCents === null) {
      return { text: t('allowance.left', { days }), over: true }
    }
    // I giorni **davanti**, perche' sono la cosa su cui si puo' ancora
    // decidere; i due passi dietro, perche' dicono di quanto si sta andando
    // oltre. Non c'e' nessun verdetto in testa ("Sopra ritmo:"): lo dicono i
    // due numeri accostati, e lo hanno gia' detto il segno e il colore del
    // numero grande.
    return {
      text: t('allowance.over', {
        days,
        pace: money(m.currentPaceCents),
        sustainable: money(m.sustainablePaceCents),
      }),
      over: true,
    }
  }
  // L'ultimo giorno **non e' un ritmo: e' un totale**. Con un giorno solo la
  // divisione e' per uno, quindi il numero non e' una media di niente — e' tutto
  // il residuo, disponibile adesso. La tilde esiste per dire "e' una media"
  // (l'arrotondamento al centesimo verso il basso): qui mentirebbe, e "al
  // giorno" mentirebbe due volte, perche' i giorni sono uno.
  //
  // Visto sul dispositivo nella sua forma peggiore: la riga grande diceva
  // "Puoi spendere ~128,55 € al giorno" e il sottotitolo la smentiva subito con
  // "per oggi, che e' l'ultimo giorno". Due frasi che si contraddicono nello
  // spazio di due righe. Adesso la riga e' una sola e il caso ha una frase sua.
  if (m.daysRemaining === 1) {
    return { text: t('allowance.last', { amount: money(daily) }), over: false }
  }
  return {
    text: t('allowance.main', { amount: money(daily), days: daysLabel(m.daysRemaining) }),
    over: false,
  }
}

/**
 * Il passo tenuto finora, **e solo dove non c'e' un budget**.
 *
 * `currentPaceCents` e' `null` il primo giorno del periodo, e la ragione la dice
 * `budget.ts`: una media su un giorno appena iniziato non e' un passo, e'
 * l'importo dell'ultima spesa. Quel caso qui diventa una frase che spiega
 * perche' non c'e' il numero, invece di un trattino che sembra un guasto.
 *
 * Senza budget il passo esiste comunque, e si dice: e' l'unica cosa vera che si
 * puo' dire a chi non ha ancora un budget, ed e' anche l'argomento migliore per
 * impostarne uno.
 *
 * ## Il confronto col sostenibile non e' piu' qui, e non e' un taglio
 *
 * `sustainablePaceCents` e' `budget / giorni`, quindi **e' `null` esattamente
 * quando questa funzione e' l'unica cosa a schermo**: il ramo del verdetto
 * ("Sopra ritmo: X contro Y sostenibili") era raggiungibile **solo** con un
 * budget, cioe' nell'unico stato in cui la Home mostrava gia' la
 * disponibilita' al giorno. Erano tre velocita' insieme.
 *
 * Adesso quel confronto vive in `allowanceCopy`, nello stato in cui e' l'unico
 * numero rimasto — sforato — e qui resta cio' che serve a chi un tetto non ce
 * l'ha. La condizione e' scritta nel tipo: con `sustainablePaceCents === null`
 * il verdetto non aveva niente contro cui misurare, e senza budget non ce l'ha
 * mai.
 */
export function paceParts(m: BudgetMetrics): readonly Segment[] {
  // Prima ancora del primo giorno: senza spese il passo sarebbe `0,00 € al
  // giorno`, cioe' un numero vero e inutile. Si dice il fatto invece del numero.
  if (m.spentCents === 0) {
    return [{ text: t('pace.none') }]
  }
  if (m.currentPaceCents === null) {
    return [{ text: t('pace.firstDay') }]
  }
  return [
    { text: t('pace.soFar.before') },
    { text: money(m.currentPaceCents), strong: true },
    { text: t('pace.soFar.after') },
  ]
}
