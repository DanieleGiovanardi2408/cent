/**
 * La sonda della regola "Sovrapposizioni" (CLAUDE.md).
 *
 * Per **ogni** bersaglio interattivo, su tre viewport e con gli overlay
 * **attivi**, `document.elementFromPoint(centro del bersaglio)` deve restituire
 * quel bersaglio o un suo discendente. Piu' il controllo gemello: nessun
 * bersaglio sotto i 44px.
 *
 * Questa sonda ha trovato due bug identici, ed era stata eseguita **una volta a
 * mano**:
 *
 * - il toast con "Annulla" stava sopra il tastierino: a 757px di altezza il
 *   bottone cadeva dentro il tasto "9", centrato. Si salvava una spesa, si
 *   riapriva il foglio entro sei secondi, si digitava 9 e si cancellava la spesa
 *   precedente;
 * - l'avviso di aggiornamento copriva l'unico bottone di export: toccare dove
 *   c'era scritto "Esporta" ricaricava l'app.
 *
 * Non erano due sviste: mancava la regola, e mancava questo test.
 *
 * ## Cosa e' escluso, e perche' non e' un'eccezione alla regola
 *
 * Quando c'e' un modale (bottom sheet, foglio delle azioni, pannello del
 * backup) tutto quello che sta dietro e' dentro `aria-hidden="true"` e sotto al
 * velo: **deve** essere irraggiungibile, e' il senso di un modale. Quei
 * bersagli vengono contati a parte, e la sonda verifica che siano davvero
 * inerti invece di far finta che non esistano.
 */
// Questi test provano l'app, quindi dichiarano di girare nell'app installata:
// fuori da standalone Cent e' una pagina di installazione (ADR 011). Vedi
// `installed.ts` per il perche' la cucitura sta qui e non nel codice dell'app.
import { expect, test } from './installed'
import type { Page } from '@playwright/test'
// La sonda vive in `probe.ts`: la usa anche `install.spec.ts`, dove la stessa
// misura serve a contare zero invece di contare tutto (ADR 011).
import { probe, report } from './probe'
import type { Target } from './probe'

