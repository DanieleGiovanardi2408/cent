/**
 * Durate in JavaScript allineate a quelle del CSS.
 *
 * I token `--dur-*` vanno gia' a zero sotto `prefers-reduced-motion`, ma un
 * `setTimeout` scritto a mano no: senza questo, chi ha chiesto meno movimento si
 * ritroverebbe il bottom sheet che resta immobile sullo schermo per 200 ms dopo
 * aver salvato. L'animazione sparisce, l'attesa no.
 */
export function motionMs(ms: number): number {
  return reducedMotion() ? 0 : ms
}

/**
 * Chi ha chiesto meno movimento.
 *
 * Esiste separata da `motionMs` perche' la guida non ha una durata da azzerare:
 * ha **due contenuti diversi**. L'importo che si riempie da destra si mostra in
 * movimento a chi il movimento lo accetta, e come tabella dei tre casi a chi non
 * lo vuole — non come la stessa animazione ferma su un fotogramma, che sarebbe
 * un esempio solo su tre.
 *
 * Si legge **al render** e non si sottoscrive: la preferenza si cambia nelle
 * impostazioni di sistema, cioe' fuori dall'app, e tornarci dentro ridipinge
 * comunque (ADR 007, rilettura al risveglio). Un listener qui sorveglierebbe una
 * transizione che nessuno fa mentre guarda la guida.
 */
export function reducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}
