/**
 * Il marchio: il simbolo del centesimo, lo stesso disegno delle icone.
 *
 * Sta in un modulo suo da quando lo usano due schermate — la barra dell'app e
 * la pagina di installazione (ADR 011). Una seconda copia del tracciato sarebbe
 * un secondo disegno da tenere allineato a mano al primo, e al file delle icone.
 */
import './Mark.css'

export function Mark({ size = 26 }: { readonly size?: number }) {
  return (
    <svg class="mark" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect class="mark__bg" width="64" height="64" rx="14.3" />
      <path class="mark__fg" d="M43.9 22.0A15.5 15.5 0 1 0 43.9 42.0" />
      <path class="mark__fg" d="M32 11V53" />
    </svg>
  )
}
