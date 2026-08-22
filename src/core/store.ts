/**
 * Store osservabile minimo. Trenta righe al posto di una dipendenza.
 *
 * Notifica **in modo sincrono**: chi modifica vede i sottoscrittori aggiornati
 * prima che la sua chiamata ritorni. E' quello che serve alla regola dei 100 ms
 * (tap -> feedback) e rende i test deterministici senza attese.
 *
 * Lo stato si sostituisce, non si muta: i sottoscrittori confrontano per
 * identita' senza doversi fidare di nessuno.
 */

export type Listener<T> = (state: T) => void

export interface Observable<T> {
  get(): T
  set(next: T): void
  update(reducer: (previous: T) => T): void
  /** Restituisce la funzione per disiscriversi. */
  subscribe(listener: Listener<T>): () => void
}

export function createObservable<T>(initial: T): Observable<T> {
  let state = initial
  const listeners = new Set<Listener<T>>()

  function set(next: T): void {
    if (Object.is(next, state)) return
    state = next
    // Copia: un sottoscrittore che si disiscrive mentre viene notificato non
    // deve poter accorciare l'elenco che stiamo scorrendo.
    for (const listener of [...listeners]) listener(state)
  }

  return {
    get: () => state,
    set,
    update: (reducer) => set(reducer(state)),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
