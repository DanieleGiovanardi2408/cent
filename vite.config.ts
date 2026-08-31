import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// L'app e' servita da https://<utente>.github.io/cent/ .
// base, start_url e scope devono restare allineati: se divergono il service
// worker registra uno scope sbagliato e la PWA non parte offline. Vedi ADR 001.
const BASE = '/cent/'

import { spawnSync } from 'node:child_process'

/**
 * **Quale build si sta guardando.**
 *
 * L'aggiornamento e' `registerType: 'prompt'`: chi non accetta il prompt resta
 * su una build vecchia, e non c'e' modo di saperlo dallo schermo. E' gia'
 * successo — una schermata giudicata su una build diversa da quella pubblicata,
 * e un giro di messaggi per scoprirlo. Per il test degli amici *"quale build hai
 * visto"* deve avere una risposta, e la risposta non puo' essere una domanda.
 *
 * Si legge da git **al momento della build** e diventa una costante nel bundle:
 * niente rete, niente file in piu', e in sviluppo un ripiego che dice di esserlo
 * invece di far fallire il comando dove git non c'e'.
 */
function buildStamp(): { readonly commit: string; readonly date: string } {
  // `spawnSync` e non `execSync`, per la stessa ragione scritta in
  // `tests/node-child-process.d.ts`: il secondo **lancia** su uscita diversa da
  // zero, e qui l'uscita diversa da zero e' un caso normale — un clone senza
  // `.git`, o `git` che non c'e'. Un timbro mancante non deve fermare una build.
  const git = (...args: readonly string[]): string | null => {
    const r = spawnSync('git', args, { encoding: 'utf8' })
    return r.status === 0 ? r.stdout.trim() : null
  }
  return {
    commit: git('rev-parse', '--short', 'HEAD') ?? 'dev',
    date: git('log', '-1', '--format=%cs') ?? 'sviluppo',
  }
}

const stamp = buildStamp()

export default defineConfig({
  define: {
    __COMMIT__: JSON.stringify(stamp.commit),
    __BUILD_DATE__: JSON.stringify(stamp.date),
  },
  base: BASE,
  plugins: [
    preact(),
    VitePWA({
      // 'prompt', non 'autoUpdate': autoUpdate genera un service worker con
      // skipWaiting + clientsClaim, e il client ricarica la pagina appena il SW
      // si attiva. Il reload arriverebbe senza preavviso, anche con il bottom
      // sheet aperto e un importo gia' digitato. Vedi ADR 005.
      registerType: 'prompt',
      // In dev il SW resta spento: evita cache stantie mentre si lavora.
      devOptions: { enabled: false },
      manifest: {
        id: BASE,
        name: 'Cent',
        short_name: 'Cent',
        description: 'Traccia le spese quotidiane. Offline, sul tuo telefono.',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'portrait',
        lang: 'it-IT',
        dir: 'ltr',
        // Allineati a --bg del tema chiaro in src/ui/tokens.css.
        // Il manifest non conosce le media query: lo splash iOS e' sempre chiaro.
        background_color: '#f6f6f3',
        theme_color: '#f6f6f3',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Niente 'png': le icone del manifest sono gia' iniettate nel
        // precache dal plugin, e includerle anche qui produce due entry con la
        // stessa url. Oggi hanno la stessa revision e Workbox deduplica in
        // silenzio, ma se una versione futura del plugin calcolasse la revision
        // in modo diverso i due entry divergerebbero e il SW lancerebbe in
        // fase di install: l'app non partirebbe piu' offline.
        // Conseguenza accettata: apple-touch-icon.png non e' precachata. iOS la
        // scarica al momento dell'installazione, che avviene per forza online.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: `${BASE}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
  },
})
