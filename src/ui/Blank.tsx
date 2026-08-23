import { insecureContext } from './env'
import { t } from './i18n'
import './Blank.css'

/**
 * L'archivio non si e' aperto. Lo dicono due schermate — Home e Storico — e
 * devono dirlo con le stesse parole: e' un solo fatto, e una diagnosi che
 * cambia da schermata a schermata manda a cercare il guasto in due posti.
 *
 * ## La diagnosi prima del rimedio
 *
 * Qui c'era scritto "Succede in navigazione privata: Safari non lascia salvare
 * niente sul dispositivo". Era **una diagnosi indovinata**, e quando sbagliava
 * mandava a cercare il guasto in una finestra privata che non era stata aperta.
 * L'unica causa che l'app puo' davvero osservare e' il contesto non sicuro: se
 * e' quella, si dice quella. Se non lo e', si dicono le possibilita' come
 * possibilita', senza spacciarne una per la risposta.
 */
export function ArchiveError() {
  return (
    <div class="blank">
      <p class="blank__title">{t('archive.title')}</p>
      <p class="blank__text">{t(insecureContext ? 'archive.insecure' : 'archive.unknown')}</p>
    </div>
  )
}
