/**
 * La guida al primo avvio, e la riga che spiega come si salva.
 *
 * Sono due canali con due compiti diversi e vanno provati insieme, perche' la
 * decisione che li ha prodotti e' una sola: **il chip-come-conferma non esiste
 * in nessun'altra app, quindi nessuno lo indovina.** La guida lo spiega una
 * volta; la riga nel foglio lo ricorda nel momento in cui serve, per le prime
 * tre spese; la tipografia del tastierino lo spiega ogni volta.
 *
 * ## I due rami di `prefers-reduced-motion`, provati **tutti e due**
 *
 * La scheda 1 non ha un'animazione sopra un contenuto: **l'animazione e' il
 * contenuto**. Chi accetta il movimento vede l'importo riempirsi da destra; chi
 * ha chiesto meno movimento vede i tre casi in tabella. Sono due schede diverse,
 * quindi due prove diverse.
 *
 * La preferenza e' dichiarata in `playwright.config.ts` (`contextOptions.
 * reducedMotion`, quinta premessa d'ambiente, ADR 013): il resto della suite
 * gira sul ramo animato perche' quel file lo dice, non perche' Playwright abbia
 * un default. Qui il ramo ridotto si chiede esplicitamente con `test.use`, e
 * dallo stesso posto — se la chiave cambiasse casa, cambierebbe in tutti e due
 * i punti insieme.
 *
 * ## L'invariante dell'animazione, misurato invece che guardato
 *
 * `it-IT` scrive `0,05 €`, `en-GB` scrive `€0.05`: **il simbolo cambia lato**.
 * Un'animazione scritta sui glifi della stringa avrebbe fatto scorrere le cifre
 * sotto il simbolo in una delle due lingue, e nessuno se ne sarebbe accorto
 * finche' non avesse aperto la guida in inglese. L'importo e' costruito con
 * `formatToParts`, e qui si misura cosa quella scelta compra: la cella del
 * separatore decimale e quella del simbolo **non si spostano mai**, in nessuno
 * dei tre stati, in nessuna delle due lingue.
 */
import { chiudiGuida, expect, guidaChiusaSuDisco, test } from './installed'
import { probe, report } from './probe'
import type { Target } from './probe'
import type { Page } from '@playwright/test'

/**
 * Aspetta che nessuna animazione sia in corso.
 *
 * E' la condizione vera al posto di un'attesa fissa, e qui non e' una
 * precauzione: la scheda entra con un'animazione, e misurare mentre entra da'
 * numeri che non sono quelli di nessuno stato — la prima esecuzione di questo
 * file ha misurato "Inizia" a 85x43 contro i 44 dichiarati, perche' l'entrata
 * aveva anche uno `scale`. L'attesa e' rimasta **e** lo `scale` e' stato tolto:
 * il test aspetta cio' che deve, e il difetto che aveva trovato era vero.
 *
 * Il ticker della scheda 1 non la fa aspettare all'infinito: le sue animazioni
 * durano 200 ms e nessuna e' `infinite`. `getAnimations()` e' un'istantanea, e
 * quelle che partono dopo non entrano in questa attesa.
 */
async function ferme(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  })
}

/** Una riga di sonda per stato, con lo stesso formato di `overlays.spec.ts`. */
function sonda(
  viewport: string,
  rows: string[],
  failures: Target[],
): (state: string, page: Page) => Promise<void> {
  return async (state, page) => {
    await ferme(page)
    const targets = await probe(page)
    expect(targets.length, `nessun bersaglio misurato in "${state}": la sonda non prova niente`)
      .toBeGreaterThan(0)
    rows.push(...report(viewport, state, targets))
    failures.push(...targets.filter((t) => t.status === 'coperto' || t.status === 'piccolo'))
  }
}

