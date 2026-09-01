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
 * ## Un controllo fallisce quando la riparazione e' meccanica, avvisa quando
 * ## richiede un giudizio
 *
 * `--check` ha **due esiti diversi**, e la riga sopra e' il criterio che li separa.
 *
 * **I fatti derivati fanno fallire** (uscita 1). La riparazione e' un comando solo,
 * `npm run state`, quindi bloccare non costa niente a nessuno. Un avviso su una
 * cosa che si ripara con un comando diventa carta da parati in due settimane, e
 * allora si ha un numero falso in cima alla ROADMAP **con accanto un avviso che
 * nessuno legge** — cioe' lo stato di partenza, piu' il rumore.
 *
 * **L'eta' dei giudizi avvisa** (uscita 0). Ripararla richiede che una persona
 * rilegga della prosa e decida se e' ancora vera: non e' meccanica, e bloccare la
 * pipeline su quello si aggira con `--no-verify` il terzo giorno. E' la
 * calibrazione dell'hook pre-commit, applicata due volte nello stesso script.
 *
 * ## E perche' `--check` non guarda l'identita' del commit
 *
 * Il blocco porta scritto lo SHA di HEAD, quindi **ogni commit lo rende diverso
 * per costruzione**. Un confronto che includesse quelle righe segnalerebbe "da
 * rigenerare" **a ogni push, per sempre** — cioe' sarebbe la guardia che grida al
 * lupo, la stessa che questo progetto ha gia' deciso di non sopportare per l'hook
 * lento e per il test che allarma a vuoto.
 *
 * Quindi il confronto salta le righe di identita' (`Ultimo commit`, `Data`,
 * `Ramo`, `Pushato`, `Rispetto a origin/main`, `Albero di lavoro`): cambiano a
 * ogni commit e a ogni cambio di ramo per costruzione. Sono vere al momento in cui si
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
/** 5, perche' il caso reale valeva 9. */
const JUDGMENT_MAX_AGE = 5

const BEGIN = '<!-- STATE:BEGIN'
const END = '<!-- STATE:END -->'

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim()
const git = (...args) => sh('git', args)

/* ------------------------------------------------------------------ commit */

/**
 * Il confronto e' col **proprio upstream**, e la riga **nomina il ramo**.
 *
 * Qui c'era `origin/main..HEAD` cablato, e lo eseguiva anche stando su un ramo di
 * lavoro: il 29 agosto, con `fase-6-wip` allineato al proprio origin, il blocco
 * rigenerato scriveva **"no: 1 commit non pushati"**. Il numero era vero contro
 * `main` e la frase era falsa contro il ramo su cui si stava lavorando — e il
 * blocco non diceva contro cosa avesse misurato.
 *
 * E' la malattia che questo blocco esiste per chiudere, ricomparsa dentro lo
 * script che lo genera: **una derivazione vale dove ha guardato, e deve dire
 * dove.** Un fatto rigenerato non puo' invecchiare, ma puo' misurare un'altra
 * cosa da quella che il lettore crede — che e' peggio, perche' si presenta come
 * misura.
 *
 * Quindi due righe invece di una: **`Pushato`** risponde a *"il mio lavoro e' al
 * sicuro?"* e guarda `@{upstream}`; **`Rispetto a origin/main`** risponde a *"cosa
 * c'e' in produzione?"* e resta perche' e' Pages a costruire da li'. Su `main`
 * l'upstream **e'** `origin/main` e la seconda riga sparisce, invece di ripetere
 * la prima con altre parole.
 */
