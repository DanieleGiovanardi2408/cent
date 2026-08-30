/**
 * La Home, misurata invece che guardata.
 *
 * Tre cose che a occhio non si vedono e che una schermata con un numero grande
 * sbaglia sempre nello stesso modo:
 *
 * 1. **Niente si sposta fra guscio e dati.** Il guscio si dipinge prima dei dati
 *    (regola "Ordine di pittura"). Se le altezze dipendessero dal contenuto,
 *    all'apertura del database il bottone del budget e le spese di oggi
 *    scenderebbero di qualche decina di pixel. E' un salto di 40 ms che nessuno
 *    riesce a vedere e che tutti sentono.
 *
 *    Si misura in **due modi, e sono due test separati** (CLAUDE.md, "Verifiche
 *    che passano perche' la macchina non e' il bersaglio", caso 1):
 *
 *    - il **gate** e' l'identita' delle posizioni: i blocchi del guscio devono
 *      stare **allo stesso pixel** prima e dopo l'arrivo dei dati. Nessuna
 *      soglia, nessun browser di mezzo — due `getBoundingClientRect` e un
 *      confronto;
 *    - la **rete** e' il CLS: `layout-shift` viene emesso solo sopra una soglia
 *      interna del browser, quindi `cls === 0` significa "niente si e' mosso
 *      **abbastanza da farlo riportare a Chromium**". Resta perche' prende cio'
 *      che il gate non campiona — spostamenti fra due frame intermedi, o di
 *      elementi che non sono nell'elenco dei blocchi — ma non e' il gate.
 *
 *    I due test si chiamano `gate:` e `rete:` proprio perche' l'output di
 *    `playwright test` dica quale delle due ha ceduto senza aprire questo file.
 * 2. **Il numero grande c'e' al primo frame**, con la geometria definitiva:
 *    quello che arriva dopo sono le cifre, non lo spazio che occupano.
 * 3. **Niente scroll orizzontale**, nemmeno col residuo negativo piu' largo che
 *    5.000 spese possano produrre.
 *
 * ## Gli istanti, e perche' portano tutti un `+02:00`
 *
 * Le date scritte qui dentro sono **istanti assoluti**, non orari locali: il
 * fuso della pagina e' dichiarato in `playwright.config.ts` (Europe/Amsterdam),
 * ma `new Date('2026-08-23T23:30:00')` lo legge nel fuso del **processo Node**,
 * che in CI e' UTC. Senza l'offset, "domenica 23 alle 23:30" diventerebbe
 * l'una e mezza di lunedi' 24 sul runner, e i test sul confine di settimana
 * cadrebbero **nel momento stesso in cui si dichiara il fuso**.
 *
 * Le scene che seminano spese "di oggi" fissano l'orologio all'istante
 * dichiarato (`clock.ts`): senza, fra la semina e il ricaricamento puo' passare
 * la mezzanotte e la scena misurata non e' quella preparata.
 */
// Questi test provano l'app, quindi dichiarano di girare nell'app installata:
// fuori da standalone Cent e' una pagina di installazione (ADR 011). Vedi
// `installed.ts` per il perche' la cucitura sta qui e non nel codice dell'app.
import { chiudiGuida, expect, test } from './installed'
import { fontPronto, TEST_FONT } from './font'
import { fissaOrologio, giornoDichiarato } from './clock'
import type { Page } from '@playwright/test'
// Il pavimento della colonna vive nel modello e il suo denominatore e' un
// **contratto su `--strip-h`**, che sta in `Home.css`. I due file non si vedono,
// quindi il legame non puo' essere affidato a due commenti: si importa la
// costante e si risolve il token dalla pagina. E' il gemello di cio' che
// `statistiche.spec.ts` fa con `BAR_MIN_FRACTION` e `--plot-min`.
import { COLUMN_MIN_FRACTION } from '../../src/ui/budget-view'

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

/** Un blocco misurato, nel sistema di coordinate del contenuto che scorre. */
interface Spot {
  readonly top: number
  /** `null` quando di quel blocco non si guarda l'asse orizzontale. */
  readonly left: number | null
  readonly width: number | null
  readonly height: number | null
}

type Geometry = Record<string, Spot | null>

interface Mark {
  readonly sel: string
  /** Anche `left` e `width`: vero per i blocchi la cui larghezza e' layout. */
  readonly box: boolean
  /** Anche l'altezza: vero solo dove l'altezza e' una riserva, non contenuto. */
  readonly height: boolean
}

/**
 * I blocchi del guscio, e cosa si guarda di ciascuno.
 *
 * **Il `top` sempre**: e' l'asse su cui il guscio che si riempie sposta le cose,
 * ed e' quello che il pollice sente mentre e' in volo verso il secondo tap.
 *
 * **`left` e `width` dove sono layout e non contenuto.** Sulla barra in alto lo
 * sono: le schede stanno a destra, quindi la larghezza delle etichette decide
 * dove cadono i bersagli — ed e' esattamente il difetto che `Fit` chiude e che
 * il CLS non vedeva, perche' fra "Storico" e "History" c'e' **1px** e un
 * pixel non produce nessuna voce `layout-shift`. Su `.budget` no: quel bottone
 * cambia parola con i dati ("Imposta un budget" -> "Cambia budget") e la sua
 * larghezza **e'** contenuto.
 *
 * **L'altezza solo dove e' una riserva.** `.hero__value` e `.slot` hanno un
 * `min-block-size` scritto per contenere lo stato piu' alto: se un giorno non
 * bastasse, l'altezza cambierebbe con i dati e tutto quello che sta sotto
 * scenderebbe. Guardarla li' dice **quale** riserva ha ceduto invece di dire
 * soltanto che qualcosa e' sceso.
 *
 * ## Cosa non e' piu' un blocco del guscio, e perche' non e' un indebolimento
 *
 * Qui c'erano `.today` e `.today__head`. Adesso c'e' `.days`, che e' la stessa
 * sezione con dentro anche la striscia dei sette giorni, e **l'intestazione non
 * c'e' piu'**.
 *
 * La ragione non e' che il difetto sia diventato tollerabile: e' che
 * l'invariante era scritto piu' stretto del fatto che difendeva. `.days` e' la
 * **coda** della Home — l'unico blocco senza altezza riservata, e l'ultimo:
 * sotto di lei non c'e' niente. Cio' che il guscio deve garantire di una coda
 * e' **dove comincia**, non cosa contiene; il numero di righe di oggi non e'
 * riservabile per costruzione (sono cinquemila nel caso peggiore), e la
 * `.blank` del guscio e' un segnaposto della coda, non la riserva di un blocco
 * preciso.
 *
 * `.today__head` invece **esiste solo quando la giornata ha righe**, che e' un
 * fatto che il guscio non puo' conoscere. Con la regola precedente — un blocco
 * che manca nel guscio e' un difetto — quell'intestazione era obbligata a
 * esistere anche a giornata vuota, dove non ha niente da intestare: la regola
 * del gate stava **decidendo un pezzo di prodotto**, e lo decideva male.
 *
 * Cio' che resta sorvegliato e' il fatto vero: `.days` comincia allo stesso
 * pixel prima e dopo i dati. Se un giorno la striscia o l'intestazione
 * spostassero qualcosa **sopra** di loro, cadrebbe li'. E la rete del CLS
 * continua a guardare tutto il resto, compreso cio' che si muove dentro la
 * coda.
 */
const LANDMARKS: readonly Mark[] = [
  { sel: '.app__bar', box: true, height: false },
  { sel: '.app__action', box: true, height: false },
  { sel: '.nav', box: true, height: false },
  { sel: '.app__main', box: true, height: false },
  { sel: '.home', box: true, height: false },
  { sel: '.hero', box: true, height: false },
  { sel: '.hero__period', box: false, height: false },
  { sel: '.hero__label', box: false, height: false },
  { sel: '.hero__value', box: false, height: true },
  { sel: '.hero__note', box: false, height: false },
  { sel: '.slot', box: true, height: true },
  { sel: '.budget', box: false, height: false },
  { sel: '.days', box: true, height: false },
  { sel: '.fab', box: true, height: false },
]

