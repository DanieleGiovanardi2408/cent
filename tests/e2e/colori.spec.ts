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

  // `--over` colora testo **e** barra, quindi vale due volte: come testo deve
  // stare sopra AA (sopra), come superficie deve staccarsi dalla traccia in cui
  // sta — 3:1, la soglia dei componenti non testuali (WCAG 1.4.11).
  const barra = await page.evaluate(() => {
    const fill = document.querySelector('.track__fill') ?? document.querySelector('.track > *')
    const track = document.querySelector('.track')
    if (fill === null || track === null) return null
    return {
      pieno: getComputedStyle(fill).backgroundColor,
      traccia: getComputedStyle(track).backgroundColor,
      fondo: getComputedStyle(document.body).backgroundColor,
    }
  })
  expect(barra, 'la barra del progresso non e\' in pagina').not.toBeNull()
  if (barra !== null) {
    const base = leggiColore(barra.fondo)
    const pieno = sovrapponi(leggiColore(barra.pieno), base)
    const traccia = sovrapponi(leggiColore(barra.traccia), base)
    const rapporto = arrotonda(contrasto(pieno, traccia))
    console.log(`  [${tema}] barra: ${scrivi(pieno)} su ${scrivi(traccia)} = ${rapporto}:1`)
    expect(rapporto, 'la barra dello sforo non si stacca dalla traccia').toBeGreaterThanOrEqual(3)
  }

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
