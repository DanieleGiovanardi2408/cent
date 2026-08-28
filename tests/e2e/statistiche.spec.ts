/**
 * Le Statistiche, nei due stati che vengono per primi — **vuoto** e **spese senza
 * budget** — e poi nella geometria, che e' l'unica cosa che solo un browser sa
 * dire.
 *
 * ## Perche' il vuoto e il senza-budget vengono prima
 *
 * Perche' partendo dal pieno il vuoto diventa un rettangolo grigio con una
 * scritta in mezzo, e il caso senza budget diventa un grafico degenere invece
 * che una forma sua. Sono anche i due piu' probabili: il vuoto e' la prima cosa
 * che vede chi installa l'app, e "spese si', budget no" e' chi comincia a segnare
 * e il budget lo imposta dopo — o mai, perche' vuole solo vedere dove vanno i
 * soldi.
 *
 * ## Come si testa un grafico qui
 *
 * **Si asserisce la geometria contro i dati, non la presenza degli elementi.**
 * Un test che conta i `<span>` e' verde anche con tutte le barre lunghe uguali.
 *
 * E si asserisce **il rapporto fra la barra e il proprio grafico, sulla stessa
 * riga**. Qui c'era un confronto fra barre di righe diverse, che dava per
 * scontata la cosa che avrebbe dovuto verificare: che i grafici fossero larghi
 * uguali. Non lo erano — `.stat` era una griglia per riga, quindi la colonna che
 * ospita la barra si dimensionava sull'etichetta *di quella riga*, e bastava
 * cambiare `['Casa', 1000]` in `['Coffeeshop', 1000]` — **stesso importo, nome
 * piu' lungo** — per far scendere il rapporto da 0,2502 a 0,2061 e far cadere il
 * test. Adesso ci sono due asserzioni al posto di una: il rapporto sulla riga, e
 * **l'invariante nuovo** — tutti i grafici di una sezione sono larghi uguali.
 *
 * L'aritmetica delle frazioni e' gia' provata in `stats-view.test.ts`, senza
 * browser. Qui si prova cio' che solo un browser sa dire: che quelle frazioni
 * diventino pixel veri, che il segno del maturato **si veda**, e che il numero
 * della riga corrente sia lo stesso carattere di quello della Home.
 *
 * ## E si campionano i pixel, dove la domanda e' "si vede?"
 *
 * Un'asserzione sulla presenza di un elemento — `elementFromPoint`, una classe,
 * un `toBeVisible()` — risponde a *"c'e'?"*. Il contrasto e' un'altra domanda, e
 * chiederla al DOM da' una risposta che passa a `opacity: 0.02`. Dove il
 * requisito e' un contrasto si campiona lo **screenshot**: vedi `scansiona`.
 *
 * ## E si guarda anche il confine col modello
 *
 * `BAR_MIN_FRACTION` in `stats-view.ts` e' composto da due numeri che stanno in
 * `Stats.css`. Nessuno dei due file vede l'altro, quindi il legame non e'
 * affidato a due commenti: c'e' un test che risolve il token nella pagina, legge
 * il contorno dipinto e li confronta con la costante importata.
 *
 * ## Cosa non sta piu' qui
 *
 * Il controllo sulla larghezza dell'intestazione. Era
 * `header.scrollWidth - header.clientWidth <= 0`, e valeva **0 a ogni
 * larghezza**: il testo trabocca da un figlio dentro il box del padre. Adesso e'
 * in `schermate.spec.ts`, scritto come collisione fra i rettangoli dipinti — e
 * li' sta anche la sonda delle sovrapposizioni, che gira su **tutte** le
 * schermate perche' le enumera invece di elencarle.
 */
import type { Page } from '@playwright/test'
import { fissaOrologio } from './clock'
import { chiudiGuida, expect, test } from './installed'
// Derivata, non ricopiata: un'asserzione che riscrive la copy a mano cade
// quando qualcuno corregge un refuso, e chi la vede cadere crede di aver rotto
// qualcosa. E' la stessa ragione per cui `guide.spec.ts` importa `STEPS`.
import { it as dizionario } from '../../src/ui/i18n/it'
// E l'inglese, per gli stessi motivi: la colonna del nome e' quello che avanza
// dopo l'importo, e `€507.00` non e' largo come `507,00 €`. Le due lingue non
// misurano la stessa geometria.
import { en as inglese } from '../../src/ui/i18n/en'
// Il pavimento della barra vive nel modello, e i due numeri che lo compongono
// stanno in `Stats.css`. Importarlo e' meta' della misura che li tiene
// d'accordo: l'altra meta' e' leggere il CSS dipinto dalla pagina.
import { BAR_MIN_FRACTION } from '../../src/ui/stats-view'

/* ------------------------------------------------------------ i pixel veri */

/** Un colore campionato dallo schermo, in sRGB 0-255. */
type Px = readonly [number, number, number]

const luminanza = ([r, g, b]: Px): number => {
  const lineare = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lineare(r) + 0.7152 * lineare(g) + 0.0722 * lineare(b)
}

/** Il rapporto di contrasto WCAG fra due colori **dipinti**, non fra due token. */
const contrasto = (a: Px, b: Px): number => {
  const [alto, basso] = [luminanza(a), luminanza(b)].sort((x, y) => y - x) as [number, number]
  return (alto + 0.05) / (basso + 0.05)
}

const esadecimale = ([r, g, b]: Px): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`

/**
 * Una scansione orizzontale dei **pixel dipinti**, alla risoluzione del
 * dispositivo.
 *
 * ## Perche' i pixel e non gli stili calcolati
 *
 * Perche' fra un token e cio' che finisce sotto gli occhi ci sono l'ordine del
 * DOM, l'`opacity` degli antenati, i gradienti e chi copre chi.
 * `getComputedStyle` dice cosa un elemento **chiede**; questo dice cosa lo
 * schermo **mostra**, che e' l'unica cosa di cui parla un requisito di
 * contrasto. La sonda che c'era prima — `elementFromPoint` al centro del segno —
 * rispondeva "c'e' il segno" anche a `opacity: 0.02`.
 *
 * Lo screenshot si decodifica **nella pagina**: `createImageBitmap` piu' una
 * `OffscreenCanvas` usano il decoder del browser, invece di far entrare un
 * decodificatore PNG scritto a mano dentro la suite.
 */
async function scansiona(
  page: Page,
  { da, a, y }: { readonly da: number; readonly a: number; readonly y: number },
): Promise<readonly { readonly x: number; readonly px: Px }[]> {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(
    async (input: { png: string; da: number; a: number; y: number }) => {
      const blob = await (await fetch(`data:image/png;base64,${input.png}`)).blob()
      const bitmap = await createImageBitmap(blob)
      const tela = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = tela.getContext('2d')
      if (ctx === null) throw new Error('nessun contesto 2d per campionare i pixel')
      ctx.drawImage(bitmap, 0, 0)
      const dpr = window.devicePixelRatio
      const out: { x: number; px: [number, number, number] }[] = []
      for (let dx = Math.round(input.da * dpr); dx <= Math.round(input.a * dpr); dx += 1) {
        const d = ctx.getImageData(dx, Math.round(input.y * dpr), 1, 1).data
        out.push({ x: dx / dpr, px: [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0] })
      }
      return out
    },
    { png, da, a, y },
  )
}

test.beforeEach(async ({ page }) => {
  await fissaOrologio(page)
})

/** Una spesa da seminare: categoria, centesimi, e da quanti giorni fa. */
interface Riga {
  readonly categoria: string
  readonly cents: number
  /** Giorni indietro rispetto a oggi. Zero = oggi. */
  readonly giorniFa?: number
  readonly fissa?: boolean
}

/** Scrive spese direttamente in IndexedDB e riapre le Statistiche. */
async function semina(
  page: Page,
  righe: readonly Riga[],
  opzioni: { readonly budgetCents?: number; readonly rinomina?: readonly [string, string][] } = {},
): Promise<void> {
  await page.evaluate(
    async (input: {
      righe: readonly Riga[]
      budgetCents?: number
      rinomina?: readonly [string, string][]
    }) => {
      const db: IDBDatabase = await new Promise((resolve, reject) => {
        const request = indexedDB.open('cent')
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const categories: { id: string; name: string; updatedAt: number }[] = await new Promise(
        (resolve, reject) => {
          const request = db.transaction('categories').objectStore('categories').getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        },
      )

      // I nomi ostili: si scrivono **come dati dell'utente**, con la stessa
      // scrittura che fa l'editor delle categorie. Un nome di trenta caratteri
      // non e' un caso di laboratorio: la griglia si rinomina, e chi la rinomina
      // non conta le lettere.
      if (input.rinomina !== undefined) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('categories', 'readwrite')
          const store = tx.objectStore('categories')
          for (const [vecchio, nuovo] of input.rinomina ?? []) {
            const target = categories.find((c) => c.name === vecchio)
            if (target === undefined) throw new Error(`categoria "${vecchio}" assente`)
            store.put({ ...target, name: nuovo, updatedAt: target.updatedAt + 1 })
            target.name = nuovo
          }
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      }

      const iso = (indietro: number): string => {
        const d = new Date()
        d.setDate(d.getDate() - indietro)
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('expenses', 'readwrite')
        const store = tx.objectStore('expenses')
        input.righe.forEach((riga, i) => {
          const at = 1_700_000_000_000 + i
          store.put({
            id: `stat-${i}`,
            createdAt: at,
            updatedAt: at,
            amountCents: riga.cents,
            categoryId: categories.find((c) => c.name === riga.categoria)?.id ?? 'x',
            date: iso(riga.giorniFa ?? 0),
            source: riga.fissa === true ? 'recurring' : 'manual',
            ...(riga.fissa === true ? { recurringId: 'regola-di-prova' } : {}),
          })
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })

      if (input.budgetCents !== undefined) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('budgets', 'readwrite')
          tx.objectStore('budgets').put({
            id: 'budget-di-prova',
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
            period: 'weekly',
            amountCents: input.budgetCents,
            effectiveFrom: '2026-01-01',
          })
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      }
      db.close()
    },
    { righe, ...opzioni },
  )
  await page.reload()
  await apriStatistiche(page)
}

async function apriStatistiche(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Statistiche|Stats/ }).click()
  await expect(page.locator('.stats')).toBeVisible()
}

/**
 * Da una copy con i `{segnaposto}` all'espressione che sa confrontarla con il
 * testo **interpolato** che finisce a schermo.
 *
 * ## Perche' non basta `toHaveText(dizionario[...])`
 *
 * Perche' nel dizionario `stats.outside.text` e' una stringa **grezza**:
 * `Questo periodo è {range}, …`. A schermo `t()` ha gia' sostituito i due buchi
 * con `17–23 ago` e con la parola della barra. Confrontare le due direbbe
 * soltanto che l'interpolazione e' avvenuta — cioe' fallirebbe **sempre**,
 * anche a copy perfetta.
 *
 * ## Perche' non si ricopia la frase interpolata a mano
 *
 * Perche' e' esattamente il difetto che l'interpolazione ha appena chiuso.
 * `{history}` **non e' una parola**: e' il valore di `nav.history`, la stessa
 * chiave che dipinge la scheda. Un atteso che scrivesse "Storico" fra le
 * virgolette sarebbe una terza copia di quella parola — invisibile al
 * compilatore, invisibile a `dead-surface.mjs`, e verde anche dopo una rinomina
 * che lascerebbe la frase a mandare in un posto che non si chiama piu' cosi'.
 * La stessa ragione per cui `guide.spec.ts` importa `STEPS`.
 *
 * ## Cosa tiene fermo, e cosa lascia libero
 *
 * **I pezzi letterali restano letterali** — un refuso corretto nel dizionario
 * aggiorna l'atteso, un refuso *introdotto* a schermo lo fa cadere — e i due
 * buchi restano liberi, perche' cosa ci finisca dentro non e' una domanda sulla
 * copy: la chiedono i punti 2 e 3 del test, ognuno contro la propria fonte (il
 * confine che la scheda stampa, la parola che la barra dipinge).
 *
 * ## Il buco e' `[^{}]+`, e la prima versione diceva `.+`
 *
 * Sembrava lo stesso e non lo era. `.+` accetta anche **la graffa**, quindi
 * questo confronto sarebbe stato verde davanti a *"Questo periodo è {range}"*
 * dipinto a schermo — cioe' proprio davanti a `t()` chiamata senza le sue
 * variabili, che e' l'unico modo realistico in cui questa frase si rompe. Un
 * matcher costruito per non ricopiare la copy che passa quando la copy non e'
 * stata interpolata sarebbe stato un test verde per il motivo sbagliato, della
 * stessa famiglia dei sei che questa fase ha gia' trovato. Verificato con una
 * sonda sui casi, non dedotto: il `.+` passava.
 *
 * E `+` invece di `*` per la ragione gemella: un segnaposto risolto in stringa
 * vuota — `periodRangeLabel` senza periodo, `t('nav.history')` vuota —
 * dipingerebbe *"le trovi tutte nello ."*, e un atteso che lo accettasse non
 * sorveglierebbe niente proprio nel caso in cui serve.
 *
 * La guardia sul numero di buchi non e' cerimonia: se un domani qualcuno
 * togliesse i segnaposto dalla copy, senza di essa questa funzione degraderebbe
 * in silenzio in un confronto esatto — continuerebbe a passare, e la ragione per
 * cui esiste sarebbe sparita senza che niente diventasse rosso.
 */
function conSegnaposti(copy: string): RegExp {
  const letterali = copy.split(/\{\w+\}/)
  expect(
    letterali.length - 1,
    `"${copy}" non porta segnaposti: qui basta la stringa del dizionario`,
  ).toBeGreaterThan(0)
  const letterale = (pezzo: string): string => pezzo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${letterali.map(letterale).join('[^{}]+')}$`)
}

