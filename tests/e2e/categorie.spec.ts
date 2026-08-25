/**
 * La fascia rossa dell'editor di categoria: **dice sempre qualcosa**.
 *
 * ## Il difetto che ha prodotto questo file
 *
 * `planCategoryDeletion` ha quattro esiti; il foglio ne dipingeva due. Il terzo
 * — `'deleted-only'`, cioe' "a trattenerla sono solo spese cancellate" — cadeva
 * nel `null` finale di una catena di ternari: nessun bottone, nessuna frase, una
 * zona vuota sotto una linea. Compilava, quindi nessuna verifica lo prendeva.
 *
 * E' la stessa famiglia dei difetti che questo progetto ha gia' incontrato due
 * volte: **uno stato che esiste nei dati e non esiste sullo schermo**. Qui pero'
 * non e' un numero che mente, e' un rifiuto muto — che e' peggio, perche' chi lo
 * legge non ha nemmeno di che accorgersi che c'e' stato un rifiuto.
 *
 * ## Perche' e2e e non un test di unita'
 *
 * Perche' il buco non era nella funzione: la funzione i quattro esiti li
 * restituisce, e `categories.test.ts` li copre tutti e quattro. Il buco era fra
 * l'esito e il pixel, e li' arriva solo un browser.
 *
 * ## I quattro casi, e perche' proprio questi
 *
 * 1. **2 spese vive + 1 lapide** — la frase deve dire **2**, non 3. E' la
 *    regola "Nessun messaggio cita un numero che l'utente non puo' vedere"
 *    misurata dove si legge, non dove si calcola: la terza spesa e' stata
 *    annullata e nello Storico non c'e'.
 * 2. **Solo lapidi** — lo stato che questo file esiste per rendere visibile.
 *    Prodotto **dalla UI e da nessun'altra parte**: si aggiunge una spesa e si
 *    tocca "Annulla" nel toast, che e' un soft delete. E' anche la strada per
 *    cui un utente ci arriva davvero — il chip sbagliato, annullato subito.
 * 3. **Nessuna spesa e nessuna regola** — il bottone c'e'. Senza questo caso i
 *    primi due non dimostrerebbero niente: una fascia sempre muta li
 *    supererebbe entrambi.
 * 4. **0 spese vive + 1 regola ricorrente** — l'altro conteggio, quello che in
 *    Impostazioni **si vede** (l'elenco delle spese fisse). La regola parte in
 *    una data futura apposta: cosi' non materializza niente e il numero delle
 *    spese resta zero, che e' l'unico modo di leggere la frase della regola da
 *    sola.
 *
 * ## Le premesse
 *
 * Orologio fissato: il caso 4 sceglie una data di partenza **dopo oggi**, e
 * "dopo oggi" con l'orologio della macchina e' una cosa che scade.
 */
import { chiudiGuida, expect, test } from './installed'
import type { Page } from '@playwright/test'
import { fissaOrologio, giornoDichiarato } from './clock'

test.beforeEach(async ({ page }) => {
  await fissaOrologio(page)
})

/** Aspetta che le animazioni siano finite, non che sia passato del tempo. */
async function still(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  })
}

/**
 * Una spesa vera, dal FAB: cifre e poi il chip, che **e'** la conferma.
 * `quale` e' la posizione in griglia, perche' e' cosi' che la si tocca.
 */
async function spesa(page: Page, cifre: string, quale: number): Promise<void> {
  await page.locator('.fab').tap()
  await expect(page.locator('.sheet--add')).toBeVisible()
  await still(page)
  for (const cifra of cifre) {
    await page.locator('.pad__key:not(.pad__key--erase)').filter({ hasText: cifra }).first().tap()
  }
  await page.locator('.sheet--add .cat').nth(quale).tap()
  await expect(page.locator('.sheet--add')).toHaveCount(0)
}

/** Apre Impostazioni e l'editor della categoria in posizione `quale`. */
async function apriCategoria(page: Page, quale: number): Promise<void> {
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await page.locator('.cats--edit .cat').nth(quale).tap()
  await expect(page.locator('.sheet--cat')).toBeVisible()
  await still(page)
}

/** Chiude il foglio dal velo e aspetta che sia uscito dal DOM davvero. */
async function chiudiFoglio(page: Page): Promise<void> {
  await page.locator('.scrim').tap({ position: { x: 4, y: 4 } })
  await expect(page.locator('.sheet')).toHaveCount(0)
}

/**
 * Niente scroll orizzontale, ne' in pagina ne' dentro il foglio.
 *
 * Esatto, ma con una premessa che dipende dal font (CLAUDE.md, caso 2 della
 * tassonomia): le due frasi della fascia rossa sono le piu' lunghe che il foglio
 * dipinga, e se qualcosa dovesse traboccare lo farebbe li'. Su questa macchina
 * non trabocca; il telefono resta il bersaglio vero.
 */
