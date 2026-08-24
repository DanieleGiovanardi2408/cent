/**
 * Gli unitari di `backup-file.ts`: il modulo che sceglie fra quattro esiti su
 * un'operazione che non ha un annulla.
 *
 * ## Perche' anche qui, se c'e' gia' `backup.spec.ts`
 *
 * Perche' provano due cose diverse. La suite end-to-end prova la **catena**:
 * l'esito arriva ad `App.tsx` e diventa (o non diventa) un `lastBackupAt` sul
 * disco. Qui si prova la **decisione**: quale dei quattro esiti esce, date le
 * condizioni dell'ambiente. Sono le condizioni che non si possono mettere in
 * scena da un browser vero senza inscenarle a mano — `canShare` che dice di no,
 * `File` che non si costruisce, `link.click()` che lancia — e sono
 * esattamente quelle in cui questo file e' stato scritto per non sbagliare.
 *
 * Il ramo `shared` e' stato per tutta la fase 3 **il solo che scrive la data
 * dell'ultimo backup e il solo che nessun test attraversava**, perche' in
 * Chromium headless `navigator.share` non esiste. Qui non esiste nemmeno in
 * Node: si dichiara, come qualunque altra premessa d'ambiente di questo
 * progetto.
 *
 * ## L'ambiente e' finto, e ogni pezzo e' dichiarato
 *
 * `environment: 'node'` (vitest.config.ts). `File`, `Blob` e `DOMException`
 * esistono; `navigator`, `document` e `URL.createObjectURL` no. Vengono messi in
 * piedi uno per uno **e nient'altro**: se un giorno questo modulo cominciasse a
 * toccare una quarta cosa del DOM, il test lancerebbe invece di passare per caso.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { backupFilename, exportBackupFile, serializeBackup } from './backup-file'
import type { Repository } from '../core/repository'
import type { BackupFile } from '../core/backup'
import { makeSettings } from '../core/testing'

/* ------------------------------------------------------------- il finto repo */

const BACKUP: BackupFile = {
  app: 'cent',
  schemaVersion: 3,
  exportedAt: '2026-08-19T08:00:00.000Z',
  data: {
    expenses: [],
    categories: [],
    recurringRules: [],
    budgets: [],
    settings: makeSettings(),
  },
}

/**
 * `exportBackupFile` chiama **un** metodo del repository. Il finto ne dichiara
 * uno, e il cast e' confinato a questa riga: e' la cucitura del layer di
 * composizione (CLAUDE.md, "Cuciture per i test"), non un parametro aggiunto a
 * `src/core` per far contento un test.
 */
function repoFinto(exportBackup: () => BackupFile = () => BACKUP): Repository {
  return { exportBackup } as unknown as Repository
}

/* ---------------------------------------------------------------- l'ambiente */

interface Foglio {
  /** Quante volte l'app ha aperto il foglio di condivisione. */
  readonly aperture: () => number
  /** Il payload dell'ultima chiamata: files, titolo. */
  readonly ultimo: () => ShareData | null
}

/**
 * Dichiara `navigator.share` / `navigator.canShare`.
 *
 * `canShare` si dichiara sempre insieme a `share` perche' il codice interroga
 * entrambi: fingerne uno solo produce un test verde che non entra nel ramo.
 */
function dichiaraCondivisione(options: {
  readonly canShare?: boolean
  readonly share?: () => Promise<void>
}): Foglio {
  let aperture = 0
  let ultimo: ShareData | null = null
  vi.stubGlobal('navigator', {
    canShare: (data: ShareData) => {
      ultimo = data
      return options.canShare ?? true
    },
    share: (data: ShareData) => {
      aperture += 1
      ultimo = data
      return (options.share ?? (() => Promise.resolve()))()
    },
  })
  return { aperture: () => aperture, ultimo: () => ultimo }
}

/** Nessuna delle due funzioni esiste: e' Chromium headless, ed e' il desktop. */
function senzaCondivisione(): void {
  vi.stubGlobal('navigator', {})
}

interface Scarico {
  readonly click: () => number
  readonly nome: () => string | null
  readonly revocati: () => number
}

/**
 * Dichiara il minimo di DOM che serve a `<a download>`: `document.createElement`,
 * `document.body`, e `URL.createObjectURL` / `revokeObjectURL`.
 */
