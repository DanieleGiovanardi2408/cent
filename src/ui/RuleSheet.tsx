import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { IsoDate } from '../core/date'
import { previewMaterialization } from '../core/recurring-plan'
import type {
  MaterializationPreview,
  RecurrenceDraft,
  RecurringRuleDeletion,
} from '../core/recurring-plan'
import type { Cadence, Category, RecurringRule } from '../core/types'
import { Keypad } from './Keypad'
import { deletionRefusalText, previewCopy } from './recurring-view'
import type { RuleMode } from './recurring-view'
import { amountCells, dayChipLabel, t } from './i18n'
import './sheet.css'
// I chip della data e la griglia delle categorie sono **gli stessi**
// dell'inserimento; `.save` e' **lo stesso** bottone del budget, per lo stesso
// ruolo; `.danger` e `.editor__note` sono **gli stessi** del foglio delle
// categorie, per la stessa domanda ("posso cancellarla davvero?"). Gli import
// sono dichiarativi (il CSS finisce nel bundle una volta sola) e dicono che
// queste dipendenze esistono: chi cambia il chip li' cambia anche questo
// foglio, ed e' voluto.
import './AddSheet.css'
import './BudgetSheet.css'
import './Categories.css'
import './RuleSheet.css'

/**
 * Una spesa fissa: crearla, cambiarla, spegnerla, riaccenderla, cancellarla.
 *
 * ## Qui NON vale il chip-come-conferma (ADR 004)
 *
 * ADR 004 giustifica "il chip e' la conferma" con la **frequenza**: si inserisce
 * una spesa dieci volte al giorno, di fretta, in piedi alla cassa, e c'e'
 * l'Annulla del toast per sei secondi. Nessuna delle tre condizioni vale qui.
 *
 * Una regola si crea **una volta e vale per mesi**. E' consequenziale — puo'
 * scrivere otto spese arretrate nell'istante in cui si salva — e **non ha
 * rete**: le spese generate restano, e una regola che ne ha generate non si puo'
 * nemmeno cancellare (`planRecurringRuleDeletion` la rifiuta, e ha ragione:
 * resterebbero record con un `recurringId` che punta al vuoto). Un tap
 * distratto qui non e' un tap da annullare, e' mezz'ora di pulizia.
 *
 * Quindi: **selettori espliciti e salvataggio esplicito**, come il foglio del
 * budget. Il tap in piu' si paga una volta.
 *
 * ## Un foglio solo per tre porte, e perche' non tre fogli
 *
 * `target === null` crea; una regola accesa si modifica; una spenta si
 * riaccende. Sono i **tre inneschi della generazione retroattiva** di ADR 017, e
 * hanno bisogno esattamente della stessa cosa davanti: gli stessi campi, la
 * stessa anteprima, la stessa casella di conferma quando c'e' dell'arretrato.
 * Tre fogli sarebbero stati tre copie della stessa dichiarazione, cioe' tre
 * occasioni perche' una delle tre dimenticasse di dichiarare.
 *
 * Cambia solo cosa dice il bottone (`RuleMode`), e chi puo' spegnere o
 * cancellare.
 *
 * ## L'anteprima e' il vincolo duro
 *
 * *"Affitto, 900, mensile, dal 1 gennaio"* creata ad agosto scrive **otto** spese
 * per 7.200 € e cambia i totali di otto periodi passati, all'istante. Le date
 * passate sono legittime — e' cosi' che si registra un affitto che esiste da
 * mesi — quindi **non si vietano: si dichiara cosa succede**.
 *
 * `previewMaterialization` gira a ogni render, cioe' **mentre si sta ancora
 * scrivendo**: per questo non lancia mai e rifiuta con un messaggio. Con un
 * importo a meta' e una data assurda l'anteprima non ha una risposta, e la riga
 * in cima resta sul suo "cosa fare adesso" invece di mostrare un errore per uno
 * stato di transito.
 *
 * ## Le due anteprime, e perche' sono due
 *
 * Quella che si **mostra** gira a ogni render con `amountCents: 1` (vedi
 * `schedule`): il calendario non dipende dall'importo, e senza quella
 * scorciatoia digitare una cifra costerebbe 9.728 occorrenze ricalcolate.
 *
 * Quella che **scrive** la rifa' chi salva, con l'importo vero, e il permesso
 * che spende e' il suo. Le due non si toccano mai: `shown` e' costruito campo
 * per campo e **non** e' uno spread dell'esito, perche' uno spread avrebbe
 * portato con se' il permesso di scrivere una regola da 0,01 € insieme ai
 * numeri giusti. E' il difetto che questo file aveva davvero, chiuso dai tipi:
 * `previewCopy` non accetta piu' niente che contenga un permesso.
 *
 * ## La conferma non compare sempre, ed e' il punto
 *
 * Solo quando `backdated` e' vero. Una regola che parte oggi da' `count: 1,
 * backdated: false` e non ha niente da confermare — **una conferma che compare
 * sempre smette di essere letta**, come un indicatore che grida tutti i mesi
 * nello stesso giorno. Vale anche per la modifica: spostare `startDate`
 * indietro su una regola gia' materializzata non genera niente, quindi li' non
 * si chiede niente. Il pedaggio lo paga il codice; l'utente lo paga solo quando
 * c'e' qualcosa da confermare.
 *
 * ## Perche' la conferma e' un bersaglio diverso dal salvataggio
 *
 * La via facile era: primo tap su "Crea" arma, secondo tap conferma. E' la via
 * sbagliata, perche' il bersaglio del secondo tap sta **dove il pollice e' gia'
 * appoggiato**: un doppio tocco — che su un bottone appena premuto e' il gesto
 * piu' facile del mondo — attraverserebbe la conferma senza che nessuno l'abbia
 * letta. Qui la conferma e' una casella sopra il bottone: due bersagli distinti,
 * e finche' non e' spuntata "Crea" e' spento.
 *
 * ## La conferma decade da sola
 *
 * E' agganciata alla **firma** della bozza, non a un booleano: cambiare la data
 * dopo aver spuntato la casella la spegne, perche' cio' che si era confermato
 * non e' piu' cio' che verrebbe scritto. Un booleano avrebbe lasciato confermare
 * "8 spese, 7.200 €" e salvare "24 spese, 21.600 €".
 *
 * Nella firma ci sono anche **il giorno** e **il segnaposto**, che non sono
 * campi del foglio: sono i due estremi della finestra di materializzazione. Se
 * passa la mezzanotte con il foglio aperto, o se un'altra materializzazione
 * avanza il segnaposto, i numeri annunciati cambiano da soli — e una casella
 * che resta spuntata su numeri cambiati e' esattamente il caso che ADR 017
 * chiama inaccettabile.
 */

