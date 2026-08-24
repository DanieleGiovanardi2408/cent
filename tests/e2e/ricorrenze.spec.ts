/**
 * Le spese fisse: il caso del brief dall'inizio alla fine, le tre porte che
 * scrivono (creare, modificare, riaccendere), le due che non scrivono
 * (spegnere, cancellare), e la sonda su ogni stato nuovo.
 *
 * ## I tre casi che si provano davvero, non per lettura
 *
 * 1. **La mezzanotte.** Anteprima alle 23:59:30, conferma alle 00:00:10:
 *    l'orologio si fissa, non si aspetta. Cio' che si guarda e' che l'app non
 *    scriva un'occorrenza in piu' di quelle annunciate, che lo dica con parole
 *    calme, e che i numeri rifatti siano gia' sotto gli occhi.
 * 2. **L'importo vero nel permesso.** Il foglio calcola il calendario con
 *    `amountCents: 1`; la regola sul **disco** deve portare 900 €, non 0,01 €.
 * 3. **La riaccensione di una regola dormiente**, che e' il terzo innesco della
 *    generazione retroattiva e il piu' silenzioso: gli arretrati si annunciano
 *    **prima**, non dopo.
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
import { fissaOrologio, giornoDichiarato, istanteLocale } from './clock'

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

/** Apre Impostazioni e la prima riga dell'elenco delle spese fisse. */
async function apriPrimaRegola(page: Page): Promise<void> {
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await page.locator('.fixed__row').first().tap()
  await expect(page.locator('.sheet--rule')).toBeVisible()
  await still(page)
}

/** Le regole sul **disco**: e' li' che si legge l'importo che il permesso ha scritto. */
async function regoleSuDisco(
  page: Page,
): Promise<readonly { id: string; amountCents: number; active: boolean; startDate: string }[]> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cent')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const all: { id: string; amountCents: number; active: boolean; startDate: string }[] =
      await new Promise((resolve, reject) => {
        const request = db.transaction('recurringRules').objectStore('recurringRules').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    db.close()
    return all
  })
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

  // --- **La regola scritta porta l'importo vero.** Il foglio calcola il
  //     proprio calendario con `amountCents: 1`, per non rifare 9.728
  //     occorrenze a ogni cifra, e quel calcolo porta con se' un permesso che
  //     autorizzerebbe a scrivere una regola da 0,01 €. Questa riga e' la prova
  //     che il permesso speso e' l'altro: quello rifatto al salvataggio, con i
  //     900 € dentro. Si legge dal **disco**, non dalla schermata.
  const regole = await regoleSuDisco(page)
  expect(regole).toHaveLength(1)
  expect(regole[0]?.amountCents).toBe(90_000)

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

