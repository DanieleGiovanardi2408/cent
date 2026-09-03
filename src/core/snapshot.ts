/**
 * Lo scatto pre-import: come si costruisce e come si rilegge.
 *
 * Due funzioni pure, e stanno qui invece che dentro le due implementazioni di
 * `Persistence` per la ragione scritta in ADR 008: quella vera e il doppio in
 * memoria devono restare **osservabilmente identiche**, e il modo piu' corto
 * per garantirlo e' che la parte che decide qualcosa sia la **stessa riga di
 * codice** per tutte e due. Qui la parte che decide qualcosa e' la migrazione
 * del carico, che non e' banale e che nessuno vorrebbe scritta due volte.
 */

import { SCHEMA_VERSION, migrateRawData } from './schema'
import type { RawDataSet, RawRecord } from './schema'
import { PRE_IMPORT_SNAPSHOT_ID } from './types'
import type {
  Budget,
  Category,
  DataSet,
  Expense,
  PreImportSnapshot,
  RecurringRule,
  Settings,
  Timestamp,
} from './types'

/**
 * Lo scatto da scrivere, dato lo stato che l'archivio ha **adesso**.
 *
 * `takenAt` arriva da fuori: e' un timestamp che attraversa il confine della
 * persistenza, e come tutti gli altri di questo progetto si pregenera perche' un
 * ritentativo riscriva lo stesso record invece di spostarne la data.
 */
export function buildPreImportSnapshot(data: DataSet, takenAt: Timestamp): PreImportSnapshot {
  return {
    id: PRE_IMPORT_SNAPSHOT_ID,
    takenAt,
    schemaVersion: SCHEMA_VERSION,
    data,
  }
}

/**
 * Il carico di uno scatto, portato alla versione corrente dello schema.
 *
 * ## Perche' serve, e non e' un'ipotesi
 *
 * Fra l'import e il ripristino ci puo' stare un aggiornamento dell'app — su una
 * PWA l'aggiornamento arriva da solo — e le migrazioni **non toccano gli store
 * di sistema** (`MIGRATED_STORES`). Senza questo passaggio il ripristino
 * rimetterebbe nell'archivio dei record di forma vecchia, in silenzio, su dati
 * che nessuno puo' ricreare.
 *
 * Passa dalla **stessa** catena del database e dell'import (`MIGRATIONS`), che
 * e' l'unica cosa che impedisce a tre percorsi di divergere al primo schema
 * nuovo (ADR 026 §7).
 *
 * ## Perche' non passa da `parseBackup`
 *
 * Perche' non e' un file. `parseBackup` valida cio' che arriva da fuori — un
 * JSON modificato a mano, un file di un'altra app — e ha il diritto di
 * rifiutare. Questo record l'ha scritto quest'app, in questo database, e va
 * riletto con la stessa fiducia con cui `idb.ts` rilegge una spesa: una rete di
 * sicurezza che puo' rifiutare di aprirsi non e' una rete.
 *
 * ## I due cast
 *
 * Sono gli stessi che fa `applyTransforms` in `idb.ts`, e per la stessa ragione:
 * `RawRecord` e' `Record<string, unknown>`, le entita' sono interfacce, e una
 * `transform` e' una funzione pura su record grezzi che non cambia l'identita'
 * di cio' che non tocca. Non c'e' validazione perche' non c'e' niente da
 * validare: i record sono nostri.
 *
 * @throws SchemaTooNewError se lo scatto viene da una versione piu' recente di
 * questa app — cioe' se qualcuno e' tornato indietro di versione con uno scatto
 * in tasca. Stesso verso della stessa decisione dell'import: rifiutare invece di
 * riscrivere mutilato.
 */
export function snapshotPayload(snapshot: PreImportSnapshot): DataSet {
  if (snapshot.schemaVersion === SCHEMA_VERSION) return snapshot.data
  const before: RawDataSet = {
    expenses: [...snapshot.data.expenses] as unknown as RawRecord[],
    categories: [...snapshot.data.categories] as unknown as RawRecord[],
    recurringRules: [...snapshot.data.recurringRules] as unknown as RawRecord[],
    budgets: [...snapshot.data.budgets] as unknown as RawRecord[],
    settings: [snapshot.data.settings] as unknown as RawRecord[],
  }
  const after = migrateRawData(before, snapshot.schemaVersion)
  return {
    expenses: after.expenses as unknown as readonly Expense[],
    categories: after.categories as unknown as readonly Category[],
    recurringRules: after.recurringRules as unknown as readonly RecurringRule[],
    budgets: after.budgets as unknown as readonly Budget[],
    // Il singleton c'e' sempre: e' entrato come array di uno e nessuna
    // `transform` cancella record. Il ripiego non e' una cortesia — e' la
    // seconda meta' di ADR 008, "chi risolve uno stato ambiguo e' totale".
    settings: (after.settings[0] as unknown as Settings | undefined) ?? snapshot.data.settings,
  }
}
