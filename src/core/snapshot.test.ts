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
import type { PreImportSnapshot } from './types'
import { SCHEMA_VERSION } from './schema'
import { makeCategory, makeExpense, makeRule, makeSettings } from './testing'
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

/**
 * Le due implementazioni, dietro la stessa firma — **e un modo di leggere lo
 * scatto che non passa da `Persistence`.**
 *
 * `snapshotTakenAt` e `restoreSnapshot` sono state differite al commit che le
 * chiama, quindi lo scatto non ha piu' un lettore pubblico. Aggiungerne uno
 * "solo per i test" sarebbe una cucitura in `src/core`, cioe' la cosa che
 * qualcuno userebbe per sbaglio. Non serve: **lo scatto si legge da dove sta**
 * — dal database su IndexedDB, dall'oggetto disco in memoria, che e' il test
 * stesso a costruire e a tenere in mano.
 *
 * E' piu' severo dell'API che sostituisce: legge il record grezzo, quindi cade
 * anche se un giorno il ripristino sapesse ricostruire cio' che la scrittura non
 * ha messo.
 */
interface Aperta {
  readonly p: Persistence
  /** Lo scatto com'e' scritto, letto senza passare da `Persistence`. */
  readonly scatto: () => Promise<PreImportSnapshot | null>
}

interface Impl {
  readonly nome: string
  /**
   * **Apre un archivio nuovo a ogni chiamata**, e restituisce insieme il modo di
   * leggerne lo scatto.
   *
   * La prima stesura calcolava il nome del database **una volta sola** nella
   * chiusura: tutti i test della famiglia `idb` finivano nello stesso archivio,
   * e "su un archivio mai inizializzato non c'e' niente da salvare" trovava lo
   * scatto lasciato dal test precedente. Due rossi, e la ragione e' quella che
   * `dbName()` porta scritta accanto: **un database per test, nessuno eredita lo
   * stato di nessun altro.**
   */
  readonly apri: () => Aperta
}

const implementazioni: readonly Impl[] = [
  {
    nome: 'idb',
    apri: () => {
      const name = dbName()
      return {
        p: createIdbPersistence({ name }),
        scatto: async () => {
          const db = await openCentDatabase({ name })
          const record = await db.get('preImportSnapshot', PRE_IMPORT_SNAPSHOT_ID)
          db.close()
          return record ?? null
        },
      }
    },
  },
  {
    nome: 'memoria',
    apri: () => {
      const disco = emptyDisk()
      return {
        p: createMemoryPersistence(disco),
        scatto: async () => Promise.resolve(disco.snapshot),
      }
    },
  },
]

for (const { nome, apri } of implementazioni) {
  describe(`scatto pre-import (${nome})`, () => {
    it('non c e finche non c e stato un import', async () => {
      const { p, scatto } = apri()
      await p.write(stato('vecchio', 100))
      expect(await scatto()).toBeNull()
      p.close()
    })

    it('l import lo lascia, e lo prende dal disco', async () => {
      const { p, scatto } = apri()
      const vecchio = stato('vecchio', 100)
      await p.write(vecchio)

      expect(await p.replaceAll(stato('nuovo', 900), PRIMA)).toBe(PRIMA)

      // L'archivio e' quello importato...
      const dopo = await p.loadAll()
      expect(dopo.expenses.map((e) => e.id)).toEqual(['e-nuovo'])
      // ...e lo scatto e' quello che c'era, letto dal disco dentro la stessa
      // transazione, non un pacchetto passato dal chiamante (ADR 008).
      const salvato = await scatto()
      expect(salvato?.takenAt).toBe(PRIMA)
      expect(salvato?.data.expenses.map((e: { id: string }) => e.id)).toEqual(['e-vecchio'])
      expect(salvato?.data.expenses[0]?.amountCents).toBe(100)
      p.close()
    })

    it('ne esiste sempre e solo uno, l ultimo', async () => {
      const { p, scatto } = apri()
      await p.write(stato('primo', 100))
      await p.replaceAll(stato('secondo', 200), PRIMA)
      await p.replaceAll(stato('terzo', 300), DOPO)

      // Il secondo import ha sovrascritto lo scatto del primo: si torna allo
      // stato di mezz'ora fa, non a quello di stamattina. Nessun orologio e
      // nessuna scadenza — l'id e' una costante, quindi il secondo non esiste.
      const salvato = await scatto()
      expect(salvato?.takenAt).toBe(DOPO)
      expect(salvato?.data.expenses.map((e: { id: string }) => e.id)).toEqual(['e-secondo'])
      p.close()
    })

    /* **Qui c'erano due test del ripristino**, e sono usciti con lui: *"la rete
     * si usa una volta"* e *"senza scatto non si scrive niente"*. Erano prove di
     * `restoreSnapshot`, differita al commit che la chiama — e un test che
     * sopravvive alla funzione che prova e' un test che prova un'altra cosa.
     *
     * Le due proprieta' che dimostravano non sono decadute: stanno in ADR 026,
     * §"Il lato lettura, differito", e **tornano con il loro test** insieme al
     * codice. */

    it('non protegge il segnaposto delle ricorrenti, e non deve (ADR 018)', async () => {
      // Sta qui, sulle **due** implementazioni, perche' e' qui che la
      // "riparazione" verrebbe scritta: `advanceRecurringMarkers` ha la sua
      // guardia di monotonia, e chi la vedesse potrebbe pensare che manchi
      // anche di qua. Non manca: manca apposta. Un import sostituisce la
      // storia, e chiedere monotonia attraverso quel confine e' come chiedere a
      // un orologio di essere monotono attraverso l'atto di rimetterlo.
      const { p, scatto } = apri()
      const avanti = {
        ...stato('vecchio', 100),
        recurringRules: [makeRule({ id: 'r-1', startDate: '2026-07-01', lastMaterializedDate: '2026-09-02' })],
      }
      await p.write(avanti)
      const indietro = {
        ...stato('nuovo', 900),
        recurringRules: [makeRule({ id: 'r-1', startDate: '2026-07-01', lastMaterializedDate: '2026-07-01' })],
      }
      await p.replaceAll(indietro, PRIMA)

      expect((await p.loadAll()).recurringRules[0]?.lastMaterializedDate).toBe('2026-07-01')
      // E lo scatto tiene anche questo: e' lo stato intero, segnaposto compreso.
      expect((await scatto())?.data.recurringRules[0]?.lastMaterializedDate).toBe('2026-09-02')
      p.close()
    })

    it('su un archivio mai inizializzato non c e niente da salvare', async () => {
      const { p, scatto } = apri()
      // Nessun record `settings`: non esiste nessuno stato a cui tornare, e uno
      // scatto di niente sarebbe una voce che promette un ripristino vuoto.
      expect(await p.replaceAll(stato('nuovo', 900), PRIMA)).toBeNull()
      expect(await scatto()).toBeNull()
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
    // La versione al momento dello scatto: e' l'unico istante in cui si puo'
    // sapere, e serve al ripristino per portare il carico alla versione di
    // allora. Ricostruirla dopo sarebbe indovinarla.
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

/* **Qui c'erano i due test del carico che attraversa le migrazioni**, e sono
 * usciti con `snapshotPayload`. Cio' che resta sotto guardia e' il fatto che
 * rende possibile quella migrazione: lo scatto **scrive** la propria
 * `schemaVersion`, che e' l'unico momento in cui quel numero si puo' sapere. */