test('l anteprima e di ieri: la scrittura rifiuta, lo dice, e i numeri sono gia rifatti', async ({
  page,
}) => {
  // **La mezzanotte, end-to-end.** L'orologio si fissa, non si aspetta: si apre
  // il foglio alle 23:59:30, si conferma alle 00:00:10, e cio' che si guarda e'
  // che l'app **non** scriva un'occorrenza in piu' di quelle annunciate.
  //
  // La giornaliera non e' un capriccio: con la mensile del brief il numero non
  // cambierebbe attraversando la mezzanotte (la prossima e' il 1 settembre), e
  // il test proverebbe la guardia senza provare il danno che evita. Dal 1
  // agosto, il 19 sono 19 occorrenze e il 20 sono 20.
  const vigilia = giornoDichiarato()
  expect(vigilia).toBe('2026-08-19')
  await page.clock.setFixedTime(istanteLocale(vigilia, '23:59:30'))

  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)
  await apriFoglioRegola(page)

  await digita(page, '500')
  await page.locator('.cad').nth(2).tap()
  await page.locator('.cats--pick .cat').first().tap()
  await page.locator('.starts .chip__input').fill('2026-08-01')

  const anteprima = page.locator('.rule__preview')
  await expect(anteprima).toContainText('19 spese arretrate')
  const conferma = page.locator('.rule__confirm')
  await conferma.tap()
  await expect(conferma).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.save')).toBeEnabled()

  // --- Mezzanotte, con il foglio aperto e la casella spuntata.
  await page.clock.setFixedTime(istanteLocale('2026-08-20', '00:00:10'))
  await page.locator('.save').tap()

  // --- Il foglio resta aperto e **niente e' stato scritto**: l'unica cosa
  //     peggiore di non scrivere sarebbe scrivere venti spese dopo averne
  //     annunciate diciannove.
  await expect(page.locator('.sheet--rule')).toBeVisible()
  expect(await regoleSuDisco(page)).toHaveLength(0)

  // --- La copy del rifiuto: nomina il giorno di ieri (che si scrive solo
  //     sapendo anche qual e' oggi) e offre il ricalcolo invece di annunciare
  //     solo il no.
  const rifiuto = page.locator('.sheet__hint--long')
  await expect(rifiuto).toBeVisible()
  await expect(rifiuto).toContainText('ieri')
  await expect(rifiuto).toContainText('ricontrolla e conferma')

  // --- E i numeri sono gia' rifatti sul giorno nuovo, con la casella spenta da
  //     sola: cio' che era stato confermato non e' piu' cio' che verrebbe
  //     scritto.
  await expect(anteprima).toContainText('20 spese arretrate')
  await expect(conferma).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.save')).toBeDisabled()

  // --- Riconfermato il numero nuovo, la scrittura passa. E ne scrive venti.
  await conferma.tap()
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  await expect
    .poll(async () => (await speseSuDisco(page)).length, { timeout: 10_000 })
    .toBe(20)
  const regole = await regoleSuDisco(page)
  expect(regole[0]?.amountCents).toBe(500)
})

test('riaccendere una regola dormiente annuncia gli arretrati prima, non dopo', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  // --- Il canone del brief: 900 al mese dal 1 gennaio, otto arretrate.
  await apriFoglioRegola(page)
  await digita(page, '90000')
  await page.locator('.cats--pick .cat').filter({ hasText: 'Casa' }).tap()
  await page.locator('.starts .chip__input').fill('2026-01-01')
  await page.locator('.rule__confirm').tap()
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  await expect.poll(async () => (await speseSuDisco(page)).length, { timeout: 10_000 }).toBe(8)

  // --- Si spegne, e spegnere **non chiede niente**: e' l'unica direzione che
  //     non puo' generare una spesa, ed e' l'uscita che il rifiuto della
  //     cancellazione suggerisce. Un tap solo, e si annulla dal toast.
  await apriPrimaRegola(page)
  await page.locator('.rule__second').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  await expect(page.locator('.toast__box')).toContainText('non creerà altre spese')
  await expect(page.locator('.fixed__note').first()).toContainText('spenta')
  await expect.poll(async () => (await regoleSuDisco(page))[0]?.active).toBe(false)

  // --- Due mesi dopo. Una regola spenta non genera: le spese restano otto, ed
  //     e' proprio questo che rende il risveglio pericoloso.
  await page.clock.setFixedTime(istanteLocale('2026-10-19', '10:00:00'))
  await page.reload()
  await expect(page.locator('.fab')).toBeEnabled()
  await expect.poll(async () => (await speseSuDisco(page)).length).toBe(8)

  // --- Si riapre, e **prima di qualunque tap** il piede dichiara i due mesi di
  //     arretrato. Chi riaccende si aspetta "da adesso"; qui legge il vero.
  await apriPrimaRegola(page)
  await expect(page.locator('.sheet__hint')).toHaveText('Guarda cosa succede quando la riaccendi')
  const anteprima = page.locator('.rule__preview')
  await expect(anteprima).toContainText('2 spese arretrate')
  await expect(anteprima).toContainText('1 settembre')
  await expect(anteprima).toContainText('1 ottobre')
  await expect(anteprima).toContainText('1800,00')
  // Il bottone dice cosa scrive, e finche' la casella e' vuota e' spento.
  const conferma = page.locator('.rule__confirm')
  await expect(conferma).toBeVisible()
  await expect(page.locator('.save')).toBeDisabled()
  await expect(page.locator('.save')).toContainText('2 spese')

  await conferma.tap()
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  await expect(page.locator('.toast__box')).toContainText('2 spese create')
  await expect.poll(async () => (await speseSuDisco(page)).length, { timeout: 10_000 }).toBe(10)

  const date = (await speseSuDisco(page)).map((e) => e.date).sort()
  expect(date.slice(-2)).toEqual(['2026-09-01', '2026-10-01'])
})