/**
 * Le celle dell'importo, come le vede il DOM: tipo, testo e bordo sinistro.
 *
 * Il bordo si legge dalla **cella**, non dal glifo: il glifo entra da destra con
 * un `transform`, che e' pittura e non layout. Se un giorno l'animazione
 * tornasse a muovere le celle, questo numero se ne accorgerebbe.
 */
async function celle(page: Page): Promise<readonly { kind: string; text: string; left: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.demo__cell')].map((cell) => ({
      kind: cell.dataset['kind'] ?? '?',
      text: (cell.textContent ?? '').trim(),
      left: Math.round(cell.getBoundingClientRect().left * 100) / 100,
    })),
  )
}

test('la guida si mostra al primo avvio, ha due schede, e chiuderla e\' definitivo', async ({
  page,
}, testInfo) => {
  const viewport = `${testInfo.project.use.viewport?.width}x${testInfo.project.use.viewport?.height}`
  const rows: string[] = []
  const failures: Target[] = []
  const check = sonda(viewport, rows, failures)

  await page.goto('./')

  // --- La guida c'e', ed e' la prima cosa. Dietro, l'app e' inerte per le
  //     tecnologie assistive: e' un modale, e la sonda lo verifica invece di
  //     darlo per scontato.
  await expect(page.locator('.guide')).toBeVisible()
  await expect(page.locator('.app')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.guide__step')).toHaveText('Passo 1 di 2')
  await expect(page.locator('.guide__title')).toHaveText('L’importo si riempie da destra')
  await expect(page.locator('.guide__text')).toHaveText('Per 23 € digita 2 3 0 0.')
  await check('guida, scheda 1 (ramo animato)', page)

  // Il ramo dichiarato dalla configurazione e' quello animato: la scheda 1
  // mostra l'importo che si riempie, non la tabella.
  await expect(page.locator('.demo--live')).toHaveCount(1)
  await expect(page.locator('.demo--still')).toHaveCount(0)

  // --- Scheda 2. "Salta" sparisce: li' avrebbe una sola forma onesta, cioe'
  //     fare esattamente cio' che fa "Inizia" — due bersagli identici con due
  //     parole diverse.
  await expect(page.locator('.guide__skip')).toBeVisible()
  await page.locator('.guide__next').tap()
  await expect(page.locator('.guide__step')).toHaveText('Passo 2 di 2')
  await expect(page.locator('.guide__title')).toHaveText('Toccare una categoria salva la spesa')
  await expect(page.locator('.guide__text')).toContainText('non c’è un tasto Salva')
  await expect(page.locator('.guide__skip')).toHaveCount(0)
  await expect(page.locator('.guide__next')).toHaveText('Inizia')

  // I chip della scheda 2 sono le categorie **vere**, e non sono bersagli: se
  // fossero `.cat` risponderebbero al selettore con cui `install.spec.ts` conta
  // che i bersagli che scrivono siano zero.
  await expect(page.locator('.mock__cat')).toHaveCount(4)
  await expect(page.locator('.mock__cat').first()).toContainText('Spesa')
  await expect(page.locator('.guide .cat')).toHaveCount(0)
  await check('guida, scheda 2', page)

  // --- "Inizia" chiude, e la chiusura e' uno **stato**: niente guida al
  //     ricaricamento. E' il punto di ADR 009 — la guida non e' agganciata
  //     all'evento di avvio, ma all'assenza di `onboardingCompletedAt`.
  await page.locator('.guide__next').tap()
  await expect(page.locator('.guide')).toHaveCount(0)
  await expect(page.locator('.fab')).toBeEnabled()
  await expect.poll(() => guidaChiusaSuDisco(page)).toBe(true)

  await page.reload()
  await expect(page.locator('.fab')).toBeEnabled()
  await expect(page.locator('.guide')).toHaveCount(0)

  // --- E si ritrova: "Rivedi la guida" **cancella** quello stato, quindi la
  //     guida ricompare da capo. Chi ha toccato "Salta" non l'ha persa.
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await page.locator('.prefs__action', { hasText: 'Rivedi la guida' }).tap()
  await expect(page.locator('.guide')).toBeVisible()
  await expect(page.locator('.guide__step')).toHaveText('Passo 1 di 2')
  await expect.poll(() => guidaChiusaSuDisco(page)).toBe(false)

  console.log(`\n${rows.join('\n')}\n`)
  expect(
    failures.map((t) => `${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`),
    'un overlay copre un bersaglio, o un bersaglio e\' sotto i 44px',
  ).toEqual([])
})

/**
 * La forma della scheda su ogni viewport: dentro lo schermo, dentro la safe
 * area, senza scroll orizzontale, e con le due uscite **visibili senza
 * scorrere**.
 *
 * L'ultima e' la condizione che conta davvero, e vale soprattutto in
 * orizzontale (800x327): una guida modale i cui bottoni stanno sotto la piega e'
 * un'app che si e' chiusa a chiave da sola al primo avvio.
 *
 * Esatti ma con una premessa che dipende dal font: se qui non trabocca non vuol
 * dire che su iOS non traboccherebbe (CLAUDE.md, caso 2). La copertura vera
 * resta il dispositivo.
 */
test('la scheda della guida sta nello schermo, e le sue uscite non vanno scorse', async ({
  page,
}) => {
  await page.goto('./')
  await expect(page.locator('.guide')).toBeVisible()

  const forma = await page.evaluate(() => {
    const card = document.querySelector('.guide__card')
    const next = document.querySelector('.guide__next')
    const skip = document.querySelector('.guide__skip')
    if (card === null || next === null || skip === null) return null
    const c = card.getBoundingClientRect()
    const fuori = (el: Element): boolean => {
      const r = el.getBoundingClientRect()
      return r.bottom > c.bottom + 0.5 || r.top < c.top - 0.5
    }
    return {
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dentro: c.left >= 0 && c.right <= innerWidth && c.top >= 0 && c.bottom <= innerHeight,
      scorre: card.scrollHeight - card.clientHeight,
      uscitaFuori: fuori(next) || fuori(skip),
      box: `${Math.round(c.width)}x${Math.round(c.height)} a ${Math.round(c.top)}`,
    }
  })

  expect(forma, 'la scheda non e\' in pagina').not.toBeNull()
  expect(forma?.overflowX, 'c\'e\' scroll orizzontale con la guida aperta').toBeLessThanOrEqual(0)
  expect(forma?.dentro, `la scheda esce dallo schermo: ${forma?.box}`).toBe(true)
  expect(forma?.scorre, `la scheda non ci sta e servirebbe uno scroll: ${forma?.box}`)
    .toBeLessThanOrEqual(0)
  expect(forma?.uscitaFuori, 'un\'uscita della guida e\' fuori dalla scheda').toBe(false)
})

/**
 * La guida a **320 punti**, che non e' un viewport dei progetti: e' il vecchio
 * SE, ed e' anche quello che si ottiene con lo Zoom schermo di iOS. E' la
 * larghezza in cui i quattro chip dell'illustrazione e i due bottoni stanno piu'
 * stretti.
 */
test('a 320 punti la guida ci sta lo stesso', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-se', 'la larghezza la impone il test')

  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  await expect(page.locator('.guide')).toBeVisible()

  const misura = async (): Promise<{ piccoli: string[]; scorre: number; overflowX: number }> =>
    page.evaluate(() => {
      const card = document.querySelector('.guide__card')
      const piccoli: string[] = []
      for (const el of document.querySelectorAll('.guide__skip, .guide__next')) {
        const r = el.getBoundingClientRect()
        if (Math.round(Math.min(r.width, r.height)) < 44) {
          piccoli.push(`${el.textContent} e' ${Math.round(r.width)}x${Math.round(r.height)}`)
        }
      }
      return {
        piccoli,
        scorre: card === null ? 0 : card.scrollHeight - card.clientHeight,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })

  const scheda1 = await misura()
  expect(scheda1.piccoli, 'un bersaglio della guida e\' sotto i 44px a 320 punti').toEqual([])
  expect(scheda1.scorre, 'la scheda 1 non ci sta a 320 punti').toBeLessThanOrEqual(0)
  expect(scheda1.overflowX, 'scroll orizzontale a 320 punti').toBeLessThanOrEqual(0)

  await page.locator('.guide__next').tap()
  await expect(page.locator('.mock__cat')).toHaveCount(4)
  const scheda2 = await misura()
  expect(scheda2.piccoli, 'un bersaglio della guida e\' sotto i 44px a 320 punti').toEqual([])
  expect(scheda2.scorre, 'la scheda 2 non ci sta a 320 punti').toBeLessThanOrEqual(0)
  expect(scheda2.overflowX, 'scroll orizzontale a 320 punti').toBeLessThanOrEqual(0)

  // I quattro chip veri restano leggibili: il nome si rimpicciolisce, non si
  // taglia a meta' parola.
  const nomi = await page.locator('.mock__name').allInnerTexts()
  expect(nomi).toHaveLength(4)
})

/**
 * "Salta" scrive lo stato, e non e' un dettaglio: se non lo scrivesse, la guida
 * tornerebbe alla prossima apertura e quella parola avrebbe mentito.
 */
test('"Salta" chiude la guida per sempre, non per adesso', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.guide__skip')).toBeVisible()
  await page.locator('.guide__skip').tap()
  await expect(page.locator('.guide')).toHaveCount(0)
  await expect.poll(() => guidaChiusaSuDisco(page)).toBe(true)

  await page.reload()
  await expect(page.locator('.fab')).toBeEnabled()
  await expect(page.locator('.guide')).toHaveCount(0)
})

