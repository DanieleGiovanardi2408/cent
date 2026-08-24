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
 * La stessa regola decide il caso in cui **il conto non si puo' fare**: un
 * `createdAt` illeggibile o un orologio tornato indietro accendono la banda
 * senza numero, invece di spegnerla. Vedi `backupNudge` piu' sotto.
 *
 * ## Due soglie, non una
 *
 * 14 giorni da una copia osservata, **7 per chi non ne ha mai fatta una**. La
 * ragione della seconda: il backup che non avviene mai e' il primo. Vedi
 * `BACKUP_FIRST_GRACE_DAYS`.
 *
 * ## Perche' e' una funzione pura e non tre `if` dentro un componente
 *
 * Perche' la regola ha quattro pezzi che si sbagliano in silenzio — le **due**
 * soglie, il caso senza dati e il conto che non torna — e provarli a mano
 * vorrebbe dire spostare l'orologio a mano. Qui si provano con un argomento.
 *
 * Non basta che siano provati: il test dev'essere scritto **sulla regola
 * decisa**, non su quella implementata. Questo file ha avuto per due commit una
 * soglia sola e un test verde che la confermava.
 */

/**
 * Due settimane da un backup **osservato**. E' la cadenza del brief.
 */
export const BACKUP_GRACE_DAYS = 14

/**
 * Una settimana per chi **non ha mai esportato**, ed e' un numero diverso di
 * proposito.
 *
 * La ragione non e' "prima e' meglio": e' che i due casi hanno probabilita'
 * opposte di risolversi da soli. Chi ha gia' esportato una volta sa dov'e' il
 * bottone e ci torna; **il backup che non avviene mai e' il primo**, e chi non
 * e' entrato in Impostazioni in una settimana non ci entrera' spontaneamente.
 *
 * Non e' un campo nuovo e non e' una migrazione: la distinzione fra le due
 * soglie e' `lastBackupAt` assente contro presente, che e' gia' nel modello.
 *
 * Il codice aveva **una soglia sola** — lo stesso confronto per entrambi i
 * rami, con `ever` a cambiare soltanto la frase — per due commit dopo che
 * questa decisione era stata scritta. E il test la sorvegliava cosi' com'era,
 * cioe' era verde perche' controllava la regola vecchia: e' il modo in cui una
 * decisione presa smette di esistere senza che niente diventi rosso.
 */
export const BACKUP_FIRST_GRACE_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export interface BackupNudge {
  /**
   * Giorni interi dall'ultima copia osservata (o dal primo avvio).
   *
   * **`null` = non si puo' dire da quanto**: la data di riferimento non si
   * legge, o l'orologio e' andato indietro. Non e' zero e non e' un numero
   * grande — e' l'assenza di un conto, e la banda lo dice con parole sue invece
   * di stampare una cifra inventata.
   */
  readonly days: number | null
  /** `false` = non ha mai esportato: e' un'altra frase, non lo stesso numero. */
  readonly ever: boolean
}

/**
 * `null` = non c'e' niente da dire.
 *
 * Tace in **due** casi, e nessuno dei due e' una scorciatoia:
 *
 * - **archivio vuoto**: non c'e' niente da perdere, e un promemoria al primo
 *   avvio insegnerebbe solo a ignorarlo;
 * - **sotto la soglia**, che sono due: 14 giorni da una copia osservata, 7 per
 *   chi non ne ha mai fatta una.
 *
 * Il riferimento quando non si e' mai esportato e' `settings.createdAt`, cioe'
 * il primo avvio su questo dispositivo: non l'istante della prima spesa, che
 * dopo un import sarebbe vecchio di mesi e accenderebbe il promemoria su dati
 * appena arrivati da un backup.
 *
 * ## Il conto che non torna accende, non spegne
 *
 * `daysSince` restituisce `null` su un `createdAt` illeggibile o su un orologio
 * tornato indietro. Qui quel `null` **non e' piu' un `return null`**: prima lo
 * era, ed era il difetto peggiore di questa funzione, perche' era silenzioso in
 * tutti e due i sensi — un timestamp rotto spegneva il promemoria **per
 * sempre**, e non c'era nessun canale che dicesse perche'.
 *
 * CLAUDE.md ("Backup") dice che un indicatore di sicurezza che puo' sbagliare
 * deve sbagliare **verso l'allarme**: un banner che tace a torto lascia senza
 * copia chi crede di averla, uno che insiste a torto costa un tap. Un orologio
 * spostato a mano e un fuso cambiato in volo — cioe' i due modi in cui questo
 * `null` succede davvero — sono anche esattamente il genere di situazione in
 * cui i dati sul telefono non sono stati copiati da un pezzo.
 *
 * Cio' che si perde e' solo il **numero**, e infatti non viene inventato:
 * `days` resta `null` e la banda cambia frase.
 */
export function backupNudge(
  settings: Settings,
  expenses: readonly Expense[],
  now: Timestamp,
): BackupNudge | null {
  if (expenses.length === 0) return null
  const ever = settings.lastBackupAt !== undefined
  const days = daysSince(settings.lastBackupAt ?? settings.createdAt, now)
  if (days === null) return { days: null, ever }
  if (days < (ever ? BACKUP_GRACE_DAYS : BACKUP_FIRST_GRACE_DAYS)) return null
  return { days, ever }
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