/** Semina l'archivio scrivendo dentro IndexedDB: 5.000 spese su un anno. */
async function seed(page: Page, howMany: number): Promise<void> {
  await page.evaluate(async (total: number) => {
    const open = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('cent')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })

    const db = await open()
    const categories: { id: string }[] = await new Promise((resolve, reject) => {
      const request = db.transaction('categories').objectStore('categories').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    const iso = (offset: number): string => {
      const d = new Date()
      d.setDate(d.getDate() - offset)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('expenses', 'readwrite')
      const store = tx.objectStore('expenses')
      for (let i = 0; i < total; i += 1) {
        const at = 1_700_000_000_000 + i
        store.put({
          id: `seed-${i}`,
          createdAt: at,
          updatedAt: at,
          amountCents: 150 + (i % 900) * 7,
          categoryId: categories[i % categories.length]?.id ?? 'x',
          date: iso(Math.floor(i / 14)),
          note: i % 5 === 0 ? 'Nota lunga quanto basta per andare a capo' : undefined,
          source: 'manual',
        })
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, howMany)
}

/** La schermata attiva e' stato, non una rotta (ADR 002): si cambia col tap. */
async function go(page: Page, tab: 'Home' | 'Storico'): Promise<void> {
  await page.locator('.nav__tab', { hasText: tab }).tap()
  await expect(page.locator(tab === 'Home' ? '.home' : '.list')).toBeVisible()
}

/**
 * Aspetta che nessuna animazione sia in corso.
 *
 * E' la condizione vera al posto di un `waitForTimeout(300)`, e la differenza
 * non e' di stile: un'attesa fissa troppo corta **non produce un rosso, produce
 * un verde su meno bersagli**. Se il foglio si sta ancora alzando, i suoi
 * bersagli cadono fuori da `inView` e la sonda li salta in silenzio — e
 * `targets.length > 0` non se ne accorge, perche' la sola barra in alto ne da'
 * gia' tre. Un test che tace su cio' che non ha guardato e' peggio di uno che
 * fallisce. E' lo stesso modello di `showUpdateBanner` qui sotto.
 */
async function still(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  })
}

/** Apre un foglio col tastierino e aspetta che sia fermo, non che sia passato del tempo. */
async function openSheet(page: Page, by: string): Promise<void> {
  await page.locator(by).tap()
  await expect(page.locator('.sheet')).toBeVisible()
  await still(page)
}

/** Chiude il foglio dal velo e aspetta che sia uscito dal DOM davvero. */
async function closeSheet(page: Page): Promise<void> {
  await page.locator('.scrim').tap({ position: { x: 4, y: 4 } })
  await expect(page.locator('.sheet')).toHaveCount(0)
}

/**
 * L'avviso di aggiornamento richiede un service worker in attesa, cioe' un
 * secondo deploy: qui si inietta il suo contenuto nella regione live che sta
 * gia' nel DOM. E' lo stesso nodo, lo stesso CSS e la stessa geometria — quello
 * che la sonda misura — senza inscenare un aggiornamento vero, che e' materia
 * di un altro test.
 */
async function showUpdateBanner(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const host = document.querySelector('.updater')
    if (host === null) throw new Error('la regione dell\'avviso di aggiornamento non e\' nel DOM')
    host.innerHTML = `
      <div class="updater__inner">
        <button type="button" class="updater__action">
          <svg class="updater__icon" viewBox="0 0 24 24" width="20" height="20"><path d="M12 4v11"/></svg>
          <span class="updater__text">
            <span class="updater__title">Nuova versione disponibile</span>
            <span class="updater__hint">Tocca per aggiornare</span>
          </span>
        </button>
        <button type="button" class="updater__dismiss" aria-label="Non ora">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="m7 7 10 10M17 7 7 17"/></svg>
        </button>
      </div>`

    // Aspetta che l'entrata sia finita prima di restituire il controllo.
    // Misurare un elemento che si sta ancora animando e' leggere uno stato in un
    // momento arbitrario invece di attendere una condizione: e' la stessa gara
    // che aveva reso vacuo il confronto di testo nel test offline, e qui faceva
    // fallire la sonda una volta su qualche centinaio.
    await Promise.all(
      host.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)),
    )
  })
}

test('nessun overlay copre un bersaglio, su ogni viewport e in ogni stato', async ({
  page,
}, testInfo) => {
  const viewport = `${testInfo.project.use.viewport?.width}x${testInfo.project.use.viewport?.height}`
  const rows: string[] = []
  const failures: Target[] = []

  const check = async (state: string): Promise<void> => {
    const targets = await probe(page)
    expect(targets.length, `nessun bersaglio misurato in "${state}": la sonda non prova niente`)
      .toBeGreaterThan(0)
    rows.push(...report(viewport, state, targets))
    failures.push(...targets.filter((t) => t.status === 'coperto' || t.status === 'piccolo'))
  }

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()

  // --- 5.000 spese, non tre: la lista deve reggere il caso vero.
  await seed(page, 5000)
  await page.reload()
  await expect(page.locator('.row').first()).toBeVisible()

  // Dalla fase 4 la schermata iniziale e' la Home: lo Storico e' il secondo tap.
  await go(page, 'Storico')
  await check('lista, nessun overlay')

  // --- Una spesa vera, contando i tap: FAB, cifre, categoria.
  await openSheet(page, '.fab')
  await check('foglio aperto (tastierino)')

  for (const digit of ['1', '2', '5', '0']) {
    await page.locator('.pad__key', { hasText: new RegExp(`^${digit}$`) }).first().tap()
  }
  await expect(page.locator('.amount')).toHaveText('12,50 €')
  await check('foglio aperto, importo digitato')

  await page.locator('.cat').first().tap()
  await expect(page.locator('.toast__box')).toBeVisible()
  // Il foglio esce e sparisce dal DOM: finche' c'e', la lista dietro e' inerte
  // e la sonda misurerebbe uno stato di passaggio invece di quello finale.
  await expect(page.locator('.sheet')).toHaveCount(0)
  await still(page)

  // --- Lo stato che nascondeva il bug: toast con "Annulla" **e** avviso di
  //     aggiornamento, insieme, sopra una lista piena.
  await showUpdateBanner(page)
  await check('toast con Annulla + avviso di aggiornamento')

  // --- E lo stato in cui il bug mordeva: il foglio riaperto mentre il toast
  //     sarebbe ancora vivo. Il toast deve essersene andato da solo.
  await openSheet(page, '.fab')
  await expect(page.locator('.toast__box')).toHaveCount(0)
  await check('foglio riaperto + avviso di aggiornamento')

  await closeSheet(page)

  // --- Il foglio delle azioni su una spesa dello Storico.
  await page.locator('.row').first().tap()
  await expect(page.locator('.acts')).toBeVisible()
  await still(page)
  await check('azioni sulla spesa + avviso di aggiornamento')

  console.log(`\n${rows.join('\n')}\n`)

  expect(
    failures.map((t) => `${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`),
    'un overlay copre un bersaglio, o un bersaglio e\' sotto i 44px',
  ).toEqual([])
})

