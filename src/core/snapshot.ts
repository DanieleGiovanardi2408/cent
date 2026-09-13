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

import { SCHEMA_VERSION, migrateRawData } from './schema'
import type { RawDataSet } from './schema'
import { PRE_IMPORT_SNAPSHOT_ID } from './types'
import type { DataSet, PreImportSnapshot, Settings, Timestamp } from './types'

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
 * Il carico dello scatto, portato alla versione corrente dello schema.
 *
 * **E' rientrata col suo chiamante**, che e' la regola con cui era uscita: la
 * riga *"una funzione si spedisce insieme al suo chiamante, o non si spedisce"*
 * vale nei due versi, e `restoreSnapshot` esiste da questo commit.
 *
 * ## Perche' la migrazione sta qui e non nella transazione di upgrade
 *
 * L'argomento e' accanto a `MIGRATED_STORES` in `schema.ts`: migrare lo scatto
 * all'upgrade vorrebbe dire riscrivere fino a 1,3 MB davanti al primo frame
 * dopo un aggiornamento, per un carico che potrebbe non essere ripristinato
 * mai. Quindi lo scatto porta scritta **dentro di se'** la versione con cui e'
 * stato preso, e la paga chi lo ripristina — una volta sola, se mai.
 *
 * ## Il caso che questa funzione esiste per prendere
 *
 * Si importa un backup a schema 6; qualche giorno dopo l'app si aggiorna e
 * porta lo schema a 7; poi si tocca "Torna indietro". Senza questa riga
 * l'archivio si riempirebbe di record **di forma vecchia** — non un errore, un
 * danno silenzioso su dati irripetibili, che nessuna schermata mostrerebbe
 * finche' qualcosa non prova a leggere un campo che li' non c'e'.
 *
 * E' il ramo che il test copre per primo, non il giro felice: il giro felice
 * (`schemaVersion === SCHEMA_VERSION`) non attraversa nessuna riga di
 * `migrateRawData`, quindi un test che provasse solo quello proverebbe soltanto
 * che il `return` anticipato funziona.
 *
 * ## `DataSet` da una parte, `RawDataSet` dall'altra
 *
 * Le migrazioni lavorano su record grezzi, dove `settings` e' un array di zero
 * o un elemento (`RawDataSet`); lo scatto tiene un `DataSet`, dove `settings`
 * e' **il** record. La conversione e' nelle due righe qui sotto e sta a vista
 * apposta: e' l'unico punto in cui le due forme si toccano, ed e' piu' onesto
 * di una terza forma che le somigli a entrambe.
 */
export function snapshotPayload(snapshot: PreImportSnapshot): DataSet {
  if (snapshot.schemaVersion === SCHEMA_VERSION) return snapshot.data
  const raw = migrateRawData(
    { ...snapshot.data, settings: [snapshot.data.settings] } as unknown as RawDataSet,
    snapshot.schemaVersion,
  )
  return { ...(raw as unknown as DataSet), settings: raw.settings[0] as unknown as Settings }
}
