import type { IsoDate } from '../core/date'
import { countRows, exportedDay } from './import-view'
import type { CountKind, ImportCounts, ImportRefusal, ImportStep } from './import-view'
import { fullDayLabel, t } from './i18n'
import './ImportSheet.css'

/**
 * Ripristinare un backup: la lettura, cio' che cambia, la conferma.
 *
 * ## E' una schermata, non un foglio
 *
 * Stessa forma del pannello del backup, e per la stessa ragione: quando si e'
 * qui non c'e' niente sotto da guardare, e il testo e' lungo — un rifiuto porta
 * due frasi e un rimedio in due rami. Un bottom sheet a meta' schermo
 * costringerebbe a scegliere fra tagliare il rimedio e coprire tutto lo stesso.
 *
 * ## L'altezza e' riservata prima di sapere cosa c'e' dentro
 *
 * Intestazione, corpo e piede sono tre fasce fisse: il corpo e' `flex: 1` e
 * **scorre**, il piede dichiara `--tap-min` anche quando non ha nessun bottone
 * (lo stato "sto leggendo" non ne ha). Cosi' passare da "sto leggendo" a un
 * rifiuto o all'anteprima **non muove niente**: cambia solo cio' che sta dentro
 * la fascia di mezzo. E' la regola dell'ordine di pittura applicata a una
 * schermata che compare prima dei propri dati, che qui e' letteralmente il
 * caso — su iCloud i dati possono arrivare secondi dopo.
 *
 * E il corpo che scorre non e' un ripiego: a 375x667, in due lingue, con un
 * rifiuto che nomina un record, il testo puo' non stare. L'invariante non e'
 * "sta sopra la piega", e' **raggiungibile** — e con un corpo scorrevole e il
 * bottone fuori dal corpo lo e' per costruzione.
 *
 * ## Cosa NON c'e', ed e' voluto
 *
 * Nessun "scrivi CANCELLA", nessun rosso, nessun punto esclamativo: lo scatto
 * pre-import rende il tocco recuperabile, e una conferma drammatica su
 * un'operazione reversibile insegna a temere la cosa sbagliata (ADR 026 §6d).
 * Il prima/dopo mostra la distruzione **senza drammatizzarla**: due numeri
 * accostati, non un avvertimento.
 */

interface Props {
  readonly step: ImportStep
  /** I conteggi di **adesso**, riletti dal mirror a ogni render come il resto. */
  readonly now: ImportCounts
  /** Il giorno civile corrente: decide se la data del file porta l'anno. */
  readonly day: IsoDate
  /**
   * Legge di nuovo dalla stessa sorgente. E' un'azione sola con **due
   * etichette**, e la differenza e' tutto il punto: dopo un errore di lettura si
   * chiama "Riprova" (lo stesso file, di nuovo), dopo un rifiuto "Scegli un
   * altro file" (con lo stesso non cambia niente).
   */
  readonly onRead: () => void
  /**
   * Scrive. Non porta niente con se': cio' che si scrive e' `step.data`, e
   * `App` sta guardando **lo stesso oggetto** che questa schermata sta
   * dipingendo. Passarlo indietro creerebbe un secondo esemplare di una cosa
   * sola, cioe' il posto in cui un giorno si conferma un'anteprima e se ne
   * scrive un'altra.
   */
  readonly onConfirm: () => void
  readonly onClose: () => void
}

