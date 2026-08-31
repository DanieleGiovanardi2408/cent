import { useMemo } from 'preact/hooks'
import { computeBudgetMetrics } from '../core/budget'
import type { BudgetMetrics } from '../core/budget'
import type { IsoDate } from '../core/date'
import { groupByDay } from '../core/stats'
import type { Budget, Category, Expense } from '../core/types'
import type { AppPhase } from '../app/boot'
import { ArchiveError } from './Blank'
import { ExpenseRow } from './ExpenseRow'
import { activePeriod, allowanceCopy, budgetStart, heroCopy, paceParts, startNote, weekStrip } from './budget-view'
import type { Week } from './budget-view'
import { dayHeading, money, periodName, periodRangeLabel, t, weekdayShortLabel } from './i18n'
import './Home.css'

/**
 * La Home: quanto resta, quanto si puo' spendere oggi, e in quale giorno parte
 * la mano.
 *
 * ## Tre livelli, e prima ce n'era uno
 *
 * La schermata era testo allineato a sinistra su fondo piatto, dall'alto in
 * basso: quattro paragrafi di peso quasi uguale e il 38% della colonna vuoto
 * (misurato: 440 px di contenuto su 708 di colonna a 390 punti). Non le mancava
 * contenuto, le mancava **struttura**.
 *
 * Adesso ha la stessa forma che ha reso leggibili le Statistiche — **gerarchia,
 * densita', scala dichiarata** — e i tre livelli sono:
 *
 * 1. **il numero grande** col suo segno e col suo colore: quanto resta. E' *il
 *    fatto*, ed e' l'unica cosa della schermata che porta `--over`;
 * 2. **una riga**, l'unica azionabile: quanto si puo' spendere al giorno, o —
 *    sforati — il passo tenuto contro quello sostenibile. E' *l'azione*, e sta
 *    un gradino sotto (vedi `.allowance` in Home.css per il conto
 *    dell'inchiostro, che e' la ragione per cui e' scesa da 20 a 17 px);
 * 3. **le note e la striscia**: cosa il numero non conta (ADR 016 §2), da quale
 *    budget viene, e i sette giorni della settimana in corso.
 *
 * ## Le tre sezioni, e cosa tiene ognuna
 *
 * - `.hero` — il periodo, la parola, il numero, la nota del budget;
 * - `.slot` — la riga azionabile, le note, **e il bottone del budget**, che
 *   prima galleggiava fra due vuoti senza appartenere a niente. Adesso e'
 *   l'ultimo elemento del blocco di cui parla, a ventiquattro pixel dalla riga
 *   che lo riguarda invece che a novanta;
 * - `.days` — la coda: la striscia dei sette giorni e le spese di oggi.
 *
 * ## Perche' la barra del periodo non c'e' piu'
 *
 * Perche' oltre il budget era **al 100% sempre**, identica a 1,01 volte il
 * budget e a quattro volte: una marca che ha lo stesso aspetto in tutto un ramo
 * non misura niente. E la riparazione che la renderebbe onesta — disegnare
 * l'eccedenza oltre il bordo — richiede di riscalare la traccia sul massimo fra
 * budget e speso, cioe' di **accorciare la rotaia del budget**: e' esattamente
 * l'argomento per cui `.stat__unlived` e' stata cancellata dalle Statistiche, e
 * vale qui perche' vale la stessa condizione — la traccia sarebbe l'unico posto
 * in cui il tetto del periodo e' disegnato, e non c'e' nessun asse contro cui
 * rileggerlo.
 *
 * Sotto il budget la barra misurava davvero, ma misurava `speso / budget`, che
 * questa schermata dice gia' tre volte: il numero col segno, la parola sopra di
 * lui, e la nota `di 200,00 € · 176,00 € spesi`. **Il suo stesso
 * `aria-label` era quella nota**, cioe' la frase stampata venti pixel sopra: la
 * barra dichiarava di essere una copia nel proprio nome accessibile.
 *
 * Cio' che prende il suo posto non e' il vuoto: e' la striscia, che e' un
 * grafico con una scala dichiarata e una linea di riferimento.
 *
 * ## Conseguenza aperta, dichiarata qui perche' non e' mia da chiudere
 *
 * `spentRatio` in `budget-view.ts` resta senza lettori di produzione, tenuta
 * viva solo dai suoi test. E' la forma esatta di `expensesInRange` e
 * `planBudgetChange`, cancellate per questo. Non la tolgo io perche' quel file
 * e' in mano a `data-core` mentre scrivo.
 *
 * ## Ordine di pittura: la Home e' la schermata dove un salto si vedrebbe
 *
 * Il guscio si dipinge prima dei dati, quindi ogni blocco **sopra la coda** ha
 * un'altezza riservata in CSS: `.hero` riga per riga, `.slot` con `--slot-min`.
 * La coda (`.days`) non ne ha una e non deve averla — sotto di lei non c'e'
 * niente da spingere — ed e' proprio quello che rende possibili le due cose che
 * la Home non poteva fare prima: **l'intestazione "Oggi" che cade quando la
 * giornata e' vuota**, e **la striscia che non esiste quando non c'e' niente da
 * disegnare**. Nessuna delle due sposta un pixel di cio' che sta sopra.
 *
 * ## Senza budget la Home non e' vuota
 *
 * Mostra il totale del periodo e il passo di spesa — cose vere, che l'app
 * conosce comunque — e invita a impostare un budget spiegando che cosa
 * cambierebbe. Uno stato vuoto che non dice niente e' una schermata sprecata.
 */

