import './Toast.css'

/**
 * Il toast con Annulla.
 *
 * In quest'app non e' una cortesia: e' il rimedio immediato a un flusso in cui
 * il tap che salva e' anche la scelta della categoria (ADR 004). Per lo stesso
 * motivo non esistono dialoghi "Sei sicuro?": l'azione si fa subito e si disfa
 * da qui. Non e' pero' l'**unico** rimedio, e non puo' esserlo: dura sei
 * secondi, e l'errore di categoria si vede riguardando la lista un minuto dopo.
 * Da li' in poi il rimedio e' il tap sulla riga nello Storico.
 *
 * Non e' `position: fixed`: e' l'ultima riga della colonna dell'app. Da fisso
 * copriva il tastierino, e "Annulla" cadeva dentro il tasto "9".
 *
 * La regione live sta sempre nel DOM, anche vuota: un `role="status"` inserito
 * insieme al suo contenuto non viene annunciato da VoiceOver.
 */

export interface ToastAction {
  readonly label: string
  readonly run: () => void
}

export interface ToastData {
  /** Cambia a ogni messaggio: rimonta il nodo e rigioca l'animazione d'entrata. */
  readonly id: number
  readonly text: string
  readonly action: ToastAction | null
}

export function Toast({ toast }: { readonly toast: ToastData | null }) {
  return (
    <div class="toast" role="status" aria-live="polite">
      {toast === null ? null : (
        <div class="toast__box" key={toast.id}>
          <p class="toast__text">{toast.text}</p>
          {toast.action === null ? null : (
            <button type="button" class="toast__action" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
