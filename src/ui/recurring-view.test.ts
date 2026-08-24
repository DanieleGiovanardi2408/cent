import { describe, expect, it } from 'vitest'
import { previewMaterialization } from '../core/recurring-plan'
import type { MaterializationPreview, RecurrenceDraft } from '../core/recurring-plan'
import { makeRule } from '../core/testing'
import { setLanguage } from './i18n'
import {
  calendarChanged,
  deletionRefusalText,
  fixedLineNote,
  fixedList,
  previewCopy,
  refusalText,
} from './recurring-view'

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

/**
 * L'anteprima **e la bozza che descrive**, che adesso viaggiano insieme:
 * `previewCopy` ha bisogno di tutte e due, perche' `count: 0` vuol dire due
 * cose opposte a seconda che la regola abbia gia' un segnaposto o no.
 *
 * Il tipo di ritorno e' `MaterializationPreview` e non l'esito intero, ed e' la
 * separazione che conta: **cio' che si mostra non porta con se' il permesso di
 * scrivere**. Il foglio calcola il calendario con `amountCents: 1` per non
 * rifare 9.728 occorrenze a ogni cifra, e uno spread di quell'esito
 * trasportava un permesso a scrivere una regola da 0,01 €.
 */
function preview(
  draft: RecurrenceDraft,
): { readonly shown: MaterializationPreview; readonly draft: RecurrenceDraft } {
  const result = previewMaterialization(draft, OGGI)
  if (!result.ok) throw new Error(`anteprima rifiutata: ${result.reason}`)
  return { shown: result, draft }
}

/** Una bozza mensile da 900, che e' il caso del brief. */
function mensile(startDate: string, extra: Partial<RecurrenceDraft> = {}): RecurrenceDraft {
  return { amountCents: 90_000, cadence: 'monthly', interval: 1, startDate, ...extra }
}

function copyOf(draft: RecurrenceDraft, mode: 'new' | 'edit' | 'reactivate' = 'new') {
  const { shown } = preview(draft)
  return previewCopy(shown, draft, OGGI, mode)
}

describe('l anteprima prima di scrivere', () => {
  it('il caso del brief: 900 al mese dal 1 gennaio dice 8 spese e 7.200 euro', () => {
    const copy = copyOf(mensile('2026-01-01'))
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
    const copy = copyOf(mensile(OGGI))
    expect(copy.confirm).toBe(false)
    expect(copy.confirmLabel).toBeNull()
    expect(copy.text).toBe('Prima spesa: oggi.')
    expect(copy.saveLabel).not.toContain('spese')
  })

  it('una regola che parte in futuro dice quando cade la prima, non tace', () => {
    // `count: 0` — la finestra di materializzazione e' vuota. Senza questo ramo
    // il piede resterebbe muto e "non succede niente adesso" si leggerebbe come
    // "non succedera' niente".
    const futura = preview(mensile('2026-09-01'))
    expect(futura.shown.count).toBe(0)
    const copy = previewCopy(futura.shown, futura.draft, OGGI, 'new')
    expect(copy.text).toContain('1 settembre')
    expect(copy.confirm).toBe(false)
  })

  it('con una sola arretrata il testo e al singolare, in tutte e tre le frasi', () => {
    // Mensile dal 1 agosto, con oggi al 19: una sola occorrenza (la prossima e'
    // il 1 settembre). E' backdated, quindi la conferma c'e' — ma "1 spese" e
    // "le 1 spese arretrate" sono due refusi, e questo e' l'unico ramo che li
    // prende.
    const uno = preview(mensile('2026-08-01'))
    expect(uno.shown.count).toBe(1)
    const copy = previewCopy(uno.shown, uno.draft, OGGI, 'new')
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
    const copy = copyOf(mensile('2026-01-01'))
    expect(copy.saveLabel).toContain('8')
    expect(copy.saveLabel).toContain('7200,00')
    expect(copy.confirmLabel).toContain('8')
  })

  it('un anno diverso porta l anno nella frase', () => {
    // Senza, "1 gennaio" di due anni fa e' indistinguibile da quello di
    // quest'anno, e la conferma varrebbe per il numero sbagliato.
    const copy = copyOf(mensile('2024-01-01'))
    expect(copy.text).toContain('2024')
  })

  it('una regola gia in pari non dice "Prima spesa: 1 gennaio", che sarebbe falso', () => {
    // `count: 0` su una regola con il segnaposto vuol dire l'opposto di `count:
    // 0` su una nuova: non "parte piu' avanti", ma "non c'e' niente da
    // recuperare". Senza questo ramo la modifica di un affitto attivo da mesi
    // annuncerebbe come prossima una spesa che sta nello Storico da gennaio.
    const copy = copyOf(mensile('2026-01-01', { lastMaterializedDate: OGGI }), 'edit')
    expect(copy.text).toBe('Non c’è niente da recuperare.')
    expect(copy.confirm).toBe(false)
    expect(copy.saveLabel).toBe('Salva')
  })

  it('riaccendere una regola dormiente annuncia gli arretrati **prima**', () => {
    // Il terzo innesco, e il piu' silenzioso (ADR 017): il segnaposto e' fermo
    // a tre mesi fa, e riaccendere riapre la finestra su tutto l'intervallo.
    // Chi la riaccende si aspetta "da adesso" e otterrebbe tre spese.
    const copy = copyOf(
      mensile('2026-01-01', { lastMaterializedDate: '2026-05-02' }),
      'reactivate',
    )
    expect(copy.text).toContain('3 spese arretrate')
    expect(copy.text).toContain('1 giugno')
    expect(copy.text).toContain('1 agosto')
    expect(copy.confirm).toBe(true)
    // Il bottone dice cosa **scrive**, non "Riattiva": e' il fatto piu' grosso
    // della riga, e lo e' allo stesso modo in tutte e tre le porte.
    expect(copy.saveLabel).toContain('3 spese')
  })

  it('senza arretrati il bottone dice il gesto, e cambia con la porta', () => {
    const bozza = mensile(OGGI, { lastMaterializedDate: OGGI })
    expect(copyOf(bozza, 'new').saveLabel).toBe('Crea la spesa fissa')
    expect(copyOf(bozza, 'edit').saveLabel).toBe('Salva')
    expect(copyOf(bozza, 'reactivate').saveLabel).toBe('Riattiva')
  })
})

