// I quattro pavimenti della palette delle categorie. Gira in CI, esce con
// errore se una tinta o una coppia cade sotto.
//
//   node scripts/palette.mjs                  (npm run audit:palette)
//   node scripts/palette.mjs --palette "#aabbcc,..."   valuta un candidato
//   node scripts/palette.mjs --json           il referto come dati
//
// ## Perche' esiste
//
// Fino alla fase 5 il colore di una categoria era ornamento: la lunghezza della
// barra portava il dato e il colore diceva soltanto "questa riga e' quella
// riga". Dalla fase 6 c'e' una **ciambella**, e li' il colore **e'** il dato:
// due fette che non si distinguono non sono due categorie, sono una fetta piu'
// grande. Un difetto di palette non si vede leggendo il codice e non lo prende
// nessun test di comportamento — si vede solo misurando.
//
// ## La palette NON e' scritta qui
//
// Si legge da `src/core/defaults.ts`, e le due superfici da `src/ui/tokens.css`.
// Una copia degli esadecimali in questo file sarebbe una seconda fonte di
// verita' che passa verde mentre il prodotto e' rotto: e' esattamente la classe
// di difetti che questo repository chiama "il numero scritto a mano che era vero
// al tempo t". Se una delle due letture non trova cio' che si aspetta, lo script
// **muore** invece di misurare qualcos'altro: una verifica che non sa cosa sta
// guardando non e' una verifica.
//
// ## La pairlist e' TUTTE le 28 coppie, e non le sole adiacenti
//
// La disciplina dei grafici distingue: **adiacenti** dove solo i vicini si
// toccano (barre impilate, linee), **tutte le coppie** dove due marche qualunque
// possono trovarsi affiancate. Per la ciambella delle Statistiche la risposta e'
// la seconda, e per tre ragioni che sono fatti dell'albero, non opinioni:
//
//  1. **la ciambella disegna solo le categorie con spese nella finestra.** Se
//     Fuori non ha spese questa settimana, Spesa e Coffeeshop diventano vicine
//     pur non essendolo nell'ordine. Con un sottoinsieme di due, **qualunque**
//     coppia diventa adiacente;
//  2. **l'ordine della griglia lo decide l'utente.** `Category.order` si modifica
//     dall'editor (`onMove` in `CategorySheet`), quindi nemmeno l'ordine e' noto
//     a build time;
//  3. **le otto attive cambiano.** Il tetto e' otto, ma quali otto lo decide chi
//     archivia e sostituisce.
//
// Fissare l'ordine di disegno **non** rende quindi l'adiacenza indipendente dai
// dati: la rende soltanto stabile finche' tutte e otto sono presenti. Solo la
// pairlist completa e' verificabile a build time — ed e' piu' severa, quindi
// passandola si passano anche le adiacenti, comunque cadano.
//
// ## I quattro pavimenti, ognuno con la sua fonte
//
// Le fonti sono la skill `dataviz`: `references/color-formula.md` § "The six
// checks" e `scripts/validate_palette.js`. I numeri sono presi da li', non a
// memoria; l'aritmetica e' riscritta qui perche' quella cartella e' temporanea.
// Il rifacimento e' verificato contro l'originale: `palette.test.ts` rimisura la
// palette precedente e ritrova, **sulla stessa pairlist**, le cifre che il
// validatore della skill aveva prodotto e che `docs/ROADMAP.md` (M4) ha
// registrato — ΔE 9,4 a vista piena, 4,3 in deuteranopia, croma minima 0,015,
// quattro tinte fuori dalla banda scura. Le cifre 8,7 e 20,3 che girano nelle
// note della fase 6 sono di un'altra pairlist, quella sulle sole adiacenti: non
// sono confrontabili con quanto misura questo script, e citarle qui sarebbe la
// forma piu' silenziosa di errore — un numero vero, dal posto sbagliato.
//
// P1 — **vista piena, ΔE >= 15**. color-formula.md § checks n.4: *"worst pair
//      ΔE >= 15, so neighbors stay easy to tell apart for full-color readers
//      too. This floor is a hard gate — secondary encoding does not excuse it."*
//      `validate_palette.js`: `NORMAL_FLOOR = 15.0`.
//
// P2 — **CVD, ΔE >= 8**. Stessa sezione: *"Target >= 8 / floor >= 6 (floor legal
//      only with secondary encoding)"*; `CVD_TARGET = 8.0`, `CVD_FLOOR = 6.0`.
//      Qui si prende **il target, non il pavimento**, e la ragione e' che il 6
//      e' condizionato — vale *"only with secondary encoding"* — e **una soglia
//      condizionata non e' verificabile da uno script**: per applicarla questo
//      file dovrebbe accertare che a schermo ci siano etichette dirette, cioe'
//      leggere l'interfaccia. Un controllo che non puo' verificare la propria
//      premessa deve prendere il numero incondizionato.
//
//      Il modello di simulazione fa parte della soglia, non e' un dettaglio:
//      Machado, Oliveira & Fernandes (2009) a severita' 1,0 — *"the thresholds
//      are calibrated to that simulation model, so the model is part of the
//      standard"*.
//
//      **Estensione nostra, dichiarata**: la skill mette il cancello su protan e
//      deutan e si limita a *riportare* tritan. Qui tritan e' dentro il cancello,
//      con lo stesso 8 — che pero' e' un numero **calibrato su protan/deutan** e
//      prestato. Non e' una soglia con una fonte per la tritanopia: e' la stessa
//      soglia applicata a una terza vista, ed e' onesto dirlo. Costa poco
//      (l'ultima palette la passa con 8,6) e toglie un caso non guardato.
//
// P3 — **croma OKLCH >= 0,10**. § checks n.3: *"OKLCH C >= ~0.10 — below it a hue
//      reads as gray and stops doing identity work"*. `CHROMA_FLOOR = 0.10`.
//
// P4 — **banda di luminosita' OKLCH, nei due temi**. § checks n.2: *"OKLCH L ≈
//      0.43–0.77 light; ≈ 0.48–0.67 dark"*. `BAND` nel validatore.
//
//      `Category.color` e' **un campo solo** e i colori sono dati dell'utente,
//      quindi non esistono due colonne come nella palette di riferimento: la
//      stessa tinta viene disegnata su tutti e due i fondi. La conseguenza e'
//      che P4 si soddisfa nell'**intersezione** delle due bande, [0,48 · 0,67],
//      e la verifica resta scritta come due controlli distinti — se un giorno
//      esistessero due colonne, il controllo e' gia' quello giusto.
//
// ## Il contrasto sulla superficie si MISURA e non si sbarra
//
// Il quinto controllo della skill — marca >= 3:1 sul fondo — e' dichiarato dalla
// skill stessa *"conditionally relaxed where values are readable another way
// (visible labels or the table view)"*, e in questa app la condizione e'
// soddisfatta e documentata: ogni riga porta nome e importo accanto alla barra,
// e ogni barra porta un contorno (`Stats.tsx`). Sbarrarlo qui vorrebbe dire
// rifiutare una palette per una ragione che il prodotto ha gia' risolto; tacerlo
// vorrebbe dire perdere l'unico posto in cui il numero e' misurato. Quindi si
// stampa, sempre, e non decide l'uscita.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── soglie ────────────────────────────────────────────────────────────────────
const NORMAL_FLOOR = 15.0 // ΔE OKLab ×100, vista piena
const CVD_FLOOR = 8.0 // ΔE OKLab ×100, sotto simulazione
const CHROMA_FLOOR = 0.1 // croma OKLCH
const BAND = { chiaro: [0.43, 0.77], scuro: [0.48, 0.67] } // luminosita' OKLCH
const CONTRAST_REF = 3.0 // solo per il referto: non sbarra
const SIMS = ['protan', 'deutan', 'tritan']