interface Props {
  readonly categories: readonly Category[]
  /**
   * La regola che si sta modificando, **riletta dal mirror a ogni render**.
   * `null` = se ne sta creando una nuova.
   *
   * Riletta e non congelata: il segnaposto puo' avanzare mentre il foglio e'
   * aperto (una materializzazione da un altro contesto), e un oggetto fermo qui
   * dentro annuncerebbe una finestra che non esiste piu'.
   */
  readonly target: RecurringRule | null
  /**
   * L'esito di `planRecurringRuleDeletion` sul mirror, calcolato **prima** di
   * mostrare il bottone: cosi' chi non puo' cancellare legge una frase con
   * dentro il numero ("ha gia' creato 8 spese") invece di ricevere un errore
   * dopo il tap. `null` quando non c'e' un bersaglio.
   */
  readonly deletion: RecurringRuleDeletion | null
  /** Il giorno civile corrente, calcolato al risveglio e non a ogni render. */
  readonly day: IsoDate
  readonly leaving: boolean
  /**
   * Salva. `null` = e' andata, e il foglio si sta gia' chiudendo. Una stringa e'
   * **cio' che il foglio deve dire**: il rifiuto della scrittura, con dentro
   * cosa e' cambiato. Non un booleano, perche' i tre rifiuti non si raccontano
   * con la stessa frase.
   */
  readonly onSave: (draft: RuleDraft) => string | null
  /** Spegne. Va sempre, non chiede niente: e' l'unica direzione che non genera. */
  readonly onDeactivate: () => void
  readonly onDelete: () => void
  readonly onClose: () => void
}

