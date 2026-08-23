/**
 * La terza premessa d'ambiente: **il font e' dichiarato**, non ereditato.
 *
 * Le altre due stanno gia' scritte, e per lo stesso motivo:
 * - `TZ: 'Europe/Amsterdam'` in `vitest.config.ts` — senza, i test sul DST
 *   campionano transizioni che nel fuso della CI (UTC) non avvengono;
 * - `locale: 'it-IT'` in `playwright.config.ts` — senza, Chromium parte in
 *   `en-US` e ogni asserzione italiana cade per una premessa mai detta.
 *
 * Questa e' la terza, e finche' non c'era **ogni asserzione geometrica misurava
 * contro qualunque font fosse installato sulla macchina**. Lo stack dell'app e'
 * `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, ...`
 * (tokens.css): su macOS risolve in SF Pro Text, sul runner Ubuntu in
 * DejaVu Sans o in qualunque cosa fontconfig scelga quel mese. Sono due font con
 * larghezze di glifo diverse, quindi lo **stesso testo va a capo a un numero
 * diverso di righe**: 97 verdi in locale e quattro rossi in CI, con la stessa
 * riga di CSS. E' esattamente il caso 1 di CLAUDE.md — una verifica che passa
 * perche' la macchina non e' il bersaglio.
 *
 * ## Il meccanismo
 *
 * Un font vero, versionato dentro il repo (`tests/fonts/`), iniettato in ogni
 * pagina **prima di qualunque script**, con l'API `FontFace` e i byte gia' in
 * memoria: nessuna rete, nessun fontconfig, nessuna cartella di sistema. Gli
 * stessi 48 KB su macOS e su Linux, quindi le stesse larghezze di glifo e lo
 * stesso punto in cui il testo va a capo.
 *
 * Inter, variabile (100-900), sottoinsieme latino: copre le accentate delle due
 * lingue, l'euro, il punto mediano di `startNote` e l'apostrofo tipografico
 * dell'inglese. E' OFL, quindi si puo' versionare (`LICENSE-Inter.txt` accanto
 * al file). Ha metriche vicine a quelle di SF Pro Text: la riserva misurata qui
 * resta un numero plausibile anche sul telefono vero, invece di essere tarata su
 * un font largo il doppio.
 *
 * ## Cosa **non** fa
 *
 * Non tocca l'app spedita: `dist` non contiene questo file, e lo stack di font
 * in `tokens.css` resta quello di sistema — zero webfont, zero richieste, zero
 * FOUT sul telefono. Il font e' una premessa dei test, non del prodotto: quello
 * che i test comprano non e' "l'app usa Inter", e' "due macchine misurano la
 * stessa cosa".
 *
 * Restano fuori le emoji delle categorie, che vengono ancora dal sistema (Apple
 * Color Emoji contro Noto Color Emoji): un font colore pesa megabyte e nessuna
 * asserzione geometrica dipende dalla loro larghezza. Se un giorno ne dipendera'
 * una, si vedra' qui.
 *
 * ## Perche' non basta iniettare e sperare
 *
 * Un font che arriva **dopo** il primo disegno sposta il testo (FOUT), cioe'
 * produrrebbe da solo il difetto che questi test cercano. Qui i byte sono gia'
 * nel documento a `document_start` — decodifica locale, niente rete — e la
 * `load()` parte prima che il modulo dell'app esista. `fontPronto()` lo
 * verifica invece di darlo per scontato: `home.spec.ts` lo asserisce al primo
 * frame utile, quindi se un giorno il font arrivasse tardi si leggerebbe come
 * "la premessa non ha fatto in tempo" e non come una riserva che ha ceduto.
 */
import { readFileSync } from 'node:fs'
import { test as base } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Il nome che i test usano: dice cos'e' e da dove viene. */
export const TEST_FONT = 'Cent Test Sans'

/**
 * I byte del font, letti una volta sola per esecuzione e passati alla pagina in
 * base64 (l'unico modo di far entrare un binario in `addInitScript`).
 * `inter-latin-wght-normal.woff2` viene da @fontsource-variable/inter 5.3.0,
 * sha256 3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62.
 */
const BYTES = readFileSync(
  new URL('../fonts/inter-latin-wght-normal.woff2', import.meta.url),
).toString('base64')

/** Il font e' arrivato **e** e' quello dichiarato: la premessa e' viva. */
export async function fontPronto(page: Page): Promise<boolean> {
  return page.evaluate(
    (family: string) => document.fonts.check(`16px "${family}"`),
    TEST_FONT,
  )
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(
      ({ family, b64 }: { family: string; b64: string }) => {
        const raw = atob(b64)
        const bytes = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i)

        const face = new FontFace(family, bytes.buffer, { weight: '100 900' })
        document.fonts.add(face)
        // Parte subito: qui siamo prima di ogni script della pagina, quindi la
        // decodifica corre in parallelo al download del modulo dell'app e ha
        // finito da un pezzo quando il primo testo viene disegnato.
        void face.load()

        // `!important` perche' questo <style> precede il foglio dell'app: senza,
        // `:root { --font-sans }` di tokens.css vincerebbe per ordine.
        const install = (): void => {
          const style = document.createElement('style')
          style.textContent =
            `:root { --font-sans: "${family}", sans-serif !important;` +
            // Anche le cifre: il pannello del backup e gli importi usano
            // `--font-numeric`, e "SF Mono" su Linux non esiste. Le cifre
            // restano tabulari (Inter ha `tnum`), che e' cio' che quel token
            // compra davvero.
            ` --font-numeric: "${family}", monospace !important; }`
          document.documentElement.appendChild(style)
        }
        if (document.documentElement !== null) install()
        else document.addEventListener('readystatechange', install, { once: true })
      },
      { family: TEST_FONT, b64: BYTES },
    )
    await use(page)
  },
})

export { expect } from '@playwright/test'
