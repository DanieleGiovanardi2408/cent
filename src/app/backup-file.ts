/**
 * Portare il backup fuori dall'app. E' qui che iOS morde.
 *
 * Un bottone che "scarica un file" si comporta in tre modi diversi a seconda di
 * dove gira, e il modo peggiore e' silenzioso: **in una PWA installata da Home
 * Screen un `<a download>` puo' non fare assolutamente nulla, senza errore, senza
 * console, senza foglio di condivisione.** L'utente crede di avere un backup e
 * non ce l'ha. E' peggio che non avere il bottone.
 *
 * Quindi due strade, in quest'ordine:
 *
 * 1. **`navigator.share` con `files`** — la strada buona su iOS: apre il foglio
 *    di condivisione, da cui si salva in File, si manda per mail, si mette su
 *    qualunque cosa sia installata. Si interroga prima `navigator.canShare({files})`,
 *    perche' `share` esiste anche dove i file non sono ammessi (e li' rifiuta).
 * 2. **`<a download>` + object URL** — desktop e Safari non installato.
 *
 * E se falliscono entrambe? L'esito lo dice, e la UI ha una terza strada che non
 * puo' fallire: mostrare il JSON a schermo, copiabile. Il bottone non puo' fare
 * *niente*: al minimo dice cosa e' andato storto.
 *
 * ## Il vincolo che spiega la forma di questo file
 *
 * `navigator.share()` vuole un'**attivazione utente**. Fra il tap e la chiamata
 * non ci puo' essere nessun `await`: la serializzazione e' sincrona e `tryShare`
 * arriva a `share()` senza mai cedere il controllo. Chi tocchera' questo file
 * stia attento a non infilare un await prima — su iOS il sintomo e'
 * `NotAllowedError`, cioe' di nuovo un bottone che non fa niente.
 */

import { today } from '../core/date'
import type { IsoDate } from '../core/date'
import type { Repository } from '../core/repository'

export type ExportResult =
  /** Consegnato al foglio di condivisione del sistema. */
  | { readonly kind: 'shared'; readonly filename: string }
  /** Scaricato come file. Sul desktop e' finito nei Download. */
  | { readonly kind: 'downloaded'; readonly filename: string }
  /** L'utente ha chiuso il foglio di condivisione. Nessun backup, e lo sa. */
  | { readonly kind: 'cancelled' }
  /** Nessuna delle due strade ha funzionato. `text` e' il piano C della UI. */
  | { readonly kind: 'failed'; readonly text: string | null }

/** Il JSON del backup, indentato: e' un file che una persona puo' aprire e leggere. */
export function serializeBackup(repo: Repository): string {
  return JSON.stringify(repo.exportBackup(), null, 2)
}

/** `cent-2026-08-22.json`: ordinabile per nome, riconoscibile in mezzo ad altri. */
export function backupFilename(day: IsoDate = today()): string {
  return `cent-${day}.json`
}

export async function exportBackupFile(repo: Repository): Promise<ExportResult> {
  const filename = backupFilename()

  let text: string
  try {
    text = serializeBackup(repo)
  } catch {
    // Praticamente irraggiungibile (il mirror e' JSON puro), ma se il backup non
    // si costruisce non c'e' nemmeno un piano C da offrire: va detto e basta.
    return { kind: 'failed', text: null }
  }

  const shared = await tryShare(text, filename)
  if (shared === 'ok') return { kind: 'shared', filename }
  if (shared === 'cancelled') return { kind: 'cancelled' }

  try {
    downloadFile(text, filename)
    return { kind: 'downloaded', filename }
  } catch {
    return { kind: 'failed', text }
  }
}

type ShareAttempt = 'ok' | 'cancelled' | 'unavailable'

function tryShare(text: string, filename: string): Promise<ShareAttempt> | ShareAttempt {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return 'unavailable'
  }

  let payload: ShareData
  try {
    const file = new File([text], filename, { type: 'application/json' })
    payload = { files: [file], title: 'Backup di Cent' }
  } catch {
    return 'unavailable'
  }

  if (!navigator.canShare(payload)) return 'unavailable'

  // Nessun await prima di qui: l'attivazione utente e' ancora valida.
  return navigator.share(payload).then(
    (): ShareAttempt => 'ok',
    (error: unknown): ShareAttempt => {
      // Annullato dall'utente: non e' un fallimento e non va rimediato con un
      // download che lui non ha chiesto.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      return 'unavailable'
    },
  )
}

function downloadFile(text: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  // Revoca subito e Safari a volte non fa in tempo a leggere il blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
