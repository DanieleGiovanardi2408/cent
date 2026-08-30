import { describe, expect, it } from 'vitest'

import { DEFAULT_CATEGORY_SEEDS } from '../core/defaults'
import { inkContrast, inkOn } from './ink'

/**
 * **La garanzia della spunta adattiva: otto tinte, un pavimento.**
 *
 * Dalla decisione X la tavolozza dipinge le chiavi a **tinta piena**, e la
 * spunta che dice quale e' scelta ci sta sopra. Con `--text` fisso quel glifo
 * scendeva a 2,81:1 su Svago e 2,77:1 su Extra — sotto il 3:1 che WCAG 1.4.11
 * chiede a un elemento non testuale che porta uno stato.
 *
 * Il test legge le tinte da `defaults.ts` e **non le ricopia**: una copia qui
 * sarebbe una seconda fonte di verita' che resta verde mentre la palette cambia
 * — la stessa ragione per cui `scripts/palette.mjs` le legge invece di
 * elencarle.
 *
 * **Otto casi e non sedici**: `Category.color` e' una colonna sola (ADR 025), la
 * stessa tinta sui due fondi, quindi la superficie su cui la spunta si legge non
 * dipende dal tema. Se un giorno tornassero due colonne, questo test va
 * raddoppiato — ed e' scritto qui perche' chi lo raddoppia sappia perche'.
 */
describe('inkOn — la spunta sopra la tinta piena', () => {
  it('sta sopra 3:1 su tutte e otto le tinte di default', () => {
    const sotto = DEFAULT_CATEGORY_SEEDS.filter((s) => inkContrast(s.color) < 3).map(
      (s) => `${s.key} ${s.color}: ${inkContrast(s.color).toFixed(2)}:1`,
    )
    expect(sotto, 'una tinta di default non regge la spunta in nessuno dei due inchiostri').toEqual(
      [],
    )
  })

  it('sceglie davvero fra i due, e non restituisce sempre lo stesso', () => {
    // Se sbagliasse verso e tornasse sempre bianco, il primo test passerebbe
    // lo stesso su meta' palette: la prova che la funzione **sceglie** e' che
    // sulle otto compaiano tutti e due gli inchiostri.
    const inchiostri = new Set(DEFAULT_CATEGORY_SEEDS.map((s) => inkOn(s.color)))
    expect([...inchiostri].sort()).toEqual(['#12181f', '#ffffff'])
  })

  it('sceglie lo scuro dove il bianco non regge, e viceversa', () => {
    // Due casi nominati, uno per verso, presi dai due estremi misurati.
    expect(inkOn('#00a6c6'), 'Coffeeshop e\' chiara: vuole inchiostro scuro').toBe('#12181f')
    expect(inkOn('#2a6198'), 'Extra e\' scura: vuole inchiostro bianco').toBe('#ffffff')
  })

  it('non lancia su una tinta che non sa leggere, e ripiega sul bianco', () => {
    // Arriva da un backup altrui: un foglio che non si apre e' peggio di una
    // spunta con poco contrasto.
    for (const rotta of ['', 'rosso', '#12345', 'rgb(0,0,0)', '#gggggg']) {
      expect(inkOn(rotta), `"${rotta}" ha fatto qualcosa di diverso dal ripiego`).toBe('#ffffff')
    }
  })

  it('accetta la forma corta a tre cifre', () => {
    expect(inkOn('#fff')).toBe(inkOn('#ffffff'))
    expect(inkOn('#000')).toBe(inkOn('#000000'))
  })
})
