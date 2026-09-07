/**
 * Lo scatto pre-import: come si costruisce.
 *
 * `buildPreImportSnapshot` sta qui invece che dentro le due implementazioni di
 * `Persistence` per la ragione scritta in ADR 008: quella vera e il doppio in
 * memoria devono restare **osservabilmente identiche**, e il modo piu' corto
 * per garantirlo e' che la parte che decide qualcosa sia la **stessa riga di
 * codice** per tutte e due. Qui decide l'id — uno solo e costante, quindi un
 * `put` sostituisce lo scatto di ieri invece di affiancarglisi — e la
 * `schemaVersion` con cui il carico viene timbrato.
 *
 * **Il lato lettura non abita qui**: vedi il commento in fondo al file.
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
 * Il fatto che risolveva non e' decaduto, e non e' scritto qui: sta accanto a
 * `MIGRATED_STORES` in `schema.ts` — il carico si migra **al ripristino**, non
 * all'upgrade — ed e' la ragione per cui la riga qui sopra timbra
 * `schemaVersion`. L'argomento per esteso e' in ADR 026, §"Il lato lettura,
 * differito". */