/**
 * Le otto categorie di default **lette dal disco**, in ordine di griglia.
 *
 * Serve ai test che girano in tutte e due le lingue: il seme le scrive nella
 * lingua risolta (`Spesa` o `Groceries`), e `semina` cerca le categorie per
 * nome. Scrivere qui due elenchi di otto stringhe sarebbe una terza copia di
 * quello che sta nei due dizionari e su IndexedDB — e la copia sbaglia il giorno
 * in cui qualcuno corregge una traduzione.
 *
 * L'ordine e' quello della griglia 4x2 (CLAUDE.md, "Ordinamento delle
 * categorie"), che e' fisso: `order` 0 e' la spesa, 6 e' la casa.
 */
async function grigliaDiDefault(page: Page): Promise<Record<
  'spesa' | 'fuori' | 'coffeeshop' | 'sigarette' | 'trasporti' | 'svago' | 'casa' | 'extra',
  string
>> {
  const nomi = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cent')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const records: { name: string; order: number }[] = await new Promise((resolve, reject) => {
      const request = db.transaction('categories').objectStore('categories').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return [...records].sort((a, b) => a.order - b.order).map((r) => r.name)
  })
  expect(nomi, 'le otto categorie di default non ci sono: il seme non e\' arrivato').toHaveLength(8)
  return {
    spesa: nomi[0]!,
    fuori: nomi[1]!,
    coffeeshop: nomi[2]!,
    sigarette: nomi[3]!,
    trasporti: nomi[4]!,
    svago: nomi[5]!,
    casa: nomi[6]!,
    extra: nomi[7]!,
  }
}

interface Misura {
  readonly etichetta: string
  readonly plot: number
  readonly barra: number
  /** La barra sulla **propria** area di disegno: e' cio' che lo strato puro promette. */
  readonly rapporto: number
}

/**
 * Le righe di una sezione, ciascuna con la propria area di disegno.
 *
 * Il rapporto e' `barra / plot della stessa riga`. Confrontare due barre fra
 * loro darebbe la risposta giusta **solo se** i plot fossero larghi uguali — che
 * e' precisamente cio' che il test deve verificare invece di assumere.
 */
async function righeDi(page: Page, sezione: number): Promise<readonly Misura[]> {
  return page.evaluate((indice: number) => {
    const s = document.querySelectorAll('.stats__section')[indice]
    if (s === undefined) throw new Error(`nessuna sezione all'indice ${indice}`)
    return [...s.querySelectorAll('.stat')].flatMap((riga) => {
      const plot = riga.querySelector('.stat__plot')
      const barra = riga.querySelector('.stat__bar')
      if (plot === null || barra === null) return []
      const p = plot.getBoundingClientRect().width
      const b = barra.getBoundingClientRect().width
      return [
        {
          etichetta: riga.querySelector('.stat__label')?.textContent ?? '',
          plot: Math.round(p * 100) / 100,
          barra: Math.round(b * 100) / 100,
          rapporto: p === 0 ? 0 : b / p,
        },
      ]
    })
  }, sezione)
}

/**
 * Il limite dell'editor delle categorie, **letto dal prodotto**.
 *
 * Non e' importato da `CategorySheet.tsx` — quel modulo tira dentro tre fogli di
 * stile, e il transpiler dei test non li sa leggere; e non e' ricopiato, che e' la
 * cosa che rende falsa una premessa il giorno che il numero cambia. Si apre
 * l'editor e si chiede al campo quanto accetta: e' l'attributo che davvero ferma
 * le dita, non la costante che lo alimenta.
 *
 * **Lascia il foglio aperto**, di proposito: chi la chiama ricarica subito dopo
 * (`semina`), e una chiusura simulata a tastiera sarebbe un secondo gesto da
 * mantenere per niente.
 */
async function limiteDellEditor(page: Page): Promise<number> {
  await page.locator('.app__bar').getByRole('button', { name: /Impostazioni|Settings/ }).tap()
  await page.getByRole('button', { name: dizionario['settings.cats.add'], exact: true }).tap()
  const campo = page.locator('.editor__name')
  await expect(campo, 'l\'editor delle categorie non ha un campo per il nome').toBeVisible()
  return campo.evaluate((el: HTMLInputElement) => el.maxLength)
}

/**
 * `--plot-min` **risolto in pixel dalla pagina**, non riletto dal foglio.
 *
 * Il token e' scritto in `rem` e vale quello che vale su questo dispositivo con
 * questa dimensione del testo. Si misura come si misura un colore in
 * `statistiche.spec.ts` e in `colori.spec.ts`: si da' il token a un elemento e si
 * chiede al browser quanto e' venuto.
 */
async function plotMinPx(page: Page): Promise<number> {
  return page.evaluate(() => {
    const righe = document.querySelector('.stats__rows')
    if (righe === null) throw new Error('nessuna griglia di righe da cui leggere --plot-min')
    const sonda = document.createElement('div')
    sonda.style.cssText = 'position:absolute;visibility:hidden;inline-size:var(--plot-min)'
    righe.appendChild(sonda)
    const larghezza = sonda.getBoundingClientRect().width
    sonda.remove()
    return larghezza
  })
}

test('a schermo vuoto le Statistiche dicono cosa comparira, non "nessun dato"', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await apriStatistiche(page)

  // Il copy vero: chi apre l'app il primo giorno non sa ancora cosa aspettarsi,
  // e "nessun dato" non glielo insegna.
  await expect(page.locator('.blank__title')).toBeVisible()
  await expect(page.locator('.blank__text')).toHaveText(dizionario['stats.blank.text'])
  await expect(page.locator('.blank__title')).toHaveText(dizionario['stats.blank.title'])

  // E soprattutto: **nessuna barra**, nemmeno lunga zero. Otto righe da zero
  // sarebbero un grafico degenere spacciato per schermata vuota.
  await expect(page.locator('.stat__bar')).toHaveCount(0)
  await expect(page.locator('.tile')).toHaveCount(0)
})

/**
 * **Ci sono spese e nessuna cade qui: il terzo stato, che nessuno aveva mai
 * guardato a schermo.**
 *
 * ## Chi ci arriva, e perche' non e' un caso di laboratorio
 *
 * Chi ha appena acceso la regola dell'affitto **a ritroso** e non ha ancora
 * segnato niente a mano. La regola materializza le occorrenze passate; nessuna
 * cade nella settimana corrente, e B le ricorrenti non le conta (ADR 016). A
 * resta senza sezioni, B senza righe, `expenses.length > 0` — quindi non e'
 * nemmeno `blank`. E' lo stato di chi ha appena finito la configurazione e apre
 * le Statistiche per vedere se ha funzionato.
 *
 * Prima che `stats-view.ts` lo dichiarasse, quella schermata era per intero una
 * scheda `Quotidiane · 0,00 €` alta 109 px e quattrocento pixel di niente:
 * nessuna parola, nessun rimedio, e uno zero grande che era l'unica affermazione
 * a schermo — falsa da leggere come "non hai speso niente", con 900,00 € di
 * canone appena creati nello Storico.
 *
 * ## Le cinque cose che questo test tiene ferme
 *
 * 1. **Le parole sono le sue**, non quelle dello stato vuoto: `stats.blank.text`
 *    comincia con *"appena avrai qualche spesa"*, e qui le spese ci sono. Chi
 *    riusasse quella chiave farebbe cadere l'asserzione sul testo — e per la
 *    ragione giusta, perche' e' il fatto ad essere diverso.
 * 2. **Nessun importo, e il confine del periodo.** Le due cose non sono la
 *    stessa: la proiezione mensile delle regole non entra qui (sarebbe un tasso
 *    al mese come risposta a una domanda sul periodo), mentre l'intervallo del
 *    periodo e' cio' di cui la frase parla, e per un giorno era l'unica
 *    schermata a nominarlo senza mostrarlo. Quindi si vieta la **cifra di
 *    denaro** su tutta la schermata, non la cifra: il vecchio `not.toMatch(/\d/)`
 *    vietava anche `17–23 ago`.
 * 3. **I due fatti affermati sono verificabili, e nessuno dei due si ferma alla
 *    parola.** Le spese sono nello Storico: il test ci va e trova i 900,00 € —
 *    se un giorno lo Storico filtrasse le ricorrenti, questa frase diventerebbe
 *    una bugia e nient'altro se ne accorgerebbe. E il posto si chiama a schermo
 *    come lo chiama la frase: la parola nel testo e' **quella dipinta sulla
 *    scheda**, non una copia che sopravvive a una rinomina.
 * 4. **La schermata e' piena**, cioe' il rimedio ai quattrocento pixel di
 *    niente: il blocco copre la maggior parte dell'altezza utile, e sta dentro
 *    lo schermo.
 * 5. **La promessa vale al tap successivo.** La frase diceva *"e il confronto
 *    comincia"*, e il confronto non comincia: facendo esattamente quello che
 *    dice — FAB, `4 0 0 0`, categoria — si torna qui e si trovano zero
 *    `.stat__bar`, perche' una riga sola sta sotto `BREAKDOWN_MIN_ROWS` e un
 *    periodo solo sotto `TREND_MIN_ROWS`. Quindi il test **fa il gesto** e
 *    controlla cio' che la frase promette adesso: la spesa appena segnata
 *    compare qui, col suo importo. Il metro e' lo stesso con cui era stata
 *    scartata `stats.blank.text` — un fatto smentito dallo schermo a un tap di
 *    distanza — applicato stavolta alla frase che restava.
 *
 * ## Il punto 5 misurava, e non concludeva
 *
 * Le zero barre erano misurate e la frase era confrontata con la copy, ma le due
 * asserzioni stavano una accanto all'altra **senza parlarsi**: quella sul testo
 * deriva l'atteso dal dizionario — e' cio' che la rende giusta per il suo scopo,
 * ed e' anche cio' che la rende cieca a questo — e quella sulle barre non nomina
 * nessuna parola. Rimettendo nei due dizionari la promessa che era stata tolta
 * (*"Segnane una quando paghi, e il confronto comincia"*), la suite restava
 * **verde per intero**: la riparazione esisteva nell'albero e niente la
 * difendeva.
 *
 * Adesso le due misure sono legate in fondo al test, e la forma e' minima:
 * **finche' il confronto a schermo e' zero, la copy non nomina il confronto** —
 * con la radice della parola presa dal titolo, non scritta qui.
 */
