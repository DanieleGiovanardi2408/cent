import type { Expense, Settings, Timestamp } from '../core/types'

/**
 * Il promemoria di backup: quando dirlo, e con quali parole.
 *
 * ## Perche' esiste, e perche' e' una condizione e non un'aggiunta
 *
 * In fase 3 l'export **e' uscito dalla barra** ed e' finito in Impostazioni: a
 * 320 punti barra, due schede e due bottoni non ci stanno, e fra i due quello
 * che si tocca una volta ogni due settimane e' l'export.
 *
 * Ma quel bottone non era solo un accesso: **era un promemoria**. Vederlo faceva
 * esportare. Sepolto in Impostazioni, la frequenza di backup scende — e da
 * adesso non sono piu' i dati di una persona sola. Togliere una rete senza
 * metterne un'altra non e' un compromesso, e' una perdita: o c'e' questo, o
 * l'export torna in barra.
 *
 * ## Sbaglia verso l'allarme, di proposito
 *
 * `lastBackupAt` si scrive **solo** sugli esiti che l'app ha davvero osservato:
 * una condivisione risolta, una copia negli appunti confermata. Il ramo
 * `<a download>` non lo scrive, perche' in PWA standalone puo' non fare
 * assolutamente nulla senza dare errore.
 *
 * Conseguenza voluta: chi esporta da quel ramo si vede tornare il promemoria
 * dopo due settimane anche se il file ce l'ha. E' la direzione giusta — un
 * indicatore di sicurezza che puo' sbagliare deve sbagliare verso l'allarme
 * (CLAUDE.md, "Backup"). Un banner che tace a torto lascia senza copia chi crede
 * di averla; uno che insiste a torto costa un tap.
 *
 * ## Perche' e' una funzione pura e non tre `if` dentro un componente
 *
 * Perche' la regola ha tre pezzi che si sbagliano in silenzio — la soglia, il
 * "mai esportato" e il caso senza dati — e provarli a mano vorrebbe dire
 * spostare l'orologio a mano. Qui si provano con un argomento.
 */

/** Due settimane. La stessa soglia scritta in CLAUDE.md, non un secondo numero. */
export const BACKUP_GRACE_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export interface BackupNudge {
  /** Giorni interi dall'ultima copia osservata (o dal primo avvio). */
  readonly days: number
  /** `false` = non ha mai esportato: e' un'altra frase, non lo stesso numero. */
  readonly ever: boolean
}

/**
 * `null` = non c'e' niente da dire.
 *
 * Tace in due casi, e nessuno dei due e' una scorciatoia:
 *
 * - **archivio vuoto**: non c'e' niente da perdere, e un promemoria al primo
 *   avvio insegnerebbe solo a ignorarlo;
 * - **sotto la soglia**: due settimane sono la cadenza gia' scritta nel brief.
 *
 * Il riferimento quando non si e' mai esportato e' `settings.createdAt`, cioe'
 * il primo avvio su questo dispositivo: non l'istante della prima spesa, che
 * dopo un import sarebbe vecchio di mesi e accenderebbe il promemoria su dati
 * appena arrivati da un backup.
 */
export function backupNudge(
  settings: Settings,
  expenses: readonly Expense[],
  now: Timestamp,
): BackupNudge | null {
  if (expenses.length === 0) return null
  const days = daysSince(settings.lastBackupAt ?? settings.createdAt, now)
  if (days === null || days < BACKUP_GRACE_DAYS) return null
  return { days, ever: settings.lastBackupAt !== undefined }
}

/**
 * Giorni interi fra due istanti, `null` se non se ne puo' dire niente.
 *
 * Un timestamp illeggibile o un orologio spostato indietro producono `null` e
 * non un numero: un `NaN` che passa per vero dentro un confronto e' il modo in
 * cui un indicatore comincia a mentire senza che nessuno lo veda.
 *
 * La usano in due — il promemoria e la riga di stato in Impostazioni — e sono
 * la stessa informazione: due conti separati avrebbero potuto dire due numeri
 * diversi nella stessa schermata.
 */
export function daysSince(from: Timestamp, now: Timestamp): number | null {
  const elapsed = Date.parse(now) - Date.parse(from)
  if (!Number.isFinite(elapsed) || elapsed < 0) return null
  return Math.floor(elapsed / DAY_MS)
}
