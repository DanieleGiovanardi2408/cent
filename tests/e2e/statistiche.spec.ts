/**
 * Le Statistiche, nei due stati che vengono per primi: **vuoto** e **spese senza
 * budget**.
 *
 * ## Perche' questi due e non i dati pieni
 *
 * Perche' partendo dal pieno il vuoto diventa un rettangolo grigio con una
 * scritta in mezzo, e il caso senza budget diventa un grafico degenere invece
 * che una forma sua. Sono anche i due piu' probabili: il vuoto e' la prima cosa
 * che vede chi installa l'app, e "spese si', budget no" e' chi comincia a segnare
 * e il budget lo imposta dopo — o mai, perche' vuole solo vedere dove vanno i
 * soldi.
 *
 * ## Come si testa un grafico qui
 *
 * **Si asserisce la geometria contro i dati, non la presenza degli elementi.**
 * Un test che conta i `<span>` e' verde anche con tutte le barre lunghe uguali.
 * Ogni test qui ha almeno un'asserzione che **cadrebbe** se la schermata
 * disegnasse il caso sbagliato: il rapporto fra le larghezze misurate deve
 * essere il rapporto fra gli importi, e dove non c'e' un budget non deve esserci
 * nessuna traccia.
 *
 * L'aritmetica delle frazioni e' gia' provata in `stats-view.test.ts`, senza
 * browser. Qui si prova cio' che solo un browser sa dire: che quelle frazioni
 * diventino **pixel veri**, che le tre schede ci stiano, e che il numero della
 * riga corrente sia **lo stesso carattere** di quello della Home.
 */
import type { Page } from '@playwright/test'
import { fissaOrologio } from './clock'
import { chiudiGuida, expect, test } from './installed'
// Derivata, non ricopiata: un'asserzione che riscrive la copy a mano cade
// quando qualcuno corregge un refuso, e chi la vede cadere crede di aver rotto
// qualcosa. E' la stessa ragione per cui `guide.spec.ts` importa `STEPS`.
import { it as dizionario } from '../../src/ui/i18n/it'

test.beforeEach(async ({ page }) => {
  await fissaOrologio(page)
})

/**
 * Scrive spese direttamente in IndexedDB, una per categoria indicata.
 * `[['Fuori', 4000], ['Spesa', 2000]]` -> due spese di oggi.
 */
async function semina(page: Page, righe: readonly (readonly [string, number])[]): Promise<void> {
  await page.evaluate(async (input: readonly (readonly [string, number])[]) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cent')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const categories: { id: string; name: string }[] = await new Promise((resolve, reject) => {
      const request = db.transaction('categories').objectStore('categories').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const oggi = new Date()
    const iso = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('expenses', 'readwrite')
      const store = tx.objectStore('expenses')
      input.forEach(([nome, cents], i) => {
        const at = 1_700_000_000_000 + i
        store.put({
          id: `stat-${i}`,
          createdAt: at,
          updatedAt: at,
          amountCents: cents,
          categoryId: categories.find((c) => c.name === nome)?.id ?? 'x',
          date: iso,
          source: 'manual',
        })
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, righe)
  await page.reload()
  await page.getByRole('button', { name: /Statistiche|Stats/ }).click()
}

async function apriStatistiche(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Statistiche|Stats/ }).click()
}

/** La larghezza dipinta di una barra, in pixel. */
async function larghezzaBarra(page: Page, riga: number): Promise<number> {
  const box = await page.locator('.stats__section').first().locator('.stat__bar').nth(riga).boundingBox()
  if (box === null) throw new Error(`nessuna barra alla riga ${riga}`)
  return box.width
}

test('a schermo vuoto le Statistiche dicono cosa comparira, non "nessun dato"', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await apriStatistiche(page)

  // Il copy vero: chi apre l'app il primo giorno non sa ancora cosa aspettarsi,
  // e "nessun dato" non glielo insegna.
  await expect(page.locator('.blank__title')).toBeVisible()
  await expect(page.locator('.blank__text')).toHaveText(dizionario['stats.blank.text'])
  await expect(page.locator('.blank__title')).toHaveText(dizionario['stats.blank.title'])

  // E soprattutto: **nessuna barra**, nemmeno lunga zero. Otto righe da zero
  // sarebbero un grafico degenere spacciato per schermata vuota.
  await expect(page.locator('.stat__bar')).toHaveCount(0)
  await expect(page.locator('.tile')).toHaveCount(0)
})

