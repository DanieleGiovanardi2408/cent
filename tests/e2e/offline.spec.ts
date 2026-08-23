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
 */
// Questi test provano l'app, quindi dichiarano di girare nell'app installata:
// fuori da standalone Cent e' una pagina di installazione (ADR 011). Vedi
// `installed.ts` per il perche' la cucitura sta qui e non nel codice dell'app.
import { expect, test } from './installed'

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
  // --- Primo caricamento: il SW si installa ma non controlla ancora la pagina.
  await page.goto('./')
  await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true), null, {
    timeout: 30_000,
  })

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
