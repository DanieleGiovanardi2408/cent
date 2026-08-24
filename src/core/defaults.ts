/**
 * I dati con cui l'app parte la prima volta.
 *
 * Le categorie di default esistono per una ragione di flusso, non di comodita':
 * il principio guida n.1 vuole che la prima spesa si inserisca in due tap, e il
 * secondo tap e' un chip di categoria. Senza categorie precaricate il primo uso
 * dell'app sarebbe "vai in Impostazioni e creane una", cioe' esattamente il
 * contrario. Sono modificabili e archiviabili dalla fase 3 in poi.
 *
 * Quello che qui dentro **non** c'e' piu' sono i nomi. Emoji, colori e ordine
 * sono dominio; le etichette sono lingua, e la lingua la risolve `src/app`
 * leggendo l'ambiente. Arrivano come argomento di `buildDefaultCategories`,
 * cioe' la stessa iniezione ordinaria che gia' vale per `now` e `makeId`.
 */

import type { Category, Settings, Timestamp } from './types'
import { SETTINGS_ID, newId as defaultNewId, nowTimestamp } from './types'
import { SCHEMA_VERSION } from './schema'

/**
 * Le otto caselle della griglia di default, come identita' stabili.
 *
 * **Non e' la chiave che finisce nel record.** `Category.name` resta una
 * stringa e basta (CLAUDE.md, "Alternativa scartata: salvare una chiave invece
 * di un nome"): questa chiave vive solo qui e nel chiamante, il tempo di
 * appaiare un nome tradotto alla casella giusta, e non attraversa ne' il disco
 * ne' il backup. Serve a una cosa sola: rendere impossibile passare gli otto
 * nomi **nell'ordine sbagliato** — con una tupla di otto stringhe, scambiare
 * "Sigarette" e "Trasporti" compilerebbe.
 *
 * Sono in inglese perche' l'inglese e' l'originale (CLAUDE.md, "Stati vuoti con
 * copy vero"), non perche' sia la lingua di default dell'app.
 */
export type DefaultCategoryKey =
  | 'groceries'
  | 'eatingOut'
  | 'coffeeshop'
  | 'cigarettes'
  | 'transport'
  | 'leisure'
  | 'home'
  | 'extra'

/**
 * I nomi con cui scrivere le otto categorie di default, gia' nella lingua
 * risolta.
 *
 * E' un `Record` completo: **dimenticarne uno e' un errore di compilazione**,
 * esattamente come per il dizionario inglese di `src/ui/i18n`.
 */
export type DefaultCategoryNames = Readonly<Record<DefaultCategoryKey, string>>

export interface CategorySeed {
  readonly key: DefaultCategoryKey
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
  { key: 'groceries', emoji: '🛒', color: '#81a369' },
  { key: 'eatingOut', emoji: '🍽️', color: '#f26b00' },
  { key: 'coffeeshop', emoji: '🌿', color: '#06b0a0' },
  { key: 'cigarettes', emoji: '🚬', color: '#845e23' },
  // Riga 2
  { key: 'transport', emoji: '🚇', color: '#3f5db6' },
  { key: 'leisure', emoji: '🎬', color: '#b90e5c' },
  { key: 'home', emoji: '🏠', color: '#bc85ec' },
  { key: 'extra', emoji: '🔖', color: '#676c75' },
]

/**
 * Le otto categorie di default, **nei nomi che il chiamante ha risolto**.
 *
 * `names` e' il primo parametro e non ha default, quindi non si puo' costruire
 * la griglia iniziale senza aver prima deciso in che lingua scriverla. Non e'
 * pignoleria di firma: fino alla fase 3 questi nomi erano otto stringhe
 * italiane cablate qui dentro, scritte da `openRepository` **prima che una
 * lingua esistesse**, e chi apriva l'app da un telefono non italiano trovava la
 * guida in inglese e otto chip in italiano — cioe' il secondo dei due tap, il
 * solo che decide *cosa* stai salvando, etichettato in una lingua che non
 * legge. Il difetto era l'ordine, non la traduzione: un default qui lo
 * rimetterebbe in piedi in silenzio.
 *
 * Cosa **non** e' un ingresso, e non deve diventarlo: emoji, colori e ordine.
 * L'ordine e' per frequenza di tap alla cassa e i colori sono un sistema unico
 * che dalla fase 6 colora anche i grafici. Sono dati di dominio, e il fatto che
 * non si possano passare da fuori e' cio' che impedisce a un chiamante di
 * seminare otto categorie con la palette sbagliata.
 *
 * Da qui in poi quei nomi sono **dati dell'utente**: cambiare lingua non li
 * ritraduce, e rinominarli e' esattamente cio' che l'editor delle categorie
 * serve a fare.
 */
export function buildDefaultCategories(
  names: DefaultCategoryNames,
  now: () => Timestamp = nowTimestamp,
  makeId: () => string = defaultNewId,
): readonly Category[] {
  const timestamp = now()
  return DEFAULT_CATEGORY_SEEDS.map((seed, index) => ({
    id: makeId(),
    createdAt: timestamp,
    updatedAt: timestamp,
    name: names[seed.key],
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
