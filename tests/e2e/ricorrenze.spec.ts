/**
 * Le spese fisse: il caso del brief, dall'inizio alla fine, e la sonda sui
 * **quattro stati nuovi** che questa consegna porta.
 *
 * ## Il caso del brief
 *
 * *"Affitto, 900, mensile, dal 1 gennaio"* creata il 19 agosto scrive **otto**
 * spese per 7.200 € e riscrive i totali di otto periodi passati. Le date passate
 * sono legittime, quindi non si vietano: **si dichiara cosa succede** e si chiede
 * conferma. Questo file prova la catena intera — anteprima con i numeri giusti,
 * conferma esplicita, otto spese nello Storico **ai giorni giusti**, e la Home
 * che dice un numero sensato nel mese in cui il canone e' uscito.
 *
 * ## Perche' anche la sonda
 *
 * Perche' sono stati nuovi, e la regola "Sovrapposizioni" non ha eccezioni. Il
 * foglio della regola e' il piu' alto dell'app — cinque blocchi piu' un piede a
 * tre righe — e il suo piede contiene **cio' che conferma**: se il corpo
 * crescesse (una lingua piu' lunga, un telefono corto), il primo pezzo a finire
 * sotto la linea di galleggiamento sarebbe proprio la casella che dichiara gli
 * otto arretrati. E' esattamente il difetto che la sonda esiste per prendere.
 *
 * ## Le premesse
 *
 * Orologio fissato prima di ogni `goto` (`clock.ts`): **tutto** questo file
 * dipende da "oggi" — quante occorrenze arretrate, quale mese guarda la Home,
 * se la conferma compare. Con l'orologio ereditato, un run notturno misurerebbe
 * un numero di occorrenze diverso da quello atteso e si leggerebbe come una
 * regressione del motore.
 */
import { chiudiGuida, expect, test } from './installed'
import type { Page } from '@playwright/test'
import { probe, report } from './probe'
import type { Target } from './probe'
import { fissaOrologio, giornoDichiarato } from './clock'

test.beforeEach(async ({ page }) => {
  await fissaOrologio(page)
})

/** Aspetta che le animazioni siano finite, non che sia passato del tempo. */
async function still(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)))
  })
}

/** Digita un importo sul tastierino custom, cents-first. */
async function digita(page: Page, cifre: string): Promise<void> {
  for (const cifra of cifre) {
    await page.locator(`.pad__key:not(.pad__key--erase)`).filter({ hasText: cifra }).first().tap()
  }
}

/** Apre Impostazioni e il foglio "nuova spesa fissa". */
async function apriFoglioRegola(page: Page): Promise<void> {
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await page.locator('.prefs__action').filter({ hasText: /spesa fissa/i }).tap()
  await expect(page.locator('.sheet--rule')).toBeVisible()
  await still(page)
}

/** Le spese sul **disco**, non nel mirror: id, data, importo, provenienza. */
async function speseSuDisco(
  page: Page,
): Promise<readonly { id: string; date: string; amountCents: number; source: string }[]> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cent')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all: { id: string; date: string; amountCents: number; source: string }[] =
      await new Promise((resolve, reject) => {
        const request = db.transaction('expenses').objectStore('expenses').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    db.close()
    return all
  })
}

