import { defineConfig } from '@playwright/test'

// L'app vive sotto /cent/ (ADR 001). Il baseURL DEVE includerlo: senza, ogni
// navigazione prende un 404 di `vite preview` e lo si legge come service worker
// rotto, perdendo tempo sulla diagnosi sbagliata.
const BASE_URL = 'http://localhost:4173/cent/'

// NON usare i preset `devices[...]` di un iPhone: portano con se'
// `browserName: 'webkit'`, e qui e' installato solo Chromium (di proposito —
// il WebKit di Playwright non e' il Safari di iOS, quindi non comprerebbe la
// fedelta' che sembra promettere; quella verifica resta il telefono vero).
// Geometria e input mobile si impostano a mano.
const MOBILE = {
  browserName: 'chromium' as const,
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
}

export default defineConfig({
  testDir: 'tests/e2e',
  // Un fallimento di geometria e' quasi sempre vero: ritentare lo nasconde.
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: BASE_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone-se', use: { ...MOBILE, viewport: { width: 375, height: 667 } } },
    { name: 'iphone-14', use: { ...MOBILE, viewport: { width: 390, height: 844 } } },
    // L'orizzontale e' il viewport che ha trovato il tastierino tagliato.
    { name: 'landscape', use: { ...MOBILE, viewport: { width: 800, height: 327 } } },
  ],
  webServer: {
    // `preview` serve il dist gia' costruito: la build la fa lo script npm, cosi'
    // il tempo di build non finisce nel timeout del server.
    command: 'npm run preview -- --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
})