test('fuori dal periodo: la schermata dice cosa manca, dove sono le spese e cosa fare', async ({
  page,
}) => {
  await page.goto('/')
  await chiudiGuida(page)
  // Una regola sola, accesa a ritroso: il canone della settimana scorsa. Niente
  // a mano, niente in questa settimana.
  await semina(page, [{ categoria: 'Casa', cents: 90000, fissa: true, giorniFa: 8 }])

  // 1. Le parole. Sono le sue, e sono tutte e due: un titolo senza il testo
  // direbbe cosa manca e non cosa fare.
  await expect(page.locator('.blank__title')).toHaveText(dizionario['stats.outside.title'])
  // La frase porta due segnaposto, quindi l'asserzione si **deriva** dalla copy
  // invece di ricopiarla: i pezzi letterali restano letterali, i due buchi sono
  // liberi, e cosa ci finisce dentro lo controllano i punti 2 e 3. Un
  // `toHaveText(dizionario[...])` qui confronterebbe con la stringa **grezza**,
  // cioe' fallirebbe con `{range}` a sinistra e `17–23 ago` a destra.
  await expect(page.locator('.blank__text')).toHaveText(
    conSegnaposti(dizionario['stats.outside.text']),
  )
  // E **non** sono quelle dello stato vuoto: le due coppie devono restare due.
  await expect(page.locator('.stats')).not.toContainText(dizionario['stats.blank.text'])

  // Niente grafici e niente righe: e' lo stato senza righe, non un grafico
  // degenere.
  await expect(page.locator('.stats__section')).toHaveCount(0)
  await expect(page.locator('.stat')).toHaveCount(0)

  // 2. Nessun **importo** in tutta la schermata. Non "nessuna scheda": una cifra
  // di denaro rientrerebbe da qualunque elemento nuovo, e la decisione e' sui
  // soldi. Qui c'era `not.toMatch(/\d/)`, che vietava anche il confine del
  // periodo — cioe' l'unica cosa che questa schermata deve dire e non diceva.
  const testo = (await page.locator('.stats').innerText()).trim()
  expect(testo, `la schermata "fuori dal periodo" porta un importo: "${testo}"`).not.toMatch(
    /€|\d+[.,]\d{2}/,
  )
  const frase = (await page.locator('.blank__text').innerText()).trim()

  // 4. La schermata e' piena, e sta dentro. Il blocco eredita `--blank-min`
  // (60dvh) come lo stato vuoto: e' la stessa forma, ed e' voluto.
  const geo = await page.evaluate(() => {
    const stats = document.querySelector('.stats')!.getBoundingClientRect()
    const blank = document.querySelector('.blank')!.getBoundingClientRect()
    const testoRect = document.querySelector('.blank__text')!.getBoundingClientRect()
    const r = (n: number): number => Math.round(n * 100) / 100
    return {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      stats: r(stats.height),
      blank: r(blank.height),
      quota: r(blank.height / stats.height),
      testoBasso: r(testoRect.bottom),
      finestra: window.innerHeight,
      overflowX: r(
        document.querySelector('.stats')!.scrollWidth - document.querySelector('.stats')!.clientWidth,
      ),
      // Quanto resta sotto il bordo dello scorrevole. Su un viewport basso il
      // blocco e' piu' alto dell'area utile e `.stats` scorre: si registra il
      // numero invece di scoprirlo il giorno che diventa grande.
      overflowY: r(
        document.querySelector('.stats')!.scrollHeight - document.querySelector('.stats')!.clientHeight,
      ),
    }
  })
  console.log(`\n| ${geo.viewport} | .stats ${geo.stats}px | .blank ${geo.blank}px | ` +
    `quota ${(geo.quota * 100).toFixed(1)}% | testo finisce a ${geo.testoBasso} su ${geo.finestra} | ` +
    `scrollY ${geo.overflowY} |\n`)
  expect(
    geo.quota,
    `il blocco copre solo il ${(geo.quota * 100).toFixed(1)}% dell'altezza utile: ` +
      'sono i quattrocento pixel di niente, con altre parole',
  ).toBeGreaterThan(0.5)
  expect(geo.testoBasso, 'il testo finisce sotto il bordo dello schermo').toBeLessThanOrEqual(
    geo.finestra,
  )
  expect(geo.overflowX, 'la schermata scorre di lato').toBeLessThanOrEqual(0)

  // 3a. La parola con cui la frase manda in un posto e' **quella dipinta sulla
  // scheda**. La scheda si prende per posizione — l'ordine della barra e' fisso
  // in `App.tsx`: Home, Storico, Statistiche — e non per testo, perche' cercarla
  // col testo vorrebbe dire usare come premessa proprio cio' che si verifica.
  const schedaStorico = page.locator('.nav__tab .fit__real').nth(1)
  await expect(
    schedaStorico,
    'la seconda scheda della barra non e\' lo Storico: l\'ordine e\' cambiato',
  ).toHaveText(dizionario['nav.history'])
  expect(
    frase,
    'la frase manda in un posto che sulla barra non si chiama cosi\'',
  ).toContain((await schedaStorico.innerText()).trim())

  // 3b. E la parola nella frase e' **interpolata**, non ricopiata. Questa e'
  // l'unica delle due che una rinomina fa cadere: `nav.history` e la copia
  // avrebbero lo stesso valore in tutte e due le lingue finche' nessuno
  // rinomina, quindi nessuna asserzione a runtime sa distinguerle. Il commento
  // che dichiarava l'invariante c'era gia' e affermava il falso — la parola era
  // scritta a mano — e un invariante dichiarato senza guardia e' esattamente
  // quello che nessuno rilegge.
  for (const [lingua, copy] of [
    ['it', dizionario['stats.outside.text']],
    ['en', inglese['stats.outside.text']],
  ] as const) {
    expect(copy, `la frase in ${lingua} ricopia il nome dello Storico a mano`).toContain(
      '{history}',
    )
    expect(copy, `la frase in ${lingua} non nomina il periodo`).toContain('{range}')
  }

  // 3c. E il fatto che la frase afferma: le spese sono nello Storico. Si va a
  // vederle, perche' un rimando che manda in un posto vuoto e' peggio del
  // silenzio.
  await page.getByRole('button', { name: /Storico|History/ }).click()
  await expect(page.locator('.list')).toBeVisible()
  await expect(page.locator('.list')).toContainText('900,00')

  // 5. **Il gesto che la frase chiede, e quello che si vede dopo.** Due tap
  // oltre alle cifre, come in cassa.
  await apriStatistiche(page)
  await page.locator('.fab').tap()
  await expect(page.locator('.sheet--add')).toBeVisible()
  for (const cifra of ['4', '0', '0', '0']) {
    await page.locator('.pad__key', { hasText: new RegExp(`^${cifra}$`) }).first().tap()
  }
  const scelta = (await page.locator('.sheet--add .cat__name').first().innerText()).trim()
  await page.locator('.sheet--add .cat').first().tap()

  // Non e' piu' lo stato senza righe, e la spesa appena segnata **e' qui**, con
  // il suo importo: e' cio' che la frase promette.
  await expect(page.locator('.blank')).toHaveCount(0)
  const riga = page.locator('.stat', { hasText: scelta })
  await expect(riga, `"${scelta}" non compare fra le righe dopo il salvataggio`).toHaveCount(1)
  await expect(riga.locator('.stat__value')).toHaveText('40,00 €')

  // E cio' che la frase **non** prometteva piu': nessuna barra e nessun
  // confronto fra periodi.
  await expect(
    page.locator('.stat__bar'),
    'con una riga sola compaiono delle barre: le soglie sono cambiate, e la copy va riletta',
  ).toHaveCount(0)
  await expect(page.locator('.stats')).not.toContainText(dizionario['stats.byPeriod.weekly'])

  // **E qui le due misure si parlano**, che e' la parte che mancava.
  //
  // Le due asserzioni qui sopra dicono *cosa si vede*; l'asserzione sul testo,
  // duecento righe sopra, dice *che l'interpolazione e' avvenuta* — e il suo
  // atteso e' **derivato dalla copy**, quindi si aggiorna insieme alla copy.
  // Nessuna delle due lega la frase a cio' che compare, e finche' non erano
  // legate rimettere nei due dizionari la promessa vecchia — *"Segnane una
  // quando paghi, e il confronto comincia"* — lasciava la suite **interamente
  // verde**. Provato, non dedotto.
  //
  // Il fatto da sorvegliare e' uno: **la frase non nomina cose che al tap
  // successivo non compaiono.** Quindi finche' il confronto a schermo e' zero,
  // la copy non puo' nominarlo; e se un giorno le soglie cambiassero e il
  // confronto comparisse davvero, la guardia si apre da se'. E' il commento che
  // stava qui — *"allora la frase potra' tornare a parlare di confronto"* — che
  // smette di essere **un permesso scritto** e diventa una condizione eseguita.
  const confrontoAschermo =
    (await page.locator('.stat__bar').count()) +
    (await page.locator('.stats', { hasText: dizionario['stats.byPeriod.weekly'] }).count())

  // La parola del confronto in ciascuna lingua e' **quella del titolo**, non una
  // che decide questo test: `stats.outside.title` e' la frase che dice che il
  // confronto non c'e' ancora, quindi la sua radice e' esattamente cio' che il
  // testo sotto non deve promettere. E si controlla che la radice sia ancora
  // quella del titolo, o una riscrittura del titolo lascerebbe qui una guardia
  // che non sorveglia piu' niente — la stessa ragione per cui `conSegnaposti`
  // conta i buchi prima di usarli.
  //
  // Due radici e non una, e non e' pignoleria: in italiano *"compare"* e' un
  // verbo della frase buona (*"la prossima spesa che segni oggi compare qui"*),
  // quindi la radice inglese, applicata all'italiano, sarebbe rossa sulla copy
  // giusta.
  const radiceDelConfronto = { it: /confront/i, en: /compar/i } as const
  const promettonoIlConfronto = ([
    ['it', dizionario],
    ['en', inglese],
  ] as const)
    .filter(([lingua, vocabolario]) => {
      const radice = radiceDelConfronto[lingua]
      expect(
        vocabolario['stats.outside.title'],
        `in ${lingua} il titolo non usa piu' ${radice}: la guardia qui sotto cerca una ` +
          'parola che la schermata non dice piu\', cioe\' non sorveglia niente',
      ).toMatch(radice)
      return radice.test(vocabolario['stats.outside.text'])
    })
    .map(([lingua]) => lingua)
  expect(
    confrontoAschermo > 0 ? [] : promettonoIlConfronto,
    `dopo il gesto che la frase chiede si vedono ${confrontoAschermo} confronti, e la ` +
      `frase ne promette uno in: ${promettonoIlConfronto.join(', ')}`,
  ).toEqual([])

  // Il confine che la frase nominava e' **lo stesso** che la scheda stampa
  // adesso che le righe ci sono. E' l'invariante vero dietro `{range}`: non una
  // stringa scritta nel test, ma l'etichetta che ogni altro stato di questa
  // schermata gia' usa.
  const confine = (await page.locator('.tile__sub').first().innerText()).trim()
  expect(
    frase,
    `la frase non nomina il periodo che la scheda chiama "${confine}": "${frase}"`,
  ).toContain(confine)
})

test('con spese e senza budget: le righe ci sono, le tracce no', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    { categoria: 'Fuori', cents: 4000 },
    { categoria: 'Spesa', cents: 2000 },
    { categoria: 'Casa', cents: 1000 },
  ])

  // A esiste ed e' un grafico: tre categorie sono la soglia.
  await expect(page.locator('.stats__section').first().locator('.stat')).toHaveCount(3)
  await expect(page.locator('.stat__bar').first()).toBeVisible()

  // **Nessuna traccia in nessuna riga.** Una traccia senza budget sarebbe un
  // tetto da zero euro, cioe' un numero inventato. Se la traccia si disegnasse
  // sempre che c'e' un periodo, questa asserzione cade.
  await expect(page.locator('.stat__track')).toHaveCount(0)
  await expect(page.locator('.stat__accrued')).toHaveCount(0)

  // E la cifra in testa risponde comunque: C non ha bisogno del budget.
  await expect(page.locator('.tile__value').first()).toHaveText(/70,00|70\.00/)

  // Senza nemmeno una spesa fissa A ha **una parte sola**, e quella parte porta
  // il proprio totale nell'intestazione. Due parti qui vorrebbero dire una
  // sezione delle fisse vuota, cioe' un titolo sopra il niente.
  const parti = page.locator('.stats__section').first().locator('.stats__partTitle')
  await expect(parti).toHaveCount(1)
  await expect(parti.first()).toHaveText(
    new RegExp(`${dizionario['stats.variable']}.*70,00`),
  )

  // E **nessuna nota** sotto i due titoli. Quella di B affermava il confronto col
  // budget anche dove la geometria lo rifiuta; qui il budget non c'e' proprio, e
  // la schermata non nomina nessun tetto.
  await expect(page.locator('.stats__note')).toHaveCount(0)
  await expect(page.locator('.stats')).not.toContainText('su 0,00')
})

test('la barra e in rapporto con il proprio grafico, e i grafici sono larghi uguali', async ({
  page,
}) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    { categoria: 'Fuori', cents: 4000 },
    { categoria: 'Spesa', cents: 2000 },
    { categoria: 'Casa', cents: 1000 },
  ])

  const righe = await righeDi(page, 0)
  expect(righe.length, 'nessuna riga con barra: il test non proverebbe niente').toBe(3)

  // **L'invariante nuovo, e quello che il vecchio test dava per scontato.** Le
  // colonne sono della sezione, non della riga: ogni area di disegno e' larga
  // uguale, quindi le frazioni cadono tutte sulla stessa scala in pixel.
  const plot = [...new Set(righe.map((r) => r.plot))]
  expect(plot, `aree di disegno di larghezza diversa: ${JSON.stringify(righe)}`).toHaveLength(1)

  // Il rapporto **sulla propria riga**: e' quello che `stats-view` promette.
  // 40,00 e' la piu' grande e riempie; 20,00 e 10,00 passano per la stessa mappa
  // di tutte le altre — `BAR_MIN + (1 - BAR_MIN) * f` — perche' il pavimento
  // trasla ogni lunghezza. Riscrivere qui 0,5 e 0,25 vorrebbe dire asserire una
  // proporzione che il modello non promette piu'.
  expect(righe[0]!.rapporto).toBeCloseTo(1, 2)
  expect(righe[1]!.rapporto).toBeCloseTo(BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * 0.5, 2)
  expect(righe[2]!.rapporto).toBeCloseTo(BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * 0.25, 2)

  // E l'ordine e' decrescente: la domanda e' "dove sono finiti i soldi", e la
  // risposta si legge dall'alto.
  expect(righe[0]!.barra).toBeGreaterThan(righe[1]!.barra)
  expect(righe[1]!.barra).toBeGreaterThan(righe[2]!.barra)
})

/**
 * **Etichette ostili — e il limite che si sta esercitando e' dichiarato.**
 *
 * Qui c'era un nome da 34 caratteri, giustificato come *"un nome che l'utente
 * puo' davvero scrivere nell'editor"*. **Non puo'**: il campo del nome porta un
 * `maxLength`, e il nome ne stava ben oltre. Il caso non era irraggiungibile — ma
 * per la ragione sbagliata, e una premessa falsa in un test e' la cosa che domani
 * ne giustifica la riscrittura.
 *
 * I limiti sono **due**, e questo test li esercita tutti e due dicendo quale:
 *
 * - **l'editor tronca a `MAX_NAME`**, ed e' il nome piu' lungo che si ottiene
 *   digitando;
 * - **l'import non tronca affatto**: `parseCategory` in `src/core/backup.ts`
 *   prende `str(raw.name)` e lo scrive com'e'. Un backup — anche scritto a mano,
 *   che e' un file che l'app accetta — porta dentro nomi di qualunque lunghezza,
 *   e le Statistiche devono reggerli. E' anche il caso che **non** richiede
 *   nessun gesto dell'utente: `Categoria rimossa`, che l'app scrive da se' per le
 *   orfane, e' gia' piu' larga di ogni nome di default.
 *
 * ## Le tre asserzioni, e cosa fa cadere ciascuna
 *
 * 1. il nome lungo **non accorcia le barre** delle altre righe (griglia unica);
 * 2. il grafico **non scende sotto `--plot-min`** (il pavimento);
 * 3. un nome **ancora piu' lungo non toglie un altro pixel** (il massimo della
 *    colonna del nome). Senza il massimo, la terza cade: era la forma esatta del
 *    difetto misurato, un nome solo che a 390 punti portava il grafico da 192,73
 *    a 64,00 px su **ogni** riga.
 */
