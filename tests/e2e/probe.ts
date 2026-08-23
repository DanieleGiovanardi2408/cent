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
  readonly status: 'ok' | 'coperto' | 'piccolo' | 'inerte'
  readonly hit: string
}

/**
 * Misura tutti i bersagli interattivi visibili e dice, per ciascuno, chi
 * risponde al centro.
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

/** Una riga di tabella per stato, e l'elenco puntuale di quello che non va. */
export function report(viewport: string, state: string, targets: readonly Target[]): string[] {
  const count = (s: Target['status']): number => targets.filter((t) => t.status === s).length
  const bad = targets.filter((t) => t.status === 'coperto' || t.status === 'piccolo')
  const lines = [
    `| ${viewport} | ${state} | ${targets.length} | ${count('ok')} | ${count('inerte')} | ${bad.length} |`,
  ]
  for (const t of bad) lines.push(`|   -> ${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`)
  return lines
}
