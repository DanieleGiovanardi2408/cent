/**
 * Il tetto di tempo sulla rilettura al risveglio.
 *
 * Il difetto sorvegliato qui non ha una faccia: se `reloadFromDisk()` non si
 * risolve **mai** — non rifiuta, resta pendente — il `finally` non gira, la
 * guardia `running` resta alzata per sempre e ogni risveglio successivo diventa
 * un no-op silenzioso. Dalla fase 5 in poi significa ricorrenze che smettono di
 * essere generate senza che niente lo dica.
 *
 * Per questo l'asserzione che conta non e' "il timeout scatta" ma **"il
 * risveglio successivo funziona ancora"**: e' l'unica differenza osservabile fra
 * un'app sana e un'app bloccata.
 *
 * Gira in ambiente node: `createWake` non tocca il DOM, l'aggancio a
 * `visibilitychange`/`pageshow` resta in `attachWake` e non e' cio' che si prova
 * qui. Il tetto arriva come argomento, quindi il test usa millisecondi veri ma
 * pochi: niente timer finti da sincronizzare, e nessuna attesa reale — la
 * promessa di `wake()` si conclude da sola quando il tetto scade.
 */

import { describe, expect, it } from 'vitest'

import { createWake } from './boot'
import type { WakeRepository } from './boot'
import { NO_WRITE_FAILURES } from '../core/repository'
import type { ReloadOutcome, RepositoryState } from '../core/repository'
import { makeSettings } from '../core/testing'

/** Il tetto usato nei test. Abbastanza corto da non far aspettare nessuno. */
const TETTO_MS = 20

/** Il guinzaglio del test: due ordini di grandezza sopra il tetto. */
const GUINZAGLIO_MS = 2_000

const MIRROR: RepositoryState = {
  expenses: [],
  categories: [],
  recurringRules: [],
  budgets: [],
  settings: makeSettings(),
  writeFailures: NO_WRITE_FAILURES,
}

interface FakeRepo {
  readonly repo: WakeRepository
  readonly calls: { reload: number; getState: number; materialize: number }
}

/**
 * Il finto repository implementa i tre metodi che `wake` usa davvero e nient'
 * altro: `WakeRepository` e' un `Pick` di `Repository`, quindi il compilatore
 * garantisce che l'elenco resti onesto senza costringere a ricostruire venti
 * metodi che il risveglio non chiama.
 */
function fakeRepo(reload: () => Promise<ReloadOutcome>): FakeRepo {
  const calls = { reload: 0, getState: 0, materialize: 0 }
  const repo: WakeRepository = {
    reloadFromDisk() {
      calls.reload += 1
      return reload()
    },
    getState() {
      calls.getState += 1
      return MIRROR
    },
    async materializeRecurring() {
      calls.materialize += 1
      return { created: [], advancedRuleIds: [], skipped: [] }
    },
  }
  return { repo, calls }
}

/**
 * Attende una promessa con un guinzaglio, per fallire con una frase invece che
 * con "Test timed out". Senza tetto in produzione il primo `wake()` non si
 * conclude mai: e' esattamente qui che il test lo dice.
 */
async function entro<T>(promise: Promise<T>, cosa: string): Promise<T> {
  let guinzaglio: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        guinzaglio = setTimeout(
          () => reject(new Error(`${cosa}: non si e' concluso entro ${GUINZAGLIO_MS} ms`)),
          GUINZAGLIO_MS,
        )
      }),
    ])
  } finally {
    clearTimeout(guinzaglio)
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('createWake', () => {
  it('rilascia la guardia quando la rilettura non torna mai, e il risveglio dopo riparte', async () => {
    // Non rifiuta e non si risolve: la connessione IndexedDB che iOS ha chiuso
    // in background e che non risponde piu' ne' si', ne' no.
    const { repo, calls } = fakeRepo(() => new Promise<ReloadOutcome>(() => {}))
    const wake = createWake(repo, TETTO_MS)

    await entro(wake(), 'il primo risveglio')
    expect(calls.reload).toBe(1)

    await entro(wake(), 'il secondo risveglio')

    // L'asserzione che conta: la guardia e' stata rilasciata, quindi il
    // risveglio successivo prova davvero a rileggere invece di essere un no-op
    // per sempre.
    expect(calls.reload, 'il secondo risveglio non ha nemmeno provato a rileggere').toBe(2)

    // Una rilettura mai conclusa non e' una divergenza: il mirror resta quello
    // che era e la materializzazione non parte su dati di cui non ci si fida.
    expect(calls.materialize).toBe(0)
  })

  it('sul percorso normale ripubblica il mirror e materializza', async () => {
    const { repo, calls } = fakeRepo(async () => ({ reloaded: true }))
    const wake = createWake(repo, TETTO_MS)

    await entro(wake(), 'il risveglio')

    expect(calls.reload).toBe(1)
    expect(calls.getState).toBe(1)
    expect(calls.materialize).toBe(1)

    await entro(wake(), 'il risveglio successivo')
    expect(calls.reload).toBe(2)
    expect(calls.materialize).toBe(2)
  })

  it('quando la rilettura viene saltata non materializza, ma resta richiamabile', async () => {
    const { repo, calls } = fakeRepo(async () => ({
      reloaded: false,
      reason: 'write-failures',
    }))
    const wake = createWake(repo, TETTO_MS)

    await entro(wake(), 'il risveglio')

    // Il mirror e' l'unica copia di quei record: si ripubblica cio' che c'e',
    // e non si scrive niente sopra.
    expect(calls.getState).toBe(1)
    expect(calls.materialize).toBe(0)

    await entro(wake(), 'il risveglio successivo')
    expect(calls.reload).toBe(2)
  })

  it('quando la rilettura rifiuta rilascia la guardia', async () => {
    const { repo, calls } = fakeRepo(async () => {
      throw new Error('InvalidStateError')
    })
    const wake = createWake(repo, TETTO_MS)

    await entro(wake(), 'il risveglio fallito')
    expect(calls.materialize).toBe(0)

    await entro(wake(), 'il risveglio successivo')
    expect(calls.reload).toBe(2)
  })

  it('non sovrappone due riletture, e riapre dopo che la prima si e conclusa', async () => {
    const primo = deferred<ReloadOutcome>()
    const { repo, calls } = fakeRepo(() => primo.promise)
    // Tetto lungo: qui a fermare la seconda chiamata dev'essere la guardia, non
    // una scadenza arrivata nel frattempo.
    const wake = createWake(repo, 10_000)

    const inVolo = wake()
    await entro(wake(), 'il risveglio sovrapposto')
    expect(calls.reload, 'due riletture sovrapposte').toBe(1)

    primo.resolve({ reloaded: true })
    await entro(inVolo, 'la prima rilettura')

    await entro(wake(), 'il risveglio dopo la conclusione')
    expect(calls.reload).toBe(2)
  })
})
