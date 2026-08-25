import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { backupFilename, exportBackupFile, serializeBackup } from '../app/backup-file'
import { getAppState, refreshDay } from '../app/boot'
import { activeCategories, archivedCategories, planCategoryDeletion } from '../core/categories'
import { isLive } from '../core/stats'
import type { Repository } from '../core/repository'
import { nowTimestamp } from '../core/types'
import type { BudgetPeriod, Category, Expense, Language, RecurringRule } from '../core/types'
import { AddSheet } from './AddSheet'
import type { SaveInput } from './AddSheet'
import { AmountSheet } from './AmountSheet'
import { BackupNudge } from './BackupNudge'
import { backupNudge, daysSince } from './backup-nudge'
import { BackupPanel } from './BackupPanel'
import { BudgetSheet } from './BudgetSheet'
import { CategorySheet } from './CategorySheet'
import type { CategoryDraft, CategoryMode } from './CategorySheet'
import { RuleSheet } from './RuleSheet'
import type { RuleDraft } from './RuleSheet'
import { ExpenseActions } from './ExpenseActions'
import { Fit } from './Fit'
import { Guide } from './Guide'
import { History } from './History'
import { Home } from './Home'
import { Mark } from './Mark'
import { planRecurringRuleDeletion, previewMaterialization } from '../core/recurring-plan'
import type { RecurringRuleWrite } from '../core/recurring-plan'
import { calendarChanged, refusalText } from './recurring-view'
import { Settings } from './Settings'
import { activePeriod, currentBudgetCents } from './budget-view'
import { Toast } from './Toast'
import type { ToastAction, ToastData } from './Toast'
import { UpdateBanner } from './UpdateBanner'
import { insecureContext } from './env'
import {
  cadenceLabel,
  dayHeading,
  detectLanguage,
  money,
  resolveLanguage,
  setLanguage,
  t,
} from './i18n'
import { motionMs } from './motion'
import { useApp } from './useApp'
import './App.css'

/**
 * Quale foglio e' aperto, e se sta gia' uscendo. Sono quattro — inserimento,
 * budget, spesa fissa e correzione dell'importo — e non possono essere aperti
 * insieme: `null` significa nessuno.
 */
type SheetKind = 'add' | 'budget' | 'rule' | 'amount'
/**
 * `id` e' la regola che il foglio delle spese fisse sta modificando, o la spesa
 * di cui si sta correggendo l'importo; `null` quando si crea una regola nuova
 * (ed e' sempre `null` per l'inserimento e per il budget). E' **l'id e non il
 * record**: dopo una modifica il record e' cambiato, e un oggetto congelato qui
 * dentro mostrerebbe lo stato di prima del tap mentre l'elenco dietro ha gia'
 * quello nuovo — la stessa ragione per cui il foglio delle categorie tiene
 * l'id.
 */
type Sheet = {
  readonly kind: SheetKind
  readonly id: string | null
  readonly leaving: boolean
} | null

/**
 * La schermata attiva. E' stato, non una rotta: in standalone su iOS non esiste
 * il tasto Indietro del browser, quindi un router sincronizzerebbe la UI con una
 * history che nessuno puo' guardare. Vedi ADR 002.
 */
type View = 'home' | 'history' | 'settings'

/** Il foglio delle categorie: quale gesto, su quale categoria. */
type CatSheet =
  | { readonly mode: CategoryMode; readonly id: string | null; readonly leaving: boolean }
  | null

let toastSeq = 0

/** Quanto vive un toast: sei secondi se c'e' qualcosa da annullare, se no quattro. */
const TOAST_MS = { plain: 4000, action: 6000 } as const

/**
 * Per quante spese la riga del foglio spiega come si salva. Poi mai piu'.
 *
 * Tre, e non e' un numero a sentimento: e' **un'asimmetria di costo**. Mostrarla
 * due volte di troppo costa zero — testo statico, altezza gia' riservata,
 * nessuna regione live — mentre mostrarla troppo poco costa un utente **senza
 * piu' nessun canale** che gli dica come si salva, in un'app dove il salvataggio
 * non ha un tasto. Un lato dell'errore e' gratis, l'altro no.
 */
const COACH_UNTIL = 3

/**
 * Quante spese l'utente ha salvato **con le proprie mani**, fino al tetto che
 * interessa.
 *
 * `source === 'manual'` e non tutte, ed e' la parte che si sbaglia: dalla fase 5
 * un catch-up di ricorrenze puo' materializzare decine di spese al primo avvio
 * dopo un'assenza, e con un conteggio grezzo la riga si spegnerebbe **prima che
 * l'utente abbia toccato un chip**. Le cancellate non contano per la ragione
 * simmetrica: una spesa fatta e disfatta e' comunque un chip toccato, ma
 * `isLive` tiene il conteggio uguale a quello che l'utente vede nello Storico,
 * ed e' li' che si formerebbe il dubbio.
 *
 * Si ferma al tetto: con 5.000 spese in archivio non c'e' nessun motivo di
 * contarle tutte per rispondere a una domanda che e' "sono almeno tre?".
 */
function savedByHand(expenses: readonly Expense[], stopAt: number): number {
  let count = 0
  for (const expense of expenses) {
    if (expense.source !== 'manual' || !isLive(expense)) continue
    count += 1
    if (count >= stopAt) return count
  }
  return count
}

