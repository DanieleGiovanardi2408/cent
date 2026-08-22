/**
 * Non prova il codice: prova l'ambiente in cui gli altri test girano.
 *
 * Diversi test di `date.ts` sono test di proprieta' sul passaggio all'ora
 * legale: campionano le ore attorno a una transizione e verificano che il
 * giorno civile avanzi di uno. In un fuso che l'ora legale non la osserva —
 * UTC, per esempio, che e' quello della CI di GitHub Actions — quelle
 * transizioni non avvengono: il test passa sempre, e non perche' il codice sia
 * giusto. Verde in locale per una ragione, verde in CI per un'altra, e solo una
 * delle due e' quella che si crede.
 *
 * Il fuso e' fissato in `vitest.config.ts` (`test.env.TZ`). Questo file lo
 * asserisce, cosi' se quella configurazione sparisce o viene sovrascritta cade
 * qui, rumorosamente, invece di far svanire in silenzio la garanzia altrove.
 */
import { describe, expect, it } from 'vitest'

const ATTESO = 'Europe/Amsterdam'

/** Minuti di scarto da UTC in una data data, letti dall'ambiente. */
function offsetMinutes(iso: string): number {
  return -new Date(iso).getTimezoneOffset()
}

describe('ambiente dei test: fuso orario', () => {
  it(`gira in ${ATTESO}`, () => {
    const attivo = Intl.DateTimeFormat().resolvedOptions().timeZone
    expect(
      attivo,
      `I test girano in "${attivo}" invece che in "${ATTESO}". ` +
        'Manca (o e" stato sovrascritto) test.env.TZ in vitest.config.ts. ' +
        'I test sull\'ora legale in date.test.ts diventano vacui senza quella riga.',
    ).toBe(ATTESO)
  })

  it('e il fuso osserva davvero l ora legale', () => {
    // Il controllo che conta: il nome giusto non basta, serve che l'offset
    // cambi fra inverno ed estate. Un fuso senza DST renderebbe vacui i test
    // di proprieta' pur avendo superato l'asserzione qui sopra.
    const inverno = offsetMinutes('2026-01-15T12:00:00Z')
    const estate = offsetMinutes('2026-07-15T12:00:00Z')
    expect(
      estate - inverno,
      `Offset identico fra gennaio (${inverno}) e luglio (${estate}): il fuso ` +
        'attivo non osserva l\'ora legale, quindi i test di proprieta\' sul ' +
        'passaggio non stanno provando niente.',
    ).toBe(60)
  })
})
