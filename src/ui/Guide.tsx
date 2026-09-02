import { useEffect, useRef, useState } from 'preact/hooks'
import type { Category } from '../core/types'
import { amountCells, money, t } from './i18n'
import { reducedMotion } from './motion'
import './sheet.css'
import './Guide.css'
import { CARDS, STEPS, STEP_MS } from './guide-steps'
import type { Card } from './guide-steps'
import { PIE_BOX, PIE_C, PIE_GAP, PIE_R, PIE_RING } from './Stats'

/**
 * La guida al primo avvio. **Due schede**, non tre.
 *
 * ## Non e' agganciata all'avvio, e' agganciata a uno stato
 *
 * ADR 009 vieta i comportamenti agganciati all'**evento** di avvio, perche' su
 * iOS quell'evento non e' affidabile: il tap sull'icona di una PWA ancora in
 * memoria non riesegue `load`, quindi un comportamento "al primo avvio"
 * comparirebbe solo agli avvii a freddo — cioe' a seconda di se iOS ha ucciso
 * l'app in background, che l'utente non puo' ne' vedere ne' prevedere.
 *
 * Questa guida non ha quel problema, ed e' il caso che la stessa ADR nomina
 * nella sezione "Cosa questa ADR NON vieta": si mostra finche'
 * `Settings.onboardingCompletedAt` **e' assente**. E' uno stato persistito,
 * quindi il comportamento e' **ripetibile e idempotente** — a ogni apertura, a
 * ogni ritorno in primo piano, finche' quello stato non cambia. Chi la chiude la
 * chiude per sempre; chi la vuole rivedere cancella quel campo da Impostazioni.
 *
 * ## Cosa c'e' dentro, e perche' solo due cose
 *
 * Le due convenzioni che **non esistono in nessun'altra app**, cioe' quelle che
 * nessuno indovina: l'importo che si riempie da destra e il chip di categoria
 * che *e'* il salvataggio. La terza scheda prevista ("i dati restano su questo
 * telefono") e' stata tagliata: e' un fatto rassicurante, non una cosa da
 * imparare per usare l'app, e la guida non e' il posto dove si legge la
 * privacy policy. Vive in Impostazioni, dove si va a cercarla.
 *
 * Nessun invito a installare l'app: fuori da standalone Cent **e'** la pagina di
 * installazione (ADR 011), quindi chi vede questa guida ha gia' installato.
 *
 * ## Non crea nessuna spesa finta
 *
 * Niente di quello che si vede qui passa dal repository. L'importo della
 * scheda 1 e' un numero in memoria formattato dal locale attivo; i chip della
 * scheda 2 sono **le categorie vere**, ma dipinti come illustrazione: non sono
 * bottoni, non hanno un `onClick`, e non portano da nessuna parte.
 */

interface Props {
  /** Le categorie in griglia: la scheda 2 mostra le prime quattro, vere. */
  readonly categories: readonly Category[]
  /**
   * La guida e' finita. Scrive `onboardingCompletedAt`, e lo fa **sia** da
   * "Inizia" **sia** da "Salta": vedi il commento sui due bottoni piu' sotto.
   */
  readonly onDone: () => void
}





