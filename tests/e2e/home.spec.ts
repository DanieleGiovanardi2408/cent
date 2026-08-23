/**
 * La Home, misurata invece che guardata.
 *
 * Tre cose che a occhio non si vedono e che una schermata con un numero grande
 * sbaglia sempre nello stesso modo:
 *
 * 1. **CLS = 0.** Il guscio si dipinge prima dei dati (regola "Ordine di
 *    pittura"). Se le altezze dipendessero dal contenuto, all'apertura del
 *    database il bottone del budget e le spese di oggi scenderebbero di qualche
 *    decina di pixel. E' un salto di 40 ms che nessuno riesce a vedere e che
 *    tutti sentono.
 * 2. **Il numero grande c'e' al primo frame**, con la geometria definitiva:
 *    quello che arriva dopo sono le cifre, non lo spazio che occupano.
 * 3. **Niente scroll orizzontale**, nemmeno col residuo negativo piu' largo che
 *    5.000 spese possano produrre.
 */
// Questi test provano l'app, quindi dichiarano di girare nell'app installata:
// fuori da standalone Cent e' una pagina di installazione (ADR 011). Vedi
// `installed.ts` per il perche' la cucitura sta qui e non nel codice dell'app.
import { expect, test } from './installed'
import type { Page } from '@playwright/test'

interface Shift {
  readonly value: number
  readonly sources: readonly string[]
}

/** Il numero grande al primo frame in cui esiste, e quanto ci ha messo. */
interface FirstHero {
  readonly top: number
  readonly height: number
  readonly text: string
  /** Quanti frame sono passati prima che la Home fosse nel DOM. */
  readonly frames: number
  readonly at: number
}

/**
 * Osserva gli spostamenti di layout **da prima della navigazione**: con
 * `buffered: true` arrivano anche quelli avvenuti prima che l'osservatore
 * esistesse. Registra anche il rettangolo del numero grande al primo frame
 * utile, che e' l'unico istante in cui la domanda "c'e'?" ha una risposta
 * interessante.
 */
async function watch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __shifts: Shift[]
      __firstHero: FirstHero | null
      __fcp: number | null
    }
    w.__shifts = []
    w.__firstHero = null
    w.__fcp = null

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number
          hadRecentInput: boolean
          sources?: { node?: Element }[]
        }
        // Gli spostamenti causati da un tap dell'utente non sono CLS: sono la
        // risposta a quel tap.
        if (shift.hadRecentInput) continue
        w.__shifts.push({
          value: shift.value,
          sources: (shift.sources ?? []).map((source) => {
            const node = source.node
            return node instanceof Element ? `${node.tagName.toLowerCase()}.${node.className}` : '?'
          }),
        })
      }
    }).observe({ type: 'layout-shift', buffered: true })

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') w.__fcp = entry.startTime
      }
    }).observe({ type: 'paint', buffered: true })

    // Il **primo frame utile**: il primo in cui la Home e' nel DOM. Non basta un
    // solo `requestAnimationFrame` — questo script gira prima di qualunque altro,
    // e il modulo dell'app e' differito, quindi il primo frame puo' cadere prima
    // che `render()` sia stato chiamato. Si guarda a ogni frame finche' non c'e'.
    let frames = 0
    const look = (): void => {
      frames += 1
      const hero = document.querySelector('.hero__value')
      if (hero === null) {
        requestAnimationFrame(look)
        return
      }
      const box = hero.getBoundingClientRect()
      w.__firstHero = {
        top: Math.round(box.top),
        height: Math.round(box.height),
        text: (hero.textContent ?? '').trim(),
        frames,
        at: Math.round(performance.now()),
      }
    }
    requestAnimationFrame(look)
  })
}

interface Measures {
  readonly cls: number
  readonly shifts: readonly Shift[]
  readonly firstHero: FirstHero | null
  readonly finalHero: { top: number; height: number; text: string } | null
  readonly fcp: number | null
  readonly overflowX: number
  readonly homeOverflowX: number
}

