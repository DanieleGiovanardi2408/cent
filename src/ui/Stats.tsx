import { Fragment } from 'preact'
import { useMemo, useState } from 'preact/hooks'
import type { Budget, BudgetPeriod, Category, Expense, RecurringRule } from '../core/types'
import type { IsoDate } from '../core/date'
import { daysLabel, money, periodRangeLabel, t } from './i18n'
import { statsView } from './stats-view'
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
 * ## Le due scale si dichiarano con la geometria
 *
 * In ogni parte la barra piu' lunga arriva a fondo colonna, perche' il modello
 * garantisce che la frazione massima di una sezione valga esattamente 1. Due
 * barre piene con due importi diversi dicono da sole che le scale sono due, e
 * l'intestazione dice quali due.
 *
 * Qui c'era una frase — *"le barre sono in scala su {nome}, la piu' grande"* — e
 * non c'e' piu' per due ragioni che valgono anche separatamente. La prima:
 * diceva cio' che la prima barra, lunga il 100% per costruzione, dice da se'. La
 * seconda: la sua unica parte non tautologica era **il nome del riferimento**, e
 * quel nome e' esattamente cio' che la riga accorcia — misurato a 320 punti, la
 * frase citava `Casa affitto utenze e condomin` mentre la riga mostrava `Casa
 * affitto utenze e cond…`. Un messaggio che afferma un fatto che lo schermo non
 * conferma.
 *
 * L'etichetta oggi va a capo invece di troncare (`Stats.css`, `.stat__label`),
 * quindi quel nome si accorcia piu' tardi — ma si accorcia lo stesso: due righe
 * sono un tetto, non un permesso. L'argomento non dipendeva dal **dove** cade il
 * taglio, e continua a valere.
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
  range,
  showFixed,
  onToggleFixed,
}: {
  readonly breakdown: Breakdown
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
  readonly showFixed: boolean
  readonly onToggleFixed: () => void
}) {
  const { sections, split, asChart } = breakdown

  // **A si disegna anche senza sezioni, se a svuotarla e' stato l'utente.**
  //
  // Con il selettore spento in un periodo di sole spese fisse — la settimana in
  // cui esce solo l'affitto, cioe' il caso che ADR 016 da' per scontato — il
  // modello consegna zero sezioni e nessuna divisione (una meta' e' zero). Se
  // questo componente uscisse su `sections.length === 0` come faceva prima,
  // **sparirebbe anche il selettore**: l'utente resterebbe chiuso fuori dai
  // propri dati esattamente dentro il ramo in cui l'unico interruttore che li
  // riaccende non si disegna piu'.
  //
  // La condizione quindi non guarda le righe: guarda **chi le ha tolte**.
  if (sections.length === 0 && showFixed) return null

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
    // decisione arriva dal modello gia' presa **sull'insieme**: da quando la
    // scala e' una sola, "questa parte ha poche righe" non e' piu' una domanda
    // che qualcuno possa fare a una parte per volta.
    <section class="stats__section" data-chart={asChart ? '' : undefined}>
      {/* "Dove sono finiti · 17–23 ago  642,00 €". La domanda del titolo ha
          bisogno di un "quando" e di un "quanto": senza il secondo era una
          domanda senza risposta in cima a una schermata che esiste per
          rispondere.

          Il totale sta in un elemento suo dentro la riga del titolo e non
          dentro l'`<h2>`: l'intestazione resta la domanda — un test la legge
          intera — e la cifra e' un dato che le sta accanto, incolonnato sul
          bordo destro come tutti gli importi di questa schermata. */}
      <div class="stats__head">
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
        {totalCents === null ? null : (
          <span class="stats__titleTotal">{money(totalCents)}</span>
        )}
      </div>

      {split === null ? null : <Split split={split} />}

      {/* **L'intestazione delle fisse si disegna anche quando la sezione non
          c'e'**, e non e' una duplicazione: e' l'unico posto in cui vive il
          selettore, e un selettore che sparisce insieme a cio' che nasconde e'
          un vicolo cieco. Porta con se' la cifra nascosta, cosi' spegnere le
          righe non spegne il fatto (ADR 016 §1). */}
      {fixedSection === undefined && (split !== null || !showFixed) ? (
        <PartHead
          kind="fixed"
          amount={split === null ? null : money(split.fixedCents)}
          showFixed={showFixed}
          onToggleFixed={onToggleFixed}
        />
      ) : null}

      {sections.map((part: BreakdownSection) => (
        <Fragment key={part.kind}>
          <PartHead
            kind={part.kind}
            // **Il totale di sezione esiste solo quando le sezioni sono due**,
            // e la condizione va derivata qui perche' qui e' cambiata la stanza.
            //
            // Da quando il titolo di A porta il totale del periodo, quel numero
            // e' gia' a schermo quaranta pixel piu' su. Con **una sezione sola**
            // il totale della sezione **e'** quello del periodo — non ci sono
            // altre righe da cui differire — quindi riscriverlo qui e' scriverlo
            // due volte: misurato su una settimana di sole spese a mano,
            // `70,00 €` sul titolo e `70,00 €` sull'intestazione. E' lo stesso
            // argomento che `part.single` fa una riga piu' in basso — *"con una
            // riga sola il totale e' quella riga"* — applicato un livello sopra,
            // con "riga" che diventa "sezione".
            //
            // Con **due sezioni** il totale del titolo e' la loro somma, e
            // nessuna delle due la si puo' ricavare guardando: la quota di
            // ciascuna e' un numero suo, e senza di lei la barra divisa qui sopra
            // resterebbe una forma senza cifre — cioe' l'etichetta diretta che
            // `0b` chiede espressamente di scrivere.
            //
            // La sorgente e' `split` e non `part.totalCents`: sono la stessa
            // cifra dalla stessa sorgente (il modello lo dichiara), e leggere
            // quella che esiste **solo** nel ramo a due sezioni fa fallire la
            // compilazione se un domani questa condizione tornasse larga.
            //
            // Che l'etichetta diretta della barra sia **questa intestazione** e
            // non una riga sotto la barra e' l'altra meta' della stessa scelta:
            // una riga in piu' avrebbe ripetuto anche i due **nomi** — `Spese
            // fisse` sopra `Fisse in questo periodo` a sessanta pixel — e sarebbe
            // costata una riga sopra B, che e' esattamente cio' che manca al
            // confronto settimanale per stare sopra la piega. La pastiglia
            // (`.stats__partName::before`) fa il legame con il segmento.
            //
            // Il ramo `single` vince su tutto e per la sua ragione: con una riga
            // sola il totale **e'** quella riga, ventotto pixel sotto e
            // incolonnata sullo stesso bordo destro.
            amount={
              part.single || split === null
                ? null
                : money(part.kind === 'fixed' ? split.fixedCents : split.variableCents)
            }
            showFixed={showFixed}
            onToggleFixed={onToggleFixed}
          />
          <ul class="stats__rows">
            {part.rows.map((row: CategorySlice) => (
              // L'aggregato delle orfane e' uno per parte, e le due non si
              // fondono: "canoni che non si sa piu' a cosa erano" e "spese a mano
              // che non si sa piu' a cosa erano" sono due fatti. Quindi anche la
              // sua chiave porta la natura.
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
                bar={asChart}
              />
            ))}
          </ul>
        </Fragment>
      ))}

      {/* **Non e' "non c'e' niente": e' "l'hai nascosto tu".**
          Le due frasi descrivono lo stesso schermo vuoto e mandano a fare due
          cose opposte — la prima a segnare una spesa, la seconda a riaccendere
          l'interruttore che sta due righe sopra. Dirlo com'e' e' anche l'unico
          modo perche' non sembri un guasto. */}
      {sections.length === 0 ? <p class="stats__hidden">{t('stats.hiddenAll')}</p> : null}
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
 * raccontare riga per riga: e' il fatto dominante della schermata, e con la
 * scala unica le due sezioni da sole non lo dicono — dicono chi e' piu' lungo,
 * non quanto pesa una natura sull'altra.
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
 * L'intestazione di una parte di A: **quale dei due tipi di soldi** conta
 * l'elenco qui sotto, la pastiglia che la lega al proprio segmento della barra
 * divisa, e — sulle fisse — l'interruttore.
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
 * ## L'interruttore sta qui e non in una riga sua
 *
 * Perche' e' **la cosa che nasconde**, e un comando sul proprio oggetto non ha
 * bisogno di dire su cosa agisce. Ed e' anche il conto dei pixel: una riga
 * dedicata sarebbe costata 44 px pieni sopra B, cioe' avrebbe allontanato di
 * un'altra riga il confronto settimanale che gia' non ci sta.
 *
 * `role="switch"` e non un `aria-expanded`: non e' una divulgazione — le righe
 * non ricompaiono uguali, **la scala si rifa'** sulle sole quotidiane — ed e'
 * cio' che un interruttore e' per definizione, uno stato acceso/spento.
 *
 * L'etichetta accessibile e' quella dell'interruttore (`stats.showFixed`) e non
 * il testo dell'intestazione: il nome di un comando dice cosa fa, e il nome
 * della sezione lo dice gia' l'intestazione a cui e' dentro.
 *
 * Non c'e' un `<div>` a raccogliere titolo ed elenco: sarebbe un box in mezzo
 * fra la sezione e le sue colonne, e `subgrid` non attraversa un box che non sia
 * lui stesso una griglia. La separazione fra le due parti sta quindi sul titolo
 * della seconda (`.stats__rows + .stats__partTitle`).
 */
function PartHead({
  kind,
  amount,
  showFixed,
  onToggleFixed,
}: {
  readonly kind: BreakdownSection['kind']
  /** Il totale della parte, o `null` quando lo porta gia' qualcos'altro. */
  readonly amount: string | null
  readonly showFixed: boolean
  readonly onToggleFixed: () => void
}) {
  const fixed = kind === 'fixed'
  return (
    <h3 class="stats__partTitle" data-kind={kind}>
      <span class="stats__partName">
        {t(fixed ? 'stats.fixedInPeriod' : 'stats.variable')}
      </span>
      {amount === null ? null : <span class="stats__partTotal">{amount}</span>}
      {fixed ? (
        <button
          type="button"
          class="stats__toggle"
          role="switch"
          aria-checked={showFixed}
          aria-label={t('stats.showFixed')}
          onClick={onToggleFixed}
        >
          <span class="stats__switch" aria-hidden="true" />
        </button>
      ) : null}
    </h3>
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
 * quotidiane nell'intestazione di parte di A** — la scheda in
 * testa** e della parte variabile di A. Non e' una frase nuova che dichiara
 * l'esclusione — sarebbe la quarta copia di un fatto che ha gia' la sua casa
 * (DEBITO.md §1.3) — e' il **nome della quantita'**: la stessa parola sopra gli
 * stessi soldi, in tutti e tre i posti in cui la schermata li nomina. Chi legge
 * `Quotidiane 0,00 €` in B ritrova `Quotidiane` in testa e `Spese fisse
 * 900,00 €` accanto, e le due cifre tornano.
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
    <section class="stats__section" data-chart="">
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
      <ul class="stats__rows">
        {riga(trend.current, true)}
        {[...trend.closed].reverse().map((bar) => riga(bar, false))}
      </ul>
    </section>
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
  const [showFixed, setShowFixed] = useState(true)

  const view = useMemo(
    () => statsView({ expenses, categories, rules, budgets, period, day, showFixed }),
    [expenses, categories, rules, budgets, period, day, showFixed],
  )

  // Il guscio si dipinge prima dei dati ("Ordine di pittura"): finche' non sono
  // arrivati non si mostra ne' il vuoto ne' il pieno, perche' dichiarare "niente
  // da mostrare" mentre si sta ancora leggendo il disco sarebbe un messaggio che
  // afferma un fatto non ancora accertato.
  //
  // Il guscio non ha bisogno di riservare un'altezza: `.stats` e' `flex: 1`
  // dentro `.app__main`, quindi occupa gia' tutto lo spazio disponibile in
  // entrambi gli stati e il contenuto arriva ancorato in alto. Niente si sposta.
  if (!ready) return <div class="stats" />

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
      {/* **La proiezione mensile delle fisse, e adesso e' una riga.**
          (ADR 016 §3, *"due numeri, non uno"*: la seconda cifra ha senso solo se
          si vede la prima, e la prima e' il totale del periodo sul titolo di A.)

          Era una scheda grigia alta 109 px — **un quinto dello schermo utile** —
          per una cifra sola, sopra una schermata che non riesce a mettere due
          righe di B sopra la piega. Il peso visivo era l'inverso
          dell'importanza: la proiezione e' contesto, non e' la risposta a
          nessuna delle due domande della schermata.

          **E la cifra porta la propria unita'**, che e' cio' che chiude
          `DEBITO.md` §5: `530,00 €/mese` qui e `530,00 €` in A sono due
          quantita' diverse che una settimana su quattro coincidono per
          costruzione, e finora niente le distingueva **se non l'etichetta** —
          cioe' proprio la cosa che la coincidenza fa saltare. Adesso la
          differenza sta dentro il numero, dove l'occhio cade comunque.

          Resta una cifra che A non puo' dare: A e' retrospettiva e per periodo,
          questa e' quanto costeranno al mese le regole in vigore. */}
      {view.tiles.hasFixed ? (
        <p class="stats__rate">
          <span class="stats__rateLabel">{t('stats.fixed')}</span>
          <span class="stats__rateValue">
            {t('stats.perMonthRate', { amount: money(view.tiles.fixedMonthlyCents) })}
          </span>
        </p>
      ) : null}

      <Categories
        breakdown={view.byCategory}
        range={periodRangeLabel(view.period, view.current.range)}
        showFixed={showFixed}
        onToggleFixed={() => setShowFixed((on) => !on)}
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
