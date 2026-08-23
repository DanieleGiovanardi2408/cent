import type { Category } from '../core/types'
import { t } from './i18n'
// La griglia e i chip sono **gli stessi** dell'inserimento: `.cats` e `.cat`
// vivono in AddSheet.css. L'import e' dichiarativo (il CSS finisce nel bundle
// una volta sola) e serve a dire che questa dipendenza esiste: chi cambia il
// chip li' cambia anche questa schermata, ed e' voluto — cio' che si modifica
// deve avere la faccia esatta di cio' che poi si tocca in cassa.
import './AddSheet.css'
import './Categories.css'

/**
 * La sezione "Categorie" di Impostazioni.
 *
 * Tre blocchi, in ordine di quanto capitano: la **griglia** com'e' davvero
 * (toccarne una la modifica), il bottone per **aggiungerne** una, e l'elenco
 * delle **archiviate** — che compare solo quando ce n'e' almeno una.
 *
 * ## La griglia e' la griglia, non un elenco
 *
 * Otto chip 4x2, identici a quelli del foglio d'inserimento. Un elenco in
 * colonna sarebbe stato piu' comodo da costruire e avrebbe mentito su due cose
 * che contano: quanto e' lungo un nome dentro il chip vero, e **dove sta** la
 * categoria che si sta per spostare. Qui la posizione e' meta' dell'oggetto.
 *
 * ## Perche' l'archivio non ha un bottone "Ripristina"
 *
 * Perche' non puo' averlo: riportare in griglia una categoria archiviata
 * farebbe la nona, e nel modello non esiste come operazione a se' (ADR 012).
 * Toccare una archiviata apre lo stesso foglio dell'aggiunta, che chiede quale
 * sostituisce.
 */
interface Props {
  /** Le otto in griglia, nell'ordine vero. */
  readonly active: readonly Category[]
  /** Tutte le altre. L'archivio non ha tetto. */
  readonly archived: readonly Category[]
  /** Il database e' aperto: prima non c'e' niente da scrivere. */
  readonly ready: boolean
  readonly onEdit: (category: Category) => void
  readonly onPlace: (category: Category) => void
  readonly onNew: () => void
}

export function Categories({ active, archived, ready, onEdit, onPlace, onNew }: Props) {
  return (
    <section class="prefs__group" aria-labelledby="prefs-cats">
      <h2 class="prefs__title" id="prefs-cats">
        {t('settings.cats.title')}
      </h2>
      <p class="prefs__text">{t('settings.cats.text')}</p>

      <div class="cats cats--edit" role="group" aria-label={t('settings.cats.grid')}>
        {active.map((category) => (
          <button
            key={category.id}
            type="button"
            class="cat"
            style={`--cat:${category.color}`}
            // Il nome accessibile dice il verbo: il chip qui non salva una
            // spesa, la apre in modifica, e i due gesti si somigliano troppo
            // per lasciare che sia la schermata a spiegarlo.
            aria-label={t('settings.cats.editOne', { name: category.name })}
            disabled={!ready}
            onClick={() => onEdit(category)}
          >
            <span class="cat__emoji" aria-hidden="true">
              {category.emoji}
            </span>
            <span class="cat__name">{category.name}</span>
          </button>
        ))}
      </div>

      <button type="button" class="prefs__action cats__add" disabled={!ready} onClick={onNew}>
        {t('settings.cats.add')}
      </button>

      {archived.length === 0 ? null : (
        <>
          <h3 class="prefs__sub">
            {t('settings.cats.archivedTitle')} · {archived.length}
          </h3>
          <p class="prefs__text">{t('settings.cats.archivedText')}</p>
          <ul class="arch">
            {archived.map((category) => (
              <li key={category.id}>
                <button
                  type="button"
                  class="arch__row"
                  aria-label={t('settings.cats.placeOne', { name: category.name })}
                  disabled={!ready}
                  onClick={() => onPlace(category)}
                >
                  <span class="arch__dot" style={`--cat:${category.color}`} aria-hidden="true">
                    {category.emoji}
                  </span>
                  <span class="arch__name">{category.name}</span>
                  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                    <path d="m10 6 6 6-6 6" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
