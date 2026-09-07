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
import { it as dizionario } from '../../src/ui/i18n/it'
import { en as inglese } from '../../src/ui/i18n/en'
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

/**
 * Lo stesso file **con una regola mensile arretrata**.
 *
 * **Oggi, nell'orologio fisso della suite, e' il 19 agosto 2026.** Il segnaposto
 * del file e' al **1 luglio** e la regola scatta il **primo** del mese: fra il
 * segnaposto e oggi c'e' **una** occorrenza — il 1 agosto — che nessuno ha
 * ancora creato. E' il caso su cui la frase di conferma promette *"le fisse
 * vengono ricreate da quel giorno in poi"*.
 *
 * La prima stesura metteva il segnaposto al **26 agosto**, cioe' **nel futuro**
 * rispetto all'orologio: la finestra usciva vuota (`from > to`) e il test
 * cadeva anche con la riparazione applicata. Una scena che non contiene il caso
 * non prova che la riparazione non funzioni: prova che la scena e' sbagliata.
 */
const CON_REGOLA = {
  ...BUONO,
  data: {
    ...BUONO.data,
    recurringRules: [
      {
        id: 'r1',
        createdAt: '2026-06-01T09:00:00.000Z',
        updatedAt: '2026-07-01T09:00:00.000Z',
        amountCents: 50_700,
        categoryId: 'c1',
        cadence: 'monthly',
        interval: 1,
        anchorDay: 1,
        startDate: '2026-06-01',
        lastMaterializedDate: '2026-07-01',
        active: true,
      },
    ],
  },
}

/**
 * Lo stesso file con una spesa illeggibile.
 *
 * Il campo rotto e' `amountCents` della **prima** spesa; cio' che la schermata
 * nomina non e' quella posizione ma **l'id di quel record**, che nel file c'e'
 * davvero — vedi `ImportRefusal.where`. L'id si prende da `BUONO`, non si
 * riscrive: cosi' cambiare la fixture non lascia indietro un'attesa.
 */
const ROTTO = {
  ...BUONO,
  data: {
    ...BUONO.data,
    expenses: [{ ...BUONO.data.expenses[0], amountCents: 12.5 }, BUONO.data.expenses[1]],
  },
}

/**
 * Lo stesso file con una spesa **senza id**: e' l'altro ramo di `damaged`.
 *
 * Quando a mancare e' proprio l'id non c'e' niente da cercare, e la schermata
 * ripiega sull'**indice dichiarandolo**. Questo ramo aveva un test di
 * classificazione in `import-view.test.ts` e **zero copertura a schermo**: la
 * frase e la nota che ci finiscono non le guardava nessuno, ed e' li' che il
 * rimedio si era ricostruito sbagliato — *"cerca quell'id"* sotto una frase che
 * ha appena detto che un id non c'e'.
 */
function senzaId(spesa: Record<string, unknown>): Record<string, unknown> {
  const copia = { ...spesa }
  delete copia['id']
  return copia
}

const SENZA_ID = {
  ...BUONO,
  data: {
    ...BUONO.data,
    expenses: BUONO.data.expenses.map((spesa, i) => (i === 0 ? senzaId(spesa) : spesa)),
  },
}

/**
 * La posizione che la schermata deve nominare, **contata sulla fixture**.
 *
 * Non e' scritta a mano, e la ragione e' costata due commit rossi: l'attesa del
 * ramo `id` era un letterale (`expenses[0].amountCents`) ed e' rimasta indietro
 * quando `where` ha smesso di essere un indice. Qui l'indice si deriva dal
 * record a cui l'id manca, quindi rompere la fixture in un altro punto sposta
 * l'attesa da sola.
 */
const POSIZIONE_ROTTA = `expenses[${SENZA_ID.data.expenses.findIndex((s) => !('id' in s))}].id`

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

/**
 * Il bottone "Ripristina da un backup", che esiste solo perche' esiste il
 * selettore. L'etichetta **si deriva dal dizionario** e prende la lingua in
 * argomento: il blocco inglese qui sotto tocca lo stesso bottone, e due
 * letterali per una stringa sola divergerebbero al primo ritocco di copy.
 */
