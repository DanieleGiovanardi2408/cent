import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

// L'app e' servita da https://<utente>.github.io/cent/ .
// base, start_url e scope devono restare allineati: se divergono il service
// worker registra uno scope sbagliato e la PWA non parte offline. Vedi ADR 001.
const BASE = '/cent/'

export default defineConfig({
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
