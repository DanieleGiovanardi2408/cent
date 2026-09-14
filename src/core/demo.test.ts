/**
 * Il profilo dimostrativo: **verificato, non promesso**.
 *
 * `docs/demo.json` ha due mestieri — la sorgente degli screenshot e i dati
 * illustrativi di `scripts/audit.mjs` — e tutti e due poggiano su proprieta' che
 * `scripts/demo.mjs` puo' solo dichiarare nei propri commenti. Un commento che
 * dice *"nove settimane, entrambe le ciambelle piene, Restano intermedio"* e' la
 * forma di prosa che questo progetto ha gia' visto invecchiare piu' volte: si
 * scrive una volta, si rilegge mai, e il file intanto cambia.
 *
 * Qui le stesse proprieta' sono asserzioni. Se una generazione futura le rompe,
 * lo si sa prima di scattare gli screenshot invece che guardandoli.
 *
 * ## E la prima asserzione e' che sia un backup vero
 *
 * Non "un JSON con la forma giusta": **`parseBackup` lo accetta senza issue**.
 * E' cio' che rende il file reimportabile dall'app, che e' meta' della ragione
 * per cui esiste — chi legge il README puo' scaricarlo e importarlo per vedere
 * le stesse schermate. Un file dimostrativo che l'app rifiuta e' una fixture
 * travestita da backup.
 */
import { describe, expect, it } from 'vitest'
import { parseBackup } from './backup'
import { completeDataSet } from './testing'
import demo from '../../docs/demo.json'

/** Il giorno su cui il profilo e' costruito, e su cui lo screenshot fissa l'orologio. */
const OGGI = '2026-09-17'
/** Lunedi' della settimana di `OGGI`. La settimana comincia di lunedi' (CLAUDE.md). */
const LUNEDI = '2026-09-14'

const archivio = demo.data

