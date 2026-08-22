import { UpdateBanner } from './UpdateBanner'
import './App.css'

/** Il marchio: il simbolo del centesimo, lo stesso disegno delle icone. */
function Mark() {
  return (
    <svg class="mark" viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
      <rect class="mark__bg" width="64" height="64" rx="14.3" />
      <path class="mark__fg" d="M43.9 22.0A15.5 15.5 0 1 0 43.9 42.0" />
      <path class="mark__fg" d="M32 11V53" />
    </svg>
  )
}

export function App() {
  return (
    <>
      {/* Fuori da .app di proposito: e' `position: fixed` e un eventuale
          transform su un antenato lo ancorerebbe al contenitore sbagliato. */}
      <UpdateBanner />

      <div class="app">
        <header class="app__bar">
          <Mark />
          <span class="app__name">Cent</span>
        </header>

        <main class="app__main">
          <h1 class="greeting">Ciao</h1>
          <p class="lead">
            Cent è pronta. Segnerai quello che spendi in pochi secondi, anche senza rete.
          </p>
          <ul class="facts">
            <li class="fact">Funziona offline</li>
            <li class="fact">I dati restano qui</li>
          </ul>
        </main>

        <footer class="app__foot">
          <p class="hint hint--install">
            Tocca Condividi, poi «Aggiungi a Home»: si apre a schermo intero e parte anche in aereo.
          </p>
          <p class="hint hint--standalone">
            Installata. Da qui in avanti si apre anche senza connessione.
          </p>
        </footer>
      </div>
    </>
  )
}
