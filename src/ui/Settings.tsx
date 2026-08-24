import type { BudgetPeriod, Category, Language } from '../core/types'
import { Categories } from './Categories'
import { LANGUAGE_NAMES, cadenceLabel, daysLabel, money, t } from './i18n'
import './Settings.css'

/**
 * Impostazioni: **lingua, categorie, budget, dati, guida**. E' la versione
 * minima della fase 3, e sono le cinque cose che la fase chiedeva.
 *
 * ## Non e' un foglio, e' una schermata
 *
 * I due bottom sheet dell'app (inserimento, budget) esistono perche' si aprono
 * sopra qualcosa che si sta guardando e si chiudono in un gesto. Qui non c'e'
 * niente sotto da guardare, e la schermata puo' crescere: dal passo 3 ci
 * arrivano le categorie, dal 4 "rivedi la guida". Un foglio che diventa lungo e'
 * un foglio che scorre sotto il pollice mentre il velo si comporta come se fosse
 * ancora un foglio.
 *
 * Ci si torna indietro con le schede della barra, che restano visibili: in
 * standalone non c'e' il tasto Indietro del browser (ADR 002), quindi ogni
 * schermata deve avere la sua uscita **in vista**, non nel gesto di sistema.
 *
 * ## Cosa non c'e' ancora, e dove andra'
 *
 * ("rivedi la guida" c'e': e' l'ultima sezione, ed e' arrivata con la guida
 * stessa nel passo 4. Un bottone che non fa niente sarebbe stato un TODO
 * travestito da funzione, quindi e' nato insieme a cio' che riapre.)
 *
 * - **il tema** chiaro/scuro/auto: rimandato, e non da adesso — segue
 *   `prefers-color-scheme` e la preferenza esplicita richiede di aggiornare
 *   anche i due `<meta name="theme-color">`, che le media query da sole non
 *   coprono.
 *
 * ## Perche' l'export e' qui e non piu' in barra
 *
 * Perche' la barra doveva ospitare l'ingresso alle Impostazioni e due bersagli
 * di quel tipo non ci stanno a 320 punti — e fra i due, quello che si tocca una
 * volta ogni due settimane e' l'export. Il tap in piu' lo paga la cosa rara.
 *
 * **La via urgente non e' cambiata**: quando ci sono scritture non arrivate al
 * disco, l'avviso in cima all'app ha il suo "Esporta ora" che scrive subito.
 * Quello e' il momento in cui un tap in piu' costerebbe dei dati, ed e' rimasto
 * a zero tap di distanza.
 */

interface Props {
  /**
   * La lingua **scelta**, cioe' cio' che c'e' scritto in `Settings.language`.
   * `undefined` non e' "italiano": e' "nessuno l'ha scelta", ed e' la voce
   * Automatica.
   */
  readonly chosen: Language | undefined
  /** Quella che l'ambiente dice adesso: la nota sotto "Automatica". */
  readonly detected: Language
  /** `null` **cancella** il campo, cioe' torna ad Automatica. Vedi sotto. */
  readonly onLanguage: (next: Language | null) => void
  /** Il budget in vigore oggi per il periodo che la Home sta mostrando. */
  readonly budgetCents: number | null
  readonly budgetPeriod: BudgetPeriod
  /** Le otto in griglia, nell'ordine vero. */
  readonly activeCategories: readonly Category[]
  /** Tutte le altre: l'archivio non ha tetto. */
  readonly archivedCategories: readonly Category[]
  readonly onEditCategory: (category: Category) => void
  readonly onPlaceCategory: (category: Category) => void
  readonly onNewCategory: () => void
  /**
   * Giorni dall'ultimo backup **osservato**, `null` se non ce n'e' mai stato
   * uno. E' lo stesso dato che accende il promemoria in fondo alla colonna,
   * detto qui in forma di stato invece che di richiamo: chi arriva qui di sua
   * volonta' non ha bisogno di essere sollecitato, ha bisogno di sapere.
   */
  readonly backupDays: number | null
  /** Il database e' aperto: prima non c'e' niente da scrivere. */
  readonly ready: boolean
  readonly onEditBudget: () => void
  readonly onExport: () => void
  /**
   * Rimette la guida davanti. **Cancella** `onboardingCompletedAt` invece di
   * aprire un pannello: la guida e' agganciata a quello stato e a nient'altro,
   * e un secondo innesco sarebbe un secondo modo di mostrarla che il giorno che
   * diverge non si sa piu' quale si sta guardando.
   */
  readonly onReplayGuide: () => void
}

