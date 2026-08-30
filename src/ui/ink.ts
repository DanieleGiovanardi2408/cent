/**
 * **L'inchiostro che si legge sopra una tinta di categoria.**
 *
 * ## Perche' esiste, e perche' e' nato adesso
 *
 * Finche' le pastiglie erano **mescolate col fondo** (`color-mix ... 40%`), cio'
 * che ci stava sopra viveva su una superficie chiara nel tema chiaro e scura nel
 * tema scuro: `var(--text)` andava bene su tutte e otto per costruzione, perche'
 * la superficie era per meta' il fondo del tema.
 *
 * Dalla decisione X la pastiglia **e' la tinta**. Un inchiostro fisso non puo'
 * piu' funzionare: `--text` chiaro sta a 2,81:1 su Svago e 2,77:1 su Extra,
 * cioe' **sotto** il pavimento di 3:1 che WCAG 1.4.11 chiede a un glifo che
 * porta uno stato. Il colore dell'inchiostro diventa quindi funzione della
 * tinta, non del tema.
 *
 * ## E la scelta NON dipende dal tema, il che e' un regalo di ADR 025
 *
 * `Category.color` e' **una colonna sola**: la stessa tinta sui due fondi (ADR
 * 025, decisione 2). Quindi la superficie su cui l'inchiostro deve leggersi e'
 * la stessa in chiaro e in scuro, e i casi da verificare sono **otto, non
 * sedici**. Un criterio che non puo' divergere fra due temi e' meglio di uno che
 * si verifica due volte — ed e' letteralmente l'argomento con cui quella
 * decisione fu presa, che qui incassa una seconda volta.
 *
 * ## Cosa NON fa
 *
 * Non guarda i colori scelti dall'utente meglio di come guarda i default: la
 * funzione e' totale — su qualunque tinta restituisce l'inchiostro con il
 * contrasto piu' alto dei due — ma **non promette** che quel contrasto arrivi a
 * 3:1. Su una tinta a meta' strada fra bianco e nero nessuno dei due ci arriva,
 * e non esiste un terzo inchiostro da provare. Cio' che il test garantisce e'
 * il pavimento **sulle otto di default**, che sono le uniche che l'app produce.
 */

/** I due inchiostri. Non sono token: devono restare gli stessi nei due temi. */
const CHIARO = '#ffffff'
/**
 * Lo scuro e' l'esadecimale di `--text` del tema chiaro, non `#000`: un nero
 * pieno sopra una tinta satura e' piu' duro di qualunque altra cosa disegni
 * l'app, e questo valore e' gia' il "quasi nero" del progetto.
 */
const SCURO = '#12181f'

/** `#rgb` o `#rrggbb` -> tre canali 0..255. `null` su qualunque altra cosa. */
function canali(hex: string): readonly [number, number, number] | null {
  const s = hex.trim()
  if (s.length === 4 && s.startsWith('#')) {
    const [r, g, b] = [1, 2, 3].map((i) => Number.parseInt(s[i]! + s[i]!, 16))
    return Number.isNaN(r! + g! + b!) ? null : [r!, g!, b!]
  }
  if (s.length === 7 && s.startsWith('#')) {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(s.slice(i, i + 2), 16))
    return Number.isNaN(r! + g! + b!) ? null : [r!, g!, b!]
  }
  return null
}

/** Luminanza relativa WCAG 2.x. */
function luminanza([r, g, b]: readonly [number, number, number]): number {
  const lin = (v: number): number => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contrasto(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const [hi, lo] = [luminanza(a), luminanza(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * L'inchiostro da usare **sopra** `tinta`: quello dei due che ci si legge
 * meglio.
 *
 * Su una tinta che non si sa leggere si ripiega su `CHIARO` invece di lanciare:
 * un colore illeggibile arriva da un backup importato, cioe' da dati altrui, e
 * un foglio che non si apre e' peggio di una spunta con poco contrasto.
 */
export function inkOn(tinta: string): string {
  const c = canali(tinta)
  if (c === null) return CHIARO
  return contrasto(canali(CHIARO)!, c) >= contrasto(canali(SCURO)!, c) ? CHIARO : SCURO
}

/** Il contrasto dell'inchiostro scelto sopra `tinta`. Serve al test, e al referto. */
export function inkContrast(tinta: string): number {
  const c = canali(tinta)
  if (c === null) return 1
  return Math.max(contrasto(canali(CHIARO)!, c), contrasto(canali(SCURO)!, c))
}