/**
 * Il gate: cosa non e' rimasto dov'era, riga per riga.
 *
 * Zero tolleranza e nessuna soglia — e' un confronto fra due misure prese dallo
 * stesso browser nella stessa esecuzione, quindi una differenza e' un fatto, non
 * rumore. Un blocco che manca nel guscio e' anch'esso un difetto: vuol dire che
 * la schermata non ha uno stato "senza dati" gia' definitivo per layout.
 */
function drift(before: Geometry | null, after: Geometry | null): string[] {
  if (before === null) return ['il guscio non e\' stato misurato: nessun frame con la Home dentro']
  if (after === null) return ['lo stato con i dati non e\' stato misurato']

  const rows: string[] = []
  for (const { sel } of LANDMARKS) {
    const a = before[sel] ?? null
    const b = after[sel] ?? null
    if (a === null) {
      rows.push(`${sel}: non c'e' nel guscio, quindi il guscio non e' definitivo`)
      continue
    }
    if (b === null) {
      rows.push(`${sel}: c'era nel guscio e con i dati e' sparito`)
      continue
    }
    for (const axis of ['top', 'left', 'width', 'height'] as const) {
      const x = a[axis]
      const y = b[axis]
      if (x === null || y === null) continue
      if (x !== y) rows.push(`${sel} ${axis}: ${x} -> ${y} (${Math.round((y - x) * 100) / 100}px)`)
    }
  }
  return rows
}

/**
 * Osserva gli spostamenti di layout **da prima della navigazione**: con
 * `buffered: true` arrivano anche quelli avvenuti prima che l'osservatore
 * esistesse. Al primo frame utile registra il rettangolo del numero grande e
 * **la geometria di tutti i blocchi**: e' l'unico istante in cui la domanda
 * "dove sta il guscio?" ha una risposta, e va presa da dentro la pagina perche'
 * dura pochi millisecondi.
 *
 * Il lettore della geometria resta appeso a `window`: cosi' la misura del guscio
 * e quella finale sono **la stessa funzione**, e non due copie che un giorno
 * divergono.
 */
async function watch(page: Page): Promise<void> {
  await page.addInitScript(({ marks, font }: { marks: readonly Mark[]; font: string }) => {
    const w = window as unknown as {
      __shifts: Shift[]
      __firstHero: FirstHero | null
      __fcp: number | null
      __firstGeometry: Geometry | null
      __fontAtFirstFrame: boolean
      __geometry: () => Geometry
    }
    w.__shifts = []
    w.__firstHero = null
    w.__fcp = null
    w.__firstGeometry = null
    w.__fontAtFirstFrame = false

    /**
     * Le posizioni **nel contenuto**, non nel viewport: la Home e' il
     * contenitore che scorre, quindi a un blocco dentro di lei si somma il suo
     * `scrollTop`. Senza, uno scroll si leggerebbe come uno spostamento di
     * layout — e sono la cosa opposta.
     */
    w.__geometry = () => {
      const home = document.querySelector('.home')
      const px = (v: number): number => Math.round(v * 100) / 100
      const out: Geometry = {}
      for (const mark of marks) {
        const el = document.querySelector(mark.sel)
        if (el === null) {
          out[mark.sel] = null
          continue
        }
        const box = el.getBoundingClientRect()
        const scrolled = home !== null && home !== el && home.contains(el) ? home.scrollTop : 0
        out[mark.sel] = {
          top: px(box.top + scrolled),
          left: mark.box ? px(box.left) : null,
          width: mark.box ? px(box.width) : null,
          height: mark.height ? px(box.height) : null,
        }
      }
      return out
    }

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
      w.__firstGeometry = w.__geometry()
      // La premessa d'ambiente, presa nell'istante in cui viene usata: se il
      // font di prova non fosse ancora arrivato, questa misura sarebbe fatta
      // con il font di sistema della macchina — cioe' la cosa che `font.ts`
      // esiste per togliere di mezzo — e un rosso direbbe la bugia piu' costosa
      // possibile ("la riserva ha ceduto") al posto della verita' ("la premessa
      // e' arrivata tardi").
      w.__fontAtFirstFrame = document.fonts.check(`16px "${font}"`)
    }
    requestAnimationFrame(look)
  }, { marks: LANDMARKS, font: TEST_FONT })
}