test('un nome che nessun editor accetta non accorcia le barre, e il grafico ha un pavimento', async ({
  page,
}) => {
  await page.goto('/')
  await chiudiGuida(page)
  // Trentaquattro caratteri: quasi il doppio di quello che l'editor accetta. Ci
  // arriva solo un import, e la premessa non e' scritta a memoria — si va a
  // chiedere all'editor quanto accetta davvero.
  const daImport = 'Abbonamenti e cose che si rinnovano'
  // Lo stesso nome **senza spazi**: e' l'altra meta' del caso, non un doppione.
  // Un nome con gli spazi ha dove andare a capo; una parola sola no, e senza
  // `overflow-wrap: anywhere` `-webkit-box` la taglia a meta' glifo **senza
  // puntini** — cioe' peggio di come troncava prima. Misurato a 390 punti: 234
  // px di contenuto dentro una colonna da 136.
  const unaParolaSola = 'Abbonamentiecosecherinnovano'
  const editor = await limiteDellEditor(page)
  expect(
    daImport.length,
    `il nome ostile (${daImport.length}) sta dentro il limite dell'editor (${editor}): ` +
      'questo caso lo produrrebbe anche chi digita, e non esercita l\'import',
  ).toBeGreaterThan(editor)
  await semina(
    page,
    [
      { categoria: daImport, cents: 50700 },
      { categoria: 'Spesa', cents: 25350 },
      { categoria: unaParolaSola, cents: 5070 },
      { categoria: 'Extra', cents: 300 },
    ],
    {
      rinomina: [
        ['Casa', daImport],
        ['Fuori', unaParolaSola],
      ],
    },
  )

  const righe = await righeDi(page, 0)
  expect(righe.length).toBe(4)
  expect(righe[0]!.etichetta).toBe(daImport)

  const plot = [...new Set(righe.map((r) => r.plot))]
  expect(
    plot,
    `il nome lungo ha cambiato la larghezza del grafico: ${JSON.stringify(righe)}`,
  ).toHaveLength(1)

  // Il pavimento, letto dal CSS invece che riscritto: `--plot-min` e' un token, e
  // un test che ne ricopia il valore smette di sorvegliarlo il giorno in cui il
  // token cambia — resta verde contro un numero che non esiste piu'.
  const pavimento = await plotMinPx(page)
  expect(pavimento, 'il pavimento del grafico non e\' un numero').toBeGreaterThan(0)
  expect(plot[0]!, 'la colonna del grafico e\' scesa sotto --plot-min').toBeGreaterThanOrEqual(
    pavimento,
  )

  // Meta' e un decimo restano meta' e un decimo, con l'etichetta lunga in testa.
  // Sono `BAR_MIN + (1 - BAR_MIN) * f`: il pavimento trasla ogni lunghezza, e a
  // ricopiarlo qui a mano si riscriverebbe il modello dentro il test.
  const atteso = (f: number): number => BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * f
  expect(righe[0]!.rapporto).toBeCloseTo(atteso(1), 2)
  expect(righe[1]!.rapporto).toBeCloseTo(atteso(0.5), 2)
  expect(righe[2]!.rapporto).toBeCloseTo(atteso(0.1), 2)

  // Due ordini di grandezza sotto: 3,00 su 507,00 e' lo 0,6% della scala. La
  // barra si vede lo stesso — e' il pavimento del **modello** a garantirlo, non
  // il contorno — e resta **piu' corta** di quella sopra, che e' la cosa che il
  // vecchio minimo dipinto dal CSS non poteva garantire.
  expect(righe[3]!.barra).toBeGreaterThan(0)
  expect(righe[3]!.barra).toBeLessThan(righe[2]!.barra)
  await expect(page.locator('.stat').nth(3).locator('.stat__value')).toHaveText(/3,00/)

  // **E la lunghezza dipinta e' la frazione del modello anche qui**, che e' la
  // meta' della frase che le due asserzioni qui sopra non dicevano: `> 0` e
  // `< quella sopra` restano vere identiche se il CSS rimette un minimo
  // dipinto, perche' un pavimento che morde una riga sola non tocca ne' il
  // segno ne' l'ordine.
  //
  // E' **l'unico posto della suite in cui un pavimento del CSS ha da mordere**,
  // e il conto dice perche'. Ogni altra frazione confrontata con il modello — le
  // tre qui sopra, le tre del rapporto sulla propria riga (1 / 0,5 / 0,25) e le
  // due di `A si divide in fisse e variabili` — sta sopra `atteso(0,1) = 0,116`:
  // su una colonna che non scende mai sotto `--plot-min` (112 px) sono **almeno
  // 13,0 px**, quindi un minimo dipinto dovrebbe essere piu' largo di cosi' per
  // sfiorarle. Questa vale lo 0,59% della scala, cioe' `atteso = 0,0237`: **2,94
  // px** a 375 punti, 3,30 a 390, 6,18 a 800. Sotto qualunque `min-inline-size`
  // che qualcuno possa rimettere.
  //
  // Provato con la mutazione, non dedotto: rimettendo
  // `.stat__bar:not([data-zero]) { min-inline-size: 10px }` in `Stats.css` la
  // suite di questo file cade **solo qui**, in tutti e tre i progetti — 0,0805 /
  // 0,0718 / 0,0383 al posto di 0,0237, sulle colonne da 124,23 / 139,23 /
  // 261,23 px — e le altre 63 restano verdi. E' il difetto per cui
  // `BAR_MIN_FRACTION` e' stato spostato nel modello: rimesso tale e quale,
  // prima di questa riga nessuna verifica lo vedeva.
  const minimo = atteso(300 / 50700)
  expect(
    righe[3]!.rapporto,
    `la barra piu' corta e' ${righe[3]!.barra}px su ${righe[3]!.plot} (${righe[3]!.rapporto}), ` +
      `e il modello ne chiede ${minimo}: il CSS sta correggendo una lunghezza`,
  ).toBeCloseTo(minimo, 2)

  // **Il massimo della colonna del nome**, e questa e' la forma che discrimina.
  //
  // La prima versione confrontava il nome da 34 caratteri con uno ancora piu'
  // lungo e chiedeva che il grafico non si accorciasse ancora. **Passava anche
  // togliendo il massimo** — provato: senza il massimo il grafico e' gia' al
  // pavimento con il primo dei due nomi, quindi il secondo non puo' toglierne
  // altro, e le due misure coincidono in tutti e due i mondi. Un'asserzione che
  // non cade quando la difesa non c'e' non e' un'asserzione.
  //
  // Quella che cade guarda la **colonna del nome**: con `fit-content()` non passa
  // mai `--name-max`; senza, cresce fino a quando e' il pavimento del grafico a
  // fermarla — a 375 punti sono 148,23 px contro un massimo di 136.
  const massimo = await page.evaluate(() => {
    const sezione = document.querySelector('.stats__section')
    if (sezione === null) throw new Error('nessuna sezione da cui leggere --name-max')
    const sonda = document.createElement('div')
    sonda.style.cssText = 'position:absolute;visibility:hidden;inline-size:var(--name-max)'
    sezione.appendChild(sonda)
    const larghezza = sonda.getBoundingClientRect().width
    sonda.remove()
    return larghezza
  })
  const etichetta = await page.evaluate(
    () => document.querySelector('.stat__label')?.getBoundingClientRect().width ?? 0,
  )
  expect(massimo, 'il massimo della colonna del nome non e\' un numero').toBeGreaterThan(0)
  expect(
    etichetta,
    `la colonna del nome (${etichetta}px) ha passato --name-max (${massimo}px)`,
  ).toBeLessThanOrEqual(massimo + 0.5)

  // E oltre il massimo l'etichetta **si ferma a due righe**, invece di
  // traboccare sul grafico.
  //
  // La domanda non e' piu' "e' piu' larga del suo box": da quando il nome va a
  // capo, la larghezza torna dentro per costruzione e un controllo su
  // `scrollWidth` sarebbe verde in ogni mondo. Quella che discrimina e'
  // sull'altezza — il contenuto e' piu' alto di cio' che si vede, cioe' il clamp
  // ha tagliato — ed e' la stessa che il test a 320 punti usa al contrario, per
  // chiedere che le stringhe **nostre** non ci finiscano mai dentro.
  const misura = await page.evaluate((parola: string) => {
    const el = document.querySelector('.stat__label')
    if (el === null) throw new Error('nessuna etichetta da misurare')
    const sola = [...document.querySelectorAll('.stat__label')].find(
      (l) => l.textContent === parola,
    )
    if (sola === undefined) throw new Error(`nessuna etichetta "${parola}" in scena`)
    return {
      clampata: el.scrollHeight > el.clientHeight + 0.5,
      // La parola sola: quanto contenuto c'e' in orizzontale, e quanto se ne
      // vede. Se si spezza, i due numeri coincidono.
      parolaContenuto: sola.scrollWidth,
      parolaVisibile: sola.clientWidth,
      altezze: [
        ...new Set(
          [...document.querySelectorAll('.stat')].map(
            (r) => Math.round(r.getBoundingClientRect().height * 100) / 100,
          ),
        ),
      ],
    }
  }, unaParolaSola)
  expect(misura.clampata, 'il nome oltre il massimo non si ferma a due righe').toBe(true)
  // La parola sola si spezza invece di essere tagliata a meta' glifo: il
  // contenuto orizzontale sta dentro cio' che si vede.
  expect(
    misura.parolaContenuto,
    `"${unaParolaSola}" e' tagliata di lato invece di andare a capo: ` +
      `${misura.parolaContenuto}px di contenuto in ${misura.parolaVisibile}px visibili`,
  ).toBeLessThanOrEqual(misura.parolaVisibile)
  // E il ritmo dell'elenco non cambia: due righe di etichetta stanno dentro i 44
  // px che la riga dichiara, quindi la riga col nome lungo e' alta come le altre.
  expect(
    misura.altezze,
    `la riga col nome lungo non e' alta come le altre: ${JSON.stringify(misura.altezze)}`,
  ).toHaveLength(1)
})

/**
 * **Le spese la cui categoria non c'e' piu': una riga sola, come le altre.**
 *
 * `parseBackup` importa di proposito le spese orfane, quindi lo stato esiste. A
 * dichiara un totale in testa alla sezione: saltarle renderebbe quel totale un
 * numero che le righe non spiegano — "nessun messaggio afferma un fatto che
 * l'utente non puo' verificare", in forma geometrica.
 *
 * L'etichetta e' **`row.categoryRemoved`**, la stessa che lo Storico usa per lo
 * stesso fatto: chi legge questa riga deve riconoscere li' le spese che somma.
 *
 * E si guarda anche l'altra cosa: una riga senza nome e senza colore non deve
 * spostare le colonne. E' lo stesso difetto bloccante, entrato da una porta
 * nuova.
 */
test('le spese senza categoria sono una riga sola, e non spostano le colonne', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    { categoria: 'Spesa', cents: 20000 },
    { categoria: 'Fuori', cents: 10000 },
    // Due spese su due categorie diverse, tutte e due sparite: una riga sola.
    { categoria: '(categoria cancellata da un import)', cents: 3000 },
    { categoria: '(un altra categoria cancellata)', cents: 2000 },
  ])

  const sezione = page.locator('.stats__section').first()
  // Tre righe, non quattro: le orfane si aggregano invece di diventare N
  // parafrasi dello stesso fatto.
  await expect(sezione.locator('.stat')).toHaveCount(3)
  await expect(sezione.locator('.stat').nth(2).locator('.stat__label')).toHaveText(
    dizionario['row.categoryRemoved'],
  )
  // 30,00 + 20,00 sommate in una riga sola.
  await expect(sezione.locator('.stat').nth(2).locator('.stat__value')).toHaveText(/50,00/)

  // Il totale della parte **torna** con le righe: 200 + 100 + 50. Se le orfane
  // venissero saltate, quel totale sarebbe un numero che le righe non spiegano.
  await expect(sezione.locator('.stats__partTotal')).toHaveText(/350,00/)

  const righe = await righeDi(page, 0)
  const plot = [...new Set(righe.map((r) => r.plot))]
  expect(plot, `la riga senza nome ha spostato le colonne: ${JSON.stringify(righe)}`).toHaveLength(1)
  expect(righe[2]!.rapporto).toBeCloseTo(BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * 0.25, 2)

  // E il colore **non e' `--brand`**, che e' il colore delle barre di B: una riga
  // che nomina un'assenza non deve leggersi come una categoria vera che ha
  // scelto il verde del marchio. Il confronto e' contro il token **dipinto**,
  // non contro le altre due barre: quelle sono due tinte qualunque, e "diverso
  // da loro" e' vero anche del verde del marchio — provato, e' la mutazione M18.
  const colori = await page.evaluate(() => {
    const sonda = document.createElement('span')
    sonda.style.cssText = 'position:absolute;visibility:hidden'
    document.body.appendChild(sonda)
    const risolvi = (token: string): string => {
      sonda.style.backgroundColor = token
      return getComputedStyle(sonda).backgroundColor
    }
    const brand = risolvi('var(--brand)')
    const neutro = risolvi('var(--text-muted)')
    sonda.remove()
    return {
      brand,
      neutro,
      barre: [
        ...document.querySelectorAll('.stats__section')[0]!.querySelectorAll('.stat__bar'),
      ].map((b) => getComputedStyle(b).backgroundColor),
    }
  })
  expect(colori.barre[2], 'la riga orfana e\' dipinta col verde del marchio').not.toBe(colori.brand)
  expect(colori.barre[2]).toBe(colori.neutro)
})

test('sotto tre categorie restano le righe e spariscono le barre', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    { categoria: 'Fuori', cents: 4000 },
    { categoria: 'Spesa', cents: 2000 },
  ])

  const sezione = page.locator('.stats__section').first()
  await expect(sezione.locator('.stat')).toHaveCount(2)
  // Due barre non sono una ripartizione: sono due numeri disegnati lunghi.
  await expect(sezione.locator('.stat__bar')).toHaveCount(0)
  // Ma i due numeri si leggono lo stesso, ed e' il punto: la riga sopravvive
  // alla barra perche' il grafico **e'** la tabella.
  await expect(sezione.locator('.stat__value').first()).toHaveText(/40,00|40\.00/)

  // Il totale della parte resta, perche' le righe ci sono sempre: senza barre
  // questa e' una tabella, e una tabella con un totale e' ancora una risposta.
  await expect(sezione.locator('.stats__partTotal')).toHaveText(/60,00/)

  // E **nessuna frase** su cosa sia in scala: senza barre parlerebbe di una cosa
  // che non e' a schermo, e con le barre lo dice gia' la prima, lunga il 100%.
  await expect(page.locator('.stats')).not.toContainText('in scala')
})

