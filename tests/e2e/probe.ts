/**
 * La sonda dei bersagli interattivi.
 *
 * Sta in un modulo suo perche' la usano due test che chiedono cose opposte allo
 * stesso strumento:
 *
 * - `overlays.spec.ts` chiede che **ogni** bersaglio risponda al proprio centro
 *   (regola "Sovrapposizioni" di CLAUDE.md);
 * - `install.spec.ts` chiede che fuori da standalone i bersagli che scrivono
 *   siano **zero** (ADR 011);
 * - `schermate.spec.ts` chiede le due cose insieme su **ogni schermata che la
 *   barra raggiunge**, piu' una terza domanda che il centro non sa fare: *"ci
 *   stanno?"* (`collisioni`, `debordi`).
 *
 * Una seconda copia della sonda avrebbe reso la seconda domanda piu' debole
 * della prima senza che si vedesse: e' proprio quando si conta zero che conta
 * come si conta. Per la stessa ragione le tre domande condividono **una sola**
 * enumerazione dei bersagli: `collisioni` e `debordi` sono aritmetica pura sul
 * risultato di `probe`, non un secondo giro nel DOM con un secondo predicato di
 * "interattivo" che un giorno divergerebbe dal primo.
 */
import type { Page } from '@playwright/test'

export interface Rect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

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
  /** Il rettangolo dichiarato del bersaglio: quello che si puo' toccare. */
  readonly box: Rect
  /**
   * Il rettangolo **dipinto**: il suo, unito a quello di ogni discendente
   * visibile, ritagliato da chi lo ritaglia davvero.
   *
   * ## Perche' esiste, e cosa non vedeva chi non ce l'aveva
   *
   * Perche' il testo di un bersaglio puo' uscire dal bersaglio, e quando esce
   * finisce **sopra** quello accanto. E' successo: dalla fase 6 l'etichetta
   * "Impostazioni" traboccava dal proprio bottone e veniva stampata sopra le
   * schede — 29,6 px a 375 punti, 17,3 a 390, 13,0 a 393, cioe' i tre iPhone
   * piu' diffusi.
   *
   * Nessuna delle due misure che c'erano lo vedeva, e per due ragioni diverse:
   *
   * - `header.scrollWidth - header.clientWidth` vale **0 a ogni larghezza**,
   *   perche' il testo esce da un *figlio* dentro il box del padre: lo
   *   scrollWidth del padre non cambia mai;
   * - `elementFromPoint(centro di "Home")` risponde ancora "Home", perche' il
   *   testo di troppo copre la parte **sinistra** della scheda e non il centro.
   *
   * Il centro secco risponde alla domanda *"si puo' toccare?"*. Questo
   * rettangolo risponde all'altra, che e' quella dell'intestazione: *"ci
   * stanno?"*. Vedi `collisioni` e `debordi`.
   */
  readonly ink: Rect
  /**
   * Gli indici, **in questo stesso array**, dei bersagli che lo contengono.
   *
   * Serve a `collisioni`: un bersaglio dentro un altro si sovrappone al proprio
   * antenato per definizione, e contarlo darebbe un rosso che non si puo'
   * togliere.
   */
  readonly dentro: readonly number[]
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
export async function probe(page: Page, dentro?: string): Promise<readonly Target[]> {
  return page.evaluate((radice: string | undefined) => {
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

    /**
     * Il rettangolo **dipinto** di un bersaglio: il suo, unito a quello di ogni
     * discendente visibile, ritagliato da chi lo ritaglia — **lui compreso**,
     * perche' un bersaglio con `overflow: hidden` non lascia dipingere niente
     * fuori da se'.
     *
     * Sovrastima di proposito in un caso, e la direzione e' quella giusta: le
     * etichette avvolte da `Fit` occupano la larghezza massima fra le due
     * lingue, quindi in inglese questo rettangolo e' piu' largo dei glifi
     * accesi. Un indicatore che puo' sbagliare deve sbagliare verso l'allarme —
     * ed e' anche cio' che `Fit` promette: quello spazio e' riservato.
     */
    const inchiostro = (el: Element): DOMRect => {
      let limL = -1e7
      let limT = -1e7
      let limR = 1e7
      let limB = 1e7
      for (let p: Element | null = el; p !== null; p = p.parentElement) {
        const style = getComputedStyle(p)
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
        const clip = p.getBoundingClientRect()
        limL = Math.max(limL, clip.left)
        limT = Math.max(limT, clip.top)
        limR = Math.min(limR, clip.right)
        limB = Math.min(limB, clip.bottom)
      }

      const own = el.getBoundingClientRect()
      let left = own.left
      let top = own.top
      let right = own.right
      let bottom = own.bottom
      for (const child of el.querySelectorAll('*')) {
        const style = getComputedStyle(child)
        if (style.display === 'none' || style.visibility === 'hidden') continue
        const box = child.getBoundingClientRect()
        if (box.width === 0 && box.height === 0) continue
        left = Math.min(left, box.left)
        top = Math.min(top, box.top)
        right = Math.max(right, box.right)
        bottom = Math.max(bottom, box.bottom)
      }

      left = Math.max(left, limL)
      top = Math.max(top, limT)
      right = Math.min(right, limR)
      bottom = Math.min(bottom, limB)
      return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
    }

    /**
     * I ruoli ARIA che denotano un **comando singolo**: qualcosa che si tocca
     * una volta e fa una cosa.
     *
     * Fuori restano, e non per svista:
     *
     * - i ruoli **compositi** (`grid`, `listbox`, `menu`, `menubar`,
     *   `radiogroup`, `tablist`, `tree`, `treegrid`, `tabpanel`): il bersaglio
     *   e' la voce dentro, non il contenitore. Contarli significherebbe
     *   misurare i 44px di una griglia invece che di un chip;
     * - i ruoli **di sola lettura** (`progressbar`, `separator`, `scrollbar`):
     *   ARIA li definisce come stato mostrato, non come comando. La barra del
     *   budget e' alta 6px per scelta, e non e' un bersaglio mancato;
     * - tutto il resto (`group`, `dialog`, `status`, `alert`, `img`,
     *   `presentation`): non e' interattivo per definizione del ruolo.
     *
     * Queste esclusioni **non sono un secondo elenco da tenere aggiornato**:
     * sono cio' che avanza da un insieme chiuso. Il vocabolario dei ruoli ARIA
     * lo scrive una specifica che non e' nostra, quindi niente di cio' che
     * scriveremo domani puo' introdurre un ruolo operabile che non e' qui.
     */
    const COMANDI = new Set([
      'button',
      'checkbox',
      'combobox',
      'gridcell',
      'link',
      'menuitem',
      'menuitemcheckbox',
      'menuitemradio',
      'option',
      'radio',
      'searchbox',
      'slider',
      'spinbutton',
      'switch',
      'tab',
      'textbox',
      'treeitem',
    ])

    /**
     * Interattivo **per ruolo**, non per nome del tag.
     *
     * ## Perche' l'elenco di tag e' stato tolto
     *
     * `button, input, select, textarea, a[href]` era un'enumerazione scritta al
     * tempo t e applicata al tempo t+n: `select` ci e' entrato solo dopo che
     * qualcuno ci era inciampato con il selettore del giorno di pagamento
     * (ADR 023). Il prossimo elemento nuovo sarebbe stato invisibile allo stesso
     * modo, e stavolta senza nessuno che ci inciampasse — cioe' la sonda avrebbe
     * continuato a passare **proprio dove c'era qualcosa di nuovo da guardare**.
     * E' la stessa malattia dei campi senza produttore e delle irraggiungibilita'
     * scadute: una lista che non invecchia insieme a cio' che descrive.
     *
     * ## Le due regole, e perche' sono un'unione e mai una sottrazione
     *
     * 1. **Il browser dice che si puo' operare**: `tabIndex >= 0`. E' la
     *    focalizzabilita' sequenziale calcolata dal motore, non dedotta da noi:
     *    misurata qui, prende `button`, `a[href]`, `input`, `select`,
     *    `textarea`, `summary`, `[tabindex="0"]` — e prendera' da sola il
     *    prossimo elemento operabile che la piattaforma aggiunge o che noi
     *    cominciamo a usare. Nessun tag e' nominato qui.
     * 2. **L'autore dichiara un comando**: un ruolo ARIA in `COMANDI`. Serve per
     *    i widget a `tabindex` mobile — una `tab` non attiva porta
     *    `tabindex="-1"` e resta un bersaglio da toccare — e per un
     *    `role="button"` a cui qualcuno abbia scordato il `tabindex`, che e' un
     *    difetto che vogliamo vedere, non nascondere.
     *
     * Sono in **OR**: un ruolo non nella lista non toglie mai niente. Un
     * `<button role="img">` resterebbe un bersaglio per la regola 1. Cosi' una
     * svista sul ruolo non puo' spegnere la sonda in silenzio — che e'
     * esattamente il modo in cui l'elenco di tag falliva.
     *
     * ## L'unico buco della regola 1, misurato invece che supposto
     *
     * `contenteditable` era scritto qui dentro come "lo prende la regola 1". Non
     * lo prende: in Chromium `tabIndex` di un `<div contenteditable>` vale
     * **-1** anche se il div si mette a fuoco benissimo. La riga era una regola
     * scritta e non applicata, con la particolarita' di essere falsa nel
     * commento che la giustificava.
     *
     * Sta quindi nella regola 2, dove va: l'attributo **e'** una dichiarazione
     * di comando dell'autore — il ruolo implicito di un `contenteditable` e'
     * `textbox` — solo scritta in HTML invece che in ARIA. Non e' un terzo
     * elenco: e' l'unico caso in cui la piattaforma dice "operabile" senza dirlo
     * a `tabIndex`.
     */
    const operabile = (el: Element): el is HTMLElement | SVGElement => {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false
      if (el.tabIndex >= 0) return true
      // L'**attributo**, non `isContentEditable`: quello e' calcolato ed
      // eredita, quindi in `<div contenteditable><p>x</p></div>` conterebbe due
      // bersagli dove ce n'e' uno. Il ruolo `textbox` sta sull'elemento che lo
      // dichiara, e li' sta anche il rettangolo da misurare.
      const editabile = el.getAttribute('contenteditable')
      if (editabile !== null && editabile !== 'false') return true
      const role = el.getAttribute('role')
      // Il ruolo puo' essere una lista di ripiego ("switch button"): basta che
      // uno solo dei nomi sia un comando.
      return role !== null && role.trim().split(/\s+/).some((r) => COMANDI.has(r))
    }

    // La radice e' un **restringimento del campo**, non un filtro sui ruoli:
    // senza, si guarda tutto il documento, esattamente come prima. Serve a chi
    // fa una domanda su una zona — "i bersagli dell'intestazione ci stanno?" —
    // invece che sull'app intera.
    const scope: ParentNode | null =
      radice === undefined ? document : document.querySelector(radice)
    if (scope === null) throw new Error(`la radice "${radice ?? ''}" non e' nel documento`)

    const nodes = [...scope.querySelectorAll('*')].filter(operabile)
    const out: Target[] = []

    const piatto = (b: DOMRect) => ({
      left: Math.round(b.left * 100) / 100,
      top: Math.round(b.top * 100) / 100,
      right: Math.round(b.right * 100) / 100,
      bottom: Math.round(b.bottom * 100) / 100,
    })

    // Chi contiene chi, **fra i bersagli misurati**: si calcola qui perche' qui
    // c'e' il DOM. `collisioni` e' poi aritmetica pura, in Node.
    const tenuti: Element[] = []

    for (const el of nodes) {
      if (el.matches(':disabled')) continue
      const box = el.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) continue

      // La misura del bersaglio resta quella **intera**: e' il bersaglio a
      // dover essere grande 44, non la parte che si vede in questo momento.
      const rect = `${Math.round(box.width)}x${Math.round(box.height)}`
      const inert = el.closest('[aria-hidden="true"]') !== null
      const ink = piatto(inchiostro(el))
      const dentro = tenuti.flatMap((other, i) => (other.contains(el) ? [i] : []))
      tenuti.push(el)

      // Ritagliato dal proprio contenitore: si dice, non si salta in silenzio.
      const seen = visible(el, box)
      if (seen === null) {
        out.push({
          label: name(el),
          rect,
          status: 'ritagliato',
          hit: '(fuori dal contenitore)',
          box: piatto(box),
          ink,
          dentro,
        })
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

      out.push({ label: name(el), rect, status, hit: name(hit), box: piatto(box), ink, dentro })
    }
    return out
  }, dentro)
}