test('cancellare si puo solo finche non ha creato niente, e il rifiuto porta il numero', async ({
  page,
}) => {
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  // --- Una regola che parte il mese prossimo: non ha ancora creato niente.
  await apriFoglioRegola(page)
  await digita(page, '1200')
  await page.locator('.cats--pick .cat').first().tap()
  await page.locator('.starts .chip__input').fill('2026-09-01')
  // Nessun arretrato, quindi nessuna conferma: il pedaggio l'ha pagato il
  // codice, all'utente non e' costato un tap.
  await expect(page.locator('.rule__confirm')).toHaveCount(0)
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)

  // La riga c'e' anche se non pesa sul mese, e dice perche'.
  await page.locator('.app__action').tap()
  await expect(page.locator('.fixed__note').first()).toContainText('parte: 1 settembre')

  // --- Il bottone che cancella esiste perche' il piano lo permette.
  await page.locator('.fixed__row').first().tap()
  await expect(page.locator('.sheet--rule')).toBeVisible()
  await still(page)
  await expect(page.locator('.danger__action')).toBeVisible()
  await page.locator('.danger__action').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  await expect(page.locator('.toast__box')).toContainText('cancellata')
  await expect.poll(async () => (await regoleSuDisco(page)).length).toBe(0)
  await expect(page.locator('#prefs-fixed').locator('..')).toContainText('Non hai spese fisse')

  // --- E adesso una che ha gia' creato: il bottone non c'e', e al suo posto ci
  //     sono le parole con dentro il numero vero. Il piano si chiede **prima**
  //     di disegnare, come per le categorie.
  await page.locator('.prefs__action').filter({ hasText: /spesa fissa/i }).tap()
  await expect(page.locator('.sheet--rule')).toBeVisible()
  await still(page)
  await digita(page, '90000')
  await page.locator('.cats--pick .cat').first().tap()
  await page.locator('.starts .chip__input').fill('2026-01-01')
  await page.locator('.rule__confirm').tap()
  await page.locator('.save').tap()
  await expect.poll(async () => (await speseSuDisco(page)).length, { timeout: 10_000 }).toBe(8)

  await page.locator('.fixed__row').first().tap()
  await expect(page.locator('.sheet--rule')).toBeVisible()
  await still(page)
  await expect(page.locator('.danger__action')).toHaveCount(0)
  const rifiuto = page.locator('.danger .editor__note')
  await expect(rifiuto).toContainText('8 spese')
  // L'uscita che quel rifiuto suggerisce, e che sta li' accanto senza niente
  // davanti.
  await expect(rifiuto).toContainText('Disattivala')
  await expect(page.locator('.rule__second')).toBeVisible()
})

test('modificare l importo passa dall anteprima; cambiare la categoria no', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  // Una regola che parte oggi: una sola spesa, nessun arretrato.
  await apriFoglioRegola(page)
  await digita(page, '4500')
  await page.locator('.cats--pick .cat').filter({ hasText: 'Casa' }).tap()
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  await expect.poll(async () => (await speseSuDisco(page)).length, { timeout: 10_000 }).toBe(1)

  // --- Si riapre **con dentro quello che c'e' scritto**: importo, cadenza,
  //     data e categoria. Un foglio di modifica che riparte da zero e' un
  //     foglio in cui ogni modifica e' un reinserimento.
  await apriPrimaRegola(page)
  await expect(page.locator('.amount')).toContainText('45,00')
  await expect(page.locator('.cad').first()).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.cats--pick .cat').filter({ hasText: 'Casa' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.sheet__hint')).toHaveText('Cambia quello che serve, poi tocca Salva')
  // Gia' materializzata e in pari: non c'e' niente da recuperare, e dire
  // "Prima spesa: oggi" sarebbe una frase su una spesa gia' scritta.
  await expect(page.locator('.rule__preview')).toHaveText('Non c’è niente da recuperare.')
  await expect(page.locator('.rule__confirm')).toHaveCount(0)

  // --- L'importo sta col calendario, e passa dalla porta con il pedaggio: non
  //     genera niente, ma e' dentro il totale annunciato.
  await page.locator('.pad__key--erase').first().tap()
  await page.locator('.pad__key').filter({ hasText: '9' }).first().tap()
  await expect(page.locator('.amount')).toContainText('45,09')
  // La categoria cambia insieme, e passa dall'altra porta.
  await page.locator('.cats--pick .cat').filter({ hasText: 'Spesa' }).tap()
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  await expect(page.locator('.toast__box')).toContainText('aggiornata')

  await expect.poll(async () => (await regoleSuDisco(page))[0]?.amountCents).toBe(4509)
  // La spesa gia' generata **non** cambia: la storia non si riscrive
  // retroattivamente.
  expect((await speseSuDisco(page))[0]?.amountCents).toBe(4500)
})

