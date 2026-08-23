import { afterEach, describe, expect, it } from 'vitest'
import type { Language } from '../../core/types'
import { currentLanguage, daysLabel, money, resolveLanguage, setLanguage, t } from './index'
import { en } from './en'
import { it as itDict } from './it'

/**
 * I test dell'i18n.
 *
 * ## Cosa NON c'e', di proposito: la parita' delle chiavi
 *
 * Non esiste un test che confronti le chiavi dei due dizionari, e non e' una
 * dimenticanza: `en.ts` e' tipizzato `Record<keyof typeof it, string>`, quindi
 * una chiave mancante o di troppo e' un errore di **compilazione**. Un test
 * equivalente direbbe la stessa cosa piu' tardi (dopo un `vitest run` invece che
 * mentre si scrive) e direbbe meno (non vedrebbe una `t('chiave.inventata')` in
 * un componente, che il compilatore invece rifiuta).
 *
 * Scriverlo comunque sarebbe la cosa peggiore delle due: un test che non puo'
 * fallire, che qualcuno leggerebbe come "la parita' e' sorvegliata da qui" e
 * che il giorno in cui l'annotazione sparisse resterebbe verde lo stesso —
 * perche' senza l'annotazione i due oggetti restano due oggetti.
 *
 * ## La lingua e' stato di modulo: si ripristina
 *
 * `setLanguage` e' globale per costruzione (vedi il commento in `index.ts`), e
 * un test che la lascia storta fa cadere il test dopo con un messaggio che parla
 * d'altro. L'`afterEach` la riporta all'italiano, che e' cio' che gli altri
 * moduli di `src/ui` si aspettano.
 */

afterEach(() => {
  setLanguage('it')
})

const LINGUE: readonly Language[] = ['it', 'en']

/** Gli spazi di Intl sono non-breaking: li normalizziamo per confronti esatti. */
function norm(text: string): string {
  return text.replace(/[  ]/g, ' ')
}

describe('t: la stringa della lingua attiva', () => {
  it('cambia lingua e cambia risposta, sulla stessa chiave', () => {
    setLanguage('it')
    expect(t('day.today')).toBe('Oggi')
    expect(currentLanguage()).toBe('it')
    setLanguage('en')
    expect(t('day.today')).toBe('Today')
    expect(currentLanguage()).toBe('en')
  })

  it('sostituisce i segnaposto, e lascia intatto quello che non gli passi', () => {
    setLanguage('it')
    expect(t('days.other', { count: 5 })).toBe('5 giorni')
    // Un segnaposto senza valore resta scritto invece di diventare "undefined":
    // una frase con dentro `{count}` si vede e si corregge, "undefined giorni"
    // sembra un dato mancante e manda a cercare il guasto nei dati.
    expect(t('days.other', {})).toBe('{count} giorni')
  })

  it('il singolare esiste in tutte e due le lingue: e il giorno che conta di piu', () => {
    setLanguage('it')
    expect(daysLabel(1)).toBe('1 giorno')
    expect(daysLabel(5)).toBe('5 giorni')
    setLanguage('en')
    expect(daysLabel(1)).toBe('1 day')
    expect(daysLabel(5)).toBe('5 days')
  })

  it('nessuna stringa e vuota, in nessuna delle due lingue', () => {
    // I frammenti che finiscono in una frase composta hanno spazi ai bordi e
    // vanno tenuti: qui si controlla che ci sia **qualcosa**, non che sia
    // trimmata. Una chiave svuotata per sbaglio e' un buco muto a schermo.
    for (const [key, value] of Object.entries({ ...itDict })) {
      expect(value.length, `it: ${key} e' vuota`).toBeGreaterThan(0)
    }
    for (const [key, value] of Object.entries(en)) {
      expect(value.length, `en: ${key} e' vuota`).toBeGreaterThan(0)
    }
  })
})

describe('resolveLanguage: assente non significa italiano', () => {
  it('una scelta esplicita vince sempre sull ambiente', () => {
    expect(resolveLanguage('it')).toBe('it')
    expect(resolveLanguage('en')).toBe('en')
  })

  it('assente ricade sull ambiente, e in node non c e navigator delle lingue', () => {
    // In ambiente node `detectLanguage()` non trova le lingue preferite e cade
    // sul default di prodotto: **inglese**, perche' la lingua condivisa di un
    // gruppo Erasmus e' l'inglese. E' lo stesso ramo che prende un telefono in
    // neerlandese, ed e' il motivo per cui il default non e' l'italiano.
    expect(resolveLanguage(undefined)).toBe('en')
  })
})

describe('money: lo stesso intero detto in due lingue', () => {
  it('formatta lo zero, i decimali e i negativi in italiano', () => {
    setLanguage('it')
    expect(norm(money(0))).toBe('0,00 €')
    expect(norm(money(5))).toBe('0,05 €')
    expect(norm(money(1000))).toBe('10,00 €')
    expect(norm(money(-1250))).toBe('-12,50 €')
  })

  it('formatta le migliaia con il separatore it-IT', () => {
    setLanguage('it')
    expect(norm(money(123456789))).toBe('1.234.567,89 €')
    expect(norm(money(1234567))).toBe('12.345,67 €')
    // it-IT (CLDR) non raggruppa i numeri a 4 cifre: 1234,56 e non 1.234,56.
    expect(norm(money(123456))).toBe('1234,56 €')
  })

  it('in inglese il simbolo passa davanti e il punto diventa decimale', () => {
    setLanguage('en')
    expect(norm(money(0))).toBe('€0.00')
    expect(norm(money(-1250))).toBe('-€12.50')
    expect(norm(money(123456789))).toBe('€1,234,567.89')
    // E qui le quattro cifre **si raggruppano**: la regola non e' universale,
    // e' del locale. E' esattamente il tipo di cosa che veniva cablata quando
    // `formatCents` viveva in `src/core` con `'it-IT'` dentro.
    expect(norm(money(123456))).toBe('€1,234.56')
  })

  it('rifiuta un input non intero in tutte e due le lingue', () => {
    for (const lingua of LINGUE) {
      setLanguage(lingua)
      expect(() => money(12.5)).toThrow(TypeError)
      expect(() => money(Number.POSITIVE_INFINITY)).toThrow(TypeError)
    }
  })
})

