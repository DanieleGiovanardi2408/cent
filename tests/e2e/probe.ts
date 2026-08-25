/**
 * La sonda dei bersagli interattivi.
 *
 * Sta in un modulo suo perche' la usano due test che chiedono cose opposte allo
 * stesso strumento:
 *
 * - `overlays.spec.ts` chiede che **ogni** bersaglio risponda al proprio centro
 *   (regola "Sovrapposizioni" di CLAUDE.md);
 * - `install.spec.ts` chiede che fuori da standalone i bersagli che scrivono
 *   siano **zero** (ADR 011).
 *
 * Una seconda copia della sonda avrebbe reso la seconda domanda piu' debole
 * della prima senza che si vedesse: e' proprio quando si conta zero che conta
 * come si conta.
 */
import type { Page } from '@playwright/test'

export interface Target {
  readonly label: string
  readonly rect: string
  /**
   * `ritagliato` = il centro del bersaglio cade **fuori** dal contenitore che
   * scorre, cioe' li' non c'e' niente da toccare perche' e' la lista a
   * finire, non un overlay a coprire. Non e' un fallimento — ma e' contato e
   * stampato, perche' un bersaglio saltato in silenzio e' una differenza fra
   * due macchine che nessuno vede (in CI 14 bersagli, in locale 10).
   */
  readonly status: 'ok' | 'coperto' | 'piccolo' | 'inerte' | 'ritagliato'
  readonly hit: string
}

/**
 * Misura tutti i bersagli interattivi visibili e dice, per ciascuno, chi
 * risponde al centro.
 *
 * ## Misura il rettangolo **dipinto**, trasformazioni comprese
 *
 * `getBoundingClientRect` include i `transform`, quindi un bersaglio che si
 * rimpicciolisce sotto il dito viene misurato rimpicciolito se la sonda passa in
 * quell'istante: un 88x44 diventa 85x43 e la sonda lo chiama "piccolo".
 *
 * Non c'e' niente da tollerare nella misura, e non basta aspettare: Chromium
 * tiene lo stato `:active` per qualche centinaio di millisecondi dopo un `tap()`
 * e lo stile calcolato puo' restare indietro anche **dopo** che `:active` non
 * corrisponde piu' — misurato qui, con `document.querySelector(':active')` gia'
 * a `null` e `getComputedStyle` ancora a `scale(0.97)`. Un'attesa su quella
 * condizione sarebbe una verifica che promette una cosa e ne fa un'altra.
 *
 * La regola sta quindi dove sta sempre in questo progetto — **nel CSS**: il
 * riscontro al tocco su un bersaglio si da' con `opacity` o con il colore, non
 * con una `scale` che ne cambia le misure dichiarate. Vedi `Guide.css`,
 * `.guide__next:active`, dove questa sonda l'ha trovata.
 */
