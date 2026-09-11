// Le scadenze: le dichiara, le legge, e fa scattare quelle passate.
//
//   node scripts/scadenze.mjs        inventario + esito (esce 1 se qualcosa ferma)
//
// ## Il difetto che l'ha prodotto, con due occorrenze e non una
//
// Una condizione datata in questo progetto e' stata scritta **tre volte** e ha
// funzionato **una**.
//
//  - `dead-surface.mjs` dichiarava i due membri di `ThemePreference` con la
//    condizione *"o se la fase 7 si chiude senza costruirlo"*. La fase 7 si e'
//    chiusa senza costruirlo, **e non e' successo niente**: la condizione non
//    aveva un esito scritto, quindi non c'era niente da eseguire. Il rilievo e'
//    in DEBITO.md §17, e la frase che lo chiude e' il criterio di questo file:
//
//        Una condizione senza un esito scritto non e' una condizione: e' una data.
//
//  - **DEBITO.md §9** diceva *"si decide in **fase 7**"*. Stessa forma, stesso
//    esito: la fase 7 e' chiusa, la decisione non e' stata presa, e nessuno se
//    n'e' accorto. Trovata il 10 settembre 2026 rileggendo il tree, tre sezioni
//    sopra la §17 che aveva gia' diagnosticato la malattia.
//
//  - ADR 026 e' quella che ha funzionato, e la differenza e' **una sola parola**:
//    *"oppure"*. *"Il lettore arriva entro la fine della fase 8, **oppure** la
//    scrittura esce."* Due rami, tutti e due scritti.
//
// Due occorrenze su tre non sono disattenzione: e' che **le scadenze di questo
// progetto vivono in prosa e vengono fatte scattare a memoria**. E' esattamente
// la diagnosi di CLAUDE.md, "Le regole non bastano scritte", applicata alla
// quinta classe.
//
// ## I tre controlli
//
// **S1 — forma.** Ogni blocco `SCADENZA` porta `cosa`, `entro` ed `esito`.
// Manca uno: **ferma**. La riparazione e' meccanica — si scrive il campo — e per
// la calibrazione di CLAUDE.md bloccare non costa un giudizio a nessuno.
//
// **S2 — scaduta.** `entro: fase N` con N gia' chiusa, o `entro: AAAA-MM-GG` nel
// passato: **ferma**, finche' il blocco non dichiara `chiusa:`.
//
// Qui la calibrazione va argomentata invece che copiata, perche' sembra un
// giudizio e non lo e'. Riparare **non** vuol dire decidere cosa fare: vuol dire
// eseguire uno dei due rami che stanno gia' scritti nell'`esito`. La decisione
// e' stata presa il giorno in cui la scadenza e' stata dichiarata; quel che
// resta e' constatare quale ramo si e' avverato. Ed e' precisamente cio' che
// nelle due occorrenze sopra non e' successo: non perche' fosse difficile, ma
// perche' **nessuno era li' a chiederlo**. Un avviso su questa classe sarebbe
// carta da parati in due settimane, e allora la scadenza tornerebbe a scattare
// a memoria, cioe' mai.
//
// **S3 — non dichiarata.** Una scadenza scritta in prosa e **non** dichiarata in
// un blocco: **ferma**. E' il controllo che avrebbe preso §9, ed e' l'unico dei
// tre che guarda dove il difetto e' nato — la prosa, non il blocco.
//
// Una **citazione** non e' una dichiarazione e non ne vuole una: un paragrafo
// che nomina un altro documento (un link, `ADR NNN`, `DEBITO`, `ROADMAP`) sta
// citando la scadenza di casa altrui. Cosi' il controllo fa rispettare anche la
// regola di DEBITO.md §1: chi ridice un fatto lo **cita**, non lo parafrasa.
//
// ## Come si deriva "la fase corrente"
//
// Dall'intestazione piu' alta `## Compiti espliciti della fase N` in ROADMAP.md.
// E' un fatto **del repository**, quindi derivabile allo stesso valore ovunque —
// il criterio di CLAUDE.md per cosa puo' entrare in un confronto. Non dai
// messaggi di commit: `git log` porta *"chiusura della fase 7"* e nient'altro,
// cioe' la convenzione non ha retto sulle sei fasi precedenti.
//
// ## Il limite, dichiarato
//
// S3 cerca **idiomi**, quindi vede le scadenze scritte come le sei che oggi
// esistono. Una scritta in una forma nuova gli passa davanti: e' la forma 4
// della tassonomia delle mutazioni finte — una copertura con un buco — e l'unico
// rimedio e' aggiungere l'idioma quando se ne incontra uno.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const ROADMAP = 'docs/ROADMAP.md'

