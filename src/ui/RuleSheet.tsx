import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { IsoDate } from '../core/date'
import { previewMaterialization } from '../core/recurring-plan'
import type { Cadence, Category } from '../core/types'
import { Keypad } from './Keypad'
import { previewCopy } from './recurring-view'
import { amountCells, dayChipLabel, t } from './i18n'
import './sheet.css'
// I chip della data e la griglia delle categorie sono **gli stessi**
// dell'inserimento; `.save` e' **lo stesso** bottone del budget, per lo stesso
// ruolo. Gli import sono dichiarativi (il CSS finisce nel bundle una volta
// sola) e dicono che queste dipendenze esistono: chi cambia il chip li' cambia
// anche questo foglio, ed e' voluto.
import './AddSheet.css'
import './BudgetSheet.css'
import './RuleSheet.css'

/**
 * Creare una spesa fissa: importo, categoria, ogni quanto, da quando.
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
 * ## La conferma non compare sempre, ed e' il punto
 *
 * Solo quando `backdated` e' vero. Una regola che parte oggi da' `count: 1,
 * backdated: false` e non ha niente da confermare — **una conferma che compare
 * sempre smette di essere letta**, come un indicatore che grida tutti i mesi
 * nello stesso giorno.
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
 * E' agganciata alla **firma** della bozza (importo, cadenza, data d'inizio),
 * non a un booleano: cambiare la data dopo aver spuntato la casella la spegne,
 * perche' cio' che si era confermato non e' piu' cio' che verrebbe scritto.
 * Un booleano avrebbe lasciato confermare "8 spese, 7.200 €" e salvare "24
 * spese, 21.600 €".
 */

interface Props {
  readonly categories: readonly Category[]
  /** Il giorno civile corrente, calcolato al risveglio e non a ogni render. */
  readonly day: IsoDate
  readonly leaving: boolean
  /** `false` = non e' andata. Il foglio resta aperto e riprovabile. */
  readonly onSave: (input: RuleDraft) => boolean
  readonly onClose: () => void
}

/** Cio' che il foglio produce. `interval` non c'e': vedi sotto. */
export interface RuleDraft {
  readonly amountCents: number
  readonly categoryId: string
  readonly cadence: Cadence
  readonly startDate: IsoDate
}

/** Lo stesso tetto dell'inserimento: 99.999,99 €. Vedi AddSheet. */
const MAX_CENTS = 9_999_999

/**
 * L'intervallo che questo foglio produce. **Sempre uno**, ed e' una decisione
 * chiusa, non un pezzo mancante.
 *
 * Il motore accetta qualunque intervallo (ogni 2 settimane, ogni 3 mesi) e
 * l'elenco di Impostazioni sa gia' scriverlo: una regola trimestrale arrivata
 * da un backup si legge "ogni 3 mesi", giusta. Cio' che questo foglio dichiara
 * e' che non la **crea**: affitto, abbonamenti e palestra — cioe' tutto il caso
 * reale — hanno intervallo uno, e un selettore in piu' costerebbe una riga di
 * altezza a un foglio che sul viewport corto gia' scorre.
 *
 * Il giorno in cui servisse, il posto e' questa costante e il campo esiste gia'
 * in `NewRecurringRule`: non c'e' niente da disfare.
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

export function RuleSheet({ categories, day, leaving, onSave, onClose }: Props) {
  const [cents, setCents] = useState(0)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [cadence, setCadence] = useState<Cadence>('monthly')
  const [start, setStart] = useState<IsoDate>(day)
  /** La firma della bozza confermata, o `null`. Vedi la testata. */
  const [armed, setArmed] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const done = useRef(false)

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
  }, [])

  const empty = cents === 0
  const atMax = cents > Math.floor(MAX_CENTS / 10)

  /**
   * Il calendario della regola: **quante occorrenze e quando**.
   *
   * Gira su una bozza che puo' essere a meta' — non lancia mai, e su una regola
   * non ancora leggibile rifiuta con un messaggio invece di lasciare la
   * schermata senza risposta.
   *
   * ## Perche' e' memoizzato, e perche' su tre cose e non quattro
   *
   * Le date dipendono da cadenza, giorno d'inizio e oggi. **Non dall'importo**:
   * l'unica cosa che l'importo decide e' il totale, che e' una
   * moltiplicazione. Senza questa distinzione l'intero calendario si
   * ricalcolerebbe a ogni cifra digitata, e il caso peggiore non e' teorico —
   * una giornaliera con inizio nel 2000 sono 9.728 occorrenze, misurate a
   * **8,85 ms per chiamata** su una macchina da sviluppo, cioe' qualche decina
   * di millisecondi sul telefono. Per tasto premuto, su una schermata dove il
   * riscontro deve arrivare entro 100 ms.
   *
   * Con l'importo fuori dalle dipendenze, digitare costa una moltiplicazione: il
   * calendario si rifa' solo quando si tocca la cadenza o la data, cioe' una
   * volta per gesto invece che una per cifra.
   *
   * L'importo sintetico e' `1` e non `cents` proprio per questo. Il totale vero
   * si riattacca sotto, ed e' **la stessa aritmetica** che fa il core
   * (`draft.amountCents * dates.length`), non una seconda regola.
   */
  const schedule = useMemo(
    () =>
      previewMaterialization(
        { amountCents: 1, cadence, interval: INTERVAL, startDate: start },
        day,
      ),
    [cadence, start, day],
  )
  const preview = schedule.ok ? { ...schedule, totalCents: cents * schedule.count } : schedule
  // Senza importo l'anteprima direbbe "8 spese arretrate: ..., 0,00 € in
  // totale", che e' un numero vero e privo di senso: la riga in cima sta gia'
  // chiedendo l'importo, e il piede tace finche' non c'e' una cifra da
  // moltiplicare.
  const copy = preview.ok && !empty ? previewCopy(preview, start, day) : null

  /** Cambiare uno di questi tre numeri cambia cosa verrebbe scritto. */
  const signature = `${cents}|${cadence}|${start}`
  const confirmed = armed === signature
  const needsConfirm = copy?.confirm === true
  const ready = !empty && categoryId !== null && copy !== null && (!needsConfirm || confirmed)

  /**
   * Cio' che ogni modifica alla bozza deve fare, oltre a scrivere il proprio
   * campo: **spegnere la conferma** e togliere il messaggio d'errore, che
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
    setFailed(false)
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
    if (onSave({ amountCents: cents, categoryId, cadence, startDate: start })) done.current = true
    else setFailed(true)
  }

  const hint = failed
    ? t('rule.hint.failed')
    : atMax
      ? t('rule.hint.max')
      : empty
        ? t('rule.hint.empty')
        : categoryId === null
          ? t('rule.hint.category')
          : t('rule.hint.check')

  return (
    <>
      <div class="scrim" data-leaving={leaving || undefined} onClick={onClose} />

      <div
        class="sheet sheet--rule"
        data-leaving={leaving || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t('rule.label')}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        {/* Niente `aria-live`, per la ragione che vale in tutti e tre i fogli:
            e' un'istruzione, non un valore. Si legge esplorando. */}
        <p class="sheet__hint" data-tone={failed ? 'error' : undefined}>{hint}</p>

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

          <button type="button" class="save" disabled={!ready} onClick={save}>
            {copy?.saveLabel ?? t('rule.save')}
          </button>
        </div>
      </div>
    </>
  )
}
