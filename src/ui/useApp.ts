import { useEffect, useState } from 'preact/hooks'
import { getAppState, subscribeApp } from '../app/boot'
import type { AppState } from '../app/boot'

/**
 * Lo stato dell'app, aggiornato a ogni cambiamento del mirror.
 *
 * Il `setState` dentro l'effetto non e' di troppo: fra il primo render e
 * l'esecuzione dell'effetto il database puo' essersi gia' aperto, e senza quella
 * riga la UI resterebbe sul guscio finche' non cambia qualcos'altro.
 */
export function useApp(): AppState {
  const [state, setState] = useState<AppState>(getAppState)

  useEffect(() => {
    setState(getAppState())
    return subscribeApp(() => setState(getAppState()))
  }, [])

  return state
}