function bottoneRipristina(page: Page, etichetta: string = dizionario['import.open']) {
  return page.locator('.prefs__action', { hasText: etichetta })
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
 * **`damaged` ha due rami, e quindi due rimedi.**
 *
 * Con l'id si **cerca**: la stringa nel file c'e'. Senza l'id si **conta**: cio'
 * che la schermata nomina e' una posizione, e cercarla non porta da nessuna
 * parte. Fino a qui la nota era **una sola**, scritta per il primo ramo, e nel
 * secondo mandava a cercare esattamente la cosa che manca — due righe sotto la
 * frase che dichiara che quella non e' una parola da cercare.
 *
 * E' la ragione per cui DEBITO §13 accetta il rifiuto totale (un record rotto
 * su cento butta il file intero): **che il messaggio dica quale record e cosa si
 * puo' fare da dove si e'**. In questo ramo quella ragione era nulla.
 *
 * ## L'asserzione non e' il testo della nota: e' che le note siano due
 *
 * Confrontare la nota del ramo `posizione` con una stringa scritta qui sarebbe
 * verde anche il giorno in cui torna a essere quella del ramo `id`, se qualcuno
 * aggiorna tutte e due. Cio' che deve restare vero e' che **i due rami non
 * dicano la stessa cosa**, piu' il verbo del rimedio eseguibile: si conta.
 */
test('con l\'id si cerca, senza l\'id si conta: due rami, due rimedi', async ({ page }) => {
  let prossimo: unknown = ROTTO
  serviIlSelettore(page, () => prossimo)
  await apriImpostazioni(page)

  await bottoneRipristina(page).tap()
  await expect(page.locator('.restore__lead')).toContainText(BUONO.data.expenses[0]!.id)
  const conId = await page.locator('.restore__note').innerText()
  await page.locator('.restore__close').tap()
  await expect(page.locator('.restore')).toHaveCount(0)

  prossimo = SENZA_ID
  await bottoneRipristina(page).tap()
  await expect(
    page.locator('.restore__lead'),
    'la schermata non nomina la posizione del record a cui manca l\'id',
  ).toContainText(POSIZIONE_ROTTA)
  const conPosizione = await page.locator('.restore__note').innerText()

  expect(
    conPosizione,
    'i due rami di `damaged` mostrano la stessa nota: nel ramo senza id quella nota manda a ' +
      'cercare un id che nel file non c\'e\', cioe\' il vicolo cieco che DEBITO §13 non accetta',
  ).not.toBe(conId)
  expect(
    conPosizione,
    'il rimedio del ramo "posizione" non nomina il contare: e\' l\'unico gesto che una ' +
      'posizione permette, ed e\' l\'unica cosa che rende quel rifiuto non cieco',
  ).toContain('contare')
  expect(
    conPosizione,
    'il rimedio del ramo "posizione" manda a cercare, e li\' non c\'e\' niente da cercare',
  ).not.toContain('cercare')
})

/**
 * **Le due note nuove, in inglese, sul pavimento** — 375x667 e' il viewport
 * minimo supportato, e non e' il telefono di nessuno di noi.
 *
 * Il resto di questo file gira in italiano (`locale: 'it-IT'` sta in
 * `playwright.config.ts`), e **l'inglese e' la lingua che leggeranno quasi
 * tutti**: il default e' inglese quando il telefono non e' italiano. Fino a qui
 * la schermata di ripristino non era misurata in inglese da nessuna parte —
 * `grep restore tests/e2e` la trova solo qui dentro.
 *
 * Si guarda il ramo `posizione` perche' e' il corpo **piu' lungo** dei due
 * rami e dei quattro rifiuti: la frase dichiara l'indice, la nota spiega come
 * si conta. Se qualcosa trabocca, trabocca qui prima che altrove.
 *
 * L'invariante e' quello della schermata intera e non "sta sopra la piega":
 * niente scroll orizzontale, e cio' che avanza **si raggiunge**.
 */
test.describe('il rifiuto piu\' lungo, in inglese', () => {
  test.use({ locale: 'en-GB' })

  test('la nota che dice di contare non fa traboccare niente', async ({ page }) => {
    serviIlSelettore(page, () => SENZA_ID)
    await apriImpostazioni(page)

    await bottoneRipristina(page, inglese['import.open']).tap()
    await expect(page.locator('.restore__lead')).toContainText(POSIZIONE_ROTTA)
    // La nota **e' quella del ramo `posizione`**, e si prende dal dizionario:
    // asserire la stringa a mano qui vorrebbe dire riscriverla a ogni ritocco.
    await expect(
      page.locator('.restore__note'),
      'in inglese il ramo senza id mostra un\'altra nota',
    ).toHaveText(inglese['import.damagedAt.note'])

    const m = await fasce(page)
    expect(m.overflowX, 'scroll orizzontale in pagina con la nota inglese').toBeLessThanOrEqual(0)
    expect(
      m.corsa,
      `avanzano ${m.eccedenza}px di contenuto e il corpo si lascia scorrere di ${m.corsa}`,
    ).toBeGreaterThanOrEqual(m.eccedenza)
    expect(m.piedeInFondo, 'il piede esce dalla finestra').toBeGreaterThanOrEqual(0)
    for (const b of m.bersagli) {
      expect(Math.min(b.w, b.h), `${b.sel} misura ${b.w}x${b.h}`).toBeGreaterThanOrEqual(44)
    }
    // Il diario: due numeri, e tutti e due li asserisce la riga qui sopra.
    console.log(`  ripristino en | eccedenza ${m.eccedenza} su corsa ${m.corsa}`)
  })
})

