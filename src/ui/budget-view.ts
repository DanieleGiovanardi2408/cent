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

import { budgetSpent, countsTowardBudget, resolveBudget } from '../core/budget'
import type { BudgetMetrics } from '../core/budget'
import { addDays, daysBetween, isAfter, isBefore, startOfWeek } from '../core/date'
import type { IsoDate } from '../core/date'
import { sumCents } from '../core/money'
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

/*
 * **`spentRatio` non c'e' piu', ed e' uscita col suo ultimo lettore.**
 *
 * Diceva *"quanto e' pieno il periodo, 0..1; oltre il budget pieno, non oltre il
 * bordo"*, e la leggeva la barra della Home. La barra e' stata tolta perche' oltre
 * il budget era **al 100% sempre**, qualunque fosse lo sforamento: una marca che
 * ha lo stesso aspetto in tutto un ramo non e' un grafico. E sotto il budget
 * misurava `speso / budget`, che la schermata dice gia' col numero, con
 * l'etichetta e con la nota — il suo `aria-label` **era letteralmente** la frase
 * stampata venti pixel sopra.
 *
 * ## Perche' la funzione se n'e' andata con lei, e non e' zelo
 *
 * Restava con **zero chiamanti di produzione e quattro asserzioni che la tenevano
 * viva**. E' la forma esatta di `expensesInRange` e `planBudgetChange`, cancellate
 * da questo repository per la stessa ragione: un'API pubblica di dominio senza
 * chiamanti e' una superficie che qualcuno usera' per sbaglio, e i test che la
 * chiamano non sono una prova che serva — sono cio' che la fa **sembrare** viva.
 *
 * E' il precedente applicato una **terza** volta. Non ha eccezioni.
 *
 * ## La condizione, se qualcuno la rivolesse
 *
 * Torna il giorno in cui la Home mostra **quanto** si e' sforato invece che *se*.
 * Quel disegno pero' non e' questa funzione: richiede di riscalare la traccia su
 * `max(budget, speso)`, cioe' di **accorciare la rotaia del budget**, che e'
 * esattamente l'argomento per cui `.stat__unlived` fu cancellata. Chi lo riapre
 * riapre quello, non questo `clamp`.
 */

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

