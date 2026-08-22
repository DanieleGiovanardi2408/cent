import { describe, expect, it } from 'vitest'
import {
  formatCents,
  parseAmountToCents,
  sumCents,
  type Cents,
} from './money'

/** Estrae i centesimi o fa fallire il test: niente `as` nei test. */
function cents(input: string): Cents {
  const result = parseAmountToCents(input)
  if (!result.ok) throw new Error(`parse fallito su "${input}": ${result.error}`)
  return result.cents
}

/** Gli spazi di Intl sono non-breaking: li normalizziamo per confronti esatti. */
function norm(text: string): string {
  return text.replace(/[\u00a0\u202f]/g, ' ')
}

describe('parseAmountToCents', () => {
  it('accetta la virgola come separatore decimale', () => {
    expect(parseAmountToCents('12,50')).toEqual({ ok: true, cents: 1250 })
  })

  it('accetta anche il punto come separatore decimale', () => {
    expect(parseAmountToCents('12.50')).toEqual({ ok: true, cents: 1250 })
  })

  it('gestisce gli importi sotto l euro', () => {
    expect(parseAmountToCents('0,05')).toEqual({ ok: true, cents: 5 })
    expect(parseAmountToCents(',5')).toEqual({ ok: true, cents: 50 })
    expect(parseAmountToCents('0,5')).toEqual({ ok: true, cents: 50 })
  })

  it('accetta un importo senza decimali e uno con la virgola pendente', () => {
    expect(parseAmountToCents('12')).toEqual({ ok: true, cents: 1200 })
    expect(parseAmountToCents('12,')).toEqual({ ok: true, cents: 1200 })
  })

  it('rifiuta la stringa vuota con un errore esplicito', () => {
    expect(parseAmountToCents('')).toEqual({ ok: false, error: 'empty' })
    expect(parseAmountToCents('   ')).toEqual({ ok: false, error: 'empty' })
    expect(parseAmountToCents('€')).toEqual({ ok: false, error: 'empty' })
    expect(parseAmountToCents('-')).toEqual({ ok: false, error: 'empty' })
  })

  it('rifiuta il testo non numerico senza mai restituire NaN', () => {
    for (const bad of ['abc', '12a', '1e3', '--1', '12 34x', ',', '.']) {
      const result = parseAmountToCents(bad)
      expect(result.ok).toBe(false)
      expect(result).not.toHaveProperty('cents')
    }
  })

  it("rifiuta piu' di due decimali invece di arrotondare in silenzio", () => {
    expect(parseAmountToCents('1234,567')).toEqual({ ok: false, error: 'too-many-decimals' })
    expect(parseAmountToCents('0,001')).toEqual({ ok: false, error: 'too-many-decimals' })
    // Corollario della regola "separatore singolo = decimale".
    expect(parseAmountToCents('1.234')).toEqual({ ok: false, error: 'too-many-decimals' })
  })

  it('ignora spazi (anche non-breaking) e simbolo di valuta', () => {
    expect(cents(' 12,50 ')).toBe(1250)
    expect(cents('12,50 €')).toBe(1250)
    expect(cents('€ 1 2 , 5 0')).toBe(1250)
  })

  it('riconosce il separatore delle migliaia in entrambe le convenzioni', () => {
    expect(cents('1.234,56')).toBe(123456)
    expect(cents('1,234.56')).toBe(123456)
    expect(cents('1.234.567')).toBe(123456700)
    expect(cents('1,234,567')).toBe(123456700)
  })

  it('rifiuta i raggruppamenti malformati', () => {
    for (const bad of ['1.2345,00', '12.34.567', '1,2.3', '1.234,5,6', '1..2']) {
      expect(parseAmountToCents(bad)).toEqual({ ok: false, error: 'invalid-format' })
    }
  })

  it('gestisce il segno negativo e non produce mai -0', () => {
    expect(cents('-3,20')).toBe(-320)
    expect(cents('+3,20')).toBe(320)
    expect(Object.is(cents('-0,00'), 0)).toBe(true)
  })

  it('rifiuta i valori oltre gli interi sicuri', () => {
    expect(parseAmountToCents('999999999999999999,99')).toEqual({
      ok: false,
      error: 'out-of-range',
    })
  })
})

describe('sumCents', () => {
  it('somma 0,10 + 0,20 come interi: esattamente 30 centesimi', () => {
    const total = sumCents([cents('0,10'), cents('0,20')])
    expect(total).toBe(30)
    expect(total).toBe(cents('0,30'))
    // Lo stesso calcolo in float non ci arriva: e' il motivo di questo modulo.
    expect(0.1 + 0.2).not.toBe(0.3)
  })

  it('somma la lista vuota, i negativi e le liste lunghe senza deriva', () => {
    expect(sumCents([])).toBe(0)
    expect(sumCents([1250, -320, 5])).toBe(935)
    const many = Array.from({ length: 1000 }, () => 10)
    expect(sumCents(many)).toBe(10000)
  })

  it("rifiuta un importo con la virgola: e' un bug, non uno stile", () => {
    expect(() => sumCents([1250, 0.5])).toThrow(TypeError)
    expect(() => sumCents([Number.NaN])).toThrow(TypeError)
  })
})

describe('formatCents', () => {
  it('formatta lo zero', () => {
    expect(norm(formatCents(0))).toBe('0,00 €')
  })

  it('formatta le migliaia con il separatore it-IT', () => {
    expect(norm(formatCents(123456789))).toBe('1.234.567,89 €')
    expect(norm(formatCents(1234567))).toBe('12.345,67 €')
    // it-IT (CLDR) non raggruppa i numeri a 4 cifre: 1234,56 e non 1.234,56.
    expect(norm(formatCents(123456))).toBe('1234,56 €')
  })

  it('formatta i negativi', () => {
    expect(norm(formatCents(-1250))).toBe('-12,50 €')
  })

  it('mostra sempre due decimali', () => {
    expect(norm(formatCents(5))).toBe('0,05 €')
    expect(norm(formatCents(1000))).toBe('10,00 €')
  })

  it('rifiuta un input non intero', () => {
    expect(() => formatCents(12.5)).toThrow(TypeError)
    expect(() => formatCents(Number.POSITIVE_INFINITY)).toThrow(TypeError)
  })

  it('round-trip format -> parse su valori campione', () => {
    for (const value of [0, 5, 99, 100, 1250, 123456, 123456789, -1250]) {
      expect(cents(formatCents(value))).toBe(value)
    }
  })
})