test('la sonda sui tre stati nuovi: elenco toccabile, modifica, riaccensione', async ({
  page,
}, testInfo) => {
  // Gli stati che questa consegna aggiunge, e la regola "Sovrapposizioni" non
  // ha eccezioni. Due sono nuovi bersagli (la riga dell'elenco, "Disattiva") e
  // uno e' il foglio piu' alto che l'app sappia produrre: modifica **con**
  // l'arretrato da confermare **e** il blocco del rifiuto della cancellazione
  // in fondo al corpo. Se qualcosa deve finire sotto la linea di
  // galleggiamento, finisce li'.
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

  await apriFoglioRegola(page)
  await digita(page, '90000')
  await page.locator('.cats--pick .cat').filter({ hasText: 'Casa' }).tap()
  await page.locator('.starts .chip__input').fill('2026-01-01')
  await page.locator('.rule__confirm').tap()
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  await expect.poll(async () => (await speseSuDisco(page)).length, { timeout: 10_000 }).toBe(8)

  // 1. L'elenco con una riga che adesso **si tocca**: e' un bersaglio nuovo, e
  //    dev'essere alto 44 come tutti gli altri.
  //
  //    Si aspetta che il toast se ne vada prima di misurare: e' una banda in
  //    flusso, non un overlay, quindi accorcia il contenitore che scorre e
  //    manda fuori dalla parte visibile una dozzina di bersagli che nessuno sta
  //    guardando. Non sarebbe un fallimento — la sonda li conta "ritagliati" —
  //    ma sarebbe una riga di rapporto che dice meno di quanto sembra.
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
  await expect(page.locator('.toast__box')).toHaveCount(0)
  await still(page)
  await check('Impostazioni, una spesa fissa in elenco')

  // 2. Il foglio di modifica: due bersagli nel piede invece di uno, e in fondo
  //    al corpo il rifiuto della cancellazione con dentro il numero.
  await page.locator('.fixed__row').first().tap()
  await expect(page.locator('.sheet--rule')).toBeVisible()
  await still(page)
  await expect(page.locator('.rule__second')).toBeVisible()
  await check('foglio di una spesa fissa esistente')

  // 3. La stessa schermata con la data d'inizio spostata **all'indietro di un
  //    anno e mezzo**, e nessuna conferma: il motore riparte dal segnaposto,
  //    non da `startDate`, quindi li' non si genera niente e non c'e' niente da
  //    confermare. E' ADR 017 §4 verificato dove si vede — una conferma che
  //    comparisse anche qui insegnerebbe a saltarla dove conta.
  await page.locator('.starts .chip__input').fill('2025-01-01')
  await still(page)
  await expect(page.locator('.rule__preview')).toHaveText('Non c’è niente da recuperare.')
  await expect(page.locator('.rule__confirm')).toHaveCount(0)
  await check('foglio di modifica, data spostata indietro')

  // 4. Lo stato piu' alto che l'app sappia produrre: la regola spenta e
  //    riaperta **due mesi dopo**, cioe' con la casella che dichiara
  //    l'arretrato dentro un foglio che ha gia' il blocco della cancellazione
  //    in fondo al corpo. La casella e' cio' che dichiara: se scivolasse fuori,
  //    la conferma esplicita diventerebbe una conferma saltabile senza vederla.
  //
  //    Il tap su "Disattiva" chiude il foglio e butta via la data non salvata:
  //    la regola resta quella di prima.
  await page.locator('.rule__second').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  await page.clock.setFixedTime(istanteLocale('2026-10-19', '10:00:00'))
  await page.reload()
  await expect(page.locator('.fab')).toBeEnabled()
  await page.locator('.app__action').tap()
  await page.locator('.fixed__row').first().tap()
  await expect(page.locator('.sheet--rule')).toBeVisible()
  await expect(page.locator('.rule__confirm')).toBeVisible()
  await still(page)
  await check('foglio di una spesa fissa spenta, con due mesi di arretrato')

  console.log(`\n${rows.join('\n')}\n`)

  expect(
    failures.map((t) => `${t.status}: ${t.label} (${t.rect}) risponde ${t.hit}`),
    'un overlay copre un bersaglio, o un bersaglio e\' sotto i 44px',
  ).toEqual([])

  const scroll = await page.evaluate(() => {
    const box = (selector: string): number => {
      const el = document.querySelector(selector)
      return el === null ? 0 : el.scrollWidth - el.clientWidth
    }
    return {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sheet: box('.sheet--rule'),
      body: box('.rule'),
      prefs: box('.prefs'),
    }
  })
  expect(scroll.page, 'c\'e\' scroll orizzontale in pagina').toBeLessThanOrEqual(0)
  expect(scroll.sheet, 'c\'e\' scroll orizzontale nel foglio').toBeLessThanOrEqual(0)
  expect(scroll.body, 'c\'e\' scroll orizzontale nel corpo del foglio').toBeLessThanOrEqual(0)
  expect(scroll.prefs, 'c\'e\' scroll orizzontale in Impostazioni').toBeLessThanOrEqual(0)

  // Il piede resta intero anche nel foglio piu' alto: l'anteprima, la conferma
  // e i due bottoni si vedono tutti, sopra la piega.
  for (const selector of ['.rule__preview', '.save']) {
    const dentro = await page.locator(selector).evaluate((el) => {
      const box = el.getBoundingClientRect()
      return box.bottom <= innerHeight + 0.5 && box.top >= 0
    })
    expect(dentro, `${selector} non e' interamente dentro il viewport`).toBe(true)
  }
})

