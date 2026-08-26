import { Fragment } from 'preact'
import { useMemo } from 'preact/hooks'
import type { Budget, BudgetPeriod, Category, Expense, RecurringRule } from '../core/types'
import type { IsoDate } from '../core/date'
import { money, periodRangeLabel, t } from './i18n'
import { statsView } from './stats-view'
import type { Breakdown, BreakdownSection, CategorySlice, PeriodBar, Trend } from './stats-view'
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
  amount,
  fraction,
  color,
  track,
  bar,
}: {
  readonly label: string
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
  readonly bar: boolean
}) {
  return (
    <li class="stat">
      {/* L'equivalente testuale sta nel markup e non e' una vista in piu': i due
          pezzi che lo compongono — l'etichetta e l'importo formattato — sono
          gia' a schermo, e la barra accanto e' dichiarata decorativa. */}
      <span class="stat__label">{label}</span>
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
function Categories({ breakdown }: { readonly breakdown: Breakdown }) {
  const sections = breakdown.sections
  if (sections.length === 0) return null
  return (
    // `data-chart` sta sulla **sezione** e non sull'elenco perche' le colonne
    // sono della sezione: e' li' che si decide se ce ne sono tre o due. Basta
    // che una parte abbia barre — l'altra tiene la colonna del grafico vuota,
    // che e' il modo onesto di dire "qui le barre non ci sono" senza spostare le
    // righe dell'altra.
    <section class="stats__section" data-chart={sections.some((p) => p.asChart) ? '' : undefined}>
      <h2 class="stats__title">{t('stats.byCategory')}</h2>
      {sections.map((part: BreakdownSection) => (
        <Fragment key={part.kind}>
          {/* Il nome della natura e il suo totale **del periodo**. Le due parole
              **Le due etichette non sono simmetriche, e non e' una svista.** Le
              variabili riusano la parola della scheda in testa (`stats.variable`),
              perche' li' la scheda e questa riga sono lo stesso numero. Le fisse
              no: la scheda e' una previsione **al mese**, questa e' quanto e'
              uscito **nel periodo**, e con la stessa parola le due si
              contraddicono a schermo — misurato, la scheda leggeva `0,00 € ogni
              mese` sopra un `Spese fisse 620,00 €`, che e' il caso di una regola
              disattivata dopo aver generato la spesa. Cioe' quello che l'app
              stessa consiglia di fare (`toast.ruleInUse`).

              Non c'e' un `<div>` a raccogliere titolo ed elenco: sarebbe un box
              in mezzo fra la sezione e le sue colonne, e `subgrid` non
              attraversa un box che non sia lui stesso una griglia. La
              separazione fra le due parti sta quindi sul titolo della seconda
              (`.stats__rows + .stats__partTitle`). */}
          <h3 class="stats__partTitle">
            <span class="stats__partName">
              {t(part.kind === 'fixed' ? 'stats.fixedInPeriod' : 'stats.variable')}
            </span>
            {/* **Il totale c'e' solo se le righe sono piu' di una**, e non e' un
                `?? 0` mancato: sul ramo `single` il campo `totalCents`
                **non esiste** (`BreakdownSection`), quindi disegnarlo non
                compila. Il discriminante e' l'unico modo di leggerlo.

                La ragione, scritta qui perche' e' qui che si vede: con una riga
                sola il totale **e'** quella riga, incolonnato sullo stesso bordo
                destro. Misurato, la parte fisse con una regola sola — cioe' il
                canone, il caso modale — dava `Fisse in questo periodo 900,00 €`
                e ventotto pixel sotto `Casa 900,00 €`: la stessa stringa due
                volte. L'invariante che giustifica quella cifra (*"e' sempre la
                somma delle righe"*) con una riga e' vacuo, e cio' che serviva
                davvero — confrontare fisse e variabili fra loro, che le due
                schede in testa non possono fare perche' una e' al mese — con una
                riga lo fa gia' la riga. */}
            {part.single ? null : (
              <span class="stats__partTotal">{money(part.totalCents)}</span>
            )}
          </h3>
          <ul class="stats__rows">
            {part.rows.map((row: CategorySlice) => (
              // L'aggregato delle orfane e' uno per parte, e le due non si
              // fondono: "canoni che non si sa piu' a cosa erano" e "spese a mano
              // che non si sa piu' a cosa erano" sono due fatti. Quindi anche la
              // sua chiave porta la natura.
              <Row
                key={`${part.kind}:${row.orphan ? ORPHAN : row.categoryId}`}
                label={sliceLabel(row)}
                amount={money(row.cents)}
                fraction={row.fraction}
                color={fill(row)}
                bar={part.asChart}
              />
            ))}
          </ul>
        </Fragment>
      ))}
    </section>
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
 * L'etichetta e' `stats.variable`, cioe' **la stessa parola della scheda in
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
 * chiedendo, e quella del periodo corrente e' gia' la scheda in testa.
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
  // Sotto `TREND_MIN_ROWS` la sezione non esiste: e' `stats-view.ts` a svuotare
  // l'elenco, non un secondo confronto scritto qui. B non ha un `asChart` — la
  // soglia decide **se la sezione c'e'**, non se ha le barre — quindi
  // `data-chart` e' incondizionato: dove B esiste, e' un grafico.
  if (trend.rows.length === 0) return null
  return (
    <section class="stats__section" data-chart="">
      <h2 class="stats__title">
        {t(period === 'weekly' ? 'stats.byPeriod.weekly' : 'stats.byPeriod.monthly')}
      </h2>
      <h3 class="stats__partTitle">
        <span class="stats__partName">{t('stats.variable')}</span>
      </h3>
      <ul class="stats__rows">
        {trend.rows.map((row: PeriodBar) => (
          <Row
            key={row.key}
            label={periodRangeLabel(period, row.range)}
            amount={money(row.cents)}
            fraction={row.fraction}
            color={null}
            track={row.track}
            bar
          />
        ))}
      </ul>
    </section>
  )
}

export function Stats({ phase, expenses, categories, rules, budgets, period, day }: Props) {
  const ready = phase === 'ready'
  const view = useMemo(
    () => statsView({ expenses, categories, rules, budgets, period, day }),
    [expenses, categories, rules, budgets, period, day],
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
      {/* Le due cifre (ADR 016 §3). Sono in testa perche' senza di loro i due
          grafici sotto escluderebbero le fisse in silenzio. */}
      <div class="stats__tiles">
        <div class="tile">
          <p class="tile__label">{t('stats.variable')}</p>
          <p class="tile__value">{money(view.tiles.variableCents)}</p>
          <p class="tile__sub">{periodRangeLabel(view.period, view.current.range)}</p>
        </div>
        {view.tiles.hasFixed ? (
          <div class="tile">
            <p class="tile__label">{t('stats.fixed')}</p>
            <p class="tile__value">{money(view.tiles.fixedMonthlyCents)}</p>
            <p class="tile__sub">{t('stats.perMonth')}</p>
          </div>
        ) : null}
      </div>

      <Categories breakdown={view.byCategory} />
      <Periods trend={view.byPeriod} period={view.period} />
    </div>
  )
}
