// Cerca dati di archivi **veri** dentro l'albero e dentro la storia.
//
//   CENT_BACKUP=~/Downloads npm run audit:dati-veri
//   CENT_BACKUP=~/Downloads/cent-2026-08-26.json npm run audit:dati-veri
//
// ## L'incidente che l'ha prodotto
//
// La regola *"i dati veri non si committano mai"* esisteva, scritta in due
// posti, e il 23 agosto 2026 e' stata violata: due id di spese reali, un
// importo, l'ora d'inserimento e **il nome di un negozio** sono finiti in un
// commento di `scripts/audit.mjs`, in un repository pubblico.
//
// Il modo in cui e' successa e' l'unica parte che conta. Non e' stata
// sbadataggine: il commit che l'ha introdotta ha *"dai dati d'uso"* nel proprio
// titolo, ed era **buon lavoro** — un caso vero, studiato su un backup vero, e
// scritto nel posto sbagliato. La regola c'era, e chiedeva di ricordarsene nel
// momento in cui si stava pensando a tutt'altro.
//
// > Una regola che dipende dal fatto che qualcuno se la ricordi mentre sta
// > pensando ad altro non e' una regola: e' una speranza.
//
// Ha due riparazioni, e servono tutte e due. La prima e' `docs/demo.json`:
// materiale realistico che si puo' citare, cosi' la scorciatoia verso i dati
// veri smette di essere l'unica strada. La seconda e' questo file.
//
// ## Il limite, che va letto prima del comando
//
// **NON PUO' GIRARE IN CI.** La CI non ha i backup, non li avra' mai, e il
// giorno in cui li avesse sarebbe il difetto piu' grande di tutti quelli che
// questo script cerca.
//
// E' quindi un **fatto derivabile solo qui**, nella stessa forma gia' scritta in
// CLAUDE.md per lo spazio libero sul disco: derivabile **su questa macchina**,
// non derivabile allo stesso valore ovunque. La divisione di quel documento —
// *"fra derivabile allo stesso valore ovunque e derivabile qui"* — decide dove
// un controllo puo' vivere, e questo sta di qua.
//
// Conseguenza operativa, che e' l'unica cosa da ricordare: **e' un controllo
// pre-rilascio, locale, e va lanciato prima di dire a qualcuno "guarda qui".**
// Un verde di questo script non e' un verde della CI e non lo sara' mai.
//
// ## Il percorso dei backup non si scrive da nessuna parte
//
// Arriva da `CENT_BACKUP`, e non ha un default. Scriverlo in un file — anche
// solo come valore di comodo — sarebbe la stessa famiglia del difetto che
// questo script cerca: il percorso assoluto di chi sviluppa, committato.
//
// ## Cosa cerca, e perche' non e' un elenco di stringhe proibite
//
// Legge i backup veri **adesso**, ne estrae gli aghi, e cerca quelli. Un elenco
// scritto a mano coprirebbe cio' che qualcuno ha pensato di scriverci il giorno
// in cui l'ha scritto; questo copre cio' che c'e' davvero nell'archivio oggi.

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const sorgente = process.env['CENT_BACKUP']
if (sorgente === undefined || sorgente === '') {
  console.error(
    '\n  audit:dati-veri — cerca dati di archivi veri nell\'albero e nella storia.\n\n' +
      '  uso:  CENT_BACKUP=~/Downloads npm run audit:dati-veri\n' +
      '        CENT_BACKUP=<un file .json> npm run audit:dati-veri\n\n' +
      '  Il percorso arriva da una variabile d\'ambiente e non ha un default:\n' +
      '  scriverlo in un file sarebbe la stessa famiglia del difetto che cerca.\n\n' +
      '  Non gira in CI: la CI non ha i backup, e non deve averli. E\' un\n' +
      '  controllo pre-rilascio locale.\n',
  )
  process.exit(2)
}

function fileDiBackup(percorso) {
  const s = statSync(percorso, { throwIfNoEntry: false })
  if (s === undefined) throw new Error(`percorso inesistente: ${percorso}`)
  if (s.isFile()) return [percorso]
  return readdirSync(percorso)
    .filter((n) => n.startsWith('cent') && n.endsWith('.json'))
    .map((n) => join(percorso, n))
}

