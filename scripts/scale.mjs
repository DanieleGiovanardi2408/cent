// Le due scale dichiarate: spaziatura e tipografia.
//
//   node scripts/scale.mjs           (npm run audit:scale)
//   node scripts/scale.mjs --json    il referto come dati
//
// ## Perche' esiste
//
// Una scala e' una scala solo se **e' l'unica**. Un valore letterale accanto a
// una scala dichiarata non e' un'eccezione: e' una seconda scala, piu' piccola,
// che nessuno ha dichiarato e che cresce di un gradino ogni volta che qualcuno
// ha fretta. Il costo non e' estetico — e' che la scala dichiarata smette di
// essere la risposta alla domanda *"quanto spazio ci va qui?"*, e allora la
// domanda torna a essere aperta ogni volta.
//
// ## I due controlli hanno due esiti diversi, ed e' una calibrazione
//
// **G1 fallisce. G2 avvisa.** E' la riga di CLAUDE.md — *un controllo fallisce
// quando la riparazione e' meccanica, avvisa quando richiede un giudizio* —
// applicata qui:
//
//  - **G1** ha una scala chiusa e un rimedio meccanico: il valore o sta sui
//    gradini dichiarati, o e' un'altra grandezza e allora prende un token suo
//    (e' cosi' che e' nato `--seam`). Bloccare non costa niente a nessuno.
//  - **G2** trova taglie che possono essere un difetto **o** una grandezza
//    diversa travestita da font-size: cinque delle nove trovate il 2 settembre
//    dimensionavano una **emoji dentro una pastiglia**, che e' un rapporto con
//    un diametro e non un gradino di una rampa di lettura. Bloccare su quello
//    si aggira con `--no-verify` il terzo giorno.
//
// **Nessuno dei due e' stato reso bloccante prima di aver guardato cio' che
// trovava.** Un controllo acceso su un albero mai misurato fa fallire la CI su
// un disaccordo di gusto, e a quel punto si allarga la maglia invece di
// riparare il codice — cioe' il modo in cui una guardia muore.
//
// ## Il tetto di cinque taglie e' stato RITIRATO, e la ragione vale piu' del numero
//
// La prima forma di G2 chiedeva *"al massimo cinque taglie come token"*. Quel
// cinque era **inventato**: nessuna misura lo produceva, e la rampa vera ne ha
// otto — 13/15/17/20/28/40 piu' due fluide — che e' una progressione sensata.
// Un controllo che dichiara violazione una scelta che nessuno ha argomentato
// contro insegna a non credergli.
//
// L'invariante non e' **quante** taglie ci sono: e' che la rampa sia **chiusa**.
// L'insieme dei token dichiarati e' la rampa, qualunque sia il suo numero, e
// niente vive fuori da li'. Cosi' il controllo misura una proprieta' vera
// dell'albero invece di un'opinione sul numero giusto.
//
// Il limite dell'ago, dichiarato: legge il **testo** del CSS, non lo stile
// calcolato. Un valore che arriva da una `var()` di un altro modulo lo vede
// come token, e non sa dire se quel token e' nella scala. Prende il caso che
// conta — il numero scritto a mano dentro una regola — e non pretende altro.
//
// ## Le due scale, lette e non scritte
//
// La verita' e' `src/ui/tokens.css`. Una copia dei valori qui dentro sarebbe la
// seconda fonte che passa verde mentre il prodotto e' rotto: se la lettura non
// trova cio' che si aspetta, lo script **muore** invece di misurare altro.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const UI = 'src/ui'
const TOKENS = join(UI, 'tokens.css')

const json = process.argv.includes('--json')

/** rem → px, l'unica conversione di cui questo script ha bisogno. */
const REM = 16

function toPx(value) {
  const m = /^(-?[0-9]*\.?[0-9]+)(px|rem|em)$/.exec(value.trim())
  if (m === null) return null
  const n = Number(m[1])
  if (m[2] === 'px') return n
  if (m[2] === 'rem') return n * REM
  return null // `em` dipende dal contesto: non lo si converte, lo si dichiara ignoto
}

const round = (n) => Math.round(n * 100) / 100

// ---------------------------------------------------------------- le fonti

const tokens = readFileSync(TOKENS, 'utf8')

const files = readdirSync(UI)
  .filter((f) => f.endsWith('.css'))
  .sort()
  .map((f) => ({ name: join(UI, f), text: readFileSync(join(UI, f), 'utf8') }))