export function App() {
  const app = useApp()

  /**
   * La lingua, decisa **qui e prima di ogni figlio**.
   *
   * `Settings.language` assente non significa italiano: significa "nessuno l'ha
   * scelta", e allora si ridecide dall'ambiente a ogni avvio (vedi `types.ts` e
   * il selettore a tre voci in `Settings.tsx`). Niente viene persistito qui: la
   * lingua **rilevata** non si scrive, o diventerebbe indistinguibile da una
   * scelta vera.
   *
   * `setLanguage` e' un effetto in fase di render, e in questo caso e' la cosa
   * giusta: e' idempotente, sincrono, e deve valere per il sottoalbero che sta
   * per essere dipinto. In un `useEffect` girerebbe **dopo** il primo render,
   * cioe' l'app dipingerebbe un frame nella lingua sbagliata a ogni cambio.
   *
   * Chi ha scelto una lingua **diversa** da quella del telefono vede il guscio
   * nella lingua rilevata per i pochi frame che separano il primo render
   * dall'apertura del database (regola "Ordine di pittura": il guscio non
   * aspetta i dati). Quel lampo **resta**, ed e' cosmetico.
   *
   * Cio' che non resta e' la sua conseguenza misurabile: le parole della barra
   * sono larghe diversamente nelle due lingue, e le schede si spostavano
   * quando i dati arrivavano — CLS > 0 in uno stato che nessun test guardava.
   * Adesso ogni etichetta del guscio occupa la larghezza massima fra le due
   * lingue (`Fit`), che e' deterministica e non introduce nessuna seconda
   * fonte di verita' fuori da IndexedDB. La regola non chiede che il primo
   * frame sia definitivo: chiede che l'arrivo dei dati non sposti nulla.
   */
  const chosenLanguage = app.data?.settings.language
  setLanguage(resolveLanguage(chosenLanguage))

  const [view, setView] = useState<View>('home')
  const [sheet, setSheet] = useState<Sheet>(null)
  /** Cambia a ogni apertura: rimonta il foglio, cosi' non eredita mai un importo. */
  const [session, setSession] = useState(0)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [panel, setPanel] = useState<string | null>(null)
  /** La spesa su cui si e' toccato nello Storico: apre il foglio delle azioni. */
  const [picked, setPicked] = useState<Expense | null>(null)
  /**
   * L'editor delle categorie. Tiene **l'id**, non la categoria: dopo uno
   * spostamento o una modifica il record e' cambiato, e un oggetto congelato
   * qui dentro mostrerebbe lo stato di prima del tap mentre la griglia dietro
   * ha gia' quello nuovo.
   */
  const [catSheet, setCatSheet] = useState<CatSheet>(null)
  const closeTimer = useRef(0)
  const catTimer = useRef(0)
  const toastTimer = useRef(0)
  /** Quando il toast corrente deve sparire, in ora dell'orologio (non di un timer). */
  const toastUntil = useRef(0)

  /**
   * Le otto della griglia e tutte le altre.
   *
   * Non e' piu' un `filter` scritto qui: `activeCategories` e' **totale**
   * (`src/core/categories.ts`), cioe' di fronte a nove non archiviate — un JSON
   * scritto a mano, una versione futura — ne restituisce otto per regola invece
   * di produrre una griglia che scorre. Chiamarla anche qui vuol dire che il
   * foglio d'inserimento, la griglia di Impostazioni e la domanda "quale
   * sostituisce?" mostrano **le stesse otto**: tre risposte diverse alla stessa
   * domanda sarebbero il modo esatto in cui si archivia la categoria sbagliata.
   */
  const categories = useMemo(
    () => activeCategories(app.data?.categories ?? []),
    [app.data?.categories],
  )

  const archived = useMemo(
    () => archivedCategories(app.data?.categories ?? []),
    [app.data?.categories],
  )

  const failures = app.data?.writeFailures.count ?? 0

  /**
   * Il promemoria di backup, cioe' la **condizione** a cui l'export ha potuto
   * lasciare la barra: senza, la rete tolta non sarebbe stata rimpiazzata.
   *
   * Tace quando c'e' gia' l'avviso delle scritture non arrivate al disco: quello
   * dice "esporta adesso" per una ragione piu' urgente, e due bande che
   * chiedono la stessa cosa insegnano a ignorarle entrambe.
   */
  const lastBackupAt = app.data?.settings.lastBackupAt

  const nudge = useMemo(() => {
    const data = app.data
    if (data === null || failures > 0) return null
    return backupNudge(data.settings, data.expenses, nowTimestamp())
  }, [app.data, failures])

  /**
   * Il periodo che la Home sta mostrando — cioe' quello dell'ultimo budget
   * impostato (`activePeriod`, e docs/ROADMAP.md "Il periodo della Home deriva
   * dai budget"). Serve a due schermate: al foglio del budget, che si apre
   * selezionato li', e a Impostazioni, che dice quale budget e' in vigore.
   *
   * Si calcola una volta qui e non in ognuna delle due: due chiamate sarebbero
   * due risposte che divergono il giorno in cui la regola cambia.
   */
  const homePeriod = useMemo(
    () => activePeriod(app.data?.budgets ?? [], app.day),
    [app.data?.budgets, app.day],
  )

  /**
   * La guida: si mostra finche' `Settings.onboardingCompletedAt` e' assente.
   *
   * **E' uno stato, non un evento** — ed e' la differenza che ADR 009 chiede di
   * saper fare. Agganciata all'avvio comparirebbe solo agli avvii a freddo,
   * cioe' a seconda di se iOS ha ucciso l'app in background; agganciata allo
   * stato compare a ogni apertura finche' non e' stata chiusa, che e' ripetibile
   * e idempotente.
   *
   * `app.data !== null` non e' una comodita': finche' il database non e' aperto
   * non si **sa** se la guida sia stata gia' vista, e dipingerla intanto la
   * farebbe lampeggiare addosso a chi la chiuse tre settimane fa. Il guscio si
   * dipinge prima dei dati (regola "Ordine di pittura"), la guida no: non e'
   * guscio, e' una risposta a una domanda che solo il disco puo' dare.
   */
  const guide = app.data !== null && app.data.settings.onboardingCompletedAt === undefined

  /**
   * La riga del foglio che spiega come si salva, accesa finche' non si sono
   * salvate tre spese a mano.
   *
   * Il conteggio **si deriva**, non si memorizza: le spese sono gia' nel mirror,
   * e un campo in `Settings` significherebbe o infilarlo nella migrazione 2 -> 3
   * o farne una seconda su dati veri, per un contatore gia' ricavabile. E' la
   * stessa dottrina del periodo della Home, che deriva dai budget.
   */
  const coach = useMemo(
    () => savedByHand(app.data?.expenses ?? [], COACH_UNTIL) < COACH_UNTIL,
    [app.data?.expenses],
  )

  /**
   * Riconciliazione al risveglio (regola "Stato dell'interfaccia e sospensione").
   *
   * `setTimeout` si congela in background: senza questo, il toast di ieri sera e'
   * ancora li' stamattina, con "Annulla" agganciato a una spesa di dodici ore fa.
   * La durata si confronta con l'orologio invece di azzerare a occhi chiusi,
   * perche' su iOS il foglio di condivisione del backup nasconde la pagina e la
   * riporta visibile un istante prima che arrivi il suo stesso toast: azzerare e
   * basta cancellerebbe un messaggio appena nato.
   */
  useEffect(() => {
    const hide = (): void => {
      toastTimer.current = 0
      toastUntil.current = 0
      setToast(null)
    }
    const settle = (): void => {
      if (toastTimer.current === 0) return
      clearTimeout(toastTimer.current)
      const left = toastUntil.current - Date.now()
      if (left <= 0) hide()
      else toastTimer.current = window.setTimeout(hide, left)
    }
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') settle()
    }
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) settle()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  function clearToast(): void {
    clearTimeout(toastTimer.current)
    toastTimer.current = 0
    toastUntil.current = 0
    setToast(null)
  }

  function showToast(text: string, action: ToastAction | null = null): void {
    clearTimeout(toastTimer.current)
    const life = action === null ? TOAST_MS.plain : TOAST_MS.action
    toastUntil.current = Date.now() + life
    setToast({ id: ++toastSeq, text, action })
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = 0
      toastUntil.current = 0
      setToast(null)
    }, life)
  }

  function openSheet(kind: SheetKind, id: string | null = null): void {
    // Il toast se ne va **prima** di tutto il resto. Da fisso stava sopra il
    // tastierino e "Annulla" cadeva dentro il tasto "9"; ora e' contenuto in
    // flusso e finisce dietro al foglio, quindi non e' piu' raggiungibile per
    // sbaglio — ma un annullamento appeso a una spesa che non si sta piu'
    // guardando resta una trappola, e qui non deve sopravvivere.
    clearToast()
    // Se l'app e' rimasta aperta oltre la mezzanotte, "Oggi" non e' piu' lo
    // stesso giorno: si ricalcola qui, non a ogni render.
    refreshDay()
    clearTimeout(closeTimer.current)
    setSession((current) => current + 1)
    setSheet({ kind, id, leaving: false })
  }

  function closeSheet(): void {
    setSheet((current) => (current === null ? null : { ...current, leaving: true }))
    clearTimeout(closeTimer.current)
    // Sotto prefers-reduced-motion l'attesa e' zero: sparisce l'animazione,
    // non deve sopravvivere il ritardo.
    closeTimer.current = window.setTimeout(() => setSheet(null), motionMs(200))
  }

  function categoryOf(id: string): Category | undefined {
    return app.data?.categories.find((category) => category.id === id)
  }

  /**
   * Salva. **Restituisce l'esito**, e non e' un dettaglio di stile: il foglio
   * alza la sua bandiera "fatto" solo se qui e' andata bene. Prima la alzava
   * prima di chiamare, e dopo un fallimento ogni tap su ogni chip veniva
   * scartato in silenzio — il messaggio diceva "Riprova" e la UI aveva reso il
   * riprovare impossibile.
   */
  function save(input: SaveInput): boolean {
    const repo = app.repo
    if (!repo) return false
    let expense: Expense
    try {
      expense = repo.addExpense(input)
    } catch {
      // Il foglio resta aperto con l'importo digitato e lo dice da solo, nel
      // punto dove gia' scrive cosa fare adesso. Un toast qui finirebbe dietro
      // al foglio, cioe' invisibile.
      return false
    }
    // Il mirror e' gia' cambiato: la lista dietro al foglio ha gia' la riga
    // nuova mentre il foglio scende. Nessuna attesa del disco, nessuno spinner.
    closeSheet()
    const category = categoryOf(input.categoryId)
    const when = input.date === app.day ? '' : ` · ${dayHeading(input.date, app.day).toLowerCase()}`
    showToast(`${money(expense.amountCents)} · ${category?.name ?? t('add.label')}${when}`, {
      label: t('toast.undo'),
      run: () => remove(repo, expense.id, t('toast.expenseUndone')),
    })
    return true
  }

  /**
   * Scrive il budget. Ottimistico come tutto il resto: `setBudget` muove il
   * mirror subito e la Home si ridisegna nello stesso frame; se il disco non
   * accetta, la scrittura finisce in `writeFailures` e l'avviso "esporta
   * adesso" compare da solo. Nessuno spinner su una scrittura locale.
   */
  function saveBudget(period: BudgetPeriod, amountCents: number): boolean {
    const repo = app.repo
    if (!repo) return false
    // Il foglio puo' essere rimasto aperto oltre la mezzanotte: `effectiveFrom`
    // dev'essere il giorno vero, o il budget nuovo varrebbe da ieri e
    // riscriverebbe un periodo gia' chiuso.
    refreshDay()
    try {
      repo.setBudget({ period, amountCents, effectiveFrom: getAppState().day })
    } catch {
      return false
    }
    closeSheet()
    // Niente "Annulla": impostare un budget non distrugge niente, e il rimedio
    // e' lo stesso gesto al contrario. Il toast conferma e basta.
    showToast(
      t('toast.budgetSaved', { amount: money(amountCents), cadence: cadenceLabel(period) }),
    )
    return true
  }

  /**
   * Corregge l'importo di una spesa gia' scritta, **conservando `id` e
   * `source`**.
   *
   * ## Cosa compra quella conservazione
   *
   * Su una spesa generata da una regola, l'unico rimedio possibile finora era
   * cancellare e riscrivere a mano, e costava due cose:
   *
   * - `source` passava a `'manual'`, quindi la spesa **usciva dalle fisse ed
   *   entrava nel budget del periodo** (ADR 016). L'affitto che cambia di 12 €
   *   faceva muovere il numero grande della Home di 912: una correzione che non
   *   e' una spesa nuova non deve toccare quel numero, e adesso non lo tocca;
   * - l'id deterministico `rec:${ruleId}:${giorno}` (ADR 006) spariva, e con lui
   *   la ragione per cui la prossima materializzazione **non** ricrea quel
   *   giorno.
   *
   * `updateExpense` riscrive solo i campi del patch, quindi tutti e due si
   * conservano senza che nessuno debba ricordarsene.
   *
   * ## Ottimistica, con l'Annulla
   *
   * Come ogni scrittura locale: il mirror si muove subito e la lista dietro ha
   * gia' il numero nuovo mentre il foglio scende. Il toast porta "Annulla"
   * perche' qui, a differenza del budget, **qualcosa si perde**: l'importo di
   * prima non esiste piu' da nessuna parte. Il rimedio riscrive quello.
   */
  function saveAmount(amountCents: number): boolean {
    const repo = app.repo
    const target = amountTarget
    if (repo === null || target === null) return false
    const before = target.amountCents
    let saved: Expense | null
    try {
      saved = repo.updateExpense(target.id, { amountCents })
    } catch {
      // Un import sta sostituendo i dati: il foglio resta aperto con l'importo
      // digitato e lo dice dove si riprova.
      return false
    }
    if (saved === null) {
      // La spesa non c'e' piu' — cancellata da un altro contesto mentre il
      // foglio era aperto. Il foglio si chiude: non c'e' piu' niente da
      // correggere, e insistere su un record che non esiste non porta da
      // nessuna parte.
      closeSheet()
      showToast(t('toast.gone'))
      return true
    }
    closeSheet()
    showToast(t('toast.amountFixed', { amount: money(amountCents) }), {
      label: t('toast.undo'),
      run: () => restoreAmount(repo, target.id, before),
    })
    return true
  }

  /**
   * L'annullamento della correzione: rimette l'importo di prima.
   *
   * L'id viaggia nel toast, non il record: fra il tap e l'annullamento passano
   * fino a sei secondi, e cio' che si riscrive e' un campo solo su qualunque
   * versione del record ci sia adesso.
   */
  function restoreAmount(repo: Repository, id: string, amountCents: number): void {
    let back: Expense | null
    try {
      back = repo.updateExpense(id, { amountCents })
    } catch {
      showToast(t('toast.restoreFailed'))
      return
    }
    if (back === null) {
      showToast(t('toast.gone'))
      return
    }
    // Nessun secondo "Annulla": annullare un annullamento non lo fa nessuno.
    showToast(t('toast.amountBack', { amount: money(amountCents) }))
  }

  /* --- le spese fisse ---------------------------------------------------- *
   *
   * Cinque porte, e la divisione non e' arbitraria (ADR 017): la generazione
   * retroattiva ha **tre inneschi** — creare, spostare il calendario
   * all'indietro, riaccendere una regola dormiente — e ognuno dei tre passa da
   * un'anteprima calcolata adesso. Cambiare la categoria non genera niente e
   * non paga niente; spegnere e' l'unica direzione che non puo' generare, e
   * infatti non ha nemmeno una conferma davanti.
   */

  /** Il nome con cui una regola si chiama nei messaggi: la sua categoria. */
  function ruleName(rule: RecurringRule): string {
    return categoryOf(rule.categoryId)?.name ?? t('rule.label.edit')
  }

  /**
   * Scrive una spesa fissa — creata, modificata o riaccesa — e **subito dopo la
   * materializza**.
   *
   * ## Il permesso di scrivere si rifa' qui, con l'importo vero
   *
   * Il foglio calcola il proprio calendario con `amountCents: 1` per non rifare
   * 9.728 occorrenze a ogni cifra, e quel calcolo porta con se' un permesso che
   * autorizzerebbe a scrivere una regola da **0,01 €**. Quel permesso non arriva
   * fin qui: la bozza che il foglio consegna e' fatta di soli campi, e
   * l'anteprima che si spende e' **questa**, con l'importo vero dentro. Un
   * calcolo per tap invece che per cifra, che e' esattamente cio' che la
   * scorciatoia comprava.
   *
   * ## Perche' l'anteprima si calcola sul giorno della bozza e non su oggi
   *
   * Perche' e' l'unica differenza fra un rifiuto e un ricalcolo silenzioso.
   * `draft.day` e' il giorno su cui il foglio ha annunciato i suoi numeri e su
   * cui l'utente ha spuntato la casella; il repository legge il **proprio**
   * giorno al momento di scrivere e confronta. Se fra le due letture e' passata
   * la mezzanotte, la finestra si e' allargata di un giorno e la scrittura
   * produrrebbe un'occorrenza in piu' di quelle dichiarate: rifiuta, e questa
   * funzione restituisce le parole di quel no. Ricalcolando qui su "oggi",
   * quella scrittura sarebbe passata — annunciando meno di quanto fa, cioe'
   * l'unico verso che questo progetto ha dichiarato inaccettabile.
   *
   * `refreshDay()` sta **prima** e serve all'altra meta' del rimedio: il foglio
   * si ridipinge sul giorno nuovo, quindi i numeri rifatti sono gia' sotto gli
   * occhi nell'istante in cui il rifiuto compare, e la casella di conferma —
   * che ha il giorno nella propria firma — si e' spenta da sola.
   *
   * ## Perche' la materializzazione e' qui e non solo all'avvio
   *
   * Le tre porte scrivono la **regola**, non le spese: le occorrenze arretrate
   * le genera `materializeRecurring`, che finora girava solo all'avvio e al
   * risveglio. Senza questa chiamata, chi ha appena confermato "questa regola
   * creera' 8 spese" chiuderebbe il foglio e non ne vedrebbe nessuna fino alla
   * prossima apertura dell'app: cioe' l'anteprima avrebbe detto il vero e la
   * schermata l'avrebbe smentita.
   *
   * Non si aspetta, perche' e' una scrittura locale e su una scrittura locale
   * non si mette uno spinner. Le spese arrivano a blocchi (`onCommitted` muove
   * il mirror per ogni transazione, non alla fine): lo Storico si riempie mentre
   * il foglio sta ancora scendendo. `catch` vuoto e non `void` nudo:
   * `materializeRecurring` **rifiuta** (una scrittura persa, un import passato
   * nel frattempo), e un `void` senza catch sarebbe una unhandled rejection al
   * primo catch-up interrotto.
   */
  function saveRule(draft: RuleDraft): string | null {
    const repo = app.repo
    if (!repo) return t('rule.hint.failed')
    refreshDay()
    const target = ruleTarget
    const preview = previewMaterialization(draft.recurrence, draft.day)
    // Una bozza che il core non sa leggere: il foglio non la lascia arrivare
    // fin qui (il bottone e' spento senza un'anteprima), e se ci arrivasse il
    // messaggio direbbe comunque cosa fare invece di tacere.
    if (!preview.ok) return t('rule.hint.failed')

    const moved = target !== null && calendarChanged(target, draft.recurrence)
    let write: RecurringRuleWrite
    try {
      if (target === null) {
        write = repo.addRecurringRule({ categoryId: draft.categoryId }, preview.confirmed)
      } else if (!target.active) {
        write = repo.reactivateRecurringRule(target.id, preview.confirmed)
      } else if (moved || preview.backdated) {
        write = repo.reviseRecurringRule(target.id, preview.confirmed)
      } else {
        // Niente da riscrivere sul calendario: la porta con il pedaggio resta
        // chiusa. Il pedaggio l'ha pagato il codice (l'anteprima qui sopra), e
        // all'utente non e' costato niente — che e' il punto della divisione.
        //
        // La scorciatoia vale **solo se non c'e' niente di annunciato da
        // proteggere**, ed e' per questo che `backdated` la spegne: e' l'unico
        // ramo che non spende il permesso, quindi e' anche l'unico in cui la
        // guardia della mezzanotte non scatterebbe. Con dell'arretrato
        // dichiarato si passa comunque da `reviseRecurringRule` — che riscrive
        // gli stessi valori, cioe' non cambia niente, ma **redime
        // l'anteprima** e rifiuta se il giorno e' cambiato. Un no-op che paga
        // il pedaggio costa una scrittura; saltarlo costerebbe un'occorrenza
        // in piu' di quelle annunciate.
        write = { ok: true, rule: target }
      }
    } catch {
      // Un import sta sostituendo i dati. Il foglio resta aperto con tutto
      // quello che si e' scelto, e lo dice dove si riprova: un toast qui
      // finirebbe dietro al velo.
      return t('rule.hint.failed')
    }
    if (!write.ok) return refusalText(write, getAppState().day)

    // La categoria e la nota passano dalla porta **senza pedaggio**: non
    // entrano in nessuno dei numeri annunciati, quindi non hanno un permesso da
    // spendere e non hanno un esito da controllare.
    if (target !== null && draft.categoryId !== target.categoryId) {
      try {
        repo.updateRecurringRule(target.id, { categoryId: draft.categoryId })
      } catch {
        // Come sopra: la regola e' scritta, la categoria no. L'avviso delle
        // scritture non arrivate al disco e' gia' l'unico canale che serve.
      }
    }

    closeSheet()
    const name = ruleName({ ...write.rule, categoryId: draft.categoryId })
    const back = preview.backdated
    showToast(
      target === null
        ? back
          ? t('toast.ruleSavedBack', { name, count: preview.count })
          : t('toast.ruleSaved', { name })
        : !target.active
          ? back
            ? t('toast.ruleOnBack', { name, count: preview.count })
            : t('toast.ruleOn', { name })
          : back
            ? t('toast.ruleSavedBack', { name, count: preview.count })
            : t('toast.ruleUpdated', { name }),
    )
    void repo.materializeRecurring(getAppState().day).catch(() => {
      // Nessun canale nuovo: cio' che conta e' gia' in `writeFailures`, e
      // l'avviso in cima all'app lo mostra da solo.
    })
    return null
  }

  /**
   * Spegne una regola. **Non chiede niente**, ed e' deliberato: e' l'unica
   * direzione che non puo' generare una spesa, ed e' la via che il rifiuto
   * della cancellazione suggerisce quando cancellare non si puo'. Una conferma
   * davanti all'uscita di sicurezza la renderebbe scomoda proprio dove serve.
   *
   * Si annulla dal toast, come ogni altra azione di questa app. Riaccendere
   * **passa dall'anteprima** — e' il terzo innesco — ma qui non c'e' niente da
   * annunciare che non fosse gia' vero un istante fa: spegnere non muove il
   * segnaposto, quindi la finestra che si riapre e' esattamente quella che la
   * regola aveva prima del tap, e quelle occorrenze sarebbero uscite comunque.
   */
  function deactivateRule(): void {
    const repo = app.repo
    const target = ruleTarget
    if (repo === null || target === null) return
    const name = ruleName(target)
    let off: RecurringRule | null
    try {
      off = repo.deactivateRecurringRule(target.id)
    } catch {
      showToast(t('toast.ruleFailed'))
      return
    }
    closeSheet()
    if (off === null) {
      showToast(t('toast.ruleFailed'))
      return
    }
    showToast(t('toast.ruleOff', { name }), {
      label: t('toast.undo'),
      run: () => reactivateRule(repo, target.id, name),
    })
  }

  /**
   * L'annullamento dello spegnimento: si rifa' l'anteprima **adesso** e si
   * spende quella.
   *
   * La regola si rilegge dal mirror invece di riusare quella catturata nel
   * toast: fra il tap e l'annullamento possono essere passati sei secondi, e in
   * quei sei secondi un'altra materializzazione puo' aver mosso il segnaposto.
   * Un'anteprima calcolata su un record vecchio verrebbe rifiutata con
   * `'moved-on'`, che e' la risposta giusta ma inutile a chi sta solo disfacendo
   * un tap.
   */
  function reactivateRule(repo: Repository, id: string, name: string): void {
    const rule = repo.getState().recurringRules.find((r) => r.id === id)
    if (rule === undefined) {
      showToast(t('toast.ruleFailed'))
      return
    }
    refreshDay()
    const day = getAppState().day
    const preview = previewMaterialization(rule, day)
    if (!preview.ok) {
      showToast(t('toast.ruleFailed'))
      return
    }
    let write: RecurringRuleWrite
    try {
      write = repo.reactivateRecurringRule(id, preview.confirmed)
    } catch {
      showToast(t('toast.ruleFailed'))
      return
    }
    if (!write.ok) {
      showToast(refusalText(write, getAppState().day))
      return
    }
    showToast(t('toast.ruleOn', { name }))
    void repo.materializeRecurring(day).catch(() => {})
  }

  /**
   * Cancella davvero. Il foglio offre questo bottone **solo** quando
   * `planRecurringRuleDeletion` ha gia' detto di si' sul mirror; qui il permesso
   * lo rida' il disco dentro la transazione, che e' l'unico a saperlo con
   * certezza (ADR 008).
   *
   * Nessun "Annulla": ricrearla produrrebbe un record con un altro id, cioe'
   * un'altra regola. Il foglio lo dice prima di far toccare il bottone, che e'
   * il momento in cui l'informazione serve — e lo puo' dire proprio perche' la
   * cancellazione e' possibile **solo** quando non c'e' ancora nessuna storia da
   * perdere.
   */
  function deleteRule(): void {
    const repo = app.repo
    const target = ruleTarget
    if (repo === null || target === null) return
    const name = ruleName(target)
    closeSheet()
    void repo
      .deleteRecurringRule(target.id)
      .then((result) => {
        if (result.ok) showToast(t('toast.ruleDeleted', { name }))
        else showToast(t(result.reason === 'in-use' ? 'toast.ruleInUse' : 'toast.ruleFailed'))
      })
      .catch(() => showToast(t('toast.ruleFailed')))
  }

  /** Apre le azioni su una spesa. Il tap sulla riga e' l'affordance. */
  function pick(expense: Expense): void {
    clearToast()
    setPicked(expense)
  }

  /**
   * Cancellazione. E' un soft delete e si annulla dal toast: niente "Sei sicuro?".
   *
   * Serve perche' il chip della categoria e' anche il tasto di conferma (ADR 004),
   * quindi l'app **produce** una classe di errore — il tocco sul chip sbagliato —
   * e una rete che dura sei secondi non copre l'errore che si vede riguardando la
   * lista un minuto dopo.
   */
  function remove(repo: Repository, id: string, done: string): void {
    let removed: Expense | null
    try {
      removed = repo.deleteExpense(id)
    } catch {
      showToast(t('toast.deleteFailed'))
      return
    }
    if (removed === null) {
      showToast(t('toast.gone'))
      return
    }
    showToast(done, { label: t('toast.undo'), run: () => restore(repo, id) })
  }

  function restore(repo: Repository, id: string): void {
    try {
      repo.restoreExpense(id)
    } catch {
      showToast(t('toast.restoreFailed'))
      return
    }
    // Nessun secondo "Annulla": annullare un annullamento non lo fa nessuno, e
    // il rimedio vero e' la riga nello Storico, che adesso e' tornata li'.
    showToast(t('toast.restored'))
  }

  function exportNow(): void {
    const repo = app.repo
    if (!repo) return
    // Nessun await prima della chiamata: `navigator.share` ha bisogno
    // dell'attivazione utente di questo tap (vedi backup-file.ts).
    void exportBackupFile(repo).then((result) => {
      switch (result.kind) {
        case 'shared':
          // Osservato davvero: la promessa di `share()` si e' risolta.
          markBackup(repo)
          showToast(t('toast.backupShared'))
          return
        case 'downloaded':
          // **Niente markBackup qui.** `link.click()` non lancia e non
          // restituisce niente: in una PWA installata puo' non fare
          // assolutamente nulla. Scrivere `lastBackupAt` su questo ramo
          // farebbe tacere per due settimane il banner di sicurezza della
          // fase 7, sull'unico dispositivo rimasto senza copia. Un indicatore
          // che puo' sbagliare deve sbagliare verso l'allarme (CLAUDE.md).
          showToast(t('toast.backupReady', { filename: result.filename }), {
            label: t('toast.backupWhere'),
            run: () => setPanel(serializeBackup(repo)),
          })
          return
        case 'cancelled':
          showToast(t('toast.exportCancelled'))
          return
        case 'failed':
          if (result.text === null) {
            showToast(t('toast.backupUnavailable'))
            return
          }
          showToast(t('toast.backupFileFailed'), {
            label: t('toast.showData'),
            run: () => setPanel(result.text),
          })
      }
    })
  }

  /**
   * Scrive la lingua scelta. `null` **cancella** il campo, cioe' torna ad
   * "Automatica": e' l'unico verso che rende quella voce una scelta vera invece
   * di una porta a senso unico (vedi `SettingsPatch` e `Settings.tsx`).
   *
   * Ottimistica come ogni altra scrittura locale: `updateSettings` muove il
   * mirror subito, questo render finisce e il successivo e' gia' nella lingua
   * nuova — sotto i 100 ms, senza spinner. Se il disco non accetta, la
   * scrittura finisce in `writeFailures` e l'avviso "esporta adesso" compare da
   * solo: non c'e' niente di speciale da dire per la lingua.
   *
   * Il `catch` copre l'unico rifiuto sincrono possibile (un import in corso), e
   * li' un messaggio serve: la schermata resterebbe nella lingua di prima senza
   * che si capisca perche' il tap non ha fatto niente.
   */
  function saveLanguage(next: Language | null): void {
    const repo = app.repo
    if (!repo) return
    try {
      repo.updateSettings({ language: next })
    } catch {
      showToast(t('toast.languageFailed'))
    }
  }

  /**
   * La guida e' finita: si scrive lo stato, e da li' in poi non si vede piu'.
   *
   * Lo scrivono **entrambe** le uscite — "Inizia" e "Salta" — perche' un "Salta"
   * che non scrive sarebbe una parola che mente: la guida tornerebbe alla
   * prossima apertura, cioe' fra dieci secondi.
   *
   * Ottimistica come ogni scrittura locale: `updateSettings` muove il mirror e
   * questo render finisce con l'app davanti, sotto i 100 ms, senza spinner. Se
   * il disco non accetta, la scrittura finisce in `writeFailures` e l'avviso
   * "esporta adesso" compare da solo. Il `catch` copre l'unico rifiuto sincrono
   * possibile — un import in corso — che in questa fase non ha ancora una porta
   * nella UI: rimediarci con un messaggio vorrebbe dire scriverlo per uno stato
   * che nessuno puo' produrre.
   */
  function completeGuide(): void {
    const repo = app.repo
    if (!repo) return
    try {
      repo.updateSettings({ onboardingCompletedAt: nowTimestamp() })
    } catch {
      // Un import sta sostituendo i dati: la guida resta, e al prossimo render
      // lo stato arrivera' comunque dal mirror nuovo.
    }
  }

  /**
   * "Rivedi la guida": **cancella** lo stato, non apre un foglio.
   *
   * E' l'unico verso che rende la guida ritrovabile senza duplicarne
   * l'innesco: se la riaprisse come un pannello, esisterebbero due modi di
   * mostrarla — uno legato allo stato e uno a un tap — e il giorno che divergono
   * nessuno saprebbe quale dei due sta guardando. Nessun toast: la guida compare
   * nello stesso frame, ed e' il riscontro.
   */
  function replayGuide(): void {
    const repo = app.repo
    if (!repo) return
    try {
      repo.updateSettings({ onboardingCompletedAt: null })
    } catch {
      // Qui il messaggio serve: il tap non ha prodotto niente a schermo, e senza
      // una parola resterebbe un bottone che a volte non fa niente.
      showToast(t('toast.guideFailed'))
    }
  }

  /* --- le categorie ------------------------------------------------------ *
   *
   * Cinque gesti e una regola sola dietro tutti: **la griglia tiene otto**, e
   * chi la fa salire passa dal disco (ADR 012). Qui non si decide niente, si
   * chiede — e si dice all'utente cos'e' successo con i nomi veri dentro.
   */

  function openCategory(mode: CategoryMode, id: string | null): void {
    // Come per gli altri fogli: un "Annulla" appeso a una spesa che non si sta
    // piu' guardando non deve sopravvivere dietro al velo.
    clearToast()
    clearTimeout(catTimer.current)
    setSession((current) => current + 1)
    setCatSheet({ mode, id, leaving: false })
  }

  function closeCategory(): void {
    setCatSheet((current) => (current === null ? null : { ...current, leaving: true }))
    clearTimeout(catTimer.current)
    catTimer.current = window.setTimeout(() => setCatSheet(null), motionMs(200))
  }

  /**
   * Mette una categoria in griglia: quella nuova, o quella che sta in archivio.
   *
   * **Una scrittura sola**, con dentro l'archiviazione di chi esce: lo scambio
   * non puo' restare a meta', o resterebbero sette categorie in griglia — lo
   * stato peggiore, perche' e' l'unico che nessuno si aspetta.
   *
   * Non e' ottimistica, ed e' l'unica dell'app a non esserlo: il tetto si conta
   * sulle categorie che stanno sul disco, quindi non esiste nessun istante in
   * cui la UI mostra nove chip. Nessuno spinner comunque — la scrittura e'
   * locale e il foglio da' il suo riscontro nel frame del tap.
   */
  async function placeCategory(
    draft: CategoryDraft | null,
    replacing?: string,
  ): Promise<boolean> {
    const repo = app.repo
    const sheet = catSheet
    if (repo === null || sheet === null) return false
    const leaving = replacing === undefined ? undefined : categoryOf(replacing)
    try {
      const result =
        draft === null
          ? sheet.id === null
            ? null
            : await repo.unarchiveCategory(sheet.id, replacing)
          : await repo.addCategory(draft, replacing)
      if (result === null || !result.ok) return false
      closeCategory()
      showToast(
        leaving === undefined
          ? t(draft === null ? 'toast.catBack' : 'toast.catAdded', { name: result.placed.name })
          : t('toast.catSwapped', { name: result.placed.name, old: leaving.name }),
      )
      return true
    } catch {
      // Un import in corso: il foglio resta aperto e lo dice dove si riprova.
      return false
    }
  }

  /** Nome, emoji, colore. Sincrona: cambia solo cose che non toccano il tetto. */
  function saveCategory(draft: CategoryDraft): boolean {
    const repo = app.repo
    const id = catSheet?.id
    if (repo === null || id === undefined || id === null) return false
    try {
      const saved = repo.updateCategory(id, draft)
      if (saved === null) return false
      closeCategory()
      showToast(t('toast.catSaved', { name: saved.name }))
      return true
    } catch {
      return false
    }
  }

  /**
   * Archivia. **Non e' una cancellazione**: la categoria resta su tutte le spese
   * che l'hanno usata.
   *
   * Si annulla, e l'annullamento non e' un caso fortunato: archiviando si e'
   * appena liberato un posto in griglia, quindi rimetterla dentro non fa la
   * nona e non ha bisogno di chiedere niente a nessuno.
   */
  function archiveCategory(): void {
    const repo = app.repo
    const id = catSheet?.id
    if (repo === null || id === undefined || id === null) return
    let done: Category | null
    try {
      done = repo.archiveCategory(id)
    } catch {
      showToast(t('toast.catFailed'))
      return
    }
    closeCategory()
    if (done === null) {
      showToast(t('toast.catFailed'))
      return
    }
    const name = done.name
    showToast(t('toast.catArchived', { name }), {
      label: t('toast.undo'),
      run: () => {
        void repo
          .unarchiveCategory(id)
          .then((result) => {
            showToast(result.ok ? t('toast.catBack', { name }) : t('toast.catFailed'))
          })
          .catch(() => showToast(t('toast.catFailed')))
      },
    })
  }

  /**
   * Cancella davvero. Il foglio offre questo bottone **solo** quando
   * `planCategoryDeletion` ha gia' detto di si' sul mirror; qui il permesso lo
   * ridà il disco, che e' l'unico a saperlo con certezza.
   *
   * Nessun "Annulla": ricrearla produrrebbe un record con un altro id, cioe'
   * un'altra categoria con lo stesso nome. Il foglio lo dice prima di far
   * toccare il bottone, che e' il momento in cui l'informazione serve.
   */
  function deleteCategory(): void {
    const repo = app.repo
    const id = catSheet?.id
    const target = id === undefined || id === null ? undefined : categoryOf(id)
    if (repo === null || id === undefined || id === null || target === undefined) return
    closeCategory()
    void repo
      .deleteCategory(id)
      .then((result) => {
        if (result.ok) showToast(t('toast.catDeleted', { name: target.name }))
        else showToast(t(result.reason === 'in-use' ? 'toast.catInUse' : 'toast.catFailed'))
      })
      .catch(() => showToast(t('toast.catFailed')))
  }

  /**
   * Sposta di una cella. Ottimistica e immediata: l'anteprima dentro al foglio
   * si ridisegna nello stesso frame, ed e' li' che si vede l'effetto — la
   * griglia di Impostazioni sta dietro al velo.
   */
  function moveCategory(delta: number): void {
    const repo = app.repo
    const id = catSheet?.id
    if (repo === null || id === undefined || id === null) return
    const ids = categories.map((category) => category.id)
    const from = ids.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= ids.length) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    if (moved === undefined) return
    next.splice(to, 0, moved)
    try {
      repo.reorderCategories(next)
    } catch {
      showToast(t('toast.catFailed'))
    }
  }

  function markBackup(repo: Repository): void {
    try {
      repo.updateSettings({ lastBackupAt: nowTimestamp() })
    } catch {
      // Un import in corso: la data dell'ultimo backup e' l'ultima cosa di cui
      // preoccuparsi, e il backup l'utente ce l'ha comunque in mano.
    }
  }

  // Finche' c'e' un modale davanti, quello che sta dietro non esiste per le
  // tecnologie assistive. Il foglio che sta uscendo non conta: sta gia'
  // sparendo, e tenerlo qui zittirebbe il toast che nasce proprio in
  // quell'istante.
  const modal =
    guide ||
    (sheet !== null && !sheet.leaving) ||
    (catSheet !== null && !catSheet.leaving) ||
    picked !== null ||
    panel !== null

  /**
   * La regola che il foglio delle spese fisse sta mostrando, **riletta dal
   * mirror a ogni render**. `null` mentre se ne crea una nuova.
   *
   * Riletta e non congelata all'apertura: il segnaposto puo' avanzare mentre il
   * foglio e' aperto — una materializzazione al risveglio, un altro contesto —
   * e l'anteprima dentro al foglio deve annunciare la finestra vera, non quella
   * di quando lo si e' aperto.
   */
  const ruleTarget =
    sheet?.kind !== 'rule' || sheet.id === null
      ? null
      : app.data?.recurringRules.find((rule) => rule.id === sheet.id) ?? null

  /**
   * La spesa di cui si sta correggendo l'importo, **riletta dal mirror a ogni
   * render** come la regola qui sopra e per la stessa ragione: mentre il foglio
   * e' aperto una materializzazione o un altro contesto possono averla toccata,
   * e un oggetto congelato all'apertura proporrebbe come "importo di adesso" un
   * numero che sul disco non c'e' piu'.
   */
  const amountTarget =
    sheet?.kind !== 'amount' || sheet.id === null
      ? null
      : app.data?.expenses.find((expense) => expense.id === sheet.id) ?? null

  /**
   * Il permesso di cancellare **una regola**, chiesto prima di mostrare il
   * bottone, esattamente come per le categorie: il rifiuto porta con se' il
   * numero ("nello Storico ci sono 8 spese"), e con quel numero si scrive una
   * frase che dice anche cosa fare invece.
   *
   * Contano solo le spese **vive**: le lapidi no. E' una decisione del core
   * (`planRecurringRuleDeletion`), e la sua ragione e' proprio la frase che si
   * legge qui — un rifiuto che cita un numero che nello Storico non si vede
   * lascia davanti a un no non verificabile.
   */
  const ruleDeletion = useMemo(() => {
    const data = app.data
    if (data === null || ruleTarget === null) return null
    return planRecurringRuleDeletion(data.recurringRules, data.expenses, { id: ruleTarget.id })
  }, [app.data, ruleTarget])

  /** La categoria che il foglio sta mostrando, **riletta dal mirror** a ogni render. */
  const catTarget = catSheet?.id === undefined || catSheet.id === null ? null : categoryOf(catSheet.id) ?? null

  /**
   * Il permesso di cancellare, chiesto **prima** di mostrare il bottone.
   *
   * `planCategoryDeletion` e' pura e il rifiuto porta con se' i numeri ("3 spese
   * la usano"): chiederglielo qui vuol dire che chi non puo' cancellare legge
   * una frase con dentro il motivo, invece di toccare un bottone e ricevere un
   * errore.
   *
   * **Le lapidi bloccano ma non si contano**, e le due meta' hanno due ragioni
   * diverse. Bloccano perche' `restoreExpense` riporta in vita una spesa
   * cancellata con un tap, e la riga che torna ha un `categoryId` che lo
   * Storico, le statistiche e il chip dereferenziano tutti. Non si contano
   * perche' nessuna schermata le mostra: un numero che l'utente non puo'
   * riconciliare con niente non informa, rifiuta e basta.
   *
   * Percio' gli esiti sono quattro e non tre. Quando a bloccare sono **solo**
   * lapidi il core risponde `'deleted-only'`, che di numeri non ne porta
   * nessuno — e il foglio ha una frase apposta, che parla del fatto.
   */
  const catDeletion = useMemo(() => {
    const data = app.data
    if (data === null || catTarget === null) return null
    return planCategoryDeletion(
      data.categories,
      data.expenses,
      data.recurringRules,
      data.budgets,
      { id: catTarget.id },
    )
  }, [app.data, catTarget])

  return (
    <>
      <div class="app" aria-hidden={modal ? 'true' : undefined}>
        <header class="app__bar">
          <Mark />

          {/* Impostazioni a sinistra, navigazione a destra: l'angolo in alto a
              destra e' il meno scomodo dei due per un pollice destro, e va a chi
              si tocca ogni giorno.

              Qui c'era "Esporta". Le Impostazioni hanno preso il suo posto
              invece di aggiungersi: a 320 punti — il vecchio SE, o lo Zoom
              schermo di iOS — barra, due schede **e** due bottoni non ci stanno,
              e fra i due quello che si tocca una volta ogni due settimane e'
              l'export. Adesso vive dentro Impostazioni, che e' anche il posto
              dove le schermate lo mettono da sempre.

              La via urgente non e' cambiata: quando ci sono scritture non
              arrivate al disco, l'avviso qui sotto ha il suo "Esporta ora" e
              scrive con un tap solo. E' l'unico momento in cui un tap in piu'
              costerebbe dei dati. */}
          <button
            type="button"
            class="app__action"
            // Il nome accessibile non dipende dal viewport: sotto i 360 punti
            // l'etichetta visibile e' nascosta (vedi App.css) e senza questa
            // riga il bottone resterebbe un rettangolo senza nome.
            aria-label={t('settings.open')}
            aria-current={view === 'settings' ? 'page' : undefined}
            onClick={() => setView('settings')}
          >
            {/* Cursori, non un ingranaggio: a 20px un ingranaggio e' una
                macchia tonda, e la sua unica lettura sicura viene comunque
                dall'etichetta accanto. Due righe con due manopole si leggono
                anche a quella dimensione. */}
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
              <circle cx="15" cy="8" r="2.2" />
              <circle cx="9" cy="16" r="2.2" />
            </svg>
            <span class="app__label">
              <Fit k="settings.open" />
            </span>
          </button>

          {/* La navigazione sta in barra e non in fondo allo schermo: in fondo
              c'e' la fascia riservata al FAB, e una barra di schede li' dentro
              sarebbe un secondo bersaglio a un pollice di distanza da quello che
              vale piu' di tutti. Due schermate non hanno bisogno di piu' di due
              parole. */}
          <nav class="nav" aria-label={t('nav.label')}>
            <button
              type="button"
              class="nav__tab"
              aria-current={view === 'home' ? 'page' : undefined}
              onClick={() => setView('home')}
            >
              <Fit k="nav.home" />
            </button>
            <button
              type="button"
              class="nav__tab"
              aria-current={view === 'history' ? 'page' : undefined}
              onClick={() => setView('history')}
            >
              <Fit k="nav.history" />
            </button>
          </nav>
        </header>

        {/* Permanente, non un toast: dice che questa non e' la build vera. */}
        {insecureContext ? (
          <p class="alert alert--env">{t('alert.insecure')}</p>
        ) : null}

        {failures === 0 ? null : (
          <div class="alert" role="alert">
            <p class="alert__text">
              {failures === 1
                ? t('alert.failures.one')
                : t('alert.failures.other', { count: failures })}{' '}
              {t('alert.failures.tail')}
            </p>
            <button type="button" class="alert__action" onClick={exportNow}>
              {t('alert.exportNow')}
            </button>
          </div>
        )}

        <main class="app__main">
          <h1 class="visually-hidden">
            {t(view === 'home' ? 'title.home' : view === 'history' ? 'title.history' : 'title.settings')}
          </h1>
          {view === 'home' ? (
            <Home
              phase={app.phase}
              expenses={app.data?.expenses ?? []}
              categories={app.data?.categories ?? []}
              budgets={app.data?.budgets ?? []}
              day={app.day}
              onPick={pick}
              onEditBudget={() => openSheet('budget')}
            />
          ) : view === 'history' ? (
            <History
              phase={app.phase}
              expenses={app.data?.expenses ?? []}
              categories={app.data?.categories ?? []}
              day={app.day}
              onPick={pick}
            />
          ) : (
            <Settings
              chosen={chosenLanguage}
              detected={detectLanguage()}
              onLanguage={saveLanguage}
              budgetCents={currentBudgetCents(app.data?.budgets ?? [], homePeriod, app.day)}
              budgetPeriod={homePeriod}
              activeCategories={categories}
              archivedCategories={archived}
              onEditCategory={(category) => openCategory('edit', category.id)}
              onPlaceCategory={(category) => openCategory('place', category.id)}
              onNewCategory={() => openCategory('new', null)}
              backupDays={
                lastBackupAt === undefined ? null : daysSince(lastBackupAt, nowTimestamp())
              }
              rules={app.data?.recurringRules ?? []}
              day={app.day}
              ready={app.repo !== null}
              onEditBudget={() => openSheet('budget')}
              onNewRule={() => openSheet('rule')}
              onEditRule={(rule) => openSheet('rule', rule.id)}
              onExport={exportNow}
              onReplayGuide={replayGuide}
            />
          )}
        </main>

        {/* Le bande in fondo. Sono contenuto, non overlay: comparire accorcia la
            lista invece di coprire quello che c'e' sotto — e siccome il
            contenuto resta ancorato in alto, non si sposta niente (CLS = 0
            anche quando il promemoria compare all'arrivo dei dati). */}
        <BackupNudge nudge={nudge} onExport={exportNow} />
        <UpdateBanner />
        <Toast toast={toast} />

        <button
          type="button"
          class="fab"
          aria-label={t('fab.add')}
          disabled={app.repo === null}
          onClick={() => openSheet('add')}
        >
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* I modali stanno fuori da `.app`: dentro, l'`aria-hidden` che nasconde
          lo sfondo nasconderebbe anche loro. Sono `position: fixed`, e un
          eventuale transform su un antenato li ancorerebbe al contenitore
          sbagliato. */}
      {sheet?.kind === 'add' ? (
        <AddSheet
          key={session}
          categories={categories}
          day={app.day}
          coach={coach}
          leaving={sheet.leaving}
          onSave={save}
          onClose={closeSheet}
        />
      ) : null}

      {sheet?.kind === 'budget' ? (
        <BudgetSheet
          key={session}
          weeklyCents={currentBudgetCents(app.data?.budgets ?? [], 'weekly', app.day)}
          monthlyCents={currentBudgetCents(app.data?.budgets ?? [], 'monthly', app.day)}
          period={homePeriod}
          leaving={sheet.leaving}
          onSave={saveBudget}
          onClose={closeSheet}
        />
      ) : null}

      {sheet?.kind === 'rule' ? (
        <RuleSheet
          key={session}
          categories={categories}
          // ADR 019: quella che la regola ha **adesso**, anche se e' in
          // archivio. Il foglio ne fa l'unione con le otto e la marca.
          current={ruleTarget === null ? null : categoryOf(ruleTarget.categoryId) ?? null}
          target={ruleTarget}
          deletion={ruleDeletion}
          day={app.day}
          leaving={sheet.leaving}
          onSave={saveRule}
          onDeactivate={deactivateRule}
          onDelete={deleteRule}
          onClose={closeSheet}
        />
      ) : null}

      {sheet?.kind === 'amount' && amountTarget !== null ? (
        <AmountSheet
          key={session}
          expense={amountTarget}
          category={categoryOf(amountTarget.categoryId)}
          day={app.day}
          leaving={sheet.leaving}
          onSave={saveAmount}
          onClose={closeSheet}
        />
      ) : null}

      {catSheet === null ? null : (
        <CategorySheet
          key={session}
          mode={catSheet.mode}
          target={catTarget}
          active={categories}
          deletion={catDeletion}
          leaving={catSheet.leaving}
          onPlace={placeCategory}
          onSave={saveCategory}
          onArchive={archiveCategory}
          onDelete={deleteCategory}
          onMove={moveCategory}
          onClose={closeCategory}
        />
      )}

      {picked === null ? null : (
        <ExpenseActions
          expense={picked}
          category={categoryOf(picked.categoryId)}
          day={app.day}
          onFixAmount={() => {
            const target = picked
            setPicked(null)
            openSheet('amount', target.id)
          }}
          onDelete={() => {
            const repo = app.repo
            const target = picked
            setPicked(null)
            if (repo) {
              remove(repo, target.id, t('toast.deleted', { amount: money(target.amountCents) }))
            }
          }}
          onClose={() => setPicked(null)}
        />
      )}

      {/* La guida sta con gli altri modali e **dopo** di loro nel DOM: al primo
          avvio e' l'unica cosa aperta, ma se un giorno qualcosa si aprisse
          sotto, l'ordine dice gia' chi sta davanti senza un livello nuovo di
          `z-index`. Come i fogli, sta fuori da `.app`: dentro, l'`aria-hidden`
          che nasconde lo sfondo nasconderebbe anche lei. */}
      {guide ? <Guide categories={categories} onDone={completeGuide} /> : null}

      {panel === null ? null : (
        <BackupPanel
          text={panel}
          filename={backupFilename()}
          onCopied={() => {
            // Osservato davvero: `clipboard.writeText` si e' risolta.
            if (app.repo) markBackup(app.repo)
          }}
          onClose={() => setPanel(null)}
        />
      )}
    </>
  )
}
