/**
 * Le parole intorno alle spese fisse, e le due liste che le schermate mostrano.
 *
 * Stessa collocazione e stesse ragioni di `budget-view.ts`: `src/core` risponde
 * con numeri (`monthlyFixedCosts`, `previewMaterialization`), qui si decide
 * **cosa dire** di quei numeri — compresi i casi che nessuno prova a mano. E'
 * un modulo senza DOM, quindi ha un test.
 *
 * Le quattro cose che vivono qui:
 *
 * 1. **L'elenco delle fisse** (`fixedList`), che non coincide con
 *    `monthlyFixedCosts`: quella conta solo le regole in vigore *oggi*, e una
 *    regola che parte il mese prossimo sparirebbe dalla schermata nell'istante
 *    in cui la si crea. Qui si vedono tutte; il totale resta quello del core.
 * 2. **L'anteprima** (`previewCopy`), cioe' la frase che dichiara cosa succede
 *    se si salva, e **se serve una conferma**.
 * 3. **I tre rifiuti** (`refusalText`): l'anteprima e' un'istantanea, e quando
 *    non descrive piu' adesso la scrittura dice di no. Sono le parole di quel no.
 * 4. **Il rifiuto della cancellazione** (`deletionRefusalText`), con dentro il
 *    numero di spese gia' generate.
 * 5. **Il riavvolgimento** (`rewindCopy`, `rewindRefusalText`): cosa succede a
 *    spostare indietro la data d'inizio, e le parole dei quattro no.
 */

import { isBefore } from '../core/date'
import type { IsoDate } from '../core/date'
import type { Cents } from '../core/money'
import { monthlyCostCents, monthlyFixedCosts } from '../core/recurring-plan'
import type {
  MaterializationPreview,
  RecurrenceDraft,
  RecurringRuleDeletion,
  RecurringRuleRewind,
  RecurringRuleWrite,
} from '../core/recurring-plan'
import type { RecurringRule } from '../core/types'
import { cadencePhrase, dayHeading, dayRangeLabel, fullDayLabel, money, t } from './i18n'

/* ------------------------------------------------------------------------- *
 * 1. L'elenco delle spese fisse
 * ------------------------------------------------------------------------- */

