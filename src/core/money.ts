/**
 * Denaro: sempre interi in centesimi. Nessun float attraversa questo modulo,
 * tranne l'ultimo passo di `divideCents`, che lo corregge subito.
 *
 * ## Qui non si formatta piu' niente, ed e' il punto del modulo
 *
 * Fino alla fase 3 questo file conteneva `formatCents`, con `'it-IT'` scritto
 * dentro. Era **presentazione dentro il dominio**, e si e' visto solo quando le
 * lingue sono diventate due: il core avrebbe dovuto sapere quale lingua sta
 * guardando l'utente per rispondere "quanto fa". Non e' affar suo.
 *
 * Ora il confine e': **il core restituisce interi, la UI li scrive**. Il
 * formatter vive in `src/ui/i18n`, dove sta anche il locale attivo.
 *
 * Cio' che e' rimasto qui e' aritmetica e invarianti: la somma che non deriva,
 * la divisione che non promette piu' di quanto c'e', e `assertCents` — che e'
 * l'invariante "il denaro e' un intero", non una scelta di presentazione, e per
 * questo lo riusa anche il formatter della UI invece di riscriverselo.
 *
 * Non c'e' nessun parser di stringhe, e non e' una dimenticanza: **in
 * quest'app il denaro non entra mai come testo**. Il tastierino e' cents-first
 * (si digitano solo cifre e l'importo si riempie da destra: `1250` -> `12,50`,
 * ADR 004), quindi la UI produce una sequenza di cifre e non una stringa da
 * interpretare; l'import JSON legge numeri interi e li valida con `intCents`
 * (`backup.ts`); il CSV e' dichiarato non reimportabile.
 *
 * E' anche il motivo per cui due lingue non hanno aggiunto nessun rischio:
 * **non esiste parsing dipendente dal locale**, solo output. Un'app che
 * accettasse `12,50` scritto a mano avrebbe dovuto decidere cosa farne in
 * inglese, dove quella virgola separa le migliaia.
 */

/** Importo in centesimi. Sempre un intero sicuro. */
export type Cents = number

/**
 * L'invariante del denaro: un intero sicuro di centesimi, e nient'altro.
 *
 * E' esportata perche' la usa anche il formatter in `src/ui/i18n`: un importo
 * malformato deve morire dove nasce, non comparire a schermo come `NaN €`. La
 * regola e' del dominio, la resa e' della UI — la riga che le separa passa qui.
 */
export function assertCents(cents: Cents): void {
  if (!Number.isSafeInteger(cents)) {
    throw new TypeError(`Importo non valido: atteso un intero in centesimi, ricevuto ${cents}`)
  }
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