/**
 * **La geometria non si muove fra gli otto contenuti** — DEBITO §14.
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
 * Otto e non quattro: i quattro stati della lettura, piu' i **quattro corpi di
 * rifiuto** diversi l'uno dall'altro — `damaged` ne vale due, perche' i suoi due
 * rami cambiano sia la frase sia la nota. Il piu' lungo delle due lingue e'
 * proprio il ramo `posizione`: la frase dichiara che quello e' un indice, la
 * nota spiega come si conta, e l'indice e' un percorso senza spazi che non va a
 * capo da solo.
 */
/**
 * **La conferma promette che le fisse vengono ricreate: questo test guarda che
 * ci siano davvero, subito.**
 *
 * Trovato dal gate della fase 7 e non da un test, perche' **il percorso dal
 * bottone al disco non ne aveva nessuno**: `ripristino.spec.ts` copriva sette
 * contenuti e due azioni, e mai la conferma.
 *
 * `applyImport` non chiamava `materializeRecurring`, mentre le altre tre porte
 * che scrivono una regola lo fanno tutte. L'argomento era gia' scritto sopra
 * `saveRule` — *chi ha appena confermato "questa regola creera' 8 spese"
 * chiuderebbe il foglio e non ne vedrebbe nessuna fino alla prossima apertura* —
 * e **non nominava quel foglio**: valeva identico qui.
 *
 * E qui vale di piu': si atterra sulla Home **apposta**, per far vedere che i
 * dati ci sono, e la frase di conferma lo promette per iscritto. Senza la
 * chiamata, l'affitto comparirebbe solo dopo una sospensione o un riavvio —
 * cioe' **dopo** che la persona ha gia' deciso se il ripristino e' andato bene.
 */
test('dopo il ripristino le fisse ci sono, senza aspettare una riapertura', async ({ page }) => {
  serviIlSelettore(page, () => CON_REGOLA)
  await apriImpostazioni(page)
  await bottoneRipristina(page).tap()
  await expect(page.locator('.restore__action')).toHaveText('Ripristina')

  await page.locator('.restore__action').tap()
  // Si atterra sulla Home: e' la decisione di ADR 026 §6e, ed e' anche la
  // ragione per cui questo difetto era visibile proprio li'.
  await expect(page.locator('.home')).toBeVisible()

  // La regola scatta il primo del mese e il segnaposto del file e' al 26 agosto:
  // fra il backup e oggi c'e' almeno un'occorrenza che nessuno aveva creato.
  await page.locator('.nav__tab').nth(1).tap()
  await expect(page.locator('.list')).toBeVisible()
  await expect(
    page.locator('.row').filter({ hasText: '507,00' }).first(),
    'nessuna spesa fissa a schermo dopo il ripristino: la conferma aveva promesso ' +
      'che venivano ricreate, e lo Storico la smentisce',
  ).toBeVisible({ timeout: 5000 })
})

/**
 * **La misura delle tre fasce, e sta fuori dai due blocchi che la usano.**
 *
 * La geometria italiana la confronta fra otto contenuti; il blocco inglese
 * guarda un contenuto solo e chiede meno. Sono due domande diverse sulla stessa
 * cosa misurata, e misurarla in due posti vorrebbe dire due definizioni di
 * "quanto avanza" che divergono al primo cambio.
 */
interface Fasce {
  readonly head: string
  readonly body: string
  readonly foot: string
  readonly overflowX: number
  readonly corpoScorre: boolean
  readonly eccedenza: number
  readonly corsa: number
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
      // Quanto contenuto avanza, e **quanto il dito riesce a portarne su**.
      // I due numeri insieme sono l'invariante vero: non "sta sopra la piega",
      // ma **raggiungibile**.
      eccedenza: r(corpo.scrollHeight - corpo.clientHeight),
      corsa: ((): number => {
        if (!['auto', 'scroll', 'overlay'].includes(getComputedStyle(corpo).overflowY)) return 0
        const prima = corpo.scrollTop
        corpo.scrollTop = 1e6
        const arrivo = corpo.scrollTop
        corpo.scrollTop = prima
        return r(arrivo)
      })(),
      piedeInFondo: r(window.innerHeight - piede.getBoundingClientRect().bottom),
      bersagli,
    }
  })
}

