// Le superfici che dipingono un colore di categoria. Gira in CI, esce con
// errore se una superficie compresente mescola la tinta col fondo.
//
//   node scripts/category-surfaces.mjs        (npm run audit:surfaces)
//
// ## Perche' esiste, e perche' NON e' un secondo misuratore di ΔE
//
// Il 30 agosto una palette nuova e' passata `audit:palette` — quattro pavimenti,
// ventotto coppie, verde in millisecondi — mentre **sette superfici su dieci**
// erano sotto il pavimento percettivo. `audit:palette` misura gli esadecimali;
// il chip dipinge `color-mix(in srgb, var(--cat) 40%, var(--surface))`, e il mix
// comprime ogni distanza verso il fondo: ΔE00 15,7 fra `Trasporti` ed `Extra`
// diventava 8,99. ADR 025 aveva **gia' dichiarato** questo punto cieco — *"non
// vede un colore alterato da un'opacita' in CSS"* — e il difetto e' arrivato lo
// stesso, perche' nessuno aveva enumerato **chi consuma la palette**.
//
// La riparazione poteva essere un secondo misuratore che rifacesse le 28 coppie
// su ogni superficie. Non lo e', ed e' la parte che conta:
//
//   **Su una superficie dove piu' colori di categoria sono compresenti e devono
//   essere distinti, l'identita' non puo' essere portata da una campitura
//   mescolata.**
//
// Cosi' la classe di difetto **sparisce** invece di essere ri-tarata: il
// pavimento ΔE torna ad avere un solo ingresso — le tinte — che e' esattamente
// cio' che `audit:palette` gia' misura. Questo controllo e' su una **lista**,
// non su una matrice: non ha soglie da tarare, e non puo' degradare piano come
// fa un margine. Un margine di sei centesimi si consuma senza che nessuno se ne
// accorga; una lista o e' rispettata o non lo e'.
//
// ## Cosa guarda, e cosa NON guarda
//
// Guarda i **consumatori di `--cat` nei CSS di `src/ui`**: ogni dichiarazione il
// cui valore legge `var(--cat)`. E' un insieme sintatticamente chiuso, quindi il
// controllo puo' accorgersi di una superficie **nuova** che nessuno ha
// dichiarato — che e' il caso che ha prodotto il difetto.
//
// Non guarda le tre superfici delle Statistiche (barra di riga, pastiglia della
// legenda, tratto della fetta): quelle non passano da `--cat`, prendono la tinta
// da `fill()` in `Stats.tsx` e la dipingono cruda. Sono coperte dal controllo B
// qui sotto, che e' piu' debole per costruzione — verifica che in quel file non
// compaia nessun `color-mix` — e lo dichiara.
//
// Non guarda i pixel. Che l'aritmetica del mix corrisponda a cio' che il browser
// dipinge lo dimostra il canarino in `tests/e2e/colori.spec.ts`.

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UI = join(ROOT, 'src', 'ui')

/**
 * **L'inventario.** Una riga per superficie che legge `--cat`, mantenuta a mano.
 *
 * E' l'ingresso del controllo, non il suo risultato: chi aggiunge una superficie
 * la aggiunge qui, e finche' non lo fa il controllo fallisce dicendo che ne ha
 * trovata una che nessuno ha dichiarato. E' la stessa forma di
 * `dead-surface.mjs` — spostare il lavoro **dal ricordare al leggere**.
 *
 * `piuDiUno` e' l'unica cosa che decide l'esito, e si legge dal prodotto:
 * quante pastiglie di categoria puo' avere a schermo **nello stesso momento**
 * la schermata in cui vive questa superficie.
 */
