import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

import { DEFAULT_CATEGORY_SEEDS } from './defaults'

/**
 * Il cancello sulla palette, esercitato lanciando **lo stesso comando che gira
 * in CI**.
 *
 * ## Perche' un test che apre un processo
 *
 * L'oggetto sotto esame e' `scripts/palette.mjs`, che non e' un modulo del
 * dominio: legge `src/core/defaults.ts` e `src/ui/tokens.css` dal disco e decide
 * con un codice di uscita. Importarne le funzioni sarebbe una prova su un
 * oggetto **diverso** da quello che protegge l'albero — passerebbe verde anche
 * il giorno in cui la lettura dei default smettesse di trovarli, che e'
 * esattamente il difetto piu' probabile di uno script che deriva invece di
 * copiare.
 *
 * ## Le tre cose che questo file tiene ferme, e sono tre difetti diversi
 *
 * 1. **L'aritmetica e' quella giusta.** Un controllo scritto in casa che misura
 *    male passa verde su una palette rotta, e nessuno se ne accorge perche' la
 *    conferma se la da' da solo. Qui la prova viene da fuori: si rimisura la
 *    palette **precedente** e si ritrovano le cifre che il validatore della
 *    skill `dataviz` aveva prodotto e che `docs/ROADMAP.md` (M4, 0f) aveva
 *    registrato — ΔE 9,4 a vista piena, 4,3 in deuteranopia, croma 0,015,
 *    quattro tinte fuori dalla banda scura. Se l'aritmetica di
 *    `scripts/palette.mjs` divergesse da quella, questi numeri non tornerebbero.
 *
 * 2. **Il cancello sa cadere.** Un guardiano va visto rosso almeno una volta
 *    prima di fidarsene, e "l'ho visto rosso una volta a mano" e' una garanzia
 *    che dura un pomeriggio. I quattro pavimenti hanno qui un caso che li fa
 *    cadere uno per uno.
 *
 * 3. **La pairlist e' tutte le 28 coppie.** Il caso a meta' file mette due tinte
 *    identiche in due caselle **non adiacenti**: con una pairlist sulle sole
 *    adiacenti passerebbe. E' la decisione scritta nell'intestazione dello
 *    script, tenuta ferma da un test invece che da un commento.
 */

const SCRIPT = 'scripts/palette.mjs'

interface Referto {
  readonly status: number | null
  readonly text: string
  readonly json: {
    readonly ok: boolean
    readonly p1: { readonly floor: number; readonly worst: number; readonly failures: number }
    readonly p2: {
      readonly floor: number
      readonly worst: number
      readonly kind: string
      readonly failures: number
    }
    readonly p3: { readonly floor: number; readonly min: number; readonly failures: number }
    readonly p4: {
      readonly band: Readonly<Record<string, readonly number[]>>
      readonly failures: readonly { readonly hex: string; readonly theme: string }[]
    }
  } | null
}

function run(args: readonly string[]): Referto {
  const plain = spawnSync('node', [SCRIPT, ...args], { encoding: 'utf8' })
  const asJson = spawnSync('node', [SCRIPT, ...args, '--json'], { encoding: 'utf8' })
  let json: Referto['json'] = null
  try {
    json = JSON.parse(asJson.stdout) as NonNullable<Referto['json']>
  } catch {
    json = null
  }
  return { status: plain.status, text: plain.stdout + plain.stderr, json }
}

/** La palette di fase 5, quella che la ciambella ha reso insufficiente. */
const PRECEDENTE =
  '#81a369,#f26b00,#06b0a0,#845e23,#3f5db6,#b90e5c,#bc85ec,#676c75'

/** Le otto spedite, lette dal dominio: nessuna copia in questo file. */
const SPEDITE = DEFAULT_CATEGORY_SEEDS.map((seed) => seed.color).join(',')

describe('i quattro pavimenti della palette', () => {
  it('ritrova le cifre che aveva prodotto un altro validatore sulla palette precedente', () => {
    const { json } = run([`--palette=${PRECEDENTE}`])
    expect(json).not.toBeNull()
    // Le quattro cifre sono in docs/ROADMAP.md, M4 e 0f, e vengono dal
    // validatore della skill: non sono state ricavate da questo script.
    expect(json?.p1.worst).toBeCloseTo(9.4, 1)
    expect(json?.p2.worst).toBeCloseTo(4.3, 1)
    expect(json?.p2.kind).toBe('deutan')
    expect(json?.p3.min).toBeCloseTo(0.015, 3)
    expect(json?.p4.failures.filter((f) => f.theme === 'scuro')).toHaveLength(4)
    // ...e quella palette, misurata cosi', cade. E' la ragione per cui e' stata
    // sostituita: il test la conserva come reperto, non come alternativa.
    expect(json?.ok).toBe(false)
  })

  it('le otto tinte spedite reggono tutti e quattro i pavimenti, in tutti e due i temi', () => {
    const { status, json, text } = run([])
    expect(text).toContain('i quattro pavimenti reggono')
    expect(status).toBe(0)
    expect(json?.ok).toBe(true)
    expect(json?.p1.failures).toBe(0)
    expect(json?.p2.failures).toBe(0)
    expect(json?.p3.failures).toBe(0)
    expect(json?.p4.failures).toHaveLength(0)
  })

  it('lo script legge i default dall albero, e non una copia: cambiando una tinta cambia il referto', () => {
    // Se `scripts/palette.mjs` avesse gli esadecimali scritti dentro, questi due
    // referti sarebbero identici anche dopo un cambio di palette.
    const daiDefault = run([]).json
    const passateAMano = run([`--palette=${SPEDITE}`]).json
    expect(daiDefault?.p1.worst).toBeCloseTo(passateAMano?.p1.worst ?? -1, 6)
    expect(daiDefault?.p2.worst).toBeCloseTo(passateAMano?.p2.worst ?? -1, 6)
  })
})

