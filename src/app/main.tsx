import { render } from 'preact'
import { App } from '../ui/App'
import { Install } from '../ui/Install'
import { boot } from './boot'
import { readDisplayContext, writesAreBlocked } from './install-gate'
import { clearRetiredStorageKeys } from './legacy-cleanup'
import { requestPersistentStorage } from './persist'
import { registerServiceWorker } from './sw-update'
import '../ui/tokens.css'
import '../ui/reset.css'

// Il tema segue `prefers-color-scheme` e basta: lo decide il CSS, prima del
// primo frame, senza una riga di JavaScript e senza rischio di flash.
const display = readDisplayContext()

// Serve alla UI per dire la cosa giusta: in standalone "Aggiungi a Home" e' rumore.
document.documentElement.dataset['display'] = display.standalone ? 'standalone' : 'browser'

/**
 * Il cancello di ADR 011: fuori da standalone, sull'origine di produzione, Cent
 * **e'** la pagina di installazione. Non un'app ridotta, non un avviso sopra
 * l'app: un'altra schermata, e nessun percorso che scriva.
 *
 * Da qui discendono tre cose, tutte qui sotto e tutte per la stessa ragione —
 * lo storage del browser non e' quello dell'app installata, quindi qualunque
 * cosa scrivessimo qui finirebbe in una sandbox che l'app non vedra' mai e che
 * WebKit cancella dopo sette giorni di inattivita':
 *
 * 1. si dipinge `Install` invece di `App`;
 * 2. **`boot()` non parte**. Non e' una rifinitura: aprire il repository su un
 *    database vuoto ci scrive dentro le otto categorie di default e le
 *    impostazioni. Sarebbe una scrittura vera, fatta prima di qualunque tap;
 * 3. niente `requestPersistentStorage()` (chiederebbe di rendere permanente la
 *    sandbox sbagliata) e niente pulizia delle chiavi ritirate: entrambe
 *    parlano di uno stato che qui non esiste.
 *
 * Il service worker invece si registra lo stesso: non scrive dati dell'utente,
 * e mette in cache proprio questa pagina — chi torna sul link senza rete trova
 * le istruzioni invece di un errore del browser.
 */
const blocked = writesAreBlocked(display)

// --- ordine di pittura: guscio -> apertura repository -> dati ---------------
//
// Prima il guscio, sincrono. `render` costruisce il DOM definitivo per layout e
// dimensioni: barra, lista vuota, FAB. Nessuna misura cambiera' quando i dati
// arriveranno (CLS 0). La pagina di installazione e' gia' definitiva al primo
// frame: non aspetta niente, perche' non legge niente.
const root = document.getElementById('app')
if (root) render(blocked ? <Install /> : <App />, root)

// Poi il database. `boot()` ritorna subito: la prima cosa che fa e' una lettura
// asincrona, quindi questo task finisce e il browser dipinge. Aspettare qui
// `openRepository()` metterebbe la lettura di 5.000 record davanti al primo
// frame — e' il motivo per cui la regola sta in CLAUDE.md.
if (!blocked) boot()

// Niente di tutto questo serve al primo frame: si fa dopo il load, per non
// rubare banda alla prima pittura. Non usiamo requestAnimationFrame: in una
// scheda nascosta non scatta, e il service worker non si registrerebbe mai.
function afterLoad(task: () => void): void {
  if (document.readyState === 'complete') setTimeout(task, 0)
  else addEventListener('load', () => setTimeout(task, 0), { once: true })
}

afterLoad(() => {
  registerServiceWorker()
  if (blocked) return
  void requestPersistentStorage()
  clearRetiredStorageKeys()
})