async function senzaScrollOrizzontale(page: Page, dove: string): Promise<void> {
  const scroll = await page.evaluate(() => {
    const el = document.querySelector('.sheet--cat')
    return {
      pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      foglio: el === null ? 0 : el.scrollWidth - el.clientWidth,
    }
  })
  expect(scroll.pagina, `c'e' scroll orizzontale in pagina (${dove})`).toBeLessThanOrEqual(0)
  expect(scroll.foglio, `c'e' scroll orizzontale dentro il foglio (${dove})`).toBeLessThanOrEqual(0)
}

test('la fascia rossa dice sempre qualcosa: i quattro esiti della cancellazione', async ({
  page,
}) => {
  // Il caso 4 sceglie una partenza futura: senza un oggi dichiarato, "futura"
  // e' una premessa che scade da sola.
  expect(giornoDichiarato()).toBe('2026-08-19')

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  // --- 1. Due vive e una lapide sulla stessa categoria. -------------------
  //     La terza spesa viene annullata dal toast: e' un soft delete, quindi
  //     resta sul disco e nomina ancora la categoria. Nello Storico pero' non
  //     c'e', e la frase deve dire **2**.
  await spesa(page, '450', 0)
  await spesa(page, '250', 0)
  await spesa(page, '100', 0)
  await page.locator('.toast__action').tap()
  await expect(page.locator('.toast__box')).toContainText('Spesa annullata')

  await apriCategoria(page, 0)
  await expect(page.locator('.danger__action')).toHaveCount(0)
  await expect(page.locator('.danger')).toContainText('La usa 2 spese')
  // Il numero non e' "quante ne conosce il core": e' quante se ne vedono.
  await expect(page.locator('.danger')).not.toContainText('3 spese')
  await chiudiFoglio(page)

  // --- 2. Solo lapidi: lo stato che non si vedeva. ------------------------
  //     Una spesa sulla seconda categoria, annullata subito. E' il gesto
  //     dell'utente che sbaglia chip e se ne accorge nel frame dopo — non una
  //     scrittura di scena inventata per raggiungere un ramo.
  await spesa(page, '700', 1)
  await page.locator('.toast__action').tap()
  await expect(page.locator('.toast__box')).toContainText('Spesa annullata')

  await apriCategoria(page, 1)
  // Il bottone non c'e' — la lapide si ripristina in un tap e tornerebbe senza
  // nome — ma **al suo posto ci sono le parole**. Era qui il buco: niente.
  await expect(page.locator('.danger__action')).toHaveCount(0)
  const muta = page.locator('.danger .editor__note')
  await expect(muta).toHaveCount(1)
  await expect(muta).toContainText('spese che hai cancellato')
  await expect(muta).toContainText('Archiviala')
  // **Nessuna cifra.** L'esito non porta numeri e la frase non puo' inventarne:
  // le lapidi non si vedono da nessuna schermata, quindi contarle sarebbe un
  // rifiuto che l'utente non puo' riconciliare con niente.
  expect(
    (await muta.innerText()).match(/\d/),
    'il rifiuto per sole lapidi cita un numero che nessuna schermata mostra',
  ).toBeNull()
  await senzaScrollOrizzontale(page, 'sole lapidi')
  await chiudiFoglio(page)

  // --- 3. Niente la nomina: il bottone c'e'. ------------------------------
  //     Senza questo caso i due di sopra non proverebbero niente: una fascia
  //     sempre muta li passerebbe entrambi.
  await apriCategoria(page, 3)
  await expect(page.locator('.danger__action')).toHaveText('Elimina del tutto')
  await expect(page.locator('.danger')).toContainText('nemmeno una che hai cancellato')
  await chiudiFoglio(page)

  // --- 4. Zero spese vive, una regola. ------------------------------------
  //     La partenza e' nel futuro apposta: cosi' la regola non materializza
  //     niente e il conteggio delle spese resta a zero. E' l'unico modo di
  //     leggere la frase della regola da sola, senza spese che la accompagnano.
  await page.locator('.prefs__action').filter({ hasText: /spesa fissa/i }).tap()
  await expect(page.locator('.sheet--rule')).toBeVisible()
  await still(page)
  for (const cifra of '90000') {
    await page.locator('.pad__key:not(.pad__key--erase)').filter({ hasText: cifra }).first().tap()
  }
  await page.locator('.sheet--rule .cats--pick .cat').nth(6).tap()
  await page.locator('.starts .chip__input').fill('2026-12-01')
  await expect(page.locator('.rule__confirm')).toHaveCount(0)
  await page.locator('.sheet--rule .save').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  // La regola si vede: e' la riga che rende verificabile il numero qui sotto.
  await expect(page.locator('.fixed__row')).toHaveCount(1)

  await page.locator('.cats--edit .cat').nth(6).tap()
  await expect(page.locator('.sheet--cat')).toBeVisible()
  await still(page)
  await expect(page.locator('.danger__action')).toHaveCount(0)
  await expect(page.locator('.danger')).toContainText('La usa 1 spesa ricorrente')

  await senzaScrollOrizzontale(page, 'in uso')
})
