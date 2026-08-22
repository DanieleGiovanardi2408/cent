/**
 * Denaro: sempre interi in centesimi. Nessun float attraversa questo modulo,
 * tranne l'ultimo passo della formattazione (delegato a Intl).
 *
 * Non c'e' nessun parser di stringhe, e non e' una dimenticanza: **in
 * quest'app il denaro non entra mai come testo**. Il tastierino e' cents-first
 * (si digitano solo cifre e l'importo si riempie da destra: `1250` -> `12,50`,
 * ADR 004), quindi la UI produce una sequenza di cifre e non una stringa da
 * interpretare; l'import JSON legge numeri interi e li valida con `intCents`
 * (`backup.ts`); il CSV e' dichiarato non reimportabile. Un `parseAmountToCents`
 * e' esistito qui con quattro codici di errore e nessun chiamante: e' stato
 * cancellato. Se un giorno servisse, va scritto insieme a chi lo usa.
 */

/** Importo in centesimi. Sempre un intero sicuro. */
export type Cents = number

const eurFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function assertCents(cents: Cents): void {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`Importo non valido: atteso un intero in centesimi, ricevuto ${cents}`)
  }
}

/**
 * Da centesimi a stringa EUR locale it-IT (es. `1.234,56 €`).
 *
 * La divisione per 100 e' l'unico float del modulo: avviene dopo ogni calcolo,
 * su un intero sicuro, e Intl arrotonda comunque a 2 decimali.
 * Nota: it-IT non raggruppa i numeri a 4 cifre (`1234,56 €`, non `1.234,56 €`).
 *
 * E' l'unico formatter del modulo, ed e' per la UI. L'export CSV NON deve usarlo
 * ne' avere una sua variante "senza simbolo": il formato it-IT rompe qualunque
 * parser che si aspetti il punto decimale, e la virgola di `1.234,56` dentro un
 * CSV separato da virgole spacca il campo. Per il CSV: `(cents / 100).toFixed(2)`.
 */
export function formatCents(cents: Cents): string {
  assertCents(cents)
  return eurFormatter.format(cents / 100)
}

/** Somma di importi in centesimi: solo aritmetica intera. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0
  for (const value of values) {
    assertCents(value)
    total += value
  }
  if (!Number.isSafeInteger(total)) {
    throw new RangeError('Somma fuori dagli interi sicuri')
  }
  return total
}

/**
 * Divide un importo in `parts` parti uguali, arrotondando **verso il basso**
 * (floor, non troncamento verso lo zero).
 *
 * ## La politica, e perche' questa
 *
 * Il consumatore e' "disponibile al giorno = rimanente / giorni rimanenti", il
 * numero piu' letto dell'app. L'unica proprieta' che conta e':
 *
 *     divideCents(total, parts) * parts <= total     (per ogni total, parts > 0)
 *
 * cioe' **non promettere mai piu' di quanto c'e'**. Spendere ogni giorno il
 * valore restituito non puo' portare a sforare: il resto della divisione resta
 * come margine, non viene distribuito.
 *
 * Floor e non `Math.trunc` perche' sugli importi negativi le due differiscono e
 * il troncamento romperebbe la proprieta': con `rimanente = -100` su 3 giorni,
 * `trunc` darebbe `-33` (`-99 > -100`, cioe' "recupera 33 al giorno e sei a
 * posto": falso), `floor` da' `-34` (`-102 <= -100`). Quando si e' gia' sforato
 * il numero deve pendere dal lato scomodo, non da quello consolante.
 *
 * Il resto non viene ridistribuito (niente "primi N giorni un centesimo in
 * piu'"): qui non si sta ripartendo una somma fra persone, si sta dando un
 * tetto giornaliero, e un tetto uguale tutti i giorni e' l'unico leggibile.
 *
 * @throws RangeError se `parts` non e' un intero >= 1. Zero giorni rimanenti
 * non e' una divisione da arrotondare, e' un periodo finito: e' chi chiama a
 * decidere cosa mostrare (vedi `budget.ts`, che restituisce `null`).
 */
export function divideCents(total: Cents, parts: number): Cents {
  assertCents(total)
  if (!Number.isInteger(parts) || parts < 1) {
    throw new RangeError(`Divisore non valido: atteso un intero >= 1, ricevuto ${parts}`)
  }
  // Correzione esplicita invece di Math.floor(total / parts): sui valori vicini
  // al limite degli interi sicuri la divisione in virgola mobile puo' sbagliare
  // di uno, e qui l'unica cosa che non e' negoziabile e' l'invariante.
  let quotient = Math.trunc(total / parts)
  const remainder = total - quotient * parts
  if (remainder < 0) quotient -= 1
  else if (remainder >= parts) quotient += 1
  return quotient
}
