import { describe, expect, it } from 'vitest'
import { previewMaterialization } from '../core/recurring-plan'
import type { MaterializationPreviewResult } from '../core/recurring-plan'
import { makeRule } from '../core/testing'
import { setLanguage } from './i18n'
import { fixedLineNote, fixedList, previewCopy } from './recurring-view'

/**
 * Le parole intorno alle spese fisse. Come per `budget-view.test.ts`, quello
 * che puo' sbagliare non sono i numeri — quelli hanno gia' i loro test in
 * `src/core` — ma **cosa si dice di quei numeri**, e in particolare i due rami
 * che a mano non si provano mai:
 *
 * - la conferma che **non** deve comparire (regola che parte oggi);
 * - la regola che non pesa ancora sul mese e che quindi sparirebbe
 *   dall'elenco se l'elenco fosse `monthlyFixedCosts`.
 */
setLanguage('it')

// Mercoledi' 19 agosto 2026: nessun confine vicino, ne' di giorno ne' di mese.
const OGGI = '2026-08-19'

function preview(
  startDate: string,
  amountCents = 90_000,
  cadence: 'daily' | 'weekly' | 'monthly' = 'monthly',
): Extract<MaterializationPreviewResult, { ok: true }> {
  const result = previewMaterialization({ amountCents, cadence, interval: 1, startDate }, OGGI)
  if (!result.ok) throw new Error(`anteprima rifiutata: ${result.reason}`)
  return result
}

describe('l anteprima prima di scrivere', () => {
  it('il caso del brief: 900 al mese dal 1 gennaio dice 8 spese e 7.200 euro', () => {
    const copy = previewCopy(preview('2026-01-01'), '2026-01-01', OGGI)
    // I tre numeri che l'utente deve vedere prima di confermare, e non uno di
    // meno: quante, da quando a quando, quanto in tutto.
    expect(copy.text).toContain('8 spese')
    expect(copy.text).toContain('1 gennaio')
    expect(copy.text).toContain('1 agosto')
    // `7200,00` senza puntino, e non e' un difetto: in `it-IT` il CLDR ha
    // `minimumGroupingDigits: 2`, quindi il separatore delle migliaia compare
    // da 10.000 in su. E' il locale a saperlo, e questa riga serve a non
    // "correggerlo".
    expect(copy.text).toContain('7200,00')
    expect(copy.confirm).toBe(true)
  })

  it('una regola che parte oggi NON chiede nessuna conferma', () => {
    // E' il ramo che tiene in vita tutti gli altri: una conferma che compare
    // sempre smette di essere letta, quindi qui deve essere assente.
    const copy = previewCopy(preview(OGGI), OGGI, OGGI)
    expect(copy.confirm).toBe(false)
    expect(copy.confirmLabel).toBeNull()
    expect(copy.text).toBe('Prima spesa: oggi.')
    expect(copy.saveLabel).not.toContain('spese')
  })

  it('una regola che parte in futuro dice quando cade la prima, non tace', () => {
    // `count: 0` — la finestra di materializzazione e' vuota. Senza questo ramo
    // il piede resterebbe muto e "non succede niente adesso" si leggerebbe come
    // "non succedera' niente".
    const futura = preview('2026-09-01')
    expect(futura.count).toBe(0)
    const copy = previewCopy(futura, '2026-09-01', OGGI)
    expect(copy.text).toContain('1 settembre')
    expect(copy.confirm).toBe(false)
  })

  it('con una sola arretrata il testo e al singolare, in tutte e tre le frasi', () => {
    // Mensile dal 1 agosto, con oggi al 19: una sola occorrenza (la prossima e'
    // il 1 settembre). E' backdated, quindi la conferma c'e' — ma "1 spese" e
    // "le 1 spese arretrate" sono due refusi, e questo e' l'unico ramo che li
    // prende.
    const uno = preview('2026-08-01')
    expect(uno.count).toBe(1)
    const copy = previewCopy(uno, '2026-08-01', OGGI)
    expect(copy.confirm).toBe(true)
    expect(copy.text).toContain('1 spesa arretrata')
    expect(copy.text).not.toContain('1 spese')
    expect(copy.confirmLabel).toBe('Crea anche la spesa arretrata')
    // Il bottone e' la terza delle tre frasi, ed e' l'unica che si legge
    // sempre: diceva "Crea 1 spese".
    // `\u00a0` e non uno spazio: in `it-IT` il simbolo e' preceduto da uno
    // spazio **non separabile**, ed e' cio' che impedisce a "900,00" e a "€" di
    // finire su due righe dentro un bottone. Scritto per esteso qui perche' un
    // confronto con lo spazio normale fallirebbe con due stringhe che a schermo
    // sembrano identiche — che e' esattamente come questa riga e' nata.
    expect(copy.saveLabel).toBe('Crea 1 spesa · 900,00\u00a0€')
  })

  it('l etichetta del bottone porta i numeri, perche e li che si annunciano', () => {
    // Nessun `aria-live` sull'anteprima (cambierebbe nello stesso frame
    // dell'importo, che e' gia' una regione live): i numeri devono quindi stare
    // sui bersagli che si attraversano per scrivere.
    const copy = previewCopy(preview('2026-01-01'), '2026-01-01', OGGI)
    expect(copy.saveLabel).toContain('8')
    expect(copy.saveLabel).toContain('7200,00')
    expect(copy.confirmLabel).toContain('8')
  })

  it('un anno diverso porta l anno nella frase', () => {
    // Senza, "1 gennaio" di due anni fa e' indistinguibile da quello di
    // quest'anno, e la conferma varrebbe per il numero sbagliato.
    const copy = previewCopy(preview('2024-01-01'), '2024-01-01', OGGI)
    expect(copy.text).toContain('2024')
  })
})