export function ImportSheet({ step, now, day, onRead, onConfirm, onClose }: Props) {
  return (
    <div class="restore" role="dialog" aria-modal="true" aria-labelledby="restore-title">
      <div class="restore__head">
        <h2 class="restore__title" id="restore-title">
          {t('import.title')}
        </h2>
        <button
          type="button"
          class="restore__close"
          aria-label={t('import.close')}
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="m7 7 10 10M17 7 7 17" />
          </svg>
        </button>
      </div>

      {/* Una regione viva sola per tutta la fascia: il passaggio da "sto
          leggendo" all'esito e' un **cambiamento di stato**, non un'istruzione
          da esplorare, ed e' esattamente cio' che va annunciato. Chi non guarda
          lo schermo mentre il file arriva da iCloud non ha altro modo di sapere
          che e' arrivato. */}
      <div class="restore__body" aria-live="polite">
        <Body step={step} now={now} day={day} />
      </div>

      {/* Sempre presente, anche vuoto: e' la fascia che tiene ferma la
          geometria fra uno stato e l'altro. */}
      <div class="restore__foot">
        {step.kind === 'reading' ? null : (
          <button
            type="button"
            class="restore__action"
            onClick={step.kind === 'ready' ? onConfirm : onRead}
          >
            {t(
              step.kind === 'ready'
                ? 'import.confirm'
                : step.kind === 'unreadable'
                  ? 'import.retry'
                  : 'import.another',
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function Body({
  step,
  now,
  day,
}: {
  readonly step: ImportStep
  readonly now: ImportCounts
  readonly day: IsoDate
}) {
  switch (step.kind) {
    case 'reading':
      return <Says lead={t('import.reading')} note={t('import.reading.note')} />
    case 'unreadable':
      return <Says lead={t('import.unreadable')} note={t('import.unreadable.note')} />
    case 'refused':
      return <Refused refusal={step.refusal} />
    case 'ready': {
      const when = exportedDay(step.exportedAt)
      return (
        <>
          <p class="restore__lead">
            {when === null
              ? t('import.ready.undated')
              : t('import.ready', { day: fullDayLabel(when, day) })}
          </p>
          <table class="restore__table">
            <thead>
              <tr>
                <td />
                <th scope="col">{t('import.now')}</th>
                <th scope="col">{t('import.next')}</th>
              </tr>
            </thead>
            <tbody>
              {countRows(now, step.counts).map((row) => (
                <tr key={row.kind}>
                  <th scope="row">{rowLabel(row.kind)}</th>
                  <td>{row.now}</td>
                  <td>{row.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )
    }
    default: {
      const mai: never = step
      return mai
    }
  }
}

/**
 * Un rifiuto: **il fatto, poi cosa e' possibile da dove si e'**.
 *
 * Le due parti sono sempre due, e la seconda non e' verbosita': su un iPhone
 * non esiste un editor che apra un JSON da iCloud Drive e lo risalvi, quindi un
 * messaggio che dicesse solo `expenses[12].amountCents` sarebbe vero e
 * **inutilizzabile** — preciso quanto basta a sembrare utile, e a far cercare
 * per dieci minuti una cosa che quel telefono non ha.
 *
 * `switch` esaustivo con ramo `never`: una quinta forma di rifiuto senza le sue
 * due frasi **non compila**.
 */
function Refused({ refusal }: { readonly refusal: ImportRefusal }) {
  switch (refusal.kind) {
    case 'not-backup':
      return <Says lead={t('import.notBackup')} note={t('import.notBackup.note')} />
    case 'too-new':
      return <Says lead={t('import.tooNew')} note={t('import.tooNew.note')} />
    case 'no-categories':
      return <Says lead={t('import.noCategories')} note={t('import.noCategories.note')} />
    case 'damaged':
      return (
        <>
          <p class="restore__lead">{t('import.damaged', { where: refusal.where })}</p>
          {refusal.more > 0 ? (
            <p class="restore__note">{t('import.damaged.more', { more: refusal.more })}</p>
          ) : null}
          <p class="restore__note">{t('import.damaged.note')}</p>
        </>
      )
    default: {
      const mai: never = refusal
      return mai
    }
  }
}

function Says({ lead, note }: { readonly lead: string; readonly note: string }) {
  return (
    <>
      <p class="restore__lead">{lead}</p>
      <p class="restore__note">{note}</p>
    </>
  )
}

/**
 * L'etichetta di una riga del prima/dopo.
 *
 * `switch` esaustivo e non una tabella: una quarta riga senza la sua parola non
 * compila. Le chiavi si scrivono per intero — una costruita a pezzi spegne il
 * controllo B di `dead-surface.mjs` per tutto il progetto.
 */
function rowLabel(kind: CountKind): string {
  switch (kind) {
    case 'expenses':
      return t('import.rows.expenses')
    case 'categories':
      return t('import.rows.categories')
    case 'rules':
      return t('import.rows.rules')
    default: {
      const mai: never = kind
      return mai
    }
  }
}