interface Measures {
  readonly cls: number
  readonly shifts: readonly Shift[]
  readonly firstHero: FirstHero | null
  readonly finalHero: { top: number; height: number; text: string } | null
  /** I blocchi al primo frame utile e a pagina ferma: il gate confronta questi. */
  readonly firstGeometry: Geometry | null
  readonly finalGeometry: Geometry | null
  /** Il font dichiarato era gia' in pagina quando il guscio e' stato misurato. */
  readonly fontAtFirstFrame: boolean
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
      __firstGeometry: Geometry | null
      __fontAtFirstFrame?: boolean
      __geometry?: () => Geometry
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
      firstGeometry: w.__firstGeometry,
      finalGeometry: w.__geometry?.() ?? null,
      fontAtFirstFrame: w.__fontAtFirstFrame ?? false,
      fcp: w.__fcp,
      // Caso 2 di CLAUDE.md, "Verifiche che passano perche' la macchina non e'
      // il bersaglio": l'asserzione qui sotto e' esatta (nessuna tolleranza),
      // ma **se** l'overflow accada dipende dalle metriche del font, e qui il
      // font non e' quello del telefono. Non c'e' niente da rendere piu' severo:
      // la copertura vera e' il dispositivo, ed e' nel criterio di chiusura di
      // ogni fase.
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

/**
 * Il giorno civile **dichiarato**, nella stessa forma dell'app.
 *
 * Prima lo leggeva dall'orologio di chi esegue il test, e sono due orologi
 * diversi: questa riga gira in Node (Europe/Rome in locale, UTC in CI), la
 * pagina gira nel fuso dichiarato e con l'orologio fissato. Un dato preparato
 * di qua e letto di la' finiva su due giorni diversi — e bastava che il run
 * attraversasse la mezzanotte perche' finisse su due giorni diversi comunque.
 */
function todayIso(): string {
  return giornoDichiarato()
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

/**
 * La riga di diario di una scena: gli stessi numeri sotto il gate e sotto la
 * rete, cosi' l'output dice **cosa e' stato misurato** anche quando passa.
 */
function racconta(project: string, scena: string, m: Measures): void {
  console.log(
    `\n  [${project}] ${scena}  CLS=${m.cls}  FCP=${Math.round(m.fcp ?? -1)}ms` +
      `  primo frame utile: ${m.firstHero?.at}ms (${m.firstHero?.frames} frame)` +
      ` "${m.firstHero?.text ?? '(nessun numero)'}" top ${m.firstHero?.top}px h ${m.firstHero?.height}px` +
      `  finale: "${m.finalHero?.text}" top ${m.finalHero?.top}px h ${m.finalHero?.height}px`,
  )
}

/**
 * Le scene, una funzione per ognuna.
 *
 * Ogni scena prepara uno stato, ricarica con l'osservatore acceso e restituisce
 * le misure. Le usano **due test a testa** — il gate e la rete — e stanno qui
 * perche' e' cio' che rende i due test la stessa scena guardata con due
 * strumenti, invece di due scene che si somigliano.
 */
async function scenaVuota(page: Page): Promise<Measures> {
  await watch(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)
  await settled(page)
  return measure(page)
}

async function scena5000(page: Page): Promise<Measures> {
  // 5.000 spese seminate all'indietro **da oggi**, poi un ricaricamento: se in
  // mezzo passasse la mezzanotte, la scena misurata non sarebbe questa.
  await fissaOrologio(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)

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
  return measure(page)
}

test.describe('la Home non salta, senza budget e senza spese', () => {
  test('gate: i blocchi stanno al pixel dove il guscio li aveva messi', async ({
    page,
  }, testInfo) => {
    const m = await scenaVuota(page)
    racconta(testInfo.project.name, 'home vuota', m)

    // Il numero grande esiste al primo frame utile. Va chiesto prima del
    // confronto: senza guscio da confrontare il gate sarebbe verde per assenza
    // di misura, che e' il modo peggiore in cui un test puo' passare.
    expect(m.firstHero, 'al primo frame il numero grande non e\' nel DOM').not.toBeNull()
    // **E al primo frame era ancora vuoto.** Senza questa riga il gate confronta
    // due geometrie che possono essere entrambe quelle *coi dati*: basta che il
    // primo frame utile cada dopo l'arrivo del repository e il confronto diventa
    // una tautologia, verde qualunque cosa succeda alla riserva d'altezza. La
    // premessa non e' teorica — ADR 021 ha appena messo quattro processi sotto
    // la stessa macchina, e un `firstHero.at` fra 1.500 e 2.200 ms e'
    // esattamente il tipo di misura che comincia a lampeggiare a 4 vCPU.
    expect(m.firstHero?.text, 'al primo frame i dati erano gia\' arrivati').toBe('')
    expect(m.fontAtFirstFrame, 'il font dichiarato non era pronto al primo frame').toBe(true)
    expect(
      drift(m.firstGeometry, m.finalGeometry),
      'blocchi spostati dall\'arrivo dei dati',
    ).toEqual([])

    expect(m.overflowX, 'scroll orizzontale in pagina').toBeLessThanOrEqual(0)
    expect(m.homeOverflowX, 'scroll orizzontale dentro la Home').toBeLessThanOrEqual(0)
  })

  test('rete: il CLS resta zero, anche fuori dai blocchi del gate', async ({ page }, testInfo) => {
    const m = await scenaVuota(page)
    racconta(testInfo.project.name, 'home vuota', m)
    expect(m.cls, `spostamenti: ${JSON.stringify(m.shifts)}`).toBe(0)
  })
})

test.describe('la Home non salta, con budget e 5.000 spese, sforando', () => {
  test('gate: i blocchi stanno al pixel dove il guscio li aveva messi', async ({
    page,
  }, testInfo) => {
    const m = await scena5000(page)
    racconta(testInfo.project.name, 'home con budget e 5.000 spese', m)

    expect(m.firstHero, 'al primo frame il numero grande non e\' nel DOM').not.toBeNull()
    // **E al primo frame era ancora vuoto.** Senza questa riga il gate confronta
    // due geometrie che possono essere entrambe quelle *coi dati*: basta che il
    // primo frame utile cada dopo l'arrivo del repository e il confronto diventa
    // una tautologia, verde qualunque cosa succeda alla riserva d'altezza. La
    // premessa non e' teorica — ADR 021 ha appena messo quattro processi sotto
    // la stessa macchina, e un `firstHero.at` fra 1.500 e 2.200 ms e'
    // esattamente il tipo di misura che comincia a lampeggiare a 4 vCPU.
    expect(m.firstHero?.text, 'al primo frame i dati erano gia\' arrivati').toBe('')
    expect(m.fontAtFirstFrame, 'il font dichiarato non era pronto al primo frame').toBe(true)
    expect(
      drift(m.firstGeometry, m.finalGeometry),
      'blocchi spostati dall\'arrivo dei dati',
    ).toEqual([])

    expect(m.overflowX, 'scroll orizzontale in pagina').toBeLessThanOrEqual(0)
    expect(m.homeOverflowX, 'scroll orizzontale dentro la Home').toBeLessThanOrEqual(0)
  })

  test('rete: il CLS resta zero, anche fuori dai blocchi del gate', async ({ page }, testInfo) => {
    const m = await scena5000(page)
    racconta(testInfo.project.name, 'home con budget e 5.000 spese', m)
    expect(m.cls, `spostamenti: ${JSON.stringify(m.shifts)}`).toBe(0)
  })

  /**
   * **Sforare si vede una volta, e il resto della schermata dice altro.**
   *
   * Questo test ne pretendeva **tre** — segno, colore, barra — e ne lasciava
   * passare altre tre senza guardarle: `Il budget del periodo e' finito.`,
   * `Restano 2 giorni: quello che spendi da qui e' in piu'.` e `Sopra ritmo: …`.
   * Sei affermazioni per un fatto solo, e un test che ne asseriva metà come se
   * fossero il conto giusto.
   *
   * Adesso il fatto lo dicono **il numero col suo segno, l'etichetta sopra di
   * lui e il colore**, e sono tre affermazioni in un posto solo: la barra piena
   * era la quarta, la stessa cosa detta in geometria, ed e' uscita. La riga
   * sotto porta **i due numeri che nessun altro dava**: il passo tenuto e quello
   * sostenibile.
   *
   * L'asserzione che conta e' quindi diventata **negativa**: nessuna frase
   * ridice cio' che il numero grande ha gia' detto. Un `toHaveText` su una
   * stringa nuova sarebbe stato verde anche rimettendo le altre due.
   */
  test('sforare si dice una volta, e la riga sotto porta due numeri nuovi', async ({ page }) => {
    await scena5000(page)

    // Il residuo resta col segno e il tono cambia; l'etichetta sopra il numero
    // segue il segno invece di contraddirlo ("Restano -88,00 €" era una
    // contraddizione, viva dalla fase 4).
    await expect(page.locator('.hero__value')).toHaveAttribute('data-tone', 'over')
    await expect(page.locator('.hero__value')).toContainText('-')
    await expect(page.locator('.hero__label')).toHaveText('Oltre il budget')

    // **E la barra del periodo non c'e' piu'**, ne' sforata ne' altrove.
    // L'asserzione e' negativa di proposito: e' l'unica forma che cade se
    // qualcuno la rimette. Oltre il budget era al 100% sempre — identica a 1,01
    // volte il budget e a quattro — cioe' una marca con lo stesso aspetto in
    // tutto un ramo; sotto il budget misurava `speso / budget`, che questa
    // schermata dice gia' col numero, con l'etichetta e con la nota. Il conto
    // completo sta in testa a `Home.tsx`.
    await expect(page.locator('.track')).toHaveCount(0)

    // E la riga azionabile non lo ripete: porta i giorni e i due passi.
    const allowance = page.locator('.allowance')
    await expect(allowance).toContainText('giorni')
    await expect(allowance).toContainText('sostenibili')

    // **Nessuna parafrasi del fatto gia' detto**, in nessuna delle righe del
    // riquadro. Le tre frasi tolte sono nominate una per una: un controllo sul
    // testo nuovo sarebbe verde anche rimettendole accanto.
    const riquadro = (await page.locator('.slot').innerText()).replace(/\s+/g, ' ')
    expect(riquadro).not.toContain('budget del periodo è finito')
    expect(riquadro).not.toContain('è in più')
    expect(riquadro).not.toContain('Sopra ritmo')
    // E nessun rimprovero: sforare e' un'informazione, non un errore.
    expect(riquadro).not.toContain('!')
  })
})

test.describe('la Home non salta', () => {
  test('passando da senza budget a con budget', async ({ page }) => {
    // Il terzo salto possibile: non guscio -> dati, ma uno stato di dati verso
    // l'altro. Il riquadro sotto il numero cambia contenuto del tutto.
    await page.goto('./')
    await expect(page.locator('.budget')).toBeEnabled()
    await chiudiGuida(page)

    /**
     * Dove comincia la sezione di oggi **dentro il contenuto**, non nel
     * viewport: `tap()` su un bersaglio fuori schermo lo porta in vista
     * scorrendo, e in orizzontale succede davvero. Misurare la posizione sullo
     * schermo confonderebbe uno scroll con uno spostamento di layout.
     */
    const headTop = (): Promise<number> =>
      page.evaluate(() => {
        const el = document.querySelector('.days')
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
    expect(after, 'impostare un budget ha spostato la coda della Home').toBe(before)
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
async function scena320(page: Page): Promise<Measures> {
  await page.setViewportSize({ width: 320, height: 568 })
  await fissaOrologio(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)
  await setBudget(page, '70000', 'A settimana')
  await seed(page, 200)

  await watch(page)
  await page.reload()
  await expect(page.locator('.row').first()).toBeVisible()
  await settled(page)
  return measure(page)
}

test.describe('a 320 punti la Home non salta lo stesso', () => {
  test('gate: i blocchi stanno al pixel dove il guscio li aveva messi', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-se', 'la larghezza la impone il test')

    const m = await scena320(page)
    racconta('320x568', 'home con budget', m)

    expect(m.firstHero, 'al primo frame il numero grande non e\' nel DOM').not.toBeNull()
    // **E al primo frame era ancora vuoto.** Senza questa riga il gate confronta
    // due geometrie che possono essere entrambe quelle *coi dati*: basta che il
    // primo frame utile cada dopo l'arrivo del repository e il confronto diventa
    // una tautologia, verde qualunque cosa succeda alla riserva d'altezza. La
    // premessa non e' teorica — ADR 021 ha appena messo quattro processi sotto
    // la stessa macchina, e un `firstHero.at` fra 1.500 e 2.200 ms e'
    // esattamente il tipo di misura che comincia a lampeggiare a 4 vCPU.
    expect(m.firstHero?.text, 'al primo frame i dati erano gia\' arrivati').toBe('')
    expect(m.fontAtFirstFrame, 'il font dichiarato non era pronto al primo frame').toBe(true)
    expect(
      drift(m.firstGeometry, m.finalGeometry),
      'blocchi spostati dall\'arrivo dei dati',
    ).toEqual([])

    expect(m.overflowX, 'scroll orizzontale in pagina').toBeLessThanOrEqual(0)
    expect(m.homeOverflowX, 'scroll orizzontale dentro la Home').toBeLessThanOrEqual(0)
  })

  test('rete: il CLS resta zero, anche fuori dai blocchi del gate', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone-se', 'la larghezza la impone il test')

    const m = await scena320(page)
    racconta('320x568', 'home con budget', m)
    expect(m.cls, `spostamenti: ${JSON.stringify(m.shifts)}`).toBe(0)
  })
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
  await page.clock.setFixedTime(new Date('2026-08-19T10:00:00+02:00'))

  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)

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
  await page.clock.setFixedTime(new Date('2026-08-23T10:00:00+02:00'))

  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)
  await setBudget(page, '70000', 'A settimana')

  const allowance = page.locator('.allowance')
  await expect(allowance).toContainText('Puoi spendere')
  await expect(allowance).toContainText('700,00')
  await expect(allowance).toContainText('oggi')
  // Le due cose che mentivano: la tilde e "al giorno".
  await expect(allowance).not.toContainText('~')
  await expect(allowance).not.toContainText('al giorno')
  // **Il dettaglio e' nella stessa riga**, e non in una sotto: erano due frasi
  // che si contraddicevano a due righe di distanza — "Puoi spendere ~128,55 €
  // al giorno" e "Ultimo giorno del periodo" — e adesso e' una sola, che non
  // puo' contraddirsi.
  await expect(allowance).toContainText('ultimo giorno del periodo')
  await expect(page.locator('.allowance__sub')).toHaveCount(0)
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
  await page.clock.install({ time: new Date('2026-08-23T23:30:00+02:00') })
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)
  await expect(page.locator('.hero__period')).toContainText('17')
  await expect(page.locator('.hero__period')).toContainText('23')

  // Lunedi' 24, mezzanotte e cinque: settimana nuova.
  await page.clock.setFixedTime(new Date('2026-08-24T00:05:00+02:00'))
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
  await chiudiGuida(page)

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
  await chiudiGuida(page)
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
 * sfondasse, spingerebbe in giu' le spese di oggi all'arrivo dei dati — proprio
 * nel periodo in cui la frase compare. Il gate lo vede sull'altezza di `.slot`
 * e sul `top` del bottone del budget, cioe' dice **cosa** ha ceduto.
 */
async function scenaMetaSettimana(page: Page): Promise<Measures> {
  // Mercoledi' 19 agosto 2026: la settimana e' cominciata lunedi' 17.
  await page.clock.install({ time: new Date('2026-08-19T10:00:00+02:00') })
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)

  await seedOn(page, [
    ['2026-08-17', 12_000],
    ['2026-08-18', 12_000],
  ])
  await page.reload()
  await expect(page.locator('.hero__value')).toHaveText('240,00 €')
  await setBudget(page, '20000', 'A settimana')
  await expect(page.locator('.since')).toBeVisible()

  await watch(page)
  await page.reload()
  await expect(page.locator('.since')).toBeVisible()
  await settled(page)
  return measure(page)
}

test.describe('la Home con un budget nato a meta settimana', () => {
  test('lo spiega, invece di annunciare che il budget e\' finito', async ({ page }) => {
    // Mercoledi' 19 agosto 2026: la settimana e' cominciata lunedi' 17.
    await page.clock.install({ time: new Date('2026-08-19T10:00:00+02:00') })
    await page.goto('./')
    await expect(page.locator('.budget')).toBeEnabled()
    await chiudiGuida(page)

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
    // Ma la riga che giudicava adesso racconta, e non in ambra. Il fatto e la
    // data da cui il budget vale pieno stanno nella **stessa** riga: erano due
    // frasi, e la seconda completava la prima invece di aggiungere un fatto.
    await expect(page.locator('.allowance')).toContainText('Questa settimana era già iniziata')
    await expect(page.locator('.allowance')).toContainText('lunedì')
    await expect(page.locator('.allowance')).not.toHaveAttribute('data-tone', 'over')
    await expect(page.locator('.since')).toContainText('Budget attivo da mercoledì')
    await expect(page.locator('.since')).toContainText('240,00')
  })

  test('gate: i blocchi stanno al pixel dove il guscio li aveva messi', async ({
    page,
  }, testInfo) => {
    const m = await scenaMetaSettimana(page)
    racconta(testInfo.project.name, 'home con budget nato a meta settimana', m)

    expect(m.firstHero, 'al primo frame il numero grande non e\' nel DOM').not.toBeNull()
    // **E al primo frame era ancora vuoto.** Senza questa riga il gate confronta
    // due geometrie che possono essere entrambe quelle *coi dati*: basta che il
    // primo frame utile cada dopo l'arrivo del repository e il confronto diventa
    // una tautologia, verde qualunque cosa succeda alla riserva d'altezza. La
    // premessa non e' teorica — ADR 021 ha appena messo quattro processi sotto
    // la stessa macchina, e un `firstHero.at` fra 1.500 e 2.200 ms e'
    // esattamente il tipo di misura che comincia a lampeggiare a 4 vCPU.
    expect(m.firstHero?.text, 'al primo frame i dati erano gia\' arrivati').toBe('')
    expect(m.fontAtFirstFrame, 'il font dichiarato non era pronto al primo frame').toBe(true)
    expect(
      drift(m.firstGeometry, m.finalGeometry),
      'blocchi spostati dall\'arrivo dei dati',
    ).toEqual([])

    expect(m.overflowX, 'scroll orizzontale in pagina').toBeLessThanOrEqual(0)
  })

  test('rete: il CLS resta zero, anche fuori dai blocchi del gate', async ({ page }, testInfo) => {
    const m = await scenaMetaSettimana(page)
    racconta(testInfo.project.name, 'home con budget nato a meta settimana', m)
    expect(m.cls, `spostamenti: ${JSON.stringify(m.shifts)}`).toBe(0)
  })
})

/**
 * Il lampo di lingua, misurato: **lingua scelta diversa da quella rilevata**.
 *
 * E' lo stato che nessun test guardava, e la ragione per cui non lo guardava e'
 * proprio quella che lo rendeva pericoloso: chi non ha mai scelto una lingua non
 * lo vede mai, quindi il difetto vive solo addosso a chi ha fatto una scelta —
 * cioe' a chi ha gia' detto che l'impostazione predefinita non gli andava bene.
 *
 * Il browser di questa suite dichiara `it-IT` (playwright.config.ts) e qui si
 * sceglie **English**: al ricaricamento il guscio si dipinge in italiano per i
 * pochi frame che separano il primo render dall'apertura del database, poi
 * passa all'inglese. Il lampo resta, ed e' cosmetico. Quello che non deve
 * restare e' il suo effetto sul layout: le etichette della barra tengono la
 * larghezza massima fra le due lingue (`Fit`), quindi le schede non si spostano
 * di un pixel quando le parole cambiano.
 *
 * **E' la scena che ha prodotto la tassonomia di CLAUDE.md.** Su Chromium con
 * lo stack di font di sistema "Storico" e "History" differiscono di **1px**, e
 * uno spostamento cosi' piccolo non produce nessuna voce `layout-shift`: il
 * test sul CLS restava verde **anche togliendo la riserva che sorvegliava**. Un
 * test che non cade quando la cosa che sorveglia sparisce non sorveglia niente.
 *
 * Quindi qui il gate e' la **causa**, non la conseguenza: `left` e `width` di
 * `.nav` e di `.app__action` devono essere gli stessi prima e dopo. Quel px lo
 * vede, e su iOS le metriche di SF Pro possono farne sei.
 */
async function scenaLingua(page: Page): Promise<Measures> {
  await fissaOrologio(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)

  // La scelta si fa dalla schermata vera, non scrivendo nel database: quello
  // che si vuole provare e' il percorso che fara' una persona.
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await page.locator('.pick').nth(2).tap()
  await expect(page.locator('.nav__tab').nth(1)).toHaveText('History')

  // Qualche spesa: cosi' il ricaricamento ha davvero dei dati da aspettare.
  await seed(page, 200)

  await watch(page)
  await page.reload()
  await expect(page.locator('.row').first()).toBeVisible()
  // La barra e' passata all'inglese: il momento dopo il lampo, cioe' quello in
  // cui uno spostamento sarebbe gia' avvenuto.
  await expect(page.locator('.nav__tab').nth(1)).toHaveText('History')
  await settled(page)
  return measure(page)
}

test.describe('la Home con la lingua scelta diversa da quella del telefono', () => {
  test('gate: i blocchi stanno al pixel dove il guscio li aveva messi', async ({
    page,
  }, testInfo) => {
    const m = await scenaLingua(page)
    racconta(testInfo.project.name, 'home con lingua scelta ≠ rilevata', m)

    expect(m.firstHero, 'al primo frame il numero grande non e\' nel DOM').not.toBeNull()
    // **E al primo frame era ancora vuoto.** Senza questa riga il gate confronta
    // due geometrie che possono essere entrambe quelle *coi dati*: basta che il
    // primo frame utile cada dopo l'arrivo del repository e il confronto diventa
    // una tautologia, verde qualunque cosa succeda alla riserva d'altezza. La
    // premessa non e' teorica — ADR 021 ha appena messo quattro processi sotto
    // la stessa macchina, e un `firstHero.at` fra 1.500 e 2.200 ms e'
    // esattamente il tipo di misura che comincia a lampeggiare a 4 vCPU.
    expect(m.firstHero?.text, 'al primo frame i dati erano gia\' arrivati').toBe('')
    expect(m.fontAtFirstFrame, 'il font dichiarato non era pronto al primo frame').toBe(true)
    expect(
      drift(m.firstGeometry, m.finalGeometry),
      'blocchi spostati dal cambio di lingua all\'arrivo dei dati',
    ).toEqual([])

    expect(m.overflowX, 'scroll orizzontale in pagina').toBeLessThanOrEqual(0)
  })

  test('rete: il CLS resta zero, anche fuori dai blocchi del gate', async ({ page }, testInfo) => {
    const m = await scenaLingua(page)
    racconta(testInfo.project.name, 'home con lingua scelta ≠ rilevata', m)
    expect(m.cls, `spostamenti: ${JSON.stringify(m.shifts)}`).toBe(0)
  })
})

/**
 * E la controprova della riserva, senza passare dal CLS: la barra e' **larga
 * uguale** nelle due lingue.
 *
 * Il gate qui sopra prende la riserva **nel momento in cui serve** — il lampo
 * di lingua al caricamento. Questo la prende anche quando quel momento non
 * c'e': se un giorno le schede smettessero di essere ancorate a destra, uno
 * spostamento non avverrebbe piu' e la riserva resterebbe inutile senza che
 * nessuno se ne accorga. Cade appena qualcuno toglie `Fit` da un'etichetta del
 * guscio, in qualunque stato.
 */
test('le etichette della barra sono larghe uguale nelle due lingue', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)

  const misura = (): Promise<readonly number[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll('.nav, .app__action')].map((el) =>
        Math.round(el.getBoundingClientRect().width),
      ),
    )

  const inItaliano = await misura()

  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await page.locator('.pick').nth(2).tap()
  await expect(page.locator('.nav__tab').nth(1)).toHaveText('History')

  const inInglese = await misura()

  expect(inItaliano.length).toBeGreaterThan(0)
  expect(inInglese, `italiano ${inItaliano.join('/')} contro inglese ${inInglese.join('/')}`).toEqual(
    inItaliano,
  )
})

/**
 * Il promemoria di backup compare **quando i dati arrivano**, cioe' nell'istante
 * esatto in cui la regola "Ordine di pittura" vieta di spostare qualcosa.
 *
 * E' una banda in fondo alla colonna: accorcia il contenitore che scorre invece
 * di coprirlo, e i suoi figli restano ancorati in alto. Detta cosi' sembra
 * ovvia; e' esattamente il tipo di cosa che questo progetto ha gia' sbagliato
 * due volte, quindi si misura.
 */
async function scenaPromemoria(page: Page): Promise<Measures> {
  await fissaOrologio(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)
  await setBudget(page, '20000', 'A settimana')
  await seed(page, 200)

  // Due settimane e mezzo dal primo avvio, e nessun export mai fatto: e' la
  // condizione vera del promemoria, ottenuta invecchiando il dato e non
  // abbassando la soglia.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cent')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const record: Record<string, unknown> | undefined = await new Promise((resolve, reject) => {
      const request = db.transaction('settings').objectStore('settings').get('settings')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (record === undefined) throw new Error('le impostazioni non sono sul disco')
    const back = new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite')
      tx.objectStore('settings').put({ ...record, createdAt: back })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })

  await watch(page)
  await page.reload()
  await expect(page.locator('.nudge')).toBeVisible()
  await expect(page.locator('.row').first()).toBeVisible()
  await settled(page)
  return measure(page)
}