function commitFacts() {
  const sha = git('rev-parse', '--short', 'HEAD')
  const subject = git('log', '-1', '--format=%s')
  const date = git('log', '-1', '--format=%ad', '--date=format:%d/%m/%Y %H:%M')
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')

  // Il ramo puo' non avere upstream (appena creato, mai pushato). Non e' un
  // errore dello script: e' un fatto sul ramo, e si scrive come tale.
  let upstream = null
  try {
    upstream = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}')
  } catch {
    upstream = null
  }

  const compare = (ref) => {
    const ahead = git('rev-list', '--count', `${ref}..HEAD`)
    const behind = git('rev-list', '--count', `HEAD..${ref}`)
    return { ahead: Number(ahead), behind: Number(behind) }
  }

  let pushed
  try {
    if (upstream === null) {
      pushed = `**no: \`${branch}\` non ha un upstream, non e' mai stato pushato**`
    } else {
      const { ahead, behind } = compare(upstream)
      pushed =
        ahead === 0 && behind === 0
          ? `si, \`${upstream}\` e' allo stesso commit`
          : ahead === 0
            ? `no: **\`${upstream}\` e' avanti di ${behind}**`
            : `**no: ${ahead} commit non pushati su \`${upstream}\`**`
    }
  } catch {
    pushed = `non verificabile (nessun \`${upstream ?? 'upstream'}\` raggiungibile)`
  }

  // La seconda riga esiste solo quando dice qualcosa che la prima non dice.
  let vsMain = null
  if (upstream !== 'origin/main') {
    try {
      const { ahead, behind } = compare('origin/main')
      vsMain =
        ahead === 0 && behind === 0
          ? 'allo stesso commit'
          : [
              ahead > 0 ? `${ahead} commit avanti` : null,
              behind > 0 ? `${behind} commit indietro` : null,
            ]
              .filter(Boolean)
              .join(', ')
    } catch {
      vsMain = 'non verificabile (nessun `origin/main` raggiungibile)'
    }
  }

  const dirty = git('status', '--porcelain')
  return { sha, subject, date, branch, pushed, vsMain, dirty }
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
 * L'esito dell'**ultima esecuzione vera** della suite e2e, letto da
 * `test-results/last.json` (il reporter json, vedi `playwright.config.ts`).
 *
 * Non si esegue la suite da qui: costa due minuti, e uno script che si lancia a
 * ogni commit non puo' costare due minuti — diventerebbe lo script che nessuno
 * lancia, cioe' lo stesso difetto che ADR 021 ha rifiutato per i due comandi.
 *
 * **Si legge l'artefatto, e si controlla la sua data** contro `src/` e `tests/`,
 * esattamente come per `dist/`. Un verde di due commit fa non dice niente sul
 * codice di adesso: se il file e' piu' vecchio dei sorgenti, il fatto e' **non
 * misurato** e si scrive cosi'.
 *
 * I saltati arrivano da qui e non da `--list`, perche' i salti di questa suite
 * sono **condizionali** (ADR 013): nessuna lettura statica puo' vederli, solo
 * un'esecuzione.
 */
function e2eRunFacts(dichiarati) {
  const REPORT = 'test-results/last.json'
  let raw
  try {
    raw = readFileSync(REPORT, 'utf8')
  } catch {
    return { ok: false, why: "la suite e2e non e' mai stata eseguita qui (`npm run test:e2e`)" }
  }
  const reportAt = statSync(REPORT).mtimeMs
  const sourcesAt = Math.max(newestMtime('src'), newestMtime('tests'))
  if (reportAt < sourcesAt) {
    return { ok: false, why: "l'ultima esecuzione e' piu' vecchia dei sorgenti — va rilanciata" }
  }
  let json
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, why: `${REPORT} non e' leggibile` }
  }
  const counts = { expected: 0, skipped: 0, unexpected: 0, flaky: 0 }
  let durationMs = 0
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const status = test.status ?? 'expected'
        if (status in counts) counts[status]++
        for (const r of test.results ?? []) durationMs = Math.max(durationMs, r.duration ?? 0)
      }
    }
    for (const child of suite.suites ?? []) walk(child)
  }
  for (const suite of json.suites ?? []) walk(suite)
  const wall = json.stats?.duration ?? 0

  // **Fresco non vuol dire intero.** Il controllo qui sopra guarda la *data* del
  // report, non la sua *copertura*: un `npx playwright test -g "..."` e' piu'
  // recente dei sorgenti e contiene sei test su quattrocento. E' successo il 2
  // settembre — il blocco rigenerato ha scritto **"6 passati, 0 saltati, in 0.2
  // minuti"** dopo una prova mirata, cioe' un fatto che non poteva invecchiare e
  // che era falso appena nato.
  //
  // E' la stessa famiglia di *"l'output di una verifica si filtra quando lo si
  // legge, mai quando lo si registra"*, applicata a un'esecuzione invece che a un
  // log: il filtro era sul `-g`, e cio' che ha registrato non era una misura.
  //
  // Quindi si confronta con i test **dichiarati** da `--list`. Meno vuol dire
  // parziale, e un fatto parziale si dichiara **non misurato** invece di essere
  // scritto come se fosse il conto.
  const visti = counts.expected + counts.skipped + counts.unexpected + counts.flaky
  if (typeof dichiarati === 'number' && visti < dichiarati) {
    return {
      ok: false,
      why: `l'ultima esecuzione e' **parziale** — ${visti} test su ${dichiarati} dichiarati, ` +
        'probabilmente un `-g` o un `--project`: va rilanciata intera',
    }
  }

  return { ok: true, ...counts, wallMs: wall }
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
      distance = Number(git('rev-list', '--count', `${sha}..HEAD`, '--'))
    } catch {
      // La storia non c'e'. Non e' un errore del documento: e' un clone senza
      // profondita' — `actions/checkout` ne fa uno cosi' per default. Vedi
      // `stampLine` per cosa NON si fa in questo caso.
      distance = null
    }
    found.push({ sha, distance, index: m.index })
  }
  return found
}

