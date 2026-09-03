// Misura il peso gzip del bundle iniziale: JS + CSS, non solo JS.
// Il service worker e workbox non entrano nel budget della prima pittura
// (arrivano dopo il load) ma vengono comunque riportati, per onesta'.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, relative } from 'node:path'

const BUDGET_BYTES = 60 * 1024
const DIST = 'dist'

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

let files
try {
  files = walk(DIST)
} catch {
  console.error(`\n  ${DIST}/ non esiste. Lancia prima: npm run build\n`)
  process.exit(1)
}

/**
 * **Una misura presa su un artefatto stantio non e' una misura.**
 *
 * Questo controllo esiste perche' e' successo **tre volte in una sessione**, e
 * l'ultima ha quasi fatto passare un budget sforato: `npm run size` ha riportato
 * *"59,8 KB, rispettato"* leggendo un `dist/` piu' vecchio dei sorgenti. Il
 * numero era giusto per l'albero di mezz'ora prima, e falso per quello in mano.
 *
 * E' la stessa famiglia del **fatto rigenerato da un'esecuzione parziale**: un
 * numero che nasce gia' falso e si guadagna la fiducia **solo comparendo**,
 * perche' viene da uno script e non da una memoria. La differenza con un numero
 * scritto a mano e' che quello lo si rilegge con sospetto; questo no.
 *
 * Il rimedio e' quello che questo progetto sceglie ogni volta che puo':
 * **rendere esatta la cosa misurata invece di ricordarsi di rimisurarla.** Lo
 * script confronta la data di `dist/` con quella del sorgente piu' recente e si
 * **rifiuta** di riportare, invece di riportare un numero con un asterisco.
 *
 * Non ricostruisce da se': `vite build` costa qualche secondo e chi lancia
 * `npm run size` dentro un ciclo lo pagherebbe a ogni giro. Il messaggio dice il
 * comando, che e' uno solo.
 */
const SORGENTI = ['src', 'index.html', 'vite.config.ts', 'package.json']

function piuRecente(path) {
  const info = statSync(path)
  if (!info.isDirectory()) return info.mtimeMs
  let max = info.mtimeMs
  for (const entry of readdirSync(path)) max = Math.max(max, piuRecente(join(path, entry)))
  return max
}

const distAt = Math.max(...files.map((f) => statSync(f).mtimeMs))
let sorgentiAt = 0
for (const path of SORGENTI) {
  try {
    sorgentiAt = Math.max(sorgentiAt, piuRecente(path))
  } catch {
    // Un sorgente che non c'e' non e' un sorgente: non e' questo lo script che
    // deve dirlo.
  }
}

if (sorgentiAt > distAt) {
  const minuti = Math.round((sorgentiAt - distAt) / 60000)
  console.error(
    `\n  ${DIST}/ e' piu' vecchio dei sorgenti di ${minuti} minut${minuti === 1 ? 'o' : 'i'}.` +
      '\n  Non misuro: il numero sarebbe quello di un albero che non hai piu\'.' +
      '\n  Lancia prima: npm run build\n',
  )
  process.exit(1)
}

const isServiceWorker = (p) => /(^|\/)(sw|registerSW|workbox-[^/]+)\.js$/.test(p)
const isBundled = (p) => /\.(js|css)$/.test(p)

const rows = files
  .filter(isBundled)
  .map((path) => ({
    name: relative(DIST, path),
    sw: isServiceWorker(relative(DIST, path)),
    gzip: gzipSync(readFileSync(path)).length,
  }))
  .sort((a, b) => b.gzip - a.gzip)

const kb = (n) => `${(n / 1024).toFixed(1)} KB`
const app = rows.filter((r) => !r.sw)
const sw = rows.filter((r) => r.sw)
const total = app.reduce((sum, r) => sum + r.gzip, 0)

const print = (list) => {
  for (const r of list) console.log(`  ${r.name.padEnd(38)} ${kb(r.gzip).padStart(9)}`)
}

console.log('\n  Bundle iniziale (gzip)')
print(app)
console.log(`  ${'—'.repeat(48)}`)
console.log(`  ${'totale'.padEnd(38)} ${kb(total).padStart(9)}`)
if (sw.length) {
  console.log('\n  Service worker (fuori budget, caricato dopo)')
  print(sw)
}

const over = total > BUDGET_BYTES
console.log(
  over
    ? `\n  ✗ Budget superato: ${kb(total)} > ${kb(BUDGET_BYTES)}. Si taglia.\n`
    : `\n  ✓ Budget rispettato: ${kb(total)} / ${kb(BUDGET_BYTES)} (${kb(BUDGET_BYTES - total)} di margine)\n`,
)
process.exit(over ? 1 : 0)
