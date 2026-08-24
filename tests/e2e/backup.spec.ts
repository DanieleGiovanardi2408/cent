/**
 * I due rami che decidono **se il promemoria di backup dice la verita'**.
 *
 * ## Il buco che questo file chiude
 *
 * `navigator.share` non esiste in Chromium headless. Non e' spento: non c'e'
 * proprio, quindi `tryShare` esce subito con `unavailable` e ogni esecuzione
 * della suite ha sempre e solo preso il ramo `downloaded`. Il ramo `shared` —
 * **l'unico che scrive `lastBackupAt`** — non era esercitato da nessun test, in
 * nessun progetto, mai. Lo stesso per `clipboard.writeText`, che e' l'altro dei
 * due soli esiti che l'app osserva davvero.
 *
 * Non e' un ramo qualunque. `lastBackupAt` e' l'input del promemoria dei 14
 * giorni, e CLAUDE.md dice come deve sbagliare: **un indicatore di sicurezza che
 * puo' sbagliare deve sbagliare verso l'allarme**. Un banner che tace a torto
 * lascia senza copia chi crede di averla; uno che insiste a torto fa perdere
 * dieci secondi. I due errori non hanno lo stesso prezzo, quindi il test non
 * chiede "scrive la data": chiede **su quali esiti la scrive e su quali no**.
 *
 * ## Perche' due casi e non uno
 *
 * Perche' l'unico che conta e' il secondo. Che una condivisione riuscita scriva
 * la data e' la parte facile e non ha mai fatto male a nessuno. Quella che fa
 * danno e' l'altra: **l'utente apre il foglio di condivisione e annulla.**
 * Annullare un backup non e' averlo fatto — e se l'app lo registrasse lo stesso,
 * il promemoria tacerebbe per due settimane su un telefono senza copia. E'
 * esattamente il difetto contro cui la regola e' stata scritta, quindi e' il
 * caso che va tenuto sotto un test e non sotto un commento.
 *
 * Il terzo caso c'e' perche' e' il piu' subdolo dei tre: `share` che rifiuta per
 * un **motivo che non e' l'annullamento** (`NotAllowedError`, un target che non
 * accetta i file). Li' il codice ripiega sul download, ed e' giusto — ma se
 * qualcuno un giorno unificasse i due rifiuti in uno solo, l'annullamento
 * diventerebbe un download mai chiesto **oppure** il fallimento diventerebbe un
 * "condiviso" mai avvenuto, a seconda del verso in cui li unifica. Un test per
 * ognuno dei tre esiti fa cadere la fusione da qualunque parte arrivi.
 *
 * ## Perche' l'asserzione e' sul disco e non sullo schermo
 *
 * Il toast dice cosa l'app crede; `lastBackupAt` e' cio' che sopravvive alla
 * chiusura, ed e' l'unica cosa che il promemoria leggera' fra due settimane. Si
 * guardano entrambi — il testo per chi legge il fallimento, il record per la
 * cosa vera.
 *
 * ## Dove gira
 *
 * Su un solo viewport: quale ramo prende l'export non dipende da quanto e' largo
 * lo schermo. Vedi `SENZA_GEOMETRIA` in `playwright.config.ts`.
 */
import { chiudiGuida, expect, test } from './installed'
import { fissaOrologio } from './clock'
import type { Page } from '@playwright/test'

/**
 * `lastBackupAt` **sul disco**, non nel mirror.
 *
 * Il mirror e' una cache (CLAUDE.md): una scrittura ottimistica lo muove nel
 * frame del tap anche quando IndexedDB non l'accettera' mai. Il promemoria di
 * fra due settimane legge il disco, quindi e' il disco che va guardato.
 */
async function lastBackupSuDisco(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('cent')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const record: { lastBackupAt?: string } | undefined = await new Promise((resolve, reject) => {
      const request = db.transaction('settings').objectStore('settings').get('settings')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return record?.lastBackupAt ?? null
  })
}

/** Quello che la sezione "I tuoi dati" dice **adesso**, cioe' dal mirror. */
function sezioneDati(page: Page) {
  return page.locator('.prefs__group', { hasText: 'I tuoi dati' })
}

/**
 * Il foglio di condivisione, inscenato.
 *
 * `addInitScript` e non un'assegnazione dopo il caricamento: `tryShare`
 * interroga `navigator.share` al tap, ma la pagina va preparata prima che
 * esista qualunque script dell'app — e' la stessa ragione per cui `installed.ts`
 * dichiara `navigator.standalone` da qui.
 *
 * `canShare` va finto insieme a `share`: il codice li interroga **entrambi**, e
 * fingerne uno solo avrebbe prodotto un test verde che non entra mai nel ramo.
 */