test('il caso del brief: 900 al mese dal 1 gennaio, dichiarato, confermato, e otto spese ai giorni giusti', async ({
  page,
}) => {
  // La premessa dichiarata: mercoledi' 19 agosto 2026. Da gennaio ad agosto
  // compresi sono otto primi-del-mese.
  expect(giornoDichiarato()).toBe('2026-08-19')

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  // --- Un budget mensile, perche' la Home guardi il mese in cui il canone
  //     esce. Senza, la Home guarda la settimana (17–23 agosto), dove il 1
  //     agosto non c'e' e non ci sarebbe niente da dichiarare.
  await page.locator('.budget').tap()
  await expect(page.locator('.sheet--budget')).toBeVisible()
  await still(page)
  await page.locator('.period').nth(1).tap()
  await digita(page, '20000')
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--budget')).toHaveCount(0)

  await apriFoglioRegola(page)

  // --- Senza importo il piede tace: non c'e' niente da moltiplicare, e "0,00 €
  //     in totale" sarebbe un numero vero e privo di senso.
  await expect(page.locator('.rule__preview')).toHaveText('')
  await expect(page.locator('.save')).toBeDisabled()

  // --- 900,00 €, cents-first: 9 0 0 0 0.
  await digita(page, '90000')
  await expect(page.locator('.amount')).toContainText('900')

  // --- La categoria si **seleziona**: qui il chip non salva (ADR 004 non vale
  //     qui, vedi RuleSheet.tsx).
  const casa = page.locator('.cats--pick .cat').filter({ hasText: 'Casa' })
  await casa.tap()
  await expect(casa).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.sheet--rule')).toBeVisible()

  // --- Da oggi: nessuna conferma, ed e' il ramo che tiene onesto l'altro. Una
  //     conferma che compare sempre smette di essere letta.
  await expect(page.locator('.rule__preview')).toHaveText('Prima spesa: oggi.')
  await expect(page.locator('.rule__confirm')).toHaveCount(0)
  await expect(page.locator('.save')).toBeEnabled()

  // --- Il mensile e' gia' selezionato: e' il caso reale, e il caso reale non
  //     deve costare un tap.
  await expect(page.locator('.cad').first()).toHaveAttribute('aria-pressed', 'true')

  // --- E adesso la data nel passato. Legittima: e' cosi' che si registra un
  //     affitto che esiste da mesi.
  await page.locator('.starts .chip__input').fill('2026-01-01')

  // --- L'anteprima, con i numeri. Sono i tre che decidono: quante, da quando a
  //     quando, quanto in tutto.
  const anteprima = page.locator('.rule__preview')
  await expect(anteprima).toContainText('8 spese arretrate')
  await expect(anteprima).toContainText('1 gennaio')
  await expect(anteprima).toContainText('1 agosto')
  await expect(anteprima).toContainText('7200,00')

  // --- E la conferma, che prima non c'era. Finche' non e' spuntata, il bottone
  //     che scrive e' **spento**: e' un bersaglio diverso da quello che salva,
  //     apposta, perche' un doppio tocco su "Crea" non possa attraversarla.
  const conferma = page.locator('.rule__confirm')
  await expect(conferma).toBeVisible()
  await expect(conferma).toHaveAttribute('aria-checked', 'false')
  await expect(conferma).toContainText('8 spese arretrate')
  await expect(page.locator('.save')).toBeDisabled()

  // --- Il bottone dice cosa scrive, non "Salva".
  await expect(page.locator('.save')).toContainText('8')
  await expect(page.locator('.save')).toContainText('7200,00')

  await conferma.tap()
  await expect(conferma).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.save')).toBeEnabled()

  // --- La conferma **decade a ogni modifica**. Senza, si potrebbe confermare
  //     "8 spese, 7.200 €" e salvarne 231 passando alla cadenza giornaliera.
  await page.locator('.cad').nth(2).tap()
  await expect(conferma).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.save')).toBeDisabled()

  // --- E **non torna da sola** rimettendo le cose com'erano. La bozza e'
  //     identica a quella confermata un momento fa, quindi la firma
  //     corrisponderebbe di nuovo: una casella che si spunta senza che nessuno
  //     l'abbia toccata e' l'ultima cosa da mettere dentro una conferma. Questa
  //     riga e' il difetto che il test ha trovato, tenuto fermo.
  await page.locator('.cad').first().tap()
  await expect(page.locator('.rule__preview')).toContainText('8 spese arretrate')
  await expect(conferma).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.save')).toBeDisabled()

  await conferma.tap()
  await expect(page.locator('.save')).toBeEnabled()

  await page.locator('.save').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  // Il toast porta il numero confermato: chiude il giro fra quello che si e'
  // letto e quello che e' successo.
  await expect(page.locator('.toast__box')).toContainText('8 spese create')

  // --- Otto spese, **ai giorni giusti**, sul disco. Non nove, non sette, e non
  //     il 3 marzo: il primo di ogni mese da gennaio ad agosto.
  await expect
    .poll(async () => (await speseSuDisco(page)).length, {
      message: 'la materializzazione non ha scritto le otto occorrenze',
      timeout: 10_000,
    })
    .toBe(8)

  const spese = await speseSuDisco(page)
  expect(spese.map((e) => e.date).sort()).toEqual([
    '2026-01-01',
    '2026-02-01',
    '2026-03-01',
    '2026-04-01',
    '2026-05-01',
    '2026-06-01',
    '2026-07-01',
    '2026-08-01',
  ])
  expect(spese.every((e) => e.amountCents === 90_000)).toBe(true)
  expect(spese.every((e) => e.source === 'recurring')).toBe(true)
  // Identita' deterministica (ADR 006): l'id e' funzione della coppia
  // (regola, giorno), non un UUID. E' cio' che rende la materializzazione
  // idempotente, e si vede da qui.
  expect(spese.every((e) => e.id.startsWith('rec:'))).toBe(true)

  // --- Idempotenza dal lato dell'utente: riaprire l'app non crea duplicati.
  await page.reload()
  await expect(page.locator('.fab')).toBeEnabled()
  await expect.poll(async () => (await speseSuDisco(page)).length).toBe(8)

  // --- Lo Storico le mostra **tutte** (sono spese vere) e si vede da dove
  //     arrivano.
  await page.locator('.nav__tab').nth(1).tap()
  await expect(page.locator('.list')).toBeVisible()
  const righe = page.locator('.row')
  await expect(righe.first()).toContainText('900')
  // Il segno discreto, non un badge urlato. C'e' su ognuna, e ha un nome che si
  // legge anche senza vedere l'icona.
  await expect(page.locator('.row__fixed').first()).toBeVisible()
  await expect(page.locator('.row').first()).toContainText('spesa fissa')

  // --- E la Home: il numero grande **non** conta il canone, e lo dice.
  await page.locator('.nav__tab').first().tap()
  await expect(page.locator('.hero__value')).toBeVisible()
  // 200,00 € di budget mensile, zero spese manuali: restano 200,00 €. Senza
  // ADR 016 il numero sarebbe -700,00 € e la riga "puoi spendere ~X al giorno"
  // — il numero piu' utile dell'app — sarebbe morta per sempre il primo del
  // mese.
  await expect(page.locator('.hero__value')).toContainText('200,00')
  await expect(page.locator('.hero__value')).not.toHaveAttribute('data-tone', 'over')
  // **L'esclusione e' dichiarata**: un numero giusto di cui non si sa cosa non
  // conta e' un numero che mente per omissione (ADR 016 §2).
  await expect(page.locator('.hero__fixed')).toHaveText('oltre a 900,00 € di spese fisse')

  // --- Impostazioni: i due numeri, uno sotto l'altro.
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await expect(page.locator('#prefs-budget').locator('..')).toContainText('200,00')
  const fisse = page.locator('#prefs-fixed').locator('..')
  await expect(fisse).toContainText('900,00')
  await expect(fisse).toContainText('al mese')
  // Una mensile e' esatta: nessun avviso sulla media, o si imparerebbe a
  // saltarlo quando invece serve.
  await expect(page.locator('.prefs__text--rate')).toHaveCount(0)
  await expect(page.locator('.fixed__row')).toHaveCount(1)
  await expect(page.locator('.fixed__note')).toHaveText('ogni mese')
})