/**
 * **A e' divisa in due, e nessuna delle due parti esclude niente** (ADR 016 §1).
 *
 * Il difetto originale aveva un nome preciso: una settimana con 507,00 € di
 * affitto leggeva **0,00 €** sotto un titolo che chiede dove sono finiti i soldi,
 * e citava ADR 016 per farlo. §1 dice il contrario — Storico e statistiche
 * mostrano tutto, e' *solo il budget* a escludere.
 *
 * La riparazione di allora fu mettere le fisse **dentro la stessa barra**, con un
 * segmento tratteggiato. Adesso sono una **parte a se'**, con la propria scala e
 * il proprio totale, e il segmento non c'e' piu': non aveva piu' un dato da
 * portare — dentro la parte delle fisse varrebbe "tutto" su ogni riga.
 *
 * Le due cose che questo test sorveglia e che il vecchio non poteva:
 *
 * - **le due scale sono davvero due**: la riga piu' grande di *ciascuna* parte
 *   arriva a fondo colonna. Con una scala sola, 62,00 € accanto a 507,00 €
 *   varrebbero il 12% e la seconda parte sarebbe illeggibile;
 * - **i due totali sono confrontabili**, perche' sono tutti e due del periodo —
 *   che e' cio' che le due schede in testa non sono (una e' al mese).
 */
test('A si divide in fisse e variabili, ognuna con la propria scala e il proprio totale', async ({
  page,
}) => {
  await page.goto('/')
  await chiudiGuida(page)
  // Tre categorie per parte: la soglia sotto la quale le barre spariscono si
  // applica **a ciascuna**, e con due righe per parte questo test misurerebbe
  // due tabelle invece di due grafici.
  await semina(page, [
    { categoria: 'Casa', cents: 50700, fissa: true },
    { categoria: 'Trasporti', cents: 28000, fissa: true },
    { categoria: 'Sigarette', cents: 9000, fissa: true },
    // Trasporti sta in tutte e due: 280,00 di abbonamento e 120,00 a mano. E'
    // voluto, ed e' il caso che rompe una `key` di Preact fatta col solo
    // `categoryId`.
    { categoria: 'Trasporti', cents: 12000 },
    { categoria: 'Spesa', cents: 6200 },
    { categoria: 'Fuori', cents: 3000 },
  ])

  const sezione = page.locator('.stats__section').first()
  const parti = sezione.locator('.stats__partTitle')
  await expect(parti).toHaveCount(2)

  // Prima le fisse, poi le variabili, e **sempre in quest'ordine**: e' una
  // distinzione di natura, non una classifica. Se l'ordine seguisse gli importi,
  // il mese in cui le variabili superano l'affitto la schermata si
  // rimescolerebbe sotto le stesse dita.
  await expect(parti.nth(0)).toHaveText(
    new RegExp(`${dizionario['stats.fixedInPeriod']}.*877,00`),
  )
  await expect(parti.nth(1)).toHaveText(
    new RegExp(`${dizionario['stats.variable']}.*212,00`),
  )

  // Le fisse: Casa 507,00 e Trasporti 280,00. Se tornassero fuori da A la prima
  // parte non esisterebbe affatto.
  const elenchi = sezione.locator('.stats__rows')
  await expect(elenchi.nth(0).locator('.stat')).toHaveCount(3)
  await expect(elenchi.nth(0).locator('.stat').first().locator('.stat__label')).toHaveText('Casa')
  await expect(elenchi.nth(0).locator('.stat').first().locator('.stat__value')).toHaveText(/507,00/)
  // Le variabili: Trasporti 120,00 e Spesa 62,00 — e Trasporti c'e' due volte
  // nella schermata, con due importi diversi.
  await expect(elenchi.nth(1).locator('.stat')).toHaveCount(3)
  await expect(elenchi.nth(1).locator('.stat').first().locator('.stat__value')).toHaveText(/120,00/)

  // **Il segmento della parte fissa non esiste piu' da nessuna parte.** Non e'
  // stato nascosto: e' sparita la sua causa.
  await expect(page.locator('.stat__fixed')).toHaveCount(0)

  // **Due scale.** In ciascuna parte la barra piu' lunga riempie la colonna, e
  // le due colonne sono larghe uguali — quindi due barre piene con 507,00 € e
  // 120,00 € accanto dicono da sole che le scale sono due.
  const misure = await page.evaluate(() =>
    [...document.querySelectorAll('.stats__section')[0]!.querySelectorAll('.stats__rows')].map(
      (elenco) => {
        const plot = elenco.querySelector('.stat__plot')?.getBoundingClientRect().width ?? 0
        return {
          plot: Math.round(plot * 100) / 100,
          barre: [...elenco.querySelectorAll('.stat__bar')].map(
            (b) => Math.round((b.getBoundingClientRect().width / plot) * 10000) / 10000,
          ),
        }
      },
    ),
  )
  expect(misure).toHaveLength(2)
  expect(misure[0]!.plot, 'le due parti hanno colonne di larghezza diversa').toBe(misure[1]!.plot)
  expect(misure[0]!.barre[0], 'la barra piu\' grande delle fisse non riempie').toBeCloseTo(1, 2)
  expect(misure[1]!.barre[0], 'la barra piu\' grande delle variabili non riempie').toBeCloseTo(1, 2)
  // E dentro ciascuna parte le proporzioni restano quelle: 280 su 507 e 62 su 120.
  const atteso = (f: number): number => BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * f
  expect(misure[0]!.barre[1]).toBeCloseTo(atteso(28000 / 50700), 2)
  expect(misure[1]!.barre[1]).toBeCloseTo(atteso(6200 / 12000), 2)
})

/**
 * **Con una riga sola il totale di parte non c'e', e la scena e' quella modale.**
 *
 * ## Il difetto, misurato
 *
 * Una regola sola — il canone, cioe' quello che ADR 016 da' per scontato — dava
 * `Fisse in questo periodo 900,00 €` e poco sotto `Casa 900,00 €`: due stringhe
 * identiche, **incolonnate sullo stesso bordo destro**, perche' il totale di
 * parte e l'importo di riga sono tutti e due allineati a destra sulla stessa
 * griglia. La cifra ripetuta e' la metrica con cui questo progetto ha gia'
 * trovato due difetti.
 *
 * La distanza esatta la stampa il test invece di ricopiarla qui: cambia col
 * viewport, e un numero scritto a mano in un commento e' vero una volta sola. Il
 * bordo destro invece **coincide**, e quello e' il fatto che rende le due cifre
 * una copia visiva e non due numeri accanto.
 *
 * L'invariante che giustifica quel numero — *"e' sempre la somma delle righe"* —
 * con una riga e' **vacuo**. E cio' che il numero serviva a fare, confrontare
 * fisse e variabili fra loro (le due schede in testa non possono: una e' al
 * mese), con una riga lo fa gia' la riga.
 *
 * ## Le due meta', e servono tutte e due
 *
 * 1. **La parte a una riga non porta cifre nell'intestazione.** Si legge il
 *    testo dipinto dell'intero `<h3>`, non l'assenza di `.stats__partTotal`: il
 *    difetto e' *"la stessa cifra due volte"*, e una cifra rimessa dentro il nome
 *    di parte sarebbe lo stesso difetto con un'altra classe.
 * 2. **La parte a piu' righe il totale ce l'ha.** Senza questa meta', togliere
 *    il totale ovunque resterebbe verde — e sparirebbe in silenzio l'unico
 *    confronto fra le due nature che la schermata sa fare. Il caso a tre righe
 *    per parte e' gia' nel test qui sopra; qui le due meta' stanno **nella stessa
 *    schermata**, che e' l'unico modo di provare che la regola discrimina invece
 *    di spegnere una cosa sola.
 *
 * Il fatto dei 900,00 non se n'e' andato: sta sulla riga, ed e' asserito.
 */
test('la parte con una riga sola non ripete la sua cifra nell\'intestazione', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    // Le fisse: **una regola sola**. E' il canone.
    { categoria: 'Casa', cents: 90000, fissa: true },
    // Le variabili: tre righe, cosi' la seconda meta' della regola ha un caso.
    { categoria: 'Spesa', cents: 2600 },
    { categoria: 'Fuori', cents: 4000 },
    { categoria: 'Trasporti', cents: 1000 },
  ])

  const sezione = page.locator('.stats__section').first()
  const parti = sezione.locator('.stats__partTitle')
  await expect(parti).toHaveCount(2)

  // 1. L'intestazione delle fisse dice **di che soldi si tratta e nient'altro**.
  const fisse = (await parti.nth(0).innerText()).trim()
  expect(fisse, 'l\'intestazione delle fisse non e\' quella giusta').toContain(
    dizionario['stats.fixedInPeriod'],
  )
  expect(
    fisse,
    `la parte con una riga sola ripete la propria cifra nell'intestazione: "${fisse}", ` +
      'e la stessa cifra e\' sulla riga qui sotto',
  ).not.toMatch(/\d/)

  // E i 900,00 sono a schermo: sulla riga, dove hanno un nome accanto.
  const righeFisse = sezione.locator('.stats__rows').nth(0).locator('.stat')
  await expect(righeFisse).toHaveCount(1)
  await expect(righeFisse.first().locator('.stat__value')).toHaveText(/900,00/)

  // 2. Le variabili, tre righe, il totale c'e': 76,00 = 26 + 40 + 10.
  await expect(parti.nth(1)).toHaveText(new RegExp(`${dizionario['stats.variable']}.*76,00`))
  await expect(sezione.locator('.stats__rows').nth(1).locator('.stat')).toHaveCount(3)

  // La misura che ha prodotto la regola, registrata: i due bordi destri e la
  // distanza verticale fra l'intestazione e la riga che ripeteva.
  const geo = await page.evaluate(() => {
    const s = document.querySelectorAll('.stats__section')[0]!
    const titolo = s.querySelectorAll('.stats__partTitle')[0]!.getBoundingClientRect()
    const valore = s.querySelectorAll('.stats__rows')[0]!
      .querySelector('.stat__value')!
      .getBoundingClientRect()
    const r = (n: number): number => Math.round(n * 100) / 100
    return {
      titoloDx: r(titolo.right),
      valoreDx: r(valore.right),
      // Lo spazio fra i due box, non fra i due `top`: e' la distanza che l'occhio
      // percorre fra la cifra ripetuta e la sua copia.
      salto: r(valore.top - titolo.bottom),
    }
  })
  console.log(
    `\n| intestazione fino a ${geo.titoloDx}px | importo di riga fino a ${geo.valoreDx}px | ` +
      `${geo.salto}px sotto |\n`,
  )
})

/**
 * **Senza spese fisse nel periodo non c'e' nessuna parte delle fisse.**
 *
 * Un'intestazione "Spese fisse — 0,00 €" sopra un elenco vuoto sarebbe la stessa
 * cosa di `hero.fixed` che parla dove non c'e' niente da dichiarare: insegna a
 * non leggere le intestazioni. E senza la seconda parte non serve nemmeno la
 * separazione: una parte sola non si separa da niente.
 */
test('con le sole spese a mano A ha una parte sola e nessuna riga di separazione', async ({
  page,
}) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    { categoria: 'Fuori', cents: 4000 },
    { categoria: 'Spesa', cents: 2000 },
    { categoria: 'Casa', cents: 1000 },
  ])

  const parti = page.locator('.stats__section').first().locator('.stats__partTitle')
  await expect(parti).toHaveCount(1)
  await expect(parti.first()).toHaveText(
    new RegExp(`${dizionario['stats.variable']}.*70,00`),
  )
  await expect(page.locator('.stats')).not.toContainText(dizionario['stats.fixedInPeriod'])

  // La separazione e' `.stats__rows + .stats__partTitle`: con una parte sola non
  // c'e' nessun elenco prima di un titolo, quindi nessun bordo. Si legge il
  // bordo **calcolato**, non la regola.
  const bordo = await page.evaluate(() => {
    const titolo = document.querySelector('.stats__partTitle')
    return titolo === null ? null : getComputedStyle(titolo).borderBlockStartWidth
  })
  expect(bordo, 'una parte sola porta comunque la riga che la separerebbe').toBe('0px')
})

/**
 * **Una parte sotto soglia dentro una sezione che ha barre.**
 *
 * La soglia si applica **a ciascuna parte**: tre categorie fisse e due variabili
 * danno un grafico sopra e una tabella sotto, nella stessa sezione e sulle stesse
 * colonne. E' il caso misto, ed e' quello per cui `.stat__value` dichiara
 * `grid-column: -2`: senza, le righe da due celle metterebbero l'importo nella
 * colonna del grafico — cioe' **in mezzo**, incolonnato con niente.
 *
 * Si asserisce sul **bordo destro dipinto**, non sulla colonna calcolata: e' cio'
 * che l'occhio incolonna, ed e' vero anche se un giorno le colonne cambiassero
 * numero.
 */
test('nella stessa sezione una parte a barre e una a tabella restano incolonnate', async ({
  page,
}) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    { categoria: 'Casa', cents: 50700, fissa: true },
    { categoria: 'Trasporti', cents: 28000, fissa: true },
    { categoria: 'Sigarette', cents: 9000, fissa: true },
    // Due sole categorie a mano: sotto soglia, quindi righe senza barra.
    { categoria: 'Spesa', cents: 6200 },
    { categoria: 'Fuori', cents: 3000 },
  ])

  const sezione = page.locator('.stats__section').first()
  await expect(sezione.locator('.stats__partTitle')).toHaveCount(2)
  const elenchi = sezione.locator('.stats__rows')
  // Il grafico sopra, la tabella sotto: la soglia e' per parte, non per sezione.
  await expect(elenchi.nth(0).locator('.stat__bar')).toHaveCount(3)
  await expect(elenchi.nth(1).locator('.stat__bar')).toHaveCount(0)

  const bordi = await page.evaluate(() => {
    const valori = [
      ...document.querySelectorAll('.stats__section')[0]!.querySelectorAll('.stat__value'),
    ]
    return valori.map((v) => Math.round(v.getBoundingClientRect().right * 100) / 100)
  })
  expect(bordi.length, 'meno di cinque righe: il caso misto non e\' in scena').toBe(5)
  expect(
    [...new Set(bordi)],
    `gli importi delle due parti non sono incolonnati: ${JSON.stringify(bordi)}`,
  ).toHaveLength(1)
})

