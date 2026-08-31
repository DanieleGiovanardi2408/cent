import { Fragment } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { Budget, BudgetPeriod, Category, Expense, RecurringRule } from '../core/types'
import { isBefore } from '../core/date'
import type { IsoDate } from '../core/date'
import { periodRange } from '../core/budget'
import { daysLabel, money, periodRangeLabel, t } from './i18n'
import { firstPeriodStart, shiftPeriod, statsView } from './stats-view'
import type {
  Breakdown,
  BreakdownSection,
  BreakdownSplit,
  CategorySlice,
  PeriodBar,
  Trend,
} from './stats-view'
import './Stats.css'

/**
 * Le Statistiche. **Questo file non decide niente**: `stats-view.ts` gli
 * consegna righe con frazioni gia' calcolate, e qui diventano larghezze.
 *
 * ## Perche' non c'e' un tooltip
 *
 * La regola della disciplina dei grafici e' *"il lettore deve poter ottenere il
 * valore esatto"*, e il tooltip e' **un'implementazione** di quella regola su uno
 * schermo grande, dove il valore non e' scritto. Qui il valore e' scritto
 * accanto a ogni barra: la regola e' soddisfatta, non aggirata.
 *
 * E due ragioni pratiche che chiuderebbero comunque il caso: su iOS un tooltip a
 * tap introduce un secondo gesto per chiuderlo, che compete con la chiusura del
 * foglio; e un overlay in alto finisce sotto il notch, che e' proprio la classe
 * di difetti che la suite non puo' vedere per costruzione.
 *
 * ## E perche' non c'e' una vista tabellare gemella
 *
 * Perche' **il grafico e' gia' la tabella**: nome a sinistra, barra al centro,
 * importo a destra. Una seconda vista sarebbe una parafrasi del grafico promossa
 * a schermata — due rappresentazioni dello stesso dato che possono divergere
 * senza che nessun test se ne accorga, perche' entrambe sarebbero "corrette".
 *
 * Il vincolo che una tabella avrebbe soddisfatto — quattro degli otto colori
 * stanno sotto 3:1 sul fondo in tema chiaro, uno in tema scuro, misurato — e'
 * soddisfatto qui in due modi: **l'etichetta e' sempre visibile**, e ogni barra
 * porta un **contorno**, cosi' la forma si vede anche dove il riempimento non si
 * stacca.
 */

interface Props {
  readonly phase: string
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly rules: readonly RecurringRule[]
  readonly budgets: readonly Budget[]
  readonly period: BudgetPeriod
  readonly day: IsoDate
}

const pct = (value: number): string =>
  `${(Math.max(0, Math.min(1, value)) * 100).toFixed(4)}%`

/**
 * L'identita' della riga aggregata delle orfane, dentro una parte. Non e' un id:
 * non ne ha uno, e `null` non e' un'identita'. E' una costante che non puo'
 * collidere con un UUID.
 */
const ORPHAN = 'stats:orphan'

/**
 * Il riempimento di una riga di A.
 *
 * Il colore dell'aggregato delle orfane **non** e' `--brand`: quello e' il colore
 * delle barre di B, e una riga che nomina un'assenza non deve leggersi come una
 * categoria vera che ha scelto il verde del marchio. Un neutro dice "qui un
 * colore non c'e'", che e' esattamente il fatto.
 */
const fill = (row: CategorySlice): string | null =>
  row.orphan ? 'var(--text-muted)' : row.color

/**
 * Come si chiama una riga di A.
 *
 * L'aggregato delle spese senza categoria porta **`row.categoryRemoved`**, cioe'
 * la stessa chiave che gia' usano lo Storico, le azioni sulla spesa, i costi
 * fissi e la correzione dell'importo per lo stesso fatto. Una parola nuova qui
 * sarebbe la quinta parafrasi della stessa cosa, e l'utente deve poter
 * riconoscere nello Storico le spese che questa riga somma.
 *
 * Si discrimina su `row.orphan` e non su `row.name === null`: il discriminante
 * esiste apposta, e leggere l'assenza da un campo annullabile e' come dedurre lo
 * stato da un valore invece che dal fatto.
 */
function sliceLabel(row: CategorySlice): string {
  return row.orphan ? t('row.categoryRemoved') : row.name
}

/* --- le due viste di una sezione ---------------------------------------- */

/**
 * **Le due domande a cui una sezione sa rispondere**, e fra cui si commuta.
 *
 * Non sono due quantita' di dato: sono **due domande sullo stesso dato**, ed e'
 * per questo che nessuna delle due nasconde niente.
 *
 * - `quote` — *"quanto pesa cosa"*. La ciambella, con il totale nel buco e la
 *   legenda sotto. Le fette stanno **nell'ordine delle categorie**.
 * - `ordine` — *"quanto e' grande cosa, in ordine"*. Le barre, dalla piu' lunga.
 *
 * ## La ragione che questo commento **non** da', perche' e' caduta
 *
 * Fino al 30 agosto il tap si giustificava con *"la ciambella mostra le prime N,
 * le barre tutte"*. Quella ragione e' morta insieme alla coda `Altre`, che non
 * e' mai stata scritta: **la copertura e' completa in tutte e due le viste**, e
 * la somma delle fette, la somma delle barre e il numero nel buco sono lo stesso
 * numero — c'e' un test che li confronta tutti e tre.
 *
 * Cio' che resta e' piu' piccolo ed e' vero. Se un giorno non bastera' piu', il
 * comando si toglie **per quello che e'**, non perche' una giustificazione
 * inventata avra' smesso di reggere.
 */
type Vista = 'quote' | 'ordine'

/* Qui c'era `VISTE`, l'elenco delle due nell'ordine in cui stavano nel comando.
 * Il comando non c'e' piu' e l'elenco se n'e' andato con lui invece di restare
 * come superficie che nessuno legge: le due viste adesso non hanno un ordine,
 * hanno **un gesto che le scambia**. */

/* **`PIE_MIN_SLICES` non c'e' piu': era `BREAKDOWN_MIN_ROWS` con un altro nome.**
 *
 * Tutte e due valevano 3, tutte e due per parte, e dal 31 agosto scattano nello
 * stesso punto e dicono la stessa cosa — *questa parte ha abbastanza righe per
 * essere un grafico*. La ciambella e le barre sono le **due viste dello stesso
 * grafico**, non due grafici con due minimi: due numeri uguali con due nomi sono
 * due posti in cui divergere.
 *
 * La condizione arriva adesso dal modello (`part.asChart`), che e' anche il posto
 * in cui sta scritta la scala 0/1/2/3+ con la sua data. */

/**
 * La geometria della ciambella, in unita' del `viewBox`. Alla dimensione di
 * testo di sistema predefinita il disegno e' **1:1** — `--pie-size` vale
 * `7.5rem`, cioe' 120 px — quindi i numeri qui sotto sono i pixel veri.
 *
 * **I due file devono restare d'accordo**: `PIE_GAP` e' un vuoto in **pixel**, e
 * lo e' solo finche' l'unita' del `viewBox` vale un pixel. Se qualcuno cambia
 * `--pie-size` senza cambiare `PIE_BOX`, il vuoto si scala con la figura e
 * smette di essere il numero scritto qui. C'e' un test che rimisura l'angolo del
 * vuoto sui pixel dipinti, ed e' li' per questo.
 *
 * Se qualcuno ingrandisce il testo di sistema il riquadro cresce e **cresce
 * tutto insieme**, vuoto compreso: e' il verso giusto, perche' un vuoto da 2 px
 * dentro una figura larga il doppio smetterebbe di separare.
 *
 * - `PIE_BOX` — 120, l'unico numero scelto. Il conto che ce l'ha portato sta in
 *   `Stats.css`, su `--pie-size`: e' quanto costa in altezza, misurato contro la
 *   piega di B.
 * - `PIE_RING` — 20, e **non e' piu' `--bar-h`.** Qui c'era scritto *"e' lo
 *   stesso inchiostro delle barre, e due spessori diversi nella stessa
 *   schermata si leggerebbero come due tipi di grafico"*. L'argomento era vero
 *   sotto la sua condizione — la ciambella stava **dentro l'intestazione, a
 *   fianco delle barre della propria sezione**, e i due spessori si toccavano
 *   con l'occhio. Adesso la ciambella **sostituisce** quelle barre: nella vista
 *   `quote` non ce n'e' nessuna a schermo, e cio' che resta a `--bar-h` e' la
 *   barra divisa in cima, che e' un'altra domanda e ha gia' un'altra forma
 *   (dritta contro circolare).
 *
 *   Il numero si ri-deriva quindi da cio' che la banda deve fare qui: lasciare
 *   un **buco che tenga il totale**. Con lato 120 e anello 20 il buco vale
 *   `120 - 40 = 80 px`, e `112,00 €` a `--fs-200` tabulari ne misura **66,77**;
 *   con l'anello a 24 il buco scenderebbe a 72 e il margine da 13,2 a 5,2 px,
 *   cioe' un numero che la prossima cifra o il prossimo font si mangia. Il
 *   rapporto banda/raggio resta 0,33, dentro l'intervallo in cui una ciambella
 *   si legge come tale invece che come una torta.
 * - `PIE_GAP` — 2, il vuoto nella superficie fra due fette che **si toccano**.
 *   La condizione, riscritta qui perche' e' qui che vale: due fette adiacenti
 *   condividono un raggio, e senza il vuoto `Fuori` e `Coffeeshop` (26,00 e
 *   24,00, due tinte vicine) diventano una macchia sola. Un contorno
 *   aggiungerebbe una terza tinta **proprio sul confine**, cioe' dove serve
 *   leggere dove finisce l'una.
 *
 * Il raggio e' quello **medio** dell'anello, perche' la ciambella si disegna
 * come un cerchio **tratteggiato**: un `<circle>` per fetta, con
 * `stroke-dasharray` a produrre l'arco e `stroke-dashoffset` a metterlo al suo
 * posto. Non ci sono archi scritti a mano (`A`), nessun seno e nessun coseno, e
 * il taglio fra due fette esce **radiale** per costruzione.
 */
export const PIE_BOX = 120
export const PIE_RING = 20
export const PIE_GAP = 2
export const PIE_R = (PIE_BOX - PIE_RING) / 2
export const PIE_C = 2 * Math.PI * PIE_R

/**
 * Una fetta, gia' in unita' di tratteggio: **niente da decidere in JSX**.
 *
 * `fill` e' `null` con lo stesso significato che ha su `Row`, e il ripiego e' lo
 * stesso — `var(--brand)`. Non e' una seconda regola sul colore: e' la stessa
 * espressione, scritta una volta per la barra e una per la fetta, sulla stessa
 * funzione `fill()`.
 */
interface PieSlice {
  readonly key: string
  readonly fill: string | null
  /** Lunghezza dell'arco dipinto, gia' al netto del vuoto. Puo' valere 0. */
  readonly len: number
  /** Dove comincia, misurato sul raggio medio dal punto delle dodici. */
  readonly start: number
}

/**
 * La vista `quote` di una sezione: le fette, la legenda che le nomina, e il
 * totale che sta nel buco. `null` dove questa vista non si disegna.
 */
interface Quote {
  /** Il numero nel buco, ed e' il denominatore di ogni fetta. */
  readonly totalCents: number
  /** Le righe **nell'ordine delle fette**: la legenda e' questa, in quest'ordine. */
  readonly rows: readonly CategorySlice[]
  /** Le fette, stessa lunghezza e stesso ordine di `rows`. */
  readonly slices: readonly PieSlice[]
}

