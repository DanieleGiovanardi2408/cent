import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { addDays, isBefore, isIsoDate, toDateParts } from '../core/date'
import type { IsoDate } from '../core/date'
import { previewMaterialization } from '../core/recurring-plan'
import type {
  ConfirmedPreview,
  MaterializationPreview,
  RecurrenceDraft,
  RecurrenceDraftCommon,
  RecurringRuleDeletion,
} from '../core/recurring-plan'
import type { Cadence, Category, RecurringRule, WithCadence } from '../core/types'
import { Keypad } from './Keypad'
import { deletionRefusalText, previewCopy, rewindCopy, rewindDraft } from './recurring-view'
import type { RuleMode } from './recurring-view'
import { amountCells, dayChipLabel, fullDayLabel, t } from './i18n'
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
 *
 * ## In modifica la data d'inizio si legge, e si sposta solo indietro (ADR 018)
 *
 * Fino a ieri quel campo era un `<input type="date">` come alla creazione, in
 * tutte e due le direzioni, e tutte e due erano rotte:
 *
 * - **indietro** la bozza conservava `lastMaterializedDate`, quindi la finestra
 *   restava chiusa e non nasceva niente. Il piede diceva "Non c'e' niente da
 *   recuperare" e aveva ragione: era un **no-op silenzioso**, cioe' un gesto che
 *   sembra fatto e non e' successo niente;
 * - **in avanti** le istanze gia' generate restavano prima dell'inizio
 *   dichiarato, che e' precisamente cio' che ADR 018 vieta.
 *
 * Quindi qui il campo non c'e' piu': c'e' **la data che la regola ha adesso**,
 * letta dal record, e un'azione sola. L'operazione e' `rewindRecurringRule`, che
 * scrive due campi (`startDate` nuova, segnaposto **rimosso**) e riporta la
 * regola nello stato di una **appena creata con quella data** — lo stesso ramo
 * del motore che percorre ogni creazione, non un ramo suo.
 *
 * ## Perche' il riavvolgimento e' un pannello e non tre righe in piu'
 *
 * Perche' questo e' gia' il foglio piu' alto dell'app, e in modifica scorre. Le
 * righe che servono — la data da scegliere, cosa succede, la conferma — non
 * possono aggiungersi sotto senza spingere fuori dalla vista qualcos'altro, e
 * cio' che sta in fondo al corpo e' il blocco della cancellazione.
 *
 * Quindi il pannello **sostituisce** corpo e piede invece di allungarli: nessun
 * overlay, nessun secondo foglio sopra il primo, e il bottone che scrive resta
 * esattamente dove stava. E' un cambio di modo, non una sovrapposizione — che e'
 * l'unica forma che la regola "Sovrapposizioni" ammette senza discutere.
 *
 * Entrarci **non salva** l'importo o la categoria che si stessero cambiando, e
 * uscirne li ritrova intatti: lo stato vive qui. Concludere il riavvolgimento
 * chiude il foglio e li lascia cadere, esattamente come fa gia' "Disattiva".
 */

