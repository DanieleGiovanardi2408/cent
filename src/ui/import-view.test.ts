import { describe, expect, it } from 'vitest'
import { buildBackup } from '../core/backup'
import { SCHEMA_VERSION } from '../core/schema'
import {
  makeBudget,
  makeCategory,
  makeExpense,
  makeRule,
  makeSettings,
  tickingClock,
} from '../core/testing'
import type { DataSet } from '../core/types'
import { countRows, currentCounts, exportedDay, stepFromText } from './import-view'
import type { ImportStep } from './import-view'

/**
 * L'archivio di partenza: **una lapide, un'archiviata, una regola spenta**.
 *
 * I tre casi non sono decorazione: sono esattamente quelli su cui i due
 * conteggi del prima/dopo possono divergere, ed e' li' che una divergenza
 * farebbe il danno peggiore — due numeri accostati nella stessa riga, uno che
 * conta le lapidi e uno che non le conta, davanti a una conferma distruttiva.
 */
function archivio(): DataSet {
  return {
    expenses: [
      makeExpense({ id: 'e1', date: '2026-08-01', amountCents: 1_250 }),
      makeExpense({ id: 'e2', date: '2026-08-02', amountCents: 300 }),
      makeExpense({
        id: 'e3',
        date: '2026-08-03',
        amountCents: 500,
        deletedAt: '2026-08-03T10:00:00.000Z',
      }),
    ],
    categories: [
      makeCategory({ id: 'cat-1', name: 'Spesa' }),
      makeCategory({ id: 'cat-2', name: 'Vecchia', archived: true }),
    ],
    recurringRules: [
      makeRule({ id: 'r1', startDate: '2026-01-01' }),
      makeRule({ id: 'r2', startDate: '2026-01-01', active: false }),
    ],
    budgets: [makeBudget({ id: 'b1', amountCents: 80_000, effectiveFrom: '2026-08-01' })],
    settings: makeSettings({}),
  }
}

/** Il testo di un backup, come arriverebbe da un file. */
function file(data: DataSet): string {
  return JSON.stringify(buildBackup(data, tickingClock()))
}

/** Il testo di un backup con una modifica chirurgica nel JSON gia' scritto. */
function fileCon(data: DataSet, tocca: (json: Record<string, unknown>) => void): string {
  const json = JSON.parse(file(data)) as Record<string, unknown>
  tocca(json)
  return JSON.stringify(json)
}

function body(json: Record<string, unknown>): Record<string, unknown[]> {
  return json['data'] as Record<string, unknown[]>
}

/** Il rifiuto, o l'errore che dice quale stato si e' ottenuto invece. */
function rifiuto(step: ImportStep) {
  if (step.kind !== 'refused') throw new Error(`atteso un rifiuto, ricevuto "${step.kind}"`)
  return step.refusal
}

