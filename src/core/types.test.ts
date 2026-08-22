/**
 * Gli id. Un test minuscolo su una funzione di sei righe, ma quella funzione e'
 * la prima cosa che gira al primo avvio: `openRepository` ->
 * `buildDefaultCategories` -> otto `newId()`. Se lancia, l'app non parte.
 *
 * Il caso che rende necessario il fallback non e' esotico: `crypto.randomUUID`
 * e' `[SecureContext]`, quindi su `http://192.168.1.x:5173` (`npm run dev --
 * --host`, il modo con cui si prova l'app su un iPhone vero) in Safari e'
 * `undefined`. Nessun altro test lo vedrebbe mai, perche' ovunque serva un id
 * deterministico i test iniettano `sequentialIds` e `newId` non viene chiamata.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from './types'

/** Formato canonico 8-4-4-4-12, versione 4, variante RFC 4122 (`10xx`). */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * Un `crypto` senza `randomUUID`, come quello di Safari fuori da un contesto
 * sicuro. `getRandomValues` c'e' — e' quello che il fallback deve usare — e
 * conta le chiamate, cosi' il test dimostra che il ramo e' stato *eseguito* e
 * non solo scritto.
 */
function cryptoDiContestoNonSicuro(): { chiamate: () => number } {
  const vero = globalThis.crypto
  let chiamate = 0
  vi.stubGlobal('crypto', {
    getRandomValues: <T extends ArrayBufferView<ArrayBuffer>>(array: T): T => {
      chiamate += 1
      return vero.getRandomValues(array)
    },
  })
  return { chiamate: () => chiamate }
}

describe('newId', () => {
  it('in contesto sicuro delega a crypto.randomUUID', () => {
    // Se questo cade, l'ambiente dei test non ha piu' randomUUID e il ramo
    // "contesto sicuro" qui sotto non e' piu' quello che si crede di provare.
    expect(typeof crypto.randomUUID).toBe('function')
    const randomUUID = vi.spyOn(globalThis.crypto, 'randomUUID')
    const id = newId()
    expect(randomUUID).toHaveBeenCalledTimes(1)
    expect(id).toMatch(UUID_V4)
    randomUUID.mockRestore()
  })

  it('senza randomUUID (http da rete locale) genera lo stesso un UUID v4 valido', () => {
    const spia = cryptoDiContestoNonSicuro()
    const id = newId()
    expect(spia.chiamate(), 'il fallback non ha letto getRandomValues: ramo non eseguito').toBe(1)
    expect(id).toMatch(UUID_V4)
    // Le due parti non casuali, lette esplicitamente invece che via regex.
    expect(id.charAt(14), 'nibble di versione: deve essere 4').toBe('4')
    expect('89ab', 'nibble di variante: deve essere 8, 9, a o b').toContain(id.charAt(19))
    expect(id).toHaveLength(36)
  })

  it('il fallback non collide su un campione grande', () => {
    cryptoDiContestoNonSicuro()
    const visti = new Set<string>()
    for (let i = 0; i < 50_000; i += 1) visti.add(newId())
    expect(visti.size).toBe(50_000)
  })

  it('il fallback riempie davvero tutti i nibble casuali', () => {
    // Un fallback che sbagliasse a scrivere l'esadecimale (byte troncati, zeri
    // fissi) passerebbe la regex e il test di collisione. Qui si guarda che in
    // ogni posizione libera compaia piu' di un valore su cento campioni.
    cryptoDiContestoNonSicuro()
    const perPosizione = Array.from({ length: 36 }, () => new Set<string>())
    for (let i = 0; i < 100; i += 1) {
      const id = newId()
      for (let p = 0; p < 36; p += 1) perPosizione[p]?.add(id.charAt(p))
    }
    const fissi = new Set([8, 13, 18, 23, 14, 19])
    for (let p = 0; p < 36; p += 1) {
      const distinti = perPosizione[p]?.size ?? 0
      if (fissi.has(p)) continue
      expect(distinti, `posizione ${p} sempre uguale su 100 id: entropia mancante`).toBeGreaterThan(1)
    }
  })
})
