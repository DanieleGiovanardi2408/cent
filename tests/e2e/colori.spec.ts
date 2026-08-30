/**
 * Il tema e' il soggetto: quello che il colore decide, misurato **dipinto**.
 *
 * ## Perche' esiste questo file
 *
 * `tokens.css` dichiara due palette e scrive i rapporti di contrasto in un
 * commento accanto a ogni token. Un commento non e' una verifica: dice cosa
 * qualcuno ha calcolato una volta, su una coppia di esadecimali, non cosa
 * finisce davvero sotto gli occhi. Fra il token e il pixel ci sono
 * l'`opacity` degli antenati, i fondi annidati e i `color-mix`, e la palette
 * delle categorie **non e' nemmeno un token**: e' un dato, che l'utente puo'
 * cambiare (fase 3), e che dalla fase 6 diventa la palette dei grafici.
 *
 * Fino a oggi la suite intera girava in tema chiaro **per caso** — Chromium
 * parte cosi'. Adesso il chiaro e' dichiarato (`colorScheme: 'light'`) e lo
 * scuro ha il proprio progetto, che esegue solo questo file: raddoppiare la
 * suite per rimisurare geometrie indipendenti dal colore avrebbe pagato il tetto
 * dei 5 minuti per zero informazione.
 *
 * ## Cosa misura, e perche' cosi'
 *
 * **Il colore dipinto, non il token.** Per ogni elemento con testo proprio si
 * compone: il colore del testo con la sua alfa, l'`opacity` accumulata di tutti
 * gli antenati, e la catena dei fondi fino a `body` — che deve chiudersi su un
 * colore opaco, altrimenti la misura starebbe indovinando la base.
 *
 * **La soglia e' quella di WCAG e dipende dal testo**: 4.5:1, che scende a 3:1
 * per il testo grande (>= 24px, o >= 18.66px in grassetto). Non e' tolleranza:
 * e' la regola, e applicarla in blocco a 4.5 farebbe fallire il numero grande
 * della Home per un motivo che non esiste.
 *
 * **I controlli disabilitati sono esclusi**, ed e' l'unica esclusione: i chip
 * senza importo stanno a `opacity: 0.45` di proposito (AddSheet.css), e WCAG
 * 1.4.3 esenta esplicitamente il testo dei componenti inattivi. Escluderli e'
 * la regola; includerli sarebbe stato un rosso permanente che si finisce per
 * disattivare, cioe' una guardia in meno.
 *
 * ## Le categorie: distanza percettiva, non contrasto
 *
 * Fra due colori adiacenti di un grafico il rapporto di contrasto non dice
 * niente di utile — due colori possono avere la stessa luminanza ed essere
 * lontanissimi, o luminanze diverse ed essere lo stesso colore. La domanda
 * "si distinguono?" e' percettiva, quindi si misura con **CIEDE2000** sulle
 * ventotto coppie, e sul colore **dipinto** (`color-mix(... , var(--surface))`),
 * che nei due temi non e' lo stesso: la mescola con il fondo chiaro e quella
 * con il fondo scuro sono due palette diverse, e una puo' collassare mentre
 * l'altra tiene. E' esattamente il buco che il progetto `dark` chiude.
 */
import { chiudiGuida, expect, test } from './installed'
import { fissaOrologio } from './clock'
import type { Page } from '@playwright/test'

/** Un colore in sRGB 0-255, piu' alfa 0-1. */
type Rgba = readonly [number, number, number, number]

/** Cio' che la pagina consegna: nessuna matematica di la', nessun DOM di qua. */
interface Campione {
  readonly label: string
  /** Il colore del testo, con la sua alfa. */
  readonly colore: string
  /** L'`opacity` accumulata degli antenati, gia' moltiplicata. */
  readonly opacita: number
  /** La catena dei fondi, dal piu' vicino al piu' lontano (`body` in fondo). */
  readonly sfondi: readonly string[]
  readonly px: number
  readonly bold: boolean
}

/* ------------------------------------------------------------------ colore */

/**
 * Legge la forma con cui Chromium serializza un colore calcolato.
 *
 * Sono tre, e le ultime due sono arrivate misurando invece che immaginando:
 * `rgb(...)` / `rgba(...)` per i colori semplici; `color(srgb r g b / a)` con
 * componenti **0-1** per quelli che nascono da una funzione di colore, cioe'
 * tutti i `color-mix` delle categorie; e l'esadecimale **grezzo**, perche' il
 * valore di una custom property non viene risolto in colore da nessuno — chi
 * legge `--over` legge esattamente i sette caratteri scritti in `tokens.css`.
 * Leggerne una sola avrebbe fatto passare per nera meta' della palette.
 */
