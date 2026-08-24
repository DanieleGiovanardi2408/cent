import { useEffect, useRef, useState } from 'preact/hooks'
import { MAX_ACTIVE_CATEGORIES } from '../core/categories'
import type { CategoryDeletion } from '../core/categories'
import { DEFAULT_CATEGORY_SEEDS } from '../core/defaults'
import type { Category } from '../core/types'
import { t } from './i18n'
import type { Key } from './i18n'
import './sheet.css'
import './AddSheet.css'
import './Categories.css'

/**
 * L'editor di una categoria: crearla, cambiarla, spostarla, archiviarla,
 * cancellarla — e **lo scambio**, che e' il percorso principale e non un
 * vicolo d'errore.
 *
 * ## Perche' lo scambio e' il caso normale
 *
 * Le otto di default riempiono esattamente il tetto. Quindi la primissima cosa
 * che fara' chi vuole una categoria sua non e' un'aggiunta: e' una
 * **sostituzione** — ed e' il primo momento in cui l'app chiede qualcosa invece
 * di dare. Se lo scambio fosse un messaggio d'errore raggiunto dopo che
 * l'aggiunta e' fallita, il tetto si leggerebbe come un dispetto.
 *
 * Qui la domanda *"quale sostituisce?"* e' **parte del foglio**, con le otto
 * attuali mostrate e toccabili, e il tap sulla categoria che esce **e' il
 * salvataggio**: la stessa grammatica del chip che salva la spesa (ADR 004),
 * nella stessa griglia 4x2, con gli stessi chip. Non c'e' nessun bottone
 * "Conferma" da cercare dopo.
 *
 * Il piano vero si fa comunque sul disco (`planCategoryPlacement` dentro la
 * transazione, ADR 008/012): questa schermata non decide niente, chiede.
 *
 * ## Non esiste "ripristina dall'archivio"
 *
 * `CategoryPatch` non ha `archived`, quindi riportare in griglia una categoria
 * archiviata **non compila** come operazione a se': se esistesse, farebbe la
 * nona (ADR 012). Dall'elenco delle archiviate il gesto e' percio' lo stesso
 * dell'aggiunta — si tocca una categoria e l'app chiede quale sostituisce — e
 * in questo foglio la modalita' `place` e' identica alla `new` meno il modulo
 * del nome. **Nessun bottone "Ripristina" da nessuna parte.**
 *
 * ## Cosa scorre e cosa no
 *
 * Il corpo scorre, il piede no. Nel foglio dell'inserimento lo scroll e'
 * vietato perche' e' il percorso dei due tap; qui non lo e', e con la tastiera
 * di sistema aperta sopra un modulo di testo la scelta e' fra uno scroll e un
 * contenuto tagliato. **Cio' che conferma sta sempre nel piede**, fuori dallo
 * scroll: la griglia dello scambio o il bottone, mai sotto la linea di
 * galleggiamento.
 */

/**
 * La tavolozza: **gli stessi otto colori delle categorie di default**, letti da
 * `defaults.ts` invece di essere riscritti qui.
 *
 * I colori sono un sistema, non otto scelte separate (CLAUDE.md, "Colori delle
 * categorie"): ricavati su OKLCH massimizzando il ΔE00 minimo fra tutte le 28
 * coppie, verificati anche in simulazione di deuteranopia, protanopia e
 * tritanopia, e **dalla fase 6 sono la palette dei grafici**.
 *
 * Per questo qui non c'e' un selettore libero: due tinte scelte a mano a
 * distanza di un mese producono due aree indistinguibili in un grafico ad
 * anello, e il difetto si vedrebbe tre fasi dopo, in una schermata che non ha
 * fatto niente di male. Otto pastiglie sono anche piu' veloci di una ruota.
 */
const PALETTE: readonly string[] = DEFAULT_CATEGORY_SEEDS.map((seed) => seed.color)

/**
 * Il nome parlato di ogni colore, per chi non lo vede.
 *
 * Indicizzato sull'esadecimale e non sulla posizione: se un giorno l'ordine dei
 * default cambiasse, un elenco parallelo direbbe "Verde" indicando il blu senza
 * che niente si accorga. Una tinta che non fosse in tavolozza — un dato
 * arrivato da un import — resta senza nome proprio e si annuncia come "Colore":
 * una bugia sarebbe peggio.
 */
const COLOR_NAMES: Readonly<Record<string, Key>> = {
  '#81a369': 'color.green',
  '#f26b00': 'color.orange',
  '#06b0a0': 'color.teal',
  '#845e23': 'color.brown',
  '#3f5db6': 'color.blue',
  '#b90e5c': 'color.magenta',
  '#bc85ec': 'color.lilac',
  '#676c75': 'color.grey',
}

