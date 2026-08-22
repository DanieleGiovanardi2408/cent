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
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

interface Target {
  readonly label: string
  readonly rect: string
  readonly status: 'ok' | 'coperto' | 'piccolo' | 'inerte'
  readonly hit: string
}

/**
 * Misura tutti i bersagli interattivi visibili e dice, per ciascuno, chi
 * risponde al centro.
 */
async function probe(page: Page): Promise<readonly Target[]> {
  return page.evaluate(() => {
    const name = (el: Element | null): string => {
      if (el === null) return '(niente)'
      const classes = typeof el.className === 'string' && el.className !== ''
        ? `.${el.className.trim().split(/\s+/).join('.')}`
        : ''
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 16)
      return `${el.tagName.toLowerCase()}${classes}${text === '' ? '' : ` "${text}"`}`
    }

    /**
     * Il centro e' davvero raggiungibile col dito?
     *
     * Non basta che stia nel viewport: una riga a meta' fuori dal contenitore
     * che scorre e' **ritagliata da quel contenitore**, non coperta da un
     * overlay — al suo posto si vede il bordo della lista, e per toccarla si
     * scorre. Confonderle farebbe accusare di sovrapposizione il primo elemento
     * dipinto sotto la lista, che e' il contrario di quello che la sonda cerca.
     */
    const inView = (el: Element, x: number, y: number): boolean => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false
      for (let p = el.parentElement; p !== null; p = p.parentElement) {
        const style = getComputedStyle(p)
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
        const clip = p.getBoundingClientRect()
        if (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom) return false
      }
      return true
    }

    const nodes = [...document.querySelectorAll<HTMLElement>('button, input, textarea, a[href]')]
    const out: Target[] = []

    for (const el of nodes) {
      if (el.matches(':disabled')) continue
      const box = el.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) continue
      const x = Math.round(box.left + box.width / 2)
      const y = Math.round(box.top + box.height / 2)
      if (!inView(el, x, y)) continue

      const rect = `${Math.round(box.width)}x${Math.round(box.height)}`
      const inert = el.closest('[aria-hidden="true"]') !== null
      const hit = document.elementFromPoint(x, y)
      const reached = hit === el || el.contains(hit)

      const status: Target['status'] = inert
        ? reached
          ? 'coperto' // dietro a un modale ma ancora toccabile: e' un bug al contrario
          : 'inerte'
        : !reached
          ? 'coperto'
          : Math.min(box.width, box.height) < 44
            ? 'piccolo'
            : 'ok'

      out.push({ label: name(el), rect, status, hit: name(hit) })
    }
    return out
  })
}

/** Una riga di tabella per stato, e l'elenco puntuale di quello che non va. */
function report(viewport: string, state: string, targets: readonly Target[]): string[] {
  const count = (s: Target['status']): number => targets.filter((t) => t.status === s).length
  const bad = targets.filter((t) => t.status === 'coperto' || t.status === 'piccolo')
  const lines = [
    `| ${viewport} | ${state} | ${targets.length} | ${count('ok')} | ${count('inerte')} | ${bad.length} |`,
  ]
  for (const t of bad) lines.push(`|   -> ${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`)
  return lines
}

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

/**
 * L'avviso di aggiornamento richiede un service worker in attesa, cioe' un
 * secondo deploy: qui si inietta il suo contenuto nella regione live che sta
 * gia' nel DOM. E' lo stesso nodo, lo stesso CSS e la stessa geometria — quello
 * che la sonda misura — senza inscenare un aggiornamento vero, che e' materia
 * di un altro test.
 */
async function showUpdateBanner(page: Page): Promise<void> {
  await page.evaluate(() => {
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

  await check('lista, nessun overlay')

  // --- Una spesa vera, contando i tap: FAB, cifre, categoria.
  await page.locator('.fab').tap()
  await page.waitForTimeout(300)
  await check('foglio aperto (tastierino)')

  for (const digit of ['1', '2', '5', '0']) {
    await page.locator('.pad__key', { hasText: new RegExp(`^${digit}$`) }).first().tap()
  }
  await expect(page.locator('.amount')).toHaveText('12,50 €')
  await check('foglio aperto, importo digitato')

  await page.locator('.cat').first().tap()
  await expect(page.locator('.toast__box')).toBeVisible()
  await page.waitForTimeout(300)

  // --- Lo stato che nascondeva il bug: toast con "Annulla" **e** avviso di
  //     aggiornamento, insieme, sopra una lista piena.
  await showUpdateBanner(page)
  await check('toast con Annulla + avviso di aggiornamento')

  // --- E lo stato in cui il bug mordeva: il foglio riaperto mentre il toast
  //     sarebbe ancora vivo. Il toast deve essersene andato da solo.
  await page.locator('.fab').tap()
  await page.waitForTimeout(300)
  await expect(page.locator('.toast__box')).toHaveCount(0)
  await check('foglio riaperto + avviso di aggiornamento')

  await page.locator('.scrim').tap({ position: { x: 4, y: 4 } })
  await page.waitForTimeout(300)

  // --- Il foglio delle azioni su una spesa dello Storico.
  await page.locator('.row').first().tap()
  await page.waitForTimeout(300)
  await expect(page.locator('.acts')).toBeVisible()
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
    await page.locator('.fab').tap()
    await page.waitForTimeout(250)
    for (const digit of digits) {
      await page.locator('.pad__key', { hasText: new RegExp(`^${digit}$`) }).first().tap()
    }
    await page.locator('.cat').first().tap()
    await page.waitForTimeout(250)
  }

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()

  await add(['1', '2', '5', '0'])
  await expect(page.locator('.row')).toHaveCount(1)
  await expect(page.locator('.toast__action')).toHaveText('Annulla')

  // Il FAB, subito: il toast se ne va prima che il tastierino esista.
  await page.locator('.fab').tap()
  await page.waitForTimeout(250)
  await expect(page.locator('.toast__box')).toHaveCount(0)

  // E il 9 e' un 9.
  await page.locator('.pad__key', { hasText: /^9$/ }).first().tap()
  await expect(page.locator('.amount')).toHaveText('0,09 €')
  await page.locator('.scrim').tap({ position: { x: 3, y: 3 } })
  await page.waitForTimeout(250)
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
  await page.locator('.fab').tap()
  await page.waitForTimeout(300)

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