describe('il profilo dimostrativo', () => {
  it('e un backup che l app accetta, senza nessuna issue', () => {
    const preview = parseBackup(JSON.parse(JSON.stringify(demo)))
    expect(preview.issues).toEqual([])
    expect(preview.ok).toBe(true)
    // I conteggi sono quelli che l'anteprima mostrerebbe a chi lo importa: le
    // spese **vive**, le categorie tutte, le regole tutte.
    expect(preview.counts.expenses).toBe(archivio.expenses.length)
    expect(preview.counts.categories).toBe(8)
  })

  it('non porta dentro niente che venga da un archivio vero', () => {
    // **La guardia piu' importante di questo file**, ed e' quella che non puo'
    // essere completa: cerca cio' che sappiamo essere uscito una volta. La
    // ricerca vera — ogni id, nota e importo di un backup reale contro l'albero
    // e la storia — e' `npm run audit:dati-veri`, che non puo' girare qui
    // perche' i backup non stanno nel repository e non ci staranno mai.
    //
    // Quello che si puo' asserire qui e' la **forma**: ogni id di questo file
    // dichiara di essere finto. Un record copiato da un archivio vero porterebbe
    // un UUID, e cade.
    for (const e of archivio.expenses) {
      expect(e.id.startsWith('demo-') || e.id.startsWith('rec:demo-'), e.id).toBe(true)
    }
    for (const c of archivio.categories) expect(c.id.startsWith('demo-'), c.id).toBe(true)
    for (const r of archivio.recurringRules) expect(r.id.startsWith('demo-'), r.id).toBe(true)
  })

  it('copre gli stessi campi di completeDataSet: nessuna schermata resta senza dati', () => {
    // **Il "costruito sopra `completeDataSet()`" reso verificabile.** I due non
    // condividono il codice — uno e' TypeScript, l'altro uno script che scrive
    // un file — quindi condividerebbero solo un'intenzione. Cio' che conta
    // davvero e' che il profilo non abbia **meno** campi popolati della fixture
    // che copre l'inventario: un campo che il demo non porta e' una parte di
    // schermata che gli screenshot non mostrano.
    const campi = (records: readonly object[]): Set<string> => {
      const visti = new Set<string>()
      for (const r of records) {
        for (const [k, v] of Object.entries(r)) if (v !== undefined) visti.add(k)
      }
      return visti
    }
    const completo = completeDataSet()
    for (const lista of ['expenses', 'categories', 'recurringRules', 'budgets'] as const) {
      const attesi = campi(completo[lista])
      const presenti = campi(archivio[lista])
      // `deletedAt` e' l'eccezione dichiarata: una lapide **esiste** nel dominio
      // e viaggia nel backup, ma non si vede in nessuna schermata. Metterla nel
      // profilo aggiungerebbe un record che nessuno screenshot puo' mostrare.
      const mancanti = [...attesi].filter((c) => c !== 'deletedAt' && !presenti.has(c))
      expect(mancanti, `${lista}: campi che completeDataSet popola e il demo no`).toEqual([])
    }
  })

  it('ha nove settimane di storia: le Statistiche ne guardano otto', () => {
    const date = archivio.expenses.map((e) => e.date).sort()
    const prima = date[0] ?? OGGI
    const giorni = (Date.parse(OGGI) - Date.parse(prima)) / 86_400_000
    expect(giorni / 7).toBeGreaterThanOrEqual(8)
    expect(date[date.length - 1]).toBe(OGGI)
  })

  it('ha entrambe le ciambelle popolate, e nessuna e una fetta sola', () => {
    const perFamiglia = (fissa: boolean): number =>
      new Set(
        archivio.expenses
          .filter((e) => (e.source === 'recurring') === fissa)
          .map((e) => e.categoryId),
      ).size
    // Una ciambella con una fetta sola e' un cerchio: non mostra una
    // ripartizione, e la schermata che dovrebbe dimostrare non dimostra niente.
    expect(perFamiglia(false), 'Quotidiane').toBeGreaterThanOrEqual(4)
    expect(perFamiglia(true), 'Fisse').toBeGreaterThanOrEqual(2)
  })

  it('ha due regole sulla stessa categoria, distinguibili solo dalla descrizione', () => {
    // E' la prova visiva del perche' `RecurringRule.note` esiste. Senza il
    // campo, queste due righe sarebbero identiche: stessa emoji, stesso nome
    // (quello della categoria), stessa cadenza.
    const perCategoria = new Map<string, string[]>()
    for (const r of archivio.recurringRules) {
      perCategoria.set(r.categoryId, [...(perCategoria.get(r.categoryId) ?? []), r.note])
    }
    const condivise = [...perCategoria.values()].filter((note) => note.length > 1)
    expect(condivise.length, 'nessuna categoria con due regole').toBeGreaterThanOrEqual(1)
    for (const note of condivise) {
      expect(new Set(note).size, 'due regole con la stessa descrizione').toBe(note.length)
      for (const n of note) expect(n === undefined || n === '', 'regola senza descrizione').toBe(false)
    }
  })

  it('apre su Restano a un valore intermedio, e oggi non e vuoto', () => {
    // **I due modi di non dimostrare niente**: a budget pieno il numero grande
    // e' il budget, sotto zero e' un'altra schermata. Il primo tentativo usciva
    // a −32,30 €, ed e' la ragione per cui il seme di `demo.mjs` e' scelto
    // contro questa riga invece che a caso.
    //
    // Le fisse **non entrano nel budget** (ADR 016): si contano solo le manuali,
    // come fa la Home.
    const budget = archivio.budgets[0]?.amountCents ?? 0
    const speso = archivio.expenses
      .filter((e) => e.source === 'manual' && e.date >= LUNEDI && e.date <= OGGI)
      .reduce((n, e) => n + e.amountCents, 0)
    const quota = speso / budget
    expect(quota).toBeGreaterThan(0.4)
    expect(quota).toBeLessThan(0.8)
    // E la Home mostra le spese di oggi: se oggi e' vuoto, la schermata che si
    // scatta e' lo stato vuoto.
    expect(archivio.expenses.filter((e) => e.date === OGGI).length).toBeGreaterThanOrEqual(3)
  })
})