test('con spese e senza budget: le righe ci sono, le tracce no', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    ['Fuori', 4000],
    ['Spesa', 2000],
    ['Casa', 1000],
  ])

  // A esiste ed e' un grafico: tre categorie sono la soglia.
  await expect(page.locator('.stats__section').first().locator('.stat')).toHaveCount(3)
  await expect(page.locator('.stat__bar').first()).toBeVisible()

  // **Nessuna traccia in nessuna riga.** Una traccia senza budget sarebbe un
  // tetto da zero euro, cioe' un numero inventato. Se la traccia si disegnasse
  // sempre che c'e' un periodo, questa asserzione cade.
  await expect(page.locator('.stat__track')).toHaveCount(0)
  await expect(page.locator('.stat__accrued')).toHaveCount(0)
  await expect(page.locator('.stat__unlived')).toHaveCount(0)

  // E la cifra in testa risponde comunque: C non ha bisogno del budget.
  await expect(page.locator('.tile__value').first()).toHaveText(/70,00|70\.00/)
})

test('il rapporto fra le barre e il rapporto fra gli importi, in pixel veri', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    ['Fuori', 4000],
    ['Spesa', 2000],
    ['Casa', 1000],
  ])

  const prima = await larghezzaBarra(page, 0)
  const seconda = await larghezzaBarra(page, 1)
  const terza = await larghezzaBarra(page, 2)

  // 20,00 su 40,00 e' **meta'**, e 10,00 e' un quarto. Con le barre tutte uguali
  // — il difetto classico di un grafico testato male — questi tre confronti
  // cadono tutti e tre.
  expect(seconda / prima).toBeGreaterThan(0.47)
  expect(seconda / prima).toBeLessThan(0.53)
  expect(terza / prima).toBeGreaterThan(0.22)
  expect(terza / prima).toBeLessThan(0.28)
  // E l'ordine e' decrescente: la domanda e' "dove sono finiti i soldi", e la
  // risposta si legge dall'alto.
  expect(prima).toBeGreaterThan(seconda)
  expect(seconda).toBeGreaterThan(terza)
})

test('sotto tre categorie restano le righe e spariscono le barre', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    ['Fuori', 4000],
    ['Spesa', 2000],
  ])

  const sezione = page.locator('.stats__section').first()
  await expect(sezione.locator('.stat')).toHaveCount(2)
  // Due barre non sono un confronto: sono due numeri disegnati lunghi.
  await expect(sezione.locator('.stat__bar')).toHaveCount(0)
  // Ma i due numeri si leggono lo stesso, ed e' il punto: la riga sopravvive
  // alla barra perche' il grafico **e'** la tabella.
  await expect(sezione.locator('.stat__value').first()).toHaveText(/40,00|40\.00/)
})

/**
 * **Il test di identita' con la Home.** La riga del periodo corrente e la cifra
 * della Home sono la stessa quantita' calcolata una volta sola: se divergessero
 * nessuno se ne accorgerebbe, perche' entrambe sarebbero "corrette".
 *
 * Si confrontano **al carattere**, non due numeri arrotondati a mano.
 */
test('lo speso della riga corrente e lo stesso carattere di quello della Home', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    ['Fuori', 4000],
    ['Spesa', 2000],
    ['Casa', 1000],
  ])

  const sezioni = page.locator('.stats__section')
  const righePeriodo = sezioni.nth(1).locator('.stat')
  const ultima = righePeriodo.last()
  const daStatistiche = (await ultima.locator('.stat__value').innerText()).trim()

  await page.getByRole('button', { name: /^Home$/ }).click()
  // Tutta la sezione, non un elemento preciso: la Home mette lo speso nel numero
  // grande quando non c'e' budget e dentro la nota quando c'e' (`heroCopy`), e
  // il test non deve dipendere da quale dei due rami sta girando — dipende dal
  // fatto che il numero sia **quello**.
  const daHome = (await page.locator('.hero').innerText()).trim()

  expect(daStatistiche).not.toBe('')
  expect(daHome).toContain(daStatistiche)
})

test('tre schede in barra non fanno traboccare l intestazione', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await apriStatistiche(page)

  // La misura, non la stima: il commento della nav diceva "due schermate non
  // hanno bisogno di piu' di due parole", e dalla fase 6 sono tre. La larghezza
  // si controlla dove il conto si stringe — il breakpoint a 359px nasconde gia'
  // l'etichetta di Impostazioni.
  for (const larghezza of [320, 375, 390]) {
    await page.setViewportSize({ width: larghezza, height: 667 })
    const overflow = await page.evaluate(() => {
      const header = document.querySelector('header')
      if (header === null) return null
      return {
        header: header.scrollWidth - header.clientWidth,
        body: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(overflow, `a ${larghezza}px`).not.toBeNull()
    expect(overflow?.header, `intestazione a ${larghezza}px`).toBeLessThanOrEqual(0)
    expect(overflow?.body, `pagina a ${larghezza}px`).toBeLessThanOrEqual(0)
  }
})
