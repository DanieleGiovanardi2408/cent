import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { backupFilename, exportBackupFile, serializeBackup } from '../app/backup-file'
import { getAppState, refreshDay } from '../app/boot'
import type { Repository } from '../core/repository'
import { formatCents } from '../core/money'
import { nowTimestamp } from '../core/types'
import type { BudgetPeriod, Category, Expense } from '../core/types'
import { AddSheet } from './AddSheet'
import type { SaveInput } from './AddSheet'
import { BackupPanel } from './BackupPanel'
import { BudgetSheet } from './BudgetSheet'
import { ExpenseActions } from './ExpenseActions'
import { History } from './History'
import { Home } from './Home'
import { Mark } from './Mark'
import { activePeriod, currentBudgetCents } from './budget-view'
import { Toast } from './Toast'
import type { ToastAction, ToastData } from './Toast'
import { UpdateBanner } from './UpdateBanner'
import { insecureContext } from './env'
import { dayHeading } from './labels'
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
type View = 'home' | 'history'

let toastSeq = 0

/** Quanto vive un toast: sei secondi se c'e' qualcosa da annullare, se no quattro. */
const TOAST_MS = { plain: 4000, action: 6000 } as const

export function App() {
  const app = useApp()
  const [view, setView] = useState<View>('home')
  const [sheet, setSheet] = useState<Sheet>(null)
  /** Cambia a ogni apertura: rimonta il foglio, cosi' non eredita mai un importo. */
  const [session, setSession] = useState(0)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [panel, setPanel] = useState<string | null>(null)
  /** La spesa su cui si e' toccato nello Storico: apre il foglio delle azioni. */
  const [picked, setPicked] = useState<Expense | null>(null)
  const closeTimer = useRef(0)
  const toastTimer = useRef(0)
  /** Quando il toast corrente deve sparire, in ora dell'orologio (non di un timer). */
  const toastUntil = useRef(0)

  const categories = useMemo(
    () =>
      (app.data?.categories ?? [])
        .filter((category) => !category.archived)
        .slice()
        .sort((a, b) => a.order - b.order),
    [app.data?.categories],
  )

  const failures = app.data?.writeFailures.count ?? 0

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
    showToast(`${formatCents(expense.amountCents)} · ${category?.name ?? 'Spesa'}${when}`, {
      label: 'Annulla',
      run: () => remove(repo, expense.id, 'Spesa annullata'),
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
      `Budget: ${formatCents(amountCents)} ${period === 'weekly' ? 'a settimana' : 'al mese'}`,
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
      showToast('Non sono riuscito a eliminarla. Riprova.')
      return
    }
    if (removed === null) {
      showToast('Questa spesa non c’è più.')
      return
    }
    showToast(done, { label: 'Annulla', run: () => restore(repo, id) })
  }

  function restore(repo: Repository, id: string): void {
    try {
      repo.restoreExpense(id)
    } catch {
      showToast('Non sono riuscito a rimetterla. Riprova.')
      return
    }
    // Nessun secondo "Annulla": annullare un annullamento non lo fa nessuno, e
    // il rimedio vero e' la riga nello Storico, che adesso e' tornata li'.
    showToast('Spesa ripristinata')
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
          showToast('Backup condiviso.')
          return
        case 'downloaded':
          // **Niente markBackup qui.** `link.click()` non lancia e non
          // restituisce niente: in una PWA installata puo' non fare
          // assolutamente nulla. Scrivere `lastBackupAt` su questo ramo
          // farebbe tacere per due settimane il banner di sicurezza della
          // fase 7, sull'unico dispositivo rimasto senza copia. Un indicatore
          // che puo' sbagliare deve sbagliare verso l'allarme (CLAUDE.md).
          showToast(`Backup pronto: ${result.filename}`, {
            label: 'Non lo trovi?',
            run: () => setPanel(serializeBackup(repo)),
          })
          return
        case 'cancelled':
          showToast('Esportazione annullata: nessun backup salvato.')
          return
        case 'failed':
          if (result.text === null) {
            showToast('Non riesco a preparare il backup.')
            return
          }
          showToast('Il file non si è salvato.', {
            label: 'Mostra i dati',
            run: () => setPanel(result.text),
          })
      }
    })
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
  const modal = (sheet !== null && !sheet.leaving) || picked !== null || panel !== null

  return (
    <>
      <div class="app" aria-hidden={modal ? 'true' : undefined}>
        <header class="app__bar">
          <Mark />

          {/* Export a sinistra, navigazione a destra: l'angolo in alto a destra
              e' il meno scomodo dei due per un pollice destro, e va a chi si
              tocca ogni giorno. Prima era l'opposto — le schede nell'angolo piu'
              lontano dal FAB e "Esporta", che si tocca una volta ogni due
              settimane, nel posto buono. */}
          <button
            type="button"
            class="app__action"
            disabled={app.repo === null}
            onClick={exportNow}
          >
            <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
              <path d="M12 3v12" />
              <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
              <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
            </svg>
            Esporta
          </button>

          {/* La navigazione sta in barra e non in fondo allo schermo: in fondo
              c'e' la fascia riservata al FAB, e una barra di schede li' dentro
              sarebbe un secondo bersaglio a un pollice di distanza da quello che
              vale piu' di tutti. Due schermate non hanno bisogno di piu' di due
              parole. */}
          <nav class="nav" aria-label="Schermate">
            <button
              type="button"
              class="nav__tab"
              aria-current={view === 'home' ? 'page' : undefined}
              onClick={() => setView('home')}
            >
              Home
            </button>
            <button
              type="button"
              class="nav__tab"
              aria-current={view === 'history' ? 'page' : undefined}
              onClick={() => setView('history')}
            >
              Storico
            </button>
          </nav>
        </header>

        {/* Permanente, non un toast: dice che questa non e' la build vera. */}
        {insecureContext ? (
          <p class="alert alert--env">
            Connessione non sicura (http): il service worker non viene registrato,
            quindi qui l&apos;app non funziona offline e non è quella che girerà sul telefono.
          </p>
        ) : null}

        {failures === 0 ? null : (
          <div class="alert" role="alert">
            <p class="alert__text">
              {failures === 1
                ? 'Una modifica non è arrivata sul dispositivo.'
                : `${failures} modifiche non sono arrivate sul dispositivo.`}{' '}
              Il backup contiene tutto quello che vedi qui: esportalo adesso.
            </p>
            <button type="button" class="alert__action" onClick={exportNow}>
              Esporta ora
            </button>
          </div>
        )}

        <main class="app__main">
          <h1 class="visually-hidden">
            {view === 'home' ? 'Quanto ti resta' : 'Le tue spese'}
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
          ) : (
            <History
              phase={app.phase}
              expenses={app.data?.expenses ?? []}
              categories={app.data?.categories ?? []}
              day={app.day}
              onPick={pick}
            />
          )}
        </main>

        {/* Le due bande in fondo. Sono contenuto, non overlay: comparire accorcia
            la lista invece di coprire quello che c'e' sotto. */}
        <UpdateBanner />
        <Toast toast={toast} />

        <button
          type="button"
          class="fab"
          aria-label="Aggiungi una spesa"
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
          period={activePeriod(app.data?.budgets ?? [], app.day)}
          leaving={sheet.leaving}
          onSave={saveBudget}
          onClose={closeSheet}
        />
      ) : null}

      {picked === null ? null : (
        <ExpenseActions
          expense={picked}
          category={categoryOf(picked.categoryId)}
          day={app.day}
          onDelete={() => {
            const repo = app.repo
            const target = picked
            setPicked(null)
            if (repo) remove(repo, target.id, `Eliminata: ${formatCents(target.amountCents)}`)
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