/**
 * Il bug nella sua forma comportamentale, non geometrica.
 *
 * Salvi una spesa; entro sei secondi tocchi il FAB per la successiva e digiti 9.
 * Prima: quel 9 cadeva sul bottone "Annulla" del toast e cancellava la spesa
 * appena inserita. Poi compariva "Spesa annullata [Ripristina]" nello stesso
 * punto, e il secondo tentativo la ripristinava.
 *
 * E la sua variante lenta: il toast di ieri sera che e' ancora li' stamattina,
 * perche' `setTimeout` in background si congela (regola "Stato dell'interfaccia
 * e sospensione" in CLAUDE.md).
 */
test('il toast non sopravvive ne\' all\'apertura del foglio ne\' a una sospensione', async ({
  page,
}) => {
  const add = async (digits: string[]): Promise<void> => {
    await openSheet(page, '.fab')
    for (const digit of digits) {
      await page.locator('.pad__key', { hasText: new RegExp(`^${digit}$`) }).first().tap()
    }
    await page.locator('.cat').first().tap()
    await expect(page.locator('.sheet')).toHaveCount(0)
  }

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()

  await add(['1', '2', '5', '0'])
  await expect(page.locator('.row')).toHaveCount(1)
  await expect(page.locator('.toast__action')).toHaveText('Annulla')

  // Il FAB, subito: il toast se ne va prima che il tastierino esista.
  await openSheet(page, '.fab')
  await expect(page.locator('.toast__box')).toHaveCount(0)

  // E il 9 e' un 9.
  await page.locator('.pad__key', { hasText: /^9$/ }).first().tap()
  await expect(page.locator('.amount')).toHaveText('0,09 €')
  await closeSheet(page)
  await expect(page.locator('.row')).toHaveCount(1)

  // --- La sospensione. L'orologio va avanti di dodici ore mentre il timer,
  //     congelato, non e' mai scattato: al ritorno il toast deve essere sparito.
  await add(['3', '0', '0'])
  await expect(page.locator('.toast__action')).toHaveText('Annulla')
  await page.evaluate(() => {
    const real = Date.now
    Date.now = () => real() + 12 * 60 * 60 * 1000
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.locator('.toast__box')).toHaveCount(0)
  await expect(page.locator('.row')).toHaveCount(2)
})

/**
 * L'unica deviazione misurata, e il suo confine.
 *
 * L'intestazione del giorno e' `position: sticky`: scorrendo, una riga ci passa
 * sotto e per una frazione di scroll il suo centro finisce coperto. E' l'unico
 * punto dell'app in cui succede, e resta perche' le due cose non sono la stessa:
 *
 * - il toast sul tastierino faceva partire **un'altra azione** (il 9 cancellava
 *   la spesa precedente);
 * - qui il tap non fa **niente**, e sulla stessa striscia in cui la riga non si
 *   vede nemmeno. La parte visibile della riga risponde, e bastano 40px di
 *   scroll per liberarla.
 *
 * Il confine e' questo test: sotto l'intestazione ci puo' finire una riga, e
 * l'intestazione non puo' contenere niente di toccabile. Se un giorno ci
 * mettessero un bottone — "mostra solo questo giorno", un filtro — quel bottone
 * risponderebbe al posto della riga e questo test cadrebbe.
 */
test('l\'intestazione appiccicata copre righe, ma non e\' toccabile', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await seed(page, 60)
  await page.reload()
  await expect(page.locator('.row').first()).toBeVisible()
  await go(page, 'Storico')

  const covered = await page.evaluate(() => {
    const list = document.querySelector('.list')
    if (list === null) return ['la lista non c\'e\'']
    list.scrollTop = 30
    const box = list.getBoundingClientRect()
    const wrong: string[] = []
    for (const row of document.querySelectorAll('.row')) {
      const r = row.getBoundingClientRect()
      const x = Math.round(r.left + r.width / 2)
      const y = Math.round(r.top + r.height / 2)
      if (y < box.top || y > box.bottom) continue
      const hit = document.elementFromPoint(x, y)
      if (hit === row || row.contains(hit)) continue
      // Coperta: l'unico coprente ammesso e' l'intestazione del giorno.
      const head = hit?.closest('.day__head') ?? null
      if (head === null) wrong.push(`riga coperta da ${hit?.className ?? hit}`)
      else if (head.querySelector('button, a[href], input, [tabindex]') !== null) {
        wrong.push('l\'intestazione appiccicata contiene un bersaglio interattivo')
      }
    }
    return wrong
  })

  expect(covered).toEqual([])
})