/**
 * **Solo gli id che identificano davvero qualcosa**, cioe' gli UUID.
 *
 * La prima stesura cercava ogni id, e il referto era inutilizzabile: i backup
 * veri portano ancora dei record delle prime fasi con id come `exp-0` e
 * `cat-1`, che combaciano con `package-lock.json`, con le fixture dei test e
 * con meta' albero. Centosei aghi, quasi tutti falsi.
 *
 * Un controllo che grida al lupo viene disattivato il terzo giorno — e' la
 * calibrazione gia' scritta per l'hook pre-commit e per G2 — e uno che cerca
 * `cat-1` non protegge nessuno: **`cat-1` non dice niente di nessuno.** Cio'
 * che identifica una persona e' l'UUID, che e' quello che era davvero finito in
 * un commento.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Gli aghi: gli id UUID e le note di ogni record di ogni backup.
 *
 * Gli **importi da soli non si cercano**, ed e' la stessa calibrazione: un
 * importo e' un numero, e `2500` compare in una costante, in un test, in un
 * anno. Nella forma in cui i dati veri finiscono davvero in un commento — un
 * record **raccontato** — c'e' sempre un id o una nota accanto alla cifra, ed e'
 * quello che si cerca.
 */
function aghi(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'))
  const data = raw.data ?? raw
  const ids = new Set()
  const note = new Set()
  let scartati = 0
  for (const lista of ['expenses', 'categories', 'recurringRules', 'budgets']) {
    for (const r of data[lista] ?? []) {
      if (typeof r.id === 'string' && r.id !== '') {
        if (UUID.test(r.id)) {
          ids.add(r.id)
          // Anche **accorciato**: quello che era finito in un commento erano i
          // primi otto esadecimali, non l'UUID intero. Chi racconta un record a
          // parole lo accorcia, sempre.
          ids.add(r.id.slice(0, 8))
        } else scartati += 1
      }
      if (typeof r.note === 'string' && r.note.trim() !== '') note.add(r.note.trim())
      if (typeof r.name === 'string' && r.name.trim() !== '') note.add(r.name.trim())
    }
  }
  return { ids, note, scartati }
}

/** Le stringhe che compaiono nel prodotto e che non sono un dato di nessuno. */
const NEUTRE = new Set([
  'Spesa', 'Fuori', 'Coffeeshop', 'Sigarette', 'Trasporti', 'Svago', 'Casa', 'Extra',
  'Groceries', 'Eating out', 'Cigarettes', 'Transport', 'Fun', 'Home',
  'settings',
])

function nellAlbero(ago) {
  try {
    const out = execFileSync('git', ['grep', '-n', '--fixed-strings', '-I', ago, 'HEAD', '--', '.'], {
      encoding: 'utf8',
    })
    return out.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function nellaStoria(ago) {
  try {
    const out = execFileSync('git', ['log', '--all', '--oneline', '-S', ago], { encoding: 'utf8' })
    return out.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

const files = fileDiBackup(sorgente.replace(/^~/, process.env['HOME'] ?? '~'))
if (files.length === 0) {
  console.error(`\n  nessun backup in ${sorgente} (cerco cent*.json)\n`)
  process.exit(2)
}

const ids = new Set()
const note = new Set()
let scartati = 0
for (const f of files) {
  const a = aghi(f)
  for (const x of a.ids) ids.add(x)
  for (const x of a.note) if (!NEUTRE.has(x)) note.add(x)
  scartati += a.scartati
}

console.log(`\n  Dati veri nell'albero e nella storia`)
console.log(`  ${files.length} backup letti da ${sorgente}`)
console.log(`  ${ids.size} id e ${note.size} fra note e nomi, cercati in HEAD e in \`git log --all\``)
if (scartati > 0) {
  // Il numero si stampa: un controllo che scarta in silenzio e' un controllo di
  // cui non si sa la copertura, ed e' peggio di uno che ne ha poca.
  console.log(`  ${scartati} id non-UUID ignorati: non identificano nessuno (\`exp-0\`, \`cat-1\`)`)
}
console.log('')

let trovati = 0
for (const [famiglia, insieme] of [
  ['id', ids],
  ['nota o nome', note],
]) {
  for (const ago of insieme) {
    const albero = nellAlbero(ago)
    const storia = nellaStoria(ago)
    if (albero.length === 0 && storia.length === 0) continue
    trovati += 1
    console.log(`  ── ${famiglia}: ${JSON.stringify(ago)}`)
    for (const riga of albero.slice(0, 5)) console.log(`     albero  ${riga}`)
    for (const riga of storia.slice(0, 5)) console.log(`     storia  ${riga}`)
    console.log('')
  }
}

if (trovati === 0) {
  console.log('  nessuno: niente di un archivio vero compare nel repository.\n')
  process.exit(0)
}

console.log(
  `  ${trovati} aghi trovati.\n\n` +
    "  Nell'**albero** si riparano con un commit normale: i dati illustrativi\n" +
    '  vengono da `docs/demo.json`, che esiste per questo.\n\n' +
    '  Nella **storia** no: togliere qualcosa dalla storia vuol dire riscriverla\n' +
    '  e forzare il push, cioe' + "' cambiare ogni SHA da li' in avanti — comprese\n" +
    '  le citazioni su cui poggiano i documenti. E\' una decisione di prodotto,\n' +
    '  non un rimedio automatico: si riporta, non si esegue.\n',
)
process.exit(1)