/**
 * Il timbro di un giudizio. `null` significa **"non ho potuto contare"**, non
 * "il commit non esiste": chiama `stampLine` solo chi ha una distanza vera, e chi
 * non ce l'ha **lascia il timbro com'e'** (vedi `restampJudgments`).
 *
 * La differenza e' costata un push per essere vista. In CI `actions/checkout` fa
 * un clone a profondita' 1, quindi `rev-list <sha>..HEAD` fallisce per ogni
 * giudizio; la prima versione ne concludeva "che in questo albero non esiste
 * piu'" e **riscriveva quattro timbri buoni con una frase falsa**. Il ramo di
 * lettura stampava quattro `fatal:` e diceva "da rigenerare" sempre; il ramo di
 * scrittura avrebbe **danneggiato il documento**.
 *
 * Il workflow adesso chiede la storia intera (`fetch-depth: 0`, `.git` pesa 6 MB),
 * cosi' il conteggio si fa davvero. Questo ramo resta per chiunque altro lanci lo
 * script in un clone superficiale: **non sapere non e' un dato da scrivere.**
 */
function stampLine(j) {
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
    // Distanza sconosciuta: si lascia il timbro esistente intatto. Sovrascriverlo
    // significherebbe sostituire un fatto vero con la propria ignoranza.
    if (j.distance === null) continue
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

/* ------------------------------------------------------------------------ *
 * Decisioni prese: l'esistenza e' un giudizio, l'applicazione e' un fatto.
 * ------------------------------------------------------------------------ */

/**
 * **La frase che ha prodotto questo codice**: *l'esistenza di una decisione e' un
 * giudizio, la sua applicazione e' un fatto derivabile.* Sono due cose diverse
 * finite nella stessa sezione, e per questo l'intera sezione e' finita nella
 * meta' del documento che nessuno puo' controllare.
 *
 * ## Il difetto che l'ha chiesta
 *
 * Il 27 agosto "Decisioni prese e non ancora applicate" dichiarava **sei
 * decisioni, nessuna nel codice**. Cinque su sei erano gia' implementate, e
 * quattro degli otto difetti elencati sopra erano gia' chiusi. Il documento
 * mandava a rifare lavoro che esisteva.
 *
 * **L'asimmetria del costo, che decide dove serve la macchina**: un difetto
 * taciuto fa spedire un difetto; un difetto **dichiarato aperto e in realta'
 * chiuso** fa rifare lavoro. Sono entrambi guasti e non lo stesso guasto — e la
 * meta' "giudizi" di questo documento porta il secondo rischio per costruzione,
 * perche' nessuno la controlla.
 *
 * ## La forma
 *
 * Ogni voce porta il proprio controllo di applicazione, in un commento:
 *
 *     <!-- DECISION
 *          present: src/ui/stats-view.ts :: BreakdownKind
 *          absent:  src/ui/Stats.css :: BAR_MIN
 *     -->
 *
 * Tutte le condizioni devono valere perche' la voce sia **applicata**. Il
 * giudizio resta umano — *cosa* si e' deciso e *perche'*; il fatto diventa
 * derivato — se e' nel codice o no.
 *
 * ## `present:` si preferisce sempre; `absent:` si accoppia
 *
 * **Tre condizioni su otto sono state scritte male, e tutte e tre erano `absent`.**
 * Non e' un caso, ed e' meccanico: un ago `present:` chiede che qualcosa di
 * preciso sia stato **costruito**, e c'e' un solo modo di soddisfarlo. Un ago
 * `absent:` chiede che una parola non ci sia, e **lo soddisfa qualunque cosa la
 * faccia sparire** — un commento cancellato (e' successo: due commenti che
 * nominavano l'accoppiamento facevano fallire la voce del pavimento), una
 * flessione diversa (e' successo: *"riscriverne"* contro *"ne riscrive"*), una
 * classe che doveva restare (e' successo: `tile__label` sopravvive sulla scheda
 * che non e' stata tolta).
 *
 * Quindi: **dove `absent:` e' inevitabile, si accoppia con il `present:` della
 * cosa che ha preso il posto.** *"X non c'e'"* e' debole; **"X non c'e' e Y c'e'"**
 * e' forte, perche' Y puo' esistere solo se il lavoro e' stato fatto davvero.
 *
 * La voce della scheda lo fa: `absent: variableCents` (il campo esisteva **solo**
 * per quella scheda, e il controllo D l'ha trovato orfano nel giro stesso) accanto
 * a `present: stats__titleRange` (il confine del periodo spostato sul titolo di A
 * **prima** del taglio). Nessuna delle due da sola direbbe che il lavoro e' finito.
 *
 * ## Il guadagno secondario, che vale da solo
 *
 * **Una decisione la cui applicazione non si riesce a esprimere come controllo e'
 * una decisione troppo vaga per essere implementata.** Scrivere il controllo
 * filtra la decisione mentre la si prende, non mentre la si verifica.
 *
 * ## Perche' questi timbri entrano nel confronto e quelli dei giudizi no
 *
 * Il timbro di un giudizio cambia a ogni commit (la distanza cresce), quindi
 * segnalarlo sarebbe rumore. Questo cambia **solo quando cambia il codice** — che
 * e' esattamente il momento in cui va riletto. Sta nel diff, e `--check`
 * fallisce se qualcuno implementa una decisione e non rigenera.
 */
function decisionChecks(text) {
  const found = []
  const block = /<!-- (DECISION|USCITA)\s+([\s\S]*?)-->/g
  for (let m = block.exec(text); m !== null; m = block.exec(text)) {
    const conditions = []
    for (const line of m[2].split('\n')) {
      const c = /^\s*(present|absent):\s*(\S+)\s*::\s*(.+?)\s*$/.exec(line)
      if (c !== null) conditions.push({ kind: c[1], file: c[2], needle: c[3] })
    }
    found.push({ raw: m[0], kind: m[1], conditions })
  }
  return found
}

/**
 * Vero se la condizione regge.
 *
 * **Un file illeggibile lancia**, e non si traduce in "non lo contiene". La prima
 * versione lo faceva — `catch { return kind === 'absent' }` — e con un `ROOT` che
 * in questo file non esiste **tutti** i controlli uscivano invertiti: otto voci
 * lette al contrario, e la sezione avrebbe dichiarato non applicato cio' che c'e'.
 * Cioe' **lo stesso difetto che questa sezione esiste per chiudere**, prodotto dal
 * codice che la chiude.
 *
 * Confondere *non so* con *non c'e'* e' la scorciatoia che questo progetto ha gia'
 * tolto due volte — dal promemoria di backup e dai giudizi non databili. Qui non
 * si tace e non si indovina: si lancia, perche' un percorso sbagliato e' un
 * difetto del controllo e va visto subito.
 */
function holds(condition) {
  const source = readFileSync(condition.file, 'utf8')
  const there = source.includes(condition.needle)
  return condition.kind === 'present' ? there : !there
}

function decisionStamp(decision) {
  if (decision.conditions.length === 0 && decision.kind === 'USCITA') {
    /*
     * Un criterio di uscita senza controllo non e' un difetto: e' un **giudizio**,
     * e alcune cose non possono essere altro. "Gli screenshot li ha guardati una
     * persona" non ha una macchina che lo dica, e fingere il contrario sarebbe
     * peggio che ammetterlo — un controllo che finge di coprire un giudizio
     * produce la falsa sicurezza che questa sezione esiste per togliere.
     */
    return '> **Giudizio**, senza controllo per costruzione: nessuna macchina puo\' dirlo.'
  }
  if (decision.conditions.length === 0) {
    return '> **Senza controllo.** Una decisione che non sa dire come si verifica non si sa nemmeno quando e` finita.'
  }
  const failing = decision.conditions.filter((c) => !holds(c))
  if (failing.length === 0) {
    const how = decision.conditions.map((c) => `\`${c.kind === 'present' ? '' : '!'}${c.needle}\``).join(', ')
    return `> **Applicata**, verificato da: ${how}.`
  }
  const missing = failing
    .map((c) => `${c.kind === 'present' ? 'manca' : 'c’e’ ancora'} \`${c.needle}\` in \`${c.file}\``)
    .join('; ')
  return `> **Non applicata**: ${missing}.`
}

/** Riscrive la riga di timbro subito dopo ogni blocco `<!-- DECISION ... -->`. */
function restampDecisions(text) {
  let out = text
  /*
   * **Si cerca a partire da dove si e' arrivati, non da capo.**
   *
   * Quattro criteri di uscita sono giudizi e portano lo stesso marcatore vuoto,
   * `<!-- USCITA -->`: testualmente **identici**. Con `indexOf` da zero, tutti e
   * quattro trovavano il primo, e il timbro veniva riscritto quattro volte sullo
   * stesso blocco mentre gli altri tre restavano senza. Una collisione di chiavi,
   * nel codice che serve a non fidarsi della memoria.
   */
  let da = 0
  for (const d of decisionChecks(text)) {
    const at = out.indexOf(d.raw, da)
    if (at === -1) continue
    da = at + d.raw.length
    const after = at + d.raw.length
    const rest = out.slice(after)
    const replaced = rest.replace(/^\n+(> \*\*(?:Applicata|Non applicata|Senza controllo|Giudizio)[^\n]*\n\n?)?/, `\n${decisionStamp(d)}\n\n`)
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
  L.push(`- **Ramo**: \`${f.commit.branch}\``)
  L.push(`- **Pushato**: ${f.commit.pushed}`)
  if (f.commit.vsMain !== null) {
    L.push(`- **Rispetto a \`origin/main\`**: ${f.commit.vsMain}`)
  }
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
      `- **Test e2e dichiarati**: ${f.e2e.total} in ${f.e2e.files} file, su ${f.e2e.projects.length} progetti ` +
        `(${f.e2e.projects.join(', ')})`,
    )
  } else {
    L.push('- **Test e2e dichiarati**: non contati (`playwright --list` non ha risposto)')
  }

  if (f.e2eRun.ok) {
    const min = (f.e2eRun.wallMs / 60000).toFixed(1)
    const bad = f.e2eRun.unexpected
    L.push(
      `- **Test e2e eseguiti**: ${f.e2eRun.expected} passati, ${f.e2eRun.skipped} saltati` +
        (f.e2eRun.flaky ? `, ${f.e2eRun.flaky} instabili` : '') +
        (bad ? `, **${bad} falliti**` : '') +
        `, in ${min} minuti. I saltati sono condizionali (ADR 013): solo un'esecuzione li vede.`,
    )
  } else {
    L.push(`- **Test e2e eseguiti**: non misurato — ${f.e2eRun.why}`)
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

const conteggioUscite = () => {
  const giudizi = uscite.filter((u) => u.unchecked).length
  return (
    `  Criteri di uscita: ${usciteOk}/${uscite.length - giudizi} verificabili soddisfatti, ` +
    `${giudizi} giudizi che nessuna macchina puo' dire`
  )
}

const check = process.argv.includes('--check')
const text = readFileSync(ROADMAP, 'utf8')

const e2eDichiarati = e2eFacts()

const facts = {
  commit: commitFacts(),
  unit: unitFacts(),
  e2e: e2eDichiarati,
  e2eRun: e2eRunFacts(e2eDichiarati === null ? undefined : e2eDichiarati.total),
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
next = restampDecisions(next)

const stale = judgments.filter((j) => j.distance !== null && j.distance > JUDGMENT_MAX_AGE)

/**
 * I bollini dei fatti che **questo albero non puo' misurare adesso**. Le loro righe
 * escono dal confronto: "non so misurare" non e' "il documento e' sbagliato".
 *
 * E' la stessa distinzione fatta per i giudizi non databili, e si e' vista per la
 * stessa ragione — provandolo in un clone superficiale, dove manca `dist/`. Senza
 * questo, in CI il check sarebbe fallito **a ogni run**: il passo gira prima di
 * `npm run build`, quindi il bundle risultava "non misurato", quindi deriva,
 * quindi uscita 1. Avremmo avuto un gate rosso permanente per un fatto che il
 * documento riportava correttamente.
 */
const unmeasurable = []
if (!facts.unit) unmeasurable.push({ label: 'Test unitari', why: 'vitest non ha risposto' })
if (!facts.e2e) unmeasurable.push({ label: 'Test e2e dichiarati', why: 'playwright --list non ha risposto' })
if (!facts.e2eRun.ok) unmeasurable.push({ label: 'Test e2e eseguiti', why: facts.e2eRun.why })
if (!facts.bundle.ok) unmeasurable.push({ label: 'Bundle iniziale', why: facts.bundle.why })

/**
 * Toglie le righe che non possono essere confrontate onestamente. Senza questo il
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
        !/^- \*\*(Ultimo commit|Data|Ramo|Pushato|Rispetto a `origin\/main`|Albero di lavoro)\*\*/.test(
          line,
        ) &&
        !/^> Rivisto a /.test(line) &&
        !unmeasurable.some((u) => line.startsWith(`- **${u.label}**`)),
    )
    .join('\n')

const unknown = judgments.filter((j) => j.distance === null)

const decisions = decisionChecks(text).map((d) => ({
  ...d,
  applied: d.conditions.length > 0 && d.conditions.every(holds),
  unchecked: d.conditions.length === 0,
}))
const applied = decisions.filter((d) => d.kind === 'DECISION' && d.applied).length
const unchecked = decisions.filter((d) => d.kind === 'DECISION' && d.unchecked).length
const decisionCount = decisions.filter((d) => d.kind === 'DECISION').length
/*
 * I criteri di uscita della fase. Stessa macchina delle decisioni, conteggio
 * separato: sono due domande diverse — "cosa abbiamo deciso e' nel codice?" e
 * "la fase si puo' chiudere?" — e un numero solo che le somma non risponde a
 * nessuna delle due.
 */
const uscite = decisions.filter((d) => d.kind === 'USCITA')
const usciteOk = uscite.filter((d) => d.applied).length

if (check) {
  const drifted = withoutIdentity(next) !== withoutIdentity(text)

  console.log(
    drifted
      ? '\n  Fatti: **stantii**. Lancia `npm run state` e ricommetti.'
      : '\n  Fatti: allineati.',
  )
  for (const j of stale) {
    console.log(
      `  Giudizio rivisto a ${j.sha}, ${j.distance} commit fa (soglia ${JUDGMENT_MAX_AGE}): da riguardare.`,
    )
  }
  for (const u of unmeasurable) console.log(`  ${u.label}: non misurabile qui — ${u.why}`)
  if (unknown.length) {
    console.log(
      `  ${unknown.length} giudizi non databili: la storia non c'e'. Clone superficiale?` +
        ' Serve `fetch-depth: 0`.',
    )
  }
  if (!stale.length && !unknown.length) console.log('  Giudizi: nessuno oltre la soglia.')
  if (uscite.length > 0) console.log(conteggioUscite())
  if (decisions.length > 0) {
    console.log(
      `  Decisioni: ${applied}/${decisionCount} applicate` +
        (unchecked > 0 ? `, ${unchecked} senza controllo` : ''),
    )
  }
  console.log('')

  /*
   * **I fatti fanno fallire, i giudizi no.** Vedi la testata: la riparazione di un
   * fatto e' `npm run state`, cioe' meccanica, e bloccare non costa niente;
   * la riparazione di un giudizio e' una persona che rilegge, e bloccare su quello
   * si aggira.
   *
   * Ne' `unknown` ne' `unmeasurable` fanno fallire: non e' il documento a essere
   * sbagliato, e' **questo albero** a non poter rispondere — un clone senza storia,
   * un `dist/` non ancora costruito. Far fallire la pipeline per come e' stato
   * fatto il clone sarebbe far pagare al documento un difetto della sua lettura.
   *
   * Il che significa che **un fatto non misurabile qui non viene verificato da
   * nessuno qui**. Perche' in CI il bundle venga verificato davvero, il passo va
   * messo **dopo** `npm run build`: e' quello che fa il workflow.
   */
  process.exit(drifted ? 1 : 0)
}

writeFileSync(ROADMAP, next)
console.log(`\n  ${ROADMAP}: blocco rigenerato a \`${facts.commit.sha}\`.`)
if (decisionCount > 0) {
  console.log(
    `  Decisioni: ${applied}/${decisionCount} applicate` +
      (unchecked > 0 ? `, ${unchecked} senza controllo` : ''),
  )
}
if (uscite.length > 0) console.log(conteggioUscite())
for (const j of judgments) console.log(`  Giudizio ${j.sha}: ${j.distance} commit fa.`)
for (const j of stale) console.log(`  ^ oltre la soglia di ${JUDGMENT_MAX_AGE}: da riguardare.`)
console.log('')
