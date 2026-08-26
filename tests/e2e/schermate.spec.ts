/**
 * **Le schermate, tutte, da un punto solo che le enumera.**
 *
 * ## Il difetto che questo file esiste per non ripetere
 *
 * Fino alla fase 6 la sonda delle sovrapposizioni girava su Home, Storico e
 * Impostazioni, e le tre erano **scritte a mano** dentro `overlays.spec.ts`.
 * Sono arrivate le Statistiche e non le ha guardate nessuno: l'unica schermata
 * che non aveva mai visto un telefono era l'unica che la sonda non guardava. I
 * tre difetti che il gate ci ha trovato — contenitore che non scorre, FAB sopra
 * l'ultima cifra, righe che toccano i bordi senza safe-area — sono esattamente
 * quelli che avrebbe preso.
 *
 * Agganciare le Statistiche a quell'elenco avrebbe riparato **questo** caso e
 * lasciato identico il prossimo. Qui l'elenco non c'e':
 *
 * > **Le schermate sono quelle che la barra raggiunge.**
 *
 * Si legge la barra, si tocca ogni bersaglio che ci sta dentro, e si misura cio'
 * che compare. Una quarta schermata entra in questo file **perche' esiste**, non
 * perche' qualcuno si e' ricordato di aggiungercela — e se un giorno una
 * schermata smettesse di essere raggiungibile dalla barra, il conto qui sotto
 * scenderebbe e lo si vedrebbe.
 *
 * ## Le tre domande
 *
 * 1. **Nessun overlay copre un bersaglio** (regola "Sovrapposizioni"), e nessun
 *    bersaglio sotto i 44 px. E' la sonda di sempre, su ogni schermata.
 * 2. **Ogni contenitore radice di schermata dichiara le stesse proprieta'** —
 *    quelle che rendono `.home` e `.list` contenitori che scorrono dentro `.app`
 *    invece di spingere fuori la pagina. Non e' una convenzione da ricordare.
 * 3. **In barra ci stanno**, cioe' nessun bersaglio e' dipinto sopra un altro e
 *    nessuno deborda dal proprio box. E' una domanda che il centro del bersaglio
 *    non sa fare: vedi `probe.ts`, `collisioni` e `debordi`.
 */
import { chiudiGuida, expect, test } from './installed'
import type { Page } from '@playwright/test'
import { collisioni, debordi, probe, report } from './probe'
import type { Target } from './probe'
import { fissaOrologio } from './clock'
import { it as dizionarioIt } from '../../src/ui/i18n/it'
import { en as dizionarioEn } from '../../src/ui/i18n/en'

test.beforeEach(async ({ page }) => {
  await fissaOrologio(page)
})

/**
 * Le spese: abbastanza da riempire ogni schermata, su piu' settimane.
 *
 * Otto categorie e sessanta giorni servono a `Statistiche` piu' che alle altre —
 * senza almeno due periodi la seconda sezione non e' un grafico, e senza tre
 * categorie non lo e' la prima — ma valgono per tutte: una schermata vuota non
 * ha niente da far traboccare.
 */
async function semina(page: Page, quante: number): Promise<void> {
  await page.evaluate(async (totale: number) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cent')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const categories: { id: string }[] = await new Promise((resolve, reject) => {
      const request = db.transaction('categories').objectStore('categories').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const iso = (indietro: number): string => {
      const d = new Date()
      d.setDate(d.getDate() - indietro)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('expenses', 'readwrite')
      const store = tx.objectStore('expenses')
      for (let i = 0; i < totale; i += 1) {
        const at = 1_700_000_000_000 + i
        store.put({
          id: `sch-${i}`,
          createdAt: at,
          updatedAt: at,
          amountCents: 150 + (i % 900) * 7,
          categoryId: categories[i % categories.length]?.id ?? 'x',
          date: iso(i % 60),
          source: 'manual',
        })
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, quante)
}

/**
 * I bersagli dell'intestazione, **letti dalla barra** invece che elencati.
 *
 * Sono i comandi dentro `.app__bar`: oggi tre schede piu' Impostazioni, domani
 * quello che ci sara'.
 */
async function ingressi(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.app__bar button, .app__bar [role="button"]')].map(
      (el) =>
        el.getAttribute('aria-label') ??
        (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
    ),
  )
}

/** Aspetta che nessuna animazione sia in corso: la condizione, non un timeout. */
async function ferma(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  })
}

/**
 * Il contenitore radice della schermata aperta: l'unico figlio elemento di
 * `<main>` che non sia il titolo per i lettori di schermo.
 *
 * Si legge dalla struttura e non da un elenco di classi (`.home, .list, .stats,
 * .prefs`) per la stessa ragione per cui le schermate si leggono dalla barra: un
 * elenco di classi e' scritto al tempo t e applicato al tempo t+n, e la
 * cinquantunesima riga che manca e' sempre quella della schermata nuova.
 */
const RADICE = 'main.app__main > *:not(h1)'