async function fingiFoglioCondivisione(
  page: Page,
  esito: 'risolve' | 'annulla' | 'rifiuta',
): Promise<void> {
  await page.addInitScript((modo: string) => {
    const spia = window as unknown as { __share: number }
    spia.__share = 0
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    Object.defineProperty(navigator, 'share', {
      value: () => {
        spia.__share += 1
        if (modo === 'risolve') return Promise.resolve()
        // `AbortError` e' cio' che WebKit rifiuta quando si chiude il foglio.
        // L'altro caso e' un rifiuto qualunque, che l'app **non** deve leggere
        // come un annullamento.
        return Promise.reject(
          modo === 'annulla'
            ? new DOMException('Share canceled', 'AbortError')
            : new DOMException('Permission denied', 'NotAllowedError'),
        )
      },
      configurable: true,
    })
  }, esito)
}

/** Quante volte l'app ha davvero aperto il foglio: zero significa test finto. */
async function condivisioniTentate(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __share: number }).__share)
}

/** Gli appunti, inscenati: riuscita o permesso negato. */
async function fingiAppunti(page: Page, esito: 'risolve' | 'rifiuta'): Promise<void> {
  await page.addInitScript((modo: string) => {
    const spia = window as unknown as { __clip: number }
    spia.__clip = 0
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: () => {
          spia.__clip += 1
          return modo === 'risolve'
            ? Promise.resolve()
            : Promise.reject(new DOMException('Write permission denied', 'NotAllowedError'))
        },
      },
      configurable: true,
    })
  }, esito)
}

async function apriImpostazioni(page: Page): Promise<void> {
  await fissaOrologio(page)
  await page.goto('./')
  await expect(page.locator('.budget')).toBeEnabled()
  await chiudiGuida(page)
  await page.locator('.app__action').tap()
  await expect(page.locator('.prefs')).toBeVisible()
}

async function esporta(page: Page): Promise<void> {
  await sezioneDati(page).locator('.prefs__action').tap()
  await expect(page.locator('.toast')).toBeVisible()
}

/**
 * Che `lastBackupAt` sia **ancora** assente dopo che l'app ha finito.
 *
 * Un'assenza non si aspetta con un `expect.poll`: sarebbe verde al primo giro
 * anche se la scrittura arrivasse un istante dopo. Si aspetta invece una
 * scrittura **successiva e osservabile** — qui la lingua — e solo allora si
 * guarda il campo: se la coda di scritture ha portato a termine quella, ha gia'
 * portato a termine anche l'altra, se ci fosse stata.
 */
async function nienteDataDopoUnaScritturaVera(page: Page): Promise<string | null> {
  await page.locator('.pick', { hasText: 'English' }).tap()
  await expect(page.locator('.prefs')).toContainText('Your data')
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          const request = indexedDB.open('cent')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        const record: { language?: string } | undefined = await new Promise((resolve, reject) => {
          const request = db.transaction('settings').objectStore('settings').get('settings')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        db.close()
        return record?.language ?? null
      }),
    )
    .toBe('en')
  return lastBackupSuDisco(page)
}