export function Settings({
  chosen,
  detected,
  onLanguage,
  budgetCents,
  budgetPeriod,
  activeCategories,
  archivedCategories,
  onEditCategory,
  onPlaceCategory,
  onNewCategory,
  backupDays,
  ready,
  onEditBudget,
  onExport,
  onReplayGuide,
}: Props) {
  return (
    <div class="prefs">
      <section class="prefs__group" aria-labelledby="prefs-lang">
        <h2 class="prefs__title" id="prefs-lang">
          {t('settings.language.title')}
        </h2>

        {/* Tre voci, non due, e la terza non e' una comodita': e' lo stato
            "nessuno l'ha scelta" reso rappresentabile.

            Con due sole voci, mostrare come selezionata la lingua **rilevata**
            sarebbe gia' una bugia — nessuno l'ha scelta — e toccarla
            scriverebbe nel database una decisione che l'utente non ha preso,
            trasformando in silenzio una derivazione in una scelta. Da quel
            momento nessuno potrebbe piu' distinguere "ha scelto italiano" da
            "gliel'abbiamo indovinato", e chi cambia la lingua del telefono si
            ritroverebbe l'app ferma su una scelta che non ricorda di aver
            fatto.

            Quindi Automatica e' una voce vera e sceglierla e' un'azione vera:
            scrive la **cancellazione** del campo (`language: null`), che
            `SettingsPatch` accetta proprio per questo. */}
        <div class="picks" role="radiogroup" aria-label={t('settings.language.group')}>
          <Pick
            label={t('settings.language.auto')}
            note={t('settings.language.autoNote', { lang: t(LANGUAGE_NAMES[detected]) })}
            selected={chosen === undefined}
            disabled={!ready}
            onPick={() => onLanguage(null)}
          />
          <Pick
            label={t('settings.language.it')}
            selected={chosen === 'it'}
            disabled={!ready}
            onPick={() => onLanguage('it')}
          />
          <Pick
            label={t('settings.language.en')}
            selected={chosen === 'en'}
            disabled={!ready}
            onPick={() => onLanguage('en')}
          />
        </div>
      </section>

      {/* Le categorie stanno fra la lingua e il budget, e non e' un ordine
          alfabetico: e' l'ordine in cui si arriva qui la prima volta. Chi
          installa l'app da un link ricevuto cambia prima la lingua, poi si
          trova due chip che non c'entrano niente con la sua vita. */}
      <Categories
        active={activeCategories}
        archived={archivedCategories}
        ready={ready}
        onEdit={onEditCategory}
        onPlace={onPlaceCategory}
        onNew={onNewCategory}
      />

      <section class="prefs__group" aria-labelledby="prefs-budget">
        <h2 class="prefs__title" id="prefs-budget">
          {t('settings.budget.title')}
        </h2>
        <p class="prefs__text">
          {budgetCents === null
            ? t('settings.budget.none')
            : t('settings.budget.current', {
                amount: money(budgetCents),
                cadence: cadenceLabel(budgetPeriod),
              })}
        </p>
        {/* Lo stesso foglio della Home, non una seconda strada per scrivere un
            budget: due editor dello stesso record storicizzato sarebbero due
            posti in cui sbagliare `effectiveFrom`. */}
        <button type="button" class="prefs__action" disabled={!ready} onClick={onEditBudget}>
          {t(budgetCents === null ? 'settings.budget.set' : 'settings.budget.edit')}
        </button>
      </section>

      <section class="prefs__group" aria-labelledby="prefs-data">
        <h2 class="prefs__title" id="prefs-data">
          {t('settings.data.title')}
        </h2>
        <p class="prefs__text">{t('settings.data.text')}</p>
        {/* Lo stato dell'ultima copia, qui e non solo nel promemoria: e' la
            risposta alla domanda che si fa arrivando in questa sezione ("ce
            l'ho un backup?"), e senza di essa il bottone non dice se serve
            toccarlo. Sull'assenza non si mente: `lastBackupAt` si scrive solo
            sugli esiti osservati, quindi "mai esportato" a volte e' pessimista
            — ed e' la direzione giusta. */}
        <p class="prefs__text">
          {backupDays === null
            ? t('settings.data.never')
            : t('settings.data.last', { days: daysLabel(backupDays) })}
        </p>
        <button type="button" class="prefs__action" disabled={!ready} onClick={onExport}>
          {t('settings.data.export')}
        </button>
      </section>

      {/* Ultima, ed e' la posizione giusta: e' la voce che si cerca una volta
          sola, e chi la cerca la cerca **qui dentro** — dove ADR 009 la manda,
          visto che la guida non ha un tasto suo da nessun'altra parte. */}
      <section class="prefs__group" aria-labelledby="prefs-guide">
        <h2 class="prefs__title" id="prefs-guide">
          {t('settings.guide.title')}
        </h2>
        <p class="prefs__text">{t('settings.guide.text')}</p>
        <button type="button" class="prefs__action" disabled={!ready} onClick={onReplayGuide}>
          {t('settings.guide.again')}
        </button>
      </section>
    </div>
  )
}

/**
 * Una voce del selettore.
 *
 * E' un `button` con `role="radio"` e non un `<input type="radio">`: l'input
 * nativo porta con se' il proprio disegno, che su iOS non si toglie senza
 * `appearance: none` e una seconda implementazione del segno di spunta. Con
 * `aria-checked` il ruolo per le tecnologie assistive e' lo stesso, e il
 * bersaglio e' tutta la riga invece del pallino.
 *
 * Il selezionato **non si distingue per il solo colore**: ha il segno di spunta
 * e una superficie sua. E' la stessa regola della scheda attiva nella barra —
 * il colore da solo sparisce a chi ha una carenza cromatica e sotto il sole.
 */
function Pick({
  label,
  note,
  selected,
  disabled,
  onPick,
}: {
  readonly label: string
  readonly note?: string
  readonly selected: boolean
  readonly disabled: boolean
  readonly onPick: () => void
}) {
  return (
    <button
      type="button"
      class="pick"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onPick}
    >
      <span class="pick__text">
        <span class="pick__label">{label}</span>
        {note === undefined ? null : <span class="pick__note">{note}</span>}
      </span>
      {/* Sempre nel DOM, anche non selezionato: e' `visibility` e non un nodo
          che compare, cosi' la riga non cambia larghezza quando la spunta si
          sposta e la lista non si muove sotto il dito. */}
      <svg class="pick__mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="m5 12.5 5 5 9-11" />
      </svg>
    </button>
  )
}