function leggiColore(css: string): Rgba {
  const hex = /^#([\da-f]{3,8})$/i.exec(css.trim())
  if (hex !== null) {
    const h = hex[1] ?? ''
    const largo = h.length > 4
    const pezzo = (i: number): number => {
      const s = largo ? h.slice(i * 2, i * 2 + 2) : (h[i] ?? '0').repeat(2)
      return Number.parseInt(s, 16)
    }
    const alfa = h.length === 4 || h.length === 8 ? pezzo(3) / 255 : 1
    return [pezzo(0), pezzo(1), pezzo(2), alfa]
  }
  const srgb = /^color\(srgb\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)(?:\s*\/\s*([\d.eE+-]+))?\s*\)$/.exec(
    css.trim(),
  )
  if (srgb !== null) {
    const n = (s: string | undefined, d: number): number => (s === undefined ? d : Number(s))
    return [
      n(srgb[1], 0) * 255,
      n(srgb[2], 0) * 255,
      n(srgb[3], 0) * 255,
      n(srgb[4], 1),
    ]
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(css.trim())
  if (rgb === null) throw new Error(`colore non leggibile: "${css}"`)
  const parts = (rgb[1] ?? '').split(/[,\s/]+/).filter((s) => s !== '')
  const num = (i: number, d: number): number => {
    const raw = parts[i]
    return raw === undefined ? d : Number(raw)
  }
  return [num(0, 0), num(1, 0), num(2, 0), num(3, 1)]
}

/** `sopra` dipinto su `sotto`, in sRGB non lineare (come fa il compositore). */
function sovrapponi(sopra: Rgba, sotto: Rgba): Rgba {
  const a = sopra[3]
  return [
    sopra[0] * a + sotto[0] * (1 - a),
    sopra[1] * a + sotto[1] * (1 - a),
    sopra[2] * a + sotto[2] * (1 - a),
    1,
  ]
}

/** Luminanza relativa WCAG 2.x. */
function luminanza([r, g, b]: Rgba): number {
  const lin = (v: number): number => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrasto(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminanza(a), luminanza(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/* --------------------------------------------------------------- CIEDE2000 */

function versoLab([r, g, b]: Rgba): readonly [number, number, number] {
  const lin = (v: number): number => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  // sRGB -> XYZ (D65), poi XYZ -> Lab con il bianco D65.
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/**
 * ΔE00 fra due colori. La formula per intero, senza le semplificazioni che
 * circolano: i termini rotazionali sono proprio quelli che decidono sui blu, e
 * in questa palette ce ne sono due.
 */
function deltaE00(c1: Rgba, c2: Rgba): number {
  const [L1, a1, b1] = versoLab(c1)
  const [L2, a2, b2] = versoLab(c2)
  const rad = Math.PI / 180
  const deg = 180 / Math.PI

  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const Cm = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)))
  const ap1 = (1 + G) * a1
  const ap2 = (1 + G) * a2
  const Cp1 = Math.hypot(ap1, b1)
  const Cp2 = Math.hypot(ap2, b2)
  const hp = (b: number, a: number): number => {
    if (a === 0 && b === 0) return 0
    const h = Math.atan2(b, a) * deg
    return h >= 0 ? h : h + 360
  }
  const hp1 = hp(b1, ap1)
  const hp2 = hp(b2, ap2)

  const dLp = L2 - L1
  const dCp = Cp2 - Cp1
  let dhp = 0
  if (Cp1 * Cp2 !== 0) {
    dhp = hp2 - hp1
    if (dhp > 180) dhp -= 360
    else if (dhp < -180) dhp += 360
  }
  const dHp = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dhp * rad) / 2)

  const Lpm = (L1 + L2) / 2
  const Cpm = (Cp1 + Cp2) / 2
  let hpm = hp1 + hp2
  if (Cp1 * Cp2 !== 0) {
    if (Math.abs(hp1 - hp2) > 180) hpm += hp1 + hp2 < 360 ? 360 : -360
    hpm /= 2
  }

  const T =
    1 -
    0.17 * Math.cos((hpm - 30) * rad) +
    0.24 * Math.cos(2 * hpm * rad) +
    0.32 * Math.cos((3 * hpm + 6) * rad) -
    0.2 * Math.cos((4 * hpm - 63) * rad)
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2))
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7))
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2)
  const Sc = 1 + 0.045 * Cpm
  const Sh = 1 + 0.015 * Cpm * T
  const Rt = -Math.sin(2 * dTheta * rad) * Rc

  return Math.sqrt(
    (dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh),
  )
}

/* ------------------------------------------------------------------ misura */

interface Misura {
  readonly label: string
  readonly rapporto: number
  readonly soglia: number
  readonly fg: string
  readonly bg: string
}

