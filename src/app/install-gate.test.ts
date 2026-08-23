/**
 * Il cancello di ADR 011, provato dove si decide: una funzione pura, quattro
 * casi, nessun browser.
 *
 * La prova che il **divieto** funziona davvero — cioe' che nello stato bloccato
 * non esiste nessun bersaglio che scriva — non puo' stare qui: e' geometria e
 * DOM, e vive in `tests/e2e/install.spec.ts`. Qui sta la regola; li' sta la sua
 * conseguenza visibile.
 */
import { describe, expect, it } from 'vitest'
import { writesAreBlocked } from './install-gate'
import type { DisplayContext } from './install-gate'

/** Produzione, https, browser normale: il caso per cui il cancello esiste. */
const PRODUZIONE: DisplayContext = {
  standalone: false,
  developmentBuild: false,
  secureContext: true,
}

const con = (patch: Partial<DisplayContext>): DisplayContext => ({ ...PRODUZIONE, ...patch })

describe('il cancello fuori da standalone', () => {
  it('in produzione, dentro un browser, blocca la scrittura', () => {
    expect(writesAreBlocked(PRODUZIONE)).toBe(true)
  })

  it('nell app installata non blocca niente', () => {
    expect(writesAreBlocked(con({ standalone: true }))).toBe(false)
  })

  /**
   * Bloccare il dev server renderebbe il progetto non sviluppabile: nel browser
   * c'e' l'unico modo di lavorare sull'app.
   */
  it('sul dev server non si applica', () => {
    expect(writesAreBlocked(con({ developmentBuild: true }))).toBe(false)
  })

  /**
   * `http://` da rete locale: e' il telefono che prova la build mentre la si
   * scrive. Li' il service worker non si registra, quindi installare e'
   * impossibile e una pagina che chiede di installare sarebbe un vicolo cieco.
   * Il segnale resta la banda "non su HTTPS", che esiste gia'.
   */
  it('fuori da un contesto sicuro non si applica: li installare non e possibile', () => {
    expect(writesAreBlocked(con({ secureContext: false }))).toBe(false)
  })

  /**
   * La build di produzione servita da `vite preview` gira su `localhost` ed e'
   * bit per bit quella di GitHub Pages. Se il cancello guardasse l'hostname,
   * il codice provato dai test end-to-end non sarebbe quello che gira sul
   * telefono — e il divieto sarebbe verificato proprio dove non si applica.
   */
  it('non guarda l hostname: la build di produzione e bloccata ovunque giri', () => {
    expect(writesAreBlocked(con({ standalone: false }))).toBe(true)
  })
})
