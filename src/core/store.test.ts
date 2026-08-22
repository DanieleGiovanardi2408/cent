import { describe, expect, it } from 'vitest'
import { createObservable } from './store'

describe('store osservabile', () => {
  it('notifica sincronamente, senza attese', () => {
    const store = createObservable({ n: 0 })
    const visti: number[] = []
    store.subscribe((s) => visti.push(s.n))
    store.set({ n: 1 })
    // Nessun await: al ritorno di set il sottoscrittore ha gia' visto il valore.
    expect(visti).toEqual([1])
    expect(store.get().n).toBe(1)
  })

  it('non notifica se lo stato e lo stesso oggetto', () => {
    const stato = { n: 0 }
    const store = createObservable(stato)
    let chiamate = 0
    store.subscribe(() => (chiamate += 1))
    store.set(stato)
    expect(chiamate).toBe(0)
  })

  it('update riceve il valore precedente', () => {
    const store = createObservable({ n: 5 })
    store.update((prev) => ({ n: prev.n + 1 }))
    expect(store.get().n).toBe(6)
  })

  it('unsubscribe smette davvero', () => {
    const store = createObservable(0)
    const visti: number[] = []
    const stop = store.subscribe((v) => visti.push(v))
    store.set(1)
    stop()
    store.set(2)
    expect(visti).toEqual([1])
  })

  it('un sottoscrittore che si disiscrive durante la notifica non salta gli altri', () => {
    const store = createObservable(0)
    const visti: string[] = []
    const stop = store.subscribe(() => {
      visti.push('primo')
      stop()
    })
    store.subscribe(() => visti.push('secondo'))
    store.set(1)
    expect(visti).toEqual(['primo', 'secondo'])
    store.set(2)
    expect(visti).toEqual(['primo', 'secondo', 'secondo'])
  })

  it('regge piu sottoscrittori indipendenti', () => {
    const store = createObservable(0)
    const a: number[] = []
    const b: number[] = []
    store.subscribe((v) => a.push(v))
    store.subscribe((v) => b.push(v))
    store.set(1)
    store.set(2)
    expect(a).toEqual([1, 2])
    expect(b).toEqual(a)
  })
})