const arrotonda = (n: number): number => Math.round(n * 100) / 100
const scrivi = (c: Rgba): string =>
  `#${[c[0], c[1], c[2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/**
 * Ogni elemento con testo **proprio**, con il colore che finisce sotto gli
 * occhi: alfa del testo, `opacity` degli antenati e catena dei fondi.
 */
async function campioni(page: Page): Promise<readonly Campione[]> {
  return page.evaluate(() => {
    const out: Campione[] = []
    const nome = (el: Element): string => {
      const cls =
        typeof el.className === 'string' && el.className !== ''
          ? `.${el.className.trim().split(/\s+/).join('.')}`
          : ''
      const txt = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 20)
      return `${el.tagName.toLowerCase()}${cls}${txt === '' ? '' : ` "${txt}"`}`
    }

    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      // Testo **proprio**: senza questo, ogni contenitore erediterebbe il testo
      // dei figli e la stessa coppia verrebbe misurata dieci volte.
      const proprio = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
      )
      if (!proprio) continue
      if (el.closest('[aria-hidden="true"]') !== null) continue
      // WCAG 1.4.3 esenta il testo dei componenti inattivi, ed e' l'unica
      // esclusione di questo file: i chip senza importo sono spenti apposta.
      if (el.closest(':disabled') !== null) continue

      const box = el.getBoundingClientRect()
      if (box.width < 1 || box.height < 1) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none') continue

      let opacita = Number(style.opacity)
      const sfondi: string[] = []
      for (let p: HTMLElement | null = el; p !== null; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (p !== el) opacita *= Number(s.opacity)
        sfondi.push(s.backgroundColor)
        if (p === document.body) break
      }

      out.push({
        label: nome(el),
        colore: style.color,
        opacita,
        sfondi,
        px: Number.parseFloat(style.fontSize),
        bold: Number(style.fontWeight) >= 700,
      })
    }
    return out
  })
}

/** Compone un campione e lo confronta con la soglia che gli spetta. */
function valuta(c: Campione): Misura {
  // Dal fondo verso l'alto: la catena arriva dal DOM in ordine inverso, e
  // comporre nell'ordine sbagliato darebbe un fondo plausibile e falso.
  let bg: Rgba = [0, 0, 0, 0]
  for (let i = c.sfondi.length - 1; i >= 0; i -= 1) {
    bg = sovrapponi(leggiColore(c.sfondi[i] ?? 'rgba(0,0,0,0)'), bg)
  }
  const testo = leggiColore(c.colore)
  const fg = sovrapponi([testo[0], testo[1], testo[2], testo[3] * c.opacita], bg)
  // Testo grande secondo WCAG: >= 24px, o >= 18.66px se in grassetto.
  const grande = c.px >= 24 || (c.bold && c.px >= 18.66)
  return {
    label: c.label,
    rapporto: arrotonda(contrasto(fg, bg)),
    soglia: grande ? 3 : 4.5,
    fg: scrivi(fg),
    bg: scrivi(bg),
  }
}

/** Le misure che non arrivano alla propria soglia, dalla peggiore in giu'. */
function sotto(misure: readonly Misura[]): readonly Misura[] {
  return misure
    .filter((m) => m.rapporto < m.soglia)
    .sort((a, b) => a.rapporto - b.rapporto)
}

function racconta(tema: string, scena: string, misure: readonly Misura[]): void {
  const peggio = [...misure].sort((a, b) => a.rapporto - b.rapporto).slice(0, 3)
  console.log(
    `\n  [${tema}] ${scena}: ${misure.length} testi, peggiori -> ` +
      peggio.map((m) => `${m.label.slice(0, 34)} ${m.rapporto}:1/${m.soglia}`).join(' · '),
  )
}

/** Il fondo di `body`, cioe' la base su cui e' composto tutto il resto. */
async function baseOpaca(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor)
}

/* -------------------------------------------------------------------- scene */

/** Un budget piccolo e una spesa piu' grande: il residuo e' negativo. */
async function sfora(page: Page): Promise<void> {
  await page.locator('.budget').tap()
  await expect(page.locator('.sheet--budget')).toBeVisible()
  for (const digit of '1000') {
    await page.locator('.pad__key', { hasText: new RegExp(`^${digit}$`) }).first().tap()
  }
  const chip = page.locator('.period', { hasText: 'A settimana' })
  await chip.tap()
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--budget')).toHaveCount(0)

  await page.locator('.fab').tap()
  await expect(page.locator('.sheet--add')).toBeVisible()
  for (const digit of '5000') {
    await page.locator('.pad__key', { hasText: new RegExp(`^${digit}$`) }).first().tap()
  }
  await page.locator('.cat').first().tap()
  await expect(page.locator('.sheet--add')).toHaveCount(0)
}

async function apri(page: Page): Promise<void> {
  await fissaOrologio(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)
}

/* -------------------------------------------------------------------- test */

/**
 * La premessa del progetto, prima di ogni misura.
 *
 * Senza, il progetto `dark` potrebbe girare in chiaro e passare tutto: quattro
 * test verdi che dicono due volte la stessa cosa, ed e' la forma peggiore —
 * una copertura che si crede di avere. E' la stessa ragione per cui
 * `ambiente.spec.ts` nomina `isSecureContext`.
 */
test('il tema dipinto e\' quello che il progetto dichiara', async ({ page }, testInfo) => {
  const atteso = testInfo.project.name === 'dark'
  await apri(page)
  const scuro = await page.evaluate(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  )
  expect(
    scuro,
    `il progetto "${testInfo.project.name}" dovrebbe dipingere in ${
      atteso ? 'scuro' : 'chiaro'
    }: senza questa premessa le misure qui sotto sarebbero due copie della stessa`,
  ).toBe(atteso)

  // E il tema si dichiara anche al browser: `color-scheme` decide le barre di
  // scorrimento e i controlli di sistema, che nessun token puo' ricolorare.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(
    atteso ? 'dark' : 'light',
  )
})

test('ogni testo dipinto sta sopra la soglia AA della sua taglia', async ({ page }, testInfo) => {
  const tema = testInfo.project.name
  await apri(page)

  // Il fondo dev'essere opaco: se `body` fosse trasparente, ogni rapporto qui
  // sotto sarebbe calcolato su una base indovinata.
  expect(leggiColore(await baseOpaca(page))[3], 'il fondo di body non e\' opaco').toBe(1)

  const scene: { nome: string; vai: () => Promise<void> }[] = [
    { nome: 'Home vuota', vai: async () => {} },
    {
      nome: 'foglio aggiungi',
      vai: async () => {
        await page.locator('.fab').tap()
        await expect(page.locator('.sheet--add')).toBeVisible()
        // Con una cifra i chip si accendono: senza, sarebbero tutti esenti e
        // il foglio verrebbe misurato senza il suo contenuto principale.
        await page.locator('.pad__key', { hasText: /^7$/ }).first().tap()
      },
    },
    {
      nome: 'Impostazioni',
      vai: async () => {
        await page.locator('.app__action').tap()
        await expect(page.locator('.prefs')).toBeVisible()
      },
    },
    // Il foglio della spesa fissa, nel suo stato piu' pieno: cadenza
    // selezionata, chip di categoria selezionato, anteprima con i numeri e la
    // casella di conferma. Sono quattro superfici nuove — e una, la spunta
    // dentro il quadratino, dipinge `--on-brand` su `--brand`, che finora era
    // solo nel bottone del budget.
    {
      nome: 'foglio spesa fissa, con arretrato da confermare',
      vai: async () => {
        await page.locator('.app__action').tap()
        await expect(page.locator('.prefs')).toBeVisible()
        await page.locator('.prefs__action').filter({ hasText: /spesa fissa/i }).tap()
        await expect(page.locator('.sheet--rule')).toBeVisible()
        await page.locator('.pad__key', { hasText: /^9$/ }).first().tap()
        await page.locator('.pad__key--zero').tap()
        await page.locator('.cats--pick .cat').first().tap()
        await page.locator('.starts .chip__input').fill('2026-01-01')
        await expect(page.locator('.rule__confirm')).toBeVisible()
        await page.locator('.rule__confirm').tap()
        await expect(page.locator('.rule__confirm')).toHaveAttribute('aria-checked', 'true')
      },
    },
    // Il foglio che corregge l'importo di una spesa **generata**: tre superfici
    // nuove — l'intestazione con la pastiglia colorata, la riga che dichiara
    // che il budget non si muove, e il bottone che scrive acceso. La spesa
    // dev'essere una fissa, o quella riga non verrebbe dipinta affatto.
    //
    // La regola creata qui **resta**: le scene si susseguono sullo stesso
    // database, e la prossima ne ha bisogno.
    {
      nome: 'foglio correggi l importo, su una spesa fissa',
      vai: async () => {
        await page.locator('.app__action').tap()
        await expect(page.locator('.prefs')).toBeVisible()
        await page.locator('.prefs__action').filter({ hasText: /spesa fissa/i }).tap()
        await expect(page.locator('.sheet--rule')).toBeVisible()
        await page.locator('.pad__key', { hasText: /^9$/ }).first().tap()
        await page.locator('.pad__key--zero').tap()
        await page.locator('.cats--pick .cat').filter({ hasText: 'Casa' }).tap()
        await page.locator('.save').tap()
        await expect(page.locator('.sheet--rule')).toHaveCount(0)

        await page.locator('.nav__tab').nth(1).tap()
        await expect(page.locator('.row').first()).toBeVisible()
        await page.locator('.row').first().tap()
        await expect(page.locator('.acts')).toBeVisible()
        await page.locator('.acts__fix').tap()
        await expect(page.locator('.sheet--amount')).toBeVisible()
        // Una cifra: il bottone che scrive si accende, e il testo di un
        // componente inattivo sarebbe esente dalla soglia.
        await page.locator('.pad__key', { hasText: /^7$/ }).first().tap()
        await expect(page.locator('.sheet--amount .save')).toBeEnabled()
      },
    },
    // Lo stesso foglio della spesa fissa, con la **nona** categoria: quella che
    // la regola ha adesso e che non e' piu' in griglia (ADR 019). Porta due
    // testi che non esistono altrove — l'etichetta "Attuale" dentro il chip, a
    // 10px, cioe' la taglia piu' severa dell'app, e la riga che spiega perche'
    // c'e'.
    {
      nome: 'foglio spesa fissa, con la categoria archiviata',
      vai: async () => {
        await page.locator('.app__action').tap()
        await expect(page.locator('.prefs')).toBeVisible()
        await page.locator('.cats--edit .cat').filter({ hasText: 'Casa' }).tap()
        await expect(page.locator('.sheet--cat')).toBeVisible()
        await page.locator('.editor__second').tap()
        await expect(page.locator('.sheet--cat')).toHaveCount(0)
        await page.locator('.fixed__row').first().tap()
        await expect(page.locator('.sheet--rule')).toBeVisible()
        await expect(page.locator('.rule__current')).toBeVisible()
      },
    },
    // Il pannello che sposta indietro la data d'inizio (ADR 018), nel suo stato
    // pieno: il valore attuale, il chip della data acceso, l'anteprima con i
    // numeri, la casella spuntata e il bottone che scrive.
    //
    // Nessuna coppia di colori e' nuova — sono `--text`, `--text-muted`,
    // `--line-strong` e `--brand` sulla superficie del foglio, tutte gia'
    // dipinte altrove. Ed e' proprio per questo che la scena c'e': "non ci sono
    // coppie nuove" e' un ragionamento, e questa riga e' la misura.
    {
      nome: 'pannello sposta indietro la data d inizio',
      vai: async () => {
        await page.locator('.app__action').tap()
        await expect(page.locator('.prefs')).toBeVisible()
        await page.locator('.fixed__row').first().tap()
        await expect(page.locator('.sheet--rule')).toBeVisible()
        await page.locator('.starts__back').tap()
        await expect(page.locator('.rewind__now')).toBeVisible()
        await page.locator('.starts .chip__input').fill('2026-01-01')
        await expect(page.locator('.rule__confirm')).toBeVisible()
        await page.locator('.rule__confirm').tap()
        await expect(page.locator('.save')).toBeEnabled()
      },
    },
  ]

  const cattive: Misura[] = []
  for (const scena of scene) {
    await scena.vai()
    const misure = (await campioni(page)).map(valuta)
    expect(misure.length, `nessun testo misurato in "${scena.nome}"`).toBeGreaterThan(3)
    racconta(tema, scena.nome, misure)
    cattive.push(...sotto(misure).map((m) => ({ ...m, label: `${scena.nome} / ${m.label}` })))
    await page.reload()
    await expect(page.locator('.budget')).toBeEnabled()
  }

  expect(
    cattive.map((m) => `${m.label}: ${m.rapporto}:1 (serve ${m.soglia}) ${m.fg} su ${m.bg}`),
    'testo sotto la soglia AA nel tema ' + tema,
  ).toEqual([])
})

test('lo sforo si legge, e non e\' lo stesso colore del resto', async ({ page }, testInfo) => {
  const tema = testInfo.project.name
  await apri(page)
  await sfora(page)

  await expect(page.locator('.hero__value')).toHaveAttribute('data-tone', 'over')

  const misure = (await campioni(page)).map(valuta)
  racconta(tema, 'Home che sfora', misure)
  expect(
    sotto(misure).map((m) => `${m.label}: ${m.rapporto}:1 (serve ${m.soglia})`),
    'testo sotto la soglia AA con lo sforo in pagina',
  ).toEqual([])

  // **`--over` adesso e' solo testo, e questa e' la riga che lo dice.**
  //
  // Qui c'era il controllo sulla superficie: `--over` riempiva anche la barra del
  // periodo, quindi valeva due volte — come testo sopra AA, come superficie
  // sopra 3:1 rispetto alla traccia (WCAG 1.4.11). La barra non c'e' piu' (era
  // al 100% in tutto il ramo sforato: vedi `Home.tsx`), e con lei l'unica
  // superficie che quel token dipingeva.
  //
  // La verifica non e' stata "sistemata", e' stata **tolta insieme al suo
  // oggetto**: misurare il contrasto di una superficie che non esiste avrebbe
  // richiesto di inventarne una. Cio' che resta e' la parte che vale ancora —
  // il testo sopra AA, qui sopra — piu' l'asserzione che segue, che e' quella
  // che rende visibile il cambiamento invece di lasciarlo implicito: se qualcuno
  // rimettesse una superficie `--over`, questo file non se ne accorgerebbe, e la
  // riga qui sotto e' il posto in cui verrebbe a cercare.
  // Resta quindi una verifica sola su `--over`: che come **testo** stia sopra AA
  // (il blocco qui sopra, che campiona i pixel dipinti), e che non collassi su
  // `--text` (il blocco qui sotto). Il giorno in cui `--over` tornasse a
  // riempire qualcosa, il controllo sulla superficie va rimesso qui: e' scritto
  // perche' chi lo cerca lo trovi, invece di scoprire dal `git log` che c'era.

  // E non e' il colore di tutto il resto: se `--over` collassasse su `--text`,
  // i tre segnali dello sforo tornerebbero due (CLAUDE.md, "Calcolo budget").
  const tinte = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement)
    return { over: s.getPropertyValue('--over'), text: s.getPropertyValue('--text') }
  })
  const distanza = arrotonda(deltaE00(leggiColore(tinte.over), leggiColore(tinte.text)))
  console.log(`  [${tema}] --over vs --text: ΔE00 ${distanza}`)
  expect(distanza, '--over non si distingue da --text: lo sforo perderebbe un segnale')
    .toBeGreaterThanOrEqual(20)
})

test('le otto categorie: etichetta AA e otto superfici distinguibili', async ({
  page,
}, testInfo) => {
  const tema = testInfo.project.name
  await apri(page)
  await page.locator('.fab').tap()
  await expect(page.locator('.sheet--add')).toBeVisible()
  // Una cifra: i chip si accendono, e li' l'etichetta e' quella vera.
  await page.locator('.pad__key', { hasText: /^7$/ }).first().tap()
  await expect(page.locator('.cat').first()).toBeEnabled()

  const chip = await page.evaluate(() => {
    const fondo = (el: Element): string => {
      for (let p: Element | null = el; p !== null; p = p.parentElement) {
        const bg = getComputedStyle(p).backgroundColor
        if (!/,\s*0\)$/.test(bg) && bg !== 'transparent') return bg
      }
      return getComputedStyle(document.body).backgroundColor
    }
    return [...document.querySelectorAll('.cat')].map((c) => {
      const pastiglia = c.querySelector('.cat__emoji')
      const nome = c.querySelector('.cat__name')
      return {
        label: (nome?.textContent ?? '').trim(),
        // La superficie **dipinta**: `color-mix` col fondo del tema, cioe' cio'
        // che l'occhio vede e cio' che la fase 6 usera' come area del grafico.
        superficie: pastiglia === null ? '' : getComputedStyle(pastiglia).backgroundColor,
        testo: nome === null ? '' : getComputedStyle(nome).color,
        dietro: nome === null ? '' : fondo(nome.parentElement ?? nome),
      }
    })
  })

  expect(chip.length, 'le otto categorie non sono in griglia').toBe(8)

  // 1. L'etichetta. Il colore della categoria non tinge mai il testo
  //    (defaults.ts): il chip resta superficie, il nome resta `--text`.
  const etichette = chip.map((c) => ({
    label: c.label,
    rapporto: arrotonda(contrasto(leggiColore(c.testo), leggiColore(c.dietro))),
  }))
  console.log(
    `\n  [${tema}] etichette: ` + etichette.map((e) => `${e.label} ${e.rapporto}:1`).join(' · '),
  )
  expect(
    etichette.filter((e) => e.rapporto < 4.5).map((e) => `${e.label}: ${e.rapporto}:1`),
    'nome di categoria sotto AA',
  ).toEqual([])

  // 2. Le ventotto coppie. Il minimo e' la misura che conta: bastano due colori
  //    vicini per rendere un grafico illeggibile, e la media li nasconderebbe.
  const superfici = chip.map((c) => leggiColore(c.superficie))
  let peggiore = { coppia: '', de: Number.POSITIVE_INFINITY }
  for (let i = 0; i < superfici.length; i += 1) {
    for (let j = i + 1; j < superfici.length; j += 1) {
      const de = deltaE00(superfici[i] ?? [0, 0, 0, 1], superfici[j] ?? [0, 0, 0, 1])
      if (de < peggiore.de) {
        peggiore = { coppia: `${chip[i]?.label} / ${chip[j]?.label}`, de }
      }
    }
  }
  console.log(
    `  [${tema}] superfici dipinte: ` + chip.map((c, i) => `${c.label} ${scrivi(superfici[i] ?? [0, 0, 0, 1])}`).join(' · '),
  )
  console.log(`  [${tema}] coppia piu' vicina: ${peggiore.coppia} ΔE00 ${arrotonda(peggiore.de)}`)

  // La soglia e' percettiva, non ereditata: sotto ΔE00 10 due aree adiacenti in
  // un grafico si leggono come sfumature dello stesso colore. E' il numero che
  // deve fallire quando qualcuno cambia un esadecimale in `defaults.ts` senza
  // rifare la ricerca che li ha prodotti — che e' l'unica cosa che puo'
  // rompere questa palette, visto che e' dichiarata definitiva.
  expect(
    arrotonda(peggiore.de),
    `le due categorie piu' vicine (${peggiore.coppia}) non si distinguono nel tema ${tema}`,
  ).toBeGreaterThanOrEqual(10)
})