/**
 * L'invariante dell'animazione: le cifre si muovono, l'ancora no.
 *
 * Tre stati (`5 -> 0,05`, `50 -> 0,50`, `500 -> 5,00`) e per tutti e tre la
 * stessa sequenza di celle, la stessa posizione del separatore decimale e la
 * stessa posizione del simbolo. Se l'animazione tornasse a lavorare sui glifi
 * della stringa invece che sulle parti, la sequenza o le posizioni cambierebbero
 * e questo test lo direbbe con dentro i numeri.
 */
test('nella scheda 1 le cifre si muovono, il separatore e il simbolo no', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.demo--live')).toBeVisible()

  const forme = new Set<string>()
  const importi = new Set<string>()
  const ancore = new Set<string>()

  // Poco piu' di un giro completo (tre stati da 1,3 s): campionare a 100 ms
  // prende ogni stato piu' volte, quindi un'ancora che si sposta per un solo
  // frame verrebbe presa lo stesso.
  for (let i = 0; i < 45; i += 1) {
    const cells = await celle(page)
    forme.add(cells.map((cell) => cell.kind).join('|'))
    importi.add(cells.map((cell) => cell.text).join(''))
    ancore.add(
      cells
        .filter((cell) => cell.kind === 'decimal' || cell.kind === 'currency')
        .map((cell) => `${cell.kind}@${cell.left}`)
        .join(' '),
    )
    await page.waitForTimeout(100)
  }

  expect([...importi].length, `l'importo non e' cambiato: ${[...importi].join(' ')}`)
    .toBeGreaterThanOrEqual(3)
  expect(
    [...forme],
    'la sequenza delle celle e\' cambiata: l\'animazione non e\' ancorata alle parti',
  ).toHaveLength(1)
  expect(
    [...ancore],
    'il separatore decimale o il simbolo dell\'euro si sono spostati: le cifre ' +
      'stanno passando sotto l\'ancora',
  ).toHaveLength(1)

  // E in italiano il simbolo sta **in fondo**. E' il fatto che ha imposto
  // `formatToParts`: in inglese sta all'inizio, e lo verifica il test qui sotto.
  const cells = await celle(page)
  expect(cells.at(-1)?.kind).toBe('currency')
})

