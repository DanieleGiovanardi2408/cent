/**
 * Lo scatto pre-import (ADR 026 §2), su **tutte e due** le implementazioni di
 * `Persistence`.
 *
 * Girano su IndexedDB vero (`fake-indexeddb`, ADR 001) e sul doppio in memoria,
 * e non e' ridondanza: ADR 008 le dichiara *"osservabilmente identiche"*, e una
 * dichiarazione del genere o e' sorvegliata o e' un augurio. Le due domande che
 * solo IndexedDB puo' rispondere — lo scatto sta in **un altro store**, e la
 * transazione dell'import lo copre — non hanno senso su un oggetto in memoria;
 * quelle sul comportamento le devono dare uguali.
 */

import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { buildBackup } from './backup'
import { createIdbPersistence, openCentDatabase } from './idb'
import { createMemoryPersistence, emptyDisk } from './memory-persistence'
import type { Persistence } from './persistence'
import { MIGRATIONS, SCHEMA_VERSION } from './schema'
import { buildPreImportSnapshot, snapshotPayload } from './snapshot'
import { makeCategory, makeExpense, makeSettings } from './testing'
import { ALL_STORES, ARCHIVE_STORES, PRE_IMPORT_SNAPSHOT_ID } from './types'
import type { DataSet } from './types'

let counter = 0
function dbName(): string {
  counter += 1
  return `cent-snapshot-${counter}`
}

const PRIMA = '2026-09-03T09:00:00.000Z'
const DOPO = '2026-09-03T11:30:00.000Z'

/** Uno stato riconoscibile, per vedere quale dei due c'e' sul disco. */
function stato(marca: string, importo: number): DataSet {
  return {
    expenses: [makeExpense({ id: `e-${marca}`, date: '2026-08-01', amountCents: importo })],
    categories: [makeCategory({ id: `c-${marca}`, name: marca })],
    recurringRules: [],
    budgets: [],
    settings: makeSettings(),
  }
}

/** Le due implementazioni, dietro la stessa firma. */
const implementazioni: readonly { nome: string; apri: () => Persistence }[] = [
  { nome: 'idb', apri: () => createIdbPersistence({ name: dbName() }) },
  { nome: 'memoria', apri: () => createMemoryPersistence(emptyDisk()) },
]

for (const { nome, apri } of implementazioni) {
  describe(`scatto pre-import (${nome})`, () => {
    it('non c e finche non c e stato un import', async () => {
      const p = apri()
      await p.write(stato('vecchio', 100))
      expect(await p.snapshotTakenAt()).toBeNull()
      p.close()
    })

    it('l import lo lascia, e lo prende dal disco', async () => {
      const p = apri()
      const vecchio = stato('vecchio', 100)
      await p.write(vecchio)

      expect(await p.replaceAll(stato('nuovo', 900), PRIMA)).toBe(PRIMA)
      expect(await p.snapshotTakenAt()).toBe(PRIMA)

      // L'archivio e' quello importato...
      const dopo = await p.loadAll()
      expect(dopo.expenses.map((e) => e.id)).toEqual(['e-nuovo'])
      // ...e lo scatto e' quello che c'era, letto dal disco dentro la stessa
      // transazione, non un pacchetto passato dal chiamante (ADR 008).
      const tornato = await p.restoreSnapshot()
      expect(tornato?.expenses.map((e) => e.id)).toEqual(['e-vecchio'])
      expect(tornato?.expenses[0]?.amountCents).toBe(100)
      p.close()
    })

    it('ne esiste sempre e solo uno, l ultimo', async () => {
      const p = apri()
      await p.write(stato('primo', 100))
      await p.replaceAll(stato('secondo', 200), PRIMA)
      await p.replaceAll(stato('terzo', 300), DOPO)

      // Il secondo import ha sovrascritto lo scatto del primo: si torna allo
      // stato di mezz'ora fa, non a quello di stamattina. Nessun orologio e
      // nessuna scadenza — l'id e' una costante, quindi il secondo non esiste.
      expect(await p.snapshotTakenAt()).toBe(DOPO)
      const tornato = await p.restoreSnapshot()
      expect(tornato?.expenses.map((e) => e.id)).toEqual(['e-secondo'])
      p.close()
    })

    it('il ripristino consuma lo scatto: la rete si usa una volta', async () => {
      const p = apri()
      await p.write(stato('vecchio', 100))
      await p.replaceAll(stato('nuovo', 900), PRIMA)

      expect((await p.restoreSnapshot())?.expenses.map((e) => e.id)).toEqual(['e-vecchio'])
      // Da qui la voce non c'e' piu': tenerla vorrebbe dire un'azione che non
      // fa niente, con accanto una data che e' quella dello stato in cui si e'.
      expect(await p.snapshotTakenAt()).toBeNull()
      expect(await p.restoreSnapshot()).toBeNull()
      // E l'archivio e' rimasto quello ripristinato: il secondo tentativo non
      // ha svuotato niente.
      expect((await p.loadAll()).expenses.map((e) => e.id)).toEqual(['e-vecchio'])
      p.close()
    })

    it('senza nessuno scatto il ripristino non scrive niente', async () => {
      const p = apri()
      await p.write(stato('unico', 100))
      expect(await p.restoreSnapshot()).toBeNull()
      const dopo = await p.loadAll()
      expect(dopo.expenses.map((e) => e.id)).toEqual(['e-unico'])
      expect(dopo.settings).not.toBeNull()
      p.close()
    })

    it('su un archivio mai inizializzato non c e niente da salvare', async () => {
      const p = apri()
      // Nessun record `settings`: non esiste nessuno stato a cui tornare, e uno
      // scatto di niente sarebbe una voce che promette un ripristino vuoto.
      expect(await p.replaceAll(stato('nuovo', 900), PRIMA)).toBeNull()
      expect(await p.snapshotTakenAt()).toBeNull()
      p.close()
    })
  })
}

