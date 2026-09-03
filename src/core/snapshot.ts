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

import { SCHEMA_VERSION } from './schema'
import { PRE_IMPORT_SNAPSHOT_ID } from './types'
import type { DataSet, PreImportSnapshot, Timestamp } from './types'

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

/* **Qui c'era `snapshotPayload`**, che portava il carico dello scatto alla
 * versione corrente dello schema prima di riscriverlo. E' uscita con
 * `restoreSnapshot`, il suo unico chiamante: **una funzione si spedisce insieme
 * al suo chiamante, o non si spedisce**.
 *
 * Il fatto che risolveva non e' decaduto — fra l'import e il ripristino ci sta
 * un aggiornamento della PWA, e le migrazioni non toccano gli store di sistema,
 * quindi il carico va migrato **al ripristino** e non all'upgrade. Per questo
 * `PreImportSnapshot.schemaVersion` resta scritto: e' l'unico momento in cui
 * quel numero si puo' sapere, e ricostruirlo dopo sarebbe indovinarlo.
 *
 * L'argomento per esteso sta in ADR 026, §"Il lato lettura, differito". */