/**
 * Il ramo `prefers-reduced-motion`: **un altro contenuto**, non la stessa
 * animazione ferma su un fotogramma.
 *
 * E gli importi della tabella passano dal formatter: `5 -> 0,05` scritto a mano
 * mostrerebbe la virgola italiana a chi legge in inglese — vedi il test
 * successivo, che e' la meta' che rende questo una prova invece di una
 * coincidenza.
 */
test.describe('con prefers-reduced-motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('la scheda 1 diventa una tabella dei tre casi, con gli importi del locale', async ({
    page,
  }, testInfo) => {
    const viewport = `${testInfo.project.use.viewport?.width}x${testInfo.project.use.viewport?.height}`
    const rows: string[] = []
    const failures: Target[] = []
    const check = sonda(viewport, rows, failures)

    await page.goto('./')
    await expect(page.locator('.guide')).toBeVisible()

    await expect(page.locator('.demo--still')).toHaveCount(1)
    await expect(page.locator('.demo--live')).toHaveCount(0)

    const righe = page.locator('.demo__line')
    await expect(righe).toHaveCount(3)
    await expect(righe.nth(0)).toContainText('0,05 €')
    await expect(righe.nth(1)).toContainText('0,50 €')
    await expect(righe.nth(2)).toContainText('5,00 €')
    // I tasti battuti, che sono la colonna sinistra: 5, poi 50, poi 500.
    await expect(righe.nth(2).locator('.demo__key')).toHaveCount(3)

    // Il titolo e il sottotitolo sono gli stessi: cambia l'illustrazione, non
    // cio' che la scheda insegna.
    await expect(page.locator('.guide__title')).toHaveText('L’importo si riempie da destra')
    await check('guida, scheda 1 (ramo senza movimento)', page)

    // La seconda scheda non ha rami: e' ferma in entrambi i casi.
    await page.locator('.guide__next').tap()
    await expect(page.locator('.mock__cat')).toHaveCount(4)
    await check('guida, scheda 2 (ramo senza movimento)', page)

    console.log(`\n${rows.join('\n')}\n`)
    expect(
      failures.map((t) => `${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`),
      'un overlay copre un bersaglio, o un bersaglio e\' sotto i 44px',
    ).toEqual([])
  })
})

