/**
 * La tipografia dell'importo: **euro grandi, centesimi piccoli**.
 *
 * ## Cosa sorveglia, e perche' e' un file suo
 *
 * `0,23 €` e `23,00 €` avevano la stessa quantita' di inchiostro, e l'unico
 * carattere che li distingueva era una virgola larga 3 px. Sono due spese
 * sbagliate in 24 ore d'uso vero — 0,23 invece di 23,00 e 0,25 invece di 25,00,
 * la seconda sopravvissuta 13 ore — fatte da chi il meccanismo cents-first
 * l'aveva progettato. Portare separatore e frazione al 55% del corpo sposta la
 * magnitudine da *quale glifo c'e'* a **quanto inchiostro grande c'e'**, che si
 * vede in periferia mentre l'occhio e' gia' sul chip da toccare.
 *
 * Il rimedio pero' tocca il numero **nell'istante fra i due tap**, cioe' esatta-
 * mente cio' che il resto della suite sorveglia perche' non si muova. Le due
 * cose che possono rompersi sono geometriche e nessun'altra le guarda:
 *
 * 1. **il bordo destro non si muove** fra un importo e l'altro. E' la promessa
 *    scritta in `sheet.css` — *"l'ultima cifra digitata resta ferma sotto lo
 *    stesso punto dello schermo"* — ed e' la ragione per cui si digita da destra
 *    senza guardare;
 * 2. **niente si sposta in verticale**: il blocco dell'importo e il tastierino
 *    stanno dove stavano, a una cifra come a sette. Due corpi diversi nella
 *    stessa riga sono il modo piu' facile di far crescere una riga di testo
 *    senza accorgersene.
 *
 * ## Perche' nelle due lingue
 *
 * Perche' **il simbolo cambia lato**: `it-IT` scrive `0,05 €` e `en-GB` scrive
 * `€0.05`, e l'inglese e' la lingua di default di quest'app. In italiano il
 * bordo destro poggia sul simbolo, in inglese sull'ultima cifra dei centesimi —
 * cioe' su una cella **rimpicciolita**. Una regola scritta sui glifi della
 * stringa invece che sulle parti sarebbe verde qui e rotta la', e nessuno
 * l'avrebbe vista finche' qualcuno non apriva l'app in inglese.
 *
 * La lingua si dichiara con `locale`, come in `playwright.config.ts`: l'app la
 * rileva da `navigator` al primo avvio (`detectLanguage`), quindi cambiarla
 * cambia anche i nomi delle otto categorie di default, che nascono in quello
 * stesso istante.
 */
import { chiudiGuida, expect, test } from './installed'
import type { Page } from '@playwright/test'

/**
 * Le tre lunghezze, in centesimi e in cifre da battere.
 *
 * Sono i tre casi che cambiano **la forma** del numero, non tre numeri a caso:
 * - `5` -> una sola cifra, l'intero e' lo zero che il formatter aggiunge;
 * - `1250` -> il caso di tutti i giorni, due cifre di intero;
 * - `9999999` -> il tetto (`MAX_CENTS`), cinque cifre di intero **e** il
 *   separatore delle migliaia, che compare solo qui ed e' l'unica cella `gap`
 *   che l'italiano non aveva gia'.
 */
const IMPORTI = ['5', '1250', '9999999'] as const

interface Forma {
  /** Il bordo destro dell'ultima cella dipinta, a due decimali. */
  readonly destro: number
  /** Il bordo destro del blocco `.amount`, come controprova del contenitore. */
  readonly bloccoDestro: number
  /** Dove comincia il blocco dell'importo, e quanto e' alto. */
  readonly alto: number
  readonly altezza: number
  /** Dove comincia il tastierino: i bersagli verso cui il pollice e' in volo. */
  readonly padAlto: number
  /** `scrollWidth - clientWidth` del blocco: sopra zero, il numero deborda. */
  readonly deborda: number
  /** Il testo intero, cioe' cosa legge chi guarda. */
  readonly testo: string
  /** La sequenza delle celle: `integer|decimal|fraction|gap|currency`. */
  readonly celle: string
  /** Il corpo, in px, delle celle grandi e di quelle piccole. */
  readonly corpoGrande: number
  readonly corpoPiccolo: number
}

async function misuraImporto(page: Page): Promise<Forma> {
  return page.evaluate(() => {
    const blocco = document.querySelector('.amount')
    const pad = document.querySelector('.pad')
    if (blocco === null || pad === null) throw new Error('importo o tastierino assenti')
    const celle = [...blocco.querySelectorAll('.amount__cell')]
    const ultima = celle[celle.length - 1]
    if (ultima === undefined) throw new Error('nessuna cella nell\'importo')

    const corpo = (kinds: readonly string[]): number => {
      const cella = celle.find((c) => kinds.includes(c.getAttribute('data-kind') ?? ''))
      if (cella === undefined) throw new Error(`nessuna cella ${kinds.join('/')}`)
      return Number.parseFloat(getComputedStyle(cella).fontSize)
    }

    const round = (n: number): number => Math.round(n * 100) / 100
    const rect = blocco.getBoundingClientRect()
    return {
      destro: round(ultima.getBoundingClientRect().right),
      bloccoDestro: round(rect.right),
      alto: round(rect.top),
      altezza: round(rect.height),
      padAlto: round(pad.getBoundingClientRect().top),
      deborda: blocco.scrollWidth - blocco.clientWidth,
      // Lo spazio non separabile che l'italiano mette fra numero e simbolo
      // arriva dal locale: qui si normalizza per poterlo scrivere nell'atteso,
      // e il canarino che sorveglia *che ci sia* vive gia' altrove.
      testo: (blocco.textContent ?? '').replace(/\u00A0/g, ' '),
      celle: celle.map((c) => c.getAttribute('data-kind')).join('|'),
      corpoGrande: corpo(['integer']),
      corpoPiccolo: corpo(['fraction']),
    }
  })
}