test('senza spese fisse nel periodo la Home non annuncia niente', async ({ page }) => {
  // Il ramo simmetrico, e senza di lui l'altro non vale: annunciare
  // un'esclusione dove non ha tolto niente e' lo stesso difetto di una
  // spiegazione senza un fatto da spiegare.
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  await expect(page.locator('.hero__fixed')).toHaveText('')
  // La riga occupa il suo spazio comunque: compare e sparisce con il periodo
  // (la settimana del canone si', quella dopo no), quindi la riserva evita un
  // salto ricorrente, non uno all'apertura.
  const alta = await page.locator('.hero__fixed').evaluate((el) => el.getBoundingClientRect().height)
  expect(alta).toBeGreaterThan(10)
})

test('la sonda sui quattro stati nuovi delle spese fisse', async ({ page }, testInfo) => {
  const viewport = `${testInfo.project.use.viewport?.width}x${testInfo.project.use.viewport?.height}`
  const rows: string[] = []
  const failures: Target[] = []

  const check = async (state: string): Promise<void> => {
    const targets = await probe(page)
    expect(targets.length, `nessun bersaglio misurato in "${state}": la sonda non prova niente`)
      .toBeGreaterThan(0)
    rows.push(...report(viewport, state, targets))
    failures.push(...targets.filter((t) => t.status === 'coperto' || t.status === 'piccolo'))
  }

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  // 1. Impostazioni senza nessuna regola: lo stato vuoto ha copy vero, non una
  //    riga vuota.
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await still(page)
  await expect(page.locator('#prefs-fixed').locator('..')).toContainText('Non hai spese fisse')
  await check('Impostazioni, nessuna spesa fissa')

  // 2. Il foglio appena aperto: importo a zero, nessuna categoria, il bottone
  //    spento e il piede muto.
  await page.locator('.prefs__action').filter({ hasText: /spesa fissa/i }).tap()
  await expect(page.locator('.sheet--rule')).toBeVisible()
  await still(page)
  await check('foglio nuova spesa fissa, vuoto')

  // 3. Il foglio completo, senza arretrato: nessuna casella di conferma.
  await digita(page, '90000')
  await page.locator('.cats--pick .cat').first().tap()
  await still(page)
  await expect(page.locator('.rule__confirm')).toHaveCount(0)
  await check('foglio completo, regola che parte oggi')

  // 4. Il foglio con l'arretrato: la casella c'e', ed e' il bersaglio che la
  //    sonda deve trovare **intero e raggiungibile**. Se il piede scivolasse
  //    fuori, la conferma esplicita diventerebbe una conferma che si puo'
  //    saltare senza vederla.
  await page.locator('.starts .chip__input').fill('2026-01-01')
  await expect(page.locator('.rule__confirm')).toBeVisible()
  await still(page)
  await check('foglio con otto spese arretrate da confermare')

  console.log(`\n${rows.join('\n')}\n`)

  expect(
    failures.map((t) => `${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`),
    'un overlay copre un bersaglio, o un bersaglio e\' sotto i 44px',
  ).toEqual([])

  // Esatti, ma con una premessa che dipende dal font (vedi overlays.spec.ts).
  const scroll = await page.evaluate(() => {
    const box = (selector: string): number => {
      const el = document.querySelector(selector)
      return el === null ? 0 : el.scrollWidth - el.clientWidth
    }
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sheet: box('.sheet--rule'),
      body: box('.rule'),
    }
  })
  expect(scroll.page, 'c\'e\' scroll orizzontale in pagina').toBeLessThanOrEqual(0)
  expect(scroll.sheet, 'c\'e\' scroll orizzontale nel foglio').toBeLessThanOrEqual(0)
  expect(scroll.body, 'c\'e\' scroll orizzontale nel corpo del foglio').toBeLessThanOrEqual(0)
})