test.describe('il promemoria di backup compare senza far saltare la Home', () => {
  test('gate: i blocchi stanno al pixel dove il guscio li aveva messi', async ({
    page,
  }, testInfo) => {
    const m = await scenaPromemoria(page)
    racconta(testInfo.project.name, 'home + promemoria di backup', m)

    expect(m.firstHero, 'al primo frame il numero grande non e\' nel DOM').not.toBeNull()
    // **E al primo frame era ancora vuoto.** Senza questa riga il gate confronta
    // due geometrie che possono essere entrambe quelle *coi dati*: basta che il
    // primo frame utile cada dopo l'arrivo del repository e il confronto diventa
    // una tautologia, verde qualunque cosa succeda alla riserva d'altezza. La
    // premessa non e' teorica — ADR 021 ha appena messo quattro processi sotto
    // la stessa macchina, e un `firstHero.at` fra 1.500 e 2.200 ms e'
    // esattamente il tipo di misura che comincia a lampeggiare a 4 vCPU.
    expect(m.firstHero?.text, 'al primo frame i dati erano gia\' arrivati').toBe('')
    expect(m.fontAtFirstFrame, 'il font dichiarato non era pronto al primo frame').toBe(true)
    expect(
      drift(m.firstGeometry, m.finalGeometry),
      'la banda del promemoria ha spostato qualcosa comparendo',
    ).toEqual([])

    expect(m.overflowX, 'scroll orizzontale in pagina').toBeLessThanOrEqual(0)
    expect(m.homeOverflowX, 'scroll orizzontale dentro la Home').toBeLessThanOrEqual(0)
  })

  test('rete: il CLS resta zero, anche fuori dai blocchi del gate', async ({ page }, testInfo) => {
    const m = await scenaPromemoria(page)
    racconta(testInfo.project.name, 'home + promemoria di backup', m)
    expect(m.cls, `spostamenti: ${JSON.stringify(m.shifts)}`).toBe(0)
  })
})