/**
 * Canarino d'ambiente, deciso al gate della fase 2 (docs/ROADMAP.md,
 * "Asserzioni sull'ambiente") ed esteso a **entrambe le lingue** in fase 3.
 * Non prova `money`: prova l'ICU della runtime sotto, che e' l'unica che decide
 * come si scrive un euro.
 *
 * ## Cosa cambia con la lingua, e cosa no
 *
 * Cambia **dove sta il simbolo**: in italiano dopo il numero e separato,
 * in inglese davanti e attaccato. Non cambia la proprieta' da difendere:
 * **fra le cifre e il simbolo non ci puo' essere un punto in cui il testo va a
 * capo.** Un'unica formulazione copre le due forme — o non c'e' niente in
 * mezzo, e allora non c'e' niente da spezzare, oppure c'e' uno spazio e dev'essere
 * non separabile.
 *
 * E' un test di **proprieta'**, non di byte: quale dei tre spazi non separabili
 * esca e' irrilevante — sono lo stesso pixel — e se ICU cambia idea fra loro
 * deve restare verde. Cade solo se diventa uno spazio normale, che e' un bug
 * visibile: in una colonna stretta `1.234,56` va a capo e il `€` finisce sulla
 * riga dopo, staccato dalle cifre.
 */
describe("canarino: lo spazio fra numero e simbolo dell'euro", () => {
  /** U+00A0 no-break, U+202F narrow no-break, U+2007 figure space. */
  const NON_SEPARABILI = new Map([
    [' ', 'U+00A0 NO-BREAK SPACE'],
    [' ', 'U+202F NARROW NO-BREAK SPACE'],
    [' ', 'U+2007 FIGURE SPACE'],
  ])

  function nome(char: string): string {
    if (char === ' ') return 'U+0020 SPACE (lo spazio normale)'
    return (
      NON_SEPARABILI.get(char) ??
      `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`
    )
  }

  it('non e un carattere su cui si possa andare a capo, in nessuna delle due lingue', () => {
    for (const lingua of LINGUE) {
      setLanguage(lingua)
      const reso = money(123456789)
      const posizioneEuro = reso.indexOf('€')
      expect(
        posizioneEuro,
        `[${lingua}] money ha reso "${reso}", che non contiene il simbolo €. ` +
          "Non e' cambiato il codice: e' cambiato come l'ICU della runtime scrive " +
          'la valuta per questo locale. Prima di aggiornare questo test, guardare ' +
          'cosa mostra davvero la Home.',
      ).toBeGreaterThanOrEqual(0)

      // Il vicino **dalla parte delle cifre**: in italiano il simbolo sta in
      // fondo, in inglese in testa. La domanda e' la stessa in tutte e due —
      // "che cosa c'e' fra le cifre e il simbolo" — e cambia solo da che lato
      // guardarla. Cablare "il carattere prima" avrebbe fatto passare
      // l'inglese senza guardare niente: `charAt(-1)` e' la stringa vuota, e
      // una stringa vuota non e' uno spazio normale, quindi il test sarebbe
      // stato verde per il motivo sbagliato.
      const attaccato = lingua === 'it'
      const separatore = attaccato
        ? reso.charAt(posizioneEuro - 1)
        : reso.charAt(posizioneEuro + 1)

      // La proprieta', detta una volta per tutte e due le forme: **se fra le
      // cifre e il simbolo c'e' uno spazio, non dev'essere separabile**. Se non
      // c'e' nessuno spazio — `€1,234.56`, dove il vicino e' la cifra `1` — non
      // esiste nessun punto in cui spezzare, e va bene cosi'.
      //
      // Il controllo e' su "e' uno spazio qualunque", non su "e' lo spazio
      // normale": se domani ICU infilasse li' un separatore invisibile diverso
      // da U+0020 e comunque spezzabile, un test scritto sul singolo carattere
      // resterebbe verde. La domanda giusta e' "c'e' del bianco?", e poi "e' di
      // quelli che tengono insieme?".
      const bianco = /\s/.test(separatore)
      const innocuo = !bianco || NON_SEPARABILI.has(separatore)

      expect(
        innocuo,
        `[${lingua}] fra le cifre e il simbolo dell'euro c'e' ${nome(separatore)}, ` +
          'che e\' uno spazio separabile: qui ci vuole niente, oppure uno spazio ' +
          `non separabile (U+00A0, U+202F o U+2007). money ha reso "${reso}". ` +
          "Non e' una sottigliezza tipografica: " +
          "uno spazio normale e' un punto in cui il testo puo' andare a capo, " +
          "quindi in una colonna stretta l'importo si spezza e il simbolo " +
          "dell'euro finisce sulla riga dopo, staccato dalle cifre. Il codice non " +
          "e' cambiato: e' cambiata l'ICU della runtime che formatta (Node qui, " +
          "WebKit sull'iPhone). Se e' comparso un quarto spazio non separabile, " +
          'aggiungerlo alla mappa qui sopra: sono lo stesso pixel. Se e\' uno ' +
          "spazio normale (U+0020), il difetto e' nella runtime e la UI va " +
          'difesa, non il test aggiornato.',
      ).toBe(true)
    }
  })
})
