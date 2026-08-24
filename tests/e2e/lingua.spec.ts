/**
 * Le otto categorie di default nascono **nella lingua risolta**, e da li' in poi
 * sono dati dell'utente.
 *
 * ## Il difetto era l'ordine, non la traduzione
 *
 * Il seme girava dentro `openRepository`, cioe' **prima che una lingua
 * esistesse**: chi apriva l'app da un telefono non italiano trovava la guida in
 * inglese e otto chip in italiano — cioe' il secondo dei due tap, il solo che
 * decide *cosa* stai salvando, etichettato in una lingua che non legge.
 *
 * Tradurre senza cambiare l'ordine avrebbe prodotto la stessa cosa con un
 * dizionario tradotto accanto. Quindi cio' che si prova qui non e' che le otto
 * stringhe esistano in due lingue — quello lo garantisce il compilatore
 * (`en.ts` e' `Record<keyof typeof it, string>`) — ma che al primo avvio
 * **finiscano sul disco** gia' nella lingua del telefono.
 *
 * ## E che cambiare lingua dopo non le ritraduca
 *
 * E' l'altra meta' della decisione, ed e' quella che si rompe per gentilezza:
 * una `Category` ha **un nome, punto** (CLAUDE.md, "Alternativa scartata:
 * salvare una chiave invece di un nome"). Sono dati dell'utente come una
 * categoria che ha rinominato lui, e ritradurle sarebbe riscrivere dati per una
 * scelta di visualizzazione. Il test lo verifica sul percorso vero: si sceglie
 * l'italiano da Impostazioni, e i chip restano inglesi.
 *
 * ## Perche' guarda anche il disco e non solo i chip
 *
 * Perche' i chip da soli non distinguono un nome **scritto** in inglese da una
 * chiave tradotta a ogni render: sarebbero verdi in tutti e due i mondi, e il
 * secondo e' proprio quello che questo progetto ha scartato. Il record su
 * IndexedDB e' la sola prova che il nome e' un dato.
 *
 * ## Perche' non gira su tre viewport
 *
 * Nessuno dei suoi test dipende dal viewport del progetto: quelli sulle parole
 * non misurano niente, e i due sul chip a 320 punti **impongono da soli** la
 * larghezza che li interessa, come fa `overlays.spec.ts` per la stessa misura.
 * Ripeterli a 375, 390 e 800 non aggiungerebbe un'asserzione, solo secondi al
 * tetto dei cinque minuti — quindi il file sta in `SENZA_GEOMETRIA`
 * (playwright.config.ts), con `colori.spec.ts` e `backup.spec.ts`.
 */
import { chiudiGuida, expect, test } from './installed'
import type { Page } from '@playwright/test'

/** Le otto di default, nell'ordine della griglia 4x2. */
const IT = [
  'Spesa',
  'Fuori',
  'Coffeeshop',
  'Sigarette',
  'Trasporti',
  'Svago',
  'Casa',
  'Extra',
]

const EN = [
  'Groceries',
  'Eating out',
  'Coffeeshop',
  'Cigarettes',
  'Transport',
  'Fun',
  'Home',
  'Extra',
]

/**
 * I nomi delle categorie **come stanno su IndexedDB**, in ordine di `order`.
 *
 * Non passa dal mirror e non passa da un componente: e' il record, cioe' cio'
 * che finira' in un export e cio' che una spesa salvata oggi nominera' fra sei
 * mesi.
 */
async function nomiSuDisco(page: Page): Promise<readonly string[]> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cent')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const records: { name: string; order: number }[] = await new Promise(
      (resolve, reject) => {
        const request = db.transaction('categories').objectStore('categories').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      },
    )
    db.close()
    return [...records].sort((a, b) => a.order - b.order).map((r) => r.name)
  })
}

/** I nomi che si leggono sui chip del foglio, cioe' quelli che si toccano. */
async function nomiSuiChip(page: Page): Promise<readonly string[]> {
  await page.locator('.fab').tap()
  await expect(page.locator('.sheet--add')).toBeVisible()
  const nomi = await page.locator('.sheet--add .cat__name').allInnerTexts()
  await page.locator('.scrim').tap({ position: { x: 4, y: 4 } })
  await expect(page.locator('.sheet--add')).toHaveCount(0)
  return nomi
}

test.describe('telefono in italiano', () => {
  test.use({ locale: 'it-IT' })

  test('le otto di default nascono in italiano', async ({ page }) => {
    await page.goto('./')
    await chiudiGuida(page)

    expect(await nomiSuiChip(page)).toEqual(IT)
    await expect
      .poll(() => nomiSuDisco(page), {
        message: 'le otto categorie sul disco non sono quelle italiane',
      })
      .toEqual(IT)
  })
})

