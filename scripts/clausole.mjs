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
    let cond = (m[2] ?? m[5] ?? '').trim().replace(/^\)\s*:\s*/, '')
    // **Una condizione che e' essa stessa un ternario si spezza.**
    // `!ready ? null : hasBudget` non e' una clausola: e' una guardia sul guscio
    // **piu'** la condizione vera. Sostituire tutto produce
    // `(!ready ? null : hasBudget || true)`, che compila, gira, e non e' la
    // mutazione che si credeva di aver fatto — la forma 4, dentro lo strumento
    // che cerca la forma 4. Si tiene il ramo dopo l'ultimo `:`, che e' quello che
    // decide quando i dati ci sono.
    if (/\s\?\s/.test(cond)) {
      const ultimo = cond.lastIndexOf(':')
      if (ultimo === -1) return
      cond = cond.slice(ultimo + 1).trim()
    }
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
  // Se il testo della clausola compare **due volte** sulla riga, `replace`
  // colpisce la prima — che puo' non essere quella. Una mutazione applicata al
  // posto sbagliato e' peggio di una non applicata: gira, e il suo esito parla
  // di un'altra cosa. Si dichiara invece di tirare a indovinare.
  if (riga.split(r.clausola).length > 2) {
    esiti.push({ ...r, esito: 'AMBIGUA', nota: 'la clausola compare piu\' volte sulla riga' })
    continue
  }
  righe[r.line - 1] = riga.replace(r.clausola, neutro)
  writeFileSync(join(r.file === '' ? UI : UI, r.file), righe.join('\n'))

  let esito
  let nota
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' })
    try {
      execSync('npm run test:e2e', { stdio: 'pipe', timeout: 15 * 60_000 })
      esito = 'SOPRAVVIVE'
    } catch {
      esito = 'presa'
    }
  } catch (e) {
    // **Non tutti i rossi di `tsc` sono lo stesso rosso**, e la differenza decide
    // se la clausola e' verificata o se la mutazione e' da rifare.
    //
    // - **Un errore di narrowing** (`TS18047` e parenti) dice che quella clausola
    //   e' un **type guard**: il ramo che disegna legge un valore che esiste solo
    //   perche' lei l'ha ristretto. Neutralizzarla e' impossibile per
    //   costruzione, e **il compilatore e' il test**: la clausola e' verificata,
    //   piu' severamente di quanto potrebbe fare una suite.
    // - **`TS6133`** (variabile inutilizzata) dice invece che la mutazione ha
    //   reso irraggiungibile un ramo: e' la **forma 1** delle mutazioni finte, e
    //   va rifatta — quel che si legge e' il compilatore, non un test.
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
    const codici = [...new Set([...out.matchAll(/error (TS\d+)/g)].map((x) => x[1]))]
    nota = codici.join(' ')
    esito = codici.some((c) => ['TS6133', 'TS6196', 'TS6192'].includes(c))
      ? 'MUTAZIONE DA RIFARE'
      : 'verificata da tsc'
  }
  ripristina()
  esiti.push({ ...r, esito, nota, mutazione: neutro })
  console.log(
    `[${String(n).padStart(3)}/${inventario.length}] ${esito.padEnd(19)} ${r.file}:${r.line}  ${r.clausola.slice(0, 55)}${nota === undefined ? '' : '  (' + nota + ')'}`,
  )
  writeFileSync('clausole-esiti.json', JSON.stringify(esiti, null, 2))
}

ripristina()
const conta = esiti.reduce((a, e) => ({ ...a, [e.esito]: (a[e.esito] ?? 0) + 1 }), {})
console.log('')
for (const [k, v] of Object.entries(conta)) console.log(`  ${String(v).padStart(3)}  ${k}`)
console.log('')
const vive = esiti.filter((e) => e.esito === 'SOPRAVVIVE')
console.log(`  ${vive.length} clausole su ${inventario.length} sopravvivono a essere neutralizzate:`)
for (const v of vive) console.log(`    ${v.file}:${v.line}  ${v.clausola}`)
const rifare = esiti.filter((e) => e.esito === 'MUTAZIONE DA RIFARE')
if (rifare.length > 0) {
  console.log('')
  console.log(`  ${rifare.length} mutazioni da rifare (forma 1: si legge il compilatore, non un test):`)
  for (const v of rifare) console.log(`    ${v.file}:${v.line}  ${v.clausola}  (${v.nota})`)
}
console.log('')
console.log('  Referto completo in clausole-esiti.json')