/**
 * **Il segno del maturato si vede dove serve — e "si vede" e' un numero.**
 *
 * ## Cosa c'era, e perche' non bastava
 *
 * C'era `elementFromPoint(centro del segno) === 'stat__accrued'`, e sorvegliava
 * una cosa vera: `.stat__accrued` stava **prima** di `.stat__bar` nel DOM, e fra
 * due assoluti senza livello dichiarato vince chi viene dopo — quindi sulla riga
 * corrente, l'unica in cui il segno dice qualcosa, era la barra a coprirlo.
 *
 * Ma quell'asserzione risponde a *"c'e' un elemento li'?"*, e il difetto trovato
 * dopo era un altro: il segno **c'era e non si vedeva**. Dipinto `--line-strong`
 * sopra un riempimento `--brand`, valeva **1,88:1** in tema chiaro e 2,63:1 in
 * scuro. `elementFromPoint` sarebbe passato identico a `opacity: 0.02`.
 *
 * ## Cosa c'e' adesso: il contrasto **dipinto**
 *
 * Si campiona una scansione di pixel veri attraverso il segno, a meta' altezza
 * della barra, e si chiede che almeno **1 px CSS** del segno stia a 3:1 dal
 * riempimento che ha da una parte e dall'altra.
 *
 * Le tre soglie, e da dove vengono:
 *
 * - **3:1** e' la soglia WCAG 1.4.11 per un elemento grafico che porta
 *   informazione, che e' esattamente cio' che questo segno e';
 * - **1 px CSS** e' la larghezza minima perche' una linea esista su uno schermo a
 *   dpr 1. Misurato, il segno ne offre **2** (sei colonne a scale 3), quindi la
 *   soglia sta a meta' del margine reale: non e' tarata su cio' che passa oggi;
 * - **il riempimento si legge di fianco al segno**, non da un token: e' cio' che
 *   il segno deve battere, e in `--brand` ci arriva l'`opacity` di chiunque stia
 *   sopra.
 *
 * E questa asserzione **contiene** quella di prima: se `.stat__accrued` tornasse
 * prima di `.stat__bar`, sotto il segno si campionerebbe `--brand` puro da tutte
 * e due le parti, cioe' 1,00:1.
 *
 * ## Le due righe, che sono tre superfici
 *
 * La riga chiusa porta il segno a fine traccia, con `--surface-sunken` a sinistra
 * e `--bg` a destra; la riga corrente ce l'ha **dentro la barra**, con `--brand`
 * da tutte e due le parti. Nessun colore piatto puo' battere di 3:1 sia `--bg`
 * sia `--brand` (le due luminanze sono agli estremi opposti), ed e' la ragione
 * per cui il segno e' un nucleo con una guaina: vedi `Stats.css`.
 *
 * E si misura in **tutti e due i temi**: il tema qui non e' un dettaglio di
 * stile, e' cio' che decide se il numero passa.
 */
test('il segno del maturato si stacca dal riempimento su cui cade, in entrambi i temi', async ({
  page,
}) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(
    page,
    [
      { categoria: 'Spesa', cents: 15000, giorniFa: 7 },
      { categoria: 'Spesa', cents: 12000 },
      { categoria: 'Fuori', cents: 9000 },
      { categoria: 'Svago', cents: 4000 },
    ],
    { budgetCents: 20000 },
  )

  const periodi = page.locator('.stats__section').nth(1)
  await expect(periodi.locator('.stat')).toHaveCount(2)
  // La traccia esiste: il budget copre per intero tutte e due le settimane.
  await expect(periodi.locator('.stat__track')).toHaveCount(2)
  await expect(periodi.locator('.stat__accrued')).toHaveCount(2)

  // `scansiona` legge dal **viewport**: su uno schermo basso — il progetto
  // `landscape` e' 800x327 — la riga corrente sta sotto il bordo e si
  // campionerebbero i pixel di qualcos'altro. Si porta a schermo, che e' anche
  // cio' che fa l'utente.
  await periodi.locator('.stat').last().scrollIntoViewIfNeeded()

  const guasti: string[] = []
  const misure: string[] = []

  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema })

    for (const indice of [0, 1]) {
      const geo = await page.evaluate((i: number) => {
        const righe = [
          ...document.querySelectorAll('.stats__section')[1]!.querySelectorAll('.stat'),
        ]
        const riga = righe[i]!
        const segno = riga.querySelector('.stat__accrued')!.getBoundingClientRect()
        const barra = riga.querySelector('.stat__bar')!.getBoundingClientRect()
        const plot = riga.querySelector('.stat__plot')!.getBoundingClientRect()
        return {
          etichetta: riga.querySelector('.stat__label')?.textContent ?? '',
          sinistra: segno.left,
          larghezza: segno.width,
          y: plot.top + plot.height / 2,
          // La premessa che rende una prova il caso della riga corrente: il segno
          // cade **dentro** la barra. Senza, non ci sarebbe niente da coprire e
          // niente su cui misurare un contrasto.
          dentroLaBarra: segno.left >= barra.left && segno.right <= barra.right,
        }
      }, indice)

      // Fuori dal segno di quattro pixel: li' c'e' il riempimento e non un bordo.
      const linea = await scansiona(page, {
        da: geo.sinistra - 4,
        a: geo.sinistra + geo.larghezza + 4,
        y: geo.y,
      })
      const fuori = 1 / 3
      const fillSx = linea[0]!.px
      const fillDx = linea[linea.length - 1]!.px
      const dentro = linea.filter(
        (c) => c.x >= geo.sinistra - fuori && c.x <= geo.sinistra + geo.larghezza + fuori,
      )
      // Larghezza, in px CSS, della parte di segno che batte il riempimento di
      // 3:1. Si contano le colonne del **dispositivo** e si dividono per la
      // scala: a scale 3 un pixel CSS sono tre colonne.
      const larghezzaSopra = (fill: Px): number =>
        dentro.filter((c) => contrasto(c.px, fill) >= 3).length / 3
      const sopraSx = larghezzaSopra(fillSx)
      const sopraDx = larghezzaSopra(fillDx)
      const massimo = (fill: Px): number => Math.max(...dentro.map((c) => contrasto(c.px, fill)))

      misure.push(
        `| ${tema.padEnd(5)} | ${geo.etichetta.padEnd(10)} | sx ${esadecimale(fillSx)} ` +
          `${massimo(fillSx).toFixed(2)}:1 su ${sopraSx.toFixed(2)}px | dx ${esadecimale(fillDx)} ` +
          `${massimo(fillDx).toFixed(2)}:1 su ${sopraDx.toFixed(2)}px |`,
      )
      if (indice === 1 && !geo.dentroLaBarra) {
        guasti.push(`${tema}: il segno della riga corrente non cade dentro la barra`)
      }
      if (sopraSx < 1) {
        guasti.push(
          `${tema} ${geo.etichetta}: a sinistra il segno batte ${esadecimale(fillSx)} di ` +
            `${massimo(fillSx).toFixed(2)}:1 su ${sopraSx.toFixed(2)}px (servono 3:1 su 1px)`,
        )
      }
      if (sopraDx < 1) {
        guasti.push(
          `${tema} ${geo.etichetta}: a destra il segno batte ${esadecimale(fillDx)} di ` +
            `${massimo(fillDx).toFixed(2)}:1 su ${sopraDx.toFixed(2)}px (servono 3:1 su 1px)`,
        )
      }
    }
  }
  await page.emulateMedia({ colorScheme: 'light' })

  console.log(`\n${misure.join('\n')}\n`)
  expect(guasti, 'il segno del maturato non si stacca dal riempimento su cui cade').toEqual([])
})

/**
 * **La rotaia e' il budget del periodo, e il periodo in corso non la accorcia.**
 *
 * ## Il difetto che questo test esiste per non far tornare
 *
 * C'era `.stat__unlived`: una banda che ridipingeva col fondo il tratto fra il
 * maturato e la fine della traccia. Toglieva alla rotaia **esattamente
 * `budget × giorni vissuti / giorni totali`** — cioe' disegnava il tetto
 * pro-rata che ADR 010 scarta. La rotaia e' l'unica cosa su quella schermata che
 * dica quanto vale il tetto (le barre si leggono contro di lei, non contro un
 * asse), quindi accorciarla riduce il tetto nel solo posto in cui e' scritto:
 * mercoledi' di una settimana da 200,00 €, se ne vedevano tre settimi.
 *
 * ## Perche' non `expect('.stat__unlived').toHaveCount(0)`
 *
 * Perche' quella asserzione sorveglia **un nome di classe**, non il fatto: e'
 * verde anche con la stessa banda ridipinta da un `::after` sulla traccia, da un
 * gradiente o da una `inline-size` che si ferma al maturato. Qui si guarda cio'
 * che lo schermo mostra — la stessa scelta di `scansiona`, e la stessa ragione:
 * fra un token e i pixel ci sono l'ordine del DOM, chi copre chi e i gradienti.
 *
 * ## Le tre misure, e cosa fa cadere ciascuna
 *
 * Sulla riga **corrente** (mercoledi', 3 giorni su 7) si campiona a meta'
 * altezza in tre punti scelti dai rettangoli veri:
 *
 * 1. **rotaia vissuta**, fra la fine della barra e il segno del maturato;
 * 2. **rotaia non vissuta**, fra il segno e la fine della traccia;
 * 3. **fondo**, oltre la fine della traccia.
 *
 * (1) e (2) devono essere **lo stesso colore**: e' la rotaia intera. (3) deve
 * essere **diverso** da (1), ed e' la premessa che impedisce al test di passare
 * a vuoto — se rotaia e fondo si dipingessero uguali, nessuna scansione
 * distinguerebbe una banda da nessuna banda.
 *
 * La scena e' costruita perche' i tre punti esistano con margine: budget 200,00 €
 * su una scala che arriva a 300,00 € (la settimana scorsa), e 30,00 € spesi
 * questa settimana — cioe' barra ben prima del maturato, e maturato ben prima
 * della fine della rotaia. Le tre premesse geometriche sono asserite prima dei
 * colori, con 4 px di margine, cosi' un fallimento dice *quale* delle due cose e'
 * cambiata.
 */
test('la rotaia del budget e lunga tutto il periodo, anche a periodo in corso', async ({
  page,
}) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(
    page,
    [
      // La settimana scorsa: 300,00 €, cioe' la scala di B.
      { categoria: 'Spesa', cents: 30000, giorniFa: 5 },
      // Questa settimana: 30,00 €, ben sotto il maturato di mercoledi'
      // (200,00 × 3/7 = 85,71 €). Serve a lasciare scoperto un tratto di rotaia
      // **prima** del segno, che e' il punto (1).
      { categoria: 'Fuori', cents: 3000 },
    ],
    { budgetCents: 20000 },
  )

  const periodi = page.locator('.stats__section').nth(1)
  await expect(
    periodi.locator('.stats__title'),
    'la seconda sezione non e\' B: il test starebbe misurando le categorie',
  ).toHaveText(dizionario['stats.byPeriod.weekly'])
  await expect(periodi.locator('.stat')).toHaveCount(2)

  // `scansiona` legge dal viewport: su `landscape` (800x327) la riga corrente sta
  // sotto il bordo e si campionerebbero i pixel di qualcos'altro.
  await periodi.locator('.stat').last().scrollIntoViewIfNeeded()

  const geo = await page.evaluate(() => {
    const righe = [...document.querySelectorAll('.stats__section')[1]!.querySelectorAll('.stat')]
    const riga = righe[righe.length - 1]!
    const rect = (sel: string): DOMRect => {
      const el = riga.querySelector(sel)
      if (el === null) throw new Error(`la riga corrente non ha ${sel}`)
      return el.getBoundingClientRect()
    }
    const plot = rect('.stat__plot')
    const traccia = rect('.stat__track')
    const barra = rect('.stat__bar')
    const segno = rect('.stat__accrued')
    return {
      y: plot.top + plot.height / 2,
      barraFine: barra.right,
      segnoDa: segno.left,
      segnoA: segno.right,
      tracciaFine: traccia.right,
      plotFine: plot.right,
      // Le larghezze, per il messaggio: un fallimento deve dire di quanto.
      plot: Math.round(plot.width * 100) / 100,
      traccia: Math.round(traccia.width * 100) / 100,
    }
  })

  // Le tre premesse geometriche. Senza, i punti campionati non sarebbero quelli
  // che il test crede, e i colori tornerebbero per il motivo sbagliato.
  const margine = 4
  expect(
    geo.segnoDa - geo.barraFine,
    'la barra arriva al maturato: non resta rotaia vissuta da campionare',
  ).toBeGreaterThan(2 * margine)
  expect(
    geo.tracciaFine - geo.segnoA,
    'il maturato cade a fine rotaia: questo periodo non e\' in corso',
  ).toBeGreaterThan(2 * margine)
  expect(
    geo.plotFine - geo.tracciaFine,
    'la rotaia riempie il grafico: non resta fondo con cui confrontarla',
  ).toBeGreaterThan(2 * margine)

  const linea = await scansiona(page, { da: geo.barraFine, a: geo.plotFine, y: geo.y })
  const a = (x: number): Px =>
    linea.reduce((migliore, c) => (Math.abs(c.x - x) < Math.abs(migliore.x - x) ? c : migliore)).px
  const vissuto = a((geo.barraFine + geo.segnoDa) / 2)
  const nonVissuto = a((geo.segnoA + geo.tracciaFine) / 2)
  const fondo = a((geo.tracciaFine + geo.plotFine) / 2)

  console.log(
    `\n| plot ${geo.plot}px | rotaia ${geo.traccia}px | vissuto ${esadecimale(vissuto)} | ` +
      `non vissuto ${esadecimale(nonVissuto)} | fondo ${esadecimale(fondo)} |\n`,
  )

  // La premessa che rende la prova possibile.
  expect(
    esadecimale(fondo),
    'rotaia e fondo si dipingono uguali: questa scansione non distinguerebbe una banda',
  ).not.toBe(esadecimale(vissuto))

  // E il fatto: la rotaia e' una sola superficie da capo a fondo.
  expect(
    esadecimale(nonVissuto),
    'la rotaia e\' ridipinta col fondo dopo il maturato: e\' il budget accorciato ' +
      'in proporzione ai giorni passati, cioe\' il pro-rata che ADR 010 rifiuta',
  ).toBe(esadecimale(vissuto))
})