describe('quando la scrittura dice di no', () => {
  it('la mezzanotte si racconta con tutti e due i giorni, e offre il ricalcolo', () => {
    // Il rifiuto porta `previewedOn` **e** `today` perche' "ieri" e' una parola
    // che si scrive solo sapendo anche qual e' oggi.
    const testo = refusalText(
      { ok: false, reason: 'stale-preview', previewedOn: '2026-08-18', today: OGGI },
      OGGI,
    )
    expect(testo).toContain('ieri')
    // Non solo il no: dice anche che i numeri sono gia' rifatti e cosa fare.
    expect(testo).toContain('ricontrolla e conferma')
  })

  it('un salto d orologio piu lungo di un giorno porta la data, non "ieri"', () => {
    const testo = refusalText(
      { ok: false, reason: 'stale-preview', previewedOn: '2026-07-01', today: OGGI },
      OGGI,
    )
    expect(testo).toContain('1 luglio')
    expect(testo).not.toContain('ieri')
  })

  it('il segnaposto mosso dice che nel frattempo sono uscite delle spese', () => {
    const testo = refusalText(
      { ok: false, reason: 'moved-on', previewedMarker: null, currentMarker: OGGI },
      OGGI,
    )
    expect(testo).toContain('Nel frattempo')
    expect(testo).toContain('ricontrolla e conferma')
  })

  it('la regola sparita lo dice e basta: non c e niente da riconfermare', () => {
    const testo = refusalText({ ok: false, reason: 'unknown' }, OGGI)
    expect(testo).toContain('non c’è più')
    expect(testo).not.toContain('conferma')
  })

  it('le stesse tre frasi esistono in inglese, e non sono le italiane', () => {
    // La parita' delle chiavi la garantisce il compilatore; qui si guarda che
    // il ramo inglese esista davvero per tutti e tre, che e' il modo in cui una
    // frase italiana finisce in mezzo all'inglese senza che nessuno la segnali.
    setLanguage('en')
    const stale = refusalText(
      { ok: false, reason: 'stale-preview', previewedOn: '2026-08-18', today: OGGI },
      OGGI,
    )
    expect(stale).toContain('yesterday')
    expect(stale).toContain('check and confirm')
    expect(refusalText({ ok: false, reason: 'moved-on', previewedMarker: null, currentMarker: null }, OGGI))
      .toContain('in the meantime')
    expect(refusalText({ ok: false, reason: 'unknown' }, OGGI)).toContain('gone')
    setLanguage('it')
  })
})

describe('cancellare una regola', () => {
  const regola = makeRule({ startDate: '2026-01-01' })

  it('si puo cancellare: nessuna parola, al suo posto c e il bottone', () => {
    expect(deletionRefusalText({ ok: true, deleted: regola })).toBeNull()
  })

  it('non si puo: la frase porta il numero vero e l uscita', () => {
    const testo = deletionRefusalText({ ok: false, reason: 'in-use', expenses: 8 })
    expect(testo).toContain('8 spese')
    // L'uscita che il rifiuto suggerisce, dentro la frase che rifiuta.
    expect(testo).toContain('Disattivala')
  })

  it('una sola spesa non si scrive "1 spese"', () => {
    const testo = deletionRefusalText({ ok: false, reason: 'in-use', expenses: 1 })
    expect(testo).toContain('1 spesa,')
    expect(testo).not.toContain('1 spese')
  })
})

describe('quale porta aprire', () => {
  const regola = makeRule({ startDate: '2026-01-01', amountCents: 90_000, cadence: 'monthly' })

  it('cambiare solo la categoria non tocca il calendario, quindi non paga', () => {
    expect(calendarChanged(regola, mensile('2026-01-01'))).toBe(false)
  })

  it('l importo sta col calendario: e dentro il totale annunciato', () => {
    // Non genera niente, ma chi ha confermato "8 spese, 7.200 €" ha confermato
    // anche il secondo numero (ADR 017).
    expect(calendarChanged(regola, mensile('2026-01-01', { amountCents: 100_000 }))).toBe(true)
  })

  it('i campi che il foglio non mostra contano lo stesso', () => {
    // `endDate` e `anchorDay` sono dentro `ruleShape`: una bozza che li
    // perdesse per strada li cancellerebbe dal record, e quella differenza
    // dev'essere un cambio visibile invece che una perdita silenziosa.
    expect(calendarChanged(regola, mensile('2026-01-01', { endDate: '2026-12-31' }))).toBe(true)
    expect(calendarChanged(regola, mensile('2026-01-01', { anchorDay: 15 }))).toBe(true)
  })

  it('il segnaposto non e un campo da modificare: non conta come cambio', () => {
    expect(calendarChanged(regola, mensile('2026-01-01', { lastMaterializedDate: OGGI }))).toBe(
      false,
    )
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