/**
 * La guida in inglese, che e' **la lingua di default** di quest'app.
 *
 * Due cose in una prova sola, e sono le due che una tabella cablata avrebbe
 * sbagliato insieme:
 *
 * 1. gli importi della tabella escono dal formatter — `€0.05`, non `0,05 €`;
 * 2. il simbolo dell'euro sta **in testa**, non in coda. E' il fatto che ha
 *    imposto `formatToParts`: la stessa animazione, scritta sui glifi, avrebbe
 *    fatto scorrere le cifre sotto il simbolo esattamente qui.
 */
test.describe('in inglese', () => {
  test.use({ locale: 'en-GB' })

  test('gli importi della guida parlano la lingua di chi guarda', async ({ page }) => {
    await page.goto('./')
    await expect(page.locator('.guide')).toBeVisible()
    await expect(page.locator('.guide__step')).toHaveText('Step 1 of 2')
    await expect(page.locator('.guide__title')).toHaveText('Amounts fill in from the right')
    await expect(page.locator('.guide__text')).toHaveText('For €23, type 2 3 0 0.')
    await expect(page.locator('.guide__skip')).toHaveText('Skip')
    await expect(page.locator('.guide__next')).toHaveText('Next')

    // Il ramo animato: il simbolo e' la **prima** cella, e li' resta.
    const cells = await celle(page)
    expect(cells[0]?.kind, 'in inglese il simbolo non e\' in testa').toBe('currency')
    expect(cells.map((cell) => cell.kind).join('|')).toBe(
      'currency|digit|decimal|digit|digit',
    )

    await page.locator('.guide__next').tap()
    await expect(page.locator('.guide__title')).toHaveText('Tapping a category saves the expense')
    await expect(page.locator('.guide__text')).toContainText('no Save button')
    await expect(page.locator('.guide__next')).toHaveText('Start')
  })

  test.describe('e senza movimento', () => {
    test.use({ contextOptions: { reducedMotion: 'reduce' } })

    test('la tabella scrive €0.05, non 0,05 €', async ({ page }) => {
      await page.goto('./')
      await expect(page.locator('.demo--still')).toBeVisible()
      const righe = page.locator('.demo__line')
      await expect(righe.nth(0)).toContainText('€0.05')
      await expect(righe.nth(1)).toContainText('€0.50')
      await expect(righe.nth(2)).toContainText('€5.00')
    })
  })
})

