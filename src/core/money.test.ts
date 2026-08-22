import { describe, expect, it } from 'vitest'
import { divideCents, formatCents, sumCents } from './money'

/** Gli spazi di Intl sono non-breaking: li normalizziamo per confronti esatti. */
function norm(text: string): string {
  return text.replace(/[\u00a0\u202f]/g, ' ')
}

describe('sumCents', () => {
  it('somma 0,10 + 0,20 come interi: esattamente 30 centesimi', () => {
    const total = sumCents([10, 20])
    expect(total).toBe(30)
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
})

/**
 * Canarino d'ambiente, deciso al gate della fase 2 (docs/ROADMAP.md,
 * "Asserzioni sull'ambiente"). Non prova `formatCents`: prova l'ICU della
 * runtime sotto, che e' l'unica che decide come si scrive un euro.
 *
 * E' un test di **proprieta'**, non di byte: quale dei tre spazi non separabili
 * esca e' irrilevante — sono lo stesso pixel — e se ICU cambia idea fra loro
 * deve restare verde. Cade solo se diventa uno spazio normale, che e' un bug
 * visibile. Per questo `norm()` qui sopra resta: normalizzare gli spazi e' la
 * scelta giusta per il resto della suite, e qui serve un canarino, non venti
 * test fragili.
 */
describe("canarino: lo spazio fra numero e simbolo dell'euro", () => {
  /** U+00A0 no-break, U+202F narrow no-break, U+2007 figure space. */
  const NON_SEPARABILI = new Map([
    ['\u00a0', 'U+00A0 NO-BREAK SPACE'],
    ['\u202f', 'U+202F NARROW NO-BREAK SPACE'],
    ['\u2007', 'U+2007 FIGURE SPACE'],
  ])

  function nome(char: string): string {
    if (char === ' ') return 'U+0020 SPACE (lo spazio normale)'
    return (
      NON_SEPARABILI.get(char) ??
      `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`
    )
  }

  it('non e un carattere su cui si possa andare a capo', () => {
    const reso = formatCents(123456789)
    const posizioneEuro = reso.indexOf('€')
    expect(
      posizioneEuro,
      `formatCents ha reso "${reso}", che non contiene il simbolo €. ` +
        "Non e' cambiato il codice: e' cambiato come l'ICU della runtime scrive " +
        "la valuta per it-IT. Prima di aggiornare questo test, guardare cosa " +
        'mostra davvero la Home.',
    ).toBeGreaterThan(0)

    const separatore = reso.charAt(posizioneEuro - 1)
    expect(
      NON_SEPARABILI.has(separatore),
      `Fra il numero e il simbolo dell'euro c'e' ${nome(separatore)} invece di uno ` +
        'spazio non separabile (U+00A0, U+202F o U+2007). formatCents ha reso ' +
        `"${reso}". Non e' una sottigliezza tipografica: uno spazio normale e' un ` +
        "punto in cui il testo puo' andare a capo, quindi in una colonna stretta " +
        "l'importo si spezza e il simbolo dell'euro finisce sulla riga dopo, " +
        'staccato dalle cifre. Il codice non e\' cambiato: e\' cambiata l\'ICU della ' +
        "runtime che formatta (Node qui, WebKit sull'iPhone). Se e' comparso un " +
        "quarto spazio non separabile, aggiungerlo alla mappa qui sopra: sono lo " +
        'stesso pixel. Se e\' uno spazio normale (U+0020), il difetto e\' nella ' +
        'runtime e la UI va difesa, non il test aggiornato.',
    ).toBe(true)
  })
})

describe('divideCents (politica: floor, mai promettere piu di quanto c e)', () => {
  it('divide esattamente quando non c e resto', () => {
    expect(divideCents(30000, 10)).toBe(3000)
    expect(divideCents(0, 7)).toBe(0)
    expect(divideCents(100, 1)).toBe(100)
  })

  it('scarta il resto invece di distribuirlo', () => {
    // 10,00 euro in 3 giorni: 3,33 al giorno, un centesimo resta come margine.
    expect(divideCents(1000, 3)).toBe(333)
    expect(divideCents(1000, 7)).toBe(142)
    expect(divideCents(1, 2)).toBe(0)
  })

  it('sui negativi arrotonda in basso, non verso lo zero', () => {
    // Il caso che distingue floor da trunc: sforato di 1,00 su 3 giorni.
    expect(divideCents(-100, 3)).toBe(-34)
    expect(divideCents(-1, 2)).toBe(-1)
    expect(divideCents(-300, 3)).toBe(-100)
  })

  it('mantiene l invariante quoziente * parti <= totale, segno qualunque', () => {
    for (let total = -500; total <= 500; total += 7) {
      for (let parts = 1; parts <= 31; parts += 1) {
        expect(divideCents(total, parts) * parts).toBeLessThanOrEqual(total)
      }
    }
  })

  it('resta esatto vicino al limite degli interi sicuri', () => {
    const total = Number.MAX_SAFE_INTEGER
    expect(divideCents(total, 3) * 3).toBeLessThanOrEqual(total)
    expect(divideCents(total, 2)).toBe(Math.floor(total / 2))
  })

  it('rifiuta zero parti: e un periodo finito, non una divisione', () => {
    expect(() => divideCents(1000, 0)).toThrow(RangeError)
    expect(() => divideCents(1000, -3)).toThrow(RangeError)
    expect(() => divideCents(1000, 2.5)).toThrow(RangeError)
  })

  it('rifiuta un totale non intero', () => {
    expect(() => divideCents(10.5, 2)).toThrow(TypeError)
  })
})
