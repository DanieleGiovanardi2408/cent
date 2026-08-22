/**
 * Durate in JavaScript allineate a quelle del CSS.
 *
 * I token `--dur-*` vanno gia' a zero sotto `prefers-reduced-motion`, ma un
 * `setTimeout` scritto a mano no: senza questo, chi ha chiesto meno movimento si
 * ritroverebbe il bottom sheet che resta immobile sullo schermo per 200 ms dopo
 * aver salvato. L'animazione sparisce, l'attesa no.
 */
export function motionMs(ms: number): number {
  return matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms
}
