/**
 * Chiavi di `localStorage` ritirate.
 *
 * Una versione precedente scriveva l'esito di `navigator.storage.persist()` in
 * `localStorage`. Quel flag e' stato eliminato — la fonte di verita' e'
 * `navigator.storage.persisted()`, che si interroga a ogni avvio (vedi
 * `persist.ts` e la nota in `src/core/types.ts`) — ma sui dispositivi che
 * avevano gia' aperto l'app la chiave e' rimasta li', orfana e invisibile.
 *
 * L'elenco e' esplicito e vive in un posto solo: quando un giorno si ritirera'
 * un'altra chiave, si aggiunge una riga qui invece di lasciarla in giro per
 * sempre. Non si legge il valore e non se ne fa niente: si cancella.
 *
 * Nessun flag "pulizia gia' fatta": costerebbe una chiave nuova per non fare una
 * `removeItem` che su una chiave assente non costa nulla.
 */

/** Chiavi che nessuna versione attuale scrive piu'. Ordine cronologico. */
const RETIRED_KEYS: readonly string[] = [
  // fase 0: esito di navigator.storage.persist(), sostituito da persisted().
  'cent.storagePersisted.v1',
]

/**
 * Rimuove le chiavi ritirate. Non lancia mai: in navigazione privata su Safari
 * il solo accesso a `localStorage` puo' lanciare, e non e' un motivo per non
 * avviare l'app.
 */
export function clearRetiredStorageKeys(): void {
  try {
    for (const key of RETIRED_KEYS) localStorage.removeItem(key)
  } catch {
    // Storage non accessibile: non c'e' niente da pulire e niente da dire.
  }
}
