/**
 * Registrazione del service worker e stato dell'aggiornamento in attesa.
 *
 * `registerType: 'prompt'` (vedi ADR 005): il service worker nuovo si installa
 * ma resta in stato *waiting*, non fa `skipWaiting()` e la pagina non si
 * ricarica da sola. Se nessuno chiama `applyPendingUpdate()`, l'utente resta
 * sulla versione vecchia per sempre — ed e' un esito accettabile: l'app e'
 * single-user, offline, senza backend con cui restare compatibile.
 *
 * `onOfflineReady` non e' gestito di proposito: un'app che a ogni primo avvio
 * annuncia "sono pronta offline" aggiunge rumore e non chiede nulla. Il file e'
 * l'unico posto che parla con il service worker: la UI vede solo tre funzioni.
 */

import { registerSW } from 'virtual:pwa-register'

/** Applica l'aggiornamento in attesa. Definita solo dopo `onNeedRefresh`. */
let applyUpdate: (() => void) | null = null

/** L'unico ascoltatore possibile: in tutta l'app c'e' un avviso solo. */
let listener: (() => void) | null = null

/**
 * Registra il service worker. Da chiamare una volta sola, dopo il load:
 * non serve al primo frame e non deve rubare banda alla prima pittura.
 */
export function registerServiceWorker(): void {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // `updateSW(true)` manda SKIP_WAITING al worker in attesa e ricarica la
      // pagina solo quando lui ha preso il controllo. Il reload e' quindi una
      // conseguenza di un tap, mai un evento a sorpresa.
      applyUpdate = () => void updateSW(true)
      listener?.()
    },
  })
}

/** True se c'e' una versione nuova gia' scaricata e in attesa di un tap. */
export function isUpdatePending(): boolean {
  return applyUpdate !== null
}

/**
 * Avvisa quando arriva un aggiornamento. Se e' gia' arrivato, avvisa subito:
 * il service worker si registra dopo il load, ma nulla garantisce l'ordine.
 *
 * @returns la funzione per disiscriversi.
 */
export function onUpdatePending(callback: () => void): () => void {
  listener = callback
  if (applyUpdate) callback()
  return () => {
    if (listener === callback) listener = null
  }
}

/** Attiva la versione nuova e ricarica. Senza aggiornamento in attesa non fa nulla. */
export function applyPendingUpdate(): void {
  applyUpdate?.()
}