/* ------------------------------------------------------------------------- *
 * La striscia dei sette giorni.
 *
 * Sette colonne, **lunedi' -> domenica**, con la linea del passo sostenibile
 * attraverso. Risponde a una domanda che nessun'altra parte della Home fa: **in
 * quale giorno parte la mano.**
 *
 * ## Perche' questo andamento e non un altro
 *
 * Perche' **ha sette punti gia' oggi**. L'andamento per settimane (B delle
 * Statistiche) ne ha due dopo due settimane e per un mese resta cosi': una
 * finestra di otto caselle con sei vuote non e' un andamento, e' l'annuncio di
 * un andamento futuro. Sette giorni ce li ha chiunque abbia installato l'app
 * lunedi'.
 *
 * ## Sta qui e non in `stats-view.ts`
 *
 * Perche' e' la Home a leggerla, e la Home legge di qui. Ma anche perche' e' un
 * modello **del budget**: conta cio' che il budget conta (ADR 016) e si legge
 * contro il passo sostenibile, che e' un numero del budget. Le Statistiche
 * mostrano tutto, e mescolare le due unita' e' esattamente cio' che ADR 016
 * vieta.
 *
 * ## Il pavimento **non e' quello di `stats-view.ts`**, ed e' ri-derivato
 *
 * `BAR_MIN_FRACTION` vale `2 / 112` perche' li' la dimensione che porta il
 * valore e' la **larghezza**: 2 px sono i due bordi di `.stat__bar` sotto
 * `border-box` (un floor geometrico, il box non puo' essere piu' stretto) e 112
 * px sono `--plot-min`, la colonna piu' stretta.
 *
 * Qui la dimensione che porta il valore e' l'**altezza**, la larghezza e' fissa,
 * e nessuno dei due numeri si eredita:
 *
 * - **il numeratore non e' geometrico, e' percettivo.** Non so se la colonna
 *   avra' un bordo, e non e' quello che decide: sette colonne su una base comune
 *   si leggono per **quanto sono alte**, e sotto i 2 px una colonna presente non
 *   si distingue dalla base su cui poggia. Il difetto che il pavimento esiste
 *   per impedire e' quindi **piu' grave** che nelle Statistiche: li' due importi
 *   diversi si dipingevano uguali, qui **un giorno in cui si e' speso si dipinge
 *   come un giorno in cui non si e' speso** — cioe' la striscia direbbe una cosa
 *   falsa proprio sulla domanda per cui esiste;
 * - **il denominatore e' l'altezza della striscia, e va presa la piu' bassa.**
 *   Il pavimento e' una garanzia: su una striscia piu' alta la colonna minima e'
 *   proporzionalmente piu' alta, mai piu' bassa. E' l'unico pezzo di argomento
 *   che si trasporta identico dall'asse orizzontale, e vale qui perche' vale la
 *   stessa condizione: la frazione e' relativa, il pixel no.
 *
 * ### Il numero che non ho: `--strip-h`
 *
 * `STRIP_MIN_PX` **non e' letto da Home.css**, perche' quando questo modulo e'
 * stato scritto la striscia nel CSS non esisteva ancora. E' scritto come
 * **contratto**: la striscia non scende sotto 3rem. Nella direzione sbagliata
 * (striscia piu' bassa) il pavimento diventa troppo corto e il difetto torna;
 * nella direzione giusta (striscia piu' alta) e' una sovrastima innocua, come lo
 * e' `BAR_MIN_FRACTION` su un viewport largo.
 *
 * Il legame va **misurato** come lo e' quello di `--plot-min` in
 * `statistiche.spec.ts`: risolvere `--strip-h` dalla pagina, leggere la colonna
 * piu' corta davvero dipinta e confrontarla con questa costante. Finche' quella
 * misura non esiste, il contratto e' scritto e non sorvegliato — ed e' il solo
 * numero di questo blocco che non viene da un fatto verificato.
 * ------------------------------------------------------------------------- */

/**
 * L'inchiostro minimo di una colonna, in pixel: **sotto questa altezza un
 * giorno in cui si e' speso si legge come un giorno vuoto.**
 *
 * Non e' il `2` di `BAR_MIN_FRACTION`, che e' la somma di due bordi sotto
 * `border-box`. E' la piu' corta colonna che si distingue dalla base su cui
 * poggia — e coincide col numero solo per caso.
 */
const COLUMN_MIN_INK_PX = 2

/**
 * L'altezza piu' bassa che la striscia puo' avere, in pixel a `rem` = 16.
 *
 * **E' un contratto sul CSS, non una lettura del CSS**: quando questa costante e'
 * stata scritta la striscia non era ancora disegnata. Chi scrive `--strip-h` piu'
 * basso di `3rem` deve cambiare anche questo numero, o le colonne piu' corte
 * tornano invisibili.
 */
const STRIP_MIN_PX = 48

/**
 * Il pavimento di una colonna, come frazione dell'altezza della striscia.
 * `2 / 48`, cioe' `1/24`.
 *
 * La **forma** e' la stessa di `BAR_MIN_FRACTION` — si trasla, non si taglia —
 * e la ragione vale identica qui: una soglia dura (`max(f, MIN)`) rimetterebbe
 * il difetto, perche' due giorni diversi entrambi sotto soglia tornerebbero alti
 * uguali. Con la traslazione `f -> MIN + (1 - MIN) · f`:
 *
 * - **zero resta zero**, unica discontinuita': un giorno senza spese non prende
 *   inchiostro. E' la meta' dell'argomento che rende leggibile l'altra;
 * - la mappa e' strettamente crescente, quindi due giorni che differiscono di un
 *   centesimo hanno due altezze diverse;
 * - **la colonna piu' alta vale esattamente 1**, in virgola mobile: per ogni
 *   `MIN` rappresentabile in `(0, 1)`, `MIN + (1 - MIN)` arrotonda a 1.
 */
