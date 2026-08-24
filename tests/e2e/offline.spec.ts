/**
 * L'app riparte davvero senza rete?
 *
 * E' il requisito piu' importante e piu' facile da rompere in silenzio: un
 * errore di precache non fa fallire ne' la build ne' i test unitari.
 *
 * Quattro trappole, tutte incontrate davvero e tutte gestite qui:
 *
 * 1. `vite preview` serve sotto /cent/ (ADR 001). Il baseURL della config lo
 *    include: senza, si ottengono 404 e li si scambia per un SW rotto.
 * 2. Con `registerType: 'prompt'` e senza `clientsClaim` (ADR 005) il service
 *    worker NON controlla la prima pagina. Serve: caricare, attendere
 *    `serviceWorker.ready`, RICARICARE ancora online — solo ora `controller`
 *    e' non nullo — e poi andare offline. Saltare il secondo caricamento fa
 *    fallire il test e sembra un problema di precache: e' la trappola che costa
 *    piu' tempo.
 * 3. `context.setOffline(true)`, non `page.route` che aborta le richieste:
 *    quest'ultimo non esercita lo stesso percorso.
 * 4. Due asserzioni, non una. Uno stato 200 con il guscio vuoto passerebbe la
 *    prima e non la seconda.
 *
 * ## La quinta, che non e' del service worker: l'orologio
 *
 * Il confronto fra le due letture e' un confronto fra **due momenti**. La prima
 * lettura e' online, la seconda dopo aver spento la rete e ricaricato: in mezzo
 * passano dei secondi, e una volta ci e' passata la mezzanotte. Il testo
 * cambiava da solo — "Questa settimana · 17–23 ago" contro "24–30 ago" — e il
 * rosso accusava il precache di una cosa fatta dall'app secondo ADR 007.
 *
 * Qui l'orologio e' fissato: le due letture cadono nello stesso giorno civile
 * per costruzione, e l'unica differenza che resta fra loro e' la rete, che e'
 * quello che questo test vuole misurare. Vedi `clock.ts`.
 */
// Questi test provano l'app, quindi dichiarano di girare nell'app installata:
// fuori da standalone Cent e' una pagina di installazione (ADR 011). Vedi
// `installed.ts` per il perche' la cucitura sta qui e non nel codice dell'app.
import { chiudiGuida, expect, test } from './installed'
import { fissaOrologio } from './clock'

/**
 * Testo della pagina una volta che ha smesso di cambiare.
 *
 * Serve l'attesa, non basta leggere: per la regola "Ordine di pittura" il guscio
 * si dipinge prima dei dati, quindi il testo cambia nei primi millisecondi. Una
 * lettura secca cade in una fase diversa online e offline e il confronto misura
 * una corsa invece del precache — succede davvero, e in orizzontale falliva
 * proprio cosi'.
 *
 * Due letture uguali a distanza di 150 ms bastano: il passaggio guscio -> dati
 * e' una transizione sola, non un flusso continuo.
 */
async function stableText(page: import('@playwright/test').Page): Promise<string> {
  const read = async (): Promise<string> =>
    (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim()

  let previous = await read()
  for (let attempt = 0; attempt < 40; attempt++) {
    await page.waitForTimeout(150)
    const current = await read()
    if (current === previous) return current
    previous = current
  }
  throw new Error('il testo della pagina non si e\' stabilizzato in 6 secondi')
}

test('la seconda apertura funziona senza rete', async ({ page, context }) => {
  // --- L'orologio prima di tutto: le due letture che questo test confronta
  //     devono cadere nello stesso giorno civile anche se il run parte alle
  //     23:59:30. Prima di `goto`, perche' l'app legge il giorno all'avvio.
  await fissaOrologio(page)

  // --- Primo caricamento: il SW si installa ma non controlla ancora la pagina.
  await page.goto('./')
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, {
    timeout: 30_000,
  })

  // --- La guida del primo avvio: si chiude **qui**, prima che questo test
  //     cominci a confrontare testi. E' un modale legato a uno stato, quindi
  //     comparirebbe identico nella lettura online e in quella offline — ma il
  //     testo confrontato sarebbe il suo, non quello dell'app, e il precache
  //     verrebbe promosso da una schermata che non contiene nessun dato.
  await chiudiGuida(page)

  // --- Trappola 2: serve un secondo caricamento ONLINE perche' il worker
  //     prenda il controllo. Senza `clientsClaim` non lo fa da solo.
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 15_000,
      message:
        'Il service worker non controlla la pagina dopo il secondo caricamento. ' +
        'Non e\' (necessariamente) il precache: con registerType "prompt" il ' +
        'controllo arriva solo al caricamento successivo all\'installazione.',
    })
    .toBe(true)

  const online = await stableText(page)
  expect(online.length, 'la pagina online e\' vuota: il test successivo non proverebbe niente').toBeGreaterThan(0)

  // --- Rete spenta davvero, non richieste abortite.
  await context.setOffline(true)

  const response = await page.reload()

  // Asserzione 1: la navigazione e' servita.
  expect(response?.status(), 'ricaricando offline la navigazione non e\' stata servita dalla cache').toBe(200)

  // Asserzione 2: e' servita la pagina VERA, non un guscio vuoto.
  const offline = await stableText(page)
  expect(
    offline,
    'offline la pagina risponde 200 ma il contenuto non e\' quello online: ' +
      'il documento e\' in cache ma qualcosa che serve a dipingerlo non lo e\'.',
  ).toBe(online)

  await context.setOffline(false)
})
