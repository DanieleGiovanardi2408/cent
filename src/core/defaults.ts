/**
 * I dati con cui l'app parte la prima volta.
 *
 * Le categorie di default esistono per una ragione di flusso, non di comodita':
 * il principio guida n.1 vuole che la prima spesa si inserisca in due tap, e il
 * secondo tap e' un chip di categoria. Senza categorie precaricate il primo uso
 * dell'app sarebbe "vai in Impostazioni e creane una", cioe' esattamente il
 * contrario. Sono modificabili e archiviabili dalla fase 3 in poi.
 */

import type { Category, Settings, Timestamp } from './types'
import { SETTINGS_ID, newId as defaultNewId, nowTimestamp } from './types'
import { SCHEMA_VERSION } from './schema'

export interface CategorySeed {
  readonly name: string
  readonly emoji: string
  readonly color: string
}

/**
 * Otto categorie, nell'ordine esatto in cui la griglia 4x2 le mostra.
 *
 * L'ordine e' **per frequenza di tap alla cassa, non per peso sul budget**: il
 * secondo tap dell'inserimento e' un chip, quindi il posto migliore va a cio'
 * che si tocca piu' spesso, non a cio' che costa di piu'. L'affitto e' la voce
 * piu' grossa dell'anno e non e' qui: dalla fase 5 lo inserira' una ricorrenza,
 * cioe' con zero tap, e un chip che non si tocca mai occuperebbe un posto in
 * griglia togliendolo a uno che si tocca ogni giorno.
 *
 * I `color` qui sotto sono **definitivi**, e sono un sistema unico: non otto
 * scelte separate. Sono stati ricavati per ricerca su OKLCH massimizzando il
 * ΔE00 minimo fra tutte le 28 coppie, valutato anche sulle viste simulate per
 * deuteranopia, protanopia e tritanopia — non a occhio. Dalla fase 6 sono la
 * palette dei grafici, quindi devono restare distinguibili anche come aree
 * adiacenti, non solo come chip distanziati.
 *
 * Il colore **non tinge mai il testo** del chip: nessun singolo esadecimale puo'
 * stare in contrasto AA sia sul fondo chiaro sia su quello scuro. Il colore vive
 * come superficie, l'etichetta usa `--text`. Chi cambia questi valori cambia
 * anche i grafici della fase 6: non e' una scelta estetica locale.
 */
export const DEFAULT_CATEGORY_SEEDS: readonly CategorySeed[] = [
  // Riga 1
  { name: 'Spesa', emoji: '🛒', color: '#81a369' },
  { name: 'Fuori', emoji: '🍽️', color: '#f26b00' },
  { name: 'Coffeeshop', emoji: '🌿', color: '#06b0a0' },
  { name: 'Sigarette', emoji: '🚬', color: '#845e23' },
  // Riga 2
  { name: 'Trasporti', emoji: '🚇', color: '#3f5db6' },
  { name: 'Svago', emoji: '🎬', color: '#b90e5c' },
  { name: 'Casa', emoji: '🏠', color: '#bc85ec' },
  { name: 'Extra', emoji: '🔖', color: '#676c75' },
]

export function buildDefaultCategories(
  now: () => Timestamp = nowTimestamp,
  makeId: () => string = defaultNewId,
): readonly Category[] {
  const timestamp = now()
  return DEFAULT_CATEGORY_SEEDS.map((seed, index) => ({
    id: makeId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: seed.name,
    emoji: seed.emoji,
    color: seed.color,
    // A passi di 10: inserire una categoria fra due esistenti non obbliga a
    // riscrivere tutte le altre.
    order: (index + 1) * 10,
    archived: false,
  }))
}

export function buildDefaultSettings(
  now: () => Timestamp = nowTimestamp,
): Settings {
  const timestamp = now()
  return {
    id: SETTINGS_ID,
    createdAt: timestamp,
    updatedAt: timestamp,
    weekStartsOn: 1,
    theme: 'auto',
    schemaVersion: SCHEMA_VERSION,
  }
}