/**
 * Le emoji fra cui scegliere. Diciotto, e le prime otto sono quelle dei
 * default: chi modifica una categoria di partenza non si trova la propria fuori
 * elenco, cioe' non si trova una riga in piu' comparsa dal nulla.
 *
 * Non c'e' un campo libero, e non e' una privazione: l'unico modo di scrivere
 * un'emoji qualunque e' la tastiera di sistema, che su iOS apre un pannello
 * alto mezzo schermo per cercare un glifo in una griglia di millecinquecento.
 * Diciotto pastiglie sono un tap.
 */
const EMOJI: readonly string[] = [
  '🛒', '🍽️', '🌿', '🚬', '🚇', '🎬', '🏠', '🔖',
  '☕', '🍺', '🚲', '✈️', '💡', '👕', '🎧', '💊', '🎁', '📚',
]

/** Il massimo che ci sta nel chip senza diventare tre puntini. */
const MAX_NAME = 18

export interface CategoryDraft {
  readonly name: string
  readonly emoji: string
  readonly color: string
}

export type CategoryMode = 'new' | 'edit' | 'place'

interface Props {
  readonly mode: CategoryMode
  /** La categoria toccata. `null` solo in `new`. */
  readonly target: Category | null
  /** Le otto in griglia, nell'ordine vero: servono allo scambio e alla posizione. */
  readonly active: readonly Category[]
  /**
   * L'esito di `planCategoryDeletion` sul mirror, calcolato **prima** di
   * mostrare il bottone: cosi' il rifiuto porta le parole ("3 spese la usano")
   * invece di un errore dopo il tap. `null` quando non c'e' un bersaglio.
   */
  readonly deletion: CategoryDeletion | null
  readonly leaving: boolean
  /**
   * Mette una categoria in griglia: la nuova (`draft`) o quella dall'archivio
   * (`draft === null`). `replacing` e' l'id di quella che esce.
   *
   * **Asincrona e non ottimistica**, come il repository: il tetto si conta
   * sulle categorie che stanno sul disco, quindi non esiste nessun istante in
   * cui la UI mostra nove chip. Il feedback entro 100 ms non e' uno spinner: e'
   * il chip che si accende sotto il dito e il foglio che smette di accettare
   * altri tap.
   */
  readonly onPlace: (draft: CategoryDraft | null, replacing?: string) => Promise<boolean>
  /** Nome, emoji, colore. Sincrona e ottimistica: e' una scrittura locale. */
  readonly onSave: (draft: CategoryDraft) => boolean
  readonly onArchive: () => void
  readonly onDelete: () => void
  /** Sposta di una cella. Immediata: la griglia qui sopra si ridisegna subito. */
  readonly onMove: (delta: number) => void
  readonly onClose: () => void
}