test.describe('ImportSheet: le tre fasce non si muovono fra gli otto contenuti', () => {
  /** Apre la schermata su uno degli otto contenuti e aspetta che ci sia arrivata. */
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

  test('otto contenuti, una sola geometria', async ({ page }) => {
    let prossimo: unknown = BUONO
    serviIlSelettore(page, () => prossimo)
    await apriImpostazioni(page)

    const otto: readonly (readonly [string, Fasce])[] = [
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
        // **L'attesa e' l'id, e prima era il path.** Qui c'era
        // `'expenses[0].amountCents'`, ed e' rimasta quando `where` ha smesso
        // di essere un indice: la e2e e' stata rossa per due commit senza che
        // nessuno la lanciasse. La riparazione che tolse il path da
        // `import-view.test.ts` non ando' a cercare dove altro valeva il
        // proprio argomento — e valeva qui.
        //
        // Adesso l'id si **deriva dalla fixture** invece di essere riscritto,
        // quindi non puo' restare indietro, e l'attesa cade il giorno in cui
        // qualcuno rimette un indice a schermo.
        await scena(page, () => (prossimo = ROTTO), 'ok', BUONO.data.expenses[0]!.id),
      ],
      [
        // L'altro ramo di `damaged`: qui l'id manca, e cio' che si nomina e' la
        // posizione. E' il corpo piu' lungo delle due lingue, quindi e' anche il
        // caso in cui il corpo deve scorrere davvero.
        'un record senza id',
        await scena(page, () => (prossimo = SENZA_ID), 'ok', POSIZIONE_ROTTA),
      ],
      [
        'anteprima',
        await scena(page, () => (prossimo = BUONO), 'ok', 'Ripristinando il backup del'),
      ],
    ]

    const [primoNome, primo] = otto[0] as readonly [string, Fasce]
    for (const [nome, m] of otto) {
      expect(
        `${m.head} | ${m.body} | ${m.foot}`,
        `"${nome}" ha una geometria diversa da "${primoNome}": le tre fasce si muovono fra uno ` +
          'stato e l\'altro, e il file arriva da iCloud mentre il pollice e\' gia\' li\'',
      ).toBe(`${primo.head} | ${primo.body} | ${primo.foot}`)
      expect(m.overflowX, `"${nome}": scroll orizzontale in pagina`).toBeLessThanOrEqual(0)
      // **Due controlli, e sono due perche' misurano cose diverse — con la
      // parte vuota dichiarata, che e' quella che di solito non si scrive.**
      //
      // Il secondo misura l'**effetto**: cio' che avanza si puo' portare a
      // schermo. E' vero a vuoto dove non avanza niente, e **misurato** vale
      // `eccedenza max 0` su iphone-se e iphone-14 e `32` in orizzontale — cioe'
      // ha i denti su un progetto su tre, ed e' onesto dirlo invece di lasciar
      // credere che copra tutti e tre.
      //
      // Il primo misura la **causa** — il corpo dichiara di scorrere prima che
      // serva — e vale su tutti e tre. E' quello su cui e' caduta la mutazione
      // `overflow-y: hidden`: con l'effetto da solo, a 375x667 e a 390x844 quel
      // difetto sarebbe passato, perche' li' oggi non c'e' niente da scorrere.
      // Serve il giorno in cui un rifiuto si allunga — un'altra lingua, un
      // carattere di sistema piu' grande, un percorso di record piu' lungo — e
      // nessuno rimisurera' questa schermata per accorgersene.
      expect(
        m.corpoScorre,
        `"${nome}": il corpo non si lascia scorrere — un testo piu' lungo del corpo diventa ` +
          'irraggiungibile senza che nessuna fascia si muova',
      ).toBe(true)
      expect(
        m.corsa,
        `"${nome}": avanzano ${m.eccedenza}px di contenuto e il corpo si lascia scorrere di ` +
          `${m.corsa}: quello che resta sotto non lo raggiunge nessuno`,
      ).toBeGreaterThanOrEqual(m.eccedenza)
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
        `| ${otto.length} contenuti identici ` +
        `| eccedenza max ${Math.max(...otto.map(([, m]) => m.eccedenza))} ` +
        `su corsa ${Math.max(...otto.map(([, m]) => m.corsa))}`,
    )
  })
})