test('a 390x844 il foglio della spesa fissa ci sta tutto, senza scroll verticale', async ({
  page,
}, testInfo) => {
  // Il viewport di riferimento. Sugli altri due lo scroll e' ammesso — non e'
  // il percorso dei due tap — ma qui deve stare tutto, o le cinque decisioni si
  // leggono a pezzi.
  test.skip(testInfo.project.name !== 'iphone-14', 'misura il viewport di riferimento')

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)
  await page.locator('.app__action').tap()
  await page.locator('.prefs__action').filter({ hasText: /spesa fissa/i }).tap()
  await expect(page.locator('.sheet--rule')).toBeVisible()
  await still(page)

  // Lo stato **piu' alto**: con la casella di conferma dentro, che e' quella
  // che il piede riserva sempre.
  await digita(page, '90000')
  await page.locator('.cats--pick .cat').first().tap()
  await page.locator('.starts .chip__input').fill('2026-01-01')
  await expect(page.locator('.rule__confirm')).toBeVisible()
  await still(page)

  const misure = await page.evaluate(() => {
    const body = document.querySelector('.rule')
    const sheet = document.querySelector('.sheet--rule')
    return {
      scrolla: body === null ? 0 : body.scrollHeight - body.clientHeight,
      alto: sheet === null ? 0 : sheet.getBoundingClientRect().height,
      finestra: innerHeight,
    }
  })
  expect(misure.scrolla, 'il corpo del foglio scorre a 390x844').toBeLessThanOrEqual(0)
  expect(misure.alto, 'il foglio sfonda il viewport').toBeLessThanOrEqual(misure.finestra)

  // E il piede resta intero: l'anteprima, la conferma e il bottone si vedono
  // tutti e tre, sopra la piega.
  for (const selector of ['.rule__preview', '.rule__confirm', '.save']) {
    const dentro = await page.locator(selector).evaluate((el) => {
      const box = el.getBoundingClientRect()
      return box.bottom <= innerHeight + 0.5 && box.top >= 0
    })
    expect(dentro, `${selector} non e' interamente dentro il viewport`).toBe(true)
  }
})
