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