/**
 * Le righe di ogni file **senza i commenti**.
 *
 * Un blocco `/* … *\/` di questo repository contiene misure scritte in px —
 * `3,19:1`, `61,75 px`, `min-block-size: var(--tap-min)` citato in prosa — e
 * contarle sarebbe misurare la documentazione invece del codice. Si azzerano i
 * caratteri dei commenti tenendo i newline, cosi' i numeri di riga restano veri.
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

for (const f of files) f.code = stripComments(f.text)

// ------------------------------------------------- G1 · una sola spaziatura

/**
 * Le dichiarazioni di un file, **ovunque stiano sulla riga**.
 *
 * La prima forma di questo scanner leggeva riga per riga con `^\\s*prop:` e la
 * mutazione di prova — `.x { padding-block: 7px }`, tutto su una riga — le e'
 * passata davanti senza che se ne accorgesse. Era un controllo che **non poteva
 * fallire** su una forma di CSS perfettamente valida, cioe' la cosa peggiore di
 * un controllo assente: un controllo assente non mente.
 *
 * Adesso si scorre il testo intero e il numero di riga si ricava dall'offset,
 * cosi' la posizione resta vera e la forma della riga non conta piu'.
 */
function declarations(code) {
  const out = []
  const re = /(^|[;{}])\s*(-{0,2}[a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([^;{}]+)/g
  for (const m of code.matchAll(re)) {
    out.push({
      prop: m[2],
      value: m[3].trim(),
      line: code.slice(0, m.index).split('\n').length + (m[1] === '' ? 0 : 0),
      at: m.index + m[0].length - m[3].length,
    })
  }
  // La riga si conta sull'offset del **valore**: una dichiarazione spezzata su
  // piu' righe si attribuisce a dove sta il numero, non a dove sta il nome.
  for (const d of out) d.line = code.slice(0, d.at).split('\n').length
  return out
}

// Le proprieta' di **spazio fra le cose**. Le misure di un oggetto
// (`block-size`, `inline-size`) sono un'altra domanda: un tastierino alto
// `--key-h` non sta sbagliando scala, sta dichiarando una geometria.
const GAPS = new Set([
  'margin', 'padding', 'gap', 'row-gap', 'column-gap',
  'inset', 'top', 'right', 'bottom', 'left',
])

const isGap = (prop) => {
  if (prop.startsWith('--')) return false
  if (GAPS.has(prop)) return true
  // `margin-inline-start`, `padding-block`, `inset-block-end`: la radice decide.
  const root = prop.replace(/^-webkit-/, '').split('-')[0]
  return GAPS.has(root)
}

const spScale = []
for (const m of tokens.matchAll(/--sp-(\d+)\s*:\s*([^;]+);/g)) {
  const px = toPx(m[2])
  if (px === null) throw new Error(`--sp-${m[1]} non e' una lunghezza assoluta: ${m[2]}`)
  spScale.push({ name: `--sp-${m[1]}`, raw: m[2].trim(), px })
}
if (spScale.length === 0) throw new Error(`nessun --sp-* in ${TOKENS}: la scala non e' dove la si cerca`)

const spOffScale = spScale.filter((t) => t.px % 4 !== 0)

const LENGTH = /(-?[0-9]*\.?[0-9]+)(px|rem|em)\b/g

const g1 = []
for (const f of files) {
  if (f.name === TOKENS) continue
  for (const d of declarations(f.code)) {
    if (!isGap(d.prop)) continue
    for (const l of d.value.matchAll(LENGTH)) {
      const px = toPx(l[0])
      if (px === 0) continue
      g1.push({
        file: f.name,
        line: d.line,
        prop: d.prop,
        value: l[0],
        px: px === null ? null : round(px),
        onScale: px !== null && spScale.some((t) => t.px === Math.abs(px)),
      })
    }
  }
}

// --------------------------------------------------- G2 · una sola rampa

const fsScale = []
// `[a-z0-9-]` e non `[a-z0-9]`: la prima forma non prendeva `--fs-cat-narrow`,
// che quindi veniva **accettato come lettore** (il controllo guarda il prefisso
// `var(--fs-`) e **non elencato nella rampa**. Un referto che accetta cio' che
// non dichiara e' incoerente in un verso solo — quello permissivo.
for (const m of tokens.matchAll(/--fs-([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  fsScale.push({ name: `--fs-${m[1]}`, raw: m[2].trim(), px: toPx(m[2]) })
}
if (fsScale.length === 0) throw new Error(`nessun --fs-* in ${TOKENS}`)

const g2 = []
for (const f of files) {
  if (f.name === TOKENS) continue
  for (const d of declarations(f.code)) {
    if (d.prop !== 'font-size') continue
    const v = d.value
    if (v === 'inherit' || v.startsWith('var(--fs-')) continue
    // **Un token avvolto in `min()` non e' una taglia nuova.** `min(var(--fs-300),
    // 4.4vw)` e' il gradino 300 col suo tetto per i viewport stretti: la scala
    // e' la stessa, ed e' la forma con cui questa app fa cedere il testo invece
    // di farlo traboccare. Contarlo come violazione seppellirebbe i numeri
    // scritti a mano — che sono il caso che questo controllo cerca — sotto una
    // maggioranza di casi legittimi, ed e' il modo in cui un referto smette di
    // essere letto.
    const derivato = /var\(--fs-/.test(v)
    const px = toPx(v)
    const twin = px === null ? undefined : fsScale.find((t) => t.px === px)
    g2.push({
      file: f.name,
      line: d.line,
      value: v,
      px: px === null ? null : round(px),
      twin: twin?.name,
      derivato,
    })
  }
}

// ------------------------------------------------------------- il referto

const referto = {
  g1: {
    scala: spScale.map((t) => ({ ...t })),
    fuoriMultiplo: spOffScale.map((t) => t.name),
    letturali: g1.filter((v) => !v.onScale),
    coincidenti: g1.filter((v) => v.onScale),
  },
  g2: {
    rampa: fsScale.map((t) => ({ ...t })),
    scritte: g2.filter((v) => !v.derivato),
    tetti: g2.filter((v) => v.derivato),
  },
}

if (json) {
  console.log(JSON.stringify(referto, null, 2))
  process.exit(0)
}

const pad = (s, n) => String(s).padEnd(n)
console.log('')
console.log('  G1. Una sola scala di spaziatura — multipli di 4 da un insieme dichiarato')
console.log(
  `     scala: ${spScale.map((t) => `${t.name}=${round(t.px)}px`).join(' · ')}`,
)
if (spOffScale.length > 0) {
  console.log(`     ⚠ fuori dal multiplo di 4: ${spOffScale.map((t) => t.name).join(', ')}`)
} else {
  console.log('     ogni gradino dichiarato e\' un multiplo di 4.')
}
const fuori = referto.g1.letturali
if (fuori.length === 0) {
  console.log('     nessuna violazione: ogni spaziatura letterale sta sulla scala.')
} else {
  console.log(`     ${fuori.length} valori letterali fuori scala:`)
  for (const v of fuori) {
    console.log(
      `       ${pad(`${v.file}:${v.line}`, 30)} ${pad(v.prop, 14)} ${pad(v.value, 8)} ${
        v.px === null ? '(relativa)' : `${v.px}px`
      }`,
    )
  }
}
if (referto.g1.coincidenti.length > 0) {
  console.log(
    `     (${referto.g1.coincidenti.length} letterali che cadono su un gradino: ` +
      `${referto.g1.coincidenti.map((v) => `${v.file}:${v.line}`).join(', ')})`,
  )
}

console.log('')
console.log('  G2. Una sola rampa tipografica — chiusa: niente vive fuori dai token')
console.log(`     rampa: ${fsScale.length} token`)
for (const t of fsScale) {
  console.log(`       ${pad(t.name, 14)} ${pad(t.raw, 30)} ${t.px === null ? '(variabile)' : `${round(t.px)}px`}`)
}
const scritti = g2.filter((v) => !v.derivato)
const derivati = g2.filter((v) => v.derivato)
if (scritti.length === 0) {
  console.log('     nessuna violazione: ogni font-size viene da un token.')
} else {
  console.log(`     ${scritti.length} taglie scritte a mano, fuori dalla rampa:`)
  for (const v of scritti) {
    console.log(
      `       ${pad(`${v.file}:${v.line}`, 30)} ${pad(v.value, 12)} ${
        v.px === null ? '(relativa)' : `${v.px}px`
      }${v.twin === undefined ? '' : `  = ${v.twin}, gia' nella rampa`}`,
    )
  }
}
if (derivati.length > 0) {
  console.log(`     (${derivati.length} tetti su un token della rampa, che non sono taglie nuove:`)
  for (const v of derivati) {
    console.log(`       ${pad(`${v.file}:${v.line}`, 30)} ${v.value}`)
  }
  console.log('      )')
}
console.log('')
if (fuori.length > 0 || spOffScale.length > 0) {
  console.log(`  ✗ G1: ${fuori.length + spOffScale.length} violazioni. La scala di spaziatura non e' una sola.`)
  console.log('')
  process.exit(1)
}
console.log('  ✓ G1 passa. G2 e\' una misura e non fa fallire niente: le sue righe si leggono.')
console.log('')