/**
 * La riserva del riquadro, misurata in cio' che deve contenere.
 *
 * ## Perche' questi test esistono
 *
 * `--slot-min` e' stato per due fasi un numero tondo scelto su una macchina
 * sola. Ha retto finche' la macchina e' stata una: al primo runner Linux —
 * dove lo stack di font di sistema non risolve in SF Pro — una frase ha preso
 * una riga in piu' e ha sfondato la riserva. Dichiarare il font (`font.ts`)
 * toglie di mezzo la differenza fra le due macchine, ma da solo **nasconderebbe
 * il difetto invece di ripararlo**: la riserva resterebbe un numero che non sa
 * cosa sta riservando, e la prossima riga di troppo — una lingua nuova, un
 * importo a cinque cifre, SF Pro sul telefono — la sfonderebbe di nuovo.
 *
 * Adesso la riserva e' la somma delle righe dichiarate in `Home.css`
 * (`--rows-*`). Questi test la tengono onesta da due lati opposti:
 *
 * 1. **copre**: nessuno stato del riquadro sfonda, in nessuna delle due lingue;
 * 2. **non avanza**: sullo stato piu' alto la riserva e' esattamente il
 *    contenuto, quindi una riga in piu' si vede. E' la meta' che di solito
 *    manca: una riserva generosa fa passare tutto, gate compreso, e il giorno
 *    che il layout si rompe davvero non lo dice nessuno.
 *
 * Il conteggio delle righe si legge dal CSS, non e' riscritto qui: se qualcuno
 * alza `--rows-allowance` a 3 senza che una frase lo chieda, il primo test lo
 * lascia passare e il secondo cade dicendo che la riserva ha cominciato ad
 * avanzare. E' il modo di far cadere un test **quando la cosa che sorveglia
 * sparisce**, non solo quando si rompe.
 */