test.describe('l\'export che passa dal foglio di condivisione', () => {
  test('condivisione riuscita: la data dell\'ultimo backup viene scritta', async ({ page }) => {
    await fingiFoglioCondivisione(page, 'risolve')
    await apriImpostazioni(page)

    await expect(sezioneDati(page), 'la scena non parte da "mai esportato"').toContainText(
      'Non hai ancora esportato niente.',
    )

    await esporta(page)

    expect(
      await condivisioniTentate(page),
      'il foglio di condivisione non e\' stato aperto: il test non e\' entrato nel ramo che dice di provare',
    ).toBe(1)
    await expect(page.locator('.toast')).toContainText('Backup condiviso.')
    await expect(sezioneDati(page)).toContainText('Ultimo backup:')

    // Il record, non il testo: e' quello che il promemoria leggera' fra due
    // settimane, ed e' l'unica prova che l'esito osservato e' stato registrato.
    await expect
      .poll(() => lastBackupSuDisco(page), {
        message: 'una condivisione riuscita non ha scritto lastBackupAt sul disco',
      })
      .not.toBeNull()
  })

  test('condivisione annullata: la data NON viene scritta', async ({ page }) => {
    await fingiFoglioCondivisione(page, 'annulla')
    await apriImpostazioni(page)
    await esporta(page)

    expect(await condivisioniTentate(page), 'il foglio non e\' stato aperto').toBe(1)

    // Chi annulla lo sa: il toast lo dice, invece di lasciar credere a un
    // backup che non c'e'.
    await expect(page.locator('.toast')).toContainText(
      'Esportazione annullata: nessun backup salvato.',
    )
    // E nessun ripiego non chiesto: annullare non e' un fallimento da rimediare
    // con un download che l'utente non ha domandato.
    await expect(page.locator('.toast')).not.toContainText('Backup pronto')
    await expect(page.locator('.panel')).toHaveCount(0)

    await expect(sezioneDati(page), 'l\'app dice di avere una copia che non ha').toContainText(
      'Non hai ancora esportato niente.',
    )
    expect(
      await nienteDataDopoUnaScritturaVera(page),
      'un backup annullato ha scritto lastBackupAt: il promemoria tacerebbe per due ' +
        'settimane su un telefono che non ha nessuna copia',
    ).toBeNull()
  })

  test('condivisione fallita per altro: ripiega sul file, e non registra niente', async ({
    page,
  }) => {
    await fingiFoglioCondivisione(page, 'rifiuta')
    await apriImpostazioni(page)
    await esporta(page)

    expect(await condivisioniTentate(page), 'il foglio non e\' stato aperto').toBe(1)

    // Un rifiuto che non e' un annullamento **non** e' un annullamento: il
    // ripiego sul file e' la strada giusta, e non e' la stessa cosa.
    await expect(page.locator('.toast')).toContainText('Backup pronto:')
    await expect(page.locator('.toast')).not.toContainText('annullata')

    // `<a download>` non lancia e non restituisce niente: in PWA installata puo'
    // non fare nulla. Un esito che l'app non puo' osservare non si registra.
    expect(
      await nienteDataDopoUnaScritturaVera(page),
      'il ripiego sul file ha scritto lastBackupAt, ma il suo successo non e\' osservabile',
    ).toBeNull()
  })
})

test.describe('l\'ultima strada: il JSON a schermo, copiabile', () => {
  /** Senza `share`, l'export scarica e offre il pannello: e' il piano C. */
  async function apriPannello(page: Page): Promise<void> {
    await apriImpostazioni(page)
    await esporta(page)
    await expect(page.locator('.toast')).toContainText('Backup pronto:')
    await page.locator('.toast__action').tap()
    await expect(page.locator('.panel')).toBeVisible()
  }

  test('copia riuscita: la data viene scritta', async ({ page }) => {
    await fingiAppunti(page, 'risolve')
    await apriPannello(page)

    // Il pannello contiene il backup vero, non un segnaposto: se un giorno
    // copiasse una stringa vuota, la copia "riuscirebbe" lo stesso e la data
    // verrebbe scritta su niente.
    await expect(page.locator('.panel__data')).toHaveValue(/"schemaVersion"/)

    await page.locator('.panel__copy').tap()
    await expect(page.locator('.panel__copy')).toHaveText('Copiato')
    expect(
      await page.evaluate(() => (window as unknown as { __clip: number }).__clip),
      'writeText non e\' stata chiamata',
    ).toBe(1)

    await expect
      .poll(() => lastBackupSuDisco(page), {
        message: 'una copia negli appunti riuscita non ha scritto lastBackupAt',
      })
      .not.toBeNull()
  })

  test('copia rifiutata: resta la selezione a mano, e la data NON viene scritta', async ({
    page,
  }) => {
    await fingiAppunti(page, 'rifiuta')
    await apriPannello(page)
    await page.locator('.panel__copy').tap()

    // Niente permesso: l'app non finge. Seleziona il testo e lo dice, cosi'
    // resta il "Copia" del sistema.
    await expect(page.locator('.panel__lead')).toContainText('Il testo è selezionato')
    await expect(page.locator('.panel__copy')).toHaveText('Copia tutto')

    await page.locator('.panel__close').tap()
    await expect(page.locator('.panel')).toHaveCount(0)
    expect(
      await nienteDataDopoUnaScritturaVera(page),
      'una copia che il browser ha rifiutato ha scritto lastBackupAt: nessuno sa se ' +
        'quel testo e\' finito da qualche parte',
    ).toBeNull()
  })
})