async function measure(page: Page): Promise<Measures> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __shifts: Shift[]
      __firstHero: FirstHero | null
      __fcp: number | null
    }
    const hero = document.querySelector('.hero__value')
    const box = hero?.getBoundingClientRect() ?? null
    const home = document.querySelector('.home')
    return {
      cls: w.__shifts.reduce((sum, shift) => sum + shift.value, 0),
      shifts: w.__shifts,
      firstHero: w.__firstHero,
      finalHero:
        hero === null || box === null
          ? null
          : {
              top: Math.round(box.top),
              height: Math.round(box.height),
              text: (hero.textContent ?? '').trim(),
            },
      fcp: w.__fcp,
      overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      homeOverflowX: home === null ? 0 : home.scrollWidth - home.clientWidth,
    }
  })
}

/** Semina spese vere dentro IndexedDB: `perDay` al giorno, all'indietro. */
async function seed(page: Page, howMany: number): Promise<void> {
  await page.evaluate(async (total: number) => {
    const open = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('cent')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    const db = await open()
    const categories: { id: string }[] = await new Promise((resolve, reject) => {
      const request = db.transaction('categories').objectStore('categories').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const iso = (offset: number): string => {
      const d = new Date()
      d.setDate(d.getDate() - offset)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('expenses', 'readwrite')
      const store = tx.objectStore('expenses')
      for (let i = 0; i < total; i += 1) {
        const at = 1_700_000_000_000 + i
        store.put({
          id: `seed-${i}`,
          createdAt: at,
          updatedAt: at,
          amountCents: 150 + (i % 900) * 7,
          categoryId: categories[i % categories.length]?.id ?? 'x',
          date: iso(Math.floor(i / 14)),
          source: 'manual',
        })
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, howMany)
}

/** Il giorno civile di chi esegue il test, nella stessa forma dell'app. */
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Semina spese in giorni precisi: serve dove conta il giorno, non il volume. */
async function seedOn(page: Page, rows: readonly (readonly [string, number])[]): Promise<void> {
  await page.evaluate(async (list: readonly (readonly [string, number])[]) => {
    const open = (): Promise<IDBDatabase> =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('cent')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    const db = await open()
    const categories: { id: string }[] = await new Promise((resolve, reject) => {
      const request = db.transaction('categories').objectStore('categories').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('expenses', 'readwrite')
      const store = tx.objectStore('expenses')
      list.forEach(([date, amountCents], i) => {
        const at = 1_700_000_000_000 + i
        store.put({
          id: `on-${i}`,
          createdAt: at,
          updatedAt: at,
          amountCents,
          categoryId: categories[i % categories.length]?.id ?? 'x',
          date,
          source: 'manual',
        })
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, rows)
}

/**
 * Imposta un budget dal foglio: apri, digita, **seleziona** il periodo, salva.
 *
 * Il periodo non e' piu' la conferma (vedi BudgetSheet.tsx): il salvataggio e'
 * un atto suo, quindi il tap in fondo e' quello che scrive. Ogni attesa qui e'
 * una condizione vera — il foglio c'e', il periodo e' selezionato, il foglio non
 * c'e' piu' — e non un numero di millisecondi.
 */
async function setBudget(page: Page, digits: string, period: string): Promise<void> {
  await page.locator('.budget').tap()
  await expect(page.locator('.sheet--budget')).toBeVisible()
  for (const digit of digits) {
    await page.locator('.pad__key', { hasText: new RegExp(`^${digit}$`) }).first().tap()
  }
  const chip = page.locator('.period', { hasText: period })
  await chip.tap()
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--budget')).toHaveCount(0)
}

/**
 * I dati sono arrivati **e** la pagina ha finito di muoversi.
 *
 * Non un'attesa fissa: prima il numero grande, che e' l'ultima cosa a
 * riempirsi; poi le animazioni in corso; poi il buffer degli spostamenti, che si
 * legge fermo per due giri di notifica. Le voci `layout-shift` arrivano in un
 * task successivo a quello che le ha prodotte, quindi misurare troppo presto
 * darebbe un CLS piu' basso del vero — cioe' un verde su meno bersagli, che e'
 * il modo peggiore in cui un test puo' sbagliare.
 */
async function settled(page: Page): Promise<void> {
  await expect(page.locator('.hero__value')).not.toHaveText('')
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
    const w = window as unknown as { __shifts?: unknown[] }
    const tick = (): Promise<void> =>
      new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    let seen = -1
    while (w.__shifts !== undefined && seen !== w.__shifts.length) {
      seen = w.__shifts.length
      await tick()
      await tick()
    }
  })
}

test.describe('la Home non salta', () => {
  test('senza budget e senza spese', async ({ page }, testInfo) => {
    await watch(page)
    await page.goto('./')
    await expect(page.locator('.budget')).toBeEnabled()
    await settled(page)

    const m = await measure(page)
    console.log(`\n  [${testInfo.project.name}] home vuota  CLS=${m.cls}  FCP=${Math.round(m.fcp ?? -1)}ms  primo frame utile: ${m.firstHero?.at}ms (${m.firstHero?.frames} frame) "${m.firstHero?.text ?? '(nessun numero)'}" ${m.firstHero?.height}px  finale: "${m.finalHero?.text}" ${m.finalHero?.height}px`)

    // Il numero grande esiste al primo frame utile, con l'altezza definitiva.
    expect(m.firstHero, 'al primo frame il numero grande non e\' nel DOM').not.toBeNull()
    expect(m.firstHero?.height).toBe(m.finalHero?.height)
    expect(m.firstHero?.top).toBe(m.finalHero?.top)

    expect(m.cls, `spostamenti: ${JSON.stringify(m.shifts)}`).toBe(0)
    expect(m.overflowX).toBeLessThanOrEqual(0)
    expect(m.homeOverflowX).toBeLessThanOrEqual(0)
  })

  test('con budget e 5.000 spese, sforando', async ({ page }, testInfo) => {
    await page.goto('./')
    await expect(page.locator('.budget')).toBeEnabled()

    // 200,00 € a settimana contro ~3.000 € di spese seminate nel periodo: il
    // residuo e' negativo e largo, cioe' il caso peggiore per la larghezza.
    await setBudget(page, '20000', 'A settimana')
    await seed(page, 5000)
    // E una spesa grossa **di oggi**, cioe' dopo che il budget esiste. Senza,
    // il budget e' appena nato e il negativo verrebbe solo dai giorni prima:
    // la Home direbbe giustamente "questa settimana era gia' iniziata"
    // (ADR 010) e questo test misurerebbe un altro stato.
    await seedOn(page, [[todayIso(), 30_000]])

    // La misura si fa sul caricamento successivo: e' quello in cui il guscio
    // aspetta la lettura di 5.000 record, cioe' dove un salto si vedrebbe.
    await watch(page)
    await page.reload()
    await expect(page.locator('.row').first()).toBeVisible()
    await settled(page)

    const m = await measure(page)
    console.log(`\n  [${testInfo.project.name}] home con budget e 5.000 spese  CLS=${m.cls}  FCP=${Math.round(m.fcp ?? -1)}ms  primo frame utile: ${m.firstHero?.at}ms (${m.firstHero?.frames} frame) "${m.firstHero?.text ?? '(nessun numero)'}" ${m.firstHero?.height}px  finale: "${m.finalHero?.text}" ${m.finalHero?.height}px`)

    expect(m.firstHero, 'al primo frame il numero grande non e\' nel DOM').not.toBeNull()
    expect(m.firstHero?.height).toBe(m.finalHero?.height)
    expect(m.firstHero?.top).toBe(m.finalHero?.top)

    expect(m.cls, `spostamenti: ${JSON.stringify(m.shifts)}`).toBe(0)
    expect(m.overflowX, 'scroll orizzontale in pagina').toBeLessThanOrEqual(0)
    expect(m.homeOverflowX, 'scroll orizzontale dentro la Home').toBeLessThanOrEqual(0)

    // Sforato: il residuo resta col segno e il tono cambia. Tre segnali per lo
    // stesso fatto — segno, colore, barra piena — nessuno dei tre urla.
    await expect(page.locator('.hero__value')).toHaveAttribute('data-tone', 'over')
    await expect(page.locator('.hero__value')).toContainText('-')
    await expect(page.locator('.allowance')).toHaveText('Il budget del periodo è finito.')
    await expect(page.locator('.track')).toHaveAttribute('data-tone', 'over')
  })

  test('passando da senza budget a con budget', async ({ page }) => {
    // Il terzo salto possibile: non guscio -> dati, ma uno stato di dati verso
    // l'altro. Il riquadro sotto il numero cambia contenuto del tutto.
    await page.goto('./')
    await expect(page.locator('.budget')).toBeEnabled()

    /**
     * Dove comincia la sezione di oggi **dentro il contenuto**, non nel
     * viewport: `tap()` su un bersaglio fuori schermo lo porta in vista
     * scorrendo, e in orizzontale succede davvero. Misurare la posizione sullo
     * schermo confonderebbe uno scroll con uno spostamento di layout.
     */
    const headTop = (): Promise<number> =>
      page.evaluate(() => {
        const el = document.querySelector('.today__head')
        const home = document.querySelector('.home')
        if (el === null || home === null) return -1
        return Math.round(
          el.getBoundingClientRect().top - home.getBoundingClientRect().top + home.scrollTop,
        )
      })

    const before = await headTop()

    await setBudget(page, '20000', 'A settimana')

    const after = await headTop()

    expect(before).toBeGreaterThan(0)
    expect(after, 'impostare un budget ha spostato le spese di oggi').toBe(before)
  })
})

/**
 * 320 punti di larghezza: non e' solo il vecchio SE, e' anche quello che si
 * ottiene attivando lo Zoom schermo di iOS su un telefono normale.
 *
 * Li' la riga "Puoi spendere ~X al giorno" va a capo e il passo puo' prendere
 * tre righe: se la riserva del riquadro non tenesse conto della larghezza,
 * l'arrivo dei dati spingerebbe in giu' le spese di oggi. La larghezza la impone
 * il test, quindi basta eseguirlo su un progetto solo.
 */
test('a 320 punti la Home non salta lo stesso', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'iphone-se', 'la larghezza la impone il test')

  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await setBudget(page, '70000', 'A settimana')
  await seed(page, 200)

  await watch(page)
  await page.reload()
  await expect(page.locator('.row').first()).toBeVisible()
  await settled(page)

  const m = await measure(page)
  console.log(`\n  [320x568] home con budget  CLS=${m.cls}  primo frame utile: "${m.firstHero?.text ?? '(nessun numero)'}" ${m.firstHero?.height}px  finale: "${m.finalHero?.text}" ${m.finalHero?.height}px`)

  expect(m.cls, `spostamenti: ${JSON.stringify(m.shifts)}`).toBe(0)
  expect(m.firstHero?.top).toBe(m.finalHero?.top)
  expect(m.overflowX, 'scroll orizzontale in pagina').toBeLessThanOrEqual(0)
  expect(m.homeOverflowX, 'scroll orizzontale dentro la Home').toBeLessThanOrEqual(0)
})

test('la Home dice quanto resta e quanto al giorno, e sono numeri veri', async ({ page }) => {
  // Mercoledi' 19 agosto 2026: la settimana va da lunedi' 17 a domenica 23,
  // quindi restano cinque giorni, oggi compreso.
  //
  // L'orologio e' fissato e non e' un vezzo: senza, il numero al giorno dipende
  // dal giorno in cui gira la suite, e il test puo' solo asserire il prefisso.
  // Il 23 agosto 2026 era una domenica e questo test e' cascato per davvero,
  // sull'ultimo giorno del periodo — dove "al giorno" non e' piu' la frase
  // giusta. `setFixedTime` invece di `install`: i timer devono continuare a
  // correre, o il foglio del budget non finirebbe mai di chiudersi.
  await page.clock.setFixedTime(new Date('2026-08-19T10:00:00'))

  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()

  // Nessun budget: la Home non e' vuota, mostra il totale del periodo.
  await expect(page.locator('.hero__label')).toHaveText('Spesi')
  await expect(page.locator('.hero__value')).toHaveText('0,00 €')

  await setBudget(page, '70000', 'A settimana')

  // 700,00 € su cinque giorni: 140,00 € al giorno.
  await expect(page.locator('.hero__label')).toHaveText('Restano')
  await expect(page.locator('.hero__value')).toHaveText('700,00 €')
  await expect(page.locator('.allowance')).toContainText('Puoi spendere ~')
  await expect(page.locator('.allowance')).toContainText('140,00')
  await expect(page.locator('.allowance')).toContainText('al giorno')

  // Una spesa vera dal FAB: il residuo scende nello stesso frame, senza attese.
  await page.locator('.fab').tap()
  await expect(page.locator('.sheet--add')).toBeVisible()
  for (const digit of ['1', '0', '0', '0', '0']) {
    await page.locator('.pad__key', { hasText: new RegExp(`^${digit}$`) }).first().tap()
  }
  await page.locator('.cat').first().tap()

  await expect(page.locator('.hero__value')).toHaveText('600,00 €')
  await expect(page.locator('.today__total')).toHaveText('100,00 €')
  await expect(page.locator('.row')).toHaveCount(1)
})

/**
 * L'ultimo giorno del periodo non e' un ritmo: e' un totale.
 *
 * Visto sul dispositivo nella sua forma peggiore: la riga grande diceva
 * "Puoi spendere ~128,55 € al giorno" e il sottotitolo la smentiva con "per
 * oggi, che e' l'ultimo giorno". La tilde dice "e' una media": con un giorno
 * solo non c'e' nessuna media, e il numero e' il residuo esatto.
 *
 * Il test e' qui e non solo in `budget-view.test.ts` perche' e' una frase che
 * l'utente legge, ed e' proprio su questo giorno che la suite end-to-end ci e'
 * passata sopra per mesi senza vedere niente: il 23 agosto 2026 era una
 * domenica, e l'unica asserzione era sul prefisso "Puoi spendere ~".
 */
test('l ultimo giorno del periodo la Home dice un totale, non un ritmo', async ({ page }) => {
  // Domenica 23 agosto 2026: ultimo giorno della settimana.
  await page.clock.setFixedTime(new Date('2026-08-23T10:00:00'))

  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await setBudget(page, '70000', 'A settimana')

  const allowance = page.locator('.allowance')
  await expect(allowance).toContainText('Puoi spendere')
  await expect(allowance).toContainText('700,00')
  await expect(allowance).toContainText('oggi')
  // Le due cose che mentivano: la tilde e "al giorno".
  await expect(allowance).not.toContainText('~')
  await expect(allowance).not.toContainText('al giorno')
  await expect(page.locator('.allowance__sub')).toContainText('Ultimo giorno del periodo')
})

/**
 * Il giorno civile cambia mentre l'app e' sospesa.
 *
 * E' il caso per cui la rilettura al risveglio esisteva gia' (ADR 007): aprire
 * l'app il giorno dopo deve mostrare **il periodo giusto**, non quello di ieri.
 * Qui l'orologio va avanti da domenica sera a lunedi' notte, cioe' oltre il
 * confine della settimana: il periodo mostrato deve cambiare da solo.
 */
test('al risveglio la Home mostra il periodo di oggi, non quello di ieri', async ({ page }) => {
  // Domenica 23 agosto 2026, 23:30 locali: ultimo giorno della settimana.
  await page.clock.install({ time: new Date('2026-08-23T23:30:00') })
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await expect(page.locator('.hero__period')).toContainText('17')
  await expect(page.locator('.hero__period')).toContainText('23')

  // Lunedi' 24, mezzanotte e cinque: settimana nuova.
  await page.clock.setFixedTime(new Date('2026-08-24T00:05:00'))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

  await expect(page.locator('.hero__period')).toContainText('24')
  await expect(page.locator('.hero__period')).toContainText('30')
})

/**
 * "L'ultimo budget impostato" e' l'ultimo **impostato**.
 *
 * La sequenza esatta che aveva rotto la Home, tutta nello stesso giorno:
 * 200 a settimana, 800 al mese, 300 a settimana. Il terzo gesto non crea un
 * record nuovo — `planResolvedBudgetChange` trova un settimanale con lo stesso
 * `effectiveFrom` e lo aggiorna sul posto, conservando `createdAt` — quindi con
 * un tie-break su `createdAt` la Home restava sul mese mentre il toast diceva
 * "Budget: 300,00 € a settimana". L'app dichiarava una cosa e ne mostrava
 * un'altra, e non c'era via d'uscita fino a mezzanotte.
 */
test('tornare al periodo di prima nello stesso giorno riporta la Home li', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()

  await setBudget(page, '20000', 'A settimana')
  await expect(page.locator('.hero__period')).toContainText('Questa settimana')
  await expect(page.locator('.hero__value')).toHaveText('200,00 €')

  await setBudget(page, '80000', 'Al mese')
  await expect(page.locator('.hero__period')).toContainText('Questo mese')
  await expect(page.locator('.hero__value')).toHaveText('800,00 €')

  await setBudget(page, '30000', 'A settimana')
  // Il toast e la Home devono dire la stessa cosa. E' tutto il bug.
  await expect(page.locator('.toast__text')).toHaveText('Budget: 300,00 € a settimana')
  await expect(page.locator('.hero__period')).toContainText('Questa settimana')
  await expect(page.locator('.hero__value')).toHaveText('300,00 €')
})

/**
 * Il periodo **seleziona**, non salva.
 *
 * Prima bastava un tap su "Al mese" per trasformare un settimanale da 200,00 €
 * in un mensile da 200,00 € — 6,45 € al giorno — senza aver digitato niente,
 * senza conferma e senza Annulla, su un record storicizzato permanente.
 * L'eccezione di ADR 004 (il chip che conferma) qui non si applica: nessuna
 * delle tre condizioni che la giustificano vale per il budget.
 */
test('nel foglio del budget il periodo seleziona e basta: scrive solo Salva', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await setBudget(page, '20000', 'A settimana')

  await page.locator('.budget').tap()
  await expect(page.locator('.sheet--budget')).toBeVisible()
  // Il foglio si apre sul periodo che la Home mostra, con il suo importo.
  await expect(page.locator('.amount')).toHaveText('200,00 €')

  // Un tap su "Al mese" cambia solo cosa si sta per salvare — e l'importo
  // proposto diventa quello del mese, che non esiste: non c'e' niente da
  // salvare, e il bottone lo dice spegnendosi.
  await page.locator('.period', { hasText: 'Al mese' }).tap()
  await expect(page.locator('.amount')).toHaveText('0,00 €')
  await expect(page.locator('.save')).toBeDisabled()

  await page.locator('.scrim').tap({ position: { x: 4, y: 4 } })
  await expect(page.locator('.sheet--budget')).toHaveCount(0)

  // Niente e' stato scritto: la Home e' esattamente dove era.
  await expect(page.locator('.hero__period')).toContainText('Questa settimana')
  await expect(page.locator('.hero__value')).toHaveText('200,00 €')
})

/**
 * Il primo uso della feature, non un caso limite (ADR 010).
 *
 * Mercoledi' si imposta il primo budget settimanale avendo gia' speso 240,00 €
 * fra lunedi' e martedi'. Il residuo esce -40,00 € ed e' giusto cosi': il budget
 * e' del periodo e il periodo e' tutto, niente pro-rata. Ma la Home deve poter
 * dire **perche'**, invece di annunciare "Il budget del periodo e' finito" a chi
 * il budget lo ha appena creato.
 *
 * La riga in piu' deve anche stare dentro la riserva del riquadro: se la
 * sfondasse, spingerebbe in giu' le spese di oggi all'arrivo dei dati — cioe'
 * CLS > 0 proprio nel periodo in cui la frase compare.
 */
test('la Home spiega il budget nato a meta settimana, e non salta lo stesso', async ({ page }) => {
  // Mercoledi' 19 agosto 2026: la settimana e' cominciata lunedi' 17.
  await page.clock.install({ time: new Date('2026-08-19T10:00:00') })
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()

  await seedOn(page, [
    ['2026-08-17', 12_000],
    ['2026-08-18', 12_000],
  ])
  await page.reload()
  await expect(page.locator('.hero__label')).toHaveText('Spesi')
  await expect(page.locator('.hero__value')).toHaveText('240,00 €')

  await setBudget(page, '20000', 'A settimana')

  // Il numero non cambia significato: resta il residuo del periodo, col segno.
  await expect(page.locator('.hero__value')).toHaveText('-40,00 €')
  // Ma la riga che giudicava adesso racconta, e non in ambra.
  await expect(page.locator('.allowance')).toHaveText('Questa settimana era già iniziata.')
  await expect(page.locator('.allowance')).not.toHaveAttribute('data-tone', 'over')
  await expect(page.locator('.allowance__sub')).toContainText('lunedì')
  await expect(page.locator('.since')).toContainText('Budget attivo da mercoledì')
  await expect(page.locator('.since')).toContainText('240,00')

  // E lo stato con la riga in piu' non sposta niente quando i dati arrivano.
  await watch(page)
  await page.reload()
  await expect(page.locator('.since')).toBeVisible()
  await settled(page)
  const m = await measure(page)
  expect(m.cls, `spostamenti: ${JSON.stringify(m.shifts)}`).toBe(0)
  expect(m.overflowX, 'scroll orizzontale in pagina').toBeLessThanOrEqual(0)
})