/**
 * Cio' che il foglio produce.
 *
 * `recurrence` e' **l'importo e il calendario esatti a cui i numeri annunciati
 * si riferiscono**: chi salva li rimette dentro `previewMaterialization` e
 * spende il permesso che ne esce, quindi cio' che si scrive e cio' che si e'
 * letto sono la stessa espressione.
 */
export interface RuleDraft {
  readonly recurrence: RecurrenceDraft
  readonly categoryId: string
  /**
   * Il giorno su cui i numeri annunciati sono stati calcolati.
   *
   * Viaggia col resto e non si rilegge dall'orologio al momento di scrivere, ed
   * e' tutta la differenza fra un rifiuto e un ricalcolo silenzioso: chi scrive
   * confronta questo giorno con il proprio (`redeemPreview`) e si accorge della
   * mezzanotte. Rileggendo l'orologio qui, un foglio confermato alle 23:59:50 e
   * salvato alle 00:00:05 scriverebbe **un'occorrenza in piu' di quelle
   * dichiarate**, e nessuno se ne accorgerebbe.
   */
  readonly day: IsoDate
}

/** Lo stesso tetto dell'inserimento: 99.999,99 €. Vedi AddSheet. */
const MAX_CENTS = 9_999_999

/**
 * L'intervallo che questo foglio **crea**. Sempre uno, ed e' una decisione
 * chiusa, non un pezzo mancante.
 *
 * Il motore accetta qualunque intervallo (ogni 2 settimane, ogni 3 mesi) e
 * l'elenco di Impostazioni sa gia' scriverlo: una regola trimestrale arrivata
 * da un backup si legge "ogni 3 mesi", giusta. Cio' che questo foglio dichiara
 * e' che non la **crea**: affitto, abbonamenti e palestra — cioe' tutto il caso
 * reale — hanno intervallo uno, e un selettore in piu' costerebbe una riga di
 * altezza a un foglio che sul viewport corto gia' scorre.
 *
 * In modifica **non si impone**: si tiene quello che la regola ha (vedi
 * `keep`). Riscriverlo a 1 vorrebbe dire che aprire una trimestrale per
 * cambiarle la categoria la trasforma in mensile, cioe' un campo che il foglio
 * non mostra cambiato da un gesto che non lo nomina.
 */
const INTERVAL = 1

const CADENCES: readonly { readonly value: Cadence; readonly key: 'rule.cadence.monthly' | 'rule.cadence.weekly' | 'rule.cadence.daily' }[] = [
  // Il mensile per primo e preselezionato: affitto e abbonamenti sono il caso
  // reale, e il caso reale non deve costare un tap. Gli altri due restano, e
  // restano allo stesso livello — nessun "avanzate", che sarebbe uno scroll
  // travestito.
  { value: 'monthly', key: 'rule.cadence.monthly' },
  { value: 'weekly', key: 'rule.cadence.weekly' },
  { value: 'daily', key: 'rule.cadence.daily' },
]