/**
 * **La barra divisa: un accento e un grigio, misurati dipinti nei due temi.**
 *
 * ## Perche' questo test e' arrivato dopo la barra
 *
 * Perche' la barra e' nata con `--line-strong` e `--text` — grigio e nero — e la
 * scelta si giustificava da se': due valori scuri su un fondo chiaro, **5,17:1
 * fra loro**, cioe' leggibili anche da chi non distingue le tinte. Poi l'accento
 * e' diventato `--brand`, perche' in B quel verde significa gia' *"quotidiane"*
 * ed e' esattamente cio' che quel segmento e'.
 *
 * Il cambio **costa un numero**, e un numero che si perde va sorvegliato dove si
 * perde e non spiegato in un commento: `--brand` contro `--line-strong` vale
 * **1,88:1 in chiaro e 2,63:1 in scuro**. Nessun altro colore lo salvava — in
 * tema chiaro un colore a 3:1 sia da `--bg` (L 0,906) sia da `--brand` (L 0,109)
 * dovrebbe avere luminanza ≤ 0,269 e ≥ 0,427 insieme — quindi la scelta non e'
 * fra due coppie: e' fra l'accento e quel numero.
 *
 * ## Quindi cosa si misura, e cosa **no**
 *
 * Non il rapporto fra i due segmenti, che e' sotto 3 per costruzione e restarci
 * sopra e' impossibile: sarebbe un test che chiede al prodotto una cosa che non
 * esiste, e finirebbe con una soglia abbassata finche' passa.
 *
 * Si misura cio' su cui la lettura poggia davvero, e sono tre cose:
 *
 * 1. **ogni segmento contro il fondo** — e' cio' che rende visibile *quanto e'
 *    lungo* ciascuno, che e' la domanda della barra;
 * 2. **il vuoto da 2 px contro i due segmenti** — e' cio' che rende visibile
 *    *dove finisce l'uno*: il confine e' un'assenza di marca, non un bordo, e
 *    questa e' la riga che lo dice a macchina invece che in un commento;
 * 3. **la distanza percettiva fra i due**, con ΔE00 e non col contrasto: la
 *    domanda *"si distinguono?"* fra due marche adiacenti e' percettiva, ed e'
 *    la stessa misura con cui questo file giudica le otto categorie.
 *
 * E si legge anche **la pastiglia dell'intestazione**, perche' e' la legenda: se
 * divergesse dal proprio segmento, la barra resterebbe leggibile e nessuno
 * saprebbe piu' quale meta' e' quale.
 */