/**
 * **Le fette seguono l'ordine delle righe, che e' l'importo decrescente.**
 *
 * ## Qui c'era `ordineDiGriglia`, e la sua motivazione era refutata
 *
 * Le fette venivano riordinate per `Category.order`, con due argomenti scritti
 * accanto. Il primo — *"con l'ordine di categoria le coppie adiacenti sono
 * sempre le stesse otto, e si controllano una volta per tutte"* — e' **falso**,
 * e lo era gia' quando fu scritto: ADR 025 lo refuta con tre fatti dell'albero
 * (la ciambella disegna solo le categorie con spese nella finestra, quindi su un
 * sottoinsieme di due qualunque coppia diventa adiacente; `Category.order` lo
 * cambia l'utente; e quali otto siano le attive lo decide chi archivia e
 * sostituisce).
 *
 * Il secondo — la memoria muscolare del pollice sulla griglia dei chip — e'
 * **vero, ma di un'altra stanza**. E' stato trapiantato qui senza ri-derivarlo,
 * e nel trapianto ha scavalcato un argomento **esplicito e contrario** che in
 * questo albero c'era gia', scritto prima, in `00d849b`:
 *
 * > *"Dalla piu' grande: la domanda e' 'dove sono finiti i soldi', e la
 * > risposta si legge dall'alto. **Non** per ordine di griglia, che serve al
 * > pollice in cassa."* (`stats-view.ts`)
 *
 * ## E il difetto vero non era l'ordine: era che le due viste ne avevano due
 *
 * Le barre sono sempre state per importo. Con la ciambella per ordine di
 * griglia **il tap rimescolava le righe**: stesse categorie, posizioni diverse,
 * e la legenda che cambiava sequenza sotto il dito. Il tap deve cambiare la
 * domanda, non la mappa.
 *
 * Adesso `part.rows` arriva gia' ordinato per importo decrescente da
 * `stats-view.ts` e **non si tocca**: un ordinamento solo in tutta la schermata,
 * e l'identita' di sequenza fra barre, fette e legenda e' vera per costruzione
 * invece che per coincidenza. Il test che la sorveglia sta in
 * `statistiche.spec.ts`.
 */

/**
 * Le fette e la legenda di una sezione, oppure `null` se qui la ciambella non si
 * disegna.
 *
 * ## Le tre condizioni
 *
 * 1. **Piu' di una riga.** Con una sola, un anello pieno dice "100%", che e' il
 *    totale scritto qui accanto: resta la riga, con il suo nome e il suo importo,
 *    e il comando non compare.
 * 2. **Almeno `PIE_MIN_SLICES` voci.** Vedi la costante — e' li' che sta anche
 *    la ragione per cui la natura della sezione **non** e' piu' una condizione.
 * 3. **Un totale sopra zero.** Una sezione di sole ricorrenti da zero centesimi
 *    esiste davvero (ha gia' il suo test in `stats-view.test.ts`), e li' non c'e'
 *    nessuna ripartizione: ogni quota sarebbe `0/0`.
 *
 * ## Il denominatore e' `totalCents`, e **non** e' `row.fraction`
 *
 * `CategorySlice.fraction` e' la lunghezza della **barra**, cioe' la quota sulla
 * riga piu' grande della sezione (`scaleCents`): la piu' grande vale 1 e le
 * altre le stanno sotto. Una ciambella disegnata con quelle quote sommerebbe a
 * piu' di un giro. La quota di una fetta e' `cents / totalCents`, e i due numeri
 * arrivano tutti e due dal modello.
 *
 * Che questa divisione stia qui e non in `stats-view.ts` non contraddice
 * *"questo file non decide niente"*: e' **aritmetica su due campi pubblicati**,
 * non una regola.
 *
 * ## Nessuna coda "Altre", e non e' un rinvio
 *
 * Le fette sono **tutte**, sempre. Un aggregato per la coda sarebbe un
 * meccanismo che nessun dato raggiunge — il tetto e' otto categorie attive, e le
 * finestre misurate ne hanno cinque e due — cioe' **superficie morta per
 * costruzione**: non coperta da nessun caso reale, da ri-espandere nella vista a
 * barre, con i totali che tornano in due modi invece che in uno, e che verrebbe
 * eseguita per la prima volta **in produzione, sul telefono di un amico**. E' la
 * stessa regola con cui la fase 5 ha tagliato `RecurringRule.note`: un
 * meccanismo si spedisce insieme al suo caso, o non si spedisce.
 *
 * Con otto fette la piu' piccola **non diventa invisibile, diventa piccola**, e
 * il suo nome e il suo importo stanno due centimetri sotto, nella legenda.
 *
 * ## Le quote sono esatte, e le fette che non ci stanno spariscono
 *
 * `start` viene dalla quota **cumulata vera**, quindi ogni fetta cade dove le
 * spetta anche quando la precedente e' troppo corta per essere dipinta. Una
 * fetta piu' stretta del vuoto ha `len` zero: **non si disegna affatto**, invece
 * di essere allargata a un minimo visibile. Allargarla direbbe una quota falsa
 * proprio dove la quota e' l'unica cosa che la ciambella aggiunge, e il dato non
 * si perde comunque — sta nella legenda, con il suo importo.
 */
function quoteOf(part: BreakdownSection): Quote | null {
  if (part.single) return null
  if (!part.asChart) return null
  if (part.totalCents <= 0) return null

  const totalCents = part.totalCents
  const rows = part.rows
  let cumulata = 0
  const slices = rows.map((row) => {
    const start = cumulata * PIE_C
    cumulata += row.cents / totalCents
    return {
      key: row.orphan ? ORPHAN : row.categoryId,
      fill: fill(row),
      len: Math.max(0, (row.cents / totalCents) * PIE_C - PIE_GAP),
      start: start + PIE_GAP / 2,
    }
  })
  return { totalCents, rows, slices }
}

/**
 * Una riga: etichetta, barra, importo. E' la marca unica della schermata — A e B
 * la condividono, e la differenza fra le due sta **nei dati** (B porta una
 * traccia, A no) invece che in due invenzioni grafiche.
 *
 * La riga **non** e' una griglia: le colonne sono della sezione e lei le eredita
 * (`subgrid`, vedi Stats.css). Una griglia per riga rendeva la lunghezza di una
 * barra dipendente da quanto era lungo il nome della categoria di quella riga.
 *
 * **Il segmento della parte fissa non c'e' piu', e non e' stato riparato: non ha
 * piu' un dato.** Distingueva la quota ricorrente *dentro* la barra quando A era
 * un elenco solo; adesso la natura e' la sezione, quindi quella quota varrebbe
 * "tutta" in ogni riga delle fisse e "niente" in ogni riga delle variabili. Il
 * difetto che il segmento aveva — un tratteggio nel colore del fondo che su
 * quattro delle otto tinte stava fra 2,51 e 2,82 di contrasto — se n'e' andato
 * con la sua causa invece che con una toppa.
 */
function Row({
  label,
  note,
  amount,
  fraction,
  color,
  track,
  open,
  bar,
}: {
  readonly label: string
  /**
   * La seconda riga dell'etichetta, o `null`. Oggi la scrive solo B, sul
   * periodo in corso, e dice **quanti giorni su quanti** (`stats.daysSoFar`).
   *
   * E' `null` e non opzionale per la stessa ragione di `color`:
   * `exactOptionalPropertyTypes` rifiuta un `undefined` scritto a mano, e
   * "questa riga non ha una seconda riga" e' un caso vero di chi chiama.
   */
  readonly note: string | null
  readonly amount: string
  readonly fraction: number
  /**
   * `null` = nessun colore da mostrare, e il ripiego e' `--brand`. E' un prop
   * annullabile e non opzionale perche' `exactOptionalPropertyTypes` rifiuta un
   * `undefined` scritto a mano, e qui l'assenza di colore e' un caso che i
   * chiamanti hanno davvero (B non ne ha uno per costruzione).
   */
  readonly color: string | null
  readonly track?: PeriodBar['track']
  /**
   * **Il periodo che questa riga misura non e' finito**, quindi la barra non ha
   * un bordo terminale netto (`.stat__bar[data-open]`, `Stats.css`).
   *
   * E' un attributo della marca, non una misura: non afferma **quanto** manchi
   * — quello lo dice `note`, in parole e in giorni — dice soltanto che il
   * numero sta ancora crescendo. Una lunghezza qui sarebbe una proiezione in
   * euro del tempo che resta, cioe' il difetto della fase riparato con un
   * difetto della stessa famiglia (`PeriodBar.daysLived`).
   *
   * **La causa e' `current`, mai `track`.** L'incompletezza di un periodo non
   * ha niente a che vedere con l'esistenza di un budget: legarla alla rotaia e'
   * esattamente il difetto da cui questa riparazione e' partita, e senza budget
   * — la prima settimana di chiunque — non si vedrebbe niente.
   */
  readonly open: boolean
  readonly bar: boolean
}) {
  return (
    <li class="stat">
      {/* L'equivalente testuale sta nel markup e non e' una vista in piu': i due
          pezzi che lo compongono — l'etichetta e l'importo formattato — sono
          gia' a schermo, e la barra accanto e' dichiarata decorativa.

          La nota **sta dentro l'etichetta** e non e' una quarta cella: le
          colonne sono tre e vengono dalla sezione (`subgrid`), quindi un quarto
          figlio finirebbe nella colonna del grafico. Ed e' il posto giusto
          anche a leggerlo: dice qualcosa **sul periodo**, che e' quello che
          l'etichetta nomina. */}
      <span class="stat__label">
        <span class="stat__name">{label}</span>
        {note === null ? null : <span class="stat__note">{note}</span>}
      </span>
      {bar ? (
        <span class="stat__plot" aria-hidden="true">
          {/* La traccia: **il budget del periodo, intero**. C'e' solo dove il
              confronto ha una risposta.

              ## Qui accanto c'era `.stat__unlived`, e toglierla non e' disegno

              Ridipingeva col fondo il tratto `[accruedFraction, fraction]`, cioe'
              accorciava la rotaia visibile di **esattamente
              `budget × vissuto/totale`**. Ma la rotaia *e'* il budget: la sua
              lunghezza e' l'unica cosa a schermo che dica quanto vale il tetto del
              periodo, e accorciarla in proporzione ai giorni passati **e'** il
              tetto pro-rata. Era l'unico posto nell'app che lo disegnasse — il
              numero non e' mai stato ridotto, la forma si', ed e' la forma che si
              legge per prima.

              Il tetto di questa settimana e' 200,00 € **mercoledi' come domenica**:
              se mercoledi' la rotaia ne mostra tre settimi, la schermata risponde
              "85,71 €" a una domanda a cui la Home risponde "200,00 €". Non e' un
              arrotondamento fra due viste: e' il pro-rata che il progetto ha
              scartato con tre ragioni (ADR 010), reintrodotto in geometria dove
              nessun confronto fra cifre lo avrebbe pescato.

              **La distinzione che inganna, e che va tenuta ferma**: il segno del
              maturato qui sotto non e' un pro-rata — non toglie niente alla
              rotaia, marca dove cadrebbe il passo. La banda si': toglieva
              superficie. Stessi pixel, due statuti.

              E il fatto lo dipingeva **due volte**: la banda partiva esattamente
              dove sta il segno, quindi il suo bordo sinistro *era* il segno. Su un
              periodo chiuso era larga zero e non diceva niente; su quello in corso
              diceva "il periodo non e' finito", che e' cio' che il segno dice gia'
              stando prima della fine della rotaia. */}
          {track ? (
            <span class="stat__track" style={{ inlineSize: pct(track.fraction) }} />
          ) : null}
          <span
            class="stat__bar"
            // A zero la barra non ha nemmeno il contorno: con `border-box` e un
            // bordo da 1px, `inline-size: 0%` disegnava comunque 2 px.
            data-zero={fraction <= 0 ? '' : undefined}
            // Il bordo terminale aperto. Vedi `open` qui sopra: e' `current`,
            // non `track`, e non dipende da dove la riga sta nell'elenco.
            data-open={open ? '' : undefined}
            style={{ inlineSize: pct(fraction), backgroundColor: color ?? 'var(--brand)' }}
          />
          {/* Il maturato: il segno contro cui si legge se il passo e' alto. Non
              riduce niente — marca un istante sulla rotaia intera — ed e' per
              questo che resta dove la banda se n'e' andata.

              Si legge cosi' com'e' e **non si moltiplica per niente**: le tre
              lunghezze (barra, traccia, maturato) escono dalla stessa mappa in
              `stats-view.ts`, che porta una traslazione costante
              (`BAR_MIN_FRACTION`). Un `fraction * livedFraction` scritto qui —
              c'era — fa cadere il segno prima del dovuto, e chi sta esattamente
              sul passo legge "sopra il passo".

              **Sta dopo la barra, e questa riga di codice e' la riparazione**:
              fra due assoluti senza livello dichiarato vince chi viene dopo, e
              il caso in cui il segno dice qualcosa e' esattamente quello in cui
              la barra lo ha superato. Prima stava sopra, ed era coperto proprio
              li'. Spostarlo sotto la barra rimette il difetto. */}
          {track ? (
            <span
              class="stat__accrued"
              style={{ insetInlineStart: pct(track.accruedFraction) }}
            />
          ) : null}
        </span>
      ) : null}
      <span class="stat__value">{amount}</span>
    </li>
  )
}