export function RuleSheet({
  categories,
  target,
  deletion,
  day,
  leaving,
  onSave,
  onDeactivate,
  onDelete,
  onClose,
}: Props) {
  const [cents, setCents] = useState(target?.amountCents ?? 0)
  const [categoryId, setCategoryId] = useState<string | null>(target?.categoryId ?? null)
  const [cadence, setCadence] = useState<Cadence>(target?.cadence ?? 'monthly')
  const [start, setStart] = useState<IsoDate>(target?.startDate ?? day)
  /** La firma della bozza confermata, o `null`. Vedi la testata. */
  const [armed, setArmed] = useState<string | null>(null)
  /** Cio' che la scrittura ha rifiutato, gia' in parole. Vedi `Props.onSave`. */
  const [refused, setRefused] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const done = useRef(false)

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
  }, [])

  const mode: RuleMode = target === null ? 'new' : target.active ? 'edit' : 'reactivate'
  const empty = cents === 0
  const atMax = cents > Math.floor(MAX_CENTS / 10)

  /**
   * I campi della regola che questo foglio **non mostra e non tocca**:
   * l'intervallo, il giorno d'ancoraggio, la data di fine, il segnaposto.
   *
   * Vanno riportati dentro la bozza perche' `reviseRecurringRule` riscrive
   * importo e calendario **dalla bozza e da nient'altro**: quello che non c'e'
   * scritto viene cancellato dal record. Senza queste tre righe, aprire una
   * regola con una data di fine per cambiarle la categoria le toglierebbe la
   * data di fine — un campo che il foglio non mostra, sparito per un gesto che
   * non lo nomina.
   *
   * Il segnaposto e' un caso a parte: non e' un campo modificabile, e' l'estremo
   * da cui si apre la finestra. Sta qui perche' l'anteprima di una regola gia'
   * materializzata deve partire da li' e non da `startDate`, o annuncerebbe
   * mesi di arretrati che sono gia' nello Storico.
   */
  const anchorDay = target?.anchorDay
  const endDate = target?.endDate
  const marker = target?.lastMaterializedDate
  const interval = target?.interval ?? INTERVAL

  function keep(): Pick<RecurrenceDraft, 'anchorDay' | 'endDate' | 'lastMaterializedDate'> {
    return {
      ...(anchorDay !== undefined ? { anchorDay } : {}),
      ...(endDate !== undefined ? { endDate } : {}),
      ...(marker !== undefined ? { lastMaterializedDate: marker } : {}),
    }
  }

  /**
   * Il calendario della regola: **quante occorrenze e quando**.
   *
   * Gira su una bozza che puo' essere a meta' — non lancia mai, e su una regola
   * non ancora leggibile rifiuta con un messaggio invece di lasciare la
   * schermata senza risposta.
   *
   * ## Perche' e' memoizzato, e perche' non sull'importo
   *
   * Le date dipendono da cadenza, giorno d'inizio, oggi e segnaposto. **Non
   * dall'importo**: l'unica cosa che l'importo decide e' il totale, che e' una
   * moltiplicazione. Senza questa distinzione l'intero calendario si
   * ricalcolerebbe a ogni cifra digitata, e il caso peggiore non e' teorico —
   * una giornaliera con inizio nel 2000 sono 9.728 occorrenze, misurate a
   * **8,85 ms per chiamata** su una macchina da sviluppo, cioe' qualche decina
   * di millisecondi sul telefono. Per tasto premuto, su una schermata dove il
   * riscontro deve arrivare entro 100 ms.
   *
   * L'importo sintetico e' `1` e non `cents` proprio per questo. Il totale vero
   * si riattacca sotto, ed e' **la stessa aritmetica** che fa il core
   * (`draft.amountCents * dates.length`), non una seconda regola.
   *
   * ## Il permesso che esce di qui non si spende mai
   *
   * Questo esito porta con se' una `ConfirmedPreview` che autorizzerebbe a
   * scrivere una regola da **0,01 €**: calendario giusto, importo finto. Non
   * esce da questa funzione — `shown` copia i numeri e basta — e chi scrive rifa'
   * l'anteprima con l'importo vero. Un calcolo per tap invece che per cifra, che
   * e' esattamente cio' che la scorciatoia comprava.
   */
  const schedule = useMemo(
    () =>
      previewMaterialization(
        {
          amountCents: 1,
          cadence,
          interval,
          startDate: start,
          ...(anchorDay !== undefined ? { anchorDay } : {}),
          ...(endDate !== undefined ? { endDate } : {}),
          ...(marker !== undefined ? { lastMaterializedDate: marker } : {}),
        },
        day,
      ),
    [cadence, start, day, interval, anchorDay, endDate, marker],
  )

  /**
   * **L'anteprima per mostrare**: i numeri, senza il permesso di scrivere.
   *
   * Campo per campo e non uno spread, ed e' la riga che chiude la trappola: `{
   * ...schedule, totalCents: cents * count }` trasportava anche `confirmed`,
   * cioe' il permesso calcolato sull'importo finto. Il tipo lo impedisce gia'
   * (`previewCopy` accetta una `MaterializationPreview`, che quel campo non ce
   * l'ha), e questa costruzione esplicita dice perche'.
   */
  const shown: MaterializationPreview | null = schedule.ok
    ? {
        count: schedule.count,
        firstDate: schedule.firstDate,
        lastDate: schedule.lastDate,
        totalCents: cents * schedule.count,
        backdated: schedule.backdated,
        dates: schedule.dates,
        truncated: schedule.truncated,
      }
    : null

  const draft: RecurrenceDraft = {
    amountCents: cents,
    cadence,
    interval,
    startDate: start,
    ...keep(),
  }

  // Senza importo l'anteprima direbbe "8 spese arretrate: ..., 0,00 € in
  // totale", che e' un numero vero e privo di senso: la riga in cima sta gia'
  // chiedendo l'importo, e il piede tace finche' non c'e' una cifra da
  // moltiplicare.
  const copy = shown !== null && !empty ? previewCopy(shown, draft, day, mode) : null

  /**
   * Cambiare uno di questi numeri cambia cosa verrebbe scritto. Gli ultimi due
   * non sono campi del foglio: sono i due estremi della finestra, e cambiano
   * **da soli** (la mezzanotte, una materializzazione altrove).
   */
  const signature = `${cents}|${cadence}|${start}|${day}|${marker ?? ''}`
  const confirmed = armed === signature
  const needsConfirm = copy?.confirm === true
  const ready = !empty && categoryId !== null && copy !== null && (!needsConfirm || confirmed)

  /**
   * Cio' che ogni modifica alla bozza deve fare, oltre a scrivere il proprio
   * campo: **spegnere la conferma** e togliere il messaggio di rifiuto, che
   * parlava di un tentativo su un'altra bozza.
   *
   * ## Perche' due difese e non una
   *
   * La firma da sola basterebbe a impedire il caso pericoloso — confermare "8
   * spese" e salvarne 231 — perche' cambiare qualcosa la fa smettere di
   * corrispondere. Ma non basta a impedire il caso **sorprendente**, e questo
   * l'ha trovato un test: confermato l'arretrato, cambiata la cadenza e poi
   * rimessa com'era, la firma tornava quella di prima e la casella **si
   * rispuntava da sola**. Non e' insicuro — cio' che era stato confermato e'
   * esattamente cio' che verrebbe scritto — ma una casella che si spunta senza
   * che nessuno l'abbia toccata e' l'ultima cosa da mettere dentro una
   * conferma.
   *
   * Quindi: `armed` si azzera **a ogni** modifica, e la firma resta come rete
   * sotto. Le due difese hanno mestieri diversi — l'azzeramento e' la cosa
   * giusta da fare, la firma e' la cosa che regge se un giorno qualcuno
   * aggiunge un campo e dimentica di azzerare.
   */
  function touch(): void {
    setRefused(null)
    setArmed(null)
  }

  function change<T>(set: (value: T) => void): (value: T) => void {
    return (value) => {
      set(value)
      touch()
    }
  }

  function digit(value: number): void {
    touch()
    setCents((amount) => (amount > Math.floor(MAX_CENTS / 10) ? amount : amount * 10 + value))
  }

  function save(): void {
    if (done.current || !ready || categoryId === null) return
    const problem = onSave({ recurrence: draft, categoryId, day })
    if (problem === null) {
      done.current = true
      return
    }
    // Il foglio resta aperto con tutto quello che si e' scelto. La conferma si
    // spegne: i numeri qui sotto sono gia' stati rifatti sul giorno nuovo (chi
    // salva ricalcola il giorno civile prima di provare), e una casella che
    // resta spuntata su numeri diversi da quelli che dichiarava e' proprio cio'
    // che il rifiuto e' venuto a dire.
    setRefused(problem)
    setArmed(null)
  }

  const inUse = deletion === null ? null : deletionRefusalText(deletion)

  const hint =
    atMax
      ? t('rule.hint.max')
      : empty
        ? t('rule.hint.empty')
        : categoryId === null
          ? t('rule.hint.category')
          : mode === 'reactivate'
            ? t('rule.hint.on')
            : mode === 'edit'
              ? t('rule.hint.edit')
              : t('rule.hint.check')

  return (
    <>
      <div class="scrim" data-leaving={leaving || undefined} onClick={onClose} />

      <div
        class="sheet sheet--rule"
        data-leaving={leaving || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t(mode === 'new' ? 'rule.label' : 'rule.label.edit')}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        {/* Due elementi che si escludono, e non uno con due stati.
            L'istruzione non ha `aria-live` — e' un'istruzione, si legge
            esplorando, e annunciarla a ogni cifra sarebbe rumore. Il rifiuto
            si', ed e' l'unico caso in cui una regione live esiste in questo
            foglio: e' una risposta a un tap, e chi l'ha dato deve saperlo
            senza rileggere lo schermo. Vive solo finche' c'e' qualcosa da
            dire, cosi' non annuncia mai il testo dell'altra riga. */}
        {refused === null ? (
          <p class="sheet__hint">{hint}</p>
        ) : (
          <p class="sheet__hint sheet__hint--long" role="status">
            {refused}
          </p>
        )}

        {/* Il corpo scorre, il piede no. E' il foglio delle categorie applicato
            qui: a 667 punti d'altezza questa colonna non ci sta, e cio' che
            **dichiara e conferma** non puo' finire sotto la linea di
            galleggiamento. A 844 non scorre niente. */}
        <div class="rule">
          <div class="cads" role="group" aria-label={t('rule.cadence')}>
            {CADENCES.map((option) => (
              <button
                key={option.value}
                type="button"
                class="cad"
                data-selected={cadence === option.value || undefined}
                aria-pressed={cadence === option.value}
                onClick={() => change(setCadence)(option.value)}
              >
                {t(option.key)}
              </button>
            ))}
          </div>

          {/* Da quando parte. **Le date passate non si vietano**: e' cosi' che
              si registra un affitto che esiste da mesi. Nessun `max`
              sull'input, quindi nemmeno le future — un abbonamento che comincia
              il mese prossimo e' altrettanto normale. */}
          <div class="starts" role="group" aria-label={t('rule.start')}>
            <button
              type="button"
              class="chip"
              aria-pressed={start === day}
              onClick={() => change(setStart)(day)}
            >
              {t('rule.start.today')}
            </button>
            {/* L'input copre tutto il chip: il tap apre direttamente la rotella
                di iOS. Un bottone che poi chiama `showPicker()` non funziona su
                Safari. */}
            <label class="chip chip--date" data-on={start !== day || undefined}>
              <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
              <span>{start === day ? t('rule.start.other') : dayChipLabel(start)}</span>
              <input
                class="chip__input"
                type="date"
                value={start}
                min="2000-01-01"
                aria-label={t('rule.start.pick')}
                onChange={(event) => {
                  const chosen = event.currentTarget.value
                  if (chosen !== '') change(setStart)(chosen)
                }}
              />
            </label>
          </div>

          {/* Gli stessi chip dell'inserimento, e qui **selezionano**: non
              salvano niente. Il selezionato ha contorno e superficie, non il
              solo colore. */}
          <div class="cats cats--pick" role="group" aria-label={t('rule.cats')}>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                class="cat"
                style={`--cat:${category.color}`}
                aria-pressed={categoryId === category.id}
                onClick={() => change(setCategoryId)(category.id)}
              >
                <span class="cat__emoji" aria-hidden="true">
                  {category.emoji}
                </span>
                <span class="cat__name">{category.name}</span>
              </button>
            ))}
          </div>

          {/* Le parti, non la stringa: i centesimi al 55% del corpo. Stesso
              cents-first, stessa virgola da 3 px, stesso rimedio. */}
          <p class="amount" data-empty={empty || undefined} aria-live="polite">
            {amountCells(cents).map((cell, index) => (
              <span class="amount__cell" data-kind={cell.kind} key={index}>
                {cell.text}
              </span>
            ))}
          </p>

          <Keypad
            atMax={atMax}
            canDelete={!empty}
            onDigit={digit}
            onBackspace={() => {
              touch()
              setCents((amount) => Math.floor(amount / 10))
            }}
            onClear={() => {
              touch()
              setCents(0)
            }}
          />

          {/* Cancellare davvero, in fondo al corpo che scorre e non nel piede:
              e' l'unica azione irreversibile di questo foglio, e non deve stare
              sotto il pollice di chi sta facendo altro. E' lo stesso blocco del
              foglio delle categorie, per la stessa domanda.

              Il bottone **esiste solo se il piano lo permette**; altrimenti al
              suo posto ci sono le parole con dentro il numero, e dicono che
              l'uscita e' "Disattiva" — che sta nel piede, senza niente davanti. */}
          {target === null ? null : (
            <div class="danger">
              {deletion?.ok === true ? (
                <>
                  <button type="button" class="danger__action" onClick={onDelete}>
                    {t('rule.delete')}
                  </button>
                  <p class="editor__note">{t('rule.delete.note')}</p>
                </>
              ) : inUse === null ? null : (
                <p class="editor__note">{inUse}</p>
              )}
            </div>
          )}
        </div>

        {/* Il piede: cosa succede, la conferma quando serve, e l'unico tap che
            scrive. Fuori dallo scroll, sempre. Le altezze sono riservate tutte
            e tre — anche quella della conferma, che compare solo con
            dell'arretrato: senza riserva, cambiare la data farebbe salire il
            bottone di 52px **mentre il pollice ci sta gia' andando**. */}
        <div class="rule__foot">
          {/* Niente `aria-live`: questa frase cambia **nello stesso frame**
              dell'importo, che e' gia' una regione live. Due `polite`
              aggiornate insieme mettono VoiceOver in coda e quella che conta
              arriva seconda. I numeri non restano muti: stanno nel nome della
              casella di conferma e nell'etichetta del bottone, cioe' sui due
              bersagli che si attraversano per scrivere. */}
          <p class="rule__preview">{copy?.text ?? ''}</p>

          <div class="rule__confirmSlot">
            {copy?.confirmLabel == null ? null : (
              <button
                type="button"
                class="rule__confirm"
                role="checkbox"
                aria-checked={confirmed}
                onClick={() => setArmed(confirmed ? null : signature)}
              >
                <span class="rule__box" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="m5 12.5 5 5 9-11" />
                  </svg>
                </span>
                <span class="rule__confirmText">{copy.confirmLabel}</span>
              </button>
            )}
          </div>

          {/* "Disattiva" accanto a "Salva", e **senza niente davanti**: e' la
              via che il rifiuto della cancellazione suggerisce, e una conferma
              davanti all'uscita di sicurezza la renderebbe scomoda proprio dove
              serve. Non e' distruttiva e si annulla dal toast. */}
          {mode === 'edit' ? (
            <div class="rule__row">
              <button type="button" class="rule__second" onClick={onDeactivate}>
                {t('rule.deactivate')}
              </button>
              <button type="button" class="save" disabled={!ready} onClick={save}>
                {copy?.saveLabel ?? t('rule.save.edit')}
              </button>
            </div>
          ) : (
            <button type="button" class="save" disabled={!ready} onClick={save}>
              {copy?.saveLabel ?? t(mode === 'new' ? 'rule.save' : 'rule.save.on')}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
