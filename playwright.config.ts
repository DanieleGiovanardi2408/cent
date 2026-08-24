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

// Il fuso **dichiarato**: la quarta premessa d'ambiente (ADR 013).
//
// E' lo stesso `TZ: 'Europe/Amsterdam'` di `vitest.config.ts`, e la ragione per
// cui e' lo stesso e' che due suite sullo stesso prodotto non possono misurare
// contro due calendari diversi: un giorno civile che cambia fra l'una e l'altra
// e' un difetto che si legge come "flaky" invece che come una premessa mancante.
const FUSO = 'Europe/Amsterdam'

// E l'**istante**, che il fuso da solo non copre.
//
// Anche con Europe/Amsterdam fissato, una suite che parte alle 23:59 attraversa
// la mezzanotte mentre gira: e' successo davvero — `offline.spec.ts` confrontava
// il testo online con quello offline e leggeva "17–23 ago" nella prima lettura e
// "24–30 ago" nella seconda. L'app aveva fatto la cosa giusta (ADR 007); il test
// stava misurando due istanti diversi.
//
// Quindi ogni asserzione che dipende da "oggi" fissa l'orologio a questo
// istante invece di ereditarlo. Mercoledi' 19 agosto 2026, a meta' giornata e a
// meta' settimana: nessun confine vicino, ne' di giorno ne' di periodo.
//
// L'offset `+02:00` e' scritto di proposito: `new Date('2026-08-19T10:00:00')`
// verrebbe letto nel fuso del **processo Node** — Europe/Rome in locale, UTC sul
// runner — e la premessa rientrerebbe dalla finestra nell'atto di dichiararla.
//
// `CENT_ORA` serve a rifare la prova al confine senza toccare il codice:
//
//     CENT_ORA='2026-08-23T23:59:30+02:00' npx playwright test
//
// Se la suite passa anche li', l'orologio e' fissato davvero. Se passasse solo
// col valore qui sotto, sarebbe fortuna.
const ISTANTE = process.env['CENT_ORA'] ?? '2026-08-19T10:00:00+02:00'

export default defineConfig({
  testDir: 'tests/e2e',
  // Un fallimento di geometria e' quasi sempre vero: ritentare lo nasconde.
  retries: 0,
  fullyParallel: false,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',
  // La lingua e' **dichiarata**, non ereditata dal browser.
  //
  // Dalla fase 3 l'app ha due lingue e, senza una scelta esplicita in
  // Impostazioni, sceglie dall'ambiente con default **inglese** (la lingua
  // condivisa di un gruppo Erasmus). Chromium senza `locale` parte in `en-US`:
  // ogni asserzione italiana di questa suite cadrebbe — e cadrebbe per il
  // motivo giusto, cioe' peggio, perche' sembrerebbe una regressione del copy
  // invece che una premessa d'ambiente mai dichiarata.
  //
  // Prima della fase 3 la premessa c'era lo stesso ed era invisibile: `it-IT`
  // era cablato dentro `formatCents`, quindi `12,50 €` usciva anche con il
  // browser in inglese. Averla tolta dal dominio l'ha resa una cosa da dire.
  //
  // La **terza** premessa d'ambiente e' il font, e non sta qui solo perche'
  // Playwright non ha un posto in config dove iniettare uno script di pagina:
  // vive in `tests/e2e/font.ts`, che e' la base di ogni `test` della suite.
  // Senza, ogni misura di altezza confrontava il testo con qualunque font fosse
  // installato sulla macchina — SF Pro su macOS, DejaVu sul runner — e la stessa
  // frase andava a capo a un numero diverso di righe. Le prime due premesse
  // (`TZ` in vitest.config.ts, `locale` qui sopra) sono nate dallo stesso
  // difetto: una cosa che l'ambiente decideva per noi, in silenzio.
  //
  // La **quarta** e' il tempo, ed e' due cose: il fuso (`timezoneId` qui sotto)
  // e l'istante (`metadata.istante`, che i test leggono da `tests/e2e/clock.ts`).
  // Il fuso da solo non basta — vedi il commento su ISTANTE qui sopra.
  //
  // La **quinta** e' il movimento: `reducedMotion` qui sotto.
  //
  // Playwright un default ce l'ha — `no-preference` — ma **un default non e' una
  // dichiarazione**: e' l'ambiente che decide per noi, che e' esattamente il
  // difetto da cui nascono le altre quattro. E qui non decide una misura, decide
  // **quale ramo di codice esiste**: la scheda 1 della guida ha due forme
  // diverse — l'importo che si riempie in movimento, oppure la tabella dei tre
  // esempi — e quale delle due si dipinge dipende da questa preferenza. Se il
  // default di Playwright cambiasse, il ramo animato — che *e'* il contenuto
  // della scheda — smetterebbe di essere coperto **senza che nessun test
  // diventi rosso**: la suite resterebbe verde provando l'altra meta'.
  //
  // Dichiararlo qui non basta e non e' la parte importante: la guida e' provata
  // su **entrambi** i rami, esplicitamente, in `tests/e2e/guide.spec.ts`, dove
  // il ramo ridotto si chiede con
  // `test.use({ contextOptions: { reducedMotion: 'reduce' } })`.
  // Questa riga dice qual e' il ramo di tutto il resto della suite.
  //
  // Sta dentro `contextOptions` e non accanto a `locale`, e non e' una scelta:
  // in Playwright 1.62 `reducedMotion` **non e' un'opzione di primo livello** —
  // lo sono `locale`, `timezoneId`, `colorScheme`, `viewport`, non lei. Scritta
  // accanto a `locale` sarebbe stata accettata dal file e ignorata
  // dall'esecuzione, cioe' una premessa che sembra dichiarata e non lo e': la
  // forma peggiore, perche' chiude la domanda senza rispondere. Trovata con
  // `tsc`, che i test type-checka; questo file no, ed e' un buco noto.
  use: {
    baseURL: BASE_URL,
    locale: 'it-IT',
    timezoneId: FUSO,
    contextOptions: { reducedMotion: 'no-preference' },
    trace: 'retain-on-failure',
  },
  // L'istante passa di qui e non da una costante importata dai test perche' le
  // premesse d'ambiente si leggono in un posto solo: questo file.
  metadata: { istante: ISTANTE, fuso: FUSO },
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