/**
 * A — "dove sono finiti i soldi?", in **due parti**: fisse e variabili.
 *
 * ## Perche' due, e non una barra sola con l'affitto dentro
 *
 * Perche' con l'affitto dentro la scala e' l'affitto. Con 507,00 € di canone,
 * una categoria da 26,00 € vale il 5% della colonna e tutte le altre le stanno
 * sotto: la domanda "dove sono finiti i soldi" riceve una risposta vera —
 * l'affitto — e nessuna risposta alle sei domande successive, che sono quelle su
 * cui si puo' ancora decidere qualcosa.
 *
 * Non e' una compensazione ne' una scala logaritmica: le proporzioni dentro
 * ciascuna parte restano esatte. E' che le due nature **non stanno sulla stessa
 * domanda** — ADR 016 lo dice per il budget (*"l'affitto non e' una decisione"*),
 * e qui vale identico per la lettura.
 *
 * **Nessuna delle due parte esclude niente.** ADR 016 §1 chiede che statistiche
 * e Storico mostrino tutto, ed e' rispettato: le fisse sono a schermo, con il
 * loro totale, sopra le variabili. Sono divise, non tolte.
 *
 * ## Le due scale si dichiarano, e la geometria da sola non bastava
 *
 * In ogni parte la barra piu' lunga arriva a fondo colonna, perche' il modello
 * garantisce che la frazione massima di una sezione valga esattamente 1.
 *
 * Qui c'era scritto che quello **basta**: *"due barre piene con due importi
 * diversi dicono da sole che le scale sono due"*. **E' falso, e lo era anche
 * allora**: dicono che *qualcosa* non torna, non *cosa*. Sui dati veri `Casa
 * 507,00 €` e `Spesa 42,00 €` sono dipinte della stessa identica lunghezza, e
 * cio' che resta al lettore e' una deduzione — che e' *"nessun messaggio afferma
 * un fatto che l'utente non puo' verificare"* applicato a un fatto che l'utente
 * dovrebbe **inferire**.
 *
 * Quindi ogni sezione lo scrive, e lo scrive **senza costare una riga**: la
 * didascalia sta sulla seconda riga dell'intestazione di parte, dentro l'altezza
 * che quell'intestazione dichiara gia' (vedi `PartHead`, prop `scale`).
 *
 * ## E nomina l'importo, non la categoria
 *
 * Qui c'era anche una frase diversa — *"le barre sono in scala su {nome}, la
 * piu' grande"* — e non torna. La sua unica parte non tautologica era **il nome
 * del riferimento**, e quel nome e' esattamente cio' che la riga accorcia:
 * misurato a 320 punti, la frase citava `Casa affitto utenze e condomin` mentre
 * la riga mostrava `Casa affitto utenze e cond…`. Un messaggio che afferma un
 * fatto che lo schermo non conferma.
 *
 * `stats.scale` nomina **l'importo**, che non tronca mai: la sua colonna e'
 * `max-content` e la didascalia e' larga quanto le serve.
 *
 * L'etichetta oggi va a capo invece di troncare (`Stats.css`, `.stat__label`),
 * quindi quel nome si accorcerebbe piu' tardi — ma si accorcerebbe lo stesso:
 * due righe sono un tetto, non un permesso.
 *
 * ## E una categoria puo' stare in tutte e due
 *
 * Trasporti con 23,00 € di abbonamento e 10,00 € di biglietti sta in fisse e in
 * variabili, con due importi diversi. E' voluto: sono due fatti, e il secondo e'
 * l'unico su cui si decide. Per questo la chiave di Preact porta anche la
 * natura: `categoryId` da solo non e' piu' unico dentro A.
 */