test('spegnere si annulla dal toast, e l annullamento non duplica niente', async ({ page }) => {
  // Spegnere non e' distruttivo, ma e' comunque annullabile: qui la rete non e'
  // un caso fortunato, e' una proprieta' del motore. Spegnere **non muove il
  // segnaposto**, quindi riaccendere entro i sei secondi del toast riapre
  // esattamente la finestra che c'era prima del tap — niente da annunciare,
  // perche' niente e' cambiato.
  await page.goto('./')
  await expect(page.locator('.fab')).toBeEnabled()
  await chiudiGuida(page)

  await apriFoglioRegola(page)
  await digita(page, '4500')
  await page.locator('.cats--pick .cat').first().tap()
  await page.locator('.save').tap()
  await expect(page.locator('.sheet--rule')).toHaveCount(0)
  await expect.poll(async () => (await speseSuDisco(page)).length, { timeout: 10_000 }).toBe(1)

  await apriPrimaRegola(page)
  await page.locator('.rule__second').tap()
  await expect(page.locator('.toast__box')).toContainText('non creerà altre spese')
  await expect.poll(async () => (await regoleSuDisco(page))[0]?.active).toBe(false)

  await page.locator('.toast__action').tap()
  await expect(page.locator('.toast__box')).toContainText('torna a creare spese')
  await expect.poll(async () => (await regoleSuDisco(page))[0]?.active).toBe(true)
  // Nessun duplicato: l'identita' di un'occorrenza e' funzione di (regola,
  // giorno), quindi la materializzazione che segue non ha niente da scrivere.
  await expect.poll(async () => (await speseSuDisco(page)).length).toBe(1)
})