export function CategorySheet({
  mode,
  target,
  active,
  deletion,
  leaving,
  onPlace,
  onSave,
  onArchive,
  onDelete,
  onMove,
  onClose,
}: Props) {
  const [name, setName] = useState(target?.name ?? '')
  const [emoji, setEmoji] = useState(target?.emoji ?? EMOJI[0] ?? '🔖')
  const [color, setColor] = useState(target?.color ?? PALETTE[0] ?? '#676c75')
  const [failed, setFailed] = useState(false)
  /** Una scrittura sul disco e' partita: nessun secondo tap la accompagna. */
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialog.current?.focus({ preventScroll: true })
  }, [])

  // Nessun focus automatico sul campo del nome: aprirebbe la tastiera di
  // sistema nello stesso istante del foglio, cioe' meta' schermo che si alza
  // sopra la griglia dello scambio prima ancora che si sia letta la domanda.
  // Si tocca il campo quando si vuole scrivere.

  const trimmed = name.trim()
  const editing = mode === 'edit'
  const free = MAX_ACTIVE_CATEGORIES - active.length
  /** La griglia e' piena: bisogna dire chi esce. E' il caso normale. */
  const swapping = !editing && free <= 0
  const named = editing || mode === 'place' || trimmed !== ''
  const draft: CategoryDraft = { name: trimmed, emoji, color }
  const emojis = EMOJI.includes(emoji) ? EMOJI : [emoji, ...EMOJI]

  const index = target === null ? -1 : active.findIndex((c) => c.id === target.id)

  async function place(replacing?: string): Promise<void> {
    if (busy || !named) return
    setBusy(true)
    setFailed(false)
    const done = await onPlace(mode === 'new' ? draft : null, replacing)
    if (done) return // Il foglio sta gia' uscendo: non si tocca piu' niente.
    setBusy(false)
    setFailed(true)
  }

  /**
   * La riga parla solo quando ha una notizia, e l'altezza e' riservata in
   * `sheet.css`: una stringa vuota qui non deve muovere niente.
   */
  const hint = failed
    ? t('cat.hint.failed')
    : !named
      ? t('cat.hint.name')
      : swapping
        ? t('cat.hint.replace')
        : ''

  return (
    <>
      <div class="scrim" data-leaving={leaving || undefined} onClick={onClose} />

      <div
        class="sheet sheet--cat"
        data-leaving={leaving || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={t(
          mode === 'new' ? 'cat.new.label' : mode === 'edit' ? 'cat.edit.label' : 'cat.place.label',
        )}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
      >
        {/* Niente `aria-live`: stessa decisione di `AddSheet` e `BudgetSheet`,
            e vale qui perche' la sua ragione non nominava nessuno dei tre —
            **e' un'istruzione, non un valore**. Qui non c'e' una seconda region
            live con cui accodarsi, e non cambia niente: annunciare a ogni
            lettera del nome sarebbe rumore anche da sola. */}
        <p class="sheet__hint" data-tone={failed ? 'error' : undefined}>{hint}</p>

        <div class="editor">
          {mode === 'place' ? (
            /* Dall'archivio non si modifica: si rimette in griglia e basta.
               Una volta li', toccarla apre questo stesso foglio in modifica. */
            <p class="editor__lead">
              <span class="editor__chip" style={`--cat:${color}`} aria-hidden="true">
                {emoji}
              </span>
              {target?.name}
            </p>
          ) : (
            <>
              {/* 17px: sotto i 16 Safari zooma la pagina all'apertura della
                  tastiera e non la riporta piu' indietro. */}
              <input
                class="editor__name"
                type="text"
                value={name}
                maxLength={MAX_NAME}
                enterKeyHint="done"
                aria-label={t('cat.name')}
                placeholder={t('cat.name.placeholder')}
                onInput={(event) => setName(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
              />

              <div class="picker" role="group" aria-label={t('cat.emoji')}>
                {emojis.map((one) => (
                  <button
                    key={one}
                    type="button"
                    class="picker__key"
                    aria-pressed={one === emoji}
                    onClick={() => setEmoji(one)}
                  >
                    {one}
                  </button>
                ))}
              </div>

              <div class="picker picker--color" role="group" aria-label={t('cat.color')}>
                {PALETTE.map((one) => {
                  const spoken = COLOR_NAMES[one]
                  return (
                    <button
                      key={one}
                      type="button"
                      class="picker__key picker__key--color"
                      style={`--cat:${one}`}
                      aria-pressed={one === color}
                      aria-label={t(spoken ?? 'cat.color')}
                      onClick={() => setColor(one)}
                    >
                      {/* La spunta, non il solo colore: il selezionato deve
                          vedersi anche a chi il colore non lo distingue. */}
                      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                        <path d="m5 12.5 5 5 9-11" />
                      </svg>
                    </button>
                  )
                })}
              </div>
              <p class="editor__note">{t('cat.color.note')}</p>
            </>
          )}

          {editing && index >= 0 ? (
            <>
              {/* L'anteprima e' la griglia vera, con dentro la categoria come
                  sara': e' il solo modo di vedere l'effetto di uno spostamento,
                  visto che la griglia di Impostazioni sta dietro al velo.

                  La didascalia non e' decorazione: qui la griglia **non si
                  tocca**, e nel foglio dello scambio una griglia identica e' il
                  bersaglio che salva. Due significati per la stessa forma vanno
                  detti, non lasciati indovinare. Per chi legge con VoiceOver
                  l'informazione e' gia' nella riga della posizione, quindi la
                  griglia e' `aria-hidden` invece di essere letta due volte. */}
              <p class="swap__text">{t('cat.preview')}</p>
              <div class="cats cats--preview" aria-hidden="true">
                {active.map((one) => {
                  const self = one.id === target?.id
                  return (
                    <div
                      key={one.id}
                      class="cat"
                      style={`--cat:${self ? color : one.color}`}
                      data-self={self || undefined}
                    >
                      <span class="cat__emoji">{self ? emoji : one.emoji}</span>
                      <span class="cat__name">
                        {self ? (trimmed === '' ? one.name : trimmed) : one.name}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div class="move">
                <button
                  type="button"
                  class="move__key"
                  aria-label={t('cat.move.back')}
                  disabled={index === 0}
                  onClick={() => onMove(-1)}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M14 6 8 12l6 6" />
                  </svg>
                </button>
                <span class="move__label">
                  {t('cat.position', { index: index + 1, total: active.length })}
                </span>
                <button
                  type="button"
                  class="move__key"
                  aria-label={t('cat.move.on')}
                  disabled={index === active.length - 1}
                  onClick={() => onMove(1)}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="m10 6 6 6-6 6" />
                  </svg>
                </button>
              </div>
              {/* Non impedirlo, dirlo: dopo che la memoria muscolare si e'
                  formata, cambiare l'ordine costa piu' di quanto sembri. Nel
                  core non c'e' niente che lo dica, ed e' giusto cosi'. */}
              <p class="editor__note">{t('cat.order.note')}</p>
            </>
          ) : null}

          {target === null ? null : (
            <div class="danger">
              {deletion?.ok === true ? (
                <>
                  <button
                    type="button"
                    class="danger__action"
                    disabled={busy}
                    onClick={onDelete}
                  >
                    {t('cat.delete')}
                  </button>
                  <p class="editor__note">{t('cat.delete.note')}</p>
                </>
              ) : deletion !== null && deletion.reason === 'in-use' ? (
                /* Il rifiuto arriva **prima** del bottone, con i numeri veri
                   dentro: `planCategoryDeletion` e' pura, e chiederglielo
                   prima e' cio' che trasforma un errore in una frase utile. */
                <p class="editor__note">
                  {t('cat.inUse.text', {
                    what: usageLabel(
                      deletion.expenses,
                      deletion.recurringRules,
                      deletion.budgets,
                    ),
                  })}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* --- il piede: cio' che rende vero quello che c'e' sopra ---------- */}
        <div class="editor__foot">
          {swapping ? (
            <>
              <p class="swap__title">{t('cat.swap.title')}</p>
              {/* Detto qui, nell'istante in cui si sceglie chi esce: archiviare
                  non e' cancellare. E' l'unico posto in cui la frase arriva
                  quando serve invece che quando si legge una schermata. */}
              <p class="swap__text">{t('cat.swap.text')}</p>
              <div class="cats">
                {active.map((one) => (
                  <button
                    key={one.id}
                    type="button"
                    class="cat"
                    style={`--cat:${one.color}`}
                    disabled={!named || busy}
                    onClick={() => void place(one.id)}
                  >
                    <span class="cat__emoji" aria-hidden="true">
                      {one.emoji}
                    </span>
                    <span class="cat__name">{one.name}</span>
                  </button>
                ))}
              </div>
            </>
          ) : editing ? (
            <div class="editor__row">
              <button type="button" class="editor__second" disabled={busy} onClick={onArchive}>
                {t('cat.archive')}
              </button>
              <button
                type="button"
                class="editor__primary"
                disabled={busy || trimmed === ''}
                onClick={() => {
                  if (!onSave(draft)) setFailed(true)
                }}
              >
                {t('cat.save')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              class="editor__primary"
              disabled={!named || busy}
              onClick={() => void place()}
            >
              {t(mode === 'new' ? 'cat.add.free' : 'cat.place.free')}
            </button>
          )}

          {editing ? <p class="editor__note editor__note--foot">{t('cat.archive.note')}</p> : null}
        </div>
      </div>
    </>
  )
}

/**
 * "3 spese, 1 spesa ricorrente e 2 budget": i numeri veri, non "qualcosa la usa".
 *
 * Tre tipi di record possono nominare una categoria, e il terzo — i budget di
 * categoria, storici compresi — e' entrato quando `planCategoryDeletion` ha
 * smesso di dimenticarlo. Non e' raggiungibile dalla UI di oggi (il foglio del
 * budget non scrive `categoryId`) e lo diventa con l'import: un file con un
 * budget di categoria, la categoria cancellata, e resta un record che punta a
 * un id inesistente che nessuna schermata puo' ne' mostrare ne' togliere.
 *
 * La frase si compone da una **lista**, non da rami annidati: con tre voci
 * facoltative i casi sono sette, e sette rami scritti a mano sono sette
 * occasioni di dimenticare una congiunzione in una lingua sola. La lista tiene
 * solo cio' che c'e' davvero — un "0 budget" sarebbe un numero in piu' da
 * leggere per dire che non conta.
 */
function usageLabel(expenses: number, rules: number, budgets: number): string {
  const parts = [
    counted(expenses, 'cat.inUse.expenses.one', 'cat.inUse.expenses.other'),
    counted(rules, 'cat.inUse.rules.one', 'cat.inUse.rules.other'),
    counted(budgets, 'cat.inUse.budgets.one', 'cat.inUse.budgets.other'),
  ].filter((part) => part !== '')

  // Destrutturato e non indicizzato: con `noUncheckedIndexedAccess` ogni
  // `parts[0]` sarebbe un `string | undefined` da smentire con un `!`, e i
  // quattro casi qui sotto sono gia' l'elenco completo.
  const [a, b, c] = parts
  if (a === undefined) return ''
  if (b === undefined) return a
  if (c === undefined) return t('cat.inUse.both', { a, b })
  return t('cat.inUse.three', { a, b, c })
}

/** Il nome di una quantita', o stringa vuota se quella quantita' e' zero. */
function counted(count: number, one: Key, other: Key): string {
  if (count === 0) return ''
  return count === 1 ? t(one) : t(other, { count })
}