describe('l elenco delle spese fisse', () => {
  const affitto = makeRule({ startDate: '2026-01-01', amountCents: 90_000, cadence: 'monthly' })
  const palestra = makeRule({ startDate: '2026-01-01', amountCents: 10_000, cadence: 'weekly' })

  it('il totale e la somma delle righe contate, non un numero a parte', () => {
    const list = fixedList([affitto, palestra], OGGI)
    const sum = list.lines.reduce((acc, line) => acc + (line.monthlyCents ?? 0), 0)
    expect(list.totalCents).toBe(sum)
  })

  it('una settimanale da 100 vale 434,81 al mese, non 400', () => {
    const list = fixedList([palestra], OGGI)
    // Passa dall'anno medio: dodici volte questo numero e' il costo annuo vero.
    expect(list.totalCents).toBe(43_481)
    expect(list.approximate).toBe(true)
  })

  it('una mensile e esatta, quindi non si avverte di nessuna media', () => {
    const list = fixedList([affitto], OGGI)
    expect(list.totalCents).toBe(90_000)
    // 12/12 = 1: l'importo tale e quale. Avvertire qui insegnerebbe a saltare
    // l'avviso quando invece serve.
    expect(list.approximate).toBe(false)
  })

  it('una regola non ancora cominciata resta in elenco, fuori dal totale', () => {
    // Il difetto che questo ramo chiude: con `monthlyFixedCosts` come unica
    // fonte, chi crea una regola che parte il mese prossimo conferma la
    // creazione e non ne vede traccia da nessuna parte.
    const futura = makeRule({ startDate: '2026-09-01', amountCents: 50_000 })
    const list = fixedList([affitto, futura], OGGI)
    expect(list.lines).toHaveLength(2)
    const riga = list.lines.find((line) => line.rule.id === futura.id)
    expect(riga?.monthlyCents).toBeNull()
    expect(riga?.aside).toContain('1 settembre')
    expect(list.totalCents).toBe(90_000)
  })

  it('una regola finita resta in elenco e dice che e finita', () => {
    const finita = makeRule({ startDate: '2026-01-01', endDate: '2026-06-30', amountCents: 50_000 })
    const list = fixedList([finita], OGGI)
    expect(list.lines[0]?.monthlyCents).toBeNull()
    expect(list.lines[0]?.aside).toContain('30 giugno')
    expect(list.totalCents).toBe(0)
  })

  it('senza regole non c e nessuna riga e il totale e zero', () => {
    const list = fixedList([], OGGI)
    expect(list.lines).toHaveLength(0)
    expect(list.totalCents).toBe(0)
    expect(list.approximate).toBe(false)
  })

  it('l ordine e totale: prima chi pesa di piu, poi le altre per data', () => {
    // Due regole non devono scambiarsi di posto a seconda di come il mirror le
    // ha restituite.
    const a = fixedList([affitto, palestra], OGGI).lines.map((line) => line.rule.id)
    const b = fixedList([palestra, affitto], OGGI).lines.map((line) => line.rule.id)
    expect(a).toEqual(b)
  })
})

describe('la riga sotto il nome', () => {
  it('una mensile non ripete l importo: la colonna a destra dice gia quello', () => {
    const nota = fixedLineNote(makeRule({ startDate: '2026-01-01', amountCents: 90_000 }))
    expect(nota).toBe('ogni mese')
  })

  it('una settimanale lo ripete, perche il numero a destra e un altro numero', () => {
    const nota = fixedLineNote(
      makeRule({ startDate: '2026-01-01', amountCents: 10_000, cadence: 'weekly' }),
    )
    expect(nota).toContain('ogni settimana')
    expect(nota).toContain('100,00')
  })

  it('un intervallo diverso da uno si legge, anche se il foglio non lo crea', () => {
    // Una regola cosi' puo' arrivare da un backup: l'elenco deve saperla dire.
    const nota = fixedLineNote(
      makeRule({ startDate: '2026-01-01', cadence: 'monthly', interval: 3 }),
    )
    expect(nota).toContain('ogni 3 mesi')
  })
})