/**
 * Le cinque dichiarazioni che fanno di un contenitore **il contenitore che
 * scorre dentro `.app`**, invece di un blocco che spinge fuori la pagina.
 *
 * Non sono cinque preferenze di stile: senza `flex: 1` e `min-block-size: 0` il
 * blocco cresce oltre `.app`, e a scorrere e' il documento — cioe' l'
 * intestazione esce dallo schermo, e in standalone non c'e' il tasto Indietro.
 * Senza `overflow-y: auto` non scorre niente. Senza `overscroll-behavior:
 * contain` lo slancio arriva al documento e iOS fa rimbalzare tutta la pagina.
 * Senza il padding orizzontale il testo tocca i bordi, notch compreso.
 *
 * Si leggono **calcolate** e non dichiarate: `.prefs` scrive il proprio
 * `padding-inline` da sola, le altre lo ricevono dall'elenco in App.css, e il
 * contratto e' il risultato — non il posto in cui e' scritto.
 */
async function contratto(page: Page): Promise<Record<string, string>> {
  return page.evaluate((selettore: string) => {
    const el = document.querySelector(selettore)
    if (el === null) throw new Error(`nessun contenitore radice per "${selettore}"`)
    const s = getComputedStyle(el)
    return {
      classe: typeof el.className === 'string' ? el.className : '(senza classe)',
      flexGrow: s.flexGrow,
      minBlockSize: s.minBlockSize,
      overflowY: s.overflowY,
      overscrollBehaviorY: s.overscrollBehaviorY,
      paddingLeft: s.paddingLeft,
      paddingRight: s.paddingRight,
    }
  }, RADICE)
}

test('ogni schermata che la barra raggiunge: nessun bersaglio coperto, e il contenitore scorre', async ({
  page,
}, testInfo) => {
  const viewport = `${testInfo.project.use.viewport?.width}x${testInfo.project.use.viewport?.height}`
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)
  await semina(page, 400)
  await page.reload()
  await expect(page.locator('.fab')).toBeEnabled()

  const nomi = await ingressi(page)
  // Se un giorno la barra si svuotasse, questo test non direbbe niente **e
  // sarebbe verde**: e' la forma di fallimento contro cui e' scritta questa riga.
  expect(nomi.length, 'nessun ingresso in barra: questo test non guarderebbe niente')
    .toBeGreaterThanOrEqual(4)

  const righe: string[] = []
  const coperti: Target[] = []
  const senzaContratto: string[] = []

  for (const nome of nomi) {
    await page.locator('.app__bar').getByRole('button', { name: nome, exact: true }).tap()
    await ferma(page)

    const bersagli = await probe(page)
    expect(bersagli.length, `nessun bersaglio misurato in "${nome}"`).toBeGreaterThan(0)
    righe.push(...report(viewport, nome, bersagli))
    coperti.push(...bersagli.filter((t) => t.status === 'coperto' || t.status === 'piccolo'))

    const c = await contratto(page)
    const manca: string[] = []
    if (c['flexGrow'] !== '1') manca.push(`flex-grow ${c['flexGrow']} invece di 1`)
    if (c['minBlockSize'] !== '0px') manca.push(`min-block-size ${c['minBlockSize']} invece di 0`)
    if (c['overflowY'] !== 'auto') manca.push(`overflow-y ${c['overflowY']} invece di auto`)
    if (c['overscrollBehaviorY'] !== 'contain')
      manca.push(`overscroll-behavior-y ${c['overscrollBehaviorY']} invece di contain`)
    if (parseFloat(c['paddingLeft'] ?? '0') < 16 || parseFloat(c['paddingRight'] ?? '0') < 16)
      manca.push(`padding-inline ${c['paddingLeft']}/${c['paddingRight']}, sotto --sp-4`)
    if (manca.length > 0) senzaContratto.push(`${nome} (${c['classe']}): ${manca.join(', ')}`)
  }

  console.log(`\n${righe.join('\n')}\n`)

  expect(
    coperti.map((t) => `${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`),
    'un overlay copre un bersaglio, o un bersaglio e\' sotto i 44px',
  ).toEqual([])
  expect(
    senzaContratto,
    'un contenitore radice di schermata non dichiara cio\' che lo fa scorrere dentro .app',
  ).toEqual([])
})

/**
 * **Il contenitore scorre, e l'intestazione resta.**
 *
 * La prova comportamentale di cio' che il test sopra prova per dichiarazione: si
 * porta ogni schermata in fondo e si guarda dov'e' finita la barra. Prima della
 * riparazione, `.stats` alto 949 px dentro un `.app` alto 667 mandava
 * `header.getBoundingClientRect().top` a **-327**: le tre schede e Impostazioni
 * uscivano dallo schermo, e in standalone non c'e' il tasto Indietro.
 *
 * Le due asserzioni non sono ridondanti: quella sopra dice **perche'**, questa
 * dice **che**. Se un giorno le cinque dichiarazioni ci fossero tutte e il
 * risultato fosse lo stesso di prima — un `position` di troppo, un antenato che
 * cambia — cadrebbe questa.
 */
