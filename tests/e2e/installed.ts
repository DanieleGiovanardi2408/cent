/**
 * I test che provano **l'app** dichiarano di girare nell'app installata.
 *
 * ## Perche' serve
 *
 * Fuori da standalone, sull'origine di produzione, Cent e' una pagina di
 * installazione e non ha ne' FAB ne' tastierino (ADR 011). `vite preview` serve
 * la build di produzione — la stessa che va su GitHub Pages, bit per bit —
 * quindi senza questa dichiarazione ogni test che tocca il FAB fallirebbe, e
 * fallirebbe per il motivo giusto.
 *
 * ## Perche' e' qui e non nel codice dell'app
 *
 * La soluzione facile sarebbe un'eccezione in produzione — "se sei su
 * localhost, lascia scrivere" — e sarebbe la soluzione sbagliata: il gate
 * smetterebbe di essere vero proprio nel posto dove viene provato, e i test
 * direbbero qualcosa su un'app che nessuno usa. Sono **i test a dichiarare il
 * proprio contesto**, con la cucitura nello strato di composizione (la stessa
 * dottrina di "Cuciture per i test" in CLAUDE.md).
 *
 * `addInitScript` gira **prima** di qualunque script della pagina: il gate legge
 * `navigator.standalone` all'avvio di `main.tsx`, quindi impostarlo dopo il
 * caricamento non servirebbe a niente.
 *
 * Si dichiara `navigator.standalone` — la sonda di Safari iOS, cioe' la
 * piattaforma vera — e non `display-mode`, che in Chromium richiederebbe di
 * inscenare un'installazione. Cosi' il test esercita anche il fatto che le due
 * sonde sono in OR: se qualcuno lasciasse solo `matchMedia`, tutti questi test
 * cadrebbero insieme.
 *
 * Chi vuole provare **lo stato bloccato** importa da `./font` e non da qui:
 * `install.spec.ts` fa esattamente cosi'.
 *
 * La base non e' `@playwright/test` ma `./font`: la premessa sul font vale per
 * **tutta** la suite, compresa la pagina di installazione, perche' vale per ogni
 * asserzione geometrica e non solo per quelle dell'app installata.
 */
import { test as base } from './font'
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    })
    await use(page)
  },
})

export { expect } from '@playwright/test'

/**
 * Chiude la guida al primo avvio, e **aspetta che la chiusura sia sul disco**.
 *
 * ## Perche' ogni test che prova l'app la chiama
 *
 * Dalla fase 3 il primo avvio ha una guida, ed e' un modale: finche' e' li'
 * davanti, nessun tap arriva al FAB. Non e' un effetto collaterale da aggirare,
 * e' il prodotto — quindi i test lo **attraversano** come lo attraversa un
 * utente, con un tap su "Salta", invece di far finta che non ci sia scrivendo
 * `onboardingCompletedAt` a mano dentro IndexedDB.
 *
 * La differenza non e' di stile: un test che scrive lo stato di nascosto non
 * esercita mai il bottone che quello stato lo scrive, e il giorno che "Salta"
 * smette di scriverlo la suite resta verde.
 *
 * ## Perche' aspetta il disco e non solo la sparizione
 *
 * Perche' meta' dei test qui dentro ricarica la pagina subito dopo aver
 * preparato lo stato. La scrittura e' ottimistica — il mirror si muove nel frame
 * del tap, IndexedDB arriva dopo — quindi un `reload()` immediato puo' precedere
 * la scrittura e far ricomparire la guida a meta' scena. Si aspetta **la
 * condizione**, come dappertutto in questa suite, non un numero di millisecondi.
 */
export async function chiudiGuida(page: Page): Promise<void> {
  const skip = page.locator('.guide__skip')
  await expect(skip, 'la guida del primo avvio non e\' comparsa').toBeVisible()
  await skip.tap()
  await expect(page.locator('.guide')).toHaveCount(0)
  await expect
    .poll(() => guidaChiusaSuDisco(page), {
      message:
        '"Salta" non ha scritto onboardingCompletedAt: la guida tornerebbe alla ' +
        'prossima apertura, cioe\' fra un `reload()`',
    })
    .toBe(true)
}

/** Se `Settings.onboardingCompletedAt` e' scritto **sul disco**, non nel mirror. */
export async function guidaChiusaSuDisco(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cent')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const record: { onboardingCompletedAt?: string } | undefined = await new Promise(
      (resolve, reject) => {
        const request = db.transaction('settings').objectStore('settings').get('settings')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      },
    )
    db.close()
    return record?.onboardingCompletedAt !== undefined
  })
}
