import { render } from 'preact'
import { App } from '../ui/App'
import { isStandaloneDisplay, requestPersistentStorage } from './persist'
import { registerServiceWorker } from './sw-update'
import '../ui/tokens.css'
import '../ui/reset.css'

// Il tema segue `prefers-color-scheme` e basta: lo decide il CSS, prima del
// primo frame, senza una riga di JavaScript e senza rischio di flash.
// Serve alla UI per dire la cosa giusta: in standalone "Aggiungi a Home" e' rumore.
document.documentElement.dataset['display'] = isStandaloneDisplay() ? 'standalone' : 'browser'

const root = document.getElementById('app')
if (root) render(<App />, root)

// Niente di tutto questo serve al primo frame: si fa dopo il load, per non
// rubare banda alla prima pittura. Non usiamo requestAnimationFrame: in una
// scheda nascosta non scatta, e il service worker non si registrerebbe mai.
function afterLoad(task: () => void): void {
  if (document.readyState === 'complete') setTimeout(task, 0)
  else addEventListener('load', () => setTimeout(task, 0), { once: true })
}

afterLoad(() => {
  registerServiceWorker()
  void requestPersistentStorage()
})