export interface FixedLine {
  readonly rule: RecurringRule
  /**
   * Il costo mensile normalizzato, oppure `null` se questa regola **non e' nel
   * totale**: non e' ancora cominciata, oppure e' spenta.
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
 * Perche' questa regola non pesa sul mese. **Due motivi**, in ordine di quanto
 * capitano; il terzo — record non valido — non ha una parola sua di proposito:
 * dire "regola non valida" a chi non l'ha scritta a mano non aiuta nessuno, e
 * la riga si legge comunque per intero (importo, cadenza, data d'inizio).
 *
 * Erano tre. Il terzo era "finita", e se n'e' andato con `endDate`: **una regola
 * non finisce piu'**, quindi non c'e' nessuno stato da nominare. La parola
 * (`fixed.ended`) e' uscita dai dizionari insieme al ramo — non e' rimasta in
 * attesa della fase 7, perche' una chiave viva nel codice e morta nei fatti e'
 * esattamente cio' che questo progetto ha gia' pagato una volta.
 *
 * "Spenta" viene per prima perche' e' l'unica delle due che si cambia con un
 * tap.
 */
function asideFor(rule: RecurringRule, onDate: IsoDate): string | null {
  if (!rule.active) return t('fixed.off')
  if (isBefore(onDate, rule.startDate)) {
    return t('fixed.later', { day: fullDayLabel(rule.startDate, onDate) })
  }
  return null
}

/**
 * La riga sotto il nome: `ogni mese, il giorno 25 · 900,00 €`.
 *
 * ## Il giorno del mese sta qui, e non e' un ornamento
 *
 * Su una mensile la cadenza da sola dice *"ogni mese"* e tace **quale giorno**,
 * che e' l'unica cosa che decide quando escono i soldi. Finche' l'ancora si
 * derivava da `startDate` la si poteva leggere altrove; da quando il rewind le
 * separa, una regola riportata al 1 febbraio si legge "ogni mese" e continua a
 * pagare il 25 — un numero che governa i soldi e che nessuna schermata cita.
 *
 * Solo sulle mensili, perche' solo li' esiste: una settimanale non ha
 * un'ancora, e inventarle un giorno sarebbe peggio che tacerlo.
 */
export function fixedLineNote(rule: RecurringRule): string {
  const every =
    rule.cadence === 'monthly'
      ? t('fixed.anchor', {
          every: cadencePhrase(rule.cadence, rule.interval),
          day: rule.anchorDay,
        })
      : cadencePhrase(rule.cadence, rule.interval)
  // L'importo si ripete accanto alla cadenza **solo quando il numero a destra
  // e' un altro numero**: per una mensile da 900 la colonna dice gia' 900, e
  // scriverlo due volte sulla stessa riga fa dubitare che siano la stessa cosa.
  const normalized = monthlyCostCents(rule)
  return normalized === rule.amountCents ? every : `${every} · ${money(rule.amountCents)}`
}

/* ------------------------------------------------------------------------- *
 * 2. L'anteprima, prima di scrivere
 * ------------------------------------------------------------------------- */

/**
 * Quale delle tre porte con pedaggio si sta per aprire.
 *
 * Non cambia **nessun numero** — quelli li calcola il core sulla stessa bozza —
 * cambia solo cosa scrive il bottone quando non c'e' arretrato da dichiarare.
 * Quando l'arretrato c'e', l'etichetta e' la stessa in tutti e tre i casi: cio'
 * che il bottone deve dire e' quante spese scrive e per quanto, e quello e' il
 * fatto piu' grosso della riga a prescindere da come ci si e' arrivati.
 */
export type RuleMode = 'new' | 'edit' | 'reactivate'

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
   * essere letta. Vale per tutte e tre le porte: creare, spostare il calendario
   * all'indietro e riaccendere una regola dormiente sono **lo stesso pericolo**
   * (ADR 017), quindi hanno la stessa domanda davanti.
   */
  readonly confirm: boolean
  /** L'etichetta della conferma. `null` quando non serve. */
  readonly confirmLabel: string | null
  /** Cosa scrive il bottone che salva. */
  readonly saveLabel: string
}

/** Cosa dice il bottone quando non c'e' nessun arretrato da annunciare. */
function plainSave(mode: RuleMode): string {
  switch (mode) {
    case 'new':
      return t('rule.save')
    case 'edit':
      return t('rule.save.edit')
    case 'reactivate':
      return t('rule.save.on')
  }
}

/**
 * Le parole dell'anteprima, dai numeri che `previewMaterialization` restituisce.
 *
 * ## Cosa entra qui, e cosa **non** puo' entrarci
 *
 * Entra una `MaterializationPreview`: i numeri e basta. **Non** l'esito intero
 * di `previewMaterialization`, che porta con se' anche il permesso di scrivere
 * (`confirmed`).
 *
 * E' la separazione fra **anteprima per mostrare** e **anteprima per
 * scrivere**, ed e' un tipo invece che una raccomandazione perche' la
 * scorciatoia che la violava esisteva davvero: il foglio calcola il calendario
 * con `amountCents: 1` per non rifare 9.728 occorrenze a ogni cifra, e uno
 * spread di quell'esito (`{ ...schedule, totalCents: cents * count }`)
 * trasportava un permesso a scrivere una regola da **0,01 €** insieme ai numeri
 * giusti. Con questa firma il permesso non arriva nemmeno fin qui: chi mostra
 * ha in mano solo dei numeri, e chi scrive rifa' l'anteprima con l'importo
 * vero.
 *
 * ## Il caso `ok: false` non arriva qui
 *
 * `previewMaterialization` rifiuta su una regola non valida, e il foglio la
 * interroga **mentre l'utente sta ancora scrivendo**: quel rifiuto e' uno stato
 * di transito, non un errore da mostrare. Chi chiama tiene la riga di aiuto sul
 * suo messaggio ("Quanto esce ogni volta?") finche' l'anteprima non ha una
 * risposta.
 *
 * ## `count: 0` sono tre cose diverse
 *
 * Su una regola **nuova** vuol dire che la finestra e' vuota perche' la regola
 * non e' ancora partita, ma la prima spesa esiste eccome: e' `nextDate`, che
 * **non** e' `startDate` — l'ancora e la data d'inizio si separano appena si
 * modifica una regola, e li' il vecchio ripiego mentiva. Dirlo e' l'unico modo
 * perche' "non succede niente adesso" non si legga come "non succedera' niente".
 *
 * Su una regola **gia' materializzata** (`lastMaterializedDate` c'e') vuol dire
 * l'opposto: e' in pari, non c'e' niente da recuperare. Li' `startDate` e' nel
 * passato e la frase "Prima spesa: 1 gennaio" sarebbe falsa — quella spesa
 * esiste gia' nello Storico da mesi.
 *
 * Le tre frasi stanno in `settledText`, con la ragione di ognuna.
 */