function dichiaraScarico(options: { readonly lancia?: boolean } = {}): Scarico {
  let click = 0
  let nome: string | null = null
  let revocati = 0
  const link = {
    href: '',
    download: '',
    rel: '',
    click: () => {
      click += 1
      nome = link.download
      if (options.lancia === true) throw new Error('il browser non ha aperto niente')
    },
    remove: () => {},
  }
  vi.stubGlobal('document', {
    createElement: () => link,
    body: { append: () => {} },
  })
  vi.stubGlobal('URL', {
    createObjectURL: () => 'blob:finto',
    revokeObjectURL: () => {
      revocati += 1
    },
  })
  return { click: () => click, nome: () => nome, revocati: () => revocati }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/* ------------------------------------------------------------------- il nome */

describe('backupFilename', () => {
  it('e\' ordinabile per nome e non dipende dalla lingua', () => {
    expect(backupFilename('2026-08-19')).toBe('cent-2026-08-19.json')
    // Il giorno e' la chiave del nome: due export dello stesso giorno hanno lo
    // stesso nome, e l'ordine alfabetico e' l'ordine cronologico.
    expect(backupFilename('2026-01-02') < backupFilename('2026-08-19')).toBe(true)
  })

  it('senza argomenti usa il giorno civile di oggi', () => {
    const oggi = new Date()
    const atteso = `cent-${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(
      oggi.getDate(),
    ).padStart(2, '0')}.json`
    expect(backupFilename()).toBe(atteso)
  })
})

describe('serializeBackup', () => {
  it('e\' JSON indentato: un file che una persona puo\' aprire e leggere', () => {
    const testo = serializeBackup(repoFinto())
    expect(testo).toContain('\n  "app": "cent"')
    expect(JSON.parse(testo)).toEqual(BACKUP)
  })
})

/* ---------------------------------------------------------------- i quattro esiti */

describe('exportBackupFile, quando il foglio di condivisione c\'e\'', () => {
  it('condivisione riuscita -> shared, e il file non viene anche scaricato', async () => {
    const foglio = dichiaraCondivisione({})
    const scarico = dichiaraScarico()

    const esito = await exportBackupFile(repoFinto())

    expect(esito).toEqual({ kind: 'shared', filename: backupFilename() })
    expect(foglio.aperture(), 'il foglio non e\' stato aperto').toBe(1)
    // Il doppio esito e' il difetto silenzioso di questa forma: condividere
    // **e** scaricare lascia un file nei Download che nessuno ha chiesto.
    expect(scarico.click(), 'ha condiviso e anche scaricato').toBe(0)
  })

  it('il payload porta un file con il nome e il tipo giusti, e un titolo', async () => {
    const foglio = dichiaraCondivisione({})
    dichiaraScarico()

    await exportBackupFile(repoFinto())

    const payload = foglio.ultimo()
    expect(payload).not.toBeNull()
    const file = payload?.files?.[0]
    expect(file?.name).toBe(backupFilename())
    expect(file?.type).toBe('application/json')
    expect(await file?.text()).toBe(serializeBackup(repoFinto()))
    // iOS lo mostra in cima al foglio: e' l'unica stringa di questo modulo che
    // una persona legge, quindi c'e'.
    expect(payload?.title).toBeTruthy()
  })

  it('ANNULLATA (AbortError) -> cancelled: niente file, e niente da registrare', async () => {
    const foglio = dichiaraCondivisione({
      share: () => Promise.reject(new DOMException('Share canceled', 'AbortError')),
    })
    const scarico = dichiaraScarico()

    const esito = await exportBackupFile(repoFinto())

    // E' l'esito che conta piu' di tutti: `cancelled` e' l'unico modo che
    // `App.tsx` ha di sapere che **non** deve scrivere `lastBackupAt`. Se
    // arrivasse qui `downloaded` o `shared`, il promemoria di backup tacerebbe
    // per due settimane su un telefono senza copia.
    expect(esito).toEqual({ kind: 'cancelled' })
    expect(foglio.aperture()).toBe(1)
    // E nessun ripiego non chiesto: chi annulla ha annullato.
    expect(scarico.click(), 'annullare ha prodotto un download mai chiesto').toBe(0)
  })

  it('rifiutata per altro -> ripiega sul file, e NON diventa cancelled', async () => {
    dichiaraCondivisione({
      share: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    })
    const scarico = dichiaraScarico()

    const esito = await exportBackupFile(repoFinto())

    expect(esito).toEqual({ kind: 'downloaded', filename: backupFilename() })
    expect(scarico.click()).toBe(1)
  })

  it('rifiutata con un errore che non e\' una DOMException -> ripiega sul file', async () => {
    // Un `share` che lancia un `TypeError` non e' un utente che annulla. La
    // differenza sta nel tipo, non solo nel nome: un oggetto qualunque con
    // `name: 'AbortError'` non deve passare per un annullamento.
    dichiaraCondivisione({ share: () => Promise.reject({ name: 'AbortError' }) })
    const scarico = dichiaraScarico()

    expect(await exportBackupFile(repoFinto())).toEqual({
      kind: 'downloaded',
      filename: backupFilename(),
    })
    expect(scarico.click()).toBe(1)
  })

  it('canShare che dice di no -> ripiega sul file senza aprire niente', async () => {
    // `share` esiste anche dove i file non sono ammessi: aprirlo lo stesso
    // significa un foglio che si apre e rifiuta.
    const foglio = dichiaraCondivisione({ canShare: false })
    const scarico = dichiaraScarico()

    expect(await exportBackupFile(repoFinto())).toEqual({
      kind: 'downloaded',
      filename: backupFilename(),
    })
    expect(foglio.aperture(), 'ha aperto un foglio che aveva gia\' detto di no').toBe(0)
    expect(scarico.click()).toBe(1)
  })

  /**
   * Il vincolo scritto in cima a `backup-file.ts`: fra il tap e `share()` non ci
   * puo' essere nessun `await`, o iOS toglie l'attivazione utente e il bottone
   * non fa niente (`NotAllowedError`).
   *
   * E' una proprieta' che nessun test end-to-end puo' vedere — in Chromium
   * l'attivazione non scade — e che si perde con una riga: basta che qualcuno
   * anteponga un `await repo.qualcosa()`. Qui si misura direttamente:
   * `exportBackupFile` viene chiamata **senza attenderla**, e il foglio dev'essere
   * gia' stato aperto quando la chiamata restituisce la promessa.
   */
  it('apre il foglio in modo sincrono: nessun await prima di share()', async () => {
    const foglio = dichiaraCondivisione({})
    dichiaraScarico()

    const inCorso = exportBackupFile(repoFinto())

    expect(
      foglio.aperture(),
      'share() e\' stata raggiunta dopo aver ceduto il controllo: su iOS ' +
        'l\'attivazione utente e\' gia\' scaduta e il bottone non fa niente',
    ).toBe(1)
    await inCorso
  })
})

describe('exportBackupFile, quando il foglio non c\'e\'', () => {
  it('scarica un file con il nome del giorno', async () => {
    senzaCondivisione()
    const scarico = dichiaraScarico()

    expect(await exportBackupFile(repoFinto())).toEqual({
      kind: 'downloaded',
      filename: backupFilename(),
    })
    expect(scarico.nome()).toBe(backupFilename())
  })

  it('revoca l\'object URL, ma tardi: Safari a volte non fa in tempo a leggerlo', async () => {
    vi.useFakeTimers()
    senzaCondivisione()
    const scarico = dichiaraScarico()

    await exportBackupFile(repoFinto())
    expect(scarico.revocati(), 'revocato subito: il blob puo\' sparire prima del salvataggio').toBe(0)
    vi.advanceTimersByTime(60_000)
    expect(scarico.revocati(), 'l\'object URL non viene mai revocato: e\' memoria che resta').toBe(1)
  })

  it('se anche il file fallisce -> failed CON il testo: la UI ha il piano C', async () => {
    senzaCondivisione()
    dichiaraScarico({ lancia: true })

    const esito = await exportBackupFile(repoFinto())

    expect(esito.kind).toBe('failed')
    // Il testo e' cio' che il pannello mostra a schermo, copiabile. Senza, il
    // bottone di backup non farebbe **niente**, che e' l'esito che questo
    // modulo esiste per rendere impossibile.
    expect(esito.kind === 'failed' ? esito.text : null).toBe(serializeBackup(repoFinto()))
  })
})

describe('exportBackupFile, quando il backup non si costruisce', () => {
  it('-> failed senza testo, e non prova nemmeno a condividere', async () => {
    const foglio = dichiaraCondivisione({})
    const scarico = dichiaraScarico()

    const esito = await exportBackupFile(
      repoFinto(() => {
        throw new Error('mirror illeggibile')
      }),
    )

    // Niente da offrire: non c'e' file, non c'e' testo, e va detto — non si
    // apre un foglio di condivisione su un backup che non esiste.
    expect(esito).toEqual({ kind: 'failed', text: null })
    expect(foglio.aperture()).toBe(0)
    expect(scarico.click()).toBe(0)
  })
})
