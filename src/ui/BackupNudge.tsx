import type { BackupNudge as Nudge } from './backup-nudge'
import { daysLabel, t } from './i18n'
import './BackupNudge.css'

/**
 * Il promemoria di backup: una banda discreta, in fondo alla colonna.
 *
 * ## Dove sta, e perche' proprio li'
 *
 * **Non in barra** (l'export ne e' appena uscito, e rimetterci un bottone
 * sarebbe tornare al punto di partenza) e **non modale** (non c'e' niente di
 * urgente da interrompere: i dati ci sono, manca la copia).
 *
 * Sta nella stessa fascia dell'avviso di aggiornamento e del toast: **contenuto
 * in flusso**, dopo la schermata e prima della fascia del FAB. Comparire
 * accorcia il contenitore che scorre invece di coprire qualcosa (regola
 * "Sovrapposizioni"), e siccome i figli del contenitore restano ancorati in
 * alto, non si sposta niente: l'arrivo dei dati non produce CLS.
 *
 * ## Perche' non si puo' chiudere
 *
 * Perche' l'unica chiusura onesta sarebbe persistere il rifiuto, e non c'e' un
 * campo dove scriverlo senza una seconda migrazione su dati veri. Una chiusura
 * che dura una sessione sarebbe un bottone che promette di far tacere una cosa
 * che torna alla prossima apertura.
 *
 * Il modo di farlo sparire e' esportare, che e' anche l'unica cosa che risolve
 * il problema che sta segnalando — ed e' a un tap da qui.
 */
export function BackupNudge({
  nudge,
  onExport,
}: {
  /** `null` = niente da dire: la banda non esiste, non e' vuota. */
  readonly nudge: Nudge | null
  readonly onExport: () => void
}) {
  if (nudge === null) return null
  return (
    <div class="nudge">
      <div class="nudge__inner">
        {/* Uno scudo, non un punto esclamativo: non e' successo niente di male
            e non c'e' niente da riparare in fretta. */}
        <svg class="nudge__icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 3.5 5 6v6c0 4 3 7 7 8.5 4-1.5 7-4.5 7-8.5V6z" />
        </svg>
        <p class="nudge__text">
          <span class="nudge__title">{title(nudge)}</span>
          <span class="nudge__hint">{t('nudge.hint')}</span>
        </p>
        <button type="button" class="nudge__action" onClick={onExport}>
          {t('nudge.action')}
        </button>
      </div>
    </div>
  )
}

/**
 * Tre frasi, non due, e la terza non e' un caso limite: e' cio' che rende
 * onesto l'accendersi della banda quando il conto non torna.
 *
 * - **mai esportato** -> non c'e' nessun numero da dire, e infatti non se ne
 *   dice uno: `nudge.never` non ha segnaposto;
 * - **esportato, e si sa quando** -> i giorni veri;
 * - **esportato, e non si sa quando** (`days === null`: `createdAt` illeggibile,
 *   orologio tornato indietro) -> lo si dice. L'alternativa era stampare un
 *   numero inventato, che e' il modo in cui un indicatore comincia a mentire, o
 *   tacere, che e' il caso peggiore di tutti secondo CLAUDE.md.
 */
function title(nudge: Nudge): string {
  if (!nudge.ever) return t('nudge.never')
  if (nudge.days === null) return t('nudge.unknown')
  return t('nudge.since', { days: daysLabel(nudge.days) })
}
