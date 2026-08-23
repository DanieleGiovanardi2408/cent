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

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    })
    await use(page)
  },
})

export { expect } from '@playwright/test'