/** I file in cui una scadenza puo' vivere. */
function fonti() {
  const adr = readdirSync('docs/adr')
    .filter((n) => n.endsWith('.md'))
    .map((n) => join('docs/adr', n))
  return ['docs/DEBITO.md', ROADMAP, ...adr, 'scripts/dead-surface.mjs', 'CLAUDE.md']
}

/**
 * La fase corrente: il numero piu' alto fra i "Compiti espliciti della fase N".
 * Una fase e' **chiusa** quando e' minore di questo numero.
 */
function faseCorrente() {
  const testo = readFileSync(ROADMAP, 'utf8')
  const numeri = [...testo.matchAll(/^#+\s+Compiti espliciti della fase (\d+)/gm)].map((m) =>
    Number(m[1]),
  )
  if (numeri.length === 0) throw new Error(`${ROADMAP}: nessuna "Compiti espliciti della fase N"`)
  return Math.max(...numeri)
}

const BLOCCO = /<!--\s*SCADENZA\s*\n([\s\S]*?)-->/g

/** I blocchi dichiarati, con il numero di riga a cui cominciano. */
function blocchi(file) {
  const testo = readFileSync(file, 'utf8')
  const trovati = []
  for (const m of testo.matchAll(BLOCCO)) {
    const riga = testo.slice(0, m.index).split('\n').length
    const campi = {}
    for (const c of m[1].matchAll(/^\s*(cosa|entro|esito|chiusa):\s*(.*)$/gm)) {
      campi[c[1]] = (campi[c[1]] ? `${campi[c[1]]} ` : '') + c[2].trim()
    }
    trovati.push({ file, riga, campi, fine: riga + m[0].split('\n').length })
  }
  return trovati
}

/**
 * Gli idiomi con cui in questo albero si e' scritta una scadenza.
 *
 * Sono **sei siti**, contati il 10 settembre 2026 con un `grep` su `docs/` e
 * `scripts/`: cinque dicono "entro la fine della fase N" (o "di questa fase") e
 * uno dice "si decide in fase N" — quello di §9, cioe' il difetto.
 */
const IDIOMI = [
  /entro la fine (?:della fase \d+|di questa fase)/i,
  /si decide in \*{0,2}fase \d+/i,
  /entro il \d{1,2} [a-z]+ 20\d\d/i,
  /entro \*{0,2}(?:la fine del|il) \*{0,2}\d{1,2} [a-z]+ 20\d\d/i,
]

/**
 * Una sezione che nomina un altro documento sta **citando**, non dichiarando.
 *
 * `docs/adr/NNN-` sta accanto a `ADR NNN` perche' i marcatori `USCITA` del
 * ROADMAP citano per **percorso** e non per numero — e un percorso nomina la
 * casa del fatto esattamente come il numero.
 */
const CITAZIONE = /\]\(|ADR \d{3}|docs\/adr\/\d{3}|DEBITO|ROADMAP|CLAUDE\.md/

/**
 * L'unita' non e' il paragrafo, e' la **sezione**.
 *
 * Il paragrafo e' stato la prima forma, e sbagliava in tutti e due i versi sugli
 * stessi due siti: la citazione in pull-quote di ADR 026 sta dieci righe sotto
 * il proprio blocco, e la riga del ROADMAP nomina l'ADR in un marcatore
 * `USCITA` che sta sopra il paragrafo, non dentro. Una scadenza si argomenta
 * lungo una sezione — il blocco in cima, la frase in grassetto in mezzo, la
 * conseguenza in fondo — quindi e' li' che va cercato se e' dichiarata.
 */
function sezioneDi(righe, i) {
  let da = i
  while (da > 0 && !/^#{1,6}\s/.test(righe[da])) da -= 1
  let a = i + 1
  while (a < righe.length && !/^#{1,6}\s/.test(righe[a])) a += 1
  return righe.slice(da, a).join('\n')
}

function prosaNonDichiarata(file, dichiarati) {
  const righe = readFileSync(file, 'utf8').split('\n')
  const fuori = []
  for (let i = 0; i < righe.length; i += 1) {
    if (!IDIOMI.some((re) => re.test(righe[i]))) continue
    const n = i + 1
    // Dentro un blocco: e' la dichiarazione stessa.
    if (dichiarati.some((b) => n >= b.riga && n <= b.fine)) continue
    const sezione = sezioneDi(righe, i)
    if (/<!--\s*SCADENZA/.test(sezione)) continue
    if (CITAZIONE.test(sezione)) continue
    fuori.push({ file, riga: n, testo: righe[i].trim() })
  }
  return fuori
}

/** `entro:` scaduto? Torna `null` se non lo e', una frase se lo e'. */
function scaduta(entro, fase, oggi) {
  const perFase = /^fase (\d+)$/i.exec(entro.trim())
  if (perFase) {
    const n = Number(perFase[1])
    return n < fase ? `la fase ${n} e' chiusa (corrente: ${fase})` : null
  }
  const perData = /^(\d{4}-\d{2}-\d{2})$/.exec(entro.trim())
  if (perData) return perData[1] < oggi ? `il ${perData[1]} e' passato (oggi: ${oggi})` : null
  return `\`entro: ${entro}\` non e' ne' "fase N" ne' una data AAAA-MM-GG`
}

const fase = faseCorrente()
const oggi = new Date().toISOString().slice(0, 10)
const files = fonti()
const tutti = files.flatMap((f) => blocchi(f))

let rotto = false
console.log(`\n  Fase corrente: ${fase} (da "${ROADMAP}" :: Compiti espliciti della fase N)\n`)

/* --- S1 — forma ---------------------------------------------------------- */
/**
 * `chiusa:` si valida come gli altri, e non e' pedanteria: e' **l'unico campo
 * che spegne S2**. Senza un controllo sopra, la via piu' corta per far tacere
 * una scadenza scattata sarebbe scriverci dentro una parola qualunque — cioe'
 * il `--no-verify` di questo controllo. Chiedere una data la rende un fatto:
 * *quando* e' stata chiusa si verifica contro `git log`, *come* no.
 */
function malformati(b) {
  const mancano = ['cosa', 'entro', 'esito'].filter((k) => !b.campi[k])
  if (b.campi.chiusa !== undefined && !/\d{4}-\d{2}-\d{2}/.test(b.campi.chiusa)) {
    mancano.push('chiusa (senza la data in cui lo e` stata)')
  }
  return mancano
}

const senzaCampo = tutti.map((b) => ({ b, mancano: malformati(b) })).filter((x) => x.mancano.length)
console.log(`  S1. Forma delle scadenze dichiarate — ${tutti.length} blocchi`)
if (senzaCampo.length === 0) {
  console.log('      ogni blocco porta `cosa`, `entro` ed `esito`.\n')
} else {
  rotto = true
  for (const { b, mancano } of senzaCampo) {
    console.log(`\n      ── ${b.file}:${b.riga} — manca: ${mancano.join(', ')}`)
  }
  console.log(
    "\n      Una condizione senza un esito scritto non e' una condizione: e' una data.\n" +
      '      (DEBITO.md §17, la frase che ha prodotto questo controllo.)\n',
  )
}

/* --- S2 — scadute -------------------------------------------------------- */
const aperte = tutti.filter((b) => !b.campi.chiusa && b.campi.entro)
const passate = aperte
  .map((b) => ({ b, perche: scaduta(b.campi.entro, fase, oggi) }))
  .filter((x) => x.perche !== null)
console.log(`  S2. Scadenze passate e non chiuse — ${aperte.length} aperte`)
if (passate.length === 0) {
  console.log('      nessuna: ogni scadenza aperta e` ancora dentro il proprio termine.\n')
} else {
  rotto = true
  for (const { b, perche } of passate) {
    console.log(`\n      ── ${b.file}:${b.riga} — ${b.campi.cosa}`)
    console.log(`         scaduta: ${perche}`)
    console.log(`         esito:   ${b.campi.esito}`)
  }
  console.log(
    "\n      Non c'e' niente da decidere: i due rami sono gia' scritti sopra.\n" +
      "      Si esegue quello che si e' avverato e si aggiunge `chiusa:` con il come.\n",
  )
}

/* --- S3 — in prosa e non dichiarate -------------------------------------- */
const fuori = files.flatMap((f) =>
  prosaNonDichiarata(
    f,
    tutti.filter((b) => b.file === f),
  ),
)
console.log(`  S3. Scadenze scritte in prosa e non dichiarate — ${files.length} file letti`)
if (fuori.length === 0) {
  console.log('      nessuna: ogni scadenza in prosa e` dichiarata o cita la propria casa.\n')
} else {
  rotto = true
  for (const x of fuori) {
    console.log(`\n      ── ${x.file}:${x.riga}`)
    console.log(`         ${x.testo.slice(0, 96)}`)
  }
  console.log(
    '\n      Una scadenza in prosa non scatta: la fa scattare qualcuno che si ricorda.\n' +
      '      O prende un blocco SCADENZA, o cita quello di casa sua.\n',
  )
}

process.exit(rotto ? 1 : 0)