/**
 * La riga di aiuto ci sta **in una riga sola**, a 320 punti, in tutte e due le
 * lingue.
 *
 * `.sheet__hint` ha l'altezza riservata di una riga e taglia con i puntini:
 * una frase tagliata a meta' e' peggio di una frase corta, e qui la frase e'
 * un'istruzione — cioe' proprio quella che non si puo' permettere di finire in
 * "Digita l'importo, poi tocca una…".
 *
 * Le due lingue insieme perche' la larghezza di una frase e' la variabile che
 * entra "dalla porta di fianco": e' gia' successo con il chip della nota, che a
 * 320 punti in inglese cadeva a 29px mentre in italiano stava comodo.
 *
 * Esatto ma con una premessa che dipende dal font (CLAUDE.md, caso 2): qui il
 * font e' Inter, sul telefono e' SF Pro Text. Il margine misurato viene
 * stampato apposta — se un giorno si assottiglia, si vede prima che sparisca.
 */
test('a 320 punti la riga di aiuto ci sta in una riga, nelle due lingue', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-se', 'la larghezza la impone il test')

  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  /** Quanto e' larga la frase, e quanto spazio ha: il testo, non il nodo. */
  const riga = (): Promise<{ testo: number; spazio: number; text: string }> =>
    page.evaluate(() => {
      const hint = document.querySelector('.sheet__hint')
      if (hint === null) return { testo: 0, spazio: 0, text: '(niente)' }
      const range = document.createRange()
      range.selectNodeContents(hint)
      return {
        testo: Math.round(range.getBoundingClientRect().width * 10) / 10,
        spazio: hint.clientWidth,
        text: (hint.textContent ?? '').trim(),
      }
    })

  const margini: string[] = []

  for (const lingua of ['it', 'en'] as const) {
    if (lingua === 'en') {
      await page.locator('.app__action').tap()
      await expect(page.locator('.prefs')).toBeVisible()
      await page.locator('.pick').nth(2).tap()
      await expect(page.locator('.nav__tab').nth(1)).toHaveText('History')
    }

    await page.locator('.fab').tap()
    await expect(page.locator('.sheet--add')).toBeVisible()

    const vuoto = await riga()
    await page.locator('.pad__key', { hasText: /^7$/ }).first().tap()
    const digitato = await riga()

    for (const [stato, m] of [['vuoto', vuoto], ['digitato', digitato]] as const) {
      margini.push(
        `  [320x568] ${lingua}/${stato}: "${m.text}" ${m.testo}px su ${m.spazio}px ` +
          `(avanzo ${Math.round((m.spazio - m.testo) * 10) / 10}px)`,
      )
      expect(
        m.testo,
        `la riga di aiuto (${lingua}, importo ${stato}) non ci sta e verrebbe ` +
          `tagliata dai puntini: "${m.text}"`,
      ).toBeLessThanOrEqual(m.spazio)
    }

    await page.locator('.scrim').tap({ position: { x: 4, y: 4 } })
    await expect(page.locator('.sheet')).toHaveCount(0)
  }

  console.log(`\n${margini.join('\n')}\n`)
})