interface Riserva {
  /** L'altezza vera del riquadro, cioe' la riserva quando il contenuto ci sta. */
  readonly riservato: number
  /** L'altezza che il contenuto vuole, con la riserva tolta per un istante. */
  readonly naturale: number
  /** Quante righe prende ogni frase, adesso. */
  readonly righe: Readonly<Record<string, number>>
  /** Quante ne dichiara il CSS. La chiave e' il selettore, non il token. */
  readonly dichiarate: Readonly<Record<string, number>>
  /** La riga piu' bassa del riquadro: l'unita' con cui si misura l'avanzo. */
  readonly rigaMinima: number
}

/**
 * Le righe si contano dai rettangoli del testo, non dall'altezza divisa per il
 * `line-height`: due frasi con tipografie diverse darebbero conti diversi, e
 * `.pace` ha dentro dei `<b>` che spezzano il testo in piu' rettangoli sulla
 * stessa riga. Righe distinte = valori di `top` distinti.
 */
async function misuraRiserva(page: Page): Promise<Riserva> {
  return page.evaluate(() => {
    const slot = document.querySelector('.slot')
    const home = document.querySelector('.home')
    if (!(slot instanceof HTMLElement) || home === null) {
      throw new Error('il riquadro non e\' in pagina: non c\'e' + ' niente da misurare')
    }
    const px = (v: number): number => Math.round(v * 100) / 100
    const riservato = px(slot.getBoundingClientRect().height)

    // La riserva si toglie per un istante, si legge quanto il contenuto vuole
    // davvero e si rimette: e' l'unico modo di sapere **quanto avanza**, che e'
    // la meta' interessante della domanda.
    //
    // **Le riserve sono due, e toglierne una sola falsificava la misura.** Dalla
    // striscia in poi anche `.slot__body` ha il suo `min-block-size` — e' quello
    // che tiene fermo il bottone del budget fra guscio e dati — quindi azzerando
    // solo quella del riquadro il "naturale" tornava identico al "riservato" e
    // tutte e due le asserzioni diventavano tautologie: l'avanzo sempre zero, e
    // la controprova che allunga `.since` sempre verde perche' la riga in piu'
    // veniva assorbita dalla riserva interna. Trovato rileggendo, non da un
    // rosso: e' precisamente la classe di difetto che questo file esiste per
    // sorvegliare, comparsa dentro il file stesso.
    const body = slot.querySelector('.slot__body')
    if (!(body instanceof HTMLElement)) {
      throw new Error('il corpo del riquadro non e\' in pagina: la misura sarebbe falsa')
    }
    const primaSlot = slot.style.minBlockSize
    const primaBody = body.style.minBlockSize
    slot.style.minBlockSize = '0px'
    body.style.minBlockSize = '0px'
    const naturale = px(slot.getBoundingClientRect().height)
    slot.style.minBlockSize = primaSlot
    body.style.minBlockSize = primaBody

    const righe: Record<string, number> = {}
    // **I nipoti, non i figli.** Il riquadro adesso ha due contenitori — il
    // corpo e il piede — e le frasi che la riserva somma stanno dentro di loro.
    // Con `slot.children` le chiavi diventavano `.slot__body` e `.slot__foot`,
    // che `dichiarate` non conosce: il ciclo delle asserzioni sui conteggi
    // faceva `continue` su tutto e il test restava verde **senza misurare piu'
    // niente**. E' la forma esatta del difetto che questo file esiste per non
    // avere.
    for (const el of [...slot.children].flatMap((figlio) => [...figlio.children])) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const tops = new Set([...range.getClientRects()].map((r) => Math.round(r.top * 10) / 10))
      righe[`.${el.classList[0] ?? '?'}`] = Math.max(tops.size, 1)
    }

    const stile = getComputedStyle(home)
    const conta = (token: string): number => Number(stile.getPropertyValue(token).trim())
    const misura = (token: string): number => {
      const probe = document.createElement('div')
      probe.style.blockSize = `var(${token})`
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      home.appendChild(probe)
      const h = px(probe.getBoundingClientRect().height)
      probe.remove()
      return h
    }

    return {
      riservato,
      naturale,
      righe,
      dichiarate: {
        '.allowance': conta('--rows-allowance'),
        '.since': conta('--rows-since'),
        '.pace': conta('--rows-pace'),
        '.invite': conta('--rows-invite'),
        // La nota delle fisse (ADR 016 §2) e' scesa dentro il riquadro: prima
        // stava nel blocco del numero grande e riservava l'altezza per conto
        // suo, quindi questa sonda non la vedeva. Adesso e' una delle righe che
        // `--slot-min` somma, e se un giorno prendesse due righe la riserva
        // sfonderebbe come qualunque altra.
        '.slot__fixed': conta('--rows-fixed'),
      },
      // La riga piu' bassa che il riquadro contenga: 13px per 1.25. Se la
      // riserva avanzasse di tanto, assorbirebbe una riga intera di quel testo
      // senza che nessuno se ne accorga.
      rigaMinima: misura('--line-note'),
    }
  })
}

