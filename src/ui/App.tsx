import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { backupFilename, exportBackupFile, serializeBackup } from '../app/backup-file'
import { getAppState, refreshDay } from '../app/boot'
import { activeCategories, archivedCategories, planCategoryDeletion } from '../core/categories'
import type { Repository } from '../core/repository'
import { nowTimestamp } from '../core/types'
import type { BudgetPeriod, Category, Expense, Language } from '../core/types'
import { AddSheet } from './AddSheet'
import type { SaveInput } from './AddSheet'
import { BackupNudge } from './BackupNudge'
import { backupNudge, daysSince } from './backup-nudge'
import { BackupPanel } from './BackupPanel'
import { BudgetSheet } from './BudgetSheet'
import { CategorySheet } from './CategorySheet'
import type { CategoryDraft, CategoryMode } from './CategorySheet'
import { ExpenseActions } from './ExpenseActions'
import { Fit } from './Fit'
import { History } from './History'
import { Home } from './Home'
import { Mark } from './Mark'
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
 * Quale foglio e' aperto, e se sta gia' uscendo. Sono due — inserimento e
 * budget — e non possono essere aperti insieme: `null` significa nessuno.
 */
type Sheet = { readonly kind: 'add' | 'budget'; readonly leaving: boolean } | null

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

  function openSheet(kind: 'add' | 'budget'): void {
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
    setSheet({ kind, leaving: false })
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
    (sheet !== null && !sheet.leaving) ||
    (catSheet !== null && !catSheet.leaving) ||
    picked !== null ||
    panel !== null

  /** La categoria che il foglio sta mostrando, **riletta dal mirror** a ogni render. */
  const catTarget = catSheet?.id === undefined || catSheet.id === null ? null : categoryOf(catSheet.id) ?? null

  /**
   * Il permesso di cancellare, chiesto **prima** di mostrare il bottone.
   *
   * `planCategoryDeletion` e' pura e il rifiuto porta con se' i numeri ("3 spese
   * la usano"): chiederglielo qui vuol dire che chi non puo' cancellare legge
   * una frase con dentro il motivo, invece di toccare un bottone e ricevere un
   * errore. Le spese contano tutte, cancellate comprese: un soft delete resta
   * nello Storico e nell'export, quindi il riferimento e' vivo.
   */
  const catDeletion = useMemo(() => {
    const data = app.data
    if (data === null || catTarget === null) return null
    return planCategoryDeletion(data.categories, data.expenses, data.recurringRules, {
      id: catTarget.id,
    })
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
              ready={app.repo !== null}
              onEditBudget={() => openSheet('budget')}
              onExport={exportNow}
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
