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

/** Otto, in ordine di frequenza d'uso attesa: i primi chip sono i piu' vicini. */
export const DEFAULT_CATEGORY_SEEDS: readonly CategorySeed[] = [
  { name: 'Spesa', emoji: '🛒', color: '#4c9f70' },
  { name: 'Ristorante', emoji: '🍝', color: '#e07a5f' },
  { name: 'Caffe', emoji: '☕', color: '#8d6e63' },
  { name: 'Trasporti', emoji: '🚇', color: '#3d84a8' },
  { name: 'Casa', emoji: '🏠', color: '#7b6cd9' },
  { name: 'Svago', emoji: '🎬', color: '#d4a017' },
  { name: 'Salute', emoji: '💊', color: '#c05a7a' },
  { name: 'Altro', emoji: '🔖', color: '#6b7280' },
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
