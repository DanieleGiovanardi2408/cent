/**
 * Scegliere il file del backup. E' qui che iOS morde, la seconda volta.
 *
 * `backup-file.ts` porta il backup **fuori**; questo lo riporta **dentro**, e i
 * due hanno la stessa forma di rischio: l'API del sistema si comporta in modo
 * diverso a seconda di dove gira, e il modo peggiore e' silenzioso.
 *
 * ## `accept`: due strade dichiarate, e quale sia quella giusta lo dice il telefono
 *
 * Su iOS `accept` si risolve in UTI, e **filtrare male significa che i file JSON
 * appaiono grigi e non selezionabili**: la funzione non parte proprio, e il
 * difetto si presenta come *"il mio backup non c'e'"* — indistinguibile, per chi
 * lo vive, da un bug del salvataggio.
 *
 * Si dichiarano tutte e due le strade — **il tipo MIME e l'estensione** — perche'
 * e' la forma che degrada meglio se una delle due non viene riconosciuta. Non e'
 * la prova che funziona: e' la forma che ha piu' modi di funzionare. La prova sta
 * su un telefono vero, con un file locale **e** uno su iCloud Drive, ed e'
 * scritta in ROADMAP, "Verificabili solo sul dispositivo".
 *
 * ## L'input sta nel documento, e non e' superstizione
 *
 * Un `<input type="file">` staccato dal DOM apre il selettore su Chromium; su
 * WebKit e' storicamente la cosa che smette di funzionare per prima, e quando
 * smette non lancia niente — il tap non fa nulla e non c'e' modo di accorgersene
 * da qui. Quindi si attacca, si clicca e si stacca: costa due righe e toglie una
 * classe intera di guasti muti. La regola dei sovrapposti non c'entra e non e'
 * violata: `pointer-events: none` lo rende invisibile a `elementFromPoint`.
 *
 * ## `click()` senza nessun `await` prima
 *
 * Stesso vincolo di `navigator.share`: aprire il selettore vuole l'attivazione
 * utente del tap in corso. Fra il tap e `click()` non c'e' nessun punto di
 * cessione — `pickBackup` costruisce, attacca e clicca nello stesso task.
 *
 * ## Chiudere il selettore non e' un guasto
 *
 * Se il selettore si chiude senza un file, l'esito e' `cancelled` e la schermata
 * sparisce senza dire niente: chi ha cambiato idea non ha incontrato nessun
 * problema. Il verso opposto — non risolvere mai — lascerebbe "sto leggendo" a
 * schermo per sempre, che e' il modo peggiore di fallire fra quelli disponibili.
 *
 * Per questo ci sono **due** sonde e non una: l'evento `cancel` dell'input, che
 * e' quello giusto e non esiste ovunque, e il ritorno del fuoco alla finestra,
 * che esiste ovunque e non e' preciso. La seconda aspetta `GRAZIA` prima di
 * concludere, perche' su un selettore di sistema il fuoco puo' tornare **prima**
 * che `change` sia stato consegnato: senza quell'attesa un file scelto davvero
 * verrebbe letto come un ripensamento.
 */

import type { BackupRead } from '../ui/import-view'

/**
 * Il tipo MIME **e** l'estensione. Vedi il capoverso `accept` qui sopra: nessuna
 * delle due e' quella giusta finche' non lo dice un iPhone.
 */
const ACCEPT = 'application/json,.json'

/**
 * Quanto si aspetta, dopo che il fuoco e' tornato, prima di concludere che non
 * e' stato scelto niente. E' la sonda imprecisa delle due: il numero serve a
 * coprire l'ordine `focus` -> `change`, non una lettura lenta — `change` arriva
 * alla **selezione**, non alla fine del trasferimento da iCloud.
 */
const GRAZIA = 800

/**
 * Apre il selettore del sistema e legge il file scelto.
 *
 * Nell'esito `unreadable` c'e' **`again`, che rilegge lo stesso `File`**: e' cio'
 * che rende vero il "Riprova" della schermata invece che un'etichetta sopra un
 * "Scegli un altro file". Non e' un dettaglio di comodita' — su iCloud Drive la
 * seconda lettura spesso riesce, perche' nel frattempo il download e' partito, e
 * chi non e' riuscito a leggere un file non ha bisogno di **un altro** file: ha
 * bisogno di **quello**, un momento dopo.
 *
 * E' una chiusura e non un campo di questo modulo: cosi' il file da rileggere
 * non e' *l'ultimo che il selettore ricorda*, e' **quello di quella lettura li'**
 * — due letture in volo non possono scambiarsi il file.
 */
export function pickBackup(): Promise<BackupRead> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = ACCEPT
  input.className = 'filepick'
  document.body.append(input)

  return new Promise<BackupRead>((resolve) => {
    let settled = false
    let file: File | null = null
    const done = (read: BackupRead): void => {
      if (settled) return
      settled = true
      input.remove()
      resolve(read)
    }

    input.addEventListener('change', () => {
      file = input.files?.[0] ?? null
      if (file === null) done({ kind: 'cancelled' })
      else void readFile(file).then(done)
    })
    // La sonda giusta, dove esiste.
    input.addEventListener('cancel', () => done({ kind: 'cancelled' }))
    // La sonda che esiste ovunque. `file` e non `settled`: mentre si legge da
    // iCloud il fuoco e' gia' tornato e la promessa non e' ancora risolta —
    // guardare `settled` chiuderebbe la schermata a meta' di una lettura buona.
    addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (file === null) done({ kind: 'cancelled' })
        }, GRAZIA)
      },
      { once: true },
    )

    input.click()
  })
}

/**
 * Il testo del file, o `unreadable` con il modo di riprovare **su questo stesso
 * file**.
 *
 * Non distingue i motivi del rifiuto — un file sparito, un permesso, un
 * trasferimento da iCloud che non arriva — e non e' una semplificazione: il
 * rimedio e' lo stesso per tutti e tre, e nominarne uno sbagliato manderebbe a
 * cercare la cosa che non e'.
 */
function readFile(file: File): Promise<BackupRead> {
  return file.text().then(
    (text): BackupRead => ({ kind: 'text', text }),
    (): BackupRead => ({ kind: 'unreadable', again: () => readFile(file) }),
  )
}