test('scorrendo una schermata fino in fondo, la barra resta dov\'e\'', async ({ page }) => {
  await page.goto('./')
  await chiudiGuida(page)
  await semina(page, 400)
  await page.reload()
  await expect(page.locator('.fab')).toBeEnabled()

  const alto = await page.evaluate(() => document.querySelector('header')!.getBoundingClientRect().top)

  for (const nome of await ingressi(page)) {
    await page.locator('.app__bar').getByRole('button', { name: nome, exact: true }).tap()
    await ferma(page)
    const dopo = await page.evaluate((selettore: string) => {
      const radice = document.querySelector(selettore)
      if (radice === null) throw new Error('nessun contenitore radice')
      radice.scrollTop = radice.scrollHeight
      return {
        header: document.querySelector('header')!.getBoundingClientRect().top,
        pagina: document.documentElement.scrollTop,
        eccedenza: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }
    }, RADICE)
    expect(dopo.header, `l'intestazione se n'e' andata in "${nome}"`).toBeCloseTo(alto, 1)
    expect(dopo.pagina, `a scorrere in "${nome}" e' la pagina, non il contenitore`).toBe(0)
    expect(dopo.eccedenza, `la pagina e' piu' alta dello schermo in "${nome}"`).toBeLessThanOrEqual(0)
  }
})

/**
 * **L'intestazione: ci stanno, in tutte e due le lingue.**
 *
 * Qui c'era `header.scrollWidth - header.clientWidth <= 0`, dentro
 * `statistiche.spec.ts`, e valeva **0 a ogni larghezza**: il testo trabocca da un
 * *figlio* dentro il box del padre, e lo scrollWidth del padre non cambia mai.
 * Era cieco per costruzione — la forma peggiore, perche' occupava il posto del
 * guardiano vero. Nemmeno la sonda del centro lo vedeva: `elementFromPoint` al
 * centro di "Home" risponde ancora "Home", perche' il testo di troppo copre la
 * parte **sinistra** della scheda.
 *
 * Il predicato che corrisponde davvero all'affermazione "ci stanno" e' la
 * collisione fra i rettangoli **dipinti**: `A.right > B.left && B.right > A.left`
 * (e lo stesso in verticale) dev'essere falso per ogni coppia.
 *
 * Le sei larghezze sono i telefoni veri: 320 (Zoom schermo), 375 (SE 3ª gen e
 * 13 mini), 390 (12/13/14), 393 (14 e 15 Pro), 410 e 430 (i Plus e i Max).
 *
 * E in **tutte e due le lingue**, che non e' una precauzione: `Fit` riserva a
 * un'etichetta la larghezza massima fra le due, quindi l'italiano e l'inglese
 * hanno la stessa geometria **solo dove `Fit` c'e'**. Dove non c'e' — e ci sono
 * elementi cosi' — la seconda lingua e' una misura diversa, non una ripetizione.
 */
test('in barra ci stanno: nessun bersaglio dipinto sopra un altro, a sei larghezze e in due lingue', async ({
  page,
}) => {
  await page.goto('./')
  await chiudiGuida(page)

  const lingue = [
    // Le due voci del selettore si chiamano "Italiano" e "English" in **tutti e
    // due** i dizionari: sono endonimi, e un endonimo non si traduce. Quindi il
    // nome con cui si tocca la voce non dipende dalla lingua in cui si sta.
    { nome: 'italiano', voce: dizionarioIt['settings.language.it'], atteso: dizionarioIt['nav.stats'] },
    { nome: 'inglese', voce: dizionarioIt['settings.language.en'], atteso: dizionarioEn['nav.stats'] },
  ]

  const guasti: string[] = []
  const misure: string[] = []

  for (const lingua of lingue) {
    // La lingua si cambia **dal prodotto**, con i tap che farebbe un utente: un
    // test che la scrivesse dentro IndexedDB non eserciterebbe mai il selettore,
    // e il giorno che smettesse di scrivere resterebbe verde.
    await page.locator('.app__bar').getByRole('button', { name: /Impostazioni|Settings/ }).tap()
    await page.getByRole('radio', { name: lingua.voce, exact: true }).tap()
    await expect(
      page.locator('.app__bar').getByRole('button', { name: lingua.atteso, exact: true }),
    ).toBeVisible()

    for (const larghezza of [320, 375, 390, 393, 410, 430]) {
      await page.setViewportSize({ width: larghezza, height: 844 })
      await ferma(page)

      const bersagli = await probe(page, '.app__bar')
      expect(
        bersagli.length,
        `nessun bersaglio in barra a ${larghezza}px (${lingua.nome})`,
      ).toBeGreaterThanOrEqual(4)

      const sopra = collisioni(bersagli)
      const fuori = debordi(bersagli)
      misure.push(
        `| ${lingua.nome} | ${larghezza}px | ${bersagli.length} bersagli | ` +
          `${sopra.length} sovrapposti | ${fuori.length} debordanti |`,
      )
      guasti.push(...sopra.map((s) => `${lingua.nome} @${larghezza}px — sopra: ${s}`))
      guasti.push(...fuori.map((s) => `${lingua.nome} @${larghezza}px — deborda: ${s}`))
    }
  }

  console.log(`\n${misure.join('\n')}\n`)
  expect(guasti, 'in barra qualcosa e\' dipinto sopra qualcos\'altro').toEqual([])
})
