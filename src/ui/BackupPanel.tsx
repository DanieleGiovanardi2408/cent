import { useRef, useState } from 'preact/hooks'
import { t } from './i18n'
import './BackupPanel.css'

/**
 * L'ultima strada del backup: il JSON a schermo, copiabile.
 *
 * Esiste perche' e' impossibile sapere se un `<a download>` ha davvero prodotto
 * un file — non lancia, non restituisce niente, e in una PWA installata su iOS
 * puo' semplicemente non fare nulla. Un bottone di backup che silenziosamente
 * non fa niente e' peggio di non averlo: l'utente crede di avere una copia.
 *
 * Da qui il dato e' comunque raggiungibile: si copia negli appunti e si incolla
 * in Note, in una mail, ovunque. Non e' elegante, ma e' l'unica strada che non
 * puo' fallire in silenzio.
 */

interface Props {
  readonly text: string
  readonly filename: string
  /**
   * La copia negli appunti e' **riuscita davvero**: `writeText` si e' risolta.
   *
   * E' uno dei due soli esiti che l'app osserva (l'altro e' `share()` risolta),
   * quindi e' uno dei due soli punti in cui ha senso aggiornare `lastBackupAt`.
   * La selezione a mano no: che poi l'utente prema Copia non lo sa nessuno.
   */
  readonly onCopied: () => void
  readonly onClose: () => void
}

export function BackupPanel({ text, filename, onCopied, onClose }: Props) {
  const [copied, setCopied] = useState<'no' | 'yes' | 'manual'>('no')
  const field = useRef<HTMLTextAreaElement>(null)

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied('yes')
      onCopied()
    } catch {
      // Niente permesso per gli appunti: resta la selezione a mano, che c'e'
      // sempre. Selezioniamo noi il testo, cosi' bastano "Copia" del sistema.
      field.current?.select()
      setCopied('manual')
    }
  }

  return (
    <div class="panel" role="dialog" aria-modal="true" aria-label={t('backup.label')}>
      <div class="panel__head">
        <h2 class="panel__title">{filename}</h2>
        <button type="button" class="panel__close" aria-label={t('backup.close')} onClick={onClose}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </button>
      </div>

      <p class="panel__lead">
        {t(copied === 'yes' ? 'backup.copied' : copied === 'manual' ? 'backup.manual' : 'backup.lead')}
      </p>

      <textarea class="panel__data" ref={field} readOnly value={text} spellcheck={false} />

      <button type="button" class="panel__copy" onClick={() => void copy()}>
        {t(copied === 'yes' ? 'backup.copiedShort' : 'backup.copy')}
      </button>
    </div>
  )
}
