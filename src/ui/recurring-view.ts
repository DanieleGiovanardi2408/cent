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
 */

import { isAfter, isBefore } from '../core/date'
import type { IsoDate } from '../core/date'
import type { Cents } from '../core/money'
import { monthlyCostCents, monthlyFixedCosts } from '../core/recurring-plan'
import type {
  MaterializationPreview,
  RecurrenceDraft,
  RecurringRuleDeletion,
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
 *
 * "Spenta" viene per prima perche' e' l'unica delle tre che si cambia con un
 * tap: una regola disattivata e una finita si assomigliano nell'elenco, ma
 * della seconda non c'e' niente da fare e della prima si'.
 */
function asideFor(rule: RecurringRule, onDate: IsoDate): string | null {
  if (!rule.active) return t('fixed.off')
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
 * ## `count: 0` sono due cose diverse
 *
 * Su una regola **nuova** vuol dire che la data d'inizio e' nel futuro: la
 * finestra e' vuota, ma la prima spesa esiste eccome ed e' `startDate`. Dirlo e'
 * l'unico modo perche' "non succede niente adesso" non si legga come "non
 * succedera' niente".
 *
 * Su una regola **gia' materializzata** (`lastMaterializedDate` c'e') vuol dire
 * l'opposto: e' in pari, non c'e' niente da recuperare. Li' `startDate` e' nel
 * passato e la frase "Prima spesa: 1 gennaio" sarebbe falsa — quella spesa
 * esiste gia' nello Storico da mesi.
 */
export function previewCopy(
  preview: MaterializationPreview,
  draft: RecurrenceDraft,
  today: IsoDate,
  mode: RuleMode,
): PreviewCopy {
  if (!preview.backdated) {
    const started = draft.lastMaterializedDate !== undefined
    return {
      text:
        started && preview.count === 0
          ? t('rule.preview.settled')
          : preview.firstDate === today || (preview.count === 0 && draft.startDate === today)
            ? t('rule.preview.today')
            : t('rule.preview.later', {
                day: fullDayLabel(preview.firstDate ?? draft.startDate, today),
              }),
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
 * Guarda anche i campi che il foglio non mostra (`anchorDay`, `endDate`): sono
 * dentro `ruleShape`, quindi una bozza che li perdesse per strada li
 * cancellerebbe dal record. Confrontarli qui vuol dire che quella differenza,
 * se mai comparisse, si vede come un cambio invece che come una perdita.
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
    rule.anchorDay !== draft.anchorDay ||
    rule.endDate !== draft.endDate
  )
}