/** Passa all'inglese dalla schermata vera e torna sulla Home. */
async function inInglese(page: Page): Promise<void> {
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await page.locator('.pick').nth(2).tap()
  await expect(page.locator('.nav__tab').nth(1)).toHaveText('History')
  await page.locator('.nav__tab').first().tap()
  await expect(page.locator('.home')).toBeVisible()
}

/**
 * I tre stati del riquadro, uno dopo l'altro sulla stessa pagina — l'ordine e'
 * quello che permette di non cancellare mai niente: prima senza budget, poi il
 * budget nato a meta' settimana con gli importi piu' larghi che il tastierino
 * accetta, poi l'ultimo giorno del periodo (che ha il dettaglio piu' lungo).
 */
async function statiDelRiquadro(
  page: Page,
  settimanale: string,
): Promise<Readonly<Record<string, Riserva>>> {
  const senzaBudget = await misuraRiserva(page)

  // Il caso piu' largo raggiungibile: 99.999,99 € a settimana con quasi
  // 10.000 € gia' spesi prima che il budget esistesse. Non e' un caso di
  // fantasia — e' il tetto del tastierino — ed e' quello che manda a capo la
  // riga della disponibilita'.
  await seedOn(page, [
    ['2026-08-17', 499_999],
    ['2026-08-18', 499_999],
  ])
  await page.reload()
  await expect(page.locator('.budget')).toBeEnabled()
  await setBudget(page, '9999999', settimanale)
  await expect(page.locator('.since')).toBeVisible()
  const metaSettimana = await misuraRiserva(page)

  // Domenica: "Ultimo giorno del periodo: domani riparte da capo." e' il
  // dettaglio piu' lungo delle due lingue.
  await page.clock.setFixedTime(new Date('2026-08-23T10:00:00+02:00'))
  await page.reload()
  await expect(page.locator('.allowance')).toBeVisible()
  const ultimoGiorno = await misuraRiserva(page)

  return { 'senza budget': senzaBudget, 'meta settimana': metaSettimana, 'ultimo giorno': ultimoGiorno }
}

const LINGUE = [
  { id: 'it', nome: 'italiano', settimanale: 'A settimana' },
  { id: 'en', nome: 'inglese', settimanale: 'Per week' },
] as const

for (const lingua of LINGUE) {
  test(`la riserva del riquadro contiene le righe che dichiara (${lingua.nome})`, async ({
    page,
  }, testInfo) => {
    await page.clock.install({ time: new Date('2026-08-19T10:00:00+02:00') })
    await page.goto('./')
    await expect(page.locator('.budget')).toBeEnabled()
    await chiudiGuida(page)
    expect(await fontPronto(page), 'il font dichiarato non e\' in pagina').toBe(true)
    if (lingua.id === 'en') await inInglese(page)

    const stati = await statiDelRiquadro(page, lingua.settimanale)

    for (const [nome, r] of Object.entries(stati)) {
      console.log(
        `\n  [${testInfo.project.name}] riquadro / ${lingua.nome} / ${nome}:` +
          ` contenuto ${r.naturale}px, riservati ${r.riservato}px, avanzo ${
            Math.round((r.riservato - r.naturale) * 100) / 100
          }px  ` +
          Object.entries(r.righe)
            .map(([sel, n]) => `${sel} ${n}r`)
            .join(' · '),
      )

      expect(
        r.naturale,
        `"${nome}" sfonda la riserva: il contenuto vuole ${r.naturale}px e il riquadro ne riserva ${r.riservato}px, quindi tutto cio' che sta sotto scende all'arrivo dei dati`,
      ).toBeLessThanOrEqual(r.riservato)

      for (const [sel, righe] of Object.entries(r.righe)) {
        const dichiarate = r.dichiarate[sel]
        if (dichiarate === undefined) continue
        expect(
          righe,
          `"${nome}": ${sel} prende ${righe} righe e Home.css ne dichiara ${dichiarate}. O la frase e' cambiata, o la riserva non sa piu' cosa contiene`,
        ).toBeLessThanOrEqual(dichiarate)
      }
    }
  })
}

/**
 * E la controprova, che e' il punto: **una riga in piu' si deve vedere**.
 *
 * Gira dove la riserva e' dimensionata, cioe' alla larghezza piu' stretta dei
 * telefoni (375 punti): li' lo stato piu' alto riempie il riquadro fino
 * all'ultimo pixel, e allungare una frase di una riga lo fa crescere. A 390
 * punti la stessa dichiarazione avanza di una riga della disponibilita' — e'
 * il prezzo di coprire i 375 con un solo numero, ed e' scritto in Home.css.
 *
 * Il test non simula: allunga davvero il testo di `.since` finche' va a capo
 * una volta di piu', e guarda l'altezza del riquadro. Se dopo questo la riserva
 * assorbisse ancora tutto, vorrebbe dire che il gate non sorveglia piu' niente
 * e che i verdi della Home sono diventati gratis.
 */
test('una riga di troppo sfonda la riserva, cioe\' il gate cade ancora', async ({
  page,
}, testInfo) => {
  const viewport = page.viewportSize()
  test.skip(
    viewport?.width !== 375,
    'la riserva e\' dimensionata sulla larghezza piu\' stretta dei telefoni: e\' li\' che si prova',
  )

  await page.clock.install({ time: new Date('2026-08-19T10:00:00+02:00') })
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)
  await seedOn(page, [
    ['2026-08-17', 499_999],
    ['2026-08-18', 499_999],
  ])
  await page.reload()
  await expect(page.locator('.budget')).toBeEnabled()
  await setBudget(page, '9999999', 'A settimana')
  await expect(page.locator('.since')).toBeVisible()

  const prima = await misuraRiserva(page)
  console.log(
    `\n  [${testInfo.project.name}] controprova: contenuto ${prima.naturale}px su ${prima.riservato}px riservati,` +
      ` avanzo ${Math.round((prima.riservato - prima.naturale) * 100) / 100}px (una riga ne misura ${prima.rigaMinima})`,
  )

  // Lo stato piu' alto arriva **al pixel** della riserva: e' questa uguaglianza
  // che rende il gate un guardiano invece di una formalita'.
  expect(
    prima.riservato - prima.naturale,
    `la riserva avanza di ${Math.round((prima.riservato - prima.naturale) * 100) / 100}px sullo stato piu' alto: una riga intera (${prima.rigaMinima}px) ci sta dentro senza che il gate la veda`,
  ).toBeLessThan(prima.rigaMinima)

  // Una riga vera in piu', non un pixel inventato: la frase di ADR 010 cresce
  // finche' non va a capo un'altra volta.
  const dopo = await page.evaluate(() => {
    const since = document.querySelector('.since')
    const slot = document.querySelector('.slot')
    if (since === null || !(slot instanceof HTMLElement)) throw new Error('scena sbagliata')
    // Il `Range` si rifa' a ogni giro: sostituire il testo distrugge il nodo che
    // il precedente aveva selezionato, e un range morto misura zero righe —
    // cioe' la controprova sembrerebbe riuscita senza aver mosso niente.
    const conta = (): number => {
      const range = document.createRange()
      range.selectNodeContents(since)
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top * 10) / 10)).size
    }
    const partenza = conta()
    const testo = since.textContent ?? ''
    let parole = 1
    while (conta() === partenza && parole < 40) {
      since.textContent = `${testo} ${'parola '.repeat(parole)}`
      parole += 1
    }
    return {
      righe: conta(),
      partenza,
      altezza: Math.round(slot.getBoundingClientRect().height * 100) / 100,
    }
  })

  expect(dopo.righe, 'la frase non e\' andata a capo: la controprova non ha provato niente').toBe(
    dopo.partenza + 1,
  )
  expect(
    dopo.altezza,
    'con una riga in piu\' il riquadro e\' rimasto identico: la riserva assorbe, quindi il gate non guarda piu\' niente',
  ).toBeGreaterThan(prima.riservato)
})