/**
 * Le otto etichette **entrano nel chip**, a 320 punti, in tutte e due le lingue.
 *
 * E' il vincolo che le parole nuove possono rompere e il compilatore non vede:
 * `Cigarettes` ed `Eating out` sono piu' lunghe di `Sigarette` e `Fuori`, e il
 * chip a quella larghezza e' largo una sessantina di pixel. Un nome tagliato coi
 * puntini sul chip che **salva** e' l'errore silenzioso peggiore dell'app: si
 * tocca per posizione, e la parola tronca non dice piu' quale delle otto e'.
 *
 * 320 punti non e' un progetto: e' il vecchio SE, ed e' anche quello che si
 * ottiene attivando lo Zoom schermo di iOS su un telefono normale. Lo impone il
 * test, come fa `overlays.spec.ts` per la stessa larghezza.
 *
 * **Premessa dichiarata** (CLAUDE.md, caso 2 della tassonomia): l'asserzione e'
 * esatta ma se l'ellissi scatti dipende dalle metriche del font. Qui gira Inter,
 * che la suite dichiara e che ha metriche vicine a SF Pro Text; sul telefono
 * vero il margine puo' essere qualche decimo diverso. Non si rende piu'
 * tollerante — non avvicinerebbe la macchina al bersaglio — e la copertura vera
 * resta il telefono, che e' gia' nel criterio di chiusura di fase.
 */
async function nessunNomeTagliato(page: Page): Promise<readonly string[]> {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)
  await page.locator('.fab').tap()
  await expect(page.locator('.cat')).toHaveCount(8)

  return page.evaluate(() =>
    [...document.querySelectorAll('.sheet--add .cat__name')]
      .filter((el) => el.scrollWidth > el.clientWidth)
      .map((el) => `${el.textContent ?? ''} (${el.scrollWidth} su ${el.clientWidth})`),
  )
}

test.describe('telefono in inglese', () => {
  test.use({ locale: 'en-GB' })

  test('le otto di default nascono in inglese', async ({ page }) => {
    await page.goto('./')
    await chiudiGuida(page)

    expect(await nomiSuiChip(page)).toEqual(EN)
    await expect
      .poll(() => nomiSuDisco(page), {
        message:
          'le otto categorie sul disco non sono quelle inglesi: il seme ha girato ' +
          'prima che la lingua fosse risolta, oppure e\' tornato a un default cablato',
      })
      .toEqual(EN)
  })

  test('scegliere l\'italiano dopo non le ritraduce: sono dati suoi', async ({
    page,
  }) => {
    await page.goto('./')
    await chiudiGuida(page)
    await expect.poll(() => nomiSuDisco(page)).toEqual(EN)

    // Il percorso vero: Impostazioni, e la **seconda** voce del selettore e'
    // l'italiano — la prima e' "Automatica", che qui non servirebbe a niente
    // perche' automatico e' gia' lo stato di partenza.
    await page.locator('.app__action').tap()
    await expect(page.locator('.prefs')).toBeVisible()
    await page.locator('.pick').nth(1).tap()
    // L'interfaccia e' passata all'italiano: la prova che la scelta ha morso.
    await expect(page.locator('.nav__tab').nth(1)).toHaveText('Storico')

    // I nomi no. E non e' una dimenticanza: rinominarli e' cio' che l'editor
    // delle categorie serve a fare, e nessuno l'ha chiesto.
    await page.locator('.nav__tab').first().tap()
    expect(await nomiSuiChip(page)).toEqual(EN)
    expect(await nomiSuDisco(page)).toEqual(EN)

    // E resta vero dopo una ricarica, cioe' anche quando la lingua arriva dal
    // database invece che da `navigator`.
    await page.reload()
    await expect(page.locator('.fab')).toBeEnabled()
    expect(await nomiSuDisco(page)).toEqual(EN)
  })

  test('a 320 punti nessuna delle otto etichette inglesi viene tagliata', async ({
    page,
  }) => {
    expect(
      await nessunNomeTagliato(page),
      'un nome di categoria finisce coi puntini sul chip che salva',
    ).toEqual([])
  })
})

test.describe('le etichette italiane alla stessa larghezza', () => {
  test.use({ locale: 'it-IT' })

  test('a 320 punti nessuna delle otto etichette italiane viene tagliata', async ({
    page,
  }) => {
    // "Coffeeshop" e' la piu' lunga delle due lingue ed e' la stessa parola in
    // tutte e due: e' il metro con cui il breakpoint sotto i 360 punti e' stato
    // tarato (AddSheet.css).
    expect(
      await nessunNomeTagliato(page),
      'un nome di categoria finisce coi puntini sul chip che salva',
    ).toEqual([])
  })
})
