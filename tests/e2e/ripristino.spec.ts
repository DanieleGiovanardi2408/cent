/**
 * Il ripristino da un backup, dal selettore di file in poi.
 *
 * ## Cosa chiude questo file
 *
 * **DEBITO §14**, e la sua condizione era esattamente questa: *"il commit del
 * selettore di file — nello stesso istante in cui la schermata diventa
 * raggiungibile, l'invariante diventa asseribile da una e2e normale, e va
 * asserito li', non nel giro dopo"*. Fino a ieri la geometria di `ImportSheet`
 * era stata **misurata a mano** su un montaggio costruito e smontato apposta:
 * un numero vero, che nessuno avrebbe piu' rimisurato. `.blank__text` e' passata
 * da 663,8 a 689,81 px in tre giorni mentre la schermata veniva migliorata
 * altrove — il costo di un invariante non meccanizzato non e' che il difetto
 * resta, e' che **cresce**.
 *
 * ## E la seconda meta': l'azione dipende dallo stato (ADR 026 §6f)
 *
 * Il giro A aveva **un'azione sola** sotto due etichette: il bottone diceva
 * *"Riprova"* e faceva *"Scegli un altro file"*. Non e' un fastidio — e' il
 * momento in cui una persona che sta cercando di recuperare i propri dati
 * ripesca lo stesso file, ottiene lo stesso errore, e conclude che l'app e'
 * rotta.
 *
 * Quindi qui si asserisce **cio' che l'azione fa**, non l'etichetta che porta:
 * "Riprova" rilegge lo **stesso `File`** e **non** riapre il selettore di
 * sistema; "Scegli un altro file" lo riapre. Un'asserzione sul testo sarebbe
 * passata anche sul difetto.
 *
 * ## Le cuciture, e perche' sono queste
 *
 * Due, e nessuna delle due tocca il codice di produzione:
 *
 * 1. **`page.on('filechooser')`** — il selettore vero viene aperto davvero da
 *    `input.click()`, e Playwright lo intercetta. E' anche il **contatore**: e'
 *    l'unico modo di distinguere "ha riletto" da "ha riaperto".
 * 2. **`Blob.prototype.text` inscenato** — per gli unici due stati che un file
 *    non puo' produrre da solo: la lettura che **non arriva mai** (iCloud) e la
 *    lettura che **fallisce**. `addInitScript` e non un'assegnazione dopo il
 *    caricamento: `readFile` prende il metodo al momento della lettura, ma la
 *    pagina va preparata prima di qualunque script dell'app — stessa ragione per
 *    cui `installed.ts` dichiara `navigator.standalone` da li'.
 */
import { chiudiGuida, expect, test } from './installed'
import { fissaOrologio } from './clock'
import type { Page } from '@playwright/test'

/** Un backup buono: due categorie, una spesa viva e una lapide. */
const BUONO = {
  app: 'cent',
  schemaVersion: 6,
  exportedAt: '2026-08-26T09:00:00.000Z',
  data: {
    expenses: [
      {
        id: 'e1',
        createdAt: '2026-08-20T09:00:00.000Z',
        updatedAt: '2026-08-20T09:00:00.000Z',
        amountCents: 1250,
        categoryId: 'c1',
        date: '2026-08-20',
        source: 'manual',
      },
      {
        id: 'e2',
        createdAt: '2026-08-21T09:00:00.000Z',
        updatedAt: '2026-08-21T09:00:00.000Z',
        amountCents: 300,
        categoryId: 'c1',
        date: '2026-08-21',
        source: 'manual',
        deletedAt: '2026-08-21T10:00:00.000Z',
      },
    ],
    categories: [
      {
        id: 'c1',
        createdAt: '2026-08-01T09:00:00.000Z',
        updatedAt: '2026-08-01T09:00:00.000Z',
        name: 'Spesa',
        emoji: '🛒',
        color: '#6b7280',
        order: 0,
        archived: false,
      },
      {
        id: 'c2',
        createdAt: '2026-08-01T09:00:00.000Z',
        updatedAt: '2026-08-01T09:00:00.000Z',
        name: 'Fuori',
        emoji: '🍽️',
        color: '#6b7280',
        order: 1,
        archived: false,
      },
    ],
    recurringRules: [],
    budgets: [],
  },
}