test('il tastierino e le otto categorie ci stanno, senza scroll', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await openSheet(page, '.fab')

  // Tutti e undici i tasti e tutte e otto le categorie, dentro il foglio.
  await expect(page.locator('.pad__key')).toHaveCount(11)
  await expect(page.locator('.cat')).toHaveCount(8)

  const spill = await page.evaluate(() => {
    const sheet = document.querySelector('.sheet')
    if (sheet === null) return ['il foglio non c\'e\'']
    const box = sheet.getBoundingClientRect()
    const out: string[] = []
    for (const el of sheet.querySelectorAll('.pad__key, .cat, .chip, .amount')) {
      const r = el.getBoundingClientRect()
      if (r.bottom > box.bottom + 0.5 || r.top < box.top - 0.5 || r.right > box.right + 0.5) {
        out.push(`${el.className} esce dal foglio: ${Math.round(r.top)}..${Math.round(r.bottom)} contro ${Math.round(box.top)}..${Math.round(box.bottom)}`)
      }
    }
    return out
  })
  expect(spill, 'qualcosa e\' tagliato dal foglio (era il bug dell\'orizzontale)').toEqual([])

  // Nessuno scroll: ne' orizzontale in pagina, ne' dentro il foglio.
  const scroll = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    sheet: (() => {
      const s = document.querySelector('.sheet')
      return s === null ? 0 : s.scrollHeight - s.clientHeight
    })(),
  }))
  expect(scroll.page, 'c\'e\' scroll orizzontale in pagina').toBeLessThanOrEqual(0)
  expect(scroll.sheet, 'il contenuto del foglio non ci sta: servirebbe uno scroll').toBeLessThanOrEqual(0)
})

/**
 * La stessa sonda sulla Home, che dalla fase 4 e' la schermata iniziale.
 *
 * Serve una prova sua, e non basta quella dello Storico, per due ragioni:
 *
 * 1. la Home ha un bersaglio che lo Storico non ha — il bottone del budget — e
 *    sta **in fondo alla colonna**, cioe' esattamente dove arriva l'avviso di
 *    aggiornamento. E' il caso che direbbe subito se la scelta della fase 2 (il
 *    banner in flusso invece che in overlay) regge anche qui;
 * 2. la Home ha tre stati con contenuti diversi — senza budget, con budget, con
 *    5.000 spese — e in due di essi il contenuto sotto il numero grande cambia
 *    del tutto.
 */