export async function probe(page: Page): Promise<readonly Target[]> {
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
     * Quanto del bersaglio si vede davvero: il suo rettangolo intersecato col
     * viewport e con ogni antenato che ritaglia.
     *
     * ## Perche' l'intersezione e non il centro secco
     *
     * Una riga a meta' fuori dal contenitore che scorre e' **ritagliata da quel
     * contenitore**, non coperta da un overlay: al suo posto si vede il bordo
     * della lista, e per toccarla si scorre. La sonda prendeva il centro del
     * rettangolo intero, che in quel caso cade **oltre** il bordo del
     * contenitore, e finiva a interrogare un punto dove si vede cio' che e'
     * dipinto sotto la lista — accusando di sovrapposizione un innocente.
     *
     * Il difetto e' arrivato in CI e non in locale: quattro chip delle
     * categorie, la riga a cavallo del bordo inferiore di `.prefs`, "coperti"
     * dal promemoria di backup. Riprodotto a mano spostando quella riga di
     * 0,3 px — centro a 461,3 contro un bordo a 461,0 — e la sonda diceva
     * `div.nudge`, parola per parola come sul runner. Il promemoria non copre
     * niente: `.prefs` finisce **dove** la banda comincia, e mezzo pixel piu'
     * su risponde ancora il chip.
     *
     * ## E perche' non basta confrontare i numeri con piu' precisione
     *
     * Perche' `getBoundingClientRect` e il test di collisione del browser non
     * cadono sullo stesso decimale. Misurato qui: una riga della Home a
     * 499,31..543,31 dentro uno scroller che il rettangolo dichiara chiuso a
     * 522,00; `elementFromPoint` risponde la riga fino a 521,00 e da 521,31 in
     * poi risponde gia' la banda sotto. Sono ~0,7 px in cui l'aritmetica dice
     * "dentro" e il browser dice "fuori" — e un confronto piu' fine ci cade
     * dentro esattamente come uno arrotondato, solo in un punto diverso.
     *
     * Quindi il punto interrogato e' il **centro della parte visibile**: per un
     * bersaglio intero e' il suo centro di sempre, per uno mezzo ritagliato e'
     * il centro di cio' che il dito puo' toccare. Un overlay non e' un antenato
     * che ritaglia, quindi non sposta questo punto di un pixel: la regola delle
     * Sovrapposizioni resta esattamente quella di prima.
     *
     * Sotto i 2 px di parte visibile non si interroga niente e si dichiara
     * `ritagliato`: e' la fascia in cui i due modi di contare non si accordano
     * (a deviceScaleFactor 3 un pixel del dispositivo vale 0,33 px CSS), e non
     * c'e' nessun bersaglio tattile da difendere in una striscia cosi'.
     */
    const VISIBILE_MIN = 2

    const visible = (el: Element, box: DOMRect): DOMRect | null => {
      let left = Math.max(box.left, 0)
      let right = Math.min(box.right, innerWidth)
      let top = Math.max(box.top, 0)
      let bottom = Math.min(box.bottom, innerHeight)
      for (let p = el.parentElement; p !== null; p = p.parentElement) {
        const style = getComputedStyle(p)
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
        const clip = p.getBoundingClientRect()
        left = Math.max(left, clip.left)
        right = Math.min(right, clip.right)
        top = Math.max(top, clip.top)
        bottom = Math.min(bottom, clip.bottom)
      }
      if (right - left < VISIBILE_MIN || bottom - top < VISIBILE_MIN) return null
      return new DOMRect(left, top, right - left, bottom - top)
    }

    // `select` e' entrato con il selettore del giorno di pagamento (ADR 023), ed
    // e' la stessa lezione di sempre: la sonda dice *"per ogni bersaglio
    // interattivo"*, e quell'argomento non nomina nessun elenco di tag. Il
    // giorno in cui e' comparso il primo `select` dell'app la sonda l'avrebbe
    // saltato in silenzio — cioe' avrebbe continuato a passare **proprio dove
    // c'era qualcosa di nuovo da guardare**.
    const nodes = [
      ...document.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href]'),
    ]
    const out: Target[] = []

    for (const el of nodes) {
      if (el.matches(':disabled')) continue
      const box = el.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) continue

      // La misura del bersaglio resta quella **intera**: e' il bersaglio a
      // dover essere grande 44, non la parte che si vede in questo momento.
      const rect = `${Math.round(box.width)}x${Math.round(box.height)}`
      const inert = el.closest('[aria-hidden="true"]') !== null

      // Ritagliato dal proprio contenitore: si dice, non si salta in silenzio.
      const seen = visible(el, box)
      if (seen === null) {
        out.push({ label: name(el), rect, status: 'ritagliato', hit: '(fuori dal contenitore)' })
        continue
      }

      // Il centro della parte visibile, senza arrotondarlo: `elementFromPoint`
      // prende i decimali, e arrotondare sposterebbe il punto interrogato via
      // dal punto misurato.
      const x = seen.left + seen.width / 2
      const y = seen.top + seen.height / 2

      const hit = document.elementFromPoint(x, y)
      const reached = hit === el || el.contains(hit)

      const status: Target['status'] = inert
        ? reached
          ? 'coperto' // dietro a un modale ma ancora toccabile: e' un bug al contrario
          : 'inerte'
        : !reached
          ? 'coperto'
          : // Arrotondato, non grezzo: la stampa qui sotto usa Math.round, e un
            // confronto sul float fa fallire un bersaglio di 43.999 stampando
            // "44" — cioe' un messaggio che dice il falso. Sotto la meta' di un
            // pixel CSS non c'e' nessun difetto tattile da difendere: a
            // deviceScaleFactor 3 sono poco piu' di un pixel del dispositivo.
            Math.round(Math.min(box.width, box.height)) < 44
            ? 'piccolo'
            : 'ok'

      out.push({ label: name(el), rect, status, hit: name(hit) })
    }
    return out
  })
}

/**
 * Una riga di tabella per stato, e l'elenco puntuale di quello che non va.
 *
 * Colonne: totale, ok, inerti, **ritagliati**, da guardare. I ritagliati stanno
 * in tabella perche' sono la differenza fra due macchine che prima non si
 * vedeva: lo stesso stato dava 14 bersagli in CI e 10 in locale, e nessuna riga
 * lo diceva.
 */
export function report(viewport: string, state: string, targets: readonly Target[]): string[] {
  const count = (s: Target['status']): number => targets.filter((t) => t.status === s).length
  const bad = targets.filter((t) => t.status === 'coperto' || t.status === 'piccolo')
  const lines = [
    `| ${viewport} | ${state} | ${targets.length} | ${count('ok')} | ${count('inerte')} | ${count('ritagliato')} | ${bad.length} |`,
  ]
  for (const t of bad) lines.push(`|   -> ${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`)
  return lines
}
