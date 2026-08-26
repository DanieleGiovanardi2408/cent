/*
 * Rigenera il blocco "Stato corrente" in cima a `docs/ROADMAP.md`.
 *
 * ## Perche' esiste
 *
 * Il 26 agosto una sessione nuova ha letto quel blocco e ci ha trovato cinque
 * righe false: l'ultimo commit era indietro di sei, i tre numeri (unitari, e2e,
 * bundle) erano di due consegne prima, e la riga operativa sulla migrazione del
 * telefono nominava una catena che lo schema aveva gia' superato.
 *
 * Nessuna delle cinque era un errore di giudizio. Erano **fatti derivabili dal
 * repository, scritti a mano**: un numero che qualcuno ha copiato una volta e che
 * da quel momento poteva solo invecchiare. E' la stessa forma dei campi senza
 * produttore che `dead-surface.mjs` cerca nei tipi — scritto al tempo t, letto al
 * tempo t+n — applicata alla memoria del progetto invece che al codice.
 *
 * La riparazione non e' ricordarsi di aggiornarli: e' **toglierli dalla penna**.
 * Un fatto rigenerato non puo' diventare stantio.
 *
 * ## Cosa NON fa, ed e' la meta' importante
 *
 * Non tocca i giudizi. "Il gate e' in corso", "non ci sono decisioni in sospeso"
 * non si derivano da nessun file e restano scritti da una persona. Quello che lo
 * script fa per loro e' **timbrarli**: accanto a ogni giudizio compare lo SHA a
 * cui e' stato rivisto e **quanti commit fa**, cosi' chi legge sa da solo quanta
 * fiducia dargli invece di scoprirlo come l'abbiamo scoperto noi.
 *
 * ## Perche' avvisa e non fallisce
 *
 * `--check` non esce mai con errore. Una guardia che blocca il commit per una
 * riga di prosa vecchia viene aggirata con `--no-verify` il terzo giorno, e una
 * guardia aggirata e' peggio di nessuna guardia — e' gia' scritto in CLAUDE.md
 * per l'hook pre-commit, e vale identico qui.
 *
 * ## E perche' `--check` non guarda l'identita' del commit
 *
 * Il blocco porta scritto lo SHA di HEAD, quindi **ogni commit lo rende diverso
 * per costruzione**. Un confronto che includesse quelle righe segnalerebbe "da
 * rigenerare" **a ogni push, per sempre** — cioe' sarebbe la guardia che grida al
 * lupo, la stessa che questo progetto ha gia' deciso di non sopportare per l'hook
 * lento e per il test che allarma a vuoto.
 *
 * Quindi il confronto salta le quattro righe di identita' (`Ultimo commit`,
 * `Data`, `Pushato`, `Albero di lavoro`): sono vere al momento in cui si
 * rigenera, si rileggono in un secondo con `git log -1`, e nessuno le usa per
 * decidere. Restano nel documento perche' servono **a chi legge**, non al check.
 *
 * Quello che il check guarda davvero e' cio' che costa misurare e che quindi
 * nessuno rimisura leggendo: **conteggi dei test, peso del bundle, scala delle
 * migrazioni** — piu' l'eta' dei giudizi. Li' "da rigenerare" significa qualcosa.
 *
 * ## Un fatto che non si puo' misurare adesso non porta il valore di prima
 *
 * Il peso del bundle si legge da `dist/`, che puo' non esistere o essere piu'
 * vecchio dei sorgenti. In quel caso lo script scrive **"non misurato"** con la
 * ragione, invece di riportare il numero dell'ultima volta. Un indicatore che
 * puo' sbagliare deve sbagliare verso l'allarme: e' la regola del promemoria di
 * backup, e qui il costo di un numero vecchio spacciato per fresco e' esattamente
 * il difetto che questo script esiste per chiudere.
 *
 * Uso:
 *   node scripts/state.mjs            riscrive il blocco
 *   node scripts/state.mjs --check    non scrive, dice cosa cambierebbe
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, relative } from 'node:path'

const ROADMAP = 'docs/ROADMAP.md'
const SCHEMA = 'src/core/schema.ts'
const DIST = 'dist'
const BUDGET_BYTES = 60 * 1024

/**
 * Oltre quanti commit un giudizio va riguardato.
 *
 * **Cinque, e il numero viene dal caso vero misurato, non a occhio.** I due
 * giudizi che erano invecchiati senza che si vedesse portavano `62f8ce8`, e la
 * distanza da li' a HEAD era **nove commit** — contata con
 * `git rev-list --count`, non stimata leggendo il log, che e' il modo in cui la
 * prima ricostruzione l'aveva sbagliata dicendo sei.
 *
 * Una soglia a dieci avrebbe lasciato passare il caso che l'ha prodotta. Cinque
 * sta **sotto** la deriva vera, e la regola generale e' quella di CLAUDE.md:
 * quando si sostituisce una soglia, la propria dev'essere piu' fine dell'effetto
 * che si cerca — prima di scriverla bisogna sapere quanto vale l'effetto piu'
 * piccolo che deve fallire. Qui vale nove.
 */
