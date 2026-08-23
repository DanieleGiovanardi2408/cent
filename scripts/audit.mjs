// Cerca i mis-inserimenti da cents-first in un file di backup.
//
//   node scripts/audit.mjs ~/Downloads/cent-2026-08-23.json
//
// Sta qui e non nell'app di proposito: zero byte nel bundle, zero superficie
// nella UI, e puo' essere piu' ricco di una schermata. Non e' uno strumento
// d'esperimento, e' un audit permanente — l'unico modo di vedere gli errori
// che non sono mai stati presi.
//
// Cerca due firme diverse, e servono entrambe:
//
//   1. L'errore PRESO. Una spesa cancellata D e una nuova N con stessa
//      categoria, stessa data, N.amountCents === D.amountCents * 100, create a
//      pochi minuti di distanza. E' la coppia di correzione: si e' digitato in
//      centesimi, ci si e' accorti, si e' rifatta.
//
//      IL FATTORE 100 E' LA REGOLA, NON UN DETTAGLIO DA ALLENTARE. Nel primo
//      backup reale c'era questo caso, ed e' il motivo per cui la condizione non
//      puo' diventare "stessa categoria, stessa data, cancellata e rifatta":
//
//          220b8638  2500  Spesa  creata 12:31:25  cancellata 12:31:27
//          22e338ba  2500  Spesa  creata 12:31:38  nota "Decathlon"
//
//      Stessa categoria, stessa data, tredici secondi di distanza, cancella-e-
//      rifai — ma 2500 -> 2500: non e' un errore di ordine di grandezza, si stava
//      solo aggiungendo una nota. Segnalarlo sarebbe un falso positivo, e un
//      audit che grida al lupo sulle cancellazioni normali smette di essere letto
//      dopo la seconda settimana, cioe' esattamente quando servirebbe.
//   2. L'errore NON preso. Le spese vive sotto 1 EUR. Non e' la soglia che e'
//      stata scartata per la UI — quella gridava all'utente nel momento
//      sbagliato. Qui e' un elenco che si legge in blocco, dove 0,80 per un
//      caffe' e 0,25 per Decathlon si distinguono in un secondo.
import { readFileSync } from 'node:fs'

const SOTTO = 100 // centesimi: la soglia dell'elenco da rileggere a mano
const VICINE_MS = 10 * 60 * 1000 // quanto vicine devono essere le due meta' di una coppia

const path = process.argv[2]
if (path === undefined) {
  console.error('\n  uso: node scripts/audit.mjs <file-di-backup.json>\n')
  process.exit(1)
}

let backup
try {
  backup = JSON.parse(readFileSync(path, 'utf8'))
} catch (error) {
  console.error(`\n  non riesco a leggere ${path}: ${error.message}\n`)
  process.exit(1)
}

if (backup?.app !== 'cent' || backup?.data?.expenses === undefined) {
  console.error('\n  non sembra un backup di Cent (manca app:"cent" o data.expenses)\n')
  process.exit(1)
}

const expenses = backup.data.expenses
const nomeCategoria = new Map((backup.data.categories ?? []).map((c) => [c.id, c.name]))

const eur = (cents) => `${(cents / 100).toFixed(2).replace('.', ',')} €`
const cat = (id) => nomeCategoria.get(id) ?? '(categoria sconosciuta)'
const ms = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime())

/** Quanto e' passato prima che l'errore venisse notato. E' la metrica che conta. */
function durata(millis) {
  const s = Math.round(millis / 1000)
  if (s < 90) return `${s} s`
  const m = Math.round(s / 60)
  if (m < 90) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${m % 60} min`
}

// --- 1. Coppie di correzione x100: l'errore preso -------------------------
const cancellate = expenses.filter((e) => e.deletedAt !== undefined && e.deletedAt !== null)
const vive = expenses.filter((e) => e.deletedAt === undefined || e.deletedAt === null)

const coppie = []
for (const sbagliata of cancellate) {
  for (const rifatta of vive) {
    if (rifatta.categoryId !== sbagliata.categoryId) continue
    if (rifatta.date !== sbagliata.date) continue
    if (rifatta.amountCents !== sbagliata.amountCents * 100) continue
    if (ms(rifatta.createdAt, sbagliata.deletedAt) > VICINE_MS) continue
    coppie.push({
      sbagliata,
      rifatta,
      // Quanto e' passato fra l'inserimento sbagliato e il momento in cui e'
      // stato notato. NON e' rifatta.createdAt - sbagliata.deletedAt: quella
      // misura quanto si e' veloci a rifarla, che non interessa.
      latenza: ms(sbagliata.deletedAt, sbagliata.createdAt),
    })
  }
}

console.log(`\n  ${backup.data.expenses.length} spese nel backup (${vive.length} vive, ${cancellate.length} cancellate)`)
console.log(`  esportato il ${backup.exportedAt}\n`)

console.log('  ── Errori presi: coppie di correzione x100 ──')
if (coppie.length === 0) {
  console.log('  nessuna.\n')
} else {
  for (const { sbagliata, rifatta, latenza } of coppie) {
    console.log(
      `  ${sbagliata.date}  ${eur(sbagliata.amountCents).padStart(10)} -> ${eur(rifatta.amountCents).padStart(10)}` +
        `  ${cat(sbagliata.categoryId)}${sbagliata.note ? ` · ${sbagliata.note}` : ''}`,
    )
    console.log(`  ${' '.repeat(10)}  notato dopo ${durata(latenza)}`)
  }
  const peggiore = Math.max(...coppie.map((c) => c.latenza))
  console.log(`\n  ${coppie.length} su ${vive.length} spese vive. Latenza peggiore: ${durata(peggiore)}.`)
  console.log('  Sopra i 60 s l\'errore e\' sopravvissuto abbastanza da sporcare le statistiche.\n')
}

// --- 2. Spese vive sotto 1 EUR: l'errore mai preso -------------------------
const sospette = vive
  .filter((e) => e.amountCents < SOTTO)
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

console.log(`  ── Errori mai presi: spese vive sotto ${eur(SOTTO)} ──`)
if (sospette.length === 0) {
  console.log('  nessuna.\n')
} else {
  for (const e of sospette) {
    console.log(
      `  ${e.date}  ${eur(e.amountCents).padStart(10)}  ${cat(e.categoryId)}${e.note ? ` · ${e.note}` : ''}`,
    )
  }
  console.log(
    `\n  ${sospette.length} da rileggere a mano. Un caffe' da 0,80 e' plausibile,\n` +
      `  0,25 per un negozio di sport non lo e': la differenza la fa chi le ha vissute.\n`,
  )
}