function Categories({
  breakdown,
  period,
  range,
}: {
  readonly breakdown: Breakdown
  /**
   * La forma del periodo, per **formattare il confine di quello precedente**
   * nello stato vuoto della sezione. Non entra in nessun conto.
   *
   * Sta qui e non pre-formattato come `range` perche' l'intervallo da scrivere
   * arriva dal modello (`previous.range`) e non e' noto al chiamante: e' lo
   * stesso motivo per cui `Periods` riceve `period` e chiama `periodRangeLabel`
   * per ogni riga invece di ricevere otto stringhe.
   */
  readonly period: BudgetPeriod
  /* `categories` stava qui, e serviva a **una cosa sola**: riordinare le fette
   * per `Category.order`. Quell'ordinamento non c'e' piu' (vedi il commento su
   * `quoteOf`), e il prop se n'e' andato con lui invece di restare come elenco
   * che nessuno legge: nomi, colori e importi arrivano gia' dal modello. */
  /**
   * Il confine del periodo che A sta ripartendo, gia' formattato
   * (`periodRangeLabel`). **Non e' una rifinitura del titolo: e' l'unica cosa
   * che rende verificabile cio' che le due intestazioni di parte affermano.**
   *
   * Stava sotto la scheda `Quotidiane` (`.tile__sub`), che era **l'unico posto
   * della schermata a nominarlo**. Nei due stati in cui B non esiste — il primo
   * periodo di chiunque installi l'app, e chi ha solo spese fisse — togliere la
   * scheda senza spostare questa etichetta lasciava a schermo `Fisse in questo
   * periodo` sopra un periodo che **niente identificava**: misurato, non
   * restava una sola data.
   *
   * E' alla lettera il difetto appena chiuso sullo stato `outside` — *"ogni
   * altro stato stampa `periodRangeLabel`; l'unico che parlava del confine era
   * l'unico che non lo disegnava"* — che stava per riaprirsi in `ready`.
   * L'argomento con cui la scheda esce (ripete il totale di una sezione trenta
   * pixel piu' sotto) **non nomina il confine**, quindi non lo copre.
   */
  readonly range: string
}) {
  const { sections, split, previous } = breakdown

  /**
   * **Quale domanda sta facendo ciascuna sezione**, e non e' persistito.
   *
   * Le due sezioni sono **indipendenti**: si puo' guardare la ripartizione delle
   * quotidiane accanto alla classifica delle fisse, perche' sono due domande su
   * due quantita' diverse e non c'e' nessuna ragione per cui debbano coincidere.
   *
   * ## Effimero, e questa e' la ragione
   *
   * *"Uno stato che sopravvive e' uno stato che va spiegato."* Uscendo dalle
   * Statistiche e rientrando si riapre in ciambella: il valore di partenza e'
   * uno solo, quindi non c'e' nessun caso in cui qualcuno ritrova la schermata
   * diversa da come se l'aspetta senza aver appena toccato qualcosa. E' lo stesso
   * argomento con cui il selettore delle fisse tornava acceso a ogni apertura —
   * quel comando non c'e' piu', l'argomento vale identico.
   *
   * Il tipo e' un record sulle due nature e non una mappa: le sezioni sono due,
   * si chiamano `fixed` e `variable`, e un `Record<BreakdownKind, Vista>` fa
   * fallire la compilazione il giorno in cui ne comparisse una terza.
   */
  const [viste, setViste] = useState<Record<BreakdownSection['kind'], Vista>>({
    fixed: 'quote',
    variable: 'quote',
  })

  /**
   * **Quali sezioni sono gia' state commutate almeno una volta**, e serve solo
   * alla dissolvenza.
   *
   * La dissolvenza vale su una **commutazione**, non sull'arrivo dei dati: senza
   * questa marca il grafico si dissolverebbe in entrata anche al primo disegno
   * della schermata, cioe' una decorazione da 120 ms addosso al primo frame —
   * che e' proprio il frame che l'ordine di pittura protegge.
   *
   * **Per sezione e non un contatore solo**, e la differenza si vede: con un
   * contatore condiviso, commutando le fisse anche le quotidiane diventerebbero
   * "gia' mosse" e si dissolverebbero una volta senza che nessuno le abbia
   * toccate. Le due sezioni sono indipendenti anche qui.
   */
  const [mosse, setMosse] = useState<Record<BreakdownSection['kind'], boolean>>({
    fixed: false,
    variable: false,
  })

  const commuta = (kind: BreakdownSection['kind'], vista: Vista): void => {
    setViste((precedenti) => ({ ...precedenti, [kind]: vista }))
    setMosse((precedenti) => ({ ...precedenti, [kind]: true }))
  }

  // **Nessuna sezione vuol dire che nel periodo non e' uscito niente — e A resta
  // lo stesso in piedi, a dirlo.**
  //
  // Qui c'era `if (sections.length === 0) return null`, e il 31 agosto — un
  // lunedi' — ha prodotto il difetto peggiore della fase: le Statistiche si sono
  // aperte **senza titolo, senza numero grande, senza ciambella e senza
  // leggenda**. I dati c'erano tutti, era la settimana nuova a essere vuota, ma
  // chi ha guardato ha creduto che l'app avesse dimenticato tutto.
  //
  // **Una sezione che sparisce si legge come un'app rotta; una sezione che dice
  // di essere vuota si legge come un'app che funziona.** Da qui la regola in
  // `CLAUDE.md`: un blocco della schermata non scompare perche' i suoi dati sono
  // vuoti — tiene il titolo e la sua cornice e dice cosa manca. Scompare solo se
  // la funzione a cui appartiene non esiste per questo utente, che e' un'assenza
  // strutturale e non un vuoto temporaneo.
  //
  // Lo stato `outside` non copre questo caso e non deve: quello e' lo stato di
  // **tutta la schermata** quando non c'e' niente da nessuna parte. Qui sotto c'e'
  // ancora B, con dentro il totale che rassicura.

  // Il totale del periodo, che e' cio' che rendeva monco `DOVE SONO FINITI ·
  // 24–30 AGO`: finiti *quanto?* Viene dalla divisione quando c'e', perche' li'
  // e' gia' calcolato sulle due meta'; altrimenti dalle sezioni, che ne hanno
  // una sola — e la somma di una sezione sola e' la sezione.
  //
  // **Non cambia quando si spengono le fisse**, ed e' voluto: e' il totale del
  // periodo, non il totale di cio' che si sta guardando. Resta verificabile
  // perche' le due meta' che lo compongono sono scritte sulle due intestazioni,
  // e quella nascosta porta comunque la sua cifra.
  const totalCents = split === null ? sectionsTotal(sections) : split.fixedCents + split.variableCents

  const fixedSection = sections.find((part) => part.kind === 'fixed')

  return (
    // `data-chart` sta sulla **sezione** e non sull'elenco perche' le colonne
    // sono della sezione: e' li' che si decide se ce ne sono tre o due. E la
    // decisione arriva dal modello gia' presa **sull'insieme**, e resta cosi'
    // anche dopo che la scala e' tornata per sezione (0a): era **la soglia per
    // sezione** la causa del difetto misurato — le fisse con 530 € su 818 e
    // nessuna barra, mentre la barra piu' lunga dello schermo ne valeva 129 — e
    // quella non torna indietro. "Questa parte ha poche righe" non e' una
    // domanda che qualcuno possa fare a una parte per volta.
    // `data-chart` non e' piu' della sezione: da quando la soglia e' della parte
    // (`BREAKDOWN_MIN_ROWS`), due parti nella stessa sezione possono avere due
    // risposte — le fisse con due righe non sono un grafico, le quotidiane con
    // cinque si'. L'attributo sta quindi su ogni elenco di righe.
    <section class="stats__section">
      {/* **La domanda, la sua risposta in grande, e la divisione subito sotto.**

          Il totale c'era gia' — era `.stats__titleTotal`, 17 px in coda al
          titolo — e portava il fatto giusto con il peso sbagliato: misurato a
          390 punti, `618,00 €` era **piu' piccolo** di `507,00 €` scritto
          duecento pixel piu' in basso sulla riga di Casa, cioe' la risposta alla
          domanda della schermata pesava meno di una delle sue voci.

          Il metro e' **interno all'app**: la Home funziona perche' il numero che
          risponde e' enorme e sta da solo. Qui `dataviz` chiede *"esattamente
          una hero figure per vista"*, e questa schermata ne aveva **zero** —
          quindi non c'e' nessun conflitto da arbitrare: la Home ha la sua
          (`.hero__value`, quanto resta), le Statistiche hanno questa (quanto e'
          uscito nel periodo), e **non deve diventarne due per schermata**.

          Sta in un `<p>` fuori dall'`<h2>` e non dentro: l'intestazione resta la
          domanda — un test la legge intera — e `text-transform: uppercase` non
          deve arrivare a una cifra.

          La barra divisa viene subito dopo, ed e' la ragione per cui il titolo
          non e' piu' una riga a due colonne: numero grande e sua decomposizione
          sono la stessa frase, e in mezzo non ci va niente.

          Non c'e' piu' nemmeno il `<div class="stats__head">` che li teneva
          insieme: erano due campate `1 / -1` dentro un box che non aggiungeva
          nessuna colonna. `.stats__head` resta, e resta **di B**, dove ha ancora
          un mestiere — tenere titolo e nome di parte sulla **stessa** riga,
          perche' ognuno dei 26 px che costavano impilati e' un pixel che
          allontana dalla piega la seconda riga del confronto. */}
      <h2 class="stats__title">
        {t('stats.byCategory')}
        {' · '}
        {/* Il confine sta in un elemento suo, e non e' per lo stile: e' l'unico
            posto in cui questa schermata scrive `periodRangeLabel` quando le
            righe ci sono, e un test lo legge di li' invece di ritagliarlo dal
            titolo — dove `text-transform: uppercase` glielo restituirebbe in
            maiuscolo, cioe' diverso da come lo scrive `Intl`. */}
        <span class="stats__titleRange">{range}</span>
      </h2>
      {totalCents === null ? null : <p class="stats__hero">{money(totalCents)}</p>}

      {/* **Lo stato vuoto della sezione, non della schermata.**

          Prende il posto del numero grande — che qui non esiste, perche'
          `sectionsTotal` di zero sezioni e' `null` e non `0,00 €`. La differenza
          non e' di stile: `0,00 €` sotto "Dove sono finiti" e' un'affermazione
          sui soldi, e in una settimana appena cominciata sarebbe **vera e
          inutile**, oltre che identica a quella di chi ha davvero speso zero
          dopo aver speso.

          L'uscita e' il periodo prima, quando ce n'e' uno con qualcosa dentro:
          il suo confine e il suo totale, che e' il conto di **A** — fisse
          comprese — e non quello di B. Vedi `BreakdownPrevious`. */}
      {sections.length > 0 ? null : (
        <div class="stats__empty">
          <p class="stats__emptyText">{t('stats.period.empty')}</p>
          {previous === null ? null : (
            <p class="stats__emptyPrev">
              {t('stats.period.previous', {
                range: periodRangeLabel(period, previous.range),
                amount: money(previous.totalCents),
              })}
            </p>
          )}
        </div>
      )}

      {split === null ? null : <Split split={split} />}

      {/* **L'intestazione delle fisse si disegna anche quando la sezione non
          c'e'**, e adesso ha una ragione sola invece di due.

          Ne aveva due: ospitava l'interruttore — che sparendo insieme a cio' che
          nascondeva sarebbe stato un vicolo cieco — e portava la cifra nascosta.
          L'interruttore non c'e' piu'; **la cifra resta**, ed e' ADR 016 §1: se la
          divisione dice che 530,00 € sono fisse, quel numero deve avere una riga
          che lo nomina, anche quando le sue categorie non sono in elenco.

          La condizione si e' semplificata con la ragione che e' caduta: era
          `split !== null || !showFixed`, cioe' *"c'e' una divisione, oppure sei tu
          ad aver spento"*. Resta la prima meta'. */}
      {fixedSection === undefined && split !== null ? (
        <PartHead
          kind="fixed"
          amount={money(split.fixedCents)}
          // Nessuna riga, quindi nessuna barra, quindi nessuna scala da
          // dichiarare: questa intestazione si disegna **senza la propria
          // sezione**, per non lasciare la cifra della divisione senza un nome.
          scale={null}
          // E nessun comando: non ha righe da ripartire, quindi non c'e' nessuna
          // seconda domanda da fare a questa cifra.
          vista={null}
        />
      ) : null}

      {sections.map((part: BreakdownSection) => {
        // La vista `quote` si disegna solo dove esiste; dove non esiste la
        // sezione **e' a barre**, e il comando non compare. Non e' un ripiego
        // silenzioso: e' l'unico stato che quella sezione ha.
        const quote = quoteOf(part)
        const vista: Vista = quote === null ? 'ordine' : viste[part.kind]
        return (
          <Fragment key={part.kind}>
            <PartHead
              kind={part.kind}
              // **Il totale di sezione esiste solo quando le sezioni sono due**,
              // e la condizione va derivata qui perche' qui e' cambiata la stanza.
              //
              // Da quando il titolo di A porta il totale del periodo, quel numero
              // e' gia' a schermo quaranta pixel piu' su. Con **una sezione sola**
              // il totale della sezione **e'** quello del periodo — non ci sono
              // altre righe da cui differire — quindi riscriverlo qui è scriverlo
              // due volte: misurato su una settimana di sole spese a mano,
              // `70,00 €` sul titolo e `70,00 €` sull'intestazione. E' lo stesso
              // argomento che `part.single` fa qui sotto — *"con una riga sola il
              // totale e' quella riga"* — applicato un livello sopra, con "riga"
              // che diventa "sezione".
              //
              // Con **due sezioni** il totale del titolo e' la loro somma, e
              // nessuna delle due la si puo' ricavare guardando: la quota di
              // ciascuna e' un numero suo, e senza di lei la barra divisa qui sopra
              // resterebbe una forma senza cifre — cioe' l'etichetta diretta che
              // `0b` chiede espressamente di scrivere.
              //
              // **E la terza condizione e' nuova: in vista `quote` il totale sta
              // nel buco.** Scriverlo anche qui vorrebbe dire la stessa cifra due
              // volte a centoventi pixel di distanza, che e' esattamente cio' che
              // le altre due condizioni evitano. Il legame con il segmento della
              // barra divisa non si perde: la pastiglia resta sul nome, e il
              // numero sta **dentro la figura di quella sezione**, non altrove.
              //
              // La sorgente e' `split` e non `part.totalCents`: sono la stessa
              // cifra dalla stessa sorgente (il modello lo dichiara), e leggere
              // quella che esiste **solo** nel ramo a due sezioni fa fallire la
              // compilazione se un domani questa condizione tornasse larga.
              amount={
                part.single || split === null || vista === 'quote'
                  ? null
                  : money(part.kind === 'fixed' ? split.fixedCents : split.variableCents)
              }
              // **Quanto vale il fondo colonna di questa sezione** (0a).
              //
              // Tre condizioni, e la seconda non e' quella che sembra.
              //
              // `vista === 'ordine'`: e' la didascalia **delle barre**. In vista
              // `quote` le barre non ci sono, e una legenda che spiega una
              // geometria assente e' rumore certo.
              //
              // `asChart`: senza barre non c'e' nessuna colonna di cui dire la
              // lunghezza.
              //
              // `!part.single`: **non** perche' con una riga sola la cifra sarebbe
              // ripetuta. Quello e' vero anche con cinque righe, e va detto:
              // `scaleCents` e' il massimo della sezione e le righe scendono dalla
              // piu' grande, quindi vale `rows[0].cents` **sempre**. Una
              // condizione che pretendesse di evitare la ripetizione la
              // eviterebbe in un caso su due per una ragione che vale in due casi
              // su due.
              //
              // La ragione vera e' un'altra, ed e' quella che discrimina davvero:
              // **una didascalia della scala calibra le righe che non sono il
              // riferimento.** Con cinque righe dice a chi legge che le altre
              // quattro vanno lette contro 42,00 €; con una riga sola non ce ne
              // sono, e cio' che resterebbe e' `Barra intera = 900,00 €` sopra
              // `Casa 900,00 €` — informazione zero, rumore certo. C'e' un test
              // che sorveglia proprio quel caso (*"la parte con una riga sola non
              // ripete la sua cifra nell'intestazione"*), ed e' scritto sul testo
              // dipinto dell'intero `<h3>` apposta perche' nessuna classe nuova
              // possa aggirarlo. Questa condizione lo rispetta perche' ha la sua
              // ragione, non perche' il test c'e'.
              //
              // E la ripetizione che **resta**, nel caso a piu' righe, si accetta
              // e si dice perche': non e' la cifra ripetuta di DEBITO §5 — due
              // quantita' **diverse** che coincidono e che nessuna etichetta
              // distingue — e' una **legenda**, cioe' una cosa il cui unico
              // mestiere e' dire che significato ha una geometria.
              scale={
                vista === 'ordine' && part.asChart && !part.single
                  ? t('stats.scale', { amount: money(part.scaleCents) })
                  : null
              }
              // **Il comando c'e' solo dove ci sono due viste da scegliere**, ed
              // e' la stessa condizione che decide se il tap sul grafico fa
              // qualcosa: un comando che dichiara un gesto che non esiste sarebbe
              // il difetto opposto a quello che il comando ripara.
              vista={quote === null ? null : vista}
            />
            {!part.asChart && !part.single ? (
              // **Due righe: la barra impilata.** Sotto la soglia del grafico
              // ma sopra la riga sola — vedi `BREAKDOWN_MIN_ROWS` per la scala
              // intera e le date.
              <Stacked key={`stack:${part.kind}`} part={part} />
            ) : vista === 'quote' && quote !== null ? (
              // La chiave porta la vista: commutando, Preact **rimonta** invece
              // di riconciliare, e l'animazione di entrata riparte. E' anche
              // corretto di suo — le due viste non condividono nessun nodo.
              <Quote
                key={`quote:${part.kind}`}
                quote={quote}
                nome={t(part.kind === 'fixed' ? 'stats.fixedInPeriod' : 'stats.variable')}
                mossa={mosse[part.kind]}
                onTap={() => commuta(part.kind, 'ordine')}
              />
            ) : (
              <ul
                key={`ordine:${part.kind}`}
                class="stats__rows"
                data-chart={part.asChart ? '' : undefined}
                // **Il tap sul grafico, dalla parte delle barre.** Stessa area,
                // stesso gesto, verso opposto: e' la reversibilita' chiesta al
                // comando, non una scorciatoia in piu'.
                //
                // **Adesso e' un bersaglio dichiarato**, e prima non lo era: la
                // strada annunciata era il comando nell'intestazione, e il
                // comando non c'e' piu'. Stesso trattamento della ciambella —
                // `role` + `tabIndex` + tasti — e per la stessa ragione: un
                // `<ul>` non puo' essere un `<button>` senza smettere di essere
                // HTML valido.
                data-vista={quote === null ? undefined : 'ordine'}
                {...(quote === null
                  ? {}
                  : {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': t('stats.chart.toShares', {
                        name: t(part.kind === 'fixed' ? 'stats.fixedInPeriod' : 'stats.variable'),
                      }),
                      onKeyDown: (e: KeyboardEvent) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        e.preventDefault()
                        commuta(part.kind, 'quote')
                      },
                    })}
                data-mossa={quote !== null && mosse[part.kind] ? '' : undefined}
                {...(quote === null ? {} : { onClick: () => commuta(part.kind, 'quote') })}
              >
                {part.rows.map((row: CategorySlice) => (
                  // L'aggregato delle orfane e' uno per parte, e le due non si
                  // fondono: "canoni che non si sa piu' a cosa erano" e "spese a
                  // mano che non si sa piu' a cosa erano" sono due fatti. Quindi
                  // anche la sua chiave porta la natura.
                  <Row
                    key={`${part.kind}:${row.orphan ? ORPHAN : row.categoryId}`}
                    label={sliceLabel(row)}
                    // **A non ha righe incomplete, e non e' una svista.** Tutte le
                    // sue barre stanno dentro **lo stesso** periodo, quindi i
                    // giorni mancanti sono gli stessi per tutte e le proporzioni
                    // fra le categorie non ne sono distorte: e' esattamente
                    // l'opposto di B, dove la riga corrente e' l'unica incompleta e
                    // sta accanto a sette periodi finiti.
                    //
                    // Il confine di cui A parla e' nel suo titolo, e i giorni non
                    // ci sono perche' qui non servono a leggere nessuna barra.
                    note={null}
                    open={false}
                    amount={money(row.cents)}
                    fraction={row.fraction}
                    color={fill(row)}
                    bar={part.asChart}
                  />
                ))}
              </ul>
            )}
          </Fragment>
        )
      })}

      {/* Qui c'era `stats.hiddenAll`, *"in questo periodo ci sono solo spese
          fisse, e le hai nascoste"*. Diceva la cosa giusta — non *"non c'e'
          niente"*, ma *"l'hai nascosto tu"* — e non ha piu' un soggetto: senza
          interruttore nessuno puo' nascondere niente, e zero sezioni con delle
          spese nel periodo non e' uno stato raggiungibile. La chiave e' uscita dai
          due dizionari insieme a questa riga. */}
    </section>
  )
}

