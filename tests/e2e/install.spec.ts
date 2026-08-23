/**
 * Lo stato bloccato: fuori da standalone, Cent e' una pagina di installazione
 * (ADR 011).
 *
 * ## Perche' questo test esiste
 *
 * Un divieto che nessuno verifica non e' un divieto: e' una riga di codice che
 * qualcuno rimuovera' credendola morta. Tutti gli altri test end-to-end
 * dichiarano di girare nell'app installata (`installed.ts`) — quindi senza
 * questo file **nessuno** eserciterebbe mai il ramo che il gate esiste per
 * produrre, e toglierlo lascerebbe la suite verde.
 *
 * Questo e' l'unico spec che importa `test` da `@playwright/test` invece che da
 * `./installed`: qui il contesto non dichiarato **e'** il soggetto della prova.
 *
 * ## Cosa prova, e in che ordine di severita'
 *
 * 1. che al posto dell'app ci sia la pagina di installazione, con il motivo
 *    scritto — perche' un divieto senza ragione si legge come un difetto;
 * 2. che i bersagli che scrivono siano **zero**, non nascosti. La differenza e'
 *    tutta qui: `display: none` su un FAB e' una cosa che una regola CSS
 *    sbagliata riporta indietro, l'assenza dal DOM no. Si conta con la stessa
 *    sonda di `overlays.spec.ts`, e in piu' con una query secca su tutto il
 *    documento, che vede anche cio' che e' invisibile;
 * 3. che **il database non sia mai stato aperto**. E' la prova comportamentale,
 *    e la piu' forte: aprire il repository scrive da solo le otto categorie di
 *    default. Se `cent` esiste in IndexedDB, qualcosa ha scritto nella sandbox
 *    del browser — cioe' proprio la cosa che ADR 011 impedisce — anche se in
 *    pagina non c'era niente da toccare.
 */
import { expect, test } from '@playwright/test'
import { probe } from './probe'

/**
 * Tutto cio' che, toccato, porterebbe a una scrittura. Sono i selettori veri
 * dell'app, non una categoria astratta: se un giorno ne nascesse un altro, il
 * posto dove aggiungerlo e' questo.
 */
const SCRIVONO = [
  '.fab', // apre il foglio di inserimento
  '.pad__key', // il tastierino
  '.cat', // il chip di categoria, che E' la conferma (ADR 004)
  '.budget', // apre il foglio del budget
  '.save', // salva il budget
  '.row', // apre le azioni su una spesa, fra cui elimina
  '.acts__delete',
  '.toast__action', // annulla / ripristina
  '.app__action', // l'ingresso alle Impostazioni, dove vivono i tre qui sotto
  '.pick', // la lingua: scrive (o cancella) Settings.language
  '.prefs__action', // "Esporta tutto" scrive lastBackupAt; l'altro apre il budget
  'input',
  'textarea',
  '[contenteditable]',
].join(', ')

test('fuori da standalone c e la pagina di installazione, e nessun bersaglio che scriva', async ({
  page,
}) => {
  await page.goto('./')

  // --- 1. E' un'altra schermata, non l'app con qualcosa spento.
  await expect(page.locator('.install')).toBeVisible()
  await expect(page.locator('.app')).toHaveCount(0)

  // Il nome, cosa fa, e i tre passi con le parole che si leggono su iOS.
  await expect(page.locator('.install__name')).toHaveText('Cent')
  await expect(page.locator('h1')).toBeVisible()
  await expect(page.locator('.step')).toHaveCount(3)
  await expect(page.locator('.steps')).toContainText('Condividi')
  await expect(page.locator('.steps')).toContainText('Aggiungi a Home')

  // Il motivo. Non e' ornamentale: senza, chi arriva qui pensa che l'app sia
  // rotta invece che protettiva.
  const why = page.locator('.why__title')
  await expect(why).toContainText('I dati vivono nell')
  await expect(why).toContainText('non ci arriverebbe')

  // --- 2. Zero bersagli che scrivono. Nel DOM intero, non solo fra i visibili:
  //        un bersaglio nascosto resta un bersaglio, e una regola CSS lo
  //        riporta indietro senza che nessun test se ne accorga.
  expect(
    await page.locator(SCRIVONO).count(),
    'in pagina esiste un bersaglio che porta a una scrittura: la sandbox del ' +
      'browser non e\' quella dell\'app installata, e quel dato sparirebbe',
  ).toBe(0)

  // E la stessa sonda di overlays.spec.ts, che guarda cio' che e' toccabile
  // davvero: qui non deve trovare niente da toccare.
  const targets = await probe(page)
  expect(
    targets.map((t) => `${t.label} (${t.rect})`),
    'la pagina di installazione non ha niente da toccare: il gesto che serve ' +
      'sta nella barra del browser, non in pagina',
  ).toEqual([])

  // --- 3. Nessuna scrittura, nemmeno silenziosa: il database non esiste.
  //        `openRepository` su un database vuoto ci scriverebbe dentro le otto
  //        categorie di default prima di qualunque tap.
  const databases = await page.evaluate(async () => {
    const list = await indexedDB.databases()
    return list.map((entry) => entry.name ?? '')
  })
  expect(
    databases,
    'il database e\' stato aperto: qualcosa ha scritto nella sandbox del browser',
  ).not.toContain('cent')
})

/**
 * La forma della schermata, con lo stesso metro delle altre: e' la prima cosa
 * che vede chiunque apra il link, non un messaggio d'errore.
 */
test('la pagina di installazione sta nel viewport e rispetta la safe area', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.install')).toBeVisible()

  const geometry = await page.evaluate(() => {
    const root = document.documentElement
    const install = document.querySelector('.install')
    const box = install?.getBoundingClientRect() ?? new DOMRect()
    return {
      overflowX: root.scrollWidth - root.clientWidth,
      left: Math.round(box.left),
      right: Math.round(box.right),
      width: innerWidth,
    }
  })

  expect(geometry.overflowX, 'c\'e\' scroll orizzontale').toBeLessThanOrEqual(0)
  expect(geometry.left).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(geometry.width)
})