/** Due rettangoli si sovrappongono davvero (i bordi che si toccano non contano). */
function tocca(a: Rect, b: Rect): boolean {
  return a.right > b.left && b.right > a.left && a.bottom > b.top && b.bottom > a.top
}

const scrivi = (r: Rect): string =>
  `${r.left}..${r.right} x ${r.top}..${r.bottom}`

/**
 * Le coppie di bersagli il cui **rettangolo dipinto** si sovrappone.
 *
 * ## Perche' questo predicato e non `scrollWidth - clientWidth <= 0`
 *
 * Perche' quello non e' l'affermazione che si vuole fare. `scrollWidth` di un
 * contenitore dice *"il contenuto sta dentro il mio box"*, e vale **0 a ogni
 * larghezza** quando a traboccare e' un figlio dentro il box del padre: il testo
 * di "Impostazioni" usciva dal proprio bottone e finiva sopra le schede senza
 * che lo `scrollWidth` dell'intestazione cambiasse di un pixel. Un guardiano
 * cieco per costruzione e' peggio di nessun guardiano, perche' occupa il posto.
 *
 * L'affermazione vera e' *"ci stanno"*, e la sua forma e' questa: per ogni
 * coppia, `A.right > B.left && B.right > A.left` (e lo stesso sull'asse
 * verticale) dev'essere **falso**.
 *
 * Le coppie in cui uno contiene l'altro non si contano: un bersaglio dentro un
 * altro si sovrappone al proprio antenato per definizione.
 */
