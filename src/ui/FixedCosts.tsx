import type { IsoDate } from '../core/date'
import type { Category, RecurringRule } from '../core/types'
import { fixedLineNote, fixedList } from './recurring-view'
import { money, t } from './i18n'
// `.arch__dot` e' la pastiglia dell'elenco archiviate: stessa forma, stesso
// ruolo (il colore della categoria come superficie, mai come testo).
import './Categories.css'
import './FixedCosts.css'

/**
 * La sezione "Spese fisse" di Impostazioni — **il secondo dei due numeri di
 * ADR 016**.
 *
 * ## Perche' sta attaccata al budget e non altrove
 *
 * Perche' sono la stessa decisione vista da due lati. *"Fisse: 1.040 € al
 * mese"* contro *"Budget: 200 € a settimana"* sono la fotografia del mese in
 * due cifre, e **la seconda ha senso solo se si vede la prima**: mostrare il
 * budget da solo, dopo aver escluso le fisse dal suo calcolo, e' la stessa
 * omissione che la riga in Home chiude — in forma numerica.
 *
 * Due sezioni adiacenti e non una: sono due azioni diverse (si imposta un
 * budget, si crea una regola) e fonderle avrebbe dato un blocco con due bottoni
 * che fanno cose scollegate. La distanza fra i due numeri e' una scrollata di
 * zero: stanno nella stessa schermata piena.
 *
 * ## Il totale e' un tasso, non una previsione di cassa
 *
 * `monthlyCostCents` passa dall'anno medio (365,2425 giorni): una settimanale
 * da 100 vale **434,81 al mese**, non 400. La proprieta' che si compra e' che
 * dodici volte il numero e' il costo annuo vero — ed e' quella che conta,
 * perche' questa cifra si confronta con uno stipendio.
 *
 * Il prezzo e' che **non e' quanto uscira' questo mese**: un mese con cinque
 * scadenze settimanali ne vedra' uscire 500. La copy lo dice, ma **solo quando
 * e' vero**: una mensile con `interval: 1` da' 12/12 = 1, cioe' l'importo tale
 * e quale, e avvertire di un'approssimazione che li' non c'e' insegnerebbe a
 * saltare l'avviso proprio nei casi in cui serve. Stessa forma della conferma
 * dell'arretrato, che non compare sempre.
 *
 * ## Adesso le righe sono bersagli, e prima non lo erano
 *
 * Finche' non c'era niente da fare toccandole erano `li`: un bersaglio che si
 * illumina al tocco e non fa niente e' peggio di nessun bersaglio. Adesso una
 * riga apre la regola — si cambia, si spegne, si riaccende, e se non ha ancora
 * creato niente si cancella — quindi diventa un `button` con il pavimento
 * tattile dichiarato e la freccia che dice che porta da qualche parte.
 *
 * **Il nome accessibile della riga e' tutto cio' che c'e' scritto dentro**:
 * nome, cadenza, importo. Un `aria-label` con il solo nome avrebbe tolto
 * proprio i due numeri per cui uno ci torna sopra.
 */

interface Props {
  readonly rules: readonly RecurringRule[]
  readonly categories: readonly Category[]
  /** Il giorno civile corrente: decide chi e' in vigore adesso. */
  readonly day: IsoDate
  /** Il database e' aperto: prima non c'e' niente da scrivere. */
  readonly ready: boolean
  readonly onNew: () => void
  readonly onPick: (rule: RecurringRule) => void
}

export function FixedCosts({ rules, categories, day, ready, onNew, onPick }: Props) {
  const list = fixedList(rules, day)
  const byId = new Map(categories.map((category) => [category.id, category]))
  const empty = list.lines.length === 0

  return (
    <section class="prefs__group" aria-labelledby="prefs-fixed">
      <h2 class="prefs__title" id="prefs-fixed">
        {t('fixed.title')}
      </h2>

      {/* Il numero, per primo e nella stessa forma della riga del budget qui
          sopra: e' li' che l'occhio torna dopo aver letto l'altra cifra.

          Lo stato vuoto **non e' una riga vuota**: dice cosa sono e cosa
          cambia. Chi arriva qui senza regole non ha bisogno di sapere che il
          totale e' zero, ha bisogno di sapere perche' dovrebbe crearne una. */}
      <p class="prefs__text">
        {!ready ? '' : empty ? t('fixed.none') : t('fixed.total', { amount: money(list.totalCents) })}
      </p>
      {/* Cosa sono e **perche' non entrano nel budget**: sta qui sempre, con
          regole o senza. E' la meta' in parole della coppia di numeri, e chi
          arriva dopo un mese d'uso e' esattamente chi si sta chiedendo perche'
          la Home non le conta. */}
      <p class="prefs__text">{t('fixed.text')}</p>

      {/* Che il totale sia una media si dice **solo quando lo e'**. Compare per
          un'azione dell'utente (creare una regola non mensile), non all'arrivo
          dei dati, quindi non e' CLS: e' la stessa posizione dell'elenco delle
          categorie archiviate, in fondo alla propria sezione, dentro un
          contenitore che scorre. */}
      {list.approximate ? <p class="prefs__text prefs__text--rate">{t('fixed.rate')}</p> : null}

      {empty ? null : (
        <ul class="fixed" aria-label={t('fixed.list')}>
          {list.lines.map((line) => {
            const category = byId.get(line.rule.categoryId)
            return (
              <li key={line.rule.id}>
                <button type="button" class="fixed__row" onClick={() => onPick(line.rule)}>
                  <span class="arch__dot" style={`--cat:${category?.color ?? 'transparent'}`} aria-hidden="true">
                    {category?.emoji ?? '•'}
                  </span>
                  <span class="fixed__text">
                    <span class="fixed__name">
                      {line.rule.note ?? category?.name ?? t('row.categoryRemoved')}
                    </span>
                    {/* Il perche' non pesa **e** cosa fa: "spenta" da sola
                        avrebbe tolto la cadenza e l'importo proprio alla riga
                        che si sta per riaccendere, cioe' i due numeri che
                        servono a decidere. */}
                    <span class="fixed__note">
                      {line.aside === null
                        ? fixedLineNote(line.rule)
                        : `${line.aside} · ${fixedLineNote(line.rule)}`}
                    </span>
                  </span>
                  {/* Il costo mensile normalizzato. Su una regola che non e'
                      ancora cominciata (o e' finita, o e' spenta) non c'e' un
                      numero da mettere: `null` non e' zero, e "0,00 €" accanto
                      a "Affitto" sarebbe un numero sbagliato con l'aria di
                      essere giusto. La cella resta, vuota, perche' la colonna
                      non si sfaldi. */}
                  <span class="fixed__amount">
                    {line.monthlyCents === null ? '' : money(line.monthlyCents)}
                  </span>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d="m10 6 6 6-6 6" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" class="prefs__action" disabled={!ready} onClick={onNew}>
        {t('fixed.add')}
      </button>
    </section>
  )
}
