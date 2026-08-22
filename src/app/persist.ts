/**
 * Storage persistente.
 *
 * Senza `navigator.storage.persist()` il browser puo' buttare via IndexedDB
 * quando lo spazio scarseggia: per un'app in cui i dati esistono solo qui,
 * sarebbe una perdita definitiva.
 *
 * Comportamento reale per piattaforma:
 * - Chrome, Edge, Firefox e i browser desktop concedono spesso il permesso
 *   senza mostrare nulla, in base a segnali come l'installazione o l'uso
 *   ripetuto. Qui la chiamata serve davvero.
 * - Su iOS Safari il permesso e' di fatto legato alla PWA installata da Home
 *   Screen: nel browser normale la Promise si risolve `false` in silenzio,
 *   senza prompt e senza costo per l'utente.
 *
 * Quindi: si tenta **sempre**, a ogni avvio, finche' non e' concesso. Il caso
 * peggiore e' una Promise che ritorna `false`; non chiamarla e' l'unico modo
 * garantito per non ottenerlo mai. Il display-mode non condiziona la chiamata.
 *
 * Fase 0 non ha ancora IndexedDB ne' Settings: l'esito vive in localStorage.
 * FASE 1: spostare questo flag dentro Settings, insieme a schemaVersion.
 */

const STORAGE_KEY = 'cent.storagePersisted.v1'

/** True se l'app gira come applicazione a se' (Home Screen iOS, PWA installata). */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  // `navigator.standalone` esiste solo su Safari iOS e non e' nel lib DOM.
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone
  return legacy === true || window.matchMedia('(display-mode: standalone)').matches
}

function readFlag(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    // Safari in navigazione privata puo' lanciare: non e' un errore fatale.
    return false
  }
}

function writeFlag(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    /* senza flag rifaremo il controllo al prossimo avvio: costa poco */
  }
}

/**
 * Chiede (una volta concesso, mai piu') che i dati locali non siano sfrattabili.
 * Non blocca l'avvio e non mostra nulla: se fallisce, l'app funziona lo stesso.
 *
 * @returns true se lo storage e' persistente.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (readFlag()) return true
  if (!navigator.storage || typeof navigator.storage.persist !== 'function') return false

  // `persisted()` non mostra prompt e non consuma il "tentativo": si puo' sempre.
  if (await navigator.storage.persisted()) {
    writeFlag()
    return true
  }

  const granted = await navigator.storage.persist()
  if (granted) writeFlag()
  return granted
}
