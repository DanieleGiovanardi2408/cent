import { useEffect, useState } from 'preact/hooks'
import { applyPendingUpdate, isUpdatePending, onUpdatePending } from '../app/sw-update'
import './UpdateBanner.css'

type BannerState = 'hidden' | 'ready' | 'applying'

/**
 * Avviso di aggiornamento. Sta in alto, ancorato allo schermo: il basso e'
 * riservato a FAB, bottom sheet e tastierino (fase 2) e questo avviso non deve
 * mai coprirli. E' `position: fixed`, quindi comparire non sposta nulla: CLS 0.
 *
 * Chi non lo tocca resta sulla versione vecchia, e va bene (ADR 005).
 */
export function UpdateBanner() {
  const [state, setState] = useState<BannerState>(isUpdatePending() ? 'ready' : 'hidden')

  useEffect(() => onUpdatePending(() => setState('ready')), [])

  const applying = state === 'applying'

  // La regione live esiste sempre, anche vuota: un `role="status"` inserito
  // nel DOM insieme al suo contenuto non viene annunciato da VoiceOver.
  // Da vuota e' `display: none` (vedi .updater:empty), quindi non occupa nulla.
  return (
    <div class="updater" role="status" aria-live="polite">
      {state === 'hidden' ? null : (
        <div class="updater__inner">
          <button
            type="button"
            class="updater__action"
            aria-busy={applying}
            disabled={applying}
            onClick={() => {
              // Feedback immediato: il testo cambia nello stesso frame del tap.
              // Il reload arriva dopo, quando il worker nuovo ha preso il controllo.
              setState('applying')
              applyPendingUpdate()
            }}
          >
            <svg class="updater__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M12 4v11" />
              <path d="M7.5 10.5 12 15l4.5-4.5" />
              <path d="M5 19h14" />
            </svg>
            <span class="updater__text">
              <span class="updater__title">
                {applying ? 'Aggiornamento in corso' : 'Nuova versione disponibile'}
              </span>
              {applying ? null : <span class="updater__hint">Tocca per aggiornare</span>}
            </span>
          </button>

          {applying ? null : (
            <button
              type="button"
              class="updater__dismiss"
              aria-label="Non ora, resta su questa versione"
              onClick={() => setState('hidden')}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
