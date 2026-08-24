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

// Il file in cui il **tema** e' il soggetto della prova. Sta in una costante
// perche' compare due volte con due sensi opposti — e' cio' che il progetto
// `dark` esegue, ed e' parte di cio' che i viewport secondari saltano — e due
// espressioni regolari scritte a mano divergerebbero al primo rinomino.
const COLORI = /colori\.spec\.ts/

// Cio' che non dipende dal viewport, e che quindi gira **una volta sola**, sul
// viewport di riferimento (`iphone-14`).
//
// I tre progetti geometrici esistono per rimisurare le stesse schermate a tre
// larghezze. Un file che non misura nessuna larghezza — quale ramo prende
// l'export, quanto contrasto ha un testo dipinto — ripetuto tre volte non
// aggiunge un'asserzione: aggiunge solo secondi al tetto dei 5 minuti.
//
// `testIgnore` e non un `test.skip` dentro i file: la lista di cio' che gira e
// dove sta insieme alle altre premesse d'ambiente, in questo file, invece di
// essere sparsa in una condizione per spec.
const SENZA_GEOMETRIA = [COLORI, /backup\.spec\.ts/, /lingua\.spec\.ts/]

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
  // La **sesta** e' il tema: `colorScheme` qui sotto. Stessa forma delle altre —
  // Chromium parte in chiaro e finora la suite intera misurava il tema chiaro
  // **per caso**, non per scelta. Dichiararlo non aggiunge copertura di un
  // pixel: sposta soltanto il tema scuro da "non provato senza saperlo" a
  // "escluso di proposito", che e' una differenza di onesta', non di verifica.
  //
  // La copertura vera del tema scuro e' il progetto `dark` qui sotto, e non e'
  // la suite intera: raddoppiare i tempi per rimisurare geometrie che non
  // dipendono dal colore sarebbe pagare un tetto (5 minuti, ROADMAP) per zero
  // informazione. Gira dove **il colore decide qualcosa**.
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
    colorScheme: 'light',
    contextOptions: { reducedMotion: 'no-preference' },
    trace: 'retain-on-failure',
  },
  // L'istante passa di qui e non da una costante importata dai test perche' le
  // premesse d'ambiente si leggono in un posto solo: questo file.
  metadata: { istante: ISTANTE, fuso: FUSO },
  projects: [
    {
      name: 'iphone-se',
      use: { ...MOBILE, viewport: { width: 375, height: 667 } },
      testIgnore: SENZA_GEOMETRIA,
    },
    { name: 'iphone-14', use: { ...MOBILE, viewport: { width: 390, height: 844 } } },
    // L'orizzontale e' il viewport che ha trovato il tastierino tagliato.
    {
      name: 'landscape',
      use: { ...MOBILE, viewport: { width: 800, height: 327 } },
      testIgnore: SENZA_GEOMETRIA,
    },
    // Il tema scuro, **solo dove il colore decide qualcosa**.
    //
    // `colori.spec.ts` e' l'unico file in cui il tema e' il soggetto: contrasti
    // dipinti, il token `--over` dello sforo, e le otto superfici delle
    // categorie — che dalla fase 6 sono la palette dei grafici, quindi la
    // copertura serve **prima** di allora.
    //
    // Il viewport e' quello di riferimento e non conta: quel file non misura
    // nessuna geometria. Conta che sia **lo stesso** delle due esecuzioni, cosi'
    // la differenza fra la riga chiara e la riga scura del rapporto e' il tema e
    // nient'altro.
    //
    // Il progetto si chiama `dark` e non `iphone-14-dark` perche' e' cio' che si
    // scrive dopo `--project=` quando si vuole rifare la prova del tema.
    {
      name: 'dark',
      testMatch: COLORI,
      use: { ...MOBILE, viewport: { width: 390, height: 844 }, colorScheme: 'dark' },
    },
  ],
  webServer: {
    // **Costruisce prima di servire, e non e' un dettaglio di comodita'.**
    // `vite preview` serve `dist/`: senza la build qui, `npx playwright test`
    // — cioe' l'invocazione piu' naturale, e quella di chiunque non abbia letto
    // la regola — misura l'artefatto precedente. E' successo: una modifica alla
    // costante della guida e' stata dichiarata verde da una suite che stava
    // provando il bundle di prima, e il rosso vero e' comparso solo al giro
    // successivo, che conteneva `npm run build`.
    //
    // La premessa non dichiarata era **"il dist corrisponde al sorgente"**.
    // Qui smette di essere una premessa e diventa un fatto: chiunque lanci i
    // test, comunque li lanci, costruisce prima. Su questo progetto la build
    // sta sotto il secondo, quindi il costo e' zero e il rischio sparisce.
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
})
