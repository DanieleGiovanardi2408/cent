import { t, variants } from './i18n'
import type { Key } from './i18n'
import './Fit.css'

/**
 * Un'etichetta che occupa **la larghezza massima fra tutte le lingue**, sempre.
 *
 * ## Il difetto che chiude, e quello che non chiude
 *
 * Il guscio si dipinge prima che il database sia aperto ("Ordine di pittura"),
 * e la lingua **scelta** sta nel database. Chi ha scelto una lingua diversa da
 * quella del telefono vede quindi il guscio nella lingua rilevata per i pochi
 * frame che separano il primo render dall'apertura di IndexedDB.
 *
 * Quel lampo **resta**, ed e' cosmetico. Quello che non resta e' la sua
 * conseguenza misurabile: "Storico" e "History" non sono larghi uguale, le
 * schede stanno a destra, e quando i dati arrivavano l'intero blocco si
 * spostava — CLS > 0 in uno stato che nessun test guardava, perche' chi non ha
 * mai scelto una lingua non lo vede mai.
 *
 * La regola non chiede che il primo frame sia definitivo: chiede che l'arrivo
 * dei dati **non sposti nulla**.
 *
 * ## Perche' non una cache sincrona della lingua
 *
 * Perche' sarebbe una seconda fonte di verita' fuori da IndexedDB per togliere
 * un cambio di parole che nessuno ha chiesto di togliere. Qui la larghezza e'
 * **deterministica e calcolabile**: la misura la fa il browser con il font vero
 * del telefono, e non c'e' nessun numero cablato che il prossimo cambio di copy
 * renderebbe falso. L'escalation, se un giorno servisse, e' gia' argomentata in
 * docs/ROADMAP.md.
 *
 * ## Perche' un pseudo-elemento e non un secondo `<span>`
 *
 * Perche' la variante spenta **non deve esistere come testo**. Con un `<span>`
 * nascosto la barra conteneva davvero "StoricoHistory": invisibile a schermo e
 * fuori dall'albero di accessibilita' (`visibility: hidden` non si dipinge e non
 * si annuncia), ma dentro `textContent` — cioe' dentro qualunque ricerca per
 * testo, oggi nei test e domani in una funzione che legge la pagina. Il
 * contenuto generato da CSS non sta in `textContent` e non e' un nodo.
 *
 * **Limite dichiarato**: `::after` porta una variante sola, quindi questo regge
 * fino a due lingue (`::before` ne aggiungerebbe una terza). Alla quarta lingua
 * la tecnica va cambiata, e questo commento e' il posto in cui scoprirlo prima
 * di sbatterci contro: `variants()` restituisce gia' tutte le lingue, ed e' li'
 * che si vedra' quante ne restano fuori.
 */
export function Fit({ k }: { readonly k: Key }) {
  const active = t(k)
  // La piu' larga delle altre non si puo' sapere senza misurare: con due lingue
  // "l'altra" e' una sola, e quando saranno tre questa riga ne perderebbe una.
  // Meglio che sia una riga sola da cambiare, in un file solo.
  const other = variants(k).find((text) => text !== active)
  return (
    <span class="fit" data-alt={other}>
      <span class="fit__real">{active}</span>
    </span>
  )
}