const JUDGMENT_MAX_AGE = 5

const BEGIN = '<!-- STATE:BEGIN'
const END = '<!-- STATE:END -->'

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()
const git = (...args) => sh('git', args)

/* ------------------------------------------------------------------ commit */

function commitFacts() {
  const sha = git('rev-parse', '--short', 'HEAD')
  const subject = git('log', '-1', '--format=%s')
  const date = git('log', '-1', '--format=%ad', '--date=format:%d/%m/%Y %H:%M')
  let pushed
  try {
    const ahead = git('rev-list', '--count', 'origin/main..HEAD')
    const behind = git('rev-list', '--count', 'HEAD..origin/main')
    pushed =
      ahead === '0' && behind === '0'
        ? "si, `origin/main` e' allo stesso commit"
        : ahead === '0'
          ? `no: **origin/main e' avanti di ${behind}**`
          : `**no: ${ahead} commit non pushati**`
  } catch {
    pushed = 'non verificabile (nessun `origin/main` raggiungibile)'
  }
  const dirty = git('status', '--porcelain')
  return { sha, subject, date, pushed, dirty }
}

/* ------------------------------------------------------------------- test */

function unitFacts() {
  try {
    const out = execFileSync('npx', ['vitest', 'run', '--reporter=json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
    const json = JSON.parse(out)
    return {
      total: json.numTotalTests,
      failed: json.numFailedTests,
      files: json.testResults?.length ?? 0,
    }
  } catch {
    return null
  }
}

/**
 * Quanti test e2e sono **dichiarati**. Non quanti ne girano: i salti di questa
 * suite sono condizionali (ADR 013 — le premesse d'ambiente si dichiarano),
 * quindi `--list` non li vede e nessuna lettura statica puo' vederli. Il numero
 * che gira si sa solo eseguendola, ed e' un fatto misurato, non derivato.
 */
function e2eFacts() {
  try {
    const out = execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
    const json = JSON.parse(out)
    let total = 0
    const walk = (suite) => {
      for (const spec of suite.specs ?? []) total += (spec.tests ?? []).length
      for (const child of suite.suites ?? []) walk(child)
    }
    for (const suite of json.suites ?? []) walk(suite)
    const projects = (json.config?.projects ?? []).map((p) => p.name)
    return { total, files: (json.suites ?? []).length, projects }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ bundle */

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function newestMtime(dir) {
  return walk(dir).reduce((max, p) => Math.max(max, statSync(p).mtimeMs), 0)
}

/**
 * Il peso del bundle, **solo se `dist/` e' piu' recente di ogni sorgente**.
 * Altrimenti nessun numero: un bundle costruito due commit fa misura due commit
 * fa, e riportarlo come attuale e' il difetto che questo file esiste per
 * chiudere — con l'aggravante di essere invisibile, perche' un numero vecchio
 * ha esattamente l'aspetto di uno fresco.
 */
function bundleFacts() {
  let distFiles
  try {
    distFiles = walk(DIST)
  } catch {
    return { ok: false, why: "`dist/` non esiste — `npm run build` non e' mai girato qui" }
  }
  const srcNewest = Math.max(newestMtime('src'), statSync('index.html').mtimeMs)
  const distNewest = distFiles.reduce((max, p) => Math.max(max, statSync(p).mtimeMs), 0)
  if (distNewest < srcNewest) {
    return { ok: false, why: "`dist/` e' piu' vecchio dei sorgenti — va ricostruito" }
  }
  const isServiceWorker = (p) => /(^|\/)(sw|registerSW|workbox-[^/]+)\.js$/.test(p)
  const total = distFiles
    .map((p) => relative(DIST, p))
    .filter((p) => /\.(js|css)$/.test(p) && !isServiceWorker(p))
    .reduce((sum, p) => sum + gzipSync(readFileSync(join(DIST, p))).length, 0)
  return { ok: true, total, budget: BUDGET_BYTES }
}

/* ------------------------------------------------------------------ schema */

/**
 * La versione dello schema e la scala delle migrazioni, lette dal codice.
 *
 * E' la riparazione diretta di una delle cinque righe false: la ROADMAP diceva
 * "li' gira la migrazione 2 -> 3" quando lo schema era gia' 4. La frase giusta
 * non nomina un numero d'arrivo — dice **fino a `SCHEMA_VERSION`** — cosi' resta
 * vera qualunque sia la versione da cui parte il dispositivo, che e' un fatto del
 * telefono e non del repository.
 */
function schemaFacts() {
  const src = readFileSync(SCHEMA, 'utf8')
  const version = Number(/export const SCHEMA_VERSION = (\d+)/.exec(src)?.[1])
  const steps = [...src.matchAll(/\{\s*\n\s*to: (\d+),\s*\n\s*summary: '([^']*)'/g)].map((m) => ({
    to: Number(m[1]),
    summary: m[2],
  }))
  return { version, steps }
}

/* --------------------------------------------------------------- giudizi */

/**
 * I giudizi sono marcati nella ROADMAP cosi':
 *
 *     <!-- JUDGMENT rivisto=62f8ce8 -->
 *     ...prosa...
 *     <!-- /JUDGMENT -->
 *
 * Lo script non legge la prosa e non la giudica: calcola solo **quanti commit
 * fa** e riscrive la riga di timbro che segue il marcatore. La prosa resta di chi
 * l'ha scritta.
 */
function judgmentFacts(text) {
  const found = []
  for (const m of text.matchAll(/<!-- JUDGMENT rivisto=([0-9a-f]{7,40}) -->/g)) {
    const sha = m[1]
    let distance = null
    try {
      distance = Number(git('rev-list', '--count', `${sha}..HEAD`))
    } catch {
      distance = null
    }
    found.push({ sha, distance, index: m.index })
  }
  return found
}

function stampLine(j) {
  if (j.distance === null) return `> Rivisto a \`${j.sha}\`, che in questo albero non esiste piu'.`
  const how =
    j.distance === 0
      ? "cioe' a questo commit"
      : j.distance === 1
        ? 'un commit fa'
        : `${j.distance} commit fa`
  const warn = j.distance > JUDGMENT_MAX_AGE ? ' **Da riguardare.**' : ''
  return `> Rivisto a \`${j.sha}\`, ${how}.${warn}`
}

/** Riscrive la riga di timbro subito dopo ogni marcatore `<!-- JUDGMENT ... -->`. */
function restampJudgments(text, judgments) {
  let out = text
  for (const j of judgments) {
    const marker = `<!-- JUDGMENT rivisto=${j.sha} -->`
    const at = out.indexOf(marker)
    if (at === -1) continue
    const after = at + marker.length
    const rest = out.slice(after)
    // La riga di timbro e' la prima riga non vuota dopo il marcatore, se comincia
    // con "> Rivisto a". Se non c'e', la si inserisce.
    const replaced = rest.replace(/^\n+(> Rivisto a[^\n]*\n\n?)?/, `\n${stampLine(j)}\n\n`)
    out = out.slice(0, after) + replaced
  }
  return out
}

/* ------------------------------------------------------------------ blocco */

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

function renderBlock(f) {
  const L = []
  L.push(`${BEGIN} — rigenerato da \`npm run state\`. Non scrivere qui a mano. -->`)
  L.push('')
  L.push('## I fatti, rigenerati')
  L.push('')
  L.push(
    'Questo blocco non si scrive: si rigenera. Contiene solo cio\' che il repository',
    'sa gia\', e per questo non puo\' invecchiare. I giudizi — cosa e\' in volo, cosa',
    'aspetta una persona — stanno sotto, scritti a mano e timbrati con lo SHA a cui',
    'sono stati rivisti.',
  )
  L.push('')
  L.push(`- **Ultimo commit**: \`${f.commit.sha}\` — ${f.commit.subject}`)
  L.push(`- **Data**: ${f.commit.date}`)
  L.push(`- **Pushato**: ${f.commit.pushed}`)
  L.push(
    `- **Albero di lavoro**: ${f.commit.dirty ? '**non pulito**, ci sono modifiche non committate' : 'pulito'}`,
  )
  L.push('')

  if (f.unit) {
    L.push(
      `- **Test unitari**: ${f.unit.total} in ${f.unit.files} file` +
        (f.unit.failed ? ` — **${f.unit.failed} falliti**` : ', tutti verdi'),
    )
  } else {
    L.push('- **Test unitari**: non misurati (`vitest` non ha risposto)')
  }

  if (f.e2e) {
    L.push(
      `- **Test e2e**: ${f.e2e.total} dichiarati in ${f.e2e.files} file, su ${f.e2e.projects.length} progetti ` +
        `(${f.e2e.projects.join(', ')}). Quanti ne girano davvero dipende dall'ambiente: i salti di questa ` +
        'suite sono condizionali (ADR 013) e nessuna lettura statica li vede.',
    )
  } else {
    L.push('- **Test e2e**: non contati (`playwright --list` non ha risposto)')
  }

  L.push(
    f.bundle.ok
      ? `- **Bundle iniziale**: ${kb(f.bundle.total)} gzip su ${kb(f.bundle.budget)} ` +
          `(${kb(f.bundle.budget - f.bundle.total)} di margine)`
      : `- **Bundle iniziale**: non misurato — ${f.bundle.why}`,
  )
  L.push('')
  L.push(`- **Schema del database**: ${f.schema.version}. La scala delle migrazioni:`)
  for (const s of f.schema.steps) L.push(`  - **${s.to}** — ${s.summary}`)
  L.push('')
  L.push(
    `  Un dispositivo fermo a una versione precedente le esegue **tutte in fila fino alla ${f.schema.version}**`,
    '  alla prima apertura dopo l’aggiornamento. Da quale parta e\' un fatto del telefono, non del',
    '  repository, e per questo non e\' scritto qui.',
  )
  L.push('')
  L.push(END)
  return L.join('\n')
}

/* -------------------------------------------------------------------- main */

const check = process.argv.includes('--check')
const text = readFileSync(ROADMAP, 'utf8')

const facts = {
  commit: commitFacts(),
  unit: unitFacts(),
  e2e: e2eFacts(),
  bundle: bundleFacts(),
  schema: schemaFacts(),
}

const block = renderBlock(facts)
const judgments = judgmentFacts(text)

const start = text.indexOf(BEGIN)
const stop = text.indexOf(END)
if (start === -1 || stop === -1) {
  console.error(`\n  ${ROADMAP} non contiene i marcatori ${BEGIN} ... ${END}\n`)
  process.exit(1)
}

let next = text.slice(0, start) + block + text.slice(stop + END.length)
next = restampJudgments(next, judgments)

const stale = judgments.filter((j) => j.distance !== null && j.distance > JUDGMENT_MAX_AGE)

/**
 * Toglie le righe che cambiano a ogni commit **per costruzione**. Senza questo il
 * check segnalerebbe sempre, cioe' mai. Vedi la testata.
 *
 * Sono due gruppi, e il secondo si e' visto solo provando il check **dopo** un
 * commit vero — leggendo il codice sembrava a posto:
 *
 * 1. le quattro righe di identita' del commit;
 * 2. **le righe di timbro dei giudizi**, che passano da "cioe' a questo commit" a
 *    "un commit fa" a "2 commit fa" mentre la prosa che timbrano non si e' mossa
 *    di una virgola.
 *
 * Il secondo gruppo si toglie **senza perdere niente**, perche' l'eta' dei giudizi
 * non viene da questo confronto: la calcola `stale` a parte, contro
 * `JUDGMENT_MAX_AGE`, ed e' quella la segnalazione che conta. Tenere anche il
 * timbro dentro il diff avrebbe fatto dire "da rigenerare" a ogni push — di nuovo
 * la guardia che grida al lupo, ricomparsa un piano piu' sotto dopo essere stata
 * chiusa un piano piu' sopra.
 */
const withoutIdentity = (s) =>
  s
    .split('\n')
    .filter(
      (line) =>
        !/^- \*\*(Ultimo commit|Data|Pushato|Albero di lavoro)\*\*/.test(line) &&
        !/^> Rivisto a /.test(line),
    )
    .join('\n')

if (check) {
  const drifted = withoutIdentity(next) !== withoutIdentity(text)
  if (!drifted) console.log('\n  Stato corrente: allineato.')
  else console.log(`\n  Stato corrente: **da rigenerare**. Lancia \`npm run state\`.`)
  for (const j of stale) {
    console.log(
      `  Giudizio rivisto a ${j.sha}, ${j.distance} commit fa (soglia ${JUDGMENT_MAX_AGE}): da riguardare.`,
    )
  }
  if (!stale.length && !drifted) console.log('  Nessun giudizio oltre la soglia.')
  console.log('')
  // Non fallisce mai, di proposito: vedi la testata.
  process.exit(0)
}

writeFileSync(ROADMAP, next)
console.log(`\n  ${ROADMAP}: blocco rigenerato a \`${facts.commit.sha}\`.`)
for (const j of judgments) console.log(`  Giudizio ${j.sha}: ${j.distance} commit fa.`)
for (const j of stale) console.log(`  ^ oltre la soglia di ${JUDGMENT_MAX_AGE}: da riguardare.`)
console.log('')