describe('i quattro stati della lettura', () => {
  /**
   * **Il caso 4 e' il piu' importante di tutti**, e non per la sua frequenza:
   * e' l'unico che rende accettabile il rifiuto totale (DEBITO §13). Un backup
   * di cento spese che ne ha una illeggibile non si importa, e la sola cosa che
   * impedisce a quel rifiuto di essere un vicolo cieco e' che il messaggio dica
   * **come si trova** quel record dentro il file.
   *
   * ## L'asserzione non e' una stringa: e' che quella stringa si trovi
   *
   * Questo test confrontava `where` con `'expenses[0].amountCents'`, ed era
   * verde su un difetto: quel testo e' un **indice**, e nel JSON **non compare**.
   * Il rimedio "da un computer apri il file e cerca" non portava da nessuna
   * parte, e nessuna asserzione poteva accorgersene perche' asseriva la stessa
   * stringa che il codice produceva.
   *
   * Adesso asserisce la **proprieta'**: `where` dev'essere **dentro il testo del
   * file**. E' piu' severa, non dipende da come si chiama un campo, e cade il
   * giorno in cui qualcuno ci rimette un indice — che e' esattamente cio' che
   * la vecchia forma non poteva fare.
   */
  it('un record illeggibile porta come si trova, e si trova davvero', () => {
    const testo = fileCon(archivio(), (json) => {
      const spesa = body(json)['expenses']?.[0] as Record<string, unknown>
      spesa['amountCents'] = 12.5
    })
    const esito = rifiuto(stepFromText(testo))
    expect(esito).toEqual({ kind: 'damaged', where: expect.any(String), comeSiTrova: 'id', more: 0 })
    if (esito?.kind !== 'damaged') throw new Error('scena sbagliata')
    expect(
      testo.includes(esito.where),
      `"${esito.where}" non compare nel file: il rimedio "cercalo da un computer" ` +
        'manda a cercare una cosa che li dentro non c\'e\'',
    ).toBe(true)
  })

  /**
   * **E quando a mancare e' l'id, si ripiega sulla posizione dicendolo.**
   *
   * Li' non c'e' niente da cercare, e un ripiego silenzioso avrebbe rimesso in
   * piedi lo stesso difetto con l'aggravante di sembrare riparato.
   */
  it('senza id si ripiega sulla posizione, e lo dichiara', () => {
    const testo = fileCon(archivio(), (json) => {
      const spesa = body(json)['expenses']?.[0] as Record<string, unknown>
      delete spesa['id']
    })
    const esito = rifiuto(stepFromText(testo))
    expect(esito).toEqual({
      kind: 'damaged',
      where: 'expenses[0].id',
      comeSiTrova: 'posizione',
      more: 0,
    })
  })

  it('due record illeggibili si dicono due: uno non e\' come cento', () => {
    const testo = fileCon(archivio(), (json) => {
      const spese = body(json)['expenses'] as Record<string, unknown>[]
      spese[0]!['amountCents'] = 12.5
      spese[1]!['date'] = 'domani'
    })
    const esito = rifiuto(stepFromText(testo))
    expect(esito).toEqual({ kind: 'damaged', where: expect.any(String), comeSiTrova: 'id', more: 1 })
    if (esito?.kind !== 'damaged') throw new Error('scena sbagliata')
    expect(testo.includes(esito.where)).toBe(true)
  })

  /**
   * **Il 3 e il 4 hanno rimedi opposti**, e questo test li tiene distinti dal
   * lato che conta: qui il file e' di qualcun altro, quindi non c'e' nessun
   * record da nominare e nessuna riga da togliere da un computer. Il rimedio e'
   * un altro file.
   */
  it('un JSON che non parla di Cent non e\' un backup, e non nomina nessun record', () => {
    expect(rifiuto(stepFromText('{"note":["la spesa","il pane"]}'))).toEqual({
      kind: 'not-backup',
    })
  })

  it('un testo che non e\' JSON e\' letto: e\' il caso 3, non il caso 2', () => {
    // La differenza e' tutta qui: il file e' **arrivato**. Chiamarlo "non si e'
    // potuto leggere" manderebbe a riprovare con lo stesso file per sempre.
    expect(rifiuto(stepFromText('cent, ma scritto a mano'))).toEqual({ kind: 'not-backup' })
  })

  it('un file scritto da una versione piu\' nuova chiede di aggiornare, non un altro file', () => {
    const testo = fileCon(archivio(), (json) => {
      json['schemaVersion'] = SCHEMA_VERSION + 1
    })
    // Il path della issue e' `file.schemaVersion`, cioe' lo stesso di un file
    // senza versione: se la soglia dello schema non venisse guardata **prima**,
    // questo caso direbbe "non e' un backup" — che e' il messaggio opposto, su
    // un file che e' un backup validissimo.
    expect(rifiuto(stepFromText(testo))).toEqual({ kind: 'too-new' })
  })

  it('un backup senza categorie non e\' un record rotto: e\' uno stato che l\'app non tiene', () => {
    const testo = fileCon(archivio(), (json) => {
      body(json)['categories'] = []
    })
    expect(rifiuto(stepFromText(testo))).toEqual({ kind: 'no-categories' })
  })

  /**
   * Le categorie assenti **sono una conseguenza** quando anche i record sono
   * rotti, e in quel caso il rimedio utile e' quello del caso 4. Il numero
   * `more` non conta quella issue: direbbe "altri come questo: 1" dove l'altro
   * record illeggibile non esiste — un fatto che lo schermo non conferma.
   */
  it('con un record rotto e zero categorie vince il record, e non si conta due volte', () => {
    const testo = fileCon(archivio(), (json) => {
      const categorie = body(json)['categories'] as Record<string, unknown>[]
      delete categorie[0]!['name']
      delete categorie[1]!['name']
    })
    const esito = rifiuto(stepFromText(testo))
    expect(esito).toEqual({
      kind: 'damaged',
      where: expect.any(String),
      comeSiTrova: 'id',
      more: 1,
    })
    // Vale anche qui: cio' che il messaggio dice di cercare dev'essere nel file.
    if (esito?.kind !== 'damaged') throw new Error('scena sbagliata')
    expect(testo.includes(esito.where)).toBe(true)
  })

  it('un backup sano arriva all\'anteprima con la sua data e i suoi conteggi', () => {
    const step = stepFromText(file(archivio()))
    if (step.kind !== 'ready') throw new Error(`atteso "ready", ricevuto "${step.kind}"`)
    expect(step.counts).toEqual({ expenses: 2, categories: 2, rules: 2 })
    expect(step.exportedAt).not.toBeNull()
    expect(step.data.expenses).toHaveLength(3)
  })
})

