import { useEffect, useRef, useState } from 'preact/hooks'
import type { Category } from '../core/types'
import { money, moneyParts, t } from './i18n'
import { reducedMotion } from './motion'
import './sheet.css'
import './Guide.css'

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

/**
 * I tre stati dell'importo, in centesimi: `5 -> 0,05`, `50 -> 0,50`,
 * `500 -> 5,00`. Sono i numeri della ROADMAP, e sono tre perche' due non
 * mostrerebbero il passaggio dell'unita' e quattro sarebbero un esercizio.
 *
 * Hanno una proprieta' che il resto di questo file usa: **tutti e tre producono
 * lo stesso numero di cifre** (tre) e la stessa sequenza di parti, in tutte e
 * due le lingue. E' cio' che rende le celle stabili, quindi l'ancora vera.
 */
const STEPS = [5, 50, 500] as const

/** Quanto resta a schermo ogni stato. Sotto il secondo non si legge. */
const STEP_MS = 1300

export function Guide({ categories, onDone }: Props) {
  const [card, setCard] = useState(0)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
  }, [])

  const last = card === 1

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
          <p class="guide__step">{t('guide.step', { index: card + 1 })}</p>

          {card === 0 ? <AmountArt /> : <SaveArt categories={categories} />}

          <h2 class="guide__title">{t(card === 0 ? 'guide.amount.title' : 'guide.save.title')}</h2>
          <p class="guide__text">{t(card === 0 ? 'guide.amount.text' : 'guide.save.text')}</p>

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
                else setCard(1)
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
 * Con `formatToParts` (`moneyParts` in i18n) l'invariante e' dichiarato invece
 * che sperato:
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

/** Le parti del locale, con `integer` e `fraction` spezzate cifra per cifra. */
function cellsOf(cents: number): readonly Cell[] {
  const out: Cell[] = []
  for (const part of moneyParts(cents)) {
    if (part.type === 'integer' || part.type === 'fraction') {
      for (const digit of part.value) out.push({ kind: 'digit', text: digit })
    } else if (part.type === 'decimal') {
      out.push({ kind: 'decimal', text: part.value })
    } else if (part.type === 'currency') {
      out.push({ kind: 'currency', text: part.value })
    } else {
      // `literal` (lo spazio non separabile fra numero e simbolo in italiano) e
      // qualunque parte che il locale aggiunga: sta ferma come il simbolo.
      out.push({ kind: 'gap', text: part.value })
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