/**
 * La frase quando non c'e' nessun arretrato da dichiarare: quattro fatti
 * diversi, e nessuno dei quattro si puo' dire con le parole di un altro.
 *
 * ## Il ripiego che c'era qui, e perche' mentiva
 *
 * Fino a ieri il ramo `count: 0` scriveva `preview.firstDate ?? draft.startDate`:
 * senza una data calcolata, ripiegava sulla data d'inizio. Il ripiego dice il
 * vero **solo** se la prima occorrenza cade sulla data d'inizio, che e' vero per
 * come il foglio **crea** una regola (l'ancora si deriva da `startDate`) e falso
 * appena l'ancora e la data d'inizio si separano — cioe' in modifica, che e'
 * l'unica porta da cui quello stato arriva. Una mensile ancorata al **15**
 * spostata a inizio **5 settembre** annunciava *"Prima spesa: 5 settembre"*: la
 * prima vera e' il **15**, e il 5 e' un giorno in cui non succede niente.
 *
 * Adesso il giorno lo dice `nextDate`, che il core calcola con la stessa
 * funzione che la materializzazione esegue davvero. Non c'e' piu' una data
 * costruita qui, quindi non c'e' piu' un ripiego da tenere onesto.
 *
 * ## I tre rami
 *
 * 1. **C'e' qualcosa nella finestra** (`firstDate !== null`). Senza arretrato la
 *    finestra chiude a oggi e non comincia prima, quindi quel giorno **e'**
 *    oggi: non serve una data, serve la parola.
 * 2. **E' in pari** (c'e' il segnaposto): `count: 0` vuol dire "niente da
 *    recuperare", non "parte piu' avanti". Dirle la data della prossima
 *    annuncerebbe come "prima" una spesa che sta nello Storico da mesi.
 * 3. **Comincia piu' avanti**: la finestra e' vuota perche' la regola non e'
 *    ancora partita, e la prima spesa e' `nextDate`.
 *
 * ## Ce n'era un quarto, ed e' uscito con `endDate`
 *
 * Era *"questa spesa fissa e' finita"*, sul ramo `nextDate === null`. **Da
 * quando una regola non finisce piu', quel giorno non esiste**: `nextDate` non
 * e' mai `null`, e la sua parola (`rule.preview.done`) e' uscita dai dizionari
 * insieme al ramo invece di restare a aspettare la fase 7.
 *
 * Il tipo continua a prevedere il `null` — e' la risposta giusta il giorno in
 * cui la scadenza torna — quindi va **consumato**, non ignorato. Cade insieme
 * a "e' in pari": senza una prossima occorrenza non c'e' niente da recuperare,
 * che e' vero anche li'. Il giorno in cui la fase 7 riporta `endDate`, questo
 * ramo torna a essere una frase sua: sta scritto in `docs/ROADMAP.md`, non in
 * un ramo tenuto in vita per un caso irraggiungibile.
 */
function settledText(
  preview: MaterializationPreview,
  draft: RecurrenceDraft,
  today: IsoDate,
): string {
  if (preview.firstDate !== null) return t('rule.preview.today')
  if (draft.lastMaterializedDate !== undefined || preview.nextDate === null) {
    return t('rule.preview.settled')
  }
  return t('rule.preview.later', { day: fullDayLabel(preview.nextDate, today) })
}