describe('il prima e il dopo si contano nello stesso modo', () => {
  /**
   * **L'invariante, non due numeri.** I due lati della stessa riga rispondono
   * alla stessa domanda — *quante spese vedro'* — e si calcolano in due posti:
   * `parseBackup` per il file, `currentCounts` per il mirror. Asserire i valori
   * uno per uno lascerebbe passare il giorno in cui uno dei due cambia
   * criterio; questa forma cade **su qualunque** divergenza, compresa quella su
   * un archivio che oggi non esiste.
   */
  it('i conteggi di un backup dello stato corrente sono i conteggi dello stato corrente', () => {
    const data = archivio()
    const step = stepFromText(file(data))
    if (step.kind !== 'ready') throw new Error(`atteso "ready", ricevuto "${step.kind}"`)
    expect(step.counts).toEqual(
      currentCounts(data.expenses, data.categories, data.recurringRules),
    )
  })

  it('le lapidi non si contano da nessuna delle due parti', () => {
    const data = archivio()
    expect(currentCounts(data.expenses, data.categories, data.recurringRules).expenses).toBe(2)
    expect(data.expenses).toHaveLength(3)
  })

  it('le righe stanno nell\'ordine in cui si leggono, e adesso non e\' dopo', () => {
    const rows = countRows(
      { expenses: 47, categories: 8, rules: 3 },
      { expenses: 18, categories: 6, rules: 1 },
    )
    expect(rows).toEqual([
      { kind: 'expenses', now: 47, next: 18 },
      { kind: 'categories', now: 8, next: 6 },
      { kind: 'rules', now: 3, next: 1 },
    ])
  })
})

describe('la data dentro la frase', () => {
  it('un istante diventa il suo giorno civile', () => {
    // Il fuso della suite e' Europe/Amsterdam (vitest.config.ts): le 23:30 di
    // Zulu del 2 sono gia' il 3 qui, ed e' il giorno che l'utente ha vissuto.
    expect(exportedDay('2026-08-02T23:30:00.000Z')).toBe('2026-08-03')
  })

  it('senza data la frase si scrive senza data', () => {
    expect(exportedDay(null)).toBeNull()
  })

  /**
   * `parseBackup` accetta qualunque stringa non vuota come `exportedAt`, quindi
   * questo caso arriva da un file scritto a mano. Senza questa riga la frase
   * direbbe *"il backup del NaN-NaN-NaN"* — un'etichetta illeggibile dentro
   * l'unica frase su cui si decide se cancellare il proprio archivio.
   */
  it('una data che non e\' una data si tratta come assente, non si scrive rotta', () => {
    expect(exportedDay('boh')).toBeNull()
  })
})
