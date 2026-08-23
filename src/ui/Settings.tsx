import type { BudgetPeriod, Language } from '../core/types'
import { LANGUAGE_NAMES, cadenceLabel, money, t } from './i18n'
import './Settings.css'

/**
 * Impostazioni, versione minima della fase 3: **lingua, budget, dati**.
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
 * - **le categorie** (passo 3): una sezione fra Lingua e Budget. Il posto e'
 *   quello, e la nota che serve a chi la costruira' e' in ADR 012 — non esiste
 *   un "ripristina dall'archivio", perche' farebbe la nona: dall'elenco delle
 *   archiviate il gesto e' lo stesso dell'aggiunta, si tocca e l'app chiede
 *   quale sostituisce;
 * - **"rivedi la guida"** (passo 4): una riga in fondo. Oggi non esiste
 *   nemmeno la guida da rivedere, e un bottone che non fa niente e' un TODO
 *   travestito da funzione (CLAUDE.md, "Niente TODO orfani");
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
  /** Il database e' aperto: prima non c'e' niente da scrivere. */
  readonly ready: boolean
  readonly onEditBudget: () => void
  readonly onExport: () => void
}

export function Settings({
  chosen,
  detected,
  onLanguage,
  budgetCents,
  budgetPeriod,
  ready,
  onEditBudget,
  onExport,
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
        <button type="button" class="prefs__action" disabled={!ready} onClick={onExport}>
          {t('settings.data.export')}
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