const INVENTARIO = [
  {
    selettore: '.cat__emoji',
    proprieta: 'background-color',
    piuDiUno: true,
    dove: 'griglia Aggiungi, editor, scambio, foglio della regola — otto insieme',
  },
  {
    selettore: '.cat:active',
    proprieta: 'background-color',
    piuDiUno: false,
    dove: 'il chip sotto il dito: uno solo, e il mix e\' l\'estetica dello stato',
  },
  {
    selettore: '.fix__emoji',
    proprieta: 'background-color',
    piuDiUno: false,
    dove: 'foglio "correggi l\'importo": la sola categoria della spesa toccata',
  },
  {
    selettore: '.arch__dot,.editor__chip',
    proprieta: 'background-color',
    piuDiUno: true,
    dove: 'elenco delle categorie e archivio — un elenco che scorre',
  },
  {
    selettore: '.picker__key--color',
    proprieta: 'background-color',
    piuDiUno: true,
    dove: 'la tavolozza: otto chiavi, e distinguerle E\' il suo compito',
  },
  {
    selettore: '.picker__key--color',
    proprieta: 'border',
    piuDiUno: false,
    dove: 'il contorno della chiave: stacca dal fondo, non porta identita\'',
  },
  {
    selettore: '.mock__cat[data-on]',
    proprieta: 'background-color',
    piuDiUno: false,
    dove: 'guida: il chip finto "premuto", uno solo per illustrazione',
  },
  {
    selettore: '.mock__emoji',
    proprieta: 'background-color',
    piuDiUno: true,
    dove: 'guida: quattro pastiglie insieme, ed e\' il ritratto della griglia',
  },
]

/** Le tre superfici che non passano da `--cat`. Controllo B. */
const SENZA_CAT = {
  file: 'Stats.tsx',
  superfici: ['.stat__bar', '.legend__dot', 'circle stroke (la fetta)'],
}

// ── lettura ──────────────────────────────────────────────────────────────────

class Missing extends Error {}

/**
 * Ogni dichiarazione di un CSS di `src/ui` il cui valore legge `var(--cat)`,
 * col selettore della regola che la contiene.
 *
 * Il parsing e' volutamente minimo — niente libreria — e per questo **dichiara
 * di cadere in piedi**: se non riesce ad attribuire una dichiarazione a un
 * selettore, muore invece di attribuirla al selettore sbagliato. Una verifica
 * che non sa cosa sta guardando non e' una verifica.
 */
function leggiSuperfici() {
  const trovate = []
  for (const nome of readdirSync(UI).filter((f) => f.endsWith('.css')).sort()) {
    const testo = readFileSync(join(UI, nome), 'utf8')
    // Via i commenti: dentro ce ne sono che citano `var(--cat)` per spiegarlo.
    const senzaCommenti = testo.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    const righe = senzaCommenti.split('\n')
    let selettore = null
    let profondita = 0
    // Un selettore puo' stare su piu' righe (`.arch__dot,\n.editor__chip {`):
    // si accumula finche' non arriva la graffa, altrimenti se ne legge solo
    // l'ultima riga — che e' un nome **plausibile** e sbagliato, cioe' il modo
    // peggiore di sbagliare.
    let testa = ''
    righe.forEach((riga, i) => {
      const dichiarazione = /^\s*([a-z-]+)\s*:\s*(.+?);\s*$/.exec(riga)
      if (dichiarazione && selettore !== null && riga.includes('var(--cat)')) {
        trovate.push({
          file: nome,
          linea: i + 1,
          selettore,
          proprieta: dichiarazione[1],
          valore: dichiarazione[2].trim(),
        })
      } else if (dichiarazione === null && riga.includes('var(--cat)')) {
        throw new Missing(
          `${nome}:${i + 1} legge var(--cat) fuori da una dichiarazione su una riga: ` +
            'questo controllo non sa leggerla, e non tira a indovinare',
        )
      }
      if (riga.includes('{')) {
        profondita += 1
        const intera = (testa + ' ' + riga.slice(0, riga.indexOf('{'))).trim()
        testa = ''
        // Una regola annidata (dentro `@media`) tiene il proprio selettore.
        if (intera !== '' && !intera.startsWith('@')) {
          selettore = intera.replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ')
        }
      } else if (dichiarazione === null && riga.trim() !== '' && !riga.includes('}')) {
        // Riga che non apre, non chiude e non dichiara: e' un pezzo di
        // selettore in attesa della propria graffa.
        testa += ' ' + riga.trim()
      }
      if (riga.includes('}')) {
        profondita -= 1
        selettore = null
        testa = ''
      }
    })
    if (profondita !== 0) throw new Missing(`${nome}: le graffe non tornano (${profondita})`)
  }
  if (trovate.length === 0) {
    throw new Missing('nessun consumatore di var(--cat): la lettura e\' rotta, non l\'albero')
  }
  return trovate
}