test('la barra divisa: i due segmenti si vedono, e la legenda porta i loro colori', async ({
  page,
}, testInfo) => {
  const tema = testInfo.project.name
  await apri(page)

  // Una scena con tutte e due le nature: senza fisse la barra non esiste
  // (`BreakdownSplit` e' `null` quando una meta' e' zero), e il test misurerebbe
  // il vuoto.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cent')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const categories: { id: string }[] = await new Promise((resolve, reject) => {
      const request = db.transaction('categories').objectStore('categories').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const oggi = new Date()
    const giorno = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('expenses', 'readwrite')
      const store = tx.objectStore('expenses')
      const scrivi = (i: number, cents: number, fissa: boolean): void => {
        store.put({
          id: `colore-${i}`,
          createdAt: 1_700_000_000_000 + i,
          updatedAt: 1_700_000_000_000 + i,
          amountCents: cents,
          categoryId: categories[i % categories.length]?.id ?? 'x',
          date: giorno,
          source: fissa ? 'recurring' : 'manual',
          ...(fissa ? { recurringId: 'regola-di-prova' } : {}),
        })
      }
      scrivi(0, 50700, true)
      scrivi(1, 4200, false)
      scrivi(2, 2600, false)
      scrivi(3, 2400, false)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
  await page.reload()
  await page.getByRole('button', { name: /Statistiche|Stats/ }).click()
  await expect(page.locator('.stats__split')).toHaveCount(1)

  const misura = await page.evaluate(() => {
    const fondo = (el: Element): string => {
      for (let p: Element | null = el; p !== null; p = p.parentElement) {
        const bg = getComputedStyle(p).backgroundColor
        if (!/,\s*0\)$/.test(bg) && bg !== 'transparent') return bg
      }
      return getComputedStyle(document.body).backgroundColor
    }
    const seg = (kind: string): Element => {
      const el = document.querySelector(`.stats__seg[data-kind="${kind}"]`)
      if (el === null) throw new Error(`nessun segmento "${kind}" nella barra divisa`)
      return el
    }
    // La pastiglia e' un `::before`, quindi il colore si legge dallo
    // pseudo-elemento e non dal nodo: leggerlo dal padre darebbe il colore del
    // testo dell'intestazione, cioe' un numero verde su una cosa che non e'
    // quella misurata.
    //
    // `.stats__partHead` e non `.stats__partTitle`: dal 30 agosto la natura sta
    // sul `<div>` che raccoglie il titolo e il comando delle due viste, non
    // sull'`<h3>` — un bottone dentro un'intestazione entra nel suo nome
    // accessibile. La pastiglia e' rimasta dov'era, sul nome; e' il selettore
    // che la trova ad avere un antenato in piu'.
    const pastiglia = (kind: string): string => {
      const h = document.querySelector(`.stats__partHead[data-kind="${kind}"] .stats__partName`)
      if (h === null) throw new Error(`nessuna intestazione "${kind}"`)
      return getComputedStyle(h, '::before').backgroundColor
    }
    const split = document.querySelector('.stats__split')
    if (split === null) throw new Error('nessuna barra divisa')
    return {
      fisse: getComputedStyle(seg('fixed')).backgroundColor,
      quotidiane: getComputedStyle(seg('variable')).backgroundColor,
      // Il vuoto fra i due segmenti **non e' dipinto**: e' il `gap`, quindi cio'
      // che si vede li' e' il fondo del contenitore. Si legge di li', non da un
      // token, perche' il fatto e' *"in mezzo si vede la superficie"*.
      vuoto: fondo(split),
      dietro: fondo(split),
      legendaFisse: pastiglia('fixed'),
      legendaQuotidiane: pastiglia('variable'),
    }
  })

  const fisse = leggiColore(misura.fisse)
  const quotidiane = leggiColore(misura.quotidiane)
  const dietro = leggiColore(misura.dietro)

  const suFondo = {
    fisse: arrotonda(contrasto(fisse, dietro)),
    quotidiane: arrotonda(contrasto(quotidiane, dietro)),
  }
  const fraLoro = arrotonda(contrasto(fisse, quotidiane))
  const percettiva = arrotonda(deltaE00(fisse, quotidiane))

  console.log(
    `\n  [${tema}] barra divisa — fisse ${scrivi(fisse)} ${suFondo.fisse}:1 sul fondo · ` +
      `quotidiane ${scrivi(quotidiane)} ${suFondo.quotidiane}:1 sul fondo · ` +
      `fra loro ${fraLoro}:1, ΔE00 ${percettiva}`,
  )

  // 1. Ciascuno contro il fondo: e' cio' che rende leggibile la **lunghezza**.
  //    3:1 e' la soglia WCAG per un elemento non testuale.
  expect(
    suFondo.fisse,
    `il segmento delle fisse non si stacca dal fondo: ${suFondo.fisse}:1`,
  ).toBeGreaterThanOrEqual(3)
  expect(
    suFondo.quotidiane,
    `il segmento delle quotidiane non si stacca dal fondo: ${suFondo.quotidiane}:1`,
  ).toBeGreaterThanOrEqual(3)

  // 2. Il confine. Il vuoto **e'** il fondo, quindi i due numeri qui sopra sono
  //    gia' la misura del confine: si scrive lo stesso, perche' e' un fatto
  //    diverso che oggi si appoggia sugli stessi pixel, e il giorno in cui
  //    qualcuno dipingesse il `gap` cadrebbe qui e non la' — con il messaggio
  //    giusto.
  expect(
    leggiColore(misura.vuoto),
    'il vuoto fra i due segmenti non e\' la superficie: il confine sarebbe un bordo, ' +
      'cioe\' una terza tinta proprio dove serve leggere dove finisce l\'uno',
  ).toEqual(dietro)

  // 3. La distanza percettiva. Non e' il contrasto — sotto 3 per costruzione,
  //    vedi il commento in testa — e' la domanda "si distinguono?", con la
  //    stessa misura delle otto categorie.
  expect(
    percettiva,
    `i due segmenti della barra divisa non si distinguono nel tema ${tema}: ΔE00 ${percettiva}`,
  ).toBeGreaterThanOrEqual(10)

  // 4. La legenda porta i colori dei segmenti. Senza, la barra resterebbe
  //    leggibile e nessuno saprebbe piu' quale meta' e' quale — e' l'unica cosa
  //    a schermo che leghi i due nomi ai due colori.
  expect(
    leggiColore(misura.legendaFisse),
    'la pastiglia delle fisse non e\' del colore del proprio segmento',
  ).toEqual(fisse)
  expect(
    leggiColore(misura.legendaQuotidiane),
    'la pastiglia delle quotidiane non e\' del colore del proprio segmento',
  ).toEqual(quotidiane)

  // 5. **I testi che le Statistiche hanno guadagnato**, misurati qui e non
  //    nel test AA generale: quello enumera schermate raggiungibili **a
  //    database vuoto**, e nessuno di loro esiste senza spese. Senza questa
  //    coda resterebbero l'unica copy dell'app che nessuna misura di contrasto
  //    tocca.
  //
  //    Le soglie sono quelle di WCAG e dipendono dalla taglia: il numero grande
  //    e' 40 px, cioe' testo grande (>= 24), quindi 3:1; la didascalia e' 13 px,
  //    quindi 4,5:1.
  const testi = await page.evaluate(() => {
    const fondo = (el: Element): string => {
      for (let p: Element | null = el; p !== null; p = p.parentElement) {
        const bg = getComputedStyle(p).backgroundColor
        if (!/,\s*0\)$/.test(bg) && bg !== 'transparent') return bg
      }
      return getComputedStyle(document.body).backgroundColor
    }
    const leggi = (sel: string, soglia: number) => {
      const el = document.querySelector(sel)
      if (el === null) throw new Error(`nessun "${sel}" in scena`)
      const stile = getComputedStyle(el)
      return {
        label: `${sel} "${(el.textContent ?? '').trim()}" ${stile.fontSize}`,
        colore: stile.color,
        dietro: fondo(el),
        soglia,
      }
    }
    return [
      leggi('.stats__hero', 3),
      // **I testi della vista `quote`**, che e' quella che si apre da sola:
      // il totale nel buco (15 px), le due voci della legenda (15 px) e le due
      // parole del comando — quella premuta su `--brand-soft`, quella spenta sul
      // fondo. Sono cinque stringhe che prima non esistevano, e quattro di loro
      // vivono su una superficie che non e' `--bg`.
      leggi('.stats__donutTotal', 4.5),
      leggi('.legend__name', 4.5),
      leggi('.legend__value', 4.5),
      leggi('.stats__view[aria-pressed="true"]', 4.5),
      leggi('.stats__view[aria-pressed="false"]', 4.5),
    ]
  })
  for (const t of testi) {
    const rapporto = arrotonda(contrasto(leggiColore(t.colore), leggiColore(t.dietro)))
    console.log(`  [${tema}] ${t.label} = ${rapporto}:1 / ${t.soglia}`)
    expect(rapporto, `${t.label} sotto la soglia AA della sua taglia`).toBeGreaterThanOrEqual(
      t.soglia,
    )
  }

  // 6. **E la didascalia della scala, che vive nell'altra vista.**
  //
  //    `stats.scale` si disegna solo dove ci sono barre da calibrare, quindi in
  //    vista `quote` non esiste: misurarla richiede di commutare, che e' cio' che
  //    farebbe chiunque voglia la classifica. Senza questa coda la didascalia
  //    resterebbe fuori da ogni misura di contrasto — che e' esattamente il buco
  //    che il punto 5 e' venuto a chiudere, riaperto da una vista nuova.
  await page.locator('.stats__view[data-vista="ordine"]').first().tap()
  const scala = await page.evaluate(() => {
    const el = document.querySelector('.stats__partScale')
    if (el === null) throw new Error('nessuna didascalia della scala nella vista a barre')
    const stile = getComputedStyle(el)
    const fondo = (n: Element): string => {
      for (let p: Element | null = n; p !== null; p = p.parentElement) {
        const bg = getComputedStyle(p).backgroundColor
        if (!/,\s*0\)$/.test(bg) && bg !== 'transparent') return bg
      }
      return getComputedStyle(document.body).backgroundColor
    }
    return {
      label: `.stats__partScale "${(el.textContent ?? '').trim()}" ${stile.fontSize}`,
      colore: stile.color,
      dietro: fondo(el),
    }
  })
  const rapportoScala = arrotonda(contrasto(leggiColore(scala.colore), leggiColore(scala.dietro)))
  console.log(`  [${tema}] ${scala.label} = ${rapportoScala}:1 / 4.5`)
  expect(rapportoScala, `${scala.label} sotto la soglia AA della sua taglia`).toBeGreaterThanOrEqual(
    4.5,
  )
})
