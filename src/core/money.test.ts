import { describe, expect, it } from 'vitest'
import { divideCents, sumCents } from './money'

/*
 * Qui non si prova piu' nessuna formattazione, e non e' una perdita di
 * copertura: `formatCents` non e' stata cancellata, e' **uscita dal dominio**.
 * Vive in `src/ui/i18n` insieme al locale attivo, e li' ci sono i suoi test —
 * canarino sullo spazio non separabile compreso, esteso a tutte e due le
 * lingue. Vedi CLAUDE.md, "La formattazione esce da src/core".
 */

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