export function Guide({ categories, onDone }: Props) {
  const [card, setCard] = useState(0)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
  }, [])

  // Tre schede da quando esiste il gesto sul grafico: l'ultima insegna che le
  // Statistiche si toccano. E' la strada che ha sostituito il comando a due
  // stati — *un'istruzione, non un valore*, quindi vive dove le istruzioni
  // scadono da sole invece che sopra un grafico per sempre.
  // **L'ordine e il numero delle schede vengono da `CARDS`**, non da un `2`
  // scritto qui: il denominatore del contatore e l'elenco della didascalia in
  // Impostazioni leggono la stessa lista, quindi una quarta scheda li aggiorna
  // tutti e tre da sola.
  const kind = CARDS[card] ?? CARDS[0]
  const last = card === CARDS.length - 1

  return (
    <>
      {/* Lo stesso velo dei fogli, e senza `onClick`: chiudere la guida scrive
          uno stato permanente, e un tocco a vuoto fuori dalla scheda non e' una
          decisione. Le due uscite sono dichiarate, e stanno nella scheda. */}
      <div class="scrim" />

      <div
        class="guide"
        role="dialog"
        aria-modal="true"
        aria-label={t('guide.label')}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          // Su un telefono non c'e' Escape; su una tastiera si', ed e' la stessa
          // cosa che fa "Salta" — compresa la scrittura dello stato. Se non
          // scrivesse, la guida tornerebbe alla riapertura e il tasto avrebbe
          // mentito.
          if (event.key === 'Escape') onDone()
        }}
      >
        <div class="guide__card">
          <p class="guide__step">
            {t('guide.step', { index: card + 1, total: CARDS.length })}
          </p>

          {art(kind, categories)}

          <h2 class="guide__title">{titolo(kind)}</h2>
          <p class="guide__text">{testo(kind)}</p>

          {/* Due bersagli, e sull'ultima scheda uno solo.
           *
           * "Salta" sparisce alla scheda 2 perche' li' avrebbe una sola forma
           * onesta — fare esattamente cio' che fa "Inizia" — e allora sarebbero
           * due bersagli identici con due parole diverse. L'alternativa, un
           * "Salta" che non scrive lo stato, sarebbe una parola che mente: la
           * guida tornerebbe alla prossima apertura.
           *
           * Per la stessa ragione "Salta" sulla scheda 1 **scrive**: chi lo
           * tocca sta dicendo "non me la mostrare piu'", non "non adesso". */}
          <div class="guide__acts">
            {last ? null : (
              <button type="button" class="guide__skip" onClick={onDone}>
                {t('guide.skip')}
              </button>
            )}
            <button
              type="button"
              class="guide__next"
              onClick={() => {
                if (last) onDone()
                else setCard((n) => n + 1)
              }}
            >
              {t(last ? 'guide.start' : 'guide.next')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------------- *
 * Scheda 1 — l'importo si riempie da destra.
 * ------------------------------------------------------------------------- */

/**
 * Due rami, e sono **due contenuti**, non lo stesso contenuto con e senza
 * movimento.
 *
 * Chi accetta il movimento vede l'importo riempirsi: e' la cosa che le parole
 * non riescono a dire, ed e' l'errore che ha morso due volte in sessanta
 * secondi chi il meccanismo l'aveva progettato. Chi ha chiesto meno movimento
 * vede **i tre casi in tabella**, tutti insieme: la stessa informazione in una
 * forma che si legge invece che guardarsi.
 *
 * Un'animazione ferma su un fotogramma avrebbe mostrato un esempio su tre.
 */
function AmountArt() {
  return reducedMotion() ? <AmountTable /> : <AmountTicker />
}

/**
 * L'importo che si riempie, un tasto alla volta.
 *
 * `aria-hidden`: e' un'illustrazione che cambia da sola, e una regione che
 * cambia da sola o non viene annunciata (inutile) o viene annunciata tre volte
 * al secondo (peggio). Cio' che dice sta nel sottotitolo della scheda, in
 * parole: *"Per 23 € digita 2 3 0 0."*
 */
function AmountTicker() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStep((current) => (current + 1) % STEPS.length)
    }, STEP_MS)
    return () => clearInterval(timer)
  }, [])

  return (
    <div class="demo demo--live" aria-hidden="true">
      <Keys step={step} />
      <span class="demo__arrow">→</span>
      <Amount cents={STEPS[step] ?? 0} tick={step} />
    </div>
  )
}

/**
 * Il ramo `prefers-reduced-motion`: i tre casi, in tabella.
 *
 * **Gli importi passano dal formatter**, mai da stringhe scritte a mano. Non e'
 * pignoleria: `5 -> 0,05` cablato mostrerebbe la virgola italiana a chi legge in
 * inglese, dove lo stesso importo si scrive `€0.05` — e sarebbe l'unico punto
 * dell'app in cui il numero non parla la lingua di chi guarda, proprio nella
 * scheda che insegna a leggerlo.
 */