// Machado, Oliveira & Fernandes (2009), severita' 1,0, su RGB lineare.
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868],
           [0.114503, 0.786281, 0.099216],
           [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968],
           [0.280085, 0.672501, 0.047413],
           [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779],
           [-0.078411, 0.930809, 0.147602],
           [0.004733, 0.691367, 0.303900]],
}

// ── aritmetica ────────────────────────────────────────────────────────────────
const HEX = /^#[0-9a-fA-F]{6}$/

const srgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i + 1, i + 3), 16) / 255)
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linear = (hex) => srgb(hex).map(toLinear)

/** OKLab da RGB lineare. Le costanti sono quelle di Björn Ottosson. */
function oklabFromLinear([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ]
}
const oklab = (hex) => oklabFromLinear(linear(hex))
/** [L, C] in OKLCH. La tinta non serve a nessuno dei quattro controlli. */
function oklch(hex) {
  const [L, a, b] = oklab(hex)
  return [L, Math.hypot(a, b)]
}

function simulate(hex, kind) {
  const [r, g, b] = linear(hex)
  const M = MACHADO[kind]
  const clamp = (c) => Math.max(0, Math.min(1, c))
  return [
    clamp(M[0][0] * r + M[0][1] * g + M[0][2] * b),
    clamp(M[1][0] * r + M[1][1] * g + M[1][2] * b),
    clamp(M[2][0] * r + M[2][1] * g + M[2][2] * b),
  ]
}

