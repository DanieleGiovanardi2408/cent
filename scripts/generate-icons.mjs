// Genera le icone PWA senza dipendenze: solo `node:zlib` per il DEFLATE del PNG.
//
// Perche' a mano: sharp/resvg/playwright pesano centinaia di MB e servirebbero
// per disegnare due cerchi. Il marchio di Cent e' geometrico (il simbolo del
// centesimo: un arco aperto a destra attraversato da una barra verticale),
// quindi si rasterizza analiticamente con due SDF e antialiasing a 1px.
//
// Uso: npm run icons
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// Token condivisi con src/ui/tokens.css (--brand su tema chiaro, --text-on-brand).
const BRAND = [0x0d, 0x6b, 0x4f] // #0D6B4F
const INK = [0xff, 0xff, 0xff] // #FFFFFF

// ---------------------------------------------------------------- geometria

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n)

// Arco con estremi arrotondati, simmetrico rispetto all'asse orizzontale,
// apertura (il "morso" della C) rivolta a destra. Adattato da sdArc di IQ.
function sdArc(x, y, sinA, cosA, ra, rb) {
  // Ruota di 90 gradi: l'apertura passa dall'asse verticale a quello orizzontale.
  const u = Math.abs(y)
  const v = -x
  const d =
    cosA * u > sinA * v
      ? Math.hypot(u - sinA * ra, v - cosA * ra)
      : Math.abs(Math.hypot(u, v) - ra)
  return d - rb
}

function sdRoundBox(x, y, bx, by, r) {
  const qx = Math.abs(x) - bx + r
  const qy = Math.abs(y) - by + r
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
}

/**
 * @param {number} size lato in px
 * @param {number} glyph mezza altezza del marchio, in frazione del lato
 * @param {number} corner raggio degli angoli, in frazione del lato (0 = quadrato pieno)
 */
function draw(size, glyph, corner) {
  const px = new Float64Array(size * size * 4)
  const c = size / 2
  const G = glyph * size
  const bg = { b: c - 0.5, r: corner * size }

  // Arco: raggio mediano 0.70G, semi-spessore 0.15G, apertura di 40 gradi per lato.
  const ra = 0.7 * G
  const rb = 0.15 * G
  const half = (140 * Math.PI) / 180
  const sinA = Math.sin(half)
  const cosA = Math.cos(half)
  // Barra verticale: sporge sopra e sotto l'arco, come nel simbolo del centesimo.
  const barW = 0.15 * G
  const barH = 1.05 * G

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x + 0.5 - c
      const fy = y + 0.5 - c
      const aBg = clamp01(0.5 - sdRoundBox(fx, fy, bg.b, bg.b, bg.r))
      const aInk =
        clamp01(
          0.5 - Math.min(sdArc(fx, fy, sinA, cosA, ra, rb), sdRoundBox(fx, fy, barW, barH, barW)),
        ) * aBg

      const i = (y * size + x) * 4
      for (let ch = 0; ch < 3; ch++) {
        px[i + ch] = BRAND[ch] * aBg * (1 - aInk) + INK[ch] * aInk
      }
      px[i + 3] = aBg
    }
  }
  return px
}

// -------------------------------------------------------------------- PNG

const CRC = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC[n] = c >>> 0
}
function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, tail])
}

/** @param {Float64Array} px @param {boolean} opaque niente canale alpha (iOS lo renderebbe nero) */
function encodePng(px, size, opaque) {
  const ch = opaque ? 3 : 4
  const raw = Buffer.alloc(size * (size * ch + 1))
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0 // filtro None: le zone piatte le comprime bene comunque
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const a = px[i + 3]
      for (let k = 0; k < 3; k++) {
        // Se opaco, componiamo su BRAND: nessuna trasparenza residua.
        const v = opaque ? px[i + k] + BRAND[k] * (1 - a) : a === 0 ? 0 : px[i + k] / a
        raw[o++] = Math.round(Math.max(0, Math.min(255, v)))
      }
      if (!opaque) raw[o++] = Math.round(a * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = opaque ? 2 : 6 // RGB / RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------------- output

mkdirSync(OUT, { recursive: true })

const files = [
  // maskable: il marchio sta dentro la zona sicura (cerchio all'80% del lato).
  { name: 'icon-maskable-512.png', size: 512, glyph: 0.26, corner: 0, opaque: false },
  { name: 'icon-512.png', size: 512, glyph: 0.32, corner: 0.2232, opaque: false },
  { name: 'icon-192.png', size: 192, glyph: 0.32, corner: 0.2232, opaque: false },
  // apple-touch-icon: quadrato pieno e OPACO, la maschera la mette iOS.
  { name: 'apple-touch-icon.png', size: 180, glyph: 0.3, corner: 0, opaque: true },
]

for (const f of files) {
  const buf = encodePng(draw(f.size, f.glyph, f.corner), f.size, f.opaque)
  writeFileSync(join(OUT, f.name), buf)
  console.log(`  ${f.name.padEnd(26)} ${f.size}x${f.size}  ${(buf.length / 1024).toFixed(1)} KB`)
}

// favicon: stesso marchio, ma vettoriale e adattivo al tema della barra schede.
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Cent">
  <style>
    .bg { fill: #0D6B4F }
    .fg { fill: none; stroke: #FFFFFF; stroke-width: 6.4; stroke-linecap: round }
    @media (prefers-color-scheme: dark) {
      .bg { fill: #35C795 }
      .fg { stroke: #06221A }
    }
  </style>
  <rect class="bg" width="64" height="64" rx="14.3"/>
  <path class="fg" d="M43.9 22.0A15.5 15.5 0 1 0 43.9 42.0"/>
  <path class="fg" d="M32 11V53"/>
</svg>
`
writeFileSync(join(OUT, 'favicon.svg'), favicon)
console.log(`  ${'favicon.svg'.padEnd(26)} vettoriale`)