function AmountTable() {
  return (
    <div class="demo demo--still" aria-hidden="true">
      {STEPS.map((cents) => (
        <p class="demo__line" key={cents}>
          <span class="demo__typed">
            {[...String(cents)].map((digit, index) => (
              <span class="demo__key" key={index}>
                {digit}
              </span>
            ))}
          </span>
          <span class="demo__arrow">→</span>
          <span class="demo__amount">{money(cents)}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * I tasti battuti finora.
 *
 * Gli slot mostrano i primi `n` caratteri dell'ultimo stato, e funziona perche'
 * i tre stati sono **uno il prefisso dell'altro** (`5`, `50`, `500`): e' la
 * stessa cosa che succede sul tastierino vero, dove una cifra si aggiunge a
 * destra e non sostituisce niente.
 *
 * **Tre slot sempre**, anche quando se ne e' battuto uno: gli slot vuoti restano nel flusso (`visibility`), cosi' la riga non
 * cambia larghezza fra uno stato e l'altro e non trascina con se' la freccia e
 * l'importo. E' la stessa regola del guscio che non si sposta quando arrivano i
 * dati, applicata a un'illustrazione che si muove da sola.
 */
function Keys({ step }: { readonly step: number }) {
  const typed = String(STEPS[STEPS.length - 1] ?? 0)
  const shown = String(STEPS[step] ?? 0).length
  return (
    <p class="demo__typed">
      {[...typed].map((digit, index) => (
        <span class="demo__key" key={index} data-off={index >= shown || undefined}>
          {digit}
        </span>
      ))}
    </p>
  )
}

/**
 * L'importo in celle, **una per parte del formato**.
 *
 * ## L'invariante, e perche' non poteva stare sulla stringa
 *
 * `it-IT` scrive `0,05 €` e `en-GB` scrive `€0.05`: **il simbolo cambia lato**,
 * e l'inglese e' la lingua di default di quest'app. Un'animazione scritta sui
 * glifi della stringa formattata avrebbe fatto scorrere le cifre sotto il
 * simbolo dell'euro in una delle due lingue — e sarebbe stato invisibile finche'
 * qualcuno non avesse aperto la guida in inglese.
 *
 * Con `formatToParts` (`amountCells` in i18n, che e' anche cio' che il foglio
 * d'inserimento usa per rimpicciolire i centesimi) l'invariante e' dichiarato
 * invece che sperato:
 *
 * - la cella `decimal` e' **l'ancora**: sta ferma, ed e' rispetto a lei che le
 *   cifre entrano da destra;
 * - la cella `currency` (e lo spazio non separabile che in italiano la precede)
 *   e' **fissa**: nessuna cifra ci passa mai sopra, in nessuna lingua;
 * - le cifre si muovono **solo** dentro `integer` e `fraction`.
 *
 * Le tre cifre e la sequenza delle parti sono le stesse per tutti e tre gli
 * stati — `minimumFractionDigits: 2` e un intero sempre presente lo
 * garantiscono — quindi le celle non nascono e non muoiono: cambia solo il
 * glifo che contengono. Nessuna cella che compare, nessuna larghezza che varia,
 * nessuno spostamento di layout.
 */
function Amount({ cents, tick }: { readonly cents: number; readonly tick: number }) {
  return (
    <p class="demo__amount">
      {cellsOf(cents).map((cell, index) => (
        <span class="demo__cell" data-kind={cell.kind} key={index}>
          {cell.kind === 'digit' ? (
            // La chiave porta dentro il passo: cambiandola la cifra viene
            // rimontata, e l'animazione d'entrata riparte. E' l'unico modo di
            // rigiocare un'animazione CSS senza toccare lo stile da JavaScript.
            <span class="demo__glyph" key={`${tick}-${index}`}>
              {cell.text}
            </span>
          ) : (
            cell.text
          )}
        </span>
      ))}
    </p>
  )
}

interface Cell {
  readonly kind: 'digit' | 'decimal' | 'currency' | 'gap'
  readonly text: string
}

/**
 * Le celle di `amountCells` (i18n), con `integer` e `fraction` spezzate cifra
 * per cifra: qui ogni cifra ha una sua animazione d'entrata, quindi ha bisogno
 * di un suo elemento.
 *
 * La classificazione **non e' qui**, ed e' la meta' che conta: quali parti sono
 * cifre e quali stanno ferme lo decide un posto solo, lo stesso che serve al
 * foglio d'inserimento. Erano due catene di `if` identiche, e la differenza fra
 * le due si sarebbe vista solo in inglese, dove il simbolo cambia lato.
 */
function cellsOf(cents: number): readonly Cell[] {
  const out: Cell[] = []
  for (const cell of amountCells(cents)) {
    if (cell.kind === 'integer' || cell.kind === 'fraction') {
      for (const digit of cell.text) out.push({ kind: 'digit', text: digit })
    } else {
      // `decimal`, `currency` e `gap` (lo spazio non separabile fra numero e
      // simbolo in italiano, il separatore delle migliaia): stanno ferme.
      out.push({ kind: cell.kind, text: cell.text })
    }
  }
  return out
}

/* ------------------------------------------------------------------------- *
 * Scheda 2 — il chip della categoria e' il salvataggio.
 * ------------------------------------------------------------------------- */

/**
 * Quattro chip veri e il toast che segue il tap.
 *
 * Le categorie sono **quelle dell'utente**, non un disegno: cosi' la scheda
 * mostra la griglia che vedra' fra tre secondi, con le sue parole. Ma non sono
 * `.cat`: sono `span` con una classe loro, e non e' un dettaglio di stile —
 * `.cat` in questo repo significa una cosa sola, "il chip che salva", ed e' il
 * selettore con cui `install.spec.ts` conta che fuori da standalone i bersagli
 * che scrivono siano zero. Un'illustrazione che risponde a quel selettore
 * renderebbe piu' debole quel conteggio senza che si veda.
 */
/**
 * **Il grafico che si tocca**, ed e' la sola strada che insegna quel gesto.
 *
 * Il comando a due stati `Quote / Ordine` e' stato tolto: sullo schermo delle
 * Statistiche non resta nessun controllo, si tocca la ciambella. Un gesto senza
 * annuncio pero' e' un gesto che si scopre per caso — il grafico a torta era
 * stato chiesto due volte prima che ne esistesse uno, cioe' una funzione che non
 * si vede viene chiesta come se non ci fosse.
 *
 * A dirlo e' la guida e non una riga sotto il grafico, e la ragione e' la solita
 * di questo progetto: **e' un'istruzione, non un valore**, quindi vive dove le
 * istruzioni scadono da sole invece che sopra un grafico per sempre.
 *
 * ## Il finto usa la forma e i colori del vero
 *
 * Stessa regola applicata a `.mock__emoji`: *un ritratto che smette di
 * somigliare al soggetto e' un difetto anche quando i suoi numeri tornano.* La
 * ciambella qui non e' un disegno a parte — usa `PIE_BOX`, `PIE_RING`, `PIE_GAP`
 * e la stessa costruzione a `stroke-dasharray` importate da `Stats.tsx`, e i
 * colori sono quelli delle categorie vere. Le barre usano `.stat__bar`, la
 * stessa classe delle righe.
 *
 * Se un giorno la ciambella cambiasse geometria, questa cambierebbe con lei
 * invece di restare il ritratto di una schermata che non esiste piu'.
 */
function ChartArt({ categories }: { readonly categories: readonly Category[] }) {
  // Quattro quote fisse: e' un'illustrazione, non una misura, e i numeri non
  // devono somigliare a quelli di nessuno. Sommano a 1.
  const quote = [0.4, 0.28, 0.19, 0.13]
  const categorie = categories.slice(0, quote.length)
  const tinte = categorie.map((c) => c.color)

  const [barre, setBarre] = useState(false)
  useEffect(() => {
    if (reducedMotion()) return undefined
    const timer = window.setInterval(() => setBarre((v) => !v), STEP_MS)
    return () => clearInterval(timer)
  }, [])

  let cumulata = 0
  const fette = quote.map((q, i) => {
    const start = cumulata * PIE_C
    cumulata += q
    return {
      key: i,
      fill: tinte[i] ?? 'var(--brand)',
      len: Math.max(0, q * PIE_C - PIE_GAP),
      start: start + PIE_GAP / 2,
    }
  })

  return (
    // `aria-hidden` come le altre due illustrazioni: cambia da sola, e cio' che
    // dice sta nel sottotitolo della scheda in parole.
    <div class="demo demo--chart" aria-hidden="true">
      {barre ? (
        <ul class="mock__rows">
          {quote.map((q, i) => (
            <li class="mock__row" key={i}>
              {/* **Il nome, e prima non c'era.** Lo stato "barre" mostrava
                  quattro importi incolonnati senza barre e senza nomi, mentre la
                  schermata vera ha tre colonne: nome, barra colorata, importo.
                  Insegnava un gesto e ne faceva vedere il risultato sbagliato —
                  ed e' la prima cosa che vede un amico su un'installazione
                  pulita.

                  Stessa regola gia' applicata a `.mock__emoji` e alla ciambella
                  qui accanto: **il finto deve somigliare al vero**. I nomi sono
                  quelli delle categorie vere, come i colori. */}
              <span class="mock__cat-name">{categorie[i]?.name ?? ''}</span>
              <span class="mock__track">
                <span
                  class="stat__bar"
                  style={{ inlineSize: `${Math.round(q * 100)}%`, backgroundColor: tinte[i] ?? 'var(--brand)' }}
                />
              </span>
              <span class="mock__amount">{money(Math.round(q * 12000))}</span>
            </li>
          ))}
        </ul>
      ) : (
        <svg
          class="mock__pie"
          viewBox={`0 0 ${PIE_BOX} ${PIE_BOX}`}
          width={PIE_BOX}
          height={PIE_BOX}
        >
          <g transform={`rotate(-90 ${PIE_BOX / 2} ${PIE_BOX / 2})`}>
            {fette.map((f) => (
              <circle
                key={f.key}
                cx={PIE_BOX / 2}
                cy={PIE_BOX / 2}
                r={PIE_R}
                fill="none"
                stroke={f.fill}
                stroke-width={PIE_RING}
                stroke-dasharray={`${f.len} ${PIE_C - f.len}`}
                stroke-dashoffset={-f.start}
              />
            ))}
          </g>
        </svg>
      )}
      {/* Il dito che tocca: e' l'unica cosa disegnata che non esiste nella
          schermata vera, e ci deve essere — senza, l'illustrazione mostra due
          figure che si alternano da sole invece di un gesto che le scambia. */}
      <span class="mock__tap" data-on={barre ? undefined : ''} />
    </div>
  )
}

function SaveArt({ categories }: { readonly categories: readonly Category[] }) {
  return (
    <div class="demo demo--save" aria-hidden="true">
      <div class="mock__cats">
        {categories.slice(0, 4).map((category, index) => (
          <span
            class="mock__cat"
            key={category.id}
            style={`--cat:${category.color}`}
            data-on={index === 1 || undefined}
          >
            <span class="mock__emoji">{category.emoji}</span>
            <span class="mock__name">{category.name}</span>
          </span>
        ))}
      </div>
      {/* Il toast che compare subito dopo, con dentro la rete: e' la stessa
          forma e le stesse parole di quello vero, cosi' quando arrivera' non
          sara' una novita' da leggere di corsa. */}
      <span class="mock__toast">
        <span class="mock__amount">{money(1250)}</span>
        <span class="mock__undo">{t('toast.undo')}</span>
      </span>
    </div>
  )
}

/**
 * **Le tre cose che una scheda porta — illustrazione, titolo, testo — scelte con
 * uno `switch` esaustivo invece che con una catena di ternari.**
 *
 * Una catena finisce con un `else`: una quarta scheda ci cadrebbe dentro e
 * prenderebbe **l'illustrazione e i testi della terza**, in silenzio. Col ramo
 * `never` non compila finche' non ha i suoi.
 *
 * E' la stessa forma di `soggetto()` in `Settings.tsx`, e insieme chiudono il
 * cerchio: da `CARDS` derivano l'ordine di disegno, il denominatore del
 * contatore e l'elenco della didascalia, e **niente di una scheda puo' restare
 * indietro** — perche' non si puo' aggiungerne una a meta'.
 *
 * Le chiavi si scrivono per intero: una costruita a pezzi spegne il controllo B
 * di `dead-surface.mjs` per tutto il progetto.
 */
function art(kind: Card, categories: readonly Category[]) {
  switch (kind) {
    case 'amount':
      return <AmountArt />
    case 'save':
      return <SaveArt categories={categories} />
    case 'chart':
      return <ChartArt categories={categories} />
    default: {
      const mai: never = kind
      return mai
    }
  }
}

function titolo(kind: Card): string {
  switch (kind) {
    case 'amount':
      return t('guide.amount.title')
    case 'save':
      return t('guide.save.title')
    case 'chart':
      return t('guide.chart.title')
    default: {
      const mai: never = kind
      return mai
    }
  }
}

function testo(kind: Card): string {
  switch (kind) {
    case 'amount':
      return t('guide.amount.text')
    case 'save':
      return t('guide.save.text')
    case 'chart':
      return t('guide.chart.text')
    default: {
      const mai: never = kind
      return mai
    }
  }
}