/** Lo stesso file con una spesa illeggibile: `expenses[0].amountCents`. */
const ROTTO = {
  ...BUONO,
  data: {
    ...BUONO.data,
    expenses: [{ ...BUONO.data.expenses[0], amountCents: 12.5 }, BUONO.data.expenses[1]],
  },
}

/** Un backup senza nessuna categoria: uno stato a cui l'app non sopravvive. */
const SENZA_CATEGORIE = { ...BUONO, data: { ...BUONO.data, categories: [] } }

/** Scritto da una versione futura: aprirlo qui mutilerebbe cio' che non conosciamo. */
const TROPPO_NUOVO = { ...BUONO, schemaVersion: 99 }

/** JSON valido che non parla di Cent. */
const ALTRUI = { note: 'la lista della spesa', righe: [] }

/**
 * Come si comporta la lettura del `File`, deciso dal test.
 *
 * - `ok` — il file si legge davvero;
 * - `mai` — una promessa che non si risolve: e' iCloud Drive che non arriva, ed
 *   e' l'unico modo di **fermare** la schermata sul primo dei quattro stati;
 * - `errore` — la lettura fallisce, che e' lo stato in cui "Riprova" esiste.
 *
 * `__letture` conta le letture riuscite a partire: e' cio' che dice se
 * "Riprova" ha **riletto** invece di essere rimasto fermo.
 */
type Lettura = 'ok' | 'mai' | 'errore'

async function inscenaLettura(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const spia = window as unknown as { __lettura: string; __letture: number }
    spia.__lettura = 'ok'
    spia.__letture = 0
    const vero = Blob.prototype.text
    Object.defineProperty(Blob.prototype, 'text', {
      configurable: true,
      value: function (this: Blob): Promise<string> {
        if (spia.__lettura === 'mai') return new Promise<string>(() => {})
        spia.__letture += 1
        if (spia.__lettura === 'errore') {
          return Promise.reject(new DOMException('The file could not be read', 'NotReadableError'))
        }
        return vero.call(this)
      },
    })
  })
}

async function modoLettura(page: Page, modo: Lettura): Promise<void> {
  await page.evaluate((m: string) => {
    ;(window as unknown as { __lettura: string }).__lettura = m
  }, modo)
}

async function letture(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __letture: number }).__letture)
}

/**
 * Il selettore di file, servito e **contato**.
 *
 * Il contatore e' l'asserzione vera di ADR 026 §6f: senza, "Riprova" e "Scegli
 * un altro file" sono indistinguibili da fuori, che e' esattamente com'erano
 * dentro nel giro A.
 */
/**
 * Il testo come `Buffer`, preso da `globalThis`.
 *
 * `Buffer` **esiste** nel processo di Node che esegue i test; quello che non
 * esiste in questo progetto sono i **tipi** di Node — `tsconfig.json` dichiara
 * `types: ["vite/client", "vite-plugin-pwa/client"]` e basta, e aggiungere
 * `@types/node` per una riga di test sarebbe una dipendenza in piu' per un
 * problema di dichiarazioni.
 *
 * Un `Uint8Array` al suo posto non funziona e **fallisce lontano**: Playwright
 * fa `buffer.toString('base64')` per spedirlo al browser, e un `Uint8Array`
 * risponde con i byte separati da virgole — l'errore che si legge e'
 * `InvalidCharacterError` dentro `atob`, in una pagina, tre passaggi piu' in la'.
 */
function contenutoBinario(testo: string): never {
  const node = globalThis as unknown as { Buffer: { from(s: string, enc: string): never } }
  return node.Buffer.from(testo, 'utf8')
}