const mescola = (valore) => valore.includes('color-mix')
const chiave = (s) => `${s.selettore} { ${s.proprieta} }`

// ── il controllo ─────────────────────────────────────────────────────────────

function audit() {
  const trovate = leggiSuperfici()
  const errori = []

  const dichiarate = new Map(INVENTARIO.map((v) => [chiave(v), v]))
  const viste = new Set()

  for (const s of trovate) {
    const k = chiave(s)
    viste.add(k)
    const v = dichiarate.get(k)
    if (v === undefined) {
      errori.push(
        `superficie NON dichiarata — ${s.file}:${s.linea}  ${k}\n` +
          '     aggiungila a INVENTARIO in questo file, dicendo quante pastiglie di\n' +
          '     categoria la sua schermata puo\' mostrare nello stesso momento.',
      )
      continue
    }
    if (v.piuDiUno && mescola(s.valore)) {
      errori.push(
        `campitura mescolata su una superficie COMPRESENTE — ${s.file}:${s.linea}  ${k}\n` +
          `     ${s.valore}\n` +
          `     ${v.dove}\n` +
          '     Il mix comprime ogni distanza verso il fondo: l\'identita\' la porta\n' +
          '     la tinta piena, `var(--cat)`.',
      )
    }
  }

  for (const [k, v] of dichiarate) {
    if (!viste.has(k)) {
      errori.push(
        `dichiarata e ASSENTE — ${k}\n` +
          `     ${v.dove}\n` +
          '     l\'inventario e\' invecchiato: togli la riga, o rimetti la superficie.',
      )
    }
  }

  // B — le tre che non passano da `--cat`.
  const stats = readFileSync(join(UI, SENZA_CAT.file), 'utf8')
  if (stats.includes('color-mix')) {
    errori.push(
      `color-mix in ${SENZA_CAT.file} — le tre superfici che prendono la tinta da fill()\n` +
        `     (${SENZA_CAT.superfici.join(', ')}) la dipingono cruda.\n` +
        '     Se il mix e\' su altro, questo controllo va reso piu\' fine invece che tolto.',
    )
  }

  return { trovate, errori }
}

// ── referto ──────────────────────────────────────────────────────────────────

function report({ trovate, errori }) {
  console.log('\n  Superfici che dipingono un colore di categoria\n')
  const larghezza = Math.max(...trovate.map((s) => chiave(s).length))
  for (const s of trovate.sort((a, b) => chiave(a).localeCompare(chiave(b)))) {
    const v = INVENTARIO.find((x) => chiave(x) === chiave(s))
    const marchio = v === undefined ? '  ?  ' : v.piuDiUno ? ' 8+  ' : '  1  '
    const forma = mescola(s.valore) ? 'mescolata' : 'tinta piena'
    console.log(
      `  ${marchio} ${chiave(s).padEnd(larghezza)}  ${forma.padEnd(12)} ${s.file}:${s.linea}`,
    )
  }
  console.log(
    `\n  ${SENZA_CAT.superfici.length} superfici in ${SENZA_CAT.file} prendono la tinta da ` +
      'fill(), senza passare da --cat.',
  )
  console.log('\n  Legenda: "8+" = piu\' di una pastiglia insieme, quindi tinta piena obbligata.\n')
  if (errori.length === 0) {
    console.log('  → ogni superficie compresente porta la tinta piena\n')
    return 0
  }
  for (const e of errori) console.log(`  [CADE] ${e}\n`)
  return 1
}

try {
  process.exit(report(audit()))
} catch (e) {
  if (e instanceof Missing) {
    console.error(`\n  scripts/category-surfaces.mjs non ha potuto misurare:\n  ${e.message}\n`)
    process.exit(2)
  }
  throw e
}