/** Distanza euclidea in OKLab ×100. `kind` assente = vista piena. */
function deltaE(a, b, kind) {
  const [l1, a1, b1] = oklabFromLinear(kind ? simulate(a, kind) : linear(a))
  const [l2, a2, b2] = oklabFromLinear(kind ? simulate(b, kind) : linear(b))
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = linear(hex)
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// ── letture dall'albero ───────────────────────────────────────────────────────
class Missing extends Error {}

/**
 * Le otto tinte di default, lette da `src/core/defaults.ts`.
 *
 * Il nome dello slot esce dalla stessa riga del colore: un elenco parallelo di
 * nomi in questo file direbbe "Casa" indicando Extra il giorno in cui l'ordine
 * dei default cambiasse — lo stesso difetto per cui `COLOR_NAMES` in
 * `CategorySheet` e' indicizzata sull'esadecimale e non sulla posizione.
 */
function readDefaults() {
  const src = readFileSync(join(ROOT, 'src/core/defaults.ts'), 'utf8')
  const block = src.match(/DEFAULT_CATEGORY_SEEDS[^=]*=\s*\[([\s\S]*?)\n\]/)
  if (!block) throw new Missing('src/core/defaults.ts: DEFAULT_CATEGORY_SEEDS non trovato')
  const seeds = [...block[1].matchAll(/key:\s*'([^']+)'[^}]*?color:\s*'(#[0-9a-fA-F]{6})'/g)]
    .map(([, name, hex]) => ({ name, hex: hex.toLowerCase() }))
  if (seeds.length !== 8) {
    throw new Missing(`src/core/defaults.ts: attese 8 tinte, lette ${seeds.length}`)
  }
  return seeds
}

/**
 * Le due superfici, lette da `src/ui/tokens.css`: il primo `--bg` e' il tema
 * chiaro, il secondo quello scuro (blocco `prefers-color-scheme: dark`).
 *
 * Se non sono **esattamente due** lo script muore. Prendere "il primo che
 * capita" vorrebbe dire misurare il contrasto contro un fondo che non esiste e
 * stampare un numero plausibile: un referto sbagliato e' peggio di nessun
 * referto.
 */
function readSurfaces() {
  const css = readFileSync(join(ROOT, 'src/ui/tokens.css'), 'utf8')
  const bgs = [...css.matchAll(/--bg:\s*(#[0-9a-fA-F]{6})/g)].map(([, hex]) => hex.toLowerCase())
  if (bgs.length !== 2) {
    throw new Missing(`src/ui/tokens.css: attesi 2 valori di --bg, letti ${bgs.length}`)
  }
  return { chiaro: bgs[0], scuro: bgs[1] }
}

// ── i quattro controlli ───────────────────────────────────────────────────────
export function audit(slots, surfaces) {
  const n = slots.length
  const pairs = []
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push([slots[i], slots[j]])

  const p1 = pairs
    .map((p) => ({ a: p[0], b: p[1], value: deltaE(p[0].hex, p[1].hex) }))
    .sort((x, y) => x.value - y.value)

  const p2 = pairs
    .map(([a, b]) => {
      const worst = SIMS
        .map((kind) => ({ kind, value: deltaE(a.hex, b.hex, kind) }))
        .reduce((lo, cur) => (cur.value < lo.value ? cur : lo))
      return { a, b, ...worst }
    })
    .sort((x, y) => x.value - y.value)

  const p3 = slots
    .map((s) => ({ slot: s, value: oklch(s.hex)[1] }))
    .sort((x, y) => x.value - y.value)

  const p4 = Object.entries(BAND).flatMap(([theme, [lo, hi]]) =>
    slots.map((s) => {
      const L = oklch(s.hex)[0]
      return { theme, slot: s, value: L, ok: L >= lo && L <= hi, lo, hi }
    }),
  )

  const contrasts = Object.entries(surfaces).flatMap(([theme, bg]) =>
    slots.map((s) => ({ theme, slot: s, value: contrast(s.hex, bg) })),
  )

  return {
    p1: { floor: NORMAL_FLOOR, rows: p1, failures: p1.filter((r) => r.value < NORMAL_FLOOR) },
    p2: { floor: CVD_FLOOR, rows: p2, failures: p2.filter((r) => r.value < CVD_FLOOR) },
    p3: { floor: CHROMA_FLOOR, rows: p3, failures: p3.filter((r) => r.value < CHROMA_FLOOR) },
    p4: { band: BAND, rows: p4, failures: p4.filter((r) => !r.ok) },
    contrasts,
  }
}

// ── referto ───────────────────────────────────────────────────────────────────
const pair = (r) => `${r.a.name} ↔ ${r.b.name}`
const num = (v, d = 1) => v.toFixed(d)

function report(result, slots, surfaces) {
  const out = []
  const say = (s) => out.push(s)

  say('')
  say(`Palette delle categorie — ${slots.length} tinte, tutte le ${(slots.length * (slots.length - 1)) / 2} coppie`)
  say(`superfici: chiaro ${surfaces.chiaro} · scuro ${surfaces.scuro}`)
  say('')
  for (const s of slots) {
    const [L, C] = oklch(s.hex)
    const cr = Object.keys(surfaces).map((t) =>
      num(result.contrasts.find((c) => c.theme === t && c.slot === s).value, 2))
    say(`  ${s.name.padEnd(12)} ${s.hex}   L ${num(L, 3)}   C ${num(C, 3)}   contrasto ${cr[0]}:1 / ${cr[1]}:1`)
  }

  const { p1, p2, p3, p4 } = result
  const mark = (ok) => (ok ? 'PASSA' : 'CADE ')

  say('')
  say(`  [${mark(!p1.failures.length)}] P1 vista piena      ΔE >= ${num(p1.floor, 0)}`)
  say(`          peggiore: ${pair(p1.rows[0])} ΔE ${num(p1.rows[0].value)}`)
  for (const f of p1.failures) say(`          CADE: ${pair(f)} ΔE ${num(f.value)}`)

  say(`  [${mark(!p2.failures.length)}] P2 CVD              ΔE >= ${num(p2.floor, 0)} su protan, deutan, tritan`)
  say(`          peggiore: ${pair(p2.rows[0])} ΔE ${num(p2.rows[0].value)} (${p2.rows[0].kind})`)
  for (const f of p2.failures) say(`          CADE: ${pair(f)} ΔE ${num(f.value)} (${f.kind})`)

  say(`  [${mark(!p3.failures.length)}] P3 croma            C >= ${num(p3.floor, 2)}`)
  say(`          minima: ${p3.rows[0].slot.name} C ${num(p3.rows[0].value, 3)}`)
  for (const f of p3.failures) say(`          CADE: ${f.slot.name} ${f.slot.hex} C ${num(f.value, 3)}`)

  const bands = Object.entries(p4.band).map(([t, [lo, hi]]) => `${t} ${lo}–${hi}`).join(' · ')
  say(`  [${mark(!p4.failures.length)}] P4 luminosita'      L dentro la banda: ${bands}`)
  for (const f of p4.failures) {
    say(`          CADE: ${f.slot.name} ${f.slot.hex} L ${num(f.value, 3)} fuori da ${f.lo}–${f.hi} (${f.theme})`)
  }

  // Misurato e non sbarrato: la condizione di rilassamento e' soddisfatta nel
  // prodotto (etichetta e contorno su ogni riga), quindi il numero informa e
  // non decide. Vedi l'intestazione.
  const sotto = result.contrasts.filter((c) => c.value < CONTRAST_REF)
  say(`  [misura] contrasto sul fondo   ${sotto.length} tinte sotto ${num(CONTRAST_REF, 0)}:1 — rilassato: etichetta e contorno su ogni riga`)
  for (const c of sotto) say(`          ${c.slot.name} ${c.slot.hex} ${num(c.value, 2)}:1 (${c.theme})`)

  const ok = ![p1, p2, p3, p4].some((c) => c.failures.length)
  say('')
  say(ok ? '  → i quattro pavimenti reggono' : "  → CADUTA: ripara cio' che e' marcato CADE")
  say('')
  return { text: out.join('\n'), ok }
}

// ── entrata ───────────────────────────────────────────────────────────────────
const invoked = process.argv[1] && process.argv[1].endsWith('palette.mjs')
if (invoked) {
  try {
    const raw = process.argv.find((a) => a.startsWith('--palette'))
    let slots
    if (raw) {
      // Una palette candidata dalla riga di comando: e' il modo di valutare
      // otto tinte **prima** di scriverle nei default, che e' come sono state
      // scelte quelle attuali. Prende il posto dei default, non li tocca.
      const value = raw.includes('=') ? raw.slice(raw.indexOf('=') + 1) : process.argv[process.argv.indexOf(raw) + 1]
      const hexes = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      const bad = hexes.filter((h) => !HEX.test(h))
      if (!hexes.length || bad.length) {
        console.error(`--palette: attesi esadecimali #rrggbb separati da virgola${bad.length ? ` — non validi: ${bad.join(', ')}` : ''}`)
        process.exit(2)
      }
      slots = hexes.map((hex, i) => ({ name: `slot ${i + 1}`, hex: hex.toLowerCase() }))
    } else {
      slots = readDefaults()
    }
    const surfaces = readSurfaces()
    const result = audit(slots, surfaces)
    if (process.argv.includes('--json')) {
      const plain = {
        slots,
        p1: { floor: result.p1.floor, worst: result.p1.rows[0].value, failures: result.p1.failures.length },
        p2: { floor: result.p2.floor, worst: result.p2.rows[0].value, kind: result.p2.rows[0].kind, failures: result.p2.failures.length },
        p3: { floor: result.p3.floor, min: result.p3.rows[0].value, failures: result.p3.failures.length },
        p4: { band: result.p4.band, failures: result.p4.failures.map((f) => ({ hex: f.slot.hex, L: f.value, theme: f.theme })) },
        contrasts: result.contrasts.map((c) => ({ hex: c.slot.hex, theme: c.theme, value: c.value })),
      }
      const ok = ![result.p1, result.p2, result.p3, result.p4].some((c) => c.failures.length)
      console.log(JSON.stringify({ ...plain, ok }))
      process.exit(ok ? 0 : 1)
    }
    const { text, ok } = report(result, slots, surfaces)
    console.log(text)
    process.exit(ok ? 0 : 1)
  } catch (error) {
    // Una lettura andata a vuoto non e' una palette che passa: e' uno script che
    // non sa cosa sta guardando. Esce 2, distinto dall'1 di una caduta vera.
    console.error(error instanceof Missing ? `palette: ${error.message}` : error)
    process.exit(2)
  }
}