export const COLUMN_MIN_FRACTION = COLUMN_MIN_INK_PX / STRIP_MIN_PX

/** Giorni in una striscia. Sette, sempre: e' una settimana. */
const STRIP_DAYS = 7

export interface DayBar {
  readonly date: IsoDate
  /**
   * Speso in quel giorno **secondo il budget**: vive, ricorrenti escluse
   * (ADR 016). E' la stessa moneta di `BudgetMetrics.spentCents`, quindi su un
   * periodo settimanale le sette colonne sommano esattamente al numero grande
   * della Home.
   */
  readonly cents: Cents
  /** 0..1 sulla scala della striscia. Zero resta zero, il resto parte da `COLUMN_MIN_FRACTION`. */
  readonly fraction: number
  /** Il giorno **non e' ancora finito**: oggi. Esattamente uno dei sette. */
  readonly current: boolean
  /** Il giorno **non e' ancora arrivato**. Un giorno futuro non e' un giorno da zero euro. */
  readonly future: boolean
}

export interface Week {
  /** Sette, lunedi' -> domenica, sempre. */
  readonly days: readonly DayBar[]
  /**
   * Quanto vale una colonna piena. Si scrive, come `BreakdownSection.scaleCents`
   * nelle Statistiche, e per la stessa ragione: una lunghezza senza la sua unita'
   * di misura e' un disegno che non si puo' leggere.
   */
  readonly scaleCents: Cents
  /**
   * La linea del passo sostenibile, `null` senza budget.
   *
   * `fraction` passa per **la stessa mappa** delle colonne, e non e' pignoleria:
   * una lunghezza mappata accanto a una non mappata e' un confronto falsato di
   * `COLUMN_MIN_FRACTION`, cioe' **una colonna che supera la propria linea nel
   * giorno in cui si e' speso esattamente il sostenibile**. E' lo stesso difetto
   * che `stats-view.ts` chiude fra la barra e la traccia; vale qui perche' vale
   * la stessa condizione — colonna e linea si leggono l'una contro l'altra, sullo
   * stesso asse e sulla stessa scala.
   *
   * ## La linea **non** e' condizionata a `comparableToBudget`, e la ragione
   *
   * B delle Statistiche disegna la traccia del budget **se e solo se** un unico
   * record ha coperto il periodo intero, perche' li' la traccia dice *"il budget
   * di quel periodo era X"* — un'affermazione sul passato, falsa se il budget e'
   * nato a meta'. Quell'argomento **non si trapianta**, e si vede provando a
   * riscriverne la condizione qui:
   *
   * - la traccia di B confronta **un totale di periodo** con un tetto di
   *   periodo, quindi la copertura parziale falsa il confronto per accumulo.
   *   Qui ogni colonna e' **un giorno**, e il confronto e' con un passo **al
   *   giorno**: non si accumula niente;
   * - `comparableToBudget` e' calcolato su `m.range`, che con un budget mensile
   *   e' **il mese**. Applicarlo a una finestra di sette giorni sarebbe una
   *   condizione valutata sulla finestra sbagliata — l'argomento non e' nemmeno
   *   esprimibile senza ricalcolarlo, e ricalcolarlo vorrebbe dire deciderlo di
   *   nuovo, non ereditarlo.
   *
   * Cio' che la linea afferma e' quindi: **il passo che il budget di oggi
   * implica**. E' un riferimento, non un verdetto sui giorni gia' passati — ed e'
   * lo stesso numero che la Home scrive gia' a parole quando si sfora, quindi non
   * afferma niente che l'utente non possa riconciliare con lo schermo.
   *
   * Il limite che resta, e va detto: un giorno **precedente** al primo budget
   * (ADR 010) si legge contro una linea che allora non c'era. La striscia non lo
   * marca. Il fatto lo racconta gia' `startNote`, per il periodo intero e a
   * parole; una marca per giorno sarebbe un campo in piu' e un ramo di disegno in
   * piu' per un periodo solo nella vita di un utente.
   *
   * ## Il degenere: `cents` zero
   *
   * `sustainablePaceCents` e' `divideCents(budget, giorni)`, che arrotonda verso
   * il basso: un budget da 0,05 € a settimana da' **zero**. La linea esiste
   * (un budget c'e') e si posa sulla base, perche' `columnHeight(0)` e' zero e
   * zero resta zero. E' vero: il passo sostenibile di quel budget e' 0,00 € al
   * giorno.
   */
  readonly sustainable: { readonly cents: Cents; readonly fraction: number } | null
  /**
   * Il giorno da etichettare: il piu' alto. A parita' il **primo**, perche' la
   * domanda e' quando parte la mano, non quando si ferma.
   *
   * **`null` a settimana vuota**, da quando la striscia resta anche li'. Non e'
   * "un giorno a zero": e' l'assenza di un giorno da nominare, e il componente
   * non etichetta niente. Il contratto diceva "non e' annullabile" perche'
   * quel caso non arrivava — `weekStrip` usciva prima — e adesso arriva.
   */
  readonly peak: IsoDate | null
}

