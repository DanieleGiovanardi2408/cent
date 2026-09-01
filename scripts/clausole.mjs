// Le clausole delle condizioni di rendering: le enumera, le muta una per una, e
// riporta quali NON fanno cadere nessun test.
//
//   node scripts/clausole.mjs --lista        solo l'inventario
//   node scripts/clausole.mjs --esegui       muta e gira la suite (ore)
//
// ## Cosa cerca
//
// Per ogni condizione che decide **cosa viene disegnato**, ogni clausola deve
// avere almeno un test che cade quando quella clausola viene tolta. Una clausola
// che si puo' togliere senza rompere niente non e' verificata: o e' morta, o il
// caso che serve non e' coperto.
//
// E' la meccanizzazione di "una decisione vale dove vale il suo argomento", che
// in questo progetto e' tornata otto volte e ogni volta e' stata trovata per
// caso.
//
// ## Tutte e diciotto, e le esclusioni solo caso per caso
//
// La prima versione escludeva i ternari **forma-vs-forma** dicendo *"sono gia'
// enumerati da `statistiche.spec.ts`"*. Contati: **uno su diciotto** sta in
// `Stats.tsx`. L'argomento valeva per uno e copriva tutti — "una decisione vale
// dove vale il suo argomento" nel verso opposto al solito, applicata **piu'
// larga** di dove valeva.
//
// Quindi entrano tutte. Un'esclusione e' ammessa **caso per caso e con un nome**:
// il file e la riga del test che enumera quel caso. Niente esclusioni di classe.
//
// ## La mutazione deve COMPILARE e APPLICARSI
//
// Una clausola non si cancella: si **neutralizza** tenendo il suo valore leggibile
// (`(clausola || true)`, `(clausola && false)`), o `tsc` si ferma su `TS6133`
// prima che la suite giri e cio' che si legge e' il compilatore, non un test.
// Vedi CLAUDE.md, "Le mutazioni finte: quattro forme, un solo difetto".

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

const UI = 'src/ui'
const files = readdirSync(UI).filter((f) => f.endsWith('.tsx')).sort()

/** Un ternario JSX: la condizione, e se il ramo negativo e' nullo o e' una forma. */
function condizioni(text, file) {
  const out = []
  const lines = text.split('\n')
  // Le righe che aprono un ternario il cui ramo "vero" e' JSX o un frammento.
  const apre = /^(\s*)\{?\s*(.+?)\s\?\s*(\(|<|null)\s*$|^(\s*)\{(.+?)\s\?\s*(<[^>]*\/>)\s*:\s*(null|undefined)\s*\}\s*$/
  lines.forEach((l, i) => {
    if (/^\s*(\*|\/\/|\/\*)/.test(l)) return
    const m = apre.exec(l)
    if (m === null) return
    // Una catena `) : altraCondizione ?` e' il **ramo successivo** di un ternario
    // gia' contato, non una condizione nuova con una parentesi davanti. Si toglie
    // il `) :` iniziale invece di scartare la riga: quella condizione decide
    // eccome cosa si disegna, e scartarla sarebbe un buco nell'inventario —
    // esattamente il difetto che questo controllo cerca, dentro il controllo.
    const cond = (m[2] ?? m[5] ?? '').trim().replace(/^\)\s*:\s*/, '')
    if (cond === '' || cond.length > 200) return
    // Il ramo negativo, cercato entro venti righe.
    const blob = lines.slice(i, i + 20).join('\n')
    const nullo = /:\s*(null|undefined)[\s}),]/.test(blob)
    out.push({ file, line: i + 1, cond, forma: nullo ? 'compare-o-no' : 'forma-vs-forma' })
  })
  return out
}