describe('lo scatto e di un altra famiglia', () => {
  it('non e in nessuna delle liste dell archivio, quindi replaceAll non lo tocca', async () => {
    // La prova che conta e' su IndexedDB: la' gli store esistono davvero, e
    // "sopravvive" vuol dire che la transazione che cancella l'archivio non lo
    // nomina. Sul doppio in memoria sarebbe una proprieta' del nostro codice.
    const name = dbName()
    const p = createIdbPersistence({ name })
    await p.write(stato('vecchio', 100))
    await p.replaceAll(stato('nuovo', 900), PRIMA)
    p.close()

    const db = await openCentDatabase({ name })
    expect([...db.objectStoreNames].sort()).toEqual([...ALL_STORES].sort())
    // Letto dal database a mano, senza passare dalle nostre funzioni.
    const record = await db.get('preImportSnapshot', PRE_IMPORT_SNAPSHOT_ID)
    expect(record?.takenAt).toBe(PRIMA)
    expect(record?.schemaVersion).toBe(SCHEMA_VERSION)
    expect(record?.data.expenses.map((e) => e.id)).toEqual(['e-vecchio'])
    // E l'archivio e' quello importato: la cancellazione ha preso solo lui.
    expect(await db.count('expenses')).toBe(1)
    expect((await db.getAll('expenses')).map((e) => e.id)).toEqual(['e-nuovo'])
    db.close()
  })

  it('non finisce nel backup, e nemmeno un sesto store lo farebbe di nascosto', () => {
    const file = buildBackup(stato('esportato', 100), () => PRIMA)
    // Le chiavi del backup sono **esattamente** l'archivio: se domani nascesse
    // un sesto store d'archivio questa cade e chi lo aggiunge deve decidere se
    // esce nel backup, invece di scoprirlo dal fatto che manca.
    expect(Object.keys(file.data).sort()).toEqual([...ARCHIVE_STORES].sort())
    expect(Object.keys(file.data)).not.toContain('preImportSnapshot')
    expect(JSON.stringify(file)).not.toContain('takenAt')
  })
})

describe('il carico dello scatto attraversa le migrazioni', () => {
  it('uno scatto gia alla versione corrente esce identico, senza copie', () => {
    const dati = stato('fermo', 100)
    const scatto = buildPreImportSnapshot(dati, PRIMA)
    // Stesso riferimento: non c'e' niente da migrare, e migrare per scrupolo
    // vorrebbe dire clonare fino a 1,3 MB per riottenere gli stessi byte.
    expect(snapshotPayload(scatto)).toBe(dati)
  })

  it('uno scatto preso prima di un aggiornamento arriva alla versione corrente', () => {
    // Il caso vero: si importa, l'app si aggiorna da sola (e' una PWA), e poi
    // si ripristina. Le migrazioni non toccano gli store di sistema, quindi il
    // carico e' rimasto alla versione di allora.
    const vecchio = MIGRATIONS.filter((s) => s.to < SCHEMA_VERSION).at(-1)
    expect(vecchio).toBeDefined()
    const dati: DataSet = {
      ...stato('vecchio', 100),
      settings: makeSettings({ schemaVersion: vecchio!.to }),
    }
    const scatto = { ...buildPreImportSnapshot(dati, PRIMA), schemaVersion: vecchio!.to }

    const carico = snapshotPayload(scatto)
    expect(carico.settings.schemaVersion).toBe(SCHEMA_VERSION)
    // E nessun record perso per strada: e' la regola scritta su `MIGRATIONS`.
    expect(carico.expenses.map((e) => e.id)).toEqual(['e-vecchio'])
    expect(carico.categories.map((c) => c.id)).toEqual(['c-vecchio'])
  })
})