interface Props {
  readonly phase: AppPhase
  /**
   * La riga che spiega come si salva e' accesa: **le prime tre spese e basta**.
   * Arriva da `App` invece di essere riderivata qui, cosi' questo foglio e
   * quello dell'inserimento non possono dire cose diverse sullo stesso utente.
   */
  readonly coach: boolean
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly budgets: readonly Budget[]
  /** Il giorno civile corrente, ricalcolato al risveglio (ADR 007). */
  readonly day: IsoDate
  readonly onPick: (expense: Expense) => void
  readonly onEditBudget: () => void
}

export function Home({
  phase,
  expenses,
  categories,
  budgets,
  day,
  coach,
  onPick,
  onEditBudget,
}: Props) {
  const ready = phase === 'ready'

  const view = useMemo(() => {
    const period = activePeriod(budgets, day)
    const metrics = computeBudgetMetrics({ expenses, budgets, period, onDate: day, today: day })
    // `groupByDay` sul solo giorno di oggi: il filtro e' una passata su 5.000
    // record, il sort che segue e' su una manciata. E soprattutto l'ordine delle
    // righe e il totale del giorno restano decisi in un posto solo — lo stesso
    // che li decide nello Storico.
    const today = groupByDay(expenses.filter((expense) => expense.date === day))[0]
    // Il budget e' nato dentro questo periodo? (ADR 010). Si calcola qui perche'
    // serve a due righe diverse — la spiegazione e la disponibilita' — e perche'
    // costa una passata sulle spese, che non deve girare a ogni render.
    return {
      period,
      metrics,
      today,
      start: budgetStart(metrics, expenses),
      // Una passata sola sulle 5.000 spese, dentro lo stesso memo delle altre
      // due: la striscia non aggiunge un ricalcolo, aggiunge un giro.
      week: weekStrip(metrics, expenses, day),
    }
  }, [expenses, budgets, day])

  const byId = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  )

  const { metrics } = view
  const hero = heroCopy(metrics)
  const allowance = allowanceCopy(metrics, view.start)
  const since = startNote(metrics, view.start)
  const hasBudget = metrics.budgetCents !== null
  const todayRows = view.today?.expenses ?? []

  return (
    <div class="home">
      <section class="hero">
        <p class="hero__period">
          {ready ? `${periodName(view.period)} · ${periodRangeLabel(view.period, metrics.range)}` : ''}
        </p>
        <p class="hero__label">{ready ? hero.label : ''}</p>
        {/* `aria-live` no: il toast annuncia gia' la spesa appena salvata, e due
            annunci per lo stesso fatto sono peggio di uno. */}
        <p class="hero__value" data-tone={ready && hero.over ? 'over' : undefined}>
          {ready ? hero.value : ''}
        </p>
        {/* Da quale budget viene il numero, e quanto e' gia' uscito. Prima
            questa riga aveva un gemello in geometria — la barra del periodo, il
            cui `aria-label` era **questa stessa frase**. Il gemello e' uscito. */}
        <p class="hero__note">{ready ? hero.note : ''}</p>
      </section>

      {/* Il blocco del budget: cambia contenuto ma non misura. Con budget tiene
          la disponibilita'; senza, l'invito e il passo. In tutti e due gli stati
          finisce con le note e con il bottone, che **e' suo**: prima stava
          fuori, fra due vuoti, e riguardava cio' che aveva sopra senza
          appartenergli.

          L'altezza e' riservata in CSS per il piu' alto dei due stati, cosi' il
          passaggio da uno all'altro — e dal guscio a entrambi — non sposta la
          coda di un pixel. */}
      <section class="slot">
        {/* Il corpo sta in alto, il piede in fondo (`margin-block-start: auto`).
            Lo spazio che avanza dalla riserva si raccoglie **fra i due**, cioe'
            sotto la riga grande dove si legge come aria tipografica, invece che
            fra l'ultima nota e il bottone dove si leggeva come un bottone che
            galleggia. */}
        {/* Il corpo e' **ancorato in basso**, e non e' un gusto: e' cio' che
            tiene fermo il bottone. La sua altezza e' riservata per lo stato piu'
            alto (senza budget), quindi cio' che gli sta dentro cresce verso
            l'alto — la riga della disponibilita' che passa a due righe, la nota
            di ADR 010 che compare — senza spostare di un pixel ne' la nota delle
            fisse, ne' il bottone, ne' la coda. */}
        <div class="slot__body">
          {!ready ? null : hasBudget ? (
            <>
              {/* Il livello 2: **una riga**, dove ce n'erano tre. La
                  disponibilita' col suo numero di giorni dentro; sforati, il
                  passo contro il sostenibile. Mai le due cose insieme —
                  l'argomento sta su `allowanceCopy`. */}
              <p class="allowance" data-tone={allowance.over ? 'over' : undefined}>
                {allowance.text}
              </p>

              {/* Perche' i numeri sono quelli, nel periodo in cui il budget e'
                  nato (ADR 010). Compare per un periodo solo e poi sparisce da
                  sola, e sta **attaccata alla riga che spiega**: e' la
                  giustificazione di quel numero, non una nota di sezione. */}
              {since === null ? null : <p class="since">{since}</p>}
            </>
          ) : (
            <>
              {/* Due pezzi e non tre: la coda che diceva *"invece di quanto hai
                  gia' speso"* e' uscita, e con lei la terza riga che la riserva
                  del riquadro doveva coprire in inglese. L'argomento sta in
                  `i18n/it.ts`, sopra la chiave. */}
              <p class="invite">
                {t('home.invite.before')}
                <b>{t('home.invite.strong')}</b>
              </p>
              <Pace metrics={metrics} />
            </>
          )}
        </div>

        <div class="slot__foot">
          {/* Il livello 3: cosa **non** c'e' dentro il numero grande
              (ADR 016 §2), in tutti e due gli stati — senza budget il numero
              grande e' lo speso, che le fisse le esclude identicamente.

              L'altezza e' riservata anche da vuota: la riga compare e sparisce
              a seconda che nel periodo sia scattata o no una regola — settimana
              del canone si', quella dopo no — e senza riserva il bottone
              salirebbe di una riga a settimane alterne. */}
          <p class="slot__fixed">{ready ? hero.fixed ?? '' : ''}</p>

          {/* Un bottone solo, sempre nello stesso posto, che cambia solo la
              parola. Sta **dentro** il blocco di cui parla: attaccato all'ultima
              nota, non sospeso fra due vuoti. */}
          <button type="button" class="budget" disabled={!ready} onClick={onEditBudget}>
            {t(hasBudget && ready ? 'home.budget.change' : 'home.budget.set')}
          </button>
        </div>
      </section>

      {/* La coda. **E' l'unico blocco della Home senza altezza riservata**, ed
          e' l'ultimo: cio' che compare e sparisce qui dentro non ha niente sotto
          da spostare. E' la condizione che rende possibili le due assenze
          seguenti — la striscia che non c'e' e l'intestazione che cade — senza
          un pixel di CLS. */}
      <section class="days">
        {/* **Con zero da disegnare la striscia non c'e'**: non sette colonne
            vuote. Il modello lo decide (`weekStrip` -> `null`), e la ragione e'
            sua: il telaio di un grafico i cui dati sono tutti a zero occupa
            senza informare. */}
        {!ready || view.week === null ? null : <WeekStrip week={view.week} day={day} />}

        {phase === 'failed' ? (
          <ArchiveError />
        ) : todayRows.length === 0 ? (
          // Mentre il database si apre non si dice niente: un messaggio che dura
          // 40 ms e' rumore che si vede lampeggiare.
          //
          // **E l'intestazione "Oggi" non c'e'.** Era seguita dal nulla, con
          // `Oggi non hai segnato niente` otto righe sotto: lo stesso fatto due
          // volte, con un buco in mezzo. Quando la giornata e' vuota
          // l'intestazione non ha niente da intestare.
          //
          // Lo stato vuoto invece **non si tocca**: e' l'esempio giusto della
          // regola *dove ci sono dati si mostrano numeri, dove non ce ne sono si
          // parla*. Cade l'intestazione, resta il copy.
          //
          // **E il guscio non disegna piu' un `.blank` vuoto.** Quel div esisteva
          // per tenere in piedi `--blank-min`, cioe' per riservare l'altezza di
          // un messaggio che il guscio non sa se ci sara'. La riserva e' uscita
          // (l'argomento sta su `--blank-min` in Home.css: sotto la coda non c'e'
          // niente da spingere, e infatti toglierla non sposta un pixel), quindi
          // il segnaposto non tiene piu' niente in piedi: e' un nodo vuoto con
          // dentro solo il proprio padding.
          ready ? (
            <div class="blank">
              <p class="blank__title">{t('home.blank.title')}</p>
              {/* **Il tutorial dei due tap tace dopo tre spese**, come la riga
                  del foglio (`coach`), e per lo stesso argomento — *e' un'
                  istruzione, non un valore*.

                  Questa condizione non c'era, e il difetto non era del lunedi':
                  era **di ogni mattina**. `todayRows.length === 0` e' vero tutti
                  i giorni finche' non si segna la prima spesa, quindi chi usa
                  l'app da settimane si sentiva spiegare *"Tocca il + qui sotto,
                  digita l'importo e scegli la categoria"* ogni volta che
                  apriva. La decisione di far tacere la riga dopo tre spese
                  esisteva gia' — in `AddSheet` — e **non nominava quel foglio**:
                  vale ovunque valga il suo argomento, e questa e' la seconda
                  stanza in cui vale.

                  Il titolo resta sempre: *"Oggi non hai segnato niente"* e' un
                  fatto sui dati, non un'istruzione. */}
              {coach ? <p class="blank__text">{t('home.blank.text')}</p> : null}
            </div>
          ) : null
        ) : (
          <>
            <h2 class="today__head">
              <span class="today__name">{t('day.today')}</span>
              {/* Il totale non ha piu' un ramo vuoto: questa intestazione esiste
                  solo dove ci sono righe, quindi il numero c'e' sempre. Il
                  ternario che stava qui copriva esattamente il caso in cui
                  adesso l'intestazione non viene disegnata. */}
              <span class="today__total">{money(view.today?.totalCents ?? 0)}</span>
            </h2>
            <ul>
              {todayRows.map((expense) => (
                <li key={expense.id}>
                  <ExpenseRow
                    expense={expense}
                    category={byId.get(expense.categoryId)}
                    onPick={onPick}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

/**
 * La striscia dei sette giorni: lunedi' -> domenica, una colonna per giorno.
 *
 * ## Perche' questa e non un altro andamento
 *
 * Perche' **ha sette punti gia' oggi**. Il confronto fra settimane ne ha due
 * alla prima settimana e resta cosi' per un mese; questo e' pieno dal primo
 * lunedi'. Ed e' la domanda che un'app di spese quotidiane deve saper
 * rispondere: **in quale giorno parte la mano.**
 *
 * ## Niente asse, niente griglia — e l'importo scritto e' uno solo
 *
 * Nelle Statistiche ogni riga porta il proprio importo accanto alla barra, e la
 * regola sull'etichettare selettivamente **non** valeva li'. Vale qui, e la
 * condizione e' opposta: **li' i numeri stanno accanto a barre orizzontali, qui
 * starebbero sopra colonne larghe 44 px.** Sette importi in fila sopra sette
 * colonne sono sette blocchi di cifre che si leggono prima delle colonne, cioe'
 * una tabella disegnata male; uno solo — il piu' alto — dice la scala e lascia
 * al confronto fra le altezze il resto.
 *
 * ## La scala si dichiara, e la dichiarano i due estremi
 *
 * `scaleCents` e' `max(giorno piu' alto, sostenibile)`. Le due cose che possono
 * toccare il bordo alto sono quindi due, e **tutte e due portano il proprio
 * numero scritto**: la colonna piu' alta lo ha sopra di se', la linea nella
 * propria legenda. Una terza riga *"colonna intera = X"* — la forma che le
 * Statistiche usano — direbbe lo stesso numero di una delle due. Li' serviva
 * perche' le sezioni sono piu' d'una e una barra piena vale importi diversi
 * nella stessa schermata; qui il grafico e' uno e la scala e' una.
 *
 * ## Il pavimento della colonna e' del modello, non di questo file
 *
 * `weekStrip` trasla le frazioni sopra `COLUMN_MIN_FRACTION = 2 / 48`, e quel
 * `48` e' **un contratto su `--strip-h`**: la striscia non puo' scendere sotto
 * 3rem o le colonne piu' corte tornano invisibili. Qui `--strip-h` vale 5rem, e
 * il contratto e' sorvegliato da `home.spec.ts` ("il pavimento della colonna"),
 * che risolve la variabile dalla pagina e misura la colonna piu' corta davvero
 * dipinta.
 */
function WeekStrip({ week, day }: { readonly week: Week; readonly day: IsoDate }) {
  // Il giorno da etichettare. `findIndex` e non un `find` con `!`: qui non c'e'
  // nessuno stato da dichiarare irraggiungibile — se l'indice non c'e',
  // nessuna colonna prende l'etichetta, e il confronto `index === peakIndex`
  // resta totale.
  const peakIndex = week.days.findIndex((bar) => bar.date === week.peak)
  const peakCents = week.days.reduce((max, bar) => Math.max(max, bar.cents), 0)

  return (
    <section class="week">
      <div class="week__head">
        <h2 class="week__title">{t('home.week.title')}</h2>
        {/* La legenda della linea, col suo numero. Senza cifra manderebbe a
            leggere quella della riga della disponibilita', che e' un'altra
            velocita': `rimanente / giorni rimanenti` contro `budget / giorni`. */}
        {week.sustainable === null ? null : (
          <p class="week__legend">
            {t('home.week.sustainable', { amount: money(week.sustainable.cents) })}
          </p>
        )}
      </div>

      {/* `role="img"`: il grafico si annuncia come una figura con la sua
          descrizione, invece di leggersi come quattordici frammenti di testo.
          Le lettere dei giorni restano dentro e non si annunciano da sole. */}
      <ol
        class="week__cols"
        role="img"
        aria-label={t('home.week.aria', {
          day: dayHeading(week.peak, day),
          amount: money(peakCents),
        })}
      >
        {week.days.map((bar, index) => (
          <li class="week__col" key={bar.date}>
            <span class="week__cell" data-past={bar.future ? undefined : ''}>
              {/* L'importo del giorno piu' alto, ancorato alla cima della
                  propria colonna. Alle due colonne di bordo si aggancia al
                  lato invece che al centro: centrato, alla prima uscirebbe
                  dalla colonna verso il margine della pagina, cioe' scroll
                  orizzontale a 320 punti. */}
              {index === peakIndex ? (
                <span
                  class="week__peak"
                  data-edge={index === 0 ? 'start' : index === 6 ? 'end' : undefined}
                  style={`--h:${bar.fraction}`}
                >
                  {money(bar.cents)}
                </span>
              ) : null}
              {/* Zero resta zero: un giorno senza spese non prende inchiostro.
                  A distinguerlo da un giorno **non ancora arrivato** e' il
                  filo di base sotto la cella (`[data-past]`), non un colore. */}
              <span
                class="week__ink"
                style={`--h:${bar.fraction}`}
                data-open={bar.current ? '' : undefined}
              />
            </span>
            <span class="week__day" data-current={bar.current ? '' : undefined}>
              {weekdayShortLabel(bar.date)}
            </span>
          </li>
        ))}
        {/* La linea del sostenibile **dopo** le colonne, e non e' indifferente:
            fra due assoluti senza livello dichiarato vince chi viene dopo, e
            l'unico caso in cui questa linea dice qualcosa e' proprio quello in
            cui una colonna l'ha superata. Prima delle colonne sarebbe invisibile
            dove serve — e' il difetto che `.stat__accrued` ha gia' pagato. */}
        {week.sustainable === null ? null : (
          <div class="week__line" style={`--at:${week.sustainable.fraction}`} />
        )}
      </ol>
    </section>
  )
}

/**
 * Il passo, con i numeri in grassetto: chi guarda lo schermo per mezzo secondo
 * trova le cifre senza leggere la frase intorno.
 *
 * **Vive solo nello stato senza budget**, dove e' l'unica cosa vera che si possa
 * dire — e dove il grassetto serve davvero, perche' la frase intorno e' muta.
 * Il livello 2, che e' la riga con budget, e' invece gia' tutto in semibold sul
 * colore del testo: li' un grassetto dentro un grassetto non distinguerebbe
 * niente, ed e' per questo che `allowanceCopy` restituisce una stringa e non dei
 * pezzi.
 */
function Pace({ metrics }: { readonly metrics: BudgetMetrics }) {
  return (
    <p class="pace">
      {paceParts(metrics).map((part, index) =>
        part.strong === true ? (
          <b class="pace__n" key={index}>
            {part.text}
          </b>
        ) : (
          part.text
        ),
      )}
    </p>
  )
}