/** Quota grezza di un importo sulla scala, con `scale <= 0` che non divide per zero. */
function columnShare(value: Cents, scale: Cents): number {
  return scale <= 0 ? 0 : value / scale
}

/** L'altezza dipinta di una quota: zero resta zero, tutto il resto parte dal pavimento. */
function columnHeight(quota: number): number {
  return quota <= 0 ? 0 : COLUMN_MIN_FRACTION + (1 - COLUMN_MIN_FRACTION) * quota
}

/**
 * La striscia della settimana che contiene `today`, o `null` quando non c'e'
 * niente da disegnare.
 *
 * ## Quali spese conta: le stesse del budget
 *
 * `countsTowardBudget` — vive, **ricorrenti escluse** (ADR 016). Non e' una
 * scelta ripetuta per simmetria: la linea viene da `sustainablePaceCents`, che e'
 * `budget / giorni`, e il budget le fisse le esclude. Una colonna che comprendesse
 * l'affitto contro una linea che non lo comprende metterebbe **due unita' di
 * misura sullo stesso asse**, e il giorno dell'affitto leggerebbe "disastro" per
 * costruzione. E' l'argomento con cui B delle Statistiche esclude le ricorrenti,
 * e vale qui perche' qui c'e' la stessa linea contro cui leggere.
 *
 * Coerente con il resto di questo modulo: `budgetStart` somma con `budgetSpent`,
 * `heroCopy` legge `spentCents`. Nessuno di questi conta le ricorrenti, e
 * `recurringSpentCents` esiste apposta perche' l'esclusione si possa **dire**
 * invece che subire. Le fisse non spariscono: le mostrano Storico e Statistiche.
 *
 * ## La settimana e' quella di `today`, anche con un budget mensile
 *
 * `startOfWeek(today)`, non `m.range.start`: con un budget mensile il periodo e'
 * il mese, e sette colonne di un mese non sono niente. La linea resta leggibile
 * perche' `sustainablePaceCents` e' **al giorno** in tutti e due i periodi.
 *
 * Il limite, dichiarato: con un budget mensile la settimana puo' cadere a cavallo
 * di due mesi, e la linea e' quella del budget **di oggi**, non quella che valeva
 * nei giorni del mese precedente. Non e' un numero inverificabile — e' lo stesso
 * passo sostenibile che la Home scrive quando si sfora — ma non e' una linea
 * storicizzata, e non finge di esserlo.
 *
 * ## `null` quando **nessun giorno ha un importo positivo**
 *
 * Non "zero spese": zero **da disegnare**. I due criteri divergono su una
 * settimana le cui uniche spese contate valgono `0,00 €` — e li' il criterio sul
 * conteggio produrrebbe **sette colonne vuote piu' una linea**, cioe' esattamente
 * la striscia che non deve esistere: `columnHeight(0)` e' `0`, quindi quei giorni
 * non prendono inchiostro comunque. Disegnare il telaio di un grafico i cui dati
 * sono tutti a zero non informa, occupa.
 *
 * Chi scrive una spesa da zero centesimi: **l'import** (`parseBackup` accetta
 * qualunque intero sicuro, zero e negativi compresi) e la ricorrente degenere a
 * zero centesimi, che pero' qui e' gia' fuori perche' e' ricorrente. Il tastierino
 * non conferma a zero. Il criterio copre tutti e tre senza nominarli: se non c'e'
 * un importo positivo, non c'e' una colonna.
 *
 * ## Un giorno futuro ha una `fraction`, e vale zero perche' e' vuoto
 *
 * Non perche' e' futuro. La distinzione la porta `future`, che e' un campo
 * apposta: `0` e "non ancora arrivato" sono due cose diverse a schermo, e chi
 * disegna deve poterle separare senza dedurle.
 *
 * Il conto e' quindi lo stesso di ogni altro giorno, e la ragione e' che le spese
 * datate in avanti **esistono**. Non le scrive nessuna schermata — `AddSheet`
 * limita il selettore a `max={day}`, `updateExpense` dalla UI riscrive solo
 * `amountCents`, la materializzazione si ferma a `today` — e i due scrittori sono
 * fuori dall'app: `parseBackup`, e **l'orologio del dispositivo che torna
 * indietro**. Sono gli stessi due che `stats-view.ts` enumera per il proprio ramo
 * vuoto.
 *
 * Contarle non e' un capriccio: `spentCents` le conta gia' (`inRange` guarda la
 * data, non l'orologio), quindi zerarle qui farebbe **sette colonne che non
 * sommano al numero grande scritto sopra di loro**, nella stessa schermata.
 */