/* ------------------------------------------------------------------------- *
 * La striscia dei sette giorni.
 * ------------------------------------------------------------------------- */

/** L'altezza della striscia **risolta in pixel dalla pagina**, non riletta dal foglio. */
async function stripHPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const week = document.querySelector('.week')
    if (week === null) throw new Error('nessuna striscia da cui leggere --strip-h')
    const sonda = document.createElement('div')
    sonda.style.cssText = 'position:absolute;visibility:hidden;block-size:var(--strip-h)'
    week.appendChild(sonda)
    const altezza = sonda.getBoundingClientRect().height
    sonda.remove()
    return altezza
  })
}

/** Le colonne dipinte davvero: l'altezza in pixel dell'inchiostro, in ordine. */
async function colonne(page: Page): Promise<readonly number[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.week__ink')].map(
      (el) => Math.round(el.getBoundingClientRect().height * 100) / 100,
    ),
  )
}

/**
 * **Il numero che il modello non puo' verificare da solo.**
 *
 * `COLUMN_MIN_FRACTION` e' `COLUMN_MIN_INK_PX / STRIP_MIN_PX`, cioe' `2 / 48`:
 * due pixel di inchiostro minimo, divisi per un'altezza della striscia che
 * `budget-view.ts` **assume** invece di leggere. Se `--strip-h` scendesse sotto
 * quei 48 px, la colonna piu' corta prenderebbe meno di due pixel e un giorno in
 * cui si e' speso si dipingerebbe come un giorno vuoto — cioe' la striscia
 * direbbe il falso proprio sulla domanda per cui esiste. Nessun test del modello
 * potrebbe vederlo: quel modulo non sa cosa valga il token.
 *
 * Le asserzioni sono due, e dicono due cose diverse:
 *
 * 1. **il contratto regge**: `--strip-h × COLUMN_MIN_FRACTION >= 2`. Il `2` e'
 *    scritto qui perche' qui e' il **requisito** — una colonna che porta un
 *    importo positivo deve prendere abbastanza inchiostro da distinguersi dalla
 *    base — mentre nel modello e' una delle sue implementazioni. Importare la
 *    costante e riasserire la costante sarebbe una tautologia;
 * 2. **il CSS usa la frazione del modello**: la colonna piu' corta dipinta vale
 *    almeno `--strip-h × COLUMN_MIN_FRACTION`. Un `cents / scaleCents` scritto
 *    nel foglio invece della `fraction` salterebbe la traslazione, e questa
 *    riga cadrebbe.
 *
 * Gira su tutti e tre i progetti geometrici, orizzontale compreso: e' li' che
 * l'altezza e' il vincolo vero, ed e' li' che qualcuno sarebbe tentato di
 * abbassare `--strip-h` per guadagnare spazio.
 */
test('il pavimento della colonna: --strip-h regge il contratto del modello', async ({
  page,
}, testInfo) => {
  await fissaOrologio(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)

  // Un centesimo contro cinquemila euro: il rapporto piu' schiacciato che si
  // possa seminare, cioe' la colonna piu' corta che la mappa sappia produrre.
  // Senza il pavimento sarebbe alta 0,0000016 px.
  await seedOn(page, [
    ['2026-08-17', 1],
    ['2026-08-18', 500_000],
  ])
  await page.reload()
  await expect(page.locator('.week')).toBeVisible()

  const strip = await stripHPx(page)
  const dipinte = await colonne(page)
  const pavimento = strip * COLUMN_MIN_FRACTION
  const piuCorta = Math.min(...dipinte.filter((h) => h > 0))
  console.log(
    `\n  [${testInfo.project.name}] striscia: --strip-h ${strip}px · pavimento ${
      Math.round(pavimento * 100) / 100
    }px · colonne ${JSON.stringify(dipinte)}`,
  )

  expect(
    pavimento,
    `--strip-h vale ${strip}px: la colonna piu' corta prenderebbe ${
      Math.round(pavimento * 100) / 100
    }px di inchiostro, e sotto i 2 un giorno in cui si e' speso si legge come un giorno vuoto. ` +
      'O si rialza --strip-h in Home.css, o si cambia COLUMN_MIN_FRACTION in budget-view.ts: ' +
      'i due numeri non possono divergere in silenzio.',
  ).toBeGreaterThanOrEqual(2)

  expect(
    piuCorta,
    'la colonna piu\' corta e\' sotto il pavimento: il foglio non sta usando `DayBar.fraction`',
  ).toBeGreaterThanOrEqual(pavimento - 0.01)
})

/**
 * **Con niente da disegnare la striscia non c'e'**, e non e' un dettaglio: sette
 * colonne a zero sono il telaio di un grafico senza dati, che occupa senza
 * informare.
 *
 * E il fatto che possa mancare **senza spostare niente** e' la ragione per cui
 * vive dentro la coda: e' l'altra meta' dell'invariante che `LANDMARKS`
 * dichiara. Il test lo prova nel modo che cade se la coda smettesse di essere
 * l'ultima: misura dove comincia `.days` con e senza striscia.
 */
test('la striscia non c\'e\' finche\' non c\'e\' niente da disegnare, e la coda non si muove', async ({
  page,
}) => {
  await fissaOrologio(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)

  const codaTop = (): Promise<number> =>
    page.evaluate(() => {
      const el = document.querySelector('.days')
      const home = document.querySelector('.home')
      if (el === null || home === null) return -1
      return Math.round(
        (el.getBoundingClientRect().top - home.getBoundingClientRect().top + home.scrollTop) * 100,
      ) / 100
    })

  await expect(page.locator('.week')).toHaveCount(0)
  const senza = await codaTop()

  await seedOn(page, [[todayIso(), 1250]])
  await page.reload()
  await expect(page.locator('.week')).toBeVisible()
  const con = await codaTop()

  expect(senza).toBeGreaterThan(0)
  expect(con, 'la striscia che arriva ha spostato la coda: allora non e\' nella coda').toBe(senza)
})

/**
 * **A giornata vuota l'intestazione "Oggi" non c'e'.**
 *
 * Era seguita dal nulla, con `Oggi non hai segnato niente` otto righe sotto: lo
 * stesso fatto due volte, con un buco in mezzo. Il copy resta — e' l'esempio
 * giusto della regola *dove ci sono dati si mostrano numeri, dove non ce ne sono
 * si parla* — e cade l'intestazione.
 *
 * Le due asserzioni stanno insieme perche' la seconda e' quella che tiene onesta
 * la prima: un `toHaveCount(0)` da solo passerebbe anche se l'intestazione
 * sparisse per sempre.
 */
test('l\'intestazione di oggi esiste solo dove c\'e\' qualcosa da intestare', async ({ page }) => {
  await fissaOrologio(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)

  await expect(page.locator('.today__head')).toHaveCount(0)
  await expect(page.locator('.blank__title')).toBeVisible()

  await seedOn(page, [[todayIso(), 1250]])
  await page.reload()
  await expect(page.locator('.row').first()).toBeVisible()
  await expect(page.locator('.today__head')).toBeVisible()
  await expect(page.locator('.today__total')).toHaveText('12,50 €')
})