describe('il cancello sa cadere, e su quale pavimento', () => {
  it('P1 e P2: due tinte identiche in due caselle NON adiacenti', () => {
    // Caselle 1 e 6 nell'ordine di griglia: fra loro ce ne sono quattro. Una
    // pairlist sulle sole coppie adiacenti non le guarderebbe mai — e nella
    // ciambella diventano vicine appena una delle quattro in mezzo non ha spese
    // nella finestra.
    const otto = SPEDITE.split(',')
    otto[5] = otto[0] as string
    const { status, json, text } = run([`--palette=${otto.join(',')}`])
    expect(status).toBe(1)
    expect(json?.p1.failures).toBe(1)
    expect(json?.p2.failures).toBe(1)
    expect(json?.p1.worst).toBeCloseTo(0, 6)
    // Gli altri due pavimenti restano in piedi: il referto dice **quale** cede.
    expect(json?.p3.failures).toBe(0)
    expect(json?.p4.failures).toHaveLength(0)
    expect(text).toContain('slot 1 ↔ slot 6')
  })

  it('P3: un grigio non e una categoria', () => {
    const otto = SPEDITE.split(',')
    otto[7] = '#676c75' // il grigio che Extra aveva fino alla fase 5
    const { status, json } = run([`--palette=${otto.join(',')}`])
    expect(status).toBe(1)
    expect(json?.p3.failures).toBe(1)
    expect(json?.p3.min).toBeCloseTo(0.015, 3)
  })

  it('P4: una tinta troppo chiara cade nel tema scuro e non in quello chiaro', () => {
    const otto = SPEDITE.split(',')
    otto[6] = '#bc85ec' // il lilla di fase 5: L 0,711, dentro 0,43–0,77 e fuori 0,48–0,67
    const { status, json } = run([`--palette=${otto.join(',')}`])
    expect(status).toBe(1)
    expect(json?.p4.failures).toEqual([{ hex: '#bc85ec', L: expect.any(Number), theme: 'scuro' }])
  })

  it('quando cade stampa il referto intero, non solo cio che e caduto', () => {
    // L'output di una verifica si filtra quando lo si legge, mai quando lo si
    // registra: nel momento in cui il risultato non torna, cio' che serve e'
    // proprio la riga che il filtro avrebbe scartato.
    const otto = SPEDITE.split(',')
    otto[7] = '#676c75'
    const { text } = run([`--palette=${otto.join(',')}`])
    expect(text).toContain('P1 vista piena')
    expect(text).toContain('P2 CVD')
    expect(text).toContain('P3 croma')
    expect(text).toContain("P4 luminosita'")
    expect(text).toContain('contrasto sul fondo')
    for (const hex of otto) expect(text).toContain(hex)
  })
})

describe('le tre simulazioni sono tre, e i pavimenti sono questi numeri', () => {
  /**
   * Ogni coppia qui sotto passa la vista piena e **due** simulazioni su tre, e
   * cade sulla terza. Servono a un difetto preciso: la skill mette il cancello
   * su protan e deutan e si limita a *riportare* tritan, quindi restringere
   * `SIMS` sembrerebbe un allineamento alla fonte invece che una perdita di
   * copertura — e non lo prenderebbe nessuno degli altri casi di questo file,
   * perche' sulle otto spedite la coppia peggiore in protan e in tritan e' la
   * stessa e passa comunque.
   *
   * Le coppie non sono state scelte a occhio: cercate su una griglia OKLCH
   * dentro la banda comune, con la condizione "una sola simulazione sotto 8".
   */
  const SOLO = [
    { sim: 'protan', coppia: '#8d434e,#e02159' },
    { sim: 'deutan', coppia: '#8d434e,#406b30' },
    { sim: 'tritan', coppia: '#8d434e,#8900bc' },
  ] as const

  for (const { sim, coppia } of SOLO) {
    it(`una coppia che cade solo in ${sim} viene presa`, () => {
      const { status, json } = run([`--palette=${coppia}`])
      expect(json?.p2.kind).toBe(sim)
      expect(json?.p2.failures).toBe(1)
      // La vista piena e gli altri due pavimenti reggono: se questo caso
      // diventasse rosso altrove, non sarebbe per la ragione che sorveglia.
      expect(json?.p1.failures).toBe(0)
      expect(json?.p3.failures).toBe(0)
      expect(json?.p4.failures).toHaveLength(0)
      expect(status).toBe(1)
    })
  }

  it('i quattro pavimenti valgono 15, 8, 0,10 e le due bande — cambiarli e una decisione', () => {
    // Non e' un test tautologico: e' il posto in cui abbassare una soglia
    // smette di essere un ritocco di una riga e diventa la modifica di un test
    // che dice ad alta voce cosa si sta cedendo. Le fonti dei quattro numeri
    // stanno nell'intestazione di `scripts/palette.mjs`.
    const { json } = run([])
    expect(json?.p1.floor).toBe(15)
    expect(json?.p2.floor).toBe(8)
    expect(json?.p3.floor).toBe(0.1)
    expect(json?.p4.band).toEqual({ chiaro: [0.43, 0.77], scuro: [0.48, 0.67] })
  })
})

describe('uno script che non sa cosa guarda non dice che va tutto bene', () => {
  it('un argomento malformato esce 2, distinto dall 1 di una palette che cade', () => {
    const { status, text } = run(['--palette=verde,#00a6c6'])
    expect(status).toBe(2)
    expect(text).toContain('verde')
  })

  it('una palette vuota non passa per assenza di coppie', () => {
    const { status } = run(['--palette='])
    expect(status).toBe(2)
  })
})
