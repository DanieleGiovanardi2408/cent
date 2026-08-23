import { Mark } from './Mark'
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
 * ## Cosa c'e', e in che ordine
 *
 * 1. **il nome e cosa fa l'app**: chi arriva qui non sa ancora se gli serve;
 * 2. **il motivo del divieto, prima delle istruzioni**. Non e' ornamentale: un
 *    divieto senza ragione si legge come un difetto, e chi trova un'app che si
 *    rifiuta di funzionare pensa che sia rotta, non che lo stia proteggendo.
 *    L'ordine e' quello: prima perche', poi come;
 * 3. **i tre passi**, con le parole che si leggono davvero sullo schermo di
 *    iOS ("Condividi", "Aggiungi a Home", "Aggiungi").
 *
 * ## Perche' non c'e' niente da toccare
 *
 * Nessun bottone, nessun campo, nessun link: **zero bersagli**. Il gesto che
 * serve sta nella barra di Safari, non in pagina — e un bottone finto che dica
 * "installa" non puo' esistere su iOS, dove non c'e' nessuna API per chiederlo.
 * Che i bersagli che scrivono siano zero, e non semplicemente nascosti, e' cio'
 * che verifica `tests/e2e/install.spec.ts`.
 */
export function Install() {
  return (
    <main class="install">
      <p class="install__brand">
        <Mark size={34} />
        <span class="install__name">Cent</span>
      </p>

      <h1 class="install__title">Aggiungi Cent alla schermata Home</h1>

      <p class="install__lead">
        Cent segna le spese di ogni giorno in due tap e ti dice quanto ti resta.
        Funziona senza rete, senza account, e i dati restano sul telefono.
      </p>

      <section class="why" aria-labelledby="why-title">
        <h2 class="why__title" id="why-title">
          I dati vivono nell&apos;app installata. Quello che scrivi qui non ci
          arriverebbe.
        </h2>
        <p class="why__text">
          Il browser e l&apos;app installata tengono due archivi separati: una
          spesa segnata qui non comparirebbe nell&apos;app, e dopo qualche giorno
          il browser la cancellerebbe da solo. Per questo qui non c&apos;è niente
          da toccare: non è una parte mancante, è l&apos;unica versione che non ti
          fa perdere quello che scrivi.
        </p>
      </section>

      <section class="how" aria-labelledby="how-title">
        <h2 class="how__title" id="how-title">
          Come si installa, in tre passi
        </h2>
        <ol class="steps">
          <li class="step">
            <span class="step__n" aria-hidden="true">
              1
            </span>
            <p class="step__text">
              Tocca <b>Condividi</b> nella barra del browser: il quadrato con la
              freccia rivolta verso l&apos;alto.
            </p>
          </li>
          <li class="step">
            <span class="step__n" aria-hidden="true">
              2
            </span>
            <p class="step__text">
              Scorri l&apos;elenco e scegli <b>Aggiungi a Home</b>.
            </p>
          </li>
          <li class="step">
            <span class="step__n" aria-hidden="true">
              3
            </span>
            <p class="step__text">
              Conferma con <b>Aggiungi</b>. Cent compare fra le app: aprila da lì
              ed è pronta.
            </p>
          </li>
        </ol>
      </section>

      {/* Su Android e desktop l'installazione esiste ma sta in un altro menu, e
          il motivo del cancello e' lo stesso. Una riga sola: senza, chi non e'
          su iPhone legge tre passi che non trova e resta fermo li'. */}
      <p class="install__other">
        Su Android, Chrome o Edge il comando è nel menu del browser:{' '}
        <b>Installa app</b>. Il motivo è lo stesso.
      </p>
    </main>
  )
}