/**
 * Il totale delle sezioni a schermo, o `null` se non ce ne sono.
 *
 * Somma i **totali gia' calcolati** invece di ripassare sulle righe: sul ramo a
 * piu' righe il modello promette che `totalCents` e' la somma delle sue righe
 * (`BreakdownSection`), e sul ramo `single` la riga sola **e'** il totale. Due
 * espressioni per lo stesso numero sarebbero una copia da tenere allineata.
 *
 * Si usa solo dove `split` e' `null`, cioe' dove una delle due meta' e' zero e
 * quindi le sezioni sono al massimo una: e' la somma di un addendo, scritta
 * come somma perche' il tipo non sa che ce n'e' uno solo.
 */
function sectionsTotal(sections: readonly BreakdownSection[]): number | null {
  if (sections.length === 0) return null
  return sections.reduce(
    (sum, part) => sum + (part.single ? part.rows[0].cents : part.totalCents),
    0,
  )
}

/**
 * **La barra divisa: due terzi sono l'affitto, e prima non si vedeva da nessuna
 * parte.**
 *
 * Porta la proporzione fisse/quotidiane del periodo e libera A dal doverla
 * raccontare riga per riga: e' il fatto dominante della schermata, e **le due
 * sezioni da sole non lo dicono in nessuna delle due configurazioni di scala**.
 * Con una scala sola dicevano chi ha la riga piu' lunga; con la scala per
 * sezione (0a) le due barre piu' lunghe arrivano tutte e due a fondo colonna,
 * quindi non dicono nemmeno quello. La proporzione fra le due nature sta qui, e
 * solo qui.
 *
 * ## Un accento e un grigio, non due tinte di categoria
 *
 * Otto tinte categoriche quando la storia e' **un numero solo** e' l'errore da
 * manuale; la risposta e' *emphasis*: una marca sola in evidenza, il resto
 * neutro. E qui l'evidenza non e' una scelta grafica — **l'accento sta sulle
 * quotidiane e il grigio sulle fisse** perche' ADR 016 dice che *"il budget
 * serve a decidere se prendere quel caffe', e l'affitto non e' una decisione"*:
 * si accentua cio' su cui si decide. Le fisse restano dominanti **per area**,
 * che e' precisamente il fatto che questa barra deve dire.
 *
 * **Non `--brand`**: e' gia' il colore delle barre di B e del FAB, e un terzo
 * significato sullo stesso token lo svuoterebbe. I due colori sono
 * `--line-strong` (3,19:1 sul fondo, il token dei "bordi che contano") e
 * `--text`. Fra loro valgono 5,1:1 in chiaro e 4,8:1 in scuro, misurati sui
 * token: la barra si legge anche da chi non distingue le tinte, perche' la
 * differenza e' di **luminanza**, non di colore.
 *
 * ## Perche' non e' una ciambella
 *
 * Due fette sono due angoli, e due angoli si confrontano peggio di due
 * lunghezze affiancate; con nomi lunghi (`Fisse in questo periodo`) chiederebbe
 * per giunta una legenda staccata. La barra orizzontale divisa e' la forma che
 * il part-to-whole a due voci vuole.
 *
 * ## I 2 px in mezzo sono un **vuoto**, non un bordo
 *
 * Un contorno fra due marche che si toccano davvero aggiunge una terza tinta sul
 * confine, cioe' la cosa che rende difficile leggere dove finisce l'una. Il
 * `gap` e' nel colore della superficie: e' assenza di marca, e non colora
 * niente. (Il contorno da 1 px delle barre di A resta, e risolve un altro
 * problema: quattro degli otto colori delle categorie stanno sotto 3:1 sul
 * fondo, e quelle barre non si toccano mai fra loro.)
 *
 * ## Le etichette dirette stanno sulle due intestazioni
 *
 * Con due segmenti serve una legenda o le etichette scritte accanto. Qui le
 * portano le **intestazioni di parte**, ciascuna con la pastiglia del proprio
 * segmento: sono gia' a schermo, dicono gia' il nome della natura, e cosi' i due
 * totali restano scritti **una volta sola** invece di comparire sia accanto alla
 * barra sia sotto di essa.
 *
 * La barra e' quindi `aria-hidden`: e' la forma di due numeri che stanno scritti
 * trenta pixel piu' sotto, non un'informazione in piu'.
 */
function Split({ split }: { readonly split: BreakdownSplit }) {
  return (
    <div class="stats__split" aria-hidden="true">
      {/* `flex-basis` e non `inline-size`: i due segmenti si dividono cio' che
          resta **dopo** il vuoto da 2 px, e con `flex-shrink` proporzionale alla
          base le due quote restano esatte l'una rispetto all'altra. Con due
          larghezze in percentuale il vuoto avrebbe fatto traboccare la riga. */}
      <span class="stats__seg" data-kind="fixed" style={{ flexBasis: pct(split.fixedFraction) }} />
      <span
        class="stats__seg"
        data-kind="variable"
        style={{ flexBasis: pct(1 - split.fixedFraction) }}
      />
    </div>
  )
}

/**
 * **La barra impilata di una parte a due righe.**
 *
 * E' la forma C della scelta del 31 agosto: al posto di due tracce con dentro
 * una barra piena e un moncone, **una traccia sola divisa in due segmenti**, con
 * la leggenda sotto — pastiglia, nome, importo — come gia' fa la ciambella.
 *
 * ## Perche' e' lo stesso dispositivo, un livello piu' giu'
 *
 * La barra in cima allo schermo divide 954,00 € in fisse e quotidiane; questa
 * divide i 530,00 € delle fisse in `Casa` e `Trasporti`. Chi ha imparato a
 * leggere la prima legge questa senza imparare niente di nuovo — ed e' la stessa
 * ragione per cui la ciambella riusa la leggenda invece di etichettare le fette.
 *
 * ## E il 4,3% smette di essere un distintivo
 *
 * Con due tracce e la scala della sezione, `Trasporti` a 23,00 € su 507,00 €
 * diventa un moncone piu' alto che largo. Su una traccia intera lo stesso 4,3%
 * e' un segmento di ~13 px a 390 punti: piccolo, e **leggibile come piccolo**,
 * che e' esattamente cio' che il dato dice.
 *
 * Sparisce anche `stats.scale` — *"Barra intera = 507,00 €"* — che era la
 * confessione che quelle due barre da sole non si leggevano: il totale di una
 * barra impilata e' il totale della parte, gia' scritto nell'intestazione.
 */