/**
 * **Il pavimento del modello e' quello che il CSS dipinge.**
 *
 * `BAR_MIN_FRACTION` in `stats-view.ts` e' **il contorno di `.stat__bar` diviso
 * `--plot-min`**: due numeri che vivono in `Stats.css`, ricopiati a mano in un
 * file che il CSS non vede, e finora l'unica cosa che li teneva d'accordo era un
 * commento su ciascuno dei due.
 *
 * Il modo di fallire e' silenzioso in tutti e due i versi. Con `--plot-min` piu'
 * grande della costante, il pavimento e' piu' alto del necessario e schiaccia
 * insieme importi che si distinguerebbero. Con `--plot-min` piu' piccolo, il
 * pavimento non arriva ai 2 px del contorno e torna il difetto che il pavimento
 * e' li' per togliere: due importi diversi dipinti identici, con il modello
 * convinto di averli separati.
 *
 * Qui i due numeri si guardano davvero: `--plot-min` risolto in pixel dalla
 * pagina, il bordo letto da una barra vera, e la costante importata.
 *
 * ## Questa intestazione ha portato per un po' i due numeri di ieri
 *
 * Diceva *"`BAR_MIN_FRACTION` vale `2 / 64`, dove il 64 e' `--plot-min`"*.
 * Nel frattempo la costante era passata a `2 / 112` e il token a `7rem`: cioe'
 * **il file che esiste perche' quei due numeri non divergano portava in testa la
 * coppia divergente**, e chi ci fosse arrivato dopo un fallimento avrebbe letto
 * il valore sbagliato nel posto dove andava a cercare quello giusto.
 *
 * Adesso non ce ne sono piu'. I valori veri li **deriva il test** — la costante
 * importata, il contorno letto da una barra vera, `--plot-min` risolto dalla
 * pagina — e li stampa nel messaggio di fallimento qui sotto: e' li' che si
 * leggono, e li' non possono invecchiare.
 *
 * ## Cosa questo test **non** guarda
 *
 * Il legame fra i due numeri, non la proprieta' *"la lunghezza dipinta e' la
 * frazione del modello"*. Sono cose diverse: un `min-inline-size` rimesso su
 * `.stat__bar` lascia la costante d'accordo col contorno e riporta il pavimento
 * nel CSS, cioe' proprio il difetto per cui la costante e' stata spostata nel
 * modello. Quella meta' sta nel test sui nomi ostili — e' l'unica scena con una
 * barra abbastanza corta perche' un minimo dipinto la tocchi (0,59% della
 * scala): li' c'e' la misura, e li' c'e' la mutazione che la fa cadere.
 */
test('il pavimento della barra nel modello e\' il contorno che il CSS dipinge', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    { categoria: 'Casa', cents: 50700 },
    { categoria: 'Spesa', cents: 25350 },
    { categoria: 'Fuori', cents: 5070 },
  ])

  const pavimento = await plotMinPx(page)
  const bordo = await page.evaluate(() => {
    const barra = document.querySelector('.stat__bar')
    if (barra === null) throw new Error('nessuna barra da cui leggere il contorno')
    const s = getComputedStyle(barra)
    return {
      inizio: Number.parseFloat(s.borderInlineStartWidth),
      fine: Number.parseFloat(s.borderInlineEndWidth),
      boxSizing: s.boxSizing,
    }
  })

  // La premessa: con `content-box` il contorno non sarebbe un pavimento, e tutto
  // il ragionamento della costante non varrebbe piu'.
  expect(bordo.boxSizing, 'la barra non e\' in border-box: il contorno non fa piu\' da pavimento')
    .toBe('border-box')

  const inchiostroMinimo = bordo.inizio + bordo.fine
  expect(
    BAR_MIN_FRACTION,
    `il pavimento del modello (${BAR_MIN_FRACTION}) non e' il contorno dipinto ` +
      `(${inchiostroMinimo}px) sulla colonna piu' stretta (--plot-min = ${pavimento}px): ` +
      'uno dei due si e\' mosso senza l\'altro',
  ).toBeCloseTo(inchiostroMinimo / pavimento, 10)

  // E la proprieta' da cui dipende la rimappatura: `MIN + (1 - MIN) · 1` deve
  // valere **esattamente** 1, o la barra piu' grande non riempie la colonna. Era
  // scritta in `stats-view.ts` come "MIN e' 2^-5"; quella e' una condizione
  // sufficiente e non necessaria, e vale la pena controllare la proprieta' invece
  // della ragione per cui una volta era vera.
  expect(
    BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * 1,
    'la frazione piu\' grande non vale esattamente 1: la barra piu\' lunga non riempie',
  ).toBe(1)
})

/**
 * **Un periodo davvero a zero disegna zero pixel.**
 *
 * Con `box-sizing: border-box` e un contorno da 1px, `inline-size: 0%` restava
 * largo 2 px: una settimana senza una spesa si leggeva "un pochino". E' un caso
 * che esiste davvero da quando B non taglia piu' i periodi vuoti dentro la
 * finestra.
 */
test('una settimana senza spese disegna una barra larga zero, non due pixel', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    { categoria: 'Spesa', cents: 12000, giorniFa: 14 },
    { categoria: 'Fuori', cents: 8000 },
    { categoria: 'Svago', cents: 4000 },
    { categoria: 'Casa', cents: 2000 },
  ])

  const periodi = page.locator('.stats__section').nth(1)
  // Tre settimane: quella della prima spesa, quella di mezzo **vuota**, e questa.
  await expect(periodi.locator('.stat')).toHaveCount(3)

  const larghezze = await page.evaluate(() =>
    [...document.querySelectorAll('.stats__section')[1]!.querySelectorAll('.stat__bar')].map(
      (b) => Math.round(b.getBoundingClientRect().width * 100) / 100,
    ),
  )
  expect(larghezze).toHaveLength(3)
  expect(larghezze[1], 'la settimana vuota disegna qualcosa').toBe(0)
  // E le altre due non sono "quasi zero": l'assenza non prende inchiostro, la
  // presenza ne prende almeno quanto il contorno. Le due meta' della stessa
  // regola, e sono l'una la premessa dell'altra — senza questa riga, `toBe(0)`
  // sarebbe verde anche con tutte le barre a zero.
  const contorno = await page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.querySelector('.stat__bar')!).borderInlineStartWidth),
  )
  expect(larghezze[0]).toBeGreaterThanOrEqual(2 * contorno)
  expect(larghezze[2]).toBeGreaterThanOrEqual(2 * contorno)
})

/**
 * **B dice di cosa sono fatte le sue barre, e il caso che lo impone e' uno zero
 * scritto sotto un 900.**
 *
 * La scena e' quella vera del primo del mese: nella settimana corrente e' uscito
 * **solo l'affitto**, materializzato da una regola. B le fisse le esclude — e'
 * il confronto col budget, cioe' l'unico caso che ADR 016 §1 nomina come
 * escludente — quindi la riga di questa settimana vale `0,00 €`, mentre dodici
 * righe piu' su la stessa schermata scrive `900,00 €`.
 *
 * **L'esclusione resta; il silenzio no.** ADR 016 §2 chiede che un'esclusione si
 * dichiari *accanto al numero*, e i numeri di B sono otto: senza un'etichetta,
 * quella schermata afferma due cose che non stanno insieme e lascia all'utente
 * il compito di indovinare quale delle due e' vera. E' il difetto per cui A e'
 * stata divisa in due, riflesso in B — con la differenza che li' a sbagliare era
 * il filtro, e qui il filtro e' giusto.
 *
 * ## Le tre asserzioni, e cosa fa cadere ciascuna
 *
 * 1. **B porta il nome di cio' che conta**, ed e' la stessa parola della scheda
 *    in testa e della parte variabile di A (`stats.variable`). Togliendola,
 *    cade.
 * 2. **Le due cifre restano riconciliabili**: `0,00 €` in B e `900,00 €` in A,
 *    tutte e due a schermo. Se A ricominciasse a filtrare le fisse, lo zero
 *    resterebbe senza la sua spiegazione e questa cade.
 * 3. **Il nome di parte di B non porta nessun numero.** E' il guardiano della
 *    riparazione precedente: la nota che stava li' ripeteva cifre gia' a
 *    schermo e affermava un confronto col budget anche dove la traccia non
 *    c'era. Chi rimettesse un totale o un "su 200,00 €" farebbe cadere questa.
 */
test('B dichiara che conta le quotidiane, sopra la settimana in cui e\' uscito solo l\'affitto', async ({
  page,
}) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    // Le due settimane prima: spese a mano.
    { categoria: 'Spesa', cents: 3800, giorniFa: 4 },
    { categoria: 'Fuori', cents: 2900, giorniFa: 5 },
    { categoria: 'Trasporti', cents: 1700, giorniFa: 11 },
    { categoria: 'Coffeeshop', cents: 2100, giorniFa: 12 },
    // Questa settimana: solo l'affitto, e viene da una regola.
    { categoria: 'Casa', cents: 90000, fissa: true },
  ])

  const periodi = page.locator('.stats__section').nth(1)
  await expect(periodi.locator('.stats__title')).toHaveText(dizionario['stats.byPeriod.weekly'])

  // 1. Il nome di cio' che conta, sopra le righe.
  await expect(
    periodi.locator('.stats__partName'),
    'B non dice che le sue barre sono le quotidiane',
  ).toHaveText(dizionario['stats.variable'])

  // 2. Le due cifre, tutte e due a schermo: lo zero di questa settimana e i 900
  // che lo spiegano. Tre settimane in B, e l'ultima e' quella corrente.
  const righe = periodi.locator('.stat')
  await expect(righe).toHaveCount(3)
  await expect(righe.last().locator('.stat__value')).toHaveText(/0,00/)
  // I 900,00 stanno sulla **riga**, non nell'intestazione di parte: le fisse qui
  // sono una regola sola, e con una riga sola il totale di parte non c'e' piu'
  // (sarebbe la stessa cifra due volte, incolonnata — vedi `BreakdownSection`).
  // **Cambia il locator, non il fatto**: i 900,00 che spiegano lo 0,00 di B sono
  // a schermo come prima, ed e' quello che questo punto difende. L'intestazione
  // si controlla lo stesso, perche' e' lei a dire *di che soldi* si tratta.
  const fisse = page.locator('.stats__section').first()
  await expect(fisse.locator('.stats__partName').first()).toHaveText(
    dizionario['stats.fixedInPeriod'],
  )
  await expect(fisse.locator('.stat').first().locator('.stat__value')).toHaveText(/900,00/)

  // 3. Nessun numero nel nome di parte di B: e' un'etichetta, non un secondo
  // totale e non una nota che ripete cifre gia' scritte accanto alle barre.
  const intestazione = (await periodi.locator('.stats__partTitle').innerText()).trim()
  expect(
    intestazione,
    `l'intestazione di B porta una cifra: "${intestazione}"`,
  ).not.toMatch(/\d/)
})

/**
 * **A 320 punti, nelle due lingue, nessuna etichetta scritta dall'app tronca.**
 *
 * ## Perche' questo test non c'era, pur essendoci un test a 320 punti
 *
 * Perche' quello sotto usa **dati ostili** — un nome da import e un importo a
 * sette cifre — e li' tronca tutto: e' scritto per una domanda diversa (niente
 * scorrimento orizzontale) e su quella non discrimina niente. Con dati banali
 * l'app **troncava una stringa che scrive da se'** e nessuna misura se ne
 * accorgeva: `Categoria ri…` in italiano, `Category rem…` in inglese, con un
 * affitto da 507,00 € e quattro categorie di default.
 *
 * ## Perche' le lingue sono due
 *
 * Perche' le due variabili da cui dipende il contenuto sono **la lingua** e cio'
 * che l'utente scrive (CLAUDE.md, "Ogni bersaglio dichiara le proprie misure"), e
 * la colonna del nome e' quello che avanza dopo l'importo: `507,00 €` e
 * `€507.00` non sono larghi uguali, quindi **il nome ha una larghezza diversa
 * per lingua** — 93,23 px in italiano, 97,25 in inglese — e la stringa da farci
 * stare pure: 128,97 contro **131,67**. Il caso peggiore e' l'inglese, che e'
 * anche la lingua di quasi tutti gli utenti; misurando l'italiano da solo si
 * legge un margine che non esiste.
 *
 * ## Cosa guarda
 *
 * Ogni testo che la schermata scrive **da se'**: l'etichetta dell'orfana, i nomi
 * di parte, i titoli, le etichette dei periodi di B, e gli importi — che non
 * troncano mai per contratto. I nomi delle categorie qui sono gli otto di
 * default, cioe' anche quelli scritti da noi.
 *
 * L'etichetta di riga adesso **va a capo** invece di troncare, quindi la domanda
 * giusta e' *"il contenuto e' piu' alto di cio' che si vede"* (il clamp), non
 * *"e' piu' largo del box"*: con due righe la larghezza torna dentro per
 * costruzione, e un controllo su `scrollWidth` sarebbe verde qualunque cosa
 * succeda. E si guarda anche il **ritmo**: se una riga andata a capo diventasse
 * piu' alta delle altre, l'elenco perderebbe la sua marca unica.
 */