export function weekStrip(
  m: BudgetMetrics,
  expenses: readonly Expense[],
  today: IsoDate,
): Week | null {
  const start = startOfWeek(today)
  const end = addDays(start, STRIP_DAYS - 1)

  /*
   * ## Il confine sulle stringhe e' una **corsia veloce**, non la guardia
   *
   * A tenere fuori dalle colonne le spese fuori settimana sono i **limiti
   * dell'array**: `daysBetween` da' `-1` per la domenica prima e `7` per il
   * lunedi' dopo, e `buckets[-1]` e `buckets[7]` sono `undefined`, quindi
   * `?.push` non fa niente.
   *
   * **Provato disfacendo**: togliendo il confine — l'uno, l'altro o tutti e due
   * — i test restano verdi, ed e' giusto che restino. Non e' una lacuna della
   * suite: e' che quella riga cambia **quanto lavoro si fa**, non il risultato.
   * Sta qui perche' `toEpochDay` valida con una regex e tre `Number(slice)`, e
   * su 5.000 spese sarebbe pagato per intero a ogni ricalcolo; `isBefore` e
   * `isAfter` passano da `compareIsoDates`, che confronta le stringhe e basta.
   *
   * Cio' che il confine **non** e': una difesa contro una data corrotta. Una
   * stringa spazzatura che ordini *dentro* la settimana arriva lo stesso a
   * `daysBetween`, che lancia. Nessuno la scrive — `parseBackup` valida con
   * `isIsoDate` e le schermate scrivono date costruite — e dichiararlo qui vale
   * piu' di un test su un caso che nessuno produce.
   */
  const buckets: Cents[][] = Array.from({ length: STRIP_DAYS }, () => [])
  for (const expense of expenses) {
    if (!countsTowardBudget(expense)) continue
    if (isBefore(expense.date, start) || isAfter(expense.date, end)) continue
    buckets[daysBetween(start, expense.date)]?.push(expense.amountCents)
  }
  const cents = buckets.map((values) => sumCents(values))

  // Il massimo, che decide sia la scala sia se c'e' qualcosa da disegnare.
  let peakCents = cents[0] ?? 0
  let peakIndex = 0
  for (let i = 1; i < STRIP_DAYS; i += 1) {
    const value = cents[i] ?? 0
    // `>` e non `>=`: a parita' vince il giorno **prima**.
    if (value > peakCents) {
      peakCents = value
      peakIndex = i
    }
  }
  // **La striscia resta anche a settimana vuota**, e qui c'era `return null`.
  //
  // Vale la regola *"un blocco non scompare perche' i suoi dati sono vuoti"*: il
  // 31 agosto, un lunedi', la Home perdeva la striscia insieme alle righe di
  // oggi, e sopra restava meta' schermo bianco.
  //
  // **Il precedente che sconsigliava i blocchi a zero non si applica**, e la
  // distinzione e' la ragione per cui questa riga e' cambiata invece di
  // difendersi: quel precedente — *"otto barre a zero sotto SETTIMANA PER
  // SETTIMANA e nove occorrenze di `0,00 €`"* — parla di un blocco che **stampa
  // un importo per riga**. Questa striscia non ne stampa nessuno. Sette colonne
  // con la linea di base e oggi marcato non sono "sette zeri": sono **la
  // settimana che comincia**, ed e' l'unica cosa che il lunedi' mostra che il
  // periodo esiste ed e' appena partito.
  //
  // Cio' che resta `null` e' il **picco**, che a settimana vuota non esiste: non
  // e' un giorno a zero, e' l'assenza di un giorno da nominare. Il componente non
  // lo etichetta, e la scala cade sul sostenibile — o sul pavimento, se non c'e'
  // nemmeno quello.

  const sustainableCents = m.sustainablePaceCents
  // `max(giorno piu' alto, sostenibile)`: la linea deve **stare dentro** la
  // striscia, o non attraversa niente. Le due letture estreme sono tutte e due
  // vere e tutte e due utili — una settimana molto sotto il sostenibile disegna
  // colonne basse sotto una linea in cima ("sei rimasto lontano dal tetto tutti
  // i giorni"), un giorno dieci volte il sostenibile schiaccia la linea in basso
  // insieme agli altri sei ("sabato e' tutta la storia"). Il pavimento e'
  // quello che le tiene leggibili: nel secondo caso la linea, finche' il
  // sostenibile e' positivo, non scende sotto `COLUMN_MIN_FRACTION` e quindi non
  // si appiattisce sulla base. Se il sostenibile e' **zero** — un budget da 0,05
  // € a settimana — sulla base ci sta davvero, ed e' vero.
  //
  // **`peakCents` puo' essere zero** da quando la striscia resta a settimana
  // vuota, quindi `scaleCents` puo' esserlo: la divisione la copre gia'
  // `columnShare`, che con `scale <= 0` restituisce 0 invece di dividere. Sette
  // colonne alla base, che e' cio' che una settimana senza spese vale.
  const scaleCents =
    sustainableCents === null ? peakCents : Math.max(peakCents, sustainableCents)

  const days = cents.map((value, index) => {
    const date = addDays(start, index)
    return {
      date,
      cents: value,
      fraction: columnHeight(columnShare(value, scaleCents)),
      current: date === today,
      future: isAfter(date, today),
    }
  })

  return {
    days,
    scaleCents,
    sustainable:
      sustainableCents === null
        ? null
        : { cents: sustainableCents, fraction: columnHeight(columnShare(sustainableCents, scaleCents)) },
    // **`null` quando non c'e' niente da nominare.** `peakIndex` parte da 0 e
    // `peakCents` da 0, quindi senza questa condizione una settimana vuota
    // eleggerebbe il lunedi' a "giorno piu' alto" con 0,00 € — un massimo che
    // non esiste, annunciato a chi non lo puo' verificare.
    peak: peakCents > 0 ? addDays(start, peakIndex) : null,
  }
}