function Stacked({ part }: { readonly part: BreakdownSection }) {
  const totale = part.rows.reduce((n, r) => n + r.cents, 0)
  return (
    <div class="stats__stack">
      {/* `aria-hidden` come la barra in cima: la figura non aggiunge niente a
          cio' che la leggenda dice gia' in parole e in cifre. */}
      <div class="stats__stackBar" aria-hidden="true">
        {part.rows.map((row) => (
          <span
            class="stats__stackSeg"
            key={row.orphan ? ORPHAN : row.categoryId}
            style={{
              flexBasis: pct(totale > 0 ? row.cents / totale : 0),
              backgroundColor: fill(row) ?? 'var(--brand)',
            }}
          />
        ))}
      </div>
      <ul class="stats__legend">
        {part.rows.map((row) => (
          <li class="legend" key={row.orphan ? ORPHAN : row.categoryId}>
            <span class="legend__dot" style={{ backgroundColor: fill(row) ?? 'var(--brand)' }} />
            <span class="legend__name">{sliceLabel(row)}</span>
            <span class="legend__value">{money(row.cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * L'intestazione di una parte di A: **quale dei due tipi di soldi** conta il
 * grafico qui sotto, la pastiglia che la lega al proprio segmento della barra
 * divisa, e il comando che sceglie **quale delle due domande** si sta facendo.
 *
 * ## Le due etichette non sono simmetriche, e non e' una svista
 *
 * Le variabili riusano `stats.variable`, la stessa parola che nomina le
 * quotidiane ovunque compaiano. Le fisse no: la cifra in testa alla schermata e'
 * una previsione **al mese**, questa e' quanto e' uscito **nel periodo**, e con
 * la stessa parola le due si contraddicono a schermo — misurato, la cifra in
 * testa leggeva `0,00 € ogni mese` sopra un `Spese fisse 620,00 €`, che e' il
 * caso di una regola disattivata dopo aver generato la spesa. Cioe' quello che
 * l'app stessa consiglia di fare (`toast.ruleInUse`).
 *
 * ## Il comando sta **fuori** dall'`<h3>`, ed e' l'unica ragione del `<div>`
 *
 * Qui c'era scritto che *"non c'e' un `<div>` a raccogliere titolo ed elenco:
 * `subgrid` non attraversa un box che non sia lui stesso una griglia"*. Quella
 * frase parlava del box fra la **sezione e le sue righe**, e resta vera: le
 * righe sono ancora figlie dirette della sezione.
 *
 * Questo `<div>` e' un'altra cosa e non tocca nessuna colonna: raccoglie
 * l'intestazione e il suo comando, e serve perche' **un bottone dentro un
 * `<h3>` entra nel nome accessibile dell'intestazione**. Con il comando dentro,
 * una voce leggerebbe *"Quotidiane 112,00 € Quote Ordine, intestazione di livello
 * 3"*: il titolo di una sezione che recita i propri comandi. Fuori, l'intestazione
 * resta la sola cosa che nomina la parte, e il comando si annuncia da se'.
 *
 * **Qui dentro c'era un interruttore, e non c'e' piu'.** Accendeva e spegneva le
 * fisse, con `role="switch"` e la sua etichetta; l'argomento era *"non e' una
 * divulgazione: le righe non ricompaiono uguali, la scala si rifa'"*.
 *
 * Quell'argomento e' morto quando 0a e' stata rovesciata: con la scala di nuovo
 * per sezione **la scala non si rifaceva piu'**, e le righe ricomparivano
 * identiche al pixel. Restava un interruttore che toglieva una sezione, cioe'
 * che **prometteva un potere che non aveva**. Il comando di adesso e' l'opposto
 * per costruzione: non toglie niente a nessuna delle due viste, e c'e' un test
 * che confronta i due totali proprio per impedirgli di diventare quell'altro.
 */
function PartHead({
  kind,
  amount,
  scale,
  vista,
}: {
  readonly kind: BreakdownSection['kind']
  /** Il totale della parte, o `null` quando lo porta gia' qualcos'altro. */
  readonly amount: string | null
  /**
   * **Quanto vale una barra piena in questa sezione**, gia' formattato — o
   * `null` dove non c'e' niente da dichiarare.
   *
   * ## Perche' si scrive, e perche' la geometria non basta
   *
   * Con la scala **per sezione** (0a) la riga piu' grande di ciascuna arriva a
   * fondo colonna. Sui dati veri questo vuol dire `Casa 507,00 €` e `Spesa
   * 42,00 €` **dipinte esattamente della stessa lunghezza**, una sopra l'altra:
   * due barre piene identiche accanto a due importi di un ordine di grandezza
   * diverso.
   *
   * Qui c'era scritto che *"lo dichiara la geometria: due barre piene con due
   * importi diversi dicono da sole che le scale sono due"*. **E' falso, e lo era
   * anche quando fu scritto**: la geometria dice che *qualcosa* non torna, non
   * *cosa* — e' una deduzione chiesta al lettore, cioe' la stessa famiglia di
   * *"nessun messaggio afferma un fatto che l'utente non puo' verificare"*
   * applicata a un fatto che l'utente dovrebbe **inferire**.
   *
   * ## Quando e' `null`
   *
   * Dove non ci sono barre — compresa la vista `quote`, che le barre non le ha —
   * e dove la sezione ha una riga sola. Le condizioni e la ragione di ciascuna
   * stanno sul chiamante.
   */
  readonly scale: string | null
  /**
   * La vista corrente di questa sezione, oppure `null` dove **non c'e' una
   * seconda vista da scegliere**: sotto `PIE_MIN_SLICES` voci, con una riga
   * sola, o su un'intestazione che si disegna senza la propria sezione.
   *
   * `null` e non `'ordine'` con un booleano accanto: due campi per un fatto solo
   * sarebbero due modi di sapere la stessa cosa, e il chiamante ne scriverebbe
   * uno e dimenticherebbe l'altro.
   */
  readonly vista: Vista | null
  /** Cosa fare quando si sceglie una vista. `null` esattamente quando lo e' `vista`. */
}) {
  const fixed = kind === 'fixed'
  const nome = t(fixed ? 'stats.fixedInPeriod' : 'stats.variable')
  return (
    // `data-kind` sta qui e non piu' sull'`<h3>`: e' il colore della pastiglia e
    // il nome della natura, e adesso deve valere anche per il comando, che
    // dell'intestazione fa parte pur stando fuori dal titolo.
    //
    // `data-vista` non e' un gancio per i test: e' cio' che dice al foglio che
    // qui dentro c'e' un bersaglio, cioe' che questa riga deve dichiarare
    // `--tap-min` invece di lasciare che l'altezza la decida la tipografia.
    <div class="stats__partHead" data-kind={kind} data-vista={vista ?? undefined}>
      <h3 class="stats__partTitle">
        <span class="stats__partName">{nome}</span>
        {amount === null ? null : <span class="stats__partTotal">{amount}</span>}
        {/* La scala sta sulla **seconda riga** dell'intestazione, e non e' una
            riga in piu' dell'elenco. Costa la propria altezza — 18,75 px per
            sezione — ed e' il prezzo di dire la scala invece di farla dedurre.
            In vista `quote` non c'e': non ci sono barre da calibrare. */}
        {scale === null ? null : <span class="stats__partScale">{scale}</span>}
      </h3>
    </div>
  )
}


/**
 * **La vista `quote`: la ciambella, il totale nel buco, la legenda sotto.**
 *
 * ## Il buco porta un numero
 *
 * *"Il buco di una ciambella e' spazio gia' speso: o porta un numero o e' un
 * difetto."* Il numero e' **il totale della sezione**, cioe' il denominatore di
 * tutte le fette: e' l'unica cifra che rende leggibile ogni arco come una quota
 * invece che come una forma.
 *
 * E' scritto in HTML e non dentro l'SVG: l'SVG e' `aria-hidden`, e un `<text>`
 * li' dentro sarebbe **una cifra che si vede e non si sente**. Sta sopra la
 * figura come figlio dello stesso riquadro, non come sovrapposizione: non copre
 * nessun bersaglio, perche' il bersaglio e' il riquadro stesso e il numero e' un
 * suo discendente.
 *
 * ## Niente etichette dentro le fette, nessuna percentuale scritta
 *
 * **L'arco *e'* la percentuale.** Riscriverla in cifre accanto renderebbe la
 * figura una decorazione della propria didascalia — e sarebbe anche la cosa che
 * `dataviz` chiama per nome, *"un'etichetta tagliata da un segmento troppo
 * piccolo"*, su spicchi che qui possono valere il 4%.
 *
 * Le linee di richiamo sono la stessa cosa con un filo in piu': su 128 px di
 * lato non c'e' il margine per farle uscire senza incrociarsi.
 *
 * ## La legenda sta **sotto**, e la ragione e' la larghezza
 *
 * A lato costerebbe metà dello schermo per una colonna di cinque parole, e su
 * 375 punti la figura scenderebbe sotto i 90 px di lato. Sotto, la legenda si
 * prende tutta la riga e l'importo si incolonna sul **bordo destro del
 * contenuto**, che e' lo stesso bordo su cui stanno gli importi delle barre e
 * quelli della Home: la colonna delle cifre e' l'unica cosa che questa schermata
 * promette di tenere ferma fra una vista e l'altra.
 *
 * ## E il tap
 *
 * Tutto il blocco — figura e legenda insieme — commuta alla vista a barre. Non
 * e' un bersaglio dichiarato: non ha ruolo, non prende il fuoco, e la strada
 * annunciata resta il comando nell'intestazione. E' il gesto che quel comando
 * dichiara. Le misure minime le dichiara lo stesso (`Stats.css`), perche' la
 * regola e' sui bersagli e questo, per un pollice, lo e'.
 */
function Quote({
  quote,
  nome,
  mossa,
  onTap,
}: {
  readonly quote: Quote
  /** Il nome della parte, per il nome accessibile del gesto. */
  readonly nome: string
  /**
   * Se la commutazione e' gia' avvenuta almeno una volta in questa sessione
   * della schermata. Decide se il blocco entra in dissolvenza: al primo disegno
   * no, perche' li' non si sta commutando niente — si sta arrivando.
   */
  readonly mossa: boolean
  readonly onTap: () => void
}) {
  return (
    // **La strada accessibile e' il gesto**, e prima era il comando.
    //
    // Togliendo il comando a due stati e' rimasto scoperto cio' che quello
    // portava e la ciambella no: un bersaglio che si trova esplorando, che una
    // tastiera raggiunge, e che dice cosa fa. Un `onClick` su un `div` muto e'
    // un gesto che esiste solo per chi lo scopre col dito.
    //
    // `role="button"` e non un `<button>` vero: dentro c'e' la leggenda, che e'
    // un `<ul>`, e un bottone puo' contenere solo contenuto di frase. La coppia
    // `role` + `tabIndex` + tasti e' il modo con cui ARIA copre esattamente
    // questo caso.
    <div
      class="stats__viz"
      data-mossa={mossa ? '' : undefined}
      role="button"
      tabIndex={0}
      aria-label={t('stats.chart.toRanking', { name: nome })}
      onClick={onTap}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        // Lo spazio scorre la pagina: senza questo il grafico commuta **e** la
        // schermata salta di uno schermo.
        e.preventDefault()
        onTap()
      }}
    >
      <div class="stats__donut">
        <Pie slices={quote.slices} />
        <p class="stats__donutTotal">{money(quote.totalCents)}</p>
      </div>
      {/* La legenda **segue le fette**: stesso array, stesso ordine. E' il
          vincolo che rende ammissibile una ciambella senza etichette dentro —
          se i due ordini divergessero, non ci sarebbe piu' nessun modo di sapere
          quale arco e' quale. */}
      <ul class="stats__legend">
        {quote.rows.map((row) => (
          <li class="legend" key={row.orphan ? ORPHAN : row.categoryId}>
            {/* La pastiglia porta lo stesso `fill()` della fetta e della barra:
                un solo posto decide che colore ha una categoria. Il contorno e'
                lo stesso della barra e per lo stesso motivo — quattro degli otto
                colori stanno sotto 3:1 sul fondo, e una pastiglia da 10 px senza
                contorno sparirebbe proprio dove serve riconoscere la fetta. */}
            <span
              class="legend__dot"
              style={{ backgroundColor: fill(row) ?? 'var(--brand)' }}
            />
            <span class="legend__name">{sliceLabel(row)}</span>
            <span class="legend__value">{money(row.cents)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * **La ciambella.** Gli angoli danno la forma a colpo d'occhio, la legenda sotto
 * da' i valori.
 *
 * ## Il vincolo che la rende ammissibile, e che non e' negoziabile
 *
 * > **Nessuna fetta e' l'unico portatore del proprio dato.**
 *
 * Ogni fetta ha, a pochi pixel di distanza, una riga di legenda con il proprio
 * nome e il proprio importo. **La ciambella puo' fallire senza portarsi via
 * l'informazione** — ed e' esattamente cio' che succede quando una spesa enorme
 * schiaccia le altre in schegge: gli angoli smettono di dire qualcosa e le cifre
 * restano dove sono. Il giorno in cui qualcuno togliesse la legenda per far
 * spazio, questa figura andrebbe tolta con lei.
 *
 * Fino al 30 agosto quel ruolo lo facevano **le righe con le barre**, perche' la
 * figura si aggiungeva a loro. Adesso le due si escludono, e il portatore delle
 * cifre e' passato alla legenda: **la condizione non e' cambiata, e' cambiato
 * chi la soddisfa.**
 *
 * ## Perche' una forma che la disciplina dei grafici sconsiglia
 *
 * `dataviz` la sconsiglia due volte — *"una torta a 2 fette -> una stat tile"* e
 * *"niente donut per confrontare valori vicini"* — e tutte e due le volte
 * riguarda casi che qui non ci sono, perche' A e' **divisa in due sezioni**.
 * Sui dati veri del 24–30 agosto le quotidiane valgono `42 / 26 / 24 / 10 / 10
 * su 112`, cioe' **37,5% · 23,2% · 21,4% · 8,9% · 8,9%**: la piu' piccola e' un
 * arco di **32°**, nessuna scaglia. Le fisse sono `95,7% / 4,3%` — un cerchio
 * con una scheggia da 15,6° — ed e' li' che la skill ha ragione: infatti li' non
 * si disegna, e la condizione che lo impedisce e' il conteggio delle voci
 * (`PIE_MIN_SLICES`), non la natura della sezione.
 *
 * Resta un punto in cui contraddice davvero: la skill vuole **al massimo sei
 * segmenti** per un part-to-whole, e qui possono essere nove — otto categorie
 * attive piu' l'aggregato delle orfane. Il tetto delle otto e' strutturale
 * (CLAUDE.md: al massimo otto categorie attive in griglia) e la nona indossa
 * `--text-muted`, cioe' il grigio del "non c'e' un colore" e non una nona tinta
 * generata: la cosa che la skill vieta davvero — *"un nono colore categorico e'
 * indistinguibile da uno esistente sotto CVD"* — non puo' succedere. Cio' che
 * resta del suo argomento e' che con nove spicchi non si legge piu' quale sia
 * quale, e vale: la risposta e' che qui **non serve leggerlo dalla fetta**,
 * perche' l'ordine delle fette e' l'ordine della legenda e la legenda porta il
 * nome, la pastiglia e l'importo di ognuna.
 *
 * ## Nessuna etichetta dentro le fette, nessuna linea di richiamo
 *
 * Sta su `Quote`, che e' il posto in cui la legenda esiste. In una riga: l'arco
 * *e'* la percentuale, e ripeterla in cifre renderebbe inutile la figura che la
 * disegna.
 *
 * ## `aria-hidden`, per lo stesso argomento della barra divisa
 *
 * E' **la forma di cinque numeri scritti trenta pixel piu' sotto**, non
 * un'informazione in piu': ogni fetta ha una riga di legenda con nome e importo,
 * e chi legge lo schermo con la voce le incontra tutte, in quest'ordine, subito
 * dopo. La quota, che e' l'unica cosa che la ciambella aggiunge a chi guarda, e'
 * **derivabile dagli stessi numeri** che la voce sta per leggere — a partire dal
 * totale, che sta nel buco ed e' HTML apposta per non sparire con la figura.
 *
 * Ed e' la stessa scelta gia' presa, nella stessa schermata, per la marca che
 * risponde alla stessa domanda: `.stats__split` e' `aria-hidden` con questo
 * identico argomento. Due grafici sovrapposti alla stessa lettura con due
 * statuti diversi si leggerebbero come una svista.
 *
 * **Conseguenza da dichiarare**: non esiste nessuna chiave di dizionario per
 * questa figura, e non deve esistere. Una chiave senza lettore e' esattamente
 * cio' che il controllo B di `audit:source` rifiuta.
 */
function Pie({ slices }: { readonly slices: readonly PieSlice[] }) {
  return (
    <svg
      class="stats__pie"
      // `width`/`height` come attributi **oltre** alle misure del foglio: e'
      // cio' che da' al riquadro un rapporto intrinseco, cosi' l'arrivo dei
      // dati non produce un riflusso del testo accanto (CLS).
      width={PIE_BOX}
      height={PIE_BOX}
      viewBox={`0 0 ${PIE_BOX} ${PIE_BOX}`}
      aria-hidden="true"
    >
      {/* Le fette partono dalle **dodici** e girano in senso orario, che e' il
          verso in cui si legge un cerchio. Un `<circle>` di SVG comincia alle
          tre: la rotazione e' quel quarto di giro, scritta come attributo e non
          nel foglio perche' e' geometria del disegno — se sparisse dal CSS il
          grafico direbbe cose diverse, non sarebbe solo meno bello. */}
      <g transform={`rotate(-90 ${PIE_BOX / 2} ${PIE_BOX / 2})`}>
        {slices.map((slice) => (
          <circle
            key={slice.key}
            cx={PIE_BOX / 2}
            cy={PIE_BOX / 2}
            r={PIE_R}
            fill="none"
            // Stesso `fill()` e stesso ripiego della barra della riga: un solo
            // posto decide che colore ha una categoria, e che l'aggregato delle
            // orfane non ne ha uno.
            stroke={slice.fill ?? 'var(--brand)'}
            stroke-width={PIE_RING}
            stroke-dasharray={`${slice.len} ${PIE_C - slice.len}`}
            stroke-dashoffset={-slice.start}
          />
        ))}
      </g>
    </svg>
  )
}

/**
 * B — "sto spendendo piu' o meno degli altri periodi?".
 *
 * Qui le fisse **sono fuori**, e non contraddice ADR 016 §1: B *e'* il confronto
 * col budget, cioe' il caso che §1 nomina come l'unico che esclude. Una barra che
 * comprendesse l'affitto contro una traccia che non lo comprende metterebbe due
 * unita' di misura sullo stesso asse.
 *
 * ## E per questo B porta il nome di cio' che conta, sopra le proprie righe
 *
 * L'esclusione e' decisa, il silenzio no. ADR 016 §2 chiede che si dica
 * **accanto al numero**, e qui i numeri sono otto: senza un'etichetta, una
 * settimana in cui e' uscito solo l'affitto legge `0,00 €` dodici righe sotto un
 * `900,00 €` scritto dalla stessa schermata. E' **il difetto per cui A e' stata
 * divisa in due**, riflesso in B — con la differenza che li' la riparazione era
 * togliere un filtro, e qui il filtro e' giusto: quello che va tolto e' il
 * silenzio.
 *
 * L'etichetta e' `stats.variable`, cioe' **la stessa parola che nomina le
 * quotidiane nell'intestazione di parte di A**. Non e' una frase nuova che
 * dichiara l'esclusione — sarebbe la quarta copia di un fatto che ha gia' la sua
 * casa (DEBITO.md §1.3) — e' il **nome della quantita'**: la stessa parola sopra
 * gli stessi soldi, nei **due** posti in cui la schermata li nomina.
 *
 * (Erano tre finche' c'era la scheda in testa, e questa riga ne portava ancora
 * il relitto: *"— la scheda in testa** e della parte variabile di A"*, mezza
 * frase rimasta dentro un'altra dopo che la scheda era uscita. E' esattamente
 * cio' che succede a un commento aggiornato con una sostituzione invece che
 * riletto.)
 *
 * Chi legge `Quotidiane 0,00 €` in B ritrova `Quotidiane` sull'intestazione di
 * parte di A con il proprio totale accanto, e `Fisse in questo periodo
 * 900,00 €` sopra: le due cifre tornano.
 *
 * Il marchio e' quello dei titoli di parte di A, e non e' un riuso di comodo: in
 * A quella riga dice *quale dei due tipi di soldi* si sta guardando, e qui dice
 * la stessa identica cosa. Manca solo il totale a destra, perche' B non ne ha
 * uno: la somma di otto periodi non e' una quantita' che qualcuno si stia
 * chiedendo, e quella del periodo corrente **e' la prima riga di B stessa**.
 *
 * (Questa riga ha gia' cambiato indirizzo due volte, e vale la pena dire perche'.
 * Fino al taglio della scheda "Quotidiane" diceva "e' gia' la scheda in testa";
 * poi ha detto "l'ultima riga di questa sezione", vero finche' B era in ordine
 * cronologico. Il totale del periodo corrente non si e' mai spostato di
 * significato: si legge dove si e' sempre letto due volte, sulla riga di oggi di
 * questa sezione e sul totale della parte variabile di A — che era poi la ragione
 * per cui la scheda ripeteva. E' **il posto** a essere cambiato, ed e' per questo
 * che qui si nomina la riga per cio' che e', non per dove sta.)
 *
 * ## Sotto il titolo non c'e' una nota, ed era una riparazione
 *
 * C'era *"Quotidiane: 136,45 € su 200,00 €."*, e affermava il confronto col
 * budget **anche dove la geometria lo rifiuta**. Col primo budget impostato a
 * settimana gia' cominciata, `comparableToBudget` e' falso, la pagina disegna
 * zero tracce — che e' la cosa giusta, perche' nessuna lunghezza sarebbe onesta —
 * e sopra a quelle zero tracce quella riga diceva comunque "su 200,00 €". Cioe'
 * esattamente cio' che `stats-view.ts` vieta tre righe piu' su: *"l'assenza si
 * dichiara con la geometria, non con una nota"*.
 *
 * **Quella riga pero' portava due fatti, e ne e' stato tolto uno di troppo**: il
 * confronto col budget (falso dove la traccia manca) e *"queste barre sono le
 * quotidiane"* (vero sempre). Il secondo non aveva una casa sua, e se n'e'
 * andato con il primo — e' "un argomento spostato di contesto va ri-derivato"
 * applicato a **una rimozione**. Adesso ha una casa: il nome di parte qui sopra,
 * che dice il primo fatto e **non** il secondo, e non ripete nessun numero.
 */
function Periods({ trend, period }: { readonly trend: Trend; readonly period: BudgetPeriod }) {
  /**
   * Una riga di B. `current` **arriva da dove sta la barra nel `Trend`**, non da
   * un campo: `trend.current` e' la riga di oggi e `trend.closed` sono i periodi
   * finiti, quindi qui non c'e' niente da leggere e niente da confrontare.
   *
   * E' la ragione per cui questa funzione prende due argomenti invece di uno.
   * Con `rows: readonly PeriodBar[]` e un `row.current` dentro, il chiamante
   * aveva **due** modi di sapere la stessa cosa — il campo e la posizione — e
   * nessun input del prodotto li separava. Adesso il secondo argomento e'
   * scritto dal chiamante in due punti, e i due punti sono i due rami.
   */
  const riga = (bar: PeriodBar, current: boolean) => (
    <Row
      key={bar.key}
      label={periodRangeLabel(period, bar.range)}
      // I due numeri arrivano **dal modello**, non da una seconda aritmetica
      // sulle date: `daysTotal` vale 28, 29, 30 o 31 sul mese, e un secondo
      // conto qui sarebbe una copia da tenere allineata con `periodRange`
      // (vedi `PeriodBar.daysLived`).
      //
      // **E la nota non e' `bar.daysLived < bar.daysTotal`.** Sembra la stessa
      // domanda e non lo e': l'ultimo giorno del periodo — la domenica di ogni
      // settimana, l'ultimo di ogni mese — i due sono uguali e il periodo e'
      // **ancora in corso**, perche' la giornata non e' finita e ci si puo'
      // ancora spendere. Chi disegnasse questa riga a partire dai giorni la
      // perderebbe una volta a settimana, e proprio nel giorno in cui "quanto
      // resta" e' la cosa piu' utile della schermata. C'e' un test su quel
      // giorno, ed e' li' per questo.
      note={
        current
          ? t('stats.daysSoFar', { days: daysLabel(bar.daysLived), total: bar.daysTotal })
          : null
      }
      open={current}
      amount={money(bar.cents)}
      fraction={bar.fraction}
      color={null}
      track={bar.track}
      bar
    />
  )
  return (
    <section class="stats__section">
      {/* **Il titolo e cio' che conta stanno sulla stessa riga**, e non e'
          compattamento fine a se stesso: erano due blocchi impilati per due
          pezzi della stessa frase — *"settimana per settimana"* e *"delle
          quotidiane"* — e ognuno dei 26 px che costavano e' un pixel che
          allontana dalla piega la seconda riga di questo grafico, cioe' **il
          confronto**, cioe' l'unica ragione per cui questa sezione esiste.

          Restano due elementi e non uno: il titolo e' la sezione, il nome di
          parte dice **di che soldi** si tratta, e un test legge ciascuno dal
          proprio. Qui il nome di parte non porta un totale — sarebbe la somma
          di otto periodi, che non chiede nessuno — ne' una pastiglia: non c'e'
          nessuna barra divisa a cui legarsi, e le barre di B hanno un colore
          solo. */}
      <div class="stats__head">
        <h2 class="stats__title">
          {t(period === 'weekly' ? 'stats.byPeriod.weekly' : 'stats.byPeriod.monthly')}
        </h2>
        <h3 class="stats__partTitle">
          <span class="stats__partName">{t('stats.variable')}</span>
        </h3>
      </div>
      {/* **Dal piu' recente: la riga di oggi in cima, poi i chiusi all'indietro.**
          Misurato a 390x844 sulla forma dell'export del 26 agosto — una parte
          fissa, cinque quotidiane, otto settimane di storia — con l'ordine
          cronologico la riga di oggi cadeva a `top: 924` in un viewport alto
          844: **80 px sotto il bordo**, e con lei le due settimane piu'
          recenti. Sopra la piega restavano le cinque piu' vecchie. B esiste per
          rispondere a *"sto spendendo piu' o meno degli altri periodi"*, e in
          quell'ordine **la risposta e' fuori campo per costruzione, non per
          spazio**: sta in fondo a otto righe, quindi nessun pixel guadagnato
          sopra la porta dentro. Invertito, le stesse misure danno oggi a
          `top: 560` e la settimana scorsa a `612` — la domanda e il suo termine
          di paragone nella stessa occhiata.

          **I chiusi si rovesciano insieme a lei, e non e' un di piu'.** Con
          `current` in cima e i chiusi dal piu' vecchio, la seconda riga sarebbe
          il periodo piu' **lontano**: si confronterebbe questa settimana con
          otto settimane fa, e il verso del tempo si girerebbe fra la prima riga
          e la seconda. Un solo verso, e va da oggi all'indietro.

          **Coerente con lo Storico**, che ordina dal piu' recente
          (`groupByDay`, `compareIsoDates(b.date, a.date)`): le due schermate che
          elencano periodi di tempo li elencano nello stesso verso, e "in cima
          c'e' adesso" e' una convenzione sola invece di due.

          **E non c'e' nessun asse da rovesciare.** B non e' una serie su un asse
          temporale: e' un elenco di righe, ognuna con il proprio intervallo
          scritto a sinistra. Cio' che si rovescia e' l'ordine di lettura, non
          la direzione di una scala.

          ## L'argomento contrario, verificato invece che accolto

          Era: *"il periodo corrente e' incompleto — bordo aperto, «3 giorni su
          7» — e metterlo per primo lo rende l'ancora della scala"*. Verificato
          nel modello di adesso, **non regge**, e le tre ragioni sono separate.

          1. **Non e' aritmetica.** L'ancora e' il **massimo**: `trendScale` in
             `stats-view.ts` e' un `reduce` su `[...closed, current]` che prende
             il maggiore fra gli speso e i budget confrontabili, cioe' e'
             indifferente all'ordine per costruzione. Misurato disegnando le due
             versioni: le otto larghezze, per etichetta, sono identiche al
             centesimo di pixel (109,11 · 68,28 · 92,78 · 60,13 · 125,45 · 76,45
             · 100,95 · 93,59).
          2. **Non e' nemmeno geometria.** La barra che *fa* da riferimento e'
             quella che arriva a fondo colonna, e quale sia lo decide il valore,
             non il posto. Nella scena misurata — con un budget — non ci arriva
             nessuna: la colonna e' 166,28 px e la piu' lunga ne vale 125,45,
             perche' il riferimento e' **la traccia**, che e' disegnata uguale su
             tutte e otto le righe.
          3. **Resta la lettura, e li' l'argomento si rovescia.** Le due marche
             che dichiarano l'incompletezza — il bordo aperto e la nota in giorni
             — stanno **sulla riga stessa**. Nell'ordine vecchio erano a
             `top: 924`, cioe' **la dichiarazione era sotto la piega insieme alla
             cosa dichiarata**: chi non scorreva vedeva otto quattordicesimi di
             sezione senza mai incontrare il fatto che uno di quei periodi non e'
             finito. Mettere la riga in cima non porta sopra la piega una barra
             incompleta muta: ci porta **la barra e la sua dichiarazione insieme**,
             per la prima volta. */}
      {/* B e' sempre un grafico quando c'e': `TREND_MIN_ROWS` decide se la
          sezione esiste, non se ha le barre. */}
      <ul class="stats__rows" data-chart="">
        {riga(trend.current, true)}
        {[...trend.closed].reverse().map((bar) => riga(bar, false))}
      </ul>
    </section>
  )
}

/**
 * **Le frecce del periodo**, in cima e sopra ogni altra cosa.
 *
 * ## Perche' sta fuori dai rami della vista
 *
 * Si disegna **prima** di scegliere fra `blank`, `outside` e `ready`, e non
 * dentro il ramo pieno. Una settimana intermedia senza spese e' uno stato
 * legittimo da attraversare: se le frecce vivessero dentro il ramo con le
 * righe, chi ci atterra resterebbe **chiuso li' dentro**, senza il controllo che
 * lo riporta indietro. E' lo stesso argomento con cui l'interruttore delle fisse
 * e' stato tolto — *un controllo che puo' cancellare se stesso non e' un
 * controllo* — applicato a un controllo nuovo prima che il difetto esista.
 *
 * ## L'etichetta
 *
 * Sul periodo corrente dice **"Questa settimana"**, la stessa stringa che la
 * Home mette sopra il numero grande (`period.weekly`): due schermate che parlano
 * dello stesso periodo lo chiamano allo stesso modo.
 *
 * Altrove stampa `periodRangeLabel`, che e' **la stessa funzione con cui B
 * scrive le sue righe**. Non un secondo formato per la stessa cosa: chi legge
 * "24–30 ago" in cima deve ritrovare quella riga identica nel confronto sotto.
 */
function PeriodNav({
  label,
  corrente,
  puoIndietro,
  puoAvanti,
  onIndietro,
  onAvanti,
}: {
  readonly label: string
  readonly corrente: boolean
  readonly puoIndietro: boolean
  readonly puoAvanti: boolean
  readonly onIndietro: () => void
  readonly onAvanti: () => void
}) {
  return (
    <div class="pnav">
      <button
        type="button"
        class="pnav__arrow"
        disabled={!puoIndietro}
        aria-label={t('stats.nav.prev')}
        onClick={onIndietro}
      >
        {/* Il glifo e' disegnato, non una parola: e' l'unico posto della
            schermata in cui un simbolo direzionale non ha bisogno di essere
            letto, e il nome accessibile lo porta comunque. */}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M15 5 8 12l7 7" />
        </svg>
      </button>
      {/* `aria-live` **non** c'e', ed e' la decisione gia' presa sulla riga di
          aiuto: cambiando periodo cambia tutta la schermata, e annunciare
          l'etichetta metterebbe in coda un annuncio davanti al contenuto che
          l'utente ha appena chiesto. Il nome accessibile delle frecce dice cosa
          fanno; questo dice dove si e', e si legge esplorando. */}
      <p class="pnav__label" data-corrente={corrente ? '' : undefined}>
        {label}
      </p>
      <button
        type="button"
        class="pnav__arrow"
        disabled={!puoAvanti}
        aria-label={t('stats.nav.next')}
        onClick={onAvanti}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="m9 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  )
}

export function Stats({ phase, expenses, categories, rules, budgets, period, day }: Props) {
  const ready = phase === 'ready'

  /**
   * **Il selettore delle fisse: stato del componente, acceso, non persistito.**
   *
   * Non e' un campo di `Settings` e non deve diventarlo. Un interruttore di
   * vista che si ricordasse di essere spento nasconderebbe 507,00 € a chi non
   * lo ha piu' in mente — cioe' ADR 016 §1 dalla porta di servizio, che e' il
   * difetto che questo selettore ha il divieto esplicito di reintrodurre.
   * Tornando acceso a ogni apertura, il valore sicuro e' quello di partenza e
   * l'unico modo di non vedere le fisse e' averlo appena deciso.
   *
   * E il costo di non persisterlo e' un tap per chi lo spegne spesso, contro
   * una migrazione di schema su dati veri per chi non lo spegne mai.
   */

  /**
   * **Quanti periodi indietro si sta guardando.** Effimero, come lo stato del
   * grafico: uscendo dalle Statistiche il componente si smonta e si riparte
   * dalla settimana corrente.
   *
   * Non e' una preferenza da ricordare. Uno stato che sopravvive va spiegato, e
   * qui non c'e' niente da spiegare: chi riapre le Statistiche vuole sapere come
   * sta andando adesso, e chi voleva il passato ci torna con una freccia.
   */
  const [indietro, setIndietro] = useState(0)

  const anchor = useMemo(() => shiftPeriod(day, period, indietro), [day, period, indietro])

  const view = useMemo(
    () => statsView({ expenses, categories, rules, budgets, period, day, anchor }),
    [expenses, categories, rules, budgets, period, day, anchor],
  )

  /**
   * **I due limiti, e vivono fuori dai rami della vista.**
   *
   * Avanti si spegne sul periodo corrente: una settimana che non e' ancora
   * successa non ha uno stato vuoto, ha un non-senso.
   *
   * Indietro si spegne sul periodo della prima spesa: oltre ci sono settimane
   * precedenti all'esistenza dei dati, e sono rumore. Il confronto e' fra
   * **inizi di periodo** e non fra date, cosi' la settimana della prima spesa e'
   * raggiungibile per intero e quella prima no.
   */
  const primoInizio = useMemo(() => firstPeriodStart(expenses, period), [expenses, period])
  const inizioGuardato = periodRange(period, anchor).start
  const puoIndietro = primoInizio !== null && isBefore(primoInizio, inizioGuardato)
  const puoAvanti = indietro > 0

  // Il guscio si dipinge prima dei dati ("Ordine di pittura"): finche' non sono
  // arrivati non si mostra ne' il vuoto ne' il pieno, perche' dichiarare "niente
  // da mostrare" mentre si sta ancora leggendo il disco sarebbe un messaggio che
  // afferma un fatto non ancora accertato.
  //
  // Il guscio non ha bisogno di riservare un'altezza: `.stats` e' `flex: 1`
  // dentro `.app__main`, quindi occupa gia' tutto lo spazio disponibile in
  // entrambi gli stati e il contenuto arriva ancorato in alto. Niente si sposta.
  if (!ready) return <div class="stats" />

  // Le frecce, disegnate una volta e valide per tutti i rami qui sotto.
  const nav =
    primoInizio === null ? null : (
      <PeriodNav
        label={
          indietro === 0
            ? // **Le chiavi si scrivono per intero**, e non `t(`period.${period}`)`:
              // una chiave costruita a pezzi spegne il controllo B di
              // `dead-surface.mjs`, che smette di poter dire se ogni chiave ha un
              // lettore — e lo dichiara, "NON APPLICABILE". Una comodita' di due
              // caratteri che disarma una guardia in CI.
              t(period === 'weekly' ? 'period.weekly' : 'period.monthly')
            : periodRangeLabel(period, periodRange(period, anchor))
        }
        corrente={indietro === 0}
        puoIndietro={puoIndietro}
        puoAvanti={puoAvanti}
        onIndietro={() => setIndietro((n) => n + 1)}
        onAvanti={() => setIndietro((n) => Math.max(0, n - 1))}
      />
    )

  if (view.kind === 'blank') {
    return (
      <div class="stats">
        <div class="blank">
          <p class="blank__title">{t('stats.blank.title')}</p>
          <p class="blank__text">{t('stats.blank.text')}</p>
        </div>
      </div>
    )
  }

  // **Ci sono spese, e nessuna cade dove questa schermata guarda.**
  //
  // Non e' lo stato vuoto e non e' `ready` con due elenchi vuoti: e' un terzo
  // stato, e prima che `stats-view.ts` lo dichiarasse **non lo disegnava
  // nessuno**. Cio' che restava a schermo era, per intero, una scheda
  // `Quotidiane · 0,00 €` alta 109 px e quattrocento pixel di niente — una
  // schermata che non dice ne' cosa c'e' ne' cosa manca, proprio a chi ha appena
  // finito di configurare l'affitto e sta guardando per la prima volta se ha
  // funzionato.
  //
  // La forma e' **la stessa** dello stato vuoto — `.blank`, titolo e testo — e
  // deve esserlo: sono due schermate senza righe, e due impaginazioni diverse
  // per lo stesso fatto ("qui non c'e' niente da leggere") si leggono come due
  // guasti diversi. A cambiare sono le parole, che sono un'altra coppia di
  // chiavi perche' dicono un altro fatto: la ragione per esteso sta su
  // `stats.outside.title` in `i18n/it.ts`. In una riga: qui le spese ci sono, e
  // `stats.blank.text` dice *"appena avrai qualche spesa"*.
  //
  // **Nessun importo, e il confine del periodo.** Le due cifre del periodo sono
  // zero per costruzione, e la proiezione mensile delle regole — l'unica diversa
  // da zero — non entra qui: il canone si vede in A quando cade nel periodo, e
  // fuori appartiene allo Storico e alle Spese fisse. L'intervallo invece si
  // scrive, ed e' `periodRangeLabel` come in ogni altro stato: e' il confine di
  // cui la frase parla, e questa era l'unica schermata che ne parlava senza
  // mostrarlo.
  //
  // I due segnaposto arrivano da qui e non dal dizionario perche' nessuno dei
  // due e' una parola da tradurre: `{range}` e' un'etichetta formattata dal
  // locale attivo, `{history}` e' **la stessa chiave della barra**. Ricopiarla a
  // mano nella frase — com'era — la lasciava indietro alla prima rinomina, con
  // il compilatore e `dead-surface.mjs` zitti perche' `nav.history` un lettore
  // ce l'ha comunque.
  if (view.kind === 'outside') {
    return (
      <div class="stats">
        {nav}
        <div class="blank">
          <p class="blank__title">{t('stats.outside.title')}</p>
          <p class="blank__text">
            {t('stats.outside.text', {
              range: periodRangeLabel(view.period, view.range),
              history: t('nav.history'),
            })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div class="stats">
      {nav}
      {/* **Qui c'era la proiezione mensile delle fisse — `530,00 €/mese` — e non
          c'e' piu'.**

          Non e' un taglio di spazio: la stessa cifra compariva **due volte nella
          stessa schermata**. `530,00 €/mese` in testa e `530,00 €` sul totale
          della parte fisse duecento pixel piu' sotto sono due quantita' diverse
          — un tasso e un fatto del periodo — che una settimana su quattro
          coincidono per costruzione, e il suffisso `/mese` distingueva **le
          unita'** senza togliere il fatto che il numero era scritto due volte.

          ## E ADR 016 §3 non cade, perche' non abitava qui

          §3 dice, alla lettera: *"Accanto al budget, **in Impostazioni**, il
          totale mensile delle fisse"*. E' li' che vive, ed e' li' che si
          verifica: `Settings.tsx` mette `<FixedCosts>` subito sotto il gruppo
          del budget — con il commento che cita §3 — e `FixedCosts` scrive
          `fixed.total`, *"In tutto {amount} al mese."*. I due numeri sono
          affiancati nella schermata che §3 nomina, e questa riga ne era una
          terza copia in una schermata che §3 non nomina.

          La riga che portava questa cifra citava §3 come propria ragione. Era
          una citazione **senza la sua condizione**: l'argomento di §3 e' *"la
          seconda cifra ha senso solo se si vede la prima"*, e la prima — il
          budget — nelle Statistiche non c'e'. Qui la cifra stava accanto al
          totale del periodo, che non e' il budget.

          Ne resta senza lettori `StatsTiles` (`hasFixed`, `fixedMonthlyCents`) e
          la chiave `stats.perMonthRate`. La chiave e' tolta; il tipo vive in
          `stats-view.ts` e va tolto di li' — vedi il controllo D di
          `audit:source`, che e' esattamente la guardia scritta per questo. */}
      <Categories
        breakdown={view.byCategory}
        period={view.period}
        range={periodRangeLabel(view.period, view.current.range)}
      />
      {/* **L'assenza di B si legge qui, e non dentro `Periods`.**

          Qui c'era `<Periods trend={view.byPeriod} …>` con dentro
          `if (trend.rows.length === 0) return null`: la sezione decideva di non
          esistere leggendo **un elenco vuoto**, cioe' interpretando un valore
          come un fatto. Adesso il fatto ce l'ha il modello — `byPeriod` e' `Trend`
          oppure `null` — e i tre modi di non esserci (troppe poche righe, niente
          da confrontare, nessuna riga di oggi) sono tre condizioni scritte in
          `statsView` invece di tre strade verso lo stesso elenco vuoto.

          Ne segue che `Periods` non ha piu' nessun ramo vuoto da disegnare: dove
          viene chiamata, la sezione c'e' e ha almeno `TREND_MIN_ROWS` righe. */}
      {view.byPeriod === null ? null : <Periods trend={view.byPeriod} period={view.period} />}
    </div>
  )
}