export function previewCopy(
  preview: MaterializationPreview,
  draft: RecurrenceDraft,
  today: IsoDate,
  mode: RuleMode,
): PreviewCopy {
  if (!preview.backdated) {
    return {
      text: settledText(preview, draft, today),
      confirm: false,
      confirmLabel: null,
      saveLabel: plainSave(mode),
    }
  }

  const total = money(preview.totalCents)
  const first = preview.firstDate ?? draft.startDate
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

/* ------------------------------------------------------------------------- *
 * 3. Quando la scrittura dice di no
 * ------------------------------------------------------------------------- */

/** I tre rifiuti di una scrittura che passa da un'anteprima. */
export type RuleWriteRefusal = Extract<RecurringRuleWrite, { ok: false }>

/**
 * Le parole di un rifiuto. Tre, e nessuna delle tre e' un errore dell'utente:
 * e' l'app che chiede di rileggere dei numeri cambiati **sotto** la schermata.
 *
 * Quindi la frase fa due cose, sempre nello stesso ordine: dice **cosa e'
 * cambiato** e dice che i numeri **sono gia' stati rifatti**. Un rifiuto che
 * annuncia solo il no lascerebbe l'utente davanti a un bottone spento senza una
 * mossa: qui la mossa e' rileggere la riga sotto e rispuntare la casella, che
 * nel frattempo si e' spenta da sola perche' cio' che dichiarava non e' piu'
 * vero.
 *
 * ## `stale-preview` e' la mezzanotte
 *
 * Ed e' il motivo per cui la guardia esiste. Un'anteprima che dice 8 e viene
 * confermata dopo le 00:00 ne scriverebbe **9**: annuncerebbe meno di quanto
 * fa, che e' l'unico verso che questo progetto ha dichiarato inaccettabile.
 *
 * Il rifiuto porta **entrambi i giorni**, e servono entrambi: "ieri" e' una
 * parola che si scrive solo sapendo anche qual e' oggi. `dayHeading` li consuma
 * tutti e due — da' "ieri" nel caso della mezzanotte e la data per esteso se
 * l'orologio ha fatto un salto piu' lungo, che e' l'altro modo in cui questo
 * rifiuto puo' capitare.
 */
export function refusalText(refusal: RuleWriteRefusal, today: IsoDate): string {
  switch (refusal.reason) {
    case 'stale-preview':
      return t('rule.refused.stale', {
        day: dayHeading(refusal.previewedOn, today).toLowerCase(),
      })
    case 'moved-on':
      return t('rule.refused.moved')
    case 'unknown':
      return t('rule.refused.gone')
  }
}

/* ------------------------------------------------------------------------- *
 * 4. Cancellare una regola
 * ------------------------------------------------------------------------- */

/**
 * Perche' questa regola non si puo' cancellare, con dentro **il numero**.
 *
 * `null` quando si puo' — li' al posto delle parole c'e' il bottone. E' la
 * stessa forma delle categorie: `planRecurringRuleDeletion` e' puro, lo si
 * chiama **prima di disegnare il bottone**, e chi non puo' cancellare legge una
 * frase che gli dice anche cosa fare invece (disattivarla) al posto di ricevere
 * un errore dopo il tap.
 *
 * `'unknown'` non ha parole di proposito: vuol dire che la regola non c'e' piu',
 * e in quel caso il foglio non ha nemmeno un bersaglio da mostrare.
 */
export function deletionRefusalText(deletion: RecurringRuleDeletion): string | null {
  if (deletion.ok || deletion.reason === 'unknown') return null
  return deletion.expenses === 1
    ? t('rule.inUse.one')
    : t('rule.inUse.other', { count: deletion.expenses })
}

/**
 * Il calendario o l'importo sono cambiati rispetto a quello che c'e' scritto
 * nel record?
 *
 * Serve a decidere **quale porta aprire**: se non e' cambiato niente di cio'
 * che passa dall'anteprima, `reviseRecurringRule` non ha niente da fare e non
 * si chiama. Cambiare solo la categoria non deve costare una riscrittura del
 * calendario — e' esattamente la divisione che ADR 017 mette fra le due porte.
 *
 * Guarda anche `anchorDay`, che dalla fase 5 il foglio mostra **e** lascia
 * cambiare (vedi `RuleSheet`, il selettore del giorno del mese): e' dentro
 * `ruleShape`, quindi una bozza che lo perdesse per strada lo cancellerebbe dal
 * record, e una bozza che lo cambia deve passare dalla porta con il pedaggio —
 * spostare il giorno del mese sposta ogni occorrenza futura.
 *
 * `lastMaterializedDate` **non** si guarda: non e' un campo che si modifica, e'
 * il segnaposto del motore, e la scrittura non lo tocca.
 */
export function calendarChanged(rule: RecurringRule, draft: RecurrenceDraft): boolean {
  return (
    rule.amountCents !== draft.amountCents ||
    rule.cadence !== draft.cadence ||
    rule.interval !== draft.interval ||
    rule.startDate !== draft.startDate ||
    rule.anchorDay !== draft.anchorDay
  )
}

/* ------------------------------------------------------------------------- *
 * 5. Spostare indietro la data d'inizio (ADR 018)
 * ------------------------------------------------------------------------- */

/**
 * La bozza su cui si calcola l'anteprima di un riavvolgimento.
 *
 * **E' la regola come sara' dopo**: la data nuova, e **nessun segnaposto**.
 * Cioe' e' esattamente la bozza di una regola **appena creata** con quella data
 * d'inizio — nessun campo la distingue, ed e' il punto di ADR 018: retrodatare
 * e ricreare percorrono lo **stesso ramo** di `materializationWindow`, quindi
 * la coerenza fra i due gesti non e' una proprieta' da verificare caso per
 * caso.
 *
 * Nessuna funzione di dominio la costruisce, e non e' una dimenticanza:
 * sarebbe un'API di `src/core` con un chiamante solo, e questo repo ne ha gia'
 * cancellate due per quel motivo (`expensesInRange`, `planBudgetChange`).
 * Sbagliarla non produce una scrittura sbagliata: produce uno `stale-preview`
 * dalla transazione, che ri-deriva l'impronta dai record veri e la confronta su
 * quattro numeri. La guardia sta nel confronto, non in un aiutante.
 *
 * ## L'importo e' quello del **record**, non quello che si sta digitando
 *
 * Il riavvolgimento scrive due campi e nessuno dei due e' l'importo: la somma
 * annunciata deve quindi essere `rule.amountCents` per il numero di occorrenze,
 * o l'impronta non tornerebbe — la transazione la ri-deriva con l'importo del
 * **disco**. Chi ha una modifica dell'importo non salvata nel foglio la vede
 * ignorata qui, ed e' corretto: e' un'altra operazione, e la nota del pannello
 * lo dice a parole.
 *
 * Da cui anche il fatto che qui non serve la scorciatoia dell'`amountCents: 1`
 * di `RuleSheet`: l'importo non cambia mentre si sceglie una data, quindi
 * l'anteprima che si **mostra** e quella che si **spende** possono essere la
 * stessa senza aprire nessuna trappola.
 */
export function rewindDraft(rule: RecurringRule, startDate: IsoDate): RecurrenceDraft {
  const common = {
    amountCents: rule.amountCents,
    interval: rule.interval,
    startDate,
  }
  // Cadenza e ancora nella stessa espressione (ADR 020): il giorno del mese e'
  // quello **scritto nel record** e non si ricava dalla data nuova. Spostare la
  // data d'inizio di una regola "il 1 del mese" non la trasforma in "il 23 del
  // mese", e le istanze gia' generate il 1 restano in calendario.
  return rule.cadence === 'monthly'
    ? { ...common, cadence: 'monthly', anchorDay: rule.anchorDay }
    : { ...common, cadence: rule.cadence }
}

export interface RewindCopy {
  /** Cosa succede se si conferma. **Mai vuota**: anche "niente" e' un fatto. */
  readonly text: string
  /**
   * L'etichetta della conferma, `null` quando non c'e' niente da confermare.
   *
   * Qui la condizione e' `count > 0` e **non** `backdated`, e la differenza e'
   * voluta. Nel foglio della regola si conferma l'arretrato perche' il gesto
   * ordinario — creare una regola che parte oggi — non deve pagare niente. Qui
   * il gesto ordinario **e'** la scrittura in blocco: si e' entrati apposta in
   * un pannello che serve solo a quello. Resta il ramo muto (`count: 0`), che e'
   * cio' che impedisce alla casella di comparire sempre.
   */
  readonly confirmLabel: string | null
  /** Cosa scrive il bottone che conferma. Con dentro i numeri, sempre. */
  readonly saveLabel: string
}

/**
 * Le parole di un riavvolgimento: quante spese nascono, da che giorno a che
 * giorno, e quanto in tutto.
 *
 * Entra una `MaterializationPreview` — i numeri e basta — per la stessa ragione
 * di `previewCopy`: chi mostra non deve avere in mano il permesso di scrivere.
 * Qui i due coinciderebbero senza danno (l'importo e' vero), ma la firma che
 * non lo ammette e' cio' che rende la regola verificabile invece che ricordata.
 *
 * ## I tre rami, e perche' il terzo esiste
 *
 * - `count: 0` — si sposta solo la data. Capita retrodatando una regola che non
 *   ha ancora cominciato: legittimo, e "0 spese" non e' una frase da mostrare.
 * - `count: 1` **su oggi** — l'unico modo di generare senza generare arretrato:
 *   una regola che parte domani riportata a oggi. Chiamarla "arretrata"
 *   sarebbe falso di un giorno, e il singolo giorno e' proprio cio' che questa
 *   operazione esiste per correggere.
 * - il resto — l'arretrato vero, con le stesse parole del foglio della regola:
 *   e' lo stesso fatto ("questa regola creera' N spese arretrate"), e due copie
 *   diverse della stessa frase si allontanerebbero al primo ritocco.
 */
export function rewindCopy(
  preview: MaterializationPreview,
  startDate: IsoDate,
  today: IsoDate,
): RewindCopy {
  const total = money(preview.totalCents)
  if (preview.count === 0) {
    return {
      text: t('rewind.preview.none', { day: fullDayLabel(startDate, today) }),
      confirmLabel: null,
      saveLabel: t('rewind.save.none'),
    }
  }
  if (!preview.backdated) {
    return {
      text: t('rewind.preview.today', { total }),
      confirmLabel: t('rewind.confirm.today'),
      saveLabel: t('rule.save.back.one', { total }),
    }
  }
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

/** I quattro rifiuti di `rewindRecurringRule`. */
export type RewindRefusal = Extract<RecurringRuleRewind, { ok: false }>

/**
 * Le parole di un no. Quattro esiti, e nessuno e' un errore dell'utente.
 *
 * Due riusano le frasi che esistono, perche' sono lo **stesso fatto**: la
 * regola sparita (`rule.refused.gone`) e la mezzanotte (`rule.refused.stale`)
 * non cambiano natura per essere arrivate da qui.
 *
 * ## `stale-preview` si divide in due, e serve
 *
 * `'day'` e' la mezzanotte: i numeri erano di ieri. `'footprint'` e' l'altra
 * meta' — quello che l'impronta annunciava non e' piu' quello che la
 * transazione ri-deriva dai record veri (un altro contesto ha cambiato
 * l'importo, o il calendario). Il rimedio e' lo stesso in tutti e due i casi:
 * **rifai l'anteprima, non scrivere** — e infatti tutte e due le frasi
 * finiscono con "ricontrolla e conferma", perche' i numeri qui sotto sono gia'
 * rifatti nell'istante in cui il rifiuto compare.
 *
 * Il rifiuto sulla forma non cita **nessun numero**: `announced` e `actual`
 * sono due impronte, e la seconda e' gia' quella che si legge nel piede. Un
 * numero in piu' nel messaggio sarebbe un numero da riconciliare con lo
 * schermo, che e' esattamente cio' che questo progetto non fa dire ai messaggi.
 */
export function rewindRefusalText(refusal: RewindRefusal, today: IsoDate): string {
  switch (refusal.reason) {
    case 'unknown':
      return t('rule.refused.gone')
    case 'not-earlier':
      return t('rewind.refused.notEarlier', {
        day: fullDayLabel(refusal.startDate, today),
        current: fullDayLabel(refusal.currentStartDate, today),
      })
    case 'invalid':
      return t('rewind.refused.invalid')
    case 'stale-preview':
      return refusal.stale.staleness === 'day'
        ? t('rule.refused.stale', {
            day: dayHeading(refusal.stale.previewedOn, today).toLowerCase(),
          })
        : t('rewind.refused.changed')
  }
}
