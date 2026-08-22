/**
 * Denaro: sempre interi in centesimi. Nessun float attraversa questo modulo,
 * tranne l'ultimo passo della formattazione (delegato a Intl).
 */

/** Importo in centesimi. Sempre un intero sicuro. */
export type Cents = number

/** Perche' il parse e' fallito. Nessun NaN esce da qui. */
export type MoneyParseError =
  /** Stringa vuota (o composta solo da spazi / simbolo di valuta). */
  | 'empty'
  /** Caratteri non ammessi, separatori incoerenti, raggruppamento malformato. */
  | 'invalid-format'
  /** Piu' di 2 cifre decimali: non arrotondiamo il denaro in silenzio. */
  | 'too-many-decimals'
  /** Valore fuori dall'intervallo degli interi sicuri. */
  | 'out-of-range'

export type ParseAmountResult =
  | { readonly ok: true; readonly cents: Cents }
  | { readonly ok: false; readonly error: MoneyParseError }

const MAX_FRACTION_DIGITS = 2

const eurFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function fail(error: MoneyParseError): ParseAmountResult {
  return { ok: false, error }
}

function countChar(text: string, char: string): number {
  let n = 0
  for (const c of text) if (c === char) n += 1
  return n
}

const DIGITS_ONLY = /^[0-9]*$/

/**
 * Verifica che la parte intera sia composta da gruppi validi (1-3 cifre, poi
 * gruppi da esattamente 3) quando c'e' un separatore delle migliaia.
 */
function joinIntegerGroups(intText: string, groupSep: string): string | null {
  if (groupSep === '') {
    return DIGITS_ONLY.test(intText) ? intText : null
  }
  const groups = intText.split(groupSep)
  for (let i = 0; i < groups.length; i += 1) {
    const g = groups[i] ?? ''
    if (!DIGITS_ONLY.test(g) || g.length === 0) return null
    if (i === 0) {
      if (g.length > 3) return null
    } else if (g.length !== 3) return null
  }
  return groups.join('')
}

/**
 * Converte in centesimi una stringa di provenienza esterna.
 *
 * Il consumatore e' l'**import** (JSON/CSV di fase 7), dove le stringhe arrivano
 * da un file e possono essere malformate davvero. NON e' sulla via del tastierino:
 * l'inserimento e' cents-first (si digitano solo cifre, l'importo si riempie da
 * destra, `1250` -> `12,50`), quindi la UI non produce mai una stringa da parsare.
 * Vedi `docs/adr/004-inserimento-cents-first.md`.
 *
 * Regole sui separatori, deterministiche:
 * - se compaiono sia `,` sia `.`, l'ultimo dei due e' il decimale, l'altro e'
 *   separatore delle migliaia (`1.234,56` e `1,234.56` sono entrambi 123456);
 * - se compare un solo separatore una sola volta, e' decimale (`1.234` ha quindi
 *   3 decimali -> `too-many-decimals`, non 1234 euro: preferiamo l'errore
 *   esplicito all'indovinello);
 * - se lo stesso separatore compare piu' volte, sono migliaia (`1.234.567`).
 */
export function parseAmountToCents(input: string): ParseAmountResult {
  const cleaned = input.replace(/[\s€]/g, '')
  if (cleaned === '') return fail('empty')

  let negative = false
  let body = cleaned
  if (body.startsWith('-')) {
    negative = true
    body = body.slice(1)
  } else if (body.startsWith('+')) {
    body = body.slice(1)
  }
  if (body === '') return fail('empty')
  if (!/^[0-9.,]+$/.test(body)) return fail('invalid-format')

  const commas = countChar(body, ',')
  const dots = countChar(body, '.')
  let decSep = ''
  let groupSep = ''
  if (commas > 0 && dots > 0) {
    decSep = body.lastIndexOf(',') > body.lastIndexOf('.') ? ',' : '.'
    groupSep = decSep === ',' ? '.' : ','
    if (countChar(body, decSep) !== 1) return fail('invalid-format')
  } else if (commas + dots === 1) {
    decSep = commas === 1 ? ',' : '.'
  } else if (commas + dots > 1) {
    groupSep = commas > 0 ? ',' : '.'
  }

  let intText = body
  let fracText = ''
  if (decSep !== '') {
    const i = body.indexOf(decSep)
    intText = body.slice(0, i)
    fracText = body.slice(i + 1)
  }

  if (!DIGITS_ONLY.test(fracText)) return fail('invalid-format')
  if (fracText.length > MAX_FRACTION_DIGITS) return fail('too-many-decimals')

  const intDigits = joinIntegerGroups(intText, groupSep)
  if (intDigits === null) return fail('invalid-format')
  if (intDigits.length === 0 && fracText.length === 0) return fail('invalid-format')

  const units = intDigits === '' ? 0 : Number(intDigits)
  const fraction = fracText === '' ? 0 : Number(fracText.padEnd(MAX_FRACTION_DIGITS, '0'))
  const magnitude = units * 100 + fraction
  if (!Number.isSafeInteger(magnitude)) return fail('out-of-range')

  return { ok: true, cents: magnitude === 0 ? 0 : negative ? -magnitude : magnitude }
}

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