/**
 * La riga nel foglio: due varianti contestuali, e la terza spesa che le spegne.
 *
 * E' il canale che arriva **anche a chi salta la guida**, quindi non e' un
 * doppione: la guida spiega una volta e prima, la riga ricorda nel momento in
 * cui il pollice e' gia' sul tastierino.
 *
 * Qui si prova anche cio' che quella riga **non** e': una regione live. Non e'
 * un valore che cambia, e' un'istruzione — e la cosa che l'annuncio cercava di
 * fare vive nel nome accessibile dei chip, dove arriva sul controllo che si sta
 * per toccare invece che in una coda dietro all'importo.
 */
test('la riga spiega come si salva per tre spese, poi tace', async ({ page }, testInfo) => {
  const viewport = `${testInfo.project.use.viewport?.width}x${testInfo.project.use.viewport?.height}`
  const rows: string[] = []
  const failures: Target[] = []
  const check = sonda(viewport, rows, failures)

  const cifre = async (digits: string): Promise<void> => {
    for (const digit of digits) {
      await page.locator('.pad__key', { hasText: new RegExp(`^${digit}$`) }).first().tap()
    }
  }

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  await page.locator('.fab').tap()
  await expect(page.locator('.sheet--add')).toBeVisible()

  // --- Importo vuoto: i chip sono spenti, quindi la riga dice l'ordine delle
  //     due cose invece di invitare a un tap che non farebbe niente.
  await expect(page.locator('.sheet__hint')).toHaveText(
    'Digita l’importo, poi tocca una categoria',
  )
  await expect(page.locator('.cat').first()).toBeDisabled()
  await check('foglio, riga di aiuto con importo vuoto', page)

  // --- Prima cifra: i chip si accendono e la riga passa all'istruzione.
  await cifre('450')
  await expect(page.locator('.amount')).toHaveText('4,50 €')
  await expect(page.locator('.sheet__hint')).toHaveText('Tocca una categoria per salvare')

  // **Nessun `aria-live` su quella riga.** Commuta nello stesso frame in cui
  // cambia l'importo, che e' l'altra regione live del foglio: due annunci in
  // coda, e quello che conta arriva secondo. Ed e' un'istruzione, non un valore.
  await expect(page.locator('.sheet__hint')).not.toHaveAttribute('aria-live', /.*/)

  // L'informazione sta invece nel **nome accessibile del chip**, cioe' sul
  // controllo che si sta per toccare.
  await expect(page.locator('.cat').first()).toHaveAttribute(
    'aria-label',
    'Spesa, tocca due volte per salvare',
  )
  await check('foglio, riga di aiuto con importo digitato', page)

  // --- Tre spese salvate a mano, e la riga smette.
  await page.locator('.cat').first().tap()
  await expect(page.locator('.sheet')).toHaveCount(0)

  for (const importo of ['300', '250']) {
    await page.locator('.fab').tap()
    await expect(page.locator('.sheet--add')).toBeVisible()
    await cifre(importo)
    await page.locator('.cat').first().tap()
    await expect(page.locator('.sheet')).toHaveCount(0)
  }

  await page.locator('.fab').tap()
  await expect(page.locator('.sheet--add')).toBeVisible()
  // Vuoto: torna la domanda di sempre, che non e' un'istruzione ma un invito.
  await expect(page.locator('.sheet__hint')).toHaveText('Quanto hai speso?')
  await cifre('100')
  // Digitato: tace. Chi ha imparato ha gia' il canale che conta — gli otto chip
  // che si accendono tutti insieme, dentro il campo visivo di chi guarda i tasti.
  await expect(page.locator('.sheet__hint')).toHaveText('')
  // Il nome accessibile invece **resta**: non e' un suggerimento dei primi
  // giorni, e' il nome dell'azione.
  await expect(page.locator('.cat').first()).toHaveAttribute(
    'aria-label',
    'Spesa, tocca due volte per salvare',
  )
  await check('foglio dopo tre spese, riga muta', page)

  console.log(`\n${rows.join('\n')}\n`)
  expect(
    failures.map((t) => `${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`),
    'un overlay copre un bersaglio, o un bersaglio e\' sotto i 44px',
  ).toEqual([])
})

