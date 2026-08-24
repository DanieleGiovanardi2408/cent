/**
 * L'orologio dei test: **fissato**, non ereditato.
 *
 * ## Il difetto che ha prodotto questo file
 *
 * Un run partito alle 23:58:47 ha confrontato alle 00:00:00. `offline.spec.ts`
 * legge il testo della pagina online, spegne la rete, ricarica e rilegge: le due
 * letture cadevano su due giorni civili diversi.
 *
 *     Expected: "... Questa settimana · 17–23 ago ..."
 *     Received: "... Questa settimana · 24–30 ago ..."
 *
 * L'app aveva fatto **la cosa giusta** — ricalcolare il giorno al risveglio,
 * come prescrive ADR 007 — e il test misurava una cosa che puo' cambiare per una
 * ragione che non c'entra con quello che verifica. E' la stessa famiglia del
 * confronto di testo che misurava una corsa invece del precache.
 *
 * ## Perche' `timezoneId` da solo non basta
 *
 * Dichiarare il fuso (ADR 013, quarta premessa) toglie **una** variabile: che
 * Europe/Rome in locale e UTC sul runner producano due calendari. Non toglie la
 * mezzanotte: un run che parte alle 23:59 la attraversa comunque, in qualunque
 * fuso. Chi asserisce su "oggi" deve fissare l'istante.
 *
 * ## `setFixedTime` e non `install`
 *
 * `install` congela anche i **timer**, e con i timer fermi i fogli non finiscono
 * di chiudersi e i toast non se ne vanno mai: meta' della suite si bloccherebbe
 * aspettando un'animazione che nessuno fa partire. `setFixedTime` blocca solo
 * `Date.now()` e `new Date()`, che e' esattamente cio' che decide il giorno
 * civile. Chi ha bisogno anche dei timer fermi chiama `install` da se': in
 * `home.spec.ts` succede, ed e' una scelta dichiarata caso per caso.
 */
import { test } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Legge una premessa dal posto in cui e' dichiarata: `playwright.config.ts`. */
function premessa(chiave: 'istante' | 'fuso'): string {
  const valore: unknown = test.info().config.metadata[chiave]
  if (typeof valore !== 'string' || valore === '') {
    throw new Error(
      `la premessa "${chiave}" non e' dichiarata in playwright.config.ts: ` +
        'senza, i test tornerebbero a misurare contro l\'orologio della macchina',
    )
  }
  return valore
}

/** Il fuso dichiarato, cioe' quello in cui vanno letti i giorni civili. */
export function fuso(): string {
  return premessa('fuso')
}

/** L'istante dichiarato (o quello imposto da `CENT_ORA` per la prova al confine). */
export function istante(): Date {
  const raw = premessa('istante')
  const quando = new Date(raw)
  if (Number.isNaN(quando.getTime())) {
    throw new Error(`l'istante dichiarato non e' leggibile: "${raw}"`)
  }
  return quando
}

/**
 * Fissa l'orologio della pagina all'istante dichiarato.
 *
 * Va chiamata **prima** di `page.goto`: l'app legge il giorno civile all'avvio,
 * quindi un orologio fissato dopo il primo render sarebbe una premessa arrivata
 * tardi, cioe' nessuna premessa.
 */
export async function fissaOrologio(page: Page): Promise<void> {
  await page.clock.setFixedTime(istante())
}

/**
 * Il giorno civile dell'istante dichiarato, `YYYY-MM-DD`, nel fuso dichiarato.
 *
 * Serve dove il test prepara un dato **da Node** e l'app lo legge **nel
 * browser**: i due processi hanno due fusi diversi (in CI Node e' in UTC), e
 * `new Date()` da questa parte non e' lo stesso giorno di `new Date()` da
 * quella. Qui il giorno lo decide l'istante dichiarato, una volta per tutti.
 */
export function giornoDichiarato(): string {
  const parti = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(istante())
  const pezzo = (tipo: string): string => parti.find((p) => p.type === tipo)?.value ?? ''
  return `${pezzo('year')}-${pezzo('month')}-${pezzo('day')}`
}

/**
 * L'istante che, **nel fuso dichiarato**, e' quel giorno a quell'ora.
 *
 * Serve alla prova della mezzanotte, che ha bisogno di due istanti a cavallo
 * delle 00:00 senza aspettare che arrivino: si fissa l'orologio a 23:59:30, si
 * apre il foglio, si sposta l'orologio a 00:00:10 e si tocca il bottone.
 *
 * L'offset non si scrive a mano (`+02:00` e' vero ad agosto e falso a gennaio,
 * e questo file non deve sapere in che stagione gira): si chiede al fuso
 * dichiarato quanto vale **in quell'istante**. Due passate perche' la prima
 * risposta si legge su un istante approssimato, e a cavallo di un cambio d'ora
 * l'offset del giorno prima non e' quello del giorno dopo.
 */
export function istanteLocale(giorno: string, ora: string): Date {
  const [anno, mese, giornoDelMese] = giorno.split('-').map(Number)
  const [ore, minuti, secondi] = ora.split(':').map(Number)
  const ingenuo = Date.UTC(
    anno ?? 0,
    (mese ?? 1) - 1,
    giornoDelMese ?? 1,
    ore ?? 0,
    minuti ?? 0,
    secondi ?? 0,
  )
  const scarto = (quando: number): number => {
    const parti = new Intl.DateTimeFormat('en-CA', {
      timeZone: fuso(),
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(quando))
    const pezzo = (tipo: string): number => Number(parti.find((p) => p.type === tipo)?.value ?? '0')
    const comeUtc = Date.UTC(
      pezzo('year'),
      pezzo('month') - 1,
      pezzo('day'),
      pezzo('hour') % 24,
      pezzo('minute'),
      pezzo('second'),
    )
    return comeUtc - quando
  }
  const primo = ingenuo - scarto(ingenuo)
  return new Date(ingenuo - scarto(primo))
}