function serviIlSelettore(page: Page, contenuto: () => unknown): { aperture: () => number } {
  let aperture = 0
  page.on('filechooser', (chooser) => {
    aperture += 1
    void chooser.setFiles({
      name: 'cent-2026-08-26.json',
      mimeType: 'application/json',
      buffer: contenutoBinario(JSON.stringify(contenuto())),
    })
  })
  return { aperture: () => aperture }
}

async function apriImpostazioni(page: Page): Promise<void> {
  await fissaOrologio(page)
  await inscenaLettura(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
}

/** Il bottone "Ripristina da un backup", che esiste solo perche' esiste il selettore. */
function bottoneRipristina(page: Page) {
  return page.locator('.prefs__action', { hasText: 'Ripristina da un backup' })
}

test.describe('il selettore di file apre il ripristino', () => {
  test('la voce c\'e\', e porta all\'anteprima del file scelto', async ({ page }) => {
    const selettore = serviIlSelettore(page, () => BUONO)
    await apriImpostazioni(page)

    await expect(
      bottoneRipristina(page),
      'la voce non compare: senza sorgente `App` non la mostra, e qui la sorgente c\'e\'',
    ).toBeVisible()

    await bottoneRipristina(page).tap()
    await expect(page.locator('.restore')).toBeVisible()

    expect(selettore.aperture(), 'il selettore di sistema non e\' stato aperto').toBe(1)
    await expect(page.locator('.restore__lead')).toContainText('Ripristinando il backup del')
    // Il prima/dopo conta cio' che l'utente **vedra'**: la lapide non entra.
    await expect(page.locator('.restore__table')).toContainText('Spese')
    const riga = page.locator('.restore__table tbody tr').first()
    await expect(riga.locator('td').nth(1), 'la lapide e\' finita nel conteggio').toHaveText('1')
  })
})

test.describe('l\'azione dipende dallo stato, e non e\' un\'etichetta', () => {
  /**
   * **"Riprova" rilegge lo stesso `File`.**
   *
   * L'asserzione non e' sul testo del bottone: e' su **quante volte il selettore
   * di sistema si e' aperto** (una) e **quante volte il file e' stato letto**
   * (due). Sul difetto del giro A il testo sarebbe stato identico e le aperture
   * sarebbero state due — cioe' l'utente davanti al foglio File una seconda
   * volta, a ripescare lo stesso file per ottenere lo stesso errore.
   *
   * E la seconda lettura riesce, che e' il caso vero: su iCloud Drive il
   * download e' partito nel frattempo.
   */
  test('"Riprova" rilegge lo stesso file, senza riaprire il selettore', async ({ page }) => {
    const selettore = serviIlSelettore(page, () => BUONO)
    await apriImpostazioni(page)
    await modoLettura(page, 'errore')

    await bottoneRipristina(page).tap()
    await expect(page.locator('.restore__lead')).toHaveText('Non sono riuscito a leggere quel file.')
    expect(selettore.aperture(), 'il selettore non si e\' aperto per la prima scelta').toBe(1)
    expect(await letture(page), 'il file non e\' mai stato letto').toBe(1)

    const azione = page.locator('.restore__action')
    await expect(azione).toHaveText('Riprova')

    // Il download da iCloud e' arrivato: la seconda lettura dello **stesso** file
    // riesce. E' l'unico stato in cui riprovare ha senso.
    await modoLettura(page, 'ok')
    await azione.tap()

    await expect(page.locator('.restore__lead')).toContainText('Ripristinando il backup del')
    expect(
      selettore.aperture(),
      '"Riprova" ha riaperto il selettore di sistema: promette di ritentare e chiede di ricominciare',
    ).toBe(1)
    expect(await letture(page), '"Riprova" non ha riletto niente').toBe(2)
  })

  /**
   * **"Scegli un altro file" riapre il selettore**, che e' il rimedio giusto
   * quando il file e' arrivato tutto e non e' un backup: riprovare con lo stesso
   * non serve a niente.
   *
   * Il selettore serve **due contenuti diversi** — prima un JSON di qualcun
   * altro, poi un backup vero — perche' un'asserzione su un secondo rifiuto
   * identico non distinguerebbe "ha riaperto" da "non ha fatto niente".
   */
  test('"Scegli un altro file" riapre il selettore', async ({ page }) => {
    const coda: unknown[] = [ALTRUI, BUONO]
    const selettore = serviIlSelettore(page, () => coda.shift() ?? BUONO)
    await apriImpostazioni(page)

    await bottoneRipristina(page).tap()
    await expect(page.locator('.restore__lead')).toHaveText('Questo file non è un backup di Cent.')

    const azione = page.locator('.restore__action')
    await expect(azione).toHaveText('Scegli un altro file')
    await azione.tap()

    await expect(page.locator('.restore__lead')).toContainText('Ripristinando il backup del')
    expect(
      selettore.aperture(),
      '"Scegli un altro file" non ha riaperto il selettore: l\'unico altro file possibile e\' quello di prima',
    ).toBe(2)
  })
})

/**
 * **La geometria non si muove fra i sette contenuti** — DEBITO §14.
 *
 * Intestazione, corpo e piede sono tre fasce fisse: cambia solo cio' che sta
 * dentro quella di mezzo. E' l'unica cosa che impedisce alla pagina di saltare
 * nell'istante in cui il file arriva da iCloud — e in quell'istante il pollice
 * e' gia' fermo sopra la schermata, in attesa, perche' e' appena stato usato.
 *
 * **L'invariante e' l'identita' fra le viste, non un numero.** Nessuna
 * asserzione qui dentro scrive `595`: si misura il primo stato e si chiede che
 * gli altri sei siano **quello**. Cosi' resta vera il giorno in cui la schermata
 * cambia di proposito, e cade solo sul difetto vero — la stessa contromisura con
 * cui le Statistiche sorvegliano l'ordine delle due viste.
 *
 * Sette e non quattro: i quattro stati della lettura, piu' i tre rifiuti che
 * hanno un corpo diverso l'uno dall'altro. Il rifiuto `damaged` e' il piu' lungo
 * delle due lingue — tre paragrafi, uno dei quali contiene un percorso senza
 * spazi che non va a capo da solo.
 */
test.describe('ImportSheet: le tre fasce non si muovono fra i sette contenuti', () => {
  interface Fasce {
    readonly head: string
    readonly body: string
    readonly foot: string
    readonly overflowX: number
    readonly corpoScorre: boolean
    readonly piedeInFondo: number
    readonly bersagli: readonly { sel: string; w: number; h: number }[]
  }

  async function fasce(page: Page): Promise<Fasce> {
    return page.evaluate(() => {
      const r = (n: number): number => Math.round(n * 100) / 100
      const box = (sel: string): string => {
        const el = document.querySelector(sel)
        if (!(el instanceof HTMLElement)) throw new Error(`fascia assente: ${sel}`)
        const b = el.getBoundingClientRect()
        return `${r(b.top)}→${r(b.bottom)}`
      }
      const corpo = document.querySelector('.restore__body')
      const piede = document.querySelector('.restore__foot')
      if (!(corpo instanceof HTMLElement) || !(piede instanceof HTMLElement)) {
        throw new Error('la schermata di ripristino non e\' montata')
      }
      const bersagli = ['.restore__close', '.restore__action']
        .map((sel) => {
          const el = document.querySelector(sel)
          if (!(el instanceof HTMLElement)) return null
          const b = el.getBoundingClientRect()
          return { sel, w: r(b.width), h: r(b.height) }
        })
        .filter((b): b is { sel: string; w: number; h: number } => b !== null)
      return {
        head: box('.restore__head'),
        body: box('.restore__body'),
        foot: box('.restore__foot'),
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // **Che il corpo si lasci scorrere davvero**, non che il contenuto ci
        // stia: e' la differenza fra "sta sopra la piega" e "e' raggiungibile".
        // Con `overflow-y: hidden` un rifiuto piu' lungo del corpo diventerebbe
        // illeggibile senza che nessuna fascia si muova di un pixel.
        corpoScorre: ['auto', 'scroll', 'overlay'].includes(getComputedStyle(corpo).overflowY),
        piedeInFondo: r(window.innerHeight - piede.getBoundingClientRect().bottom),
        bersagli,
      }
    })
  }

  /** Apre la schermata su uno dei sette contenuti e aspetta che ci sia arrivata. */
  async function scena(
    page: Page,
    prepara: () => void,
    modo: Lettura,
    attesa: string | RegExp,
  ): Promise<Fasce> {
    prepara()
    await modoLettura(page, modo)
    await bottoneRipristina(page).tap()
    await expect(page.locator('.restore__lead')).toContainText(attesa)
    const misura = await fasce(page)
    await page.locator('.restore__close').tap()
    await expect(page.locator('.restore')).toHaveCount(0)
    return misura
  }

  test('sette contenuti, una sola geometria', async ({ page }) => {
    let prossimo: unknown = BUONO
    serviIlSelettore(page, () => prossimo)
    await apriImpostazioni(page)

    const sette: readonly (readonly [string, Fasce])[] = [
      [
        'sto leggendo',
        await scena(page, () => (prossimo = BUONO), 'mai', 'Sto leggendo il backup'),
      ],
      [
        'non si e\' potuto leggere',
        await scena(page, () => (prossimo = BUONO), 'errore', 'Non sono riuscito a leggere'),
      ],
      [
        'non e\' un backup',
        await scena(page, () => (prossimo = ALTRUI), 'ok', 'non è un backup di Cent'),
      ],
      [
        'versione piu\' nuova',
        await scena(page, () => (prossimo = TROPPO_NUOVO), 'ok', 'più nuova'),
      ],
      [
        'nessuna categoria',
        await scena(page, () => (prossimo = SENZA_CATEGORIE), 'ok', 'non ha nessuna categoria'),
      ],
      [
        'un record illeggibile',
        await scena(page, () => (prossimo = ROTTO), 'ok', 'expenses[0].amountCents'),
      ],
      [
        'anteprima',
        await scena(page, () => (prossimo = BUONO), 'ok', 'Ripristinando il backup del'),
      ],
    ]

    const [primoNome, primo] = sette[0] as readonly [string, Fasce]
    for (const [nome, m] of sette) {
      expect(
        `${m.head} | ${m.body} | ${m.foot}`,
        `"${nome}" ha una geometria diversa da "${primoNome}": le tre fasce si muovono fra uno ` +
          'stato e l\'altro, e il file arriva da iCloud mentre il pollice e\' gia\' li\'',
      ).toBe(`${primo.head} | ${primo.body} | ${primo.foot}`)
      expect(m.overflowX, `"${nome}": scroll orizzontale in pagina`).toBeLessThanOrEqual(0)
      expect(
        m.corpoScorre,
        `"${nome}": il corpo non si lascia scorrere — un testo piu' lungo del corpo diventa ` +
          'irraggiungibile senza che nessuna fascia si muova',
      ).toBe(true)
      expect(
        m.piedeInFondo,
        `"${nome}": il piede finisce a ${m.piedeInFondo}px dal fondo della finestra`,
      ).toBeGreaterThanOrEqual(0)
      for (const b of m.bersagli) {
        expect(Math.min(b.w, b.h), `"${nome}": ${b.sel} misura ${b.w}x${b.h}`).toBeGreaterThanOrEqual(44)
      }
    }

    // Il diario: cio' che e' stato misurato, anche quando passa. Ogni numero qui
    // sotto e' asserito dal ciclo appena sopra.
    console.log(
      `  ripristino | head ${primo.head} · corpo ${primo.body} · piede ${primo.foot} ` +
        `| ${sette.length} contenuti identici`,
    )
  })
})