for (const lingua of [
  { nome: 'italiano', locale: 'it-IT', dizionario },
  { nome: 'inglese', locale: 'en-GB', dizionario: inglese },
] as const) {
  test.describe(`a 320 punti in ${lingua.nome}`, () => {
    test.use({ locale: lingua.locale })

    test(`nessuna etichetta scritta dall'app tronca, in ${lingua.nome}`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 844 })
      await page.goto('/')
      await chiudiGuida(page)
      const nomi = await grigliaDiDefault(page)
      // Dati banali, non ostili: un affitto, tre categorie, una spesa orfana.
      // Piu' due settimane indietro, cosi' che esista anche B — le sue etichette
      // ("03–09 ago", "3–9 Aug") le scrive l'app come tutte le altre.
      await semina(page, [
        { categoria: nomi.casa, cents: 50700, fissa: true },
        { categoria: nomi.trasporti, cents: 3300 },
        { categoria: nomi.spesa, cents: 2600 },
        { categoria: '(una categoria cancellata da un import)', cents: 1450 },
        { categoria: nomi.coffeeshop, cents: 900 },
        { categoria: nomi.spesa, cents: 3800, giorniFa: 8 },
        { categoria: nomi.fuori, cents: 2000, giorniFa: 15 },
      ])

      // Le premesse, o il resto sarebbe verde per assenza: la riga dell'orfana
      // c'e' — e' l'etichetta piu' larga che l'app produce — e le sezioni sono
      // due, cioe' anche B e' in scena.
      await expect(page.locator('.stats__section')).toHaveCount(2)
      await expect(
        page.locator('.stat__label', { hasText: lingua.dizionario['row.categoryRemoved'] }),
      ).toHaveCount(1)

      const misura = await page.evaluate(() => {
        // **Un'etichetta puo' perdere lettere in due modi, e vanno chiesti tutti
        // e due.** Se va a capo, il taglio e' in altezza (il clamp); se sta su
        // una riga sola, e' in larghezza (i puntini). Chiedere solo il primo
        // renderebbe il controllo verde proprio contro il difetto da cui nasce —
        // provato con la mutazione: rimettendo `white-space: nowrap` e
        // `text-overflow: ellipsis` questo test **passava**, con `Categoria ri…`
        // a schermo.
        //
        // Un pixel di tolleranza sulla larghezza: `scrollWidth` e `clientWidth`
        // sono interi e la colonna e' larga 93,23, quindi uno scarto di 1 e'
        // arrotondamento. Un troncamento vero qui vale decine di pixel — 128,97
        // di testo in 93,23 di colonna.
        const clampato = (el: Element): boolean => el.scrollHeight > el.clientHeight + 0.5
        const troncato = (el: Element): boolean => el.scrollWidth > el.clientWidth + 1
        const tagliato = (el: Element): boolean => clampato(el) || troncato(el)
        const testo = (el: Element): string => el.textContent ?? ''
        const stats = document.querySelector('.stats')
        if (stats === null) throw new Error('nessuna schermata delle Statistiche')
        return {
          etichette: [...document.querySelectorAll('.stat__label')].filter(tagliato).map(testo),
          nomiParte: [...document.querySelectorAll('.stats__partName')].filter(troncato).map(testo),
          titoli: [...document.querySelectorAll('.stats__title')].filter(troncato).map(testo),
          valori: [...document.querySelectorAll('.stat__value')].filter(troncato).map(testo),
          scroll: stats.scrollWidth - stats.clientWidth,
          altezze: [
            ...new Set(
              [...document.querySelectorAll('.stat')].map(
                (r) => Math.round(r.getBoundingClientRect().height * 100) / 100,
              ),
            ),
          ],
        }
      })

      expect(misura.etichette, 'un\'etichetta di riga e\' stata tagliata').toEqual([])
      expect(misura.nomiParte, 'un nome di parte e\' stato tagliato').toEqual([])
      expect(misura.titoli, 'un titolo di sezione e\' stato tagliato').toEqual([])
      expect(misura.valori, 'un importo e\' stato tagliato').toEqual([])
      expect(misura.scroll, 'le Statistiche scorrono di lato').toBeLessThanOrEqual(0)
      expect(
        misura.altezze,
        `le righe non sono piu' alte uguali: ${JSON.stringify(misura.altezze)}`,
      ).toHaveLength(1)
    })

    /**
     * **Lo stato "fuori dal periodo", nella lingua e sulla larghezza in cui puo'
     * rompersi.**
     *
     * Sta dentro questo `describe` e non da solo perche' condivide la premessa
     * che lo rende una prova: 320 punti — lo Zoom schermo, 288 px di contenuto —
     * e **due lingue**. Il testo qui e' due frasi intere, non un'etichetta, e la
     * lunghezza cambia con la lingua: l'italiano e' il piu' lungo dei due — 145
     * caratteri contro 140, contati **interpolati**, che e' la forma che va a
     * schermo e quella che l'asserzione qui sotto confronta — quindi va a capo un
     * numero diverso di volte.
     *
     * Quello che non deve succedere e' tre cose, e sono le stesse per cui esiste
     * questo blocco: niente lettere perse, niente scorrimento di lato, e niente
     * sotto il bordo. La terza e' quella vera qui: `.blank` chiede `60dvh` di
     * minimo e ha un `padding-block`, e un testo che va a capo cinque volte in
     * una lingua e sei nell'altra e' esattamente il modo in cui una schermata
     * senza righe esce dallo schermo **in una lingua sola**.
     */
    test(`fuori dal periodo: il testo sta dentro, a 320 punti in ${lingua.nome}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 844 })
      await page.goto('/')
      await chiudiGuida(page)
      const nomi = await grigliaDiDefault(page)
      await semina(page, [{ categoria: nomi.casa, cents: 90000, fissa: true, giorniFa: 8 }])

      // La premessa: e' davvero lo stato "fuori dal periodo" e non lo stato
      // vuoto. Senza, il resto misurerebbe l'altra copy.
      await expect(page.locator('.blank__title')).toHaveText(
        lingua.dizionario['stats.outside.title'],
      )
      // Derivata, come nel test che apre il ramo: qui la copy e' la stringa
      // grezza, a schermo i due buchi sono gia' pieni. E qui la premessa conta
      // il doppio, perche' e' cio' che rende una misura di **altezza** una
      // misura di questa copy: il testo interpolato non e' lungo come quello del
      // dizionario — `{range}` sono 7 caratteri e `17 – 23 Aug` ne sono 11 —
      // quindi va a capo un numero di volte diverso, ed e' proprio il numero di
      // capoversi che questo test sorveglia a 320 punti.
      await expect(page.locator('.blank__text')).toHaveText(
        conSegnaposti(lingua.dizionario['stats.outside.text']),
      )

      const misura = await page.evaluate(() => {
        const r = (n: number): number => Math.round(n * 100) / 100
        const stats = document.querySelector('.stats')
        if (stats === null) throw new Error('nessuna schermata delle Statistiche')
        const titolo = document.querySelector('.blank__title')!
        const testo = document.querySelector('.blank__text')!
        // Le stesse due domande del test qui sopra: un testo perde lettere in
        // altezza (se e' clampato) o in larghezza (se tronca). Qui nessuno dei
        // due dovrebbe scattare — va a capo quanto vuole.
        const tagliato = (el: Element): boolean =>
          el.scrollHeight > el.clientHeight + 0.5 || el.scrollWidth > el.clientWidth + 1
        return {
          righeTesto: r(testo.getBoundingClientRect().height),
          titolo: r(titolo.getBoundingClientRect().height),
          basso: r(testo.getBoundingClientRect().bottom),
          finestra: window.innerHeight,
          scroll: stats.scrollWidth - stats.clientWidth,
          scrollY: stats.scrollHeight - stats.clientHeight,
          tagli: [titolo, testo].filter(tagliato).map((el) => el.textContent ?? ''),
        }
      })

      console.log(
        `\n| 320 ${lingua.nome.padEnd(8)} | titolo ${misura.titolo}px | testo ` +
          `${misura.righeTesto}px | finisce a ${misura.basso} su ${misura.finestra} | ` +
          `scrollY ${misura.scrollY} |\n`,
      )

      expect(misura.tagli, 'la copy "fuori dal periodo" perde delle lettere').toEqual([])
      expect(misura.scroll, 'le Statistiche scorrono di lato').toBeLessThanOrEqual(0)
      expect(
        misura.basso,
        `il testo finisce a ${misura.basso} su una finestra da ${misura.finestra}`,
      ).toBeLessThanOrEqual(misura.finestra)
    })
  })
}

/**
 * **Dati ostili sul viewport piu' stretto: niente scorrimento orizzontale.**
 *
 * Il pavimento della colonna del grafico e' un `minmax()`, cioe' una richiesta
 * che la griglia soddisfa **anche a costo di traboccare**. A 320 punti — lo Zoom
 * schermo, il piu' stretto che questo progetto supporta — lo spazio e' 288 px, e
 * lo si mette alla prova da tutte e due le parti insieme: un nome che solo un
 * import puo' portare e un importo a sette cifre.
 *
 * Una schermata che scorre di lato su un telefono non e' un difetto estetico: e'
 * meta' dei numeri fuori dallo schermo, senza niente che lo dica.
 *
 * **Qui la lingua e' una sola, ed e' l'italiano perche' e' il caso peggiore per
 * *questa* domanda**: a contendersi lo spazio e' l'importo, e l'importo italiano
 * e' il piu' largo dei due (`507,00 €` 66,77 px contro `€507.00` 62,75). Sul
 * troncamento vale il contrario — li' a mancare e' lo spazio per il **nome**, e
 * il caso peggiore e' l'inglese: e' il test qui sopra, che infatti gira in tutte
 * e due le lingue.
 */
test('a 320 punti, con un nome da import e un importo a sette cifre, niente scroll orizzontale', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/')
  await chiudiGuida(page)
  await semina(
    page,
    // Tre righe per parte, cosi' che tutte e due restino grafici: la contesa per
    // lo spazio si vede solo dove una colonna del grafico c'e' davvero.
    [
      { categoria: 'Abbonamenti e cose che si rinnovano', cents: 123_456_789, fissa: true },
      { categoria: 'Sigarette', cents: 4500, fissa: true },
      { categoria: 'Svago', cents: 1200, fissa: true },
      { categoria: 'Spesa', cents: 99_999_999 },
      { categoria: 'Fuori', cents: 5070 },
      { categoria: 'Trasporti', cents: 1000 },
    ],
    { rinomina: [['Casa', 'Abbonamenti e cose che si rinnovano']] },
  )

  const misura = await page.evaluate(() => {
    const stats = document.querySelector('.stats')!
    const valore = document.querySelector('.stat__value')!
    return {
      stats: stats.scrollWidth - stats.clientWidth,
      pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      // L'importo **non tronca mai**: e' il valore esatto, ed e' cio' che rende
      // il grafico una tabella. Se traboccasse, il pavimento avrebbe vinto sulla
      // cosa sbagliata.
      valoreTroncato: valore.scrollWidth > valore.clientWidth,
      plot: Math.round(
        (document.querySelector('.stat__plot')?.getBoundingClientRect().width ?? 0) * 100,
      ) / 100,
    }
  })

  // Le due intestazioni di parte di A ci sono tutte e due: `Fisse in questo
  // periodo` e' l'etichetta piu' lunga della schermata, e a 320 punti sta
  // accanto a un totale a sette cifre. Se non ci stesse, sarebbe questa a
  // mandare la sezione fuori dal bordo.
  //
  // Il conto e' **dentro la prima sezione**, non su tutta la pagina: da quando
  // anche B porta il nome di cio' che conta, un conteggio globale direbbe due o
  // tre a seconda di quante settimane ci sono nei dati, cioe' misurerebbe la
  // finestra di B invece delle parti di A.
  await expect(page.locator('.stats__section').first().locator('.stats__partTitle')).toHaveCount(2)
  expect(misura.stats, 'le Statistiche scorrono di lato').toBeLessThanOrEqual(0)
  expect(misura.pagina, 'la pagina scorre di lato').toBeLessThanOrEqual(0)
  expect(misura.valoreTroncato, 'l\'importo e\' stato troncato').toBe(false)
  // E il grafico e' comunque al proprio pavimento, non sotto: e' il caso in cui
  // le due richieste si contendono lo spazio, ed e' l'etichetta a cedere.
  expect(misura.plot).toBeGreaterThanOrEqual(await plotMinPx(page))
})

/**
 * **Il test di identita' con la Home.** La riga del periodo corrente e la cifra
 * della Home sono la stessa quantita' calcolata una volta sola: se divergessero
 * nessuno se ne accorgerebbe, perche' entrambe sarebbero "corrette".
 *
 * Si confrontano **al carattere**, non due numeri arrotondati a mano.
 *
 * **La spesa della settimana scorsa e' una premessa, non un dato in piu'**: da
 * quando `TREND_MIN_ROWS` decide se la sezione **esiste** — e non piu' solo se
 * ha le barre — con un periodo solo B non c'e', e non ci sarebbe nessuna riga
 * corrente da confrontare. Non tocca il numero che si misura: cade in un altro
 * periodo, quindi la settimana di oggi vale 70,00 € con lei e senza.
 */
test('lo speso della riga corrente e lo stesso carattere di quello della Home', async ({ page }) => {
  await page.goto('/')
  await chiudiGuida(page)
  await semina(page, [
    { categoria: 'Fuori', cents: 4000 },
    { categoria: 'Spesa', cents: 2000 },
    { categoria: 'Casa', cents: 1000 },
    { categoria: 'Spesa', cents: 5500, giorniFa: 8 },
  ])

  const sezioni = page.locator('.stats__section')
  // Due sezioni: se B non ci fosse, `nth(1)` non esisterebbe e il test scadrebbe
  // in attesa invece di dire cosa manca.
  await expect(sezioni, 'B non e\' in scena: manca il periodo precedente').toHaveCount(2)
  const righePeriodo = sezioni.nth(1).locator('.stat')
  const ultima = righePeriodo.last()
  const daStatistiche = (await ultima.locator('.stat__value').innerText()).trim()

  await page.getByRole('button', { name: /^Home$/ }).click()
  // Tutta la sezione, non un elemento preciso: la Home mette lo speso nel numero
  // grande quando non c'e' budget e dentro la nota quando c'e' (`heroCopy`), e
  // il test non deve dipendere da quale dei due rami sta girando — dipende dal
  // fatto che il numero sia **quello**.
  const daHome = (await page.locator('.hero').innerText()).trim()

  expect(daStatistiche).not.toBe('')
  expect(daHome).toContain(daStatistiche)
})