/** Le clausole di una condizione: gli operandi di `&&` e `||` al livello esterno. */
function clausole(cond) {
  const parti = []
  let prof = 0
  let corrente = ''
  for (let i = 0; i < cond.length; i += 1) {
    const c = cond[i]
    if (c === '(' || c === '[') prof += 1
    if (c === ')' || c === ']') prof -= 1
    if (prof === 0 && (cond.startsWith('&&', i) || cond.startsWith('||', i))) {
      parti.push({ testo: corrente.trim(), op: cond.slice(i, i + 2) })
      corrente = ''
      i += 1
      continue
    }
    corrente += c
  }
  parti.push({ testo: corrente.trim(), op: null })
  return parti.filter((p) => p.testo !== '')
}

const inventario = []
for (const f of files) {
  const text = readFileSync(join(UI, f), 'utf8')
  for (const c of condizioni(text, f)) {
    const parti = clausole(c.cond)
    parti.forEach((p, idx) => {
      inventario.push({ ...c, clausola: p.testo, op: p.op, indice: idx, totali: parti.length })
    })
  }
}

const perForma = inventario.reduce((acc, r) => {
  acc[r.forma] = (acc[r.forma] ?? 0) + 1
  return acc
}, {})

if (process.argv.includes('--lista') || !process.argv.includes('--esegui')) {
  let ultimo = ''
  for (const r of inventario) {
    if (r.file !== ultimo) {
      console.log(`\n── ${r.file} ──`)
      ultimo = r.file
    }
    const marca = r.totali > 1 ? ` [${r.indice + 1}/${r.totali}]` : ''
    console.log(`  ${String(r.line).padStart(5)}  ${r.forma.padEnd(14)}${marca}  ${r.clausola.slice(0, 78)}`)
  }
  console.log('')
  console.log(`  condizioni: ${new Set(inventario.map((r) => r.file + ':' + r.line)).size}`)
  console.log(`  clausole:   ${inventario.length}`)
  for (const [k, v] of Object.entries(perForma)) console.log(`    ${k}: ${v}`)
  console.log('')
  process.exit(0)
}

// ------------------------------------------------------------------ esecuzione

const originali = new Map()
for (const f of files) originali.set(f, readFileSync(join(UI, f), 'utf8'))
const ripristina = () => {
  for (const [f, t] of originali) writeFileSync(join(UI, f), t)
}
process.on('SIGINT', () => {
  ripristina()
  process.exit(130)
})

const esiti = []
let n = 0
for (const r of inventario) {
  n += 1
  // Neutralizzare la clausola senza cancellarla: il suo valore resta letto.
  const neutro = r.op === '||' || (r.indice > 0 && inventario.find((x) => x.file === r.file && x.line === r.line && x.indice === r.indice - 1)?.op === '||')
    ? `(${r.clausola} && false)`
    : `(${r.clausola} || true)`
  const testo = originali.get(r.file)
  const righe = testo.split('\n')
  const riga = righe[r.line - 1]
  if (!riga.includes(r.clausola)) {
    esiti.push({ ...r, esito: 'NON APPLICATA', nota: 'la clausola non si ritrova sulla sua riga' })
    continue
  }
  righe[r.line - 1] = riga.replace(r.clausola, neutro)
  writeFileSync(join(r.file === '' ? UI : UI, r.file), righe.join('\n'))

  let esito
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' })
    try {
      execSync('npm run test:e2e', { stdio: 'pipe', timeout: 15 * 60_000 })
      esito = 'SOPRAVVIVE'
    } catch {
      esito = 'presa'
    }
  } catch {
    esito = 'NON COMPILA'
  }
  ripristina()
  esiti.push({ ...r, esito, mutazione: neutro })
  console.log(
    `[${String(n).padStart(3)}/${inventario.length}] ${esito.padEnd(13)} ${r.file}:${r.line}  ${r.clausola.slice(0, 60)}`,
  )
  writeFileSync('clausole-esiti.json', JSON.stringify(esiti, null, 2))
}

ripristina()
const vive = esiti.filter((e) => e.esito === 'SOPRAVVIVE')
console.log('')
console.log(`  ${vive.length} clausole su ${inventario.length} sopravvivono a essere neutralizzate.`)
for (const v of vive) console.log(`    ${v.file}:${v.line}  ${v.clausola}`)
console.log('')
console.log('  Referto completo in clausole-esiti.json')
