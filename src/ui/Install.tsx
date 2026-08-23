import { Mark } from './Mark'
import { t } from './i18n'
import './Install.css'

/**
 * Fuori da standalone, Cent **e'** questa pagina (ADR 011).
 *
 * ## Non e' un messaggio d'errore
 *
 * E' la prima cosa che vede chiunque apra il link, e per la maggior parte delle
 * persone sara' l'unica prima di installare: quindi ha lo stesso trattamento di
 * ogni altra schermata — safe area, contrasto AA in entrambi i temi, nessuno
 * scroll orizzontale, e il guscio dipinto al primo frame perche' qui non ci sono
 * dati da aspettare (il database non viene nemmeno aperto).
 *
 * ## E' la prima schermata che e' stata tradotta
 *
 * Non per ordine alfabetico: e' **l'unica schermata che parla a chi non ha
 * ancora l'app**, quindi e' l'unico posto in cui una parola incomprensibile si
 * paga con una persona che chiude la pagina e non torna. Tutte le altre
 * schermate le legge chi ha gia' installato, cioe' chi ha gia' deciso.
 *
 * Qui la lingua non puo' venire da `Settings`: il database non e' aperto, e
 * aprirlo sarebbe la scrittura che ADR 011 vieta. Viene da `navigator`, e basta
 * — **inglese salvo prova contraria**, perche' la lingua condivisa di un gruppo
 * Erasmus e' l'inglese.
 *
 * ## Cosa c'e', e in che ordine
 *
 * 1. **il nome e cosa fa l'app**: chi arriva qui non sa ancora se gli serve;
 * 2. **il motivo del divieto, prima delle istruzioni**. Non e' ornamentale: un
 *    divieto senza ragione si legge come un difetto, e chi trova un'app che si
 *    rifiuta di funzionare pensa che sia rotta, non che lo stia proteggendo.
 *    L'ordine e' quello: prima perche', poi come;
 * 3. **i tre passi**, con le parole che si leggono davvero sullo schermo di
 *    iOS ("Condividi", "Aggiungi a Home", "Aggiungi"; in inglese "Share",
 *    "Add to Home Screen", "Add" — sono le voci vere del menu di Safari, non
 *    una traduzione delle nostre).
 *
 * ## Perche' non c'e' niente da toccare
 *
 * Nessun bottone, nessun campo, nessun link: **zero bersagli**. Il gesto che
 * serve sta nella barra di Safari, non in pagina — e un bottone finto che dica
 * "installa" non puo' esistere su iOS, dove non c'e' nessuna API per chiederlo.
 * Che i bersagli che scrivono siano zero, e non semplicemente nascosti, e' cio'
 * che verifica `tests/e2e/install.spec.ts`.
 *
 * Vale anche per la lingua: **qui non c'e' nessun selettore**. Sceglierla e'
 * un'impostazione, le impostazioni stanno nell'app, e l'app e' quella
 * installata. Un selettore qui scriverebbe nella sandbox sbagliata.
 */
export function Install() {
  return (
    <main class="install">
      <p class="install__brand">
        <Mark size={34} />
        <span class="install__name">Cent</span>
      </p>

      <h1 class="install__title">{t('install.title')}</h1>

      <p class="install__lead">{t('install.lead')}</p>

      <section class="why" aria-labelledby="why-title">
        <h2 class="why__title" id="why-title">
          {t('install.why.title')}
        </h2>
        <p class="why__text">{t('install.why.text')}</p>
      </section>

      <section class="how" aria-labelledby="how-title">
        <h2 class="how__title" id="how-title">
          {t('install.how.title')}
        </h2>
        <ol class="steps">
          <Step n={1} before="install.step1.before" strong="install.step1.strong" after="install.step1.after" />
          <Step n={2} before="install.step2.before" strong="install.step2.strong" after="install.step2.after" />
          <Step n={3} before="install.step3.before" strong="install.step3.strong" after="install.step3.after" />
        </ol>
      </section>

      {/* Su Android e desktop l'installazione esiste ma sta in un altro menu, e
          il motivo del cancello e' lo stesso. Una riga sola: senza, chi non e'
          su iPhone legge tre passi che non trova e resta fermo li'. */}
      <p class="install__other">
        {t('install.other.before')}
        <b>{t('install.other.strong')}</b>
        {t('install.other.after')}
      </p>
    </main>
  )
}

/**
 * Un passo, in tre pezzi.
 *
 * Il grassetto e' sulla voce di menu da cercare, e per questo la frase e'
 * spezzata in tre chiavi invece di essere una stringa con dell'HTML dentro:
 * l'HTML nel dizionario significherebbe `dangerouslySetInnerHTML`, cioe' una
 * porta aperta per far entrare markup da una traduzione. Tre chiavi sono piu'
 * noiose e non aprono niente.
 */
function Step({
  n,
  before,
  strong,
  after,
}: {
  readonly n: number
  readonly before: Parameters<typeof t>[0]
  readonly strong: Parameters<typeof t>[0]
  readonly after: Parameters<typeof t>[0]
}) {
  return (
    <li class="step">
      <span class="step__n" aria-hidden="true">
        {n}
      </span>
      <p class="step__text">
        {t(before)}
        <b>{t(strong)}</b>
        {t(after)}
      </p>
    </li>
  )
}