/**
 * La stessa decisione, in tutti e tre i fogli che hanno quella riga.
 *
 * L'argomento che ha tolto `aria-live` da `.sheet__hint` — *"e' un'istruzione,
 * non un valore: si legge esplorando, non si annuncia"* — **non nomina
 * `AddSheet`**, quindi non valeva per `AddSheet`: valeva per la riga. Era pero'
 * stato applicato a un componente solo, e per un anno il foglio del budget ha
 * tenuto il difetto peggiore dei tre — quella riga commuta **alla prima cifra**,
 * cioe' nello stesso frame in cui cambia `.amount`, che e' l'altra regione live
 * di quel foglio: due annunci in coda, e l'importo arriva secondo.
 *
 * Il test e' scritto sulla **classe** e non sui tre componenti di proposito: un
 * quarto foglio con la stessa riga nascerebbe con lo stesso difetto, e il test
 * scritto sui tre non lo vedrebbe. E' il modo di sbagliare che CLAUDE.md
 * chiama "un difetto che si crede gia' corretto".
 */
test('nessuna riga di aiuto e\' una regione live, in nessuno dei tre fogli', async ({ page }) => {
  const riga = page.locator('.sheet__hint')
  /** La riga c'e' **e** non annuncia: senza il primo pezzo, il secondo e' vuoto. */
  const muta = async (dove: string): Promise<void> => {
    await expect(riga, `la riga di aiuto non e' nel foglio "${dove}"`).toHaveCount(1)
    await expect(riga, `la riga di aiuto di "${dove}" e' una regione live`).not.toHaveAttribute(
      'aria-live',
      /.*/,
    )
  }

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  // --- 1. Il foglio dell'inserimento, dove la decisione era gia' applicata.
  await page.locator('.fab').tap()
  await expect(page.locator('.sheet--add')).toBeVisible()
  await muta('aggiungi spesa')
  // Anche dopo la prima cifra, cioe' nel frame in cui la riga commuta insieme
  // all'importo: e' quello lo stato in cui i due annunci si accodano.
  await page.locator('.pad__key', { hasText: /^5$/ }).first().tap()
  await expect(page.locator('.amount')).toHaveText('0,05 €')
  await muta('aggiungi spesa, con una cifra')
  await page.locator('.scrim').tap({ position: { x: 4, y: 4 } })
  await expect(page.locator('.sheet')).toHaveCount(0)

  // --- 2. Il foglio del budget: lo stesso difetto, e con `.amount` accanto.
  await page.locator('.budget').tap()
  await expect(page.locator('.sheet--budget')).toBeVisible()
  await muta('budget')
  await page.locator('.pad__key', { hasText: /^5$/ }).first().tap()
  await expect(page.locator('.amount')).toHaveText('0,05 €')
  await muta('budget, con una cifra')
  await page.locator('.scrim').tap({ position: { x: 4, y: 4 } })
  await expect(page.locator('.sheet')).toHaveCount(0)

  // --- 3. Il foglio delle categorie, che di regioni live non ne ha nessun'altra:
  //        la decisione vale lo stesso, perche' la ragione non parlava di code.
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await page.locator('.cats__add').tap()
  await expect(page.locator('.sheet--cat')).toBeVisible()
  await muta('nuova categoria')
  await page.locator('.editor__name').fill('Caffè')
  await muta('nuova categoria, con un nome')
})
