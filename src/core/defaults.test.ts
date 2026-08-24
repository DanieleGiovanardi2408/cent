/**
 * I nomi delle categorie di default sono un **ingresso**, non un dato del core.
 *
 * Il difetto che questi test sorvegliano non e' una traduzione mancante: e'
 * l'ordine. Fino alla fase 3 gli otto nomi erano stringhe italiane cablate in
 * `defaults.ts`, e `openRepository` li scriveva al primo avvio **prima che una
 * lingua esistesse**. Chi apriva l'app con un telefono non italiano trovava la
 * guida in inglese e otto chip in italiano: il secondo dei due tap — l'unico che
 * decide *cosa* stai salvando — etichettato in una lingua che non legge.
 *
 * Quindi qui non si verifica *quali* parole escano — quelle stanno nei dizionari
 * di `src/ui/i18n` e non sono affare del dominio — ma tre cose sole:
 * i nomi passati arrivano nella casella giusta, il resto della griglia non e'
 * passabile da fuori, e niente qui dentro conosce piu' una parola italiana.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CATEGORY_SEEDS,
  buildDefaultCategories,
  buildDefaultSettings,
} from './defaults'
import type { DefaultCategoryNames } from './defaults'
import { SCHEMA_VERSION } from './schema'
import { sequentialIds, tickingClock } from './testing'

/**
 * Otto nomi che nessun dizionario produrrebbe mai, uno per casella.
 *
 * Sono marcati apposta: un nome che uscisse da qualche parte che non e' questo
 * oggetto si riconosce a occhio, e un nome finito nella casella sbagliata anche.
 */
const MARCATI: DefaultCategoryNames = {
  groceries: 'N1-groceries',
  eatingOut: 'N2-eatingOut',
  coffeeshop: 'N3-coffeeshop',
  cigarettes: 'N4-cigarettes',
  transport: 'N5-transport',
  leisure: 'N6-leisure',
  home: 'N7-home',
  extra: 'N8-extra',
}

function costruisci(names: DefaultCategoryNames = MARCATI) {
  return buildDefaultCategories(names, tickingClock(), sequentialIds('cat'))
}

describe('le categorie di default: i nomi vengono da fuori', () => {
  it('scrive i nomi ricevuti, ciascuno nella sua casella', () => {
    const categorie = costruisci()
    expect(categorie.map((c) => c.name)).toEqual([
      'N1-groceries',
      'N2-eatingOut',
      'N3-coffeeshop',
      'N4-cigarettes',
      'N5-transport',
      'N6-leisure',
      'N7-home',
      'N8-extra',
    ])
  })

  it('nomi diversi, stessa griglia: emoji, colori e ordine non si muovono', () => {
    // L'ordine e' per frequenza di tap alla cassa e i colori sono un sistema
    // unico che dalla fase 6 colora anche i grafici. La lingua non li tocca.
    const prima = costruisci()
    const dopo = costruisci({
      groceries: 'Spesa',
      eatingOut: 'Fuori',
      coffeeshop: 'Coffeeshop',
      cigarettes: 'Sigarette',
      transport: 'Trasporti',
      leisure: 'Svago',
      home: 'Casa',
      extra: 'Extra',
    })

    expect(dopo.map((c) => c.emoji)).toEqual(prima.map((c) => c.emoji))
    expect(dopo.map((c) => c.color)).toEqual(prima.map((c) => c.color))
    expect(dopo.map((c) => c.order)).toEqual([10, 20, 30, 40, 50, 60, 70, 80])
  })

  it('sono otto, quante ne entrano in griglia senza scroll', () => {
    expect(costruisci()).toHaveLength(8)
    expect(DEFAULT_CATEGORY_SEEDS).toHaveLength(8)
    expect(costruisci().every((c) => !c.archived)).toBe(true)
  })

  it('nessun nome resta nel core: i semi portano una chiave, non una parola', () => {
    // La chiave vive solo qui e nel chiamante, il tempo di appaiare un nome alla
    // casella giusta: non attraversa ne' il disco ne' il backup. `Category.name`
    // resta una stringa e basta — l'alternativa "salvare una chiave invece di un
    // nome" e' scartata in CLAUDE.md.
    const chiavi = DEFAULT_CATEGORY_SEEDS.map((s) => s.key)
    expect(chiavi).toEqual([
      'groceries',
      'eatingOut',
      'coffeeshop',
      'cigarettes',
      'transport',
      'leisure',
      'home',
      'extra',
    ])
    expect(DEFAULT_CATEGORY_SEEDS.some((s) => 'name' in s)).toBe(false)
  })

  it('id e timestamp restano iniettabili come prima', () => {
    const categorie = costruisci()
    expect(categorie.map((c) => c.id)).toEqual([
      'cat-1',
      'cat-2',
      'cat-3',
      'cat-4',
      'cat-5',
      'cat-6',
      'cat-7',
      'cat-8',
    ])
    // Un solo istante per tutte e otto: nascono insieme.
    expect(new Set(categorie.map((c) => c.createdAt)).size).toBe(1)
    expect(categorie.every((c) => c.updatedAt === c.createdAt)).toBe(true)
  })
})

describe('le impostazioni di default', () => {
  it('non contengono nessuna lingua: nessuno l ha ancora scelta', () => {
    // La lingua e' del dispositivo e la risolve chi compone leggendo
    // l'ambiente. Scriverla qui vorrebbe dire registrare una decisione che
    // l'utente non ha preso, e da quel momento "ha scelto" e "gliel'abbiamo
    // indovinato" sarebbero indistinguibili.
    const settings = buildDefaultSettings(tickingClock())
    expect(settings.language).toBeUndefined()
    expect(settings.onboardingCompletedAt).toBeUndefined()
    expect(settings.weekStartsOn).toBe(1)
    expect(settings.schemaVersion).toBe(SCHEMA_VERSION)
  })
})