test('nessun overlay copre un bersaglio nella Home, in tutti i suoi stati', async ({
  page,
}, testInfo) => {
  const viewport = `${testInfo.project.use.viewport?.width}x${testInfo.project.use.viewport?.height}`
  const rows: string[] = []
  const failures: Target[] = []

  const check = async (state: string): Promise<void> => {
    const targets = await probe(page)
    expect(targets.length, `nessun bersaglio misurato in "${state}": la sonda non prova niente`)
      .toBeGreaterThan(0)
    rows.push(...report(viewport, state, targets))
    failures.push(...targets.filter((t) => t.status === 'coperto' || t.status === 'piccolo'))
  }

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()

  // --- Archivio vuoto e nessun budget: lo stato del primo avvio.
  await expect(page.locator('.budget')).toHaveText('Imposta un budget')
  await check('home vuota, nessun budget')

  // --- Lo stato che mette alla prova la posizione dell'avviso: l'unico bottone
  //     in fondo alla colonna e l'avviso che compare proprio li'.
  await showUpdateBanner(page)
  await check('home vuota + avviso di aggiornamento')

  // --- Il foglio del budget: tastierino, due bersagli che selezionano e uno,
  //     in fondo, che scrive. Il "Salva" spento non e' misurabile dalla sonda
  //     (salta i `:disabled`), quindi lo stato che conta e' quello con l'importo.
  await openSheet(page, '.budget')
  await expect(page.locator('.period')).toHaveCount(2)
  await check('foglio del budget aperto')

  for (const digit of ['2', '0', '0', '0', '0']) {
    await page.locator('.pad__key', { hasText: new RegExp(`^${digit}$`) }).first().tap()
  }
  await expect(page.locator('.amount')).toHaveText('200,00 €')
  await expect(page.locator('.save')).toBeEnabled()
  await check('foglio del budget, importo digitato')

  await page.locator('.period', { hasText: 'A settimana' }).tap()
  await expect(page.locator('.period', { hasText: 'A settimana' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.locator('.save').tap()
  await expect(page.locator('.sheet')).toHaveCount(0)
  await expect(page.locator('.budget')).toHaveText('Cambia il budget')
  await expect(page.locator('.toast__box')).toBeVisible()
  await still(page)
  await check('home con budget + toast + avviso di aggiornamento')

  // --- E con l'archivio pieno: 5.000 spese, di cui quattordici oggi.
  await seed(page, 5000)
  await page.reload()
  await showUpdateBanner(page)
  await expect(page.locator('.row').first()).toBeVisible()
  await check('home con budget, 5.000 spese + avviso di aggiornamento')

  console.log(`\n${rows.join('\n')}\n`)

  expect(
    failures.map((t) => `${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`),
    'un overlay copre un bersaglio, o un bersaglio e\' sotto i 44px',
  ).toEqual([])
})

/**
 * Dove stanno le due cose in barra, misurato invece che deciso a occhio.
 *
 * Erano invertite: le schede nell'angolo in alto a **sinistra** — il punto piu'
 * lontano dal pollice su un telefono tenuto con una mano, e su iPhone 14 sono
 * 770px dal centro del FAB — e "Esporta", che si tocca una volta ogni due
 * settimane, nell'angolo migliore dei due. La navigazione e' l'azione ricorrente
 * e si prende il posto buono.
 *
 * Il test non fissa "a destra" come gusto: fissa la **ragione**, cioe' che le
 * schede siano piu' vicine al FAB di quanto lo sia l'export. Se un giorno il FAB
 * cambiasse angolo, questo test direbbe da solo dove va la navigazione.
 */
test('la navigazione sta nell\'angolo raggiungibile, non "Esporta"', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()

  const centre = async (selector: string): Promise<{ x: number; y: number }> => {
    const box = await page.locator(selector).boundingBox()
    if (box === null) throw new Error(`${selector} non e' in pagina`)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  const fab = await centre('.fab')
  const nav = await centre('.nav')
  const esporta = await centre('.app__action')
  const far = (p: { x: number; y: number }): number => Math.hypot(p.x - fab.x, p.y - fab.y)

  expect(nav.x, 'le schede non sono dopo "Esporta"').toBeGreaterThan(esporta.x)
  expect(
    Math.round(far(nav)),
    `le schede (${Math.round(far(nav))}px dal FAB) non sono piu' vicine di "Esporta" (${Math.round(far(esporta))}px)`,
  ).toBeLessThan(Math.round(far(esporta)))
})