/** Apre il foglio e batte le cifre, una alla volta, come un pollice. */
async function digita(page: Page, cifre: string): Promise<void> {
  await page.locator('.fab').tap()
  await expect(page.locator('.sheet--add')).toBeVisible()
  for (const cifra of cifre) {
    await page.locator('.pad__key', { hasText: new RegExp(`^${cifra}$`) }).first().tap()
  }
}

/**
 * Chiude il foglio senza salvare: il velo e' la via d'uscita di sempre.
 *
 * In alto a sinistra e non al centro, come nel resto della suite: il velo copre
 * tutto lo schermo e il foglio ne copre la meta' bassa, quindi un tap al centro
 * geometrico del velo finisce **dentro il foglio**. Non e' una sovrapposizione
 * da correggere — il foglio e' cio' che il velo deve lasciar vedere — e' il
 * modo in cui si tocca il velo.
 */
async function chiudi(page: Page): Promise<void> {
  await page.locator('.scrim').tap({ position: { x: 4, y: 4 } })
  await expect(page.locator('.sheet--add')).toHaveCount(0)
}

/**
 * La prova, identica nelle due lingue: cambia solo cosa ci si aspetta di
 * **leggere**, non cosa deve restare fermo.
 */
async function provaLeTreLunghezze(
  page: Page,
  attesi: readonly string[],
): Promise<void> {
  await page.goto('./')
  await chiudiGuida(page)

  const forme: Forma[] = []
  for (const cifre of IMPORTI) {
    await digita(page, cifre)
    forme.push(await misuraImporto(page))
    await chiudi(page)
  }

  const [uno, due, tre] = forme
  if (uno === undefined || due === undefined || tre === undefined) {
    throw new Error('misure mancanti')
  }

  // Prima di tutto: si sta misurando davvero cio' che si crede.
  expect(forme.map((f) => f.testo)).toEqual(attesi)

  // 1. Il bordo destro. E' la promessa di sheet.css, ed e' la sola ragione per
  //    cui si puo' battere l'importo senza guardare il display.
  expect(
    [...new Set(forme.map((f) => f.destro))],
    'il bordo destro dell\'importo si e\' spostato fra un importo e l\'altro: ' +
      forme.map((f) => `${f.testo} -> ${f.destro}px`).join(', '),
  ).toHaveLength(1)
  expect([...new Set(forme.map((f) => f.bloccoDestro))]).toHaveLength(1)

  // 2. Niente si muove in verticale. Due corpi nella stessa riga fanno crescere
  //    la riga se la `line-height` smette di comandare: il tastierino e i chip
  //    scenderebbero nell'istante in cui il pollice e' gia' in volo.
  expect(
    [...new Set(forme.map((f) => `${f.alto}/${f.altezza}`))],
    'il blocco dell\'importo ha cambiato posizione o altezza: ' +
      forme.map((f) => `${f.testo} -> top ${f.alto}, h ${f.altezza}`).join(', '),
  ).toHaveLength(1)
  expect(
    [...new Set(forme.map((f) => f.padAlto))],
    'il tastierino si e\' spostato: ' +
      forme.map((f) => `${f.testo} -> ${f.padAlto}`).join(', '),
  ).toHaveLength(1)

  // 3. Al tetto il numero non deborda. E' il caso per cui `.amount` ha un corpo
  //    in `min(..., 10vw)`: con la frazione al 55% ci sta piu' comodo di prima,
  //    ma "piu' comodo" non e' una misura.
  for (const forma of forme) {
    expect(forma.deborda, `"${forma.testo}" deborda dal blocco dell'importo`)
      .toBeLessThanOrEqual(0)
  }

  // 4. E il rapporto e' quello deciso: ~55%. Non e' un dettaglio estetico — e'
  //    l'intera differenza fra "si vede in periferia" e "c'e' una virgola".
  for (const forma of forme) {
    const rapporto = forma.corpoPiccolo / forma.corpoGrande
    expect(
      rapporto,
      `i centesimi di "${forma.testo}" sono al ${Math.round(rapporto * 100)}% ` +
        'del corpo invece che al 55%',
    ).toBeCloseTo(0.55, 2)
  }

  // 5. La sequenza delle celle e' quella del **locale**, non una nostra idea di
  //    dove sta l'euro: e' il fatto che ha imposto `formatToParts`.
  expect(uno.celle).toBe(due.celle)
  expect(tre.celle).toContain('gap')
}

test.describe('in italiano', () => {
  test.use({ locale: 'it-IT' })

  test('i centesimi rimpiccioliscono e il bordo destro resta fermo', async ({ page }) => {
    // In italiano il simbolo chiude la riga: il bordo destro poggia su di lui,
    // che e' a corpo pieno.
    await provaLeTreLunghezze(page, ['0,05 €', '12,50 €', '99.999,99 €'])
  })
})

test.describe('in inglese', () => {
  test.use({ locale: 'en-GB' })

  test('i centesimi rimpiccioliscono e il bordo destro resta fermo', async ({ page }) => {
    // In inglese il simbolo apre la riga e il bordo destro poggia sull'ultima
    // cifra dei **centesimi**, cioe' su una cella rimpicciolita. E' il caso che
    // una regola scritta sui glifi avrebbe sbagliato in silenzio.
    await provaLeTreLunghezze(page, ['€0.05', '€12.50', '€99,999.99'])
  })
})