export function collisioni(targets: readonly Target[]): string[] {
  const out: string[] = []
  for (let i = 0; i < targets.length; i += 1) {
    for (let j = i + 1; j < targets.length; j += 1) {
      const a = targets[i]!
      const b = targets[j]!
      if (a.dentro.includes(j) || b.dentro.includes(i)) continue
      if (!tocca(a.ink, b.ink)) continue
      out.push(`${a.label} [${scrivi(a.ink)}] sopra ${b.label} [${scrivi(b.ink)}]`)
    }
  }
  return out
}

/**
 * I bersagli il cui inchiostro esce dal **proprio** rettangolo.
 *
 * E' la causa esatta di cui `collisioni` e' l'effetto, ed e' piu' fine: un
 * bersaglio puo' debordare senza ancora arrivare sopra il vicino — a 414 punti
 * "Impostazioni" usciva dal bottone di 6 px e cadeva nel vuoto fra il bottone e
 * le schede. Non copriva niente, e nella parte di etichetta fuori dal bottone il
 * tap non arrivava comunque a nessuno: il bersaglio era piu' piccolo di quello
 * che si vedeva.
 *
 * La tolleranza e' mezzo pixel CSS, cioe' poco piu' di un pixel del dispositivo
 * a deviceScaleFactor 3: sotto non c'e' nessun difetto da difendere, e sopra
 * c'e' una parola tagliata.
 */
export function debordi(targets: readonly Target[]): string[] {
  const TOLLERANZA = 0.5
  return targets.flatMap((t) => {
    const fuori = Math.max(
      t.box.left - t.ink.left,
      t.ink.right - t.box.right,
      t.box.top - t.ink.top,
      t.ink.bottom - t.box.bottom,
    )
    if (fuori <= TOLLERANZA) return []
    return [
      `${t.label}: dipinge ${Math.round(fuori * 10) / 10}px fuori dal proprio bersaglio ` +
        `(box ${scrivi(t.box)}, inchiostro ${scrivi(t.ink)})`,
    ]
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