interface Props {
  /** Le otto in griglia. Vedi `grid`: cio' che si offre e' l'unione con l'attuale. */
  readonly categories: readonly Category[]
  /**
   * La categoria che la regola ha **adesso**, anche se e' in archivio.
   *
   * Arriva da `App` insieme al bersaglio e non si ricava da `categories`: e'
   * proprio il caso in cui li' dentro non c'e'. `null` quando si crea una
   * regola nuova, che non ha ancora un valore attuale da conservare.
   */
  readonly current: Category | null
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
  /**
   * Sposta indietro la data d'inizio. **Asincrona**, a differenza delle altre
   * porte: il permesso lo da' il disco dentro la transazione, che ri-deriva
   * l'impronta dai record veri e la confronta con quella annunciata.
   *
   * Stessa convenzione di `onSave` per l'esito: `null` = e' andata e il foglio
   * si sta gia' chiudendo, una stringa e' **cio' che il foglio deve dire**.
   */
  readonly onRewind: (rewind: RuleRewind) => Promise<string | null>
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

/**
 * Cio' che il pannello del riavvolgimento consegna.
 *
 * `previewed` e' il permesso calcolato **sulla regola come sara' dopo** (data
 * nuova, nessun segnaposto): di li' la transazione spende il giorno civile e
 * l'impronta. `count` viaggia solo per il toast — quel numero e' stato
 * confermato dal confronto sull'impronta, quindi dirlo dopo non e' un secondo
 * calcolo, e' la stessa cifra che l'utente ha spuntato.
 */
export interface RuleRewind {
  readonly startDate: IsoDate
  readonly previewed: ConfirmedPreview
  readonly count: number
  /** Il giorno su cui i numeri sono stati calcolati. Come in `RuleDraft`. */
  readonly day: IsoDate
}

/** Lo stesso tetto dell'inserimento: 99.999,99 €. Vedi AddSheet. */
const MAX_CENTS = 9_999_999

/**
 * Il pavimento delle date, **lo stesso** del `min` dei due input.
 *
 * Serve anche a decidere se offrire l'azione: una regola che parte gia' di qui
 * non ha nessun giorno precedente da scegliere, e un bottone che apre un
 * pannello dove il selettore non ha valori validi e' un bottone che promette
 * qualcosa che non c'e'.
 */
const MIN_DATE = '2000-01-01'

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

/**
 * Il giorno del mese di una data, **senza lanciare** su una stringa che una
 * data non e'.
 *
 * `toDateParts` lancia, e questo gira dentro il render su un valore che arriva
 * da un `<input type="date">`. Oggi quel valore non puo' essere malformato; il
 * giorno in cui lo fosse, un'eccezione qui lascerebbe il foglio bianco invece
 * di lasciare che `previewMaterialization` lo rifiuti con delle parole — e
 * quel rifiuto arriva comunque, perche' controlla `startDate` **prima**
 * dell'ancora. Lo zero e' li' solo per non essere un'ancora valida.
 */
function dayOfMonth(date: IsoDate): number {
  return isIsoDate(date) ? toDateParts(date).day : 0
}

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
  current,
  target,
  deletion,
  day,
  leaving,
  onSave,
  onRewind,
  onDeactivate,
  onDelete,
  onClose,
}: Props) {
  const [cents, setCents] = useState(target?.amountCents ?? 0)
  const [categoryId, setCategoryId] = useState<string | null>(target?.categoryId ?? null)
  const [cadence, setCadence] = useState<Cadence>(target?.cadence ?? 'monthly')
  /**
   * La data d'inizio **di una regola nuova**, e solo di quella.
   *
   * In modifica non esiste uno stato: `start` si rilegge dal record a ogni
   * render (vedi sotto). Non e' un dettaglio di stile — e' cio' che rende il
   * no-op silenzioso **inesprimibile** invece che sconsigliato: non c'e' piu'
   * nessun modo di far divergere la data del foglio da quella del record senza
   * passare da `rewindRecurringRule`, che il segnaposto lo toglie.
   */
  const [newStart, setNewStart] = useState<IsoDate>(day)
  /** La firma della bozza confermata, o `null`. Vedi la testata. */
  const [armed, setArmed] = useState<string | null>(null)
  /** Cio' che la scrittura ha rifiutato, gia' in parole. Vedi `Props.onSave`. */
  const [refused, setRefused] = useState<string | null>(null)
  /** Il pannello che sposta indietro la data d'inizio e' aperto. */
  const [rewinding, setRewinding] = useState(false)
  /** Il giorno scelto li' dentro, o `null` finche' non se ne sceglie uno. */
  const [chosen, setChosen] = useState<IsoDate | null>(null)
  /** La firma del riavvolgimento confermato. Stesso meccanismo di `armed`. */
  const [armedBack, setArmedBack] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const done = useRef(false)
  /**
   * Un riavvolgimento e' in volo. E' un `ref` e non uno stato perche' non
   * dipinge niente: serve solo a non spedire due volte la stessa scrittura se
   * il pollice rimbalza. Niente spinner — e' una scrittura locale.
   */
  const sending = useRef(false)

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
  }, [])

  const mode: RuleMode = target === null ? 'new' : target.active ? 'edit' : 'reactivate'
  const empty = cents === 0
  const atMax = cents > Math.floor(MAX_CENTS / 10)

  /**
   * La data d'inizio che il foglio usa: **quella del record** quando ce n'e'
   * uno, quella che si sta scegliendo quando la regola e' nuova.
   *
   * ADR 019 applicato al campo piu' consequenziale che questo foglio abbia: in
   * modifica non c'e' nessun valore locale che possa differire da quello vero,
   * quindi la bozza non puo' annunciare un calendario che la regola non ha.
   */
  const start: IsoDate = target?.startDate ?? newStart
  /**
   * Si puo' spostare indietro? Solo se **esiste** un giorno precedente
   * scegliibile, cioe' se la regola non parte gia' dal pavimento delle date.
   */
  const canRewind = target !== null && isBefore(MIN_DATE, target.startDate)
  /** Il pannello e' aperto **e** ha un bersaglio: le due cose insieme, sempre. */
  const panel = rewinding && target !== null

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
   *
   * L'ancora esce da questo gruppo e passa in `calendar()`, che e' l'unico posto
   * in cui puo' stare da quando ADR 020 l'ha legata alla cadenza: qui restano i
   * due campi che dalla cadenza non dipendono.
   */
  const keptAnchor = target?.anchorDay
  const endDate = target?.endDate
  const marker = target?.lastMaterializedDate
  const interval = target?.interval ?? INTERVAL

  function keep(): Pick<RecurrenceDraftCommon, 'endDate' | 'lastMaterializedDate'> {
    return {
      ...(endDate !== undefined ? { endDate } : {}),
      ...(marker !== undefined ? { lastMaterializedDate: marker } : {}),
    }
  }

  /**
   * **Cadenza e ancora, nella stessa espressione**, perche' la seconda esiste
   * solo per uno dei valori della prima (ADR 020). E' l'unica forma che il tipo
   * accetta, ed e' anche l'unica in cui non si puo' dimenticare la meta'.
   *
   * ## Da dove viene l'ancora
   *
   * **In modifica: quella del record, tale e quale.** E' tutto il punto di
   * ADR 020 — il giorno del mese di una regola non si muove perche' si e' mosso
   * qualcos'altro. Spostare la data d'inizio di una regola "il 1 del mese" non
   * la trasforma in "il 5 del mese", e le istanze gia' generate il 1 restano in
   * calendario.
   *
   * **Alla creazione: il giorno di `startDate`.** Non e' la derivazione
   * implicita di prima spostata di un piano: quella girava a **ogni lettura**,
   * quindi il significato della regola cambiava ogni volta che `startDate` si
   * muoveva. Questa gira **una volta**, nel momento in cui un significato
   * precedente non esiste ancora — la stessa cosa, sullo stesso valore, che fa
   * la migrazione 3 -> 4 sui record gia' scritti. Da li' in poi nessuna
   * operazione la tocca piu'.
   *
   * Il caso misto — una settimanale che in modifica diventa mensile — cade nel
   * secondo ramo, ed e' giusto: un'ancora che non c'era non e' un'ancora da
   * conservare.
   *
   * ## Niente selettore del giorno del mese
   *
   * Il giorno si sceglie gia' scegliendo la data d'inizio, e un secondo
   * controllo direbbe la stessa cosa due volte in un foglio che a 667 punti
   * scorre gia'. Il caso che lo giustificherebbe — "parte il 5 ma pagalo il 27"
   * — non ha ancora prodotto nessuna richiesta.
   *
   * ## Non era l'unico modo di separare l'ancora dalla data d'inizio
   *
   * Questa riga diceva che un selettore del giorno sarebbe stato **l'unico**
   * ingresso a una regola la cui prima occorrenza non cade su `startDate`. Non
   * lo era gia' allora: il **pannello del riavvolgimento** fa la stessa cosa, e
   * apposta — sposta `startDate` indietro tenendo l'ancora del record (ADR 020).
   * Una mensile ancorata al 15 che parte il 15 settembre, riportata al 5,
   * riaperta in modifica, e' esattamente quello stato.
   *
   * Il costo si e' visto li': il piede annunciava *"Prima spesa: 5 settembre"*
   * ripiegando su `draft.startDate` per mancanza di una data calcolata. Adesso
   * il giorno arriva da `nextDate`, che il core calcola con la stessa funzione
   * della materializzazione, quindi la separazione fra ancora e inizio non ha
   * piu' una frase da far mentire — da qui **o** da un eventuale selettore.
   */
  function calendar(): WithCadence<unknown> {
    if (cadence !== 'monthly') return { cadence }
    return { cadence, anchorDay: keptAnchor ?? dayOfMonth(start) }
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
          interval,
          startDate: start,
          ...keep(),
          ...calendar(),
        },
        day,
      ),
    [cadence, start, day, interval, keptAnchor, endDate, marker],
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
        nextDate: schedule.nextDate,
        backdated: schedule.backdated,
      }
    : null

  const draft: RecurrenceDraft = {
    amountCents: cents,
    interval,
    startDate: start,
    ...keep(),
    ...calendar(),
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

  /* --- spostare indietro la data d'inizio (ADR 018) ----------------------- */

  /**
   * Il giorno scelto, **se e' davvero precedente**. `null` altrimenti, e quel
   * `null` e' l'unico verso: senza una data precedente non c'e' anteprima,
   * quindi non c'e' niente da confermare e il bottone resta spento.
   *
   * Il `max` sull'input lo impedisce gia' quasi ovunque; questa riga e' cio' che
   * regge dove un selettore non lo rispetta, e ha una frase che lo dice invece
   * di ignorare il tap in silenzio.
   */
  const backTo =
    target !== null && chosen !== null && isBefore(chosen, target.startDate) ? chosen : null

  /**
   * L'anteprima del riavvolgimento, sulla regola **come sara' dopo**.
   *
   * Memoizzata come `schedule`, e per lo stesso motivo: una giornaliera
   * retrodatata al 2000 sono 9.728 occorrenze, e senza memo si ricalcolerebbero
   * a ogni tap sulla casella di conferma. Le dipendenze sono tutte quelle che
   * entrano nei numeri — la regola (identita' compresa: cambia quando il mirror
   * la riscrive), la data scelta, e il giorno civile.
   */
  const rewind = useMemo(
    () => (target === null || backTo === null ? null : previewMaterialization(rewindDraft(target, backTo), day)),
    [target, backTo, day],
  )

  /**
   * I numeri del riavvolgimento, **senza il permesso**, come `shown`.
   *
   * Qui il permesso sarebbe innocuo — l'importo dentro e' quello vero, non
   * `1` — ma la firma di `rewindCopy` non lo accetta lo stesso: la separazione
   * fra anteprima-per-mostrare e anteprima-per-scrivere e' una proprieta' del
   * tipo, non una cosa da riconsiderare caso per caso.
   */
  const backCopy =
    rewind?.ok === true && backTo !== null
      ? rewindCopy(
          {
            count: rewind.count,
            firstDate: rewind.firstDate,
            lastDate: rewind.lastDate,
            totalCents: rewind.totalCents,
            nextDate: rewind.nextDate,
            backdated: rewind.backdated,
          },
          backTo,
          day,
        )
      : null

  /**
   * Cosa e' stato confermato. Come `signature`, e con dentro le stesse cose che
   * cambiano da sole: il giorno civile, e `updatedAt` della regola — che si
   * muove se un altro contesto ne cambia l'importo, cioe' proprio il caso in cui
   * il totale annunciato smetterebbe di essere quello che si scrive.
   */
  const backSignature = `${backTo ?? ''}|${day}|${target?.updatedAt ?? ''}`
  const backConfirmed = armedBack === backSignature
  const backReady =
    backCopy !== null && (backCopy.confirmLabel === null || backConfirmed) && !sending.current

  /** Entra e esce dal pannello. Tutto cio' che si era scelto **resta**. */
  function toggleRewind(open: boolean): void {
    setRewinding(open)
    setChosen(null)
    setArmedBack(null)
    setRefused(null)
  }

  /**
   * Scrive. Nessuno spinner e nessun ottimismo: e' l'unica scrittura di questo
   * foglio che puo' dire di no **per una ragione che l'utente deve leggere**,
   * e il rifiuto e' la sua unica ragione di esistere. Il pannello resta dov'e'
   * con i numeri gia' rifatti sotto gli occhi, e la casella si spegne — cio'
   * che era stato confermato non e' piu' cio' che verrebbe scritto.
   */
  function commitRewind(): void {
    if (sending.current || !backReady || backTo === null || rewind?.ok !== true) return
    sending.current = true
    void onRewind({ startDate: backTo, previewed: rewind.confirmed, count: rewind.count, day })
      .then((problem) => {
        // Andata: il foglio si sta chiudendo, e `sending` resta alzato apposta —
        // un secondo tap durante l'animazione d'uscita non deve ripartire.
        if (problem === null) return
        sending.current = false
        setRefused(problem)
        setArmedBack(null)
      })
      .catch(() => {
        sending.current = false
        setRefused(t('rule.hint.failed'))
        setArmedBack(null)
      })
  }

  const inUse = deletion === null ? null : deletionRefusalText(deletion)

  /**
   * I chip che si offrono: **{ le attive } unito { quella che la regola ha
   * adesso }** — ADR 019.
   *
   * ## Il difetto che chiude
   *
   * Archiviare una categoria non ha vincoli e non avvisa nessuno che una regola
   * la usa. Senza l'unione, la regola dell'affitto su "Casa" archiviata apriva
   * un foglio con **nessun chip premuto**, mentre l'elenco dietro continuava —
   * giustamente — a chiamarla "Casa": due risposte diverse alla stessa domanda,
   * in due schermate adiacenti. Il gesto naturale — toccare un chip per
   * sistemare — spostava l'affitto su un'altra categoria in silenzio, e da li'
   * in poi ci finivano tutte le spese generate.
   *
   * ## Perche' e' in fondo e marcata
   *
   * In fondo perche' le prime otto devono restare **nelle stesse posizioni**
   * della griglia d'inserimento: si tocca per posizione, non leggendo
   * l'etichetta. Marcata perche' un chip che compare senza distinzione fra gli
   * altri direbbe che quella categoria e' ancora scegliibile, il che sarebbe
   * falso nell'altro verso.
   *
   * Il nono chip fa crescere la griglia di una riga, e il corpo di questo
   * foglio scorre gia' in modifica: e' il prezzo dichiarato, e si paga solo nel
   * caso che lo richiede.
   */
  const orphan =
    current !== null && !categories.some((category) => category.id === current.id)
      ? current
      : null
  const grid = orphan === null ? categories : [...categories, orphan]

  const hint = panel
    ? t('rewind.hint')
    : atMax
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
        aria-label={t(panel ? 'rewind.action' : mode === 'new' ? 'rule.label' : 'rule.label.edit')}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          // Dal pannello, Escape **torna indietro** invece di chiudere tutto:
          // e' un modo dentro il foglio, e uscire da un modo non e' uscire dal
          // foglio. Su iOS non c'e' un Escape, quindi la via che conta e' il
          // bottone accanto a quello che scrive — questo e' il di piu' per chi
          // ha una tastiera.
          if (event.key !== 'Escape') return
          if (panel) toggleRewind(false)
          else onClose()
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

        {rewinding && target !== null ? (
          <>
            {/* Il pannello che sposta indietro. **Sostituisce** corpo e piede:
                nessun overlay, e il bottone che scrive resta dove stava. Il
                corpo e' lo stesso contenitore che scorre — qui ci sta comodo,
                ma la classe porta con se' `.rule > * { flex: none }`, che e' la
                riga che impedisce a un blocco di accorciarsi e finire dipinto
                sopra il fratello dopo. */}
            <div class="rule">
              {/* Il fatto, prima della scelta: da quando parte **adesso**. */}
              <p class="rewind__now">
                {t('rewind.now', { day: fullDayLabel(target.startDate, day) })}
              </p>

              {/* Un solo verso. `max` e' il giorno **prima** di quello attuale:
                  la rotella di iOS non offre nemmeno le date che non vanno, e
                  `backTo` regge sotto per i selettori che il `max` non lo
                  guardano. */}
              <div class="starts">
                <label class="chip chip--date" data-on={backTo !== null || undefined}>
                  <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="16" rx="3" />
                    <path d="M3 10h18M8 3v4M16 3v4" />
                  </svg>
                  <span>{chosen === null ? t('rewind.pick.none') : dayChipLabel(chosen)}</span>
                  <input
                    class="chip__input"
                    type="date"
                    value={chosen ?? ''}
                    min={MIN_DATE}
                    max={addDays(target.startDate, -1)}
                    aria-label={t('rewind.pick')}
                    onChange={(event) => {
                      const picked = event.currentTarget.value
                      if (picked === '') return
                      setChosen(picked)
                      setArmedBack(null)
                      setRefused(null)
                    }}
                  />
                </label>
              </div>

              {/* Il verso sbagliato non si ignora: si dice. Un tap che non
                  produce niente e non spiega niente e' il difetto da cui e'
                  partita tutta questa storia. */}
              {chosen !== null && backTo === null ? (
                <p class="editor__note rewind__wrong" role="status">
                  {t('rewind.notEarlier', {
                    day: fullDayLabel(chosen, day),
                    current: fullDayLabel(target.startDate, day),
                  })}
                </p>
              ) : null}

              {/* Le due promesse di ADR 018, dette **prima** del tap: e' cio'
                  che rende sicuro riaprire la finestra, e chi sta per creare
                  decine di spese in un colpo ha il diritto di saperlo. */}
              <p class="editor__note">{t('rewind.note')}</p>
            </div>

            {/* Lo stesso piede, con gli stessi tre posti: cosa succede, la
                conferma quando c'e' qualcosa da confermare, e l'unico tap che
                scrive. Le altezze sono riservate dalle stesse regole. */}
            <div class="rule__foot">
              <p class="rule__preview">{backCopy?.text ?? ''}</p>

              <div class="rule__confirmSlot">
                {backCopy?.confirmLabel == null ? null : (
                  <button
                    type="button"
                    class="rule__confirm"
                    role="checkbox"
                    aria-checked={backConfirmed}
                    onClick={() => setArmedBack(backConfirmed ? null : backSignature)}
                  >
                    <span class="rule__box" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="16" height="16">
                        <path d="m5 12.5 5 5 9-11" />
                      </svg>
                    </span>
                    <span class="rule__confirmText">{backCopy.confirmLabel}</span>
                  </button>
                )}
              </div>

              <div class="rule__row">
                <button type="button" class="rule__second" onClick={() => toggleRewind(false)}>
                  {t('rewind.back')}
                </button>
                <button
                  type="button"
                  class="save"
                  disabled={!backReady}
                  onClick={commitRewind}
                >
                  {backCopy?.saveLabel ?? t('rewind.save.none')}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
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

            {/* Da quando parte.

                **Alla creazione si sceglie liberamente.** Le date passate non si
                vietano — e' cosi' che si registra un affitto che esiste da mesi —
                e nemmeno le future: un abbonamento che comincia il mese prossimo
                e' altrettanto normale. E' anche il momento in cui l'ancora
                mensile si deriva, una volta sola (ADR 020).

                **In modifica si legge.** Vedi la testata: in avanti orfanerebbe
                le istanze gia' generate, indietro non generava niente. L'unica
                azione e' il pannello, e la data resta quella del record. */}
            {target === null ? (
              <div class="starts" role="group" aria-label={t('rule.start')}>
                <button
                  type="button"
                  class="chip"
                  aria-pressed={start === day}
                  onClick={() => change(setNewStart)(day)}
                >
                  {t('rule.start.today')}
                </button>
                {/* L'input copre tutto il chip: il tap apre direttamente la
                    rotella di iOS. Un bottone che poi chiama `showPicker()` non
                    funziona su Safari. */}
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
                    min={MIN_DATE}
                    aria-label={t('rule.start.pick')}
                    onChange={(event) => {
                      const picked = event.currentTarget.value
                      if (picked !== '') change(setNewStart)(picked)
                    }}
                  />
                </label>
              </div>
            ) : (
              <div class="starts starts--read" role="group" aria-label={t('rule.start')}>
                <p class="starts__now">{t('rewind.now', { day: fullDayLabel(start, day) })}</p>
                {canRewind ? (
                  <button type="button" class="starts__back" onClick={() => toggleRewind(true)}>
                    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                      <path d="M14 6 8 12l6 6" />
                    </svg>
                    <span>{t('rewind.action')}</span>
                  </button>
                ) : null}
              </div>
            )}

            {/* Gli stessi chip dell'inserimento, e qui **selezionano**: non
                salvano niente. Il selezionato ha contorno e superficie, non il
                solo colore. */}
            <div class="cats cats--pick" role="group" aria-label={t('rule.cats')}>
              {grid.map((category) => {
                const outside = category.id === orphan?.id
                return (
                  <button
                    key={category.id}
                    type="button"
                    class="cat"
                    style={`--cat:${category.color}`}
                    data-current={outside || undefined}
                    aria-pressed={categoryId === category.id}
                    onClick={() => change(setCategoryId)(category.id)}
                  >
                    <span class="cat__emoji" aria-hidden="true">
                      {category.emoji}
                    </span>
                    <span class="cat__name">{category.name}</span>
                    {/* Testo vero dentro il bersaglio, non un `title` e non un
                        solo contorno: entra nel nome accessibile del chip senza
                        un `aria-label` che dovrebbe poi ripetere anche il nome
                        della categoria. */}
                    {outside ? <span class="cat__tag">{t('pick.current')}</span> : null}
                  </button>
                )
              })}
            </div>

            {/* Perche' c'e' un nono chip, con dentro il nome vero. Il fatto e'
                verificabile: una categoria che una regola usa non si puo'
                cancellare, quindi sta sempre in Impostazioni fra le archiviate. */}
            {orphan === null ? null : (
              <p class="editor__note rule__current">
                {t('rule.cats.current', { name: orphan.name })}
              </p>
            )}

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
          </>
        )}
      </div>
    </>
  )
}
