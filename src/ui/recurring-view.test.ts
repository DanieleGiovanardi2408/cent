import { describe, expect, it } from 'vitest'
import { toDateParts } from '../core/date'
import type { IsoDate } from '../core/date'
import { NO_OCCURRENCES } from '../core/recurrence'
import { previewMaterialization } from '../core/recurring-plan'
import type {
  MaterializationPreview,
  RecurrenceDraft,
  RecurrenceDraftCommon,
} from '../core/recurring-plan'
import type { RecurringRule } from '../core/types'
import { makeRule } from '../core/testing'
import { setLanguage } from './i18n'
import {
  calendarChanged,
  deletionRefusalText,
  fixedLineNote,
  fixedList,
  previewCopy,
  refusalText,
  rewindCopy,
  rewindDraft,
  rewindRefusalText,
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
 * Gli spazi di `Intl` sono **non separabili**, e restano tali: e' il canarino
 * che questo progetto tiene apposta (vedi `money.test.ts`). Qui si normalizzano
 * solo per poter confrontare una frase intera con una scritta a mano.
 */
function norm(text: string): string {
  return text.replace(/[\u00a0\u202f]/g, ' ')
}

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
  const result = previewMaterialization(draft, OGGI, NO_OCCURRENCES)
  if (!result.ok) throw new Error(`anteprima rifiutata: ${result.reason}`)
  return { shown: result, draft }
}

/**
 * Una bozza mensile da 900, che e' il caso del brief.
 *
 * L'ancora **si deriva da `startDate`**, come fa il foglio quando crea una
 * regola e come ha fatto la migrazione 3 -> 4 sui record gia' scritti: e' la
 * stessa derivazione di `makeRule`, quindi una regola e una bozza costruite qui
 * dalla stessa data hanno lo stesso calendario e `calendarChanged` risponde
 * "no" invece di confrontare un numero con niente.
 *
 * Resta scavalcabile da `extra`, ed e' il solo modo di scrivere lo stato che
 * dalla UI arriva solo in modifica: ancora ferma, data d'inizio spostata.
 *
 * `extra` non e' un `Partial<RecurrenceDraft>`: su un'unione discriminata
 * `Partial` distribuisce e produce anche il ramo `anchorDay?: never`, cioe'
 * esattamente la mensile senza ancora che ADR 020 ha reso non rappresentabile.
 * Si scavalcano i campi comuni, piu' l'ancora, che comune non e'.
 */
function mensile(
  startDate: IsoDate,
  extra: Partial<RecurrenceDraftCommon> & { readonly anchorDay?: number } = {},
): RecurrenceDraft {
  const { anchorDay, ...common } = extra
  return {
    amountCents: 90_000,
    interval: 1,
    startDate,
    ...common,
    cadence: 'monthly',
    anchorDay: anchorDay ?? toDateParts(startDate).day,
  }
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

  it('creando, la prima spesa cade SEMPRE sulla data d inizio, dentro o fuori dalla finestra', () => {
    // La proprieta' che l'ancora derivata da `startDate` garantisce: il foglio,
    // **in creazione**, non sa costruire una regola che parte dopo il proprio
    // inizio. Non tiene piu' in piedi nessun ripiego — il giorno annunciato
    // adesso e' `nextDate`, che lo calcola il core — ma resta cio' che fa
    // coincidere le due strade, e si legge su tutte e due i campi insieme:
    // `firstDate` quando l'occorrenza cade nella finestra, `nextDate` quando la
    // regola non e' ancora partita.
    //
    // Il 31 e il 29 febbraio sono qui perche' sono gli unici giorni su cui
    // `clampDayOfMonth` interviene: se derivasse un'ancora fuori scala, la
    // prima occorrenza scivolerebbe di giorni.
    for (const giorno of ['2026-01-01', '2026-07-31', '2026-08-18', OGGI, '2024-02-29', '2026-09-01']) {
      const { shown } = preview(mensile(giorno))
      expect([giorno, shown.firstDate ?? shown.nextDate]).toEqual([giorno, giorno])
    }
  })

  it('ancora al 15 e inizio il 5 settembre: la prima spesa e il 15, non il 5', () => {
    // Il difetto vero, e l'unica porta da cui arriva: **modificando** una regola
    // si sposta la data d'inizio mentre l'ancora resta quella scritta nel record
    // (ADR 020), quindi le due si separano. Il piede ripiegava su
    // `draft.startDate` e annunciava "Prima spesa: 5 settembre" — un giorno in
    // cui non succede niente. Il 5 non e' nemmeno un'approssimazione: e' dieci
    // giorni prima, e chi legge lo usa per decidere se salvare.
    const copy = copyOf(mensile('2026-09-05', { anchorDay: 15 }), 'edit')
    expect(copy.text).toBe('Prima spesa: 15 settembre.')
    expect(copy.confirm).toBe(false)
  })

  it('una regola in pari lo dice, e non annuncia come "prima" una spesa gia scritta', () => {
    // Qui c'era il caso della regola **finita**, e non e' stato riscritto: e'
    // stato tolto insieme allo stato che descriveva. Senza `endDate` una regola
    // non finisce, quindi `nextDate` non e' mai `null` e non esiste nessuna
    // finestra in cui quella frase sia vera. Torna in fase 7 con la scadenza.
    //
    // Quello che resta e' il ramo che il segnaposto distingue: `count: 0` su una
    // regola gia' materializzata vuol dire "sei in pari", non "parte piu'
    // avanti" — e "Prima spesa: 1 gennaio" sarebbe falso, quella spesa e' nello
    // Storico da mesi.
    const pari = preview(mensile('2026-01-01', { lastMaterializedDate: OGGI }))
    expect(pari.shown.count).toBe(0)
    const copy = previewCopy(pari.shown, pari.draft, OGGI, 'edit')
    expect(copy.text).toBe('Non c’è niente da recuperare.')
    expect(copy.confirm).toBe(false)

    setLanguage('en')
    expect(previewCopy(pari.shown, pari.draft, OGGI, 'edit').text).toBe(
      'There is nothing to catch up on.',
    )
    setLanguage('it')
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
    expect(testo).toContain('1 spesa ')
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

  it('spostare il giorno del mese e un cambio di calendario, e paga il pedaggio', () => {
    // L'ancora e' dentro il record che la bozza detta: una bozza che la
    // perdesse per strada la cancellerebbe, e una bozza che la **cambia** —
    // adesso si puo', c'e' un selettore nel foglio — sposta ogni occorrenza
    // futura. In tutti e due i casi dev'essere un cambio visibile, cioe' deve
    // passare da `reviseRecurringRule` e dalla sua conferma.
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

  it('una regola spenta resta in elenco, fuori dal totale, e dice che e spenta', () => {
    // Qui c'era la regola **finita**, tolta insieme a `endDate`: senza scadenza
    // quello stato non e' raggiungibile. Resta l'altro motivo per cui una riga
    // non pesa sul mese, ed e' l'unico dei due che si cambia con un tap.
    const spenta = makeRule({ startDate: '2026-01-01', amountCents: 50_000, active: false })
    const list = fixedList([spenta], OGGI)
    expect(list.lines[0]?.monthlyCents).toBeNull()
    expect(list.lines[0]?.aside).toBe('spenta')
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
    expect(nota).toBe('ogni mese, il giorno 1')
  })

  it('il giorno del mese si legge anche quando non e quello della data d inizio', () => {
    // **Lo stato che il rewind produce, ed e' l'unico modo di arrivarci.** Una
    // mensile ancorata al 25 e riportata a inizio 1 febbraio: prima di questa
    // riga l'elenco diceva "ogni mese" e il 25 non compariva da nessuna parte,
    // pur decidendo quando escono 900 € al mese.
    const nota = fixedLineNote(
      makeRule({ startDate: '2026-02-01', cadence: 'monthly', anchorDay: 25, amountCents: 90_000 }),
    )
    expect(nota).toBe('ogni mese, il giorno 25')

    setLanguage('en')
    expect(
      fixedLineNote(
        makeRule({
          startDate: '2026-02-01',
          cadence: 'monthly',
          anchorDay: 25,
          amountCents: 90_000,
        }),
      ),
    ).toBe('every month, on day 25')
    setLanguage('it')
  })

  it('una settimanale non si inventa nessun giorno del mese: non ne ha uno', () => {
    const nota = fixedLineNote(
      makeRule({ startDate: '2026-01-01', amountCents: 43_481, cadence: 'weekly' }),
    )
    expect(nota).toContain('ogni settimana')
    expect(nota).not.toContain('giorno')
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

/* ------------------------------------------------------------------------- *
 * Spostare indietro la data d'inizio (ADR 018)
 * ------------------------------------------------------------------------- */

/**
 * L'anteprima di un riavvolgimento, dalla stessa strada che percorre il foglio:
 * `rewindDraft` -> `previewMaterialization` -> `rewindCopy`.
 *
 * I numeri si ricopiano **campo per campo** invece di passare l'esito intero, e
 * non e' pignoleria: e' la stessa separazione di `preview()` qui sopra. Cio' che
 * si mostra non porta con se' il permesso di scrivere, e la firma di
 * `rewindCopy` non lo accetta nemmeno.
 */
function rewindOf(rule: RecurringRule, nuovaData: IsoDate, giorno: IsoDate = OGGI) {
  const result = previewMaterialization(rewindDraft(rule, nuovaData), giorno, NO_OCCURRENCES)
  if (!result.ok) throw new Error(`anteprima rifiutata: ${result.reason}`)
  return {
    result,
    copy: rewindCopy(
      {
        count: result.count,
        firstDate: result.firstDate,
        lastDate: result.lastDate,
        totalCents: result.totalCents,
        nextDate: result.nextDate,
        backdated: result.backdated,
      },
      nuovaData,
      giorno,
    ),
  }
}

describe('la bozza del riavvolgimento', () => {
  it('e quella di una regola appena creata con quella data: nessun segnaposto', () => {
    // E' il punto di ADR 018 dopo la correzione. Con il segnaposto dentro, la
    // finestra resterebbe chiusa e non nascerebbe niente: e' il **no-op
    // silenzioso** che questa consegna chiude, e vive o muore in questa riga.
    const regola = makeRule({
      startDate: '2026-08-01',
      lastMaterializedDate: OGGI,
      amountCents: 90_000,
    })
    const bozza = rewindDraft(regola, '2026-01-01')
    expect(bozza.lastMaterializedDate).toBeUndefined()
    expect(Object.hasOwn(bozza, 'lastMaterializedDate')).toBe(false)
    expect(bozza.startDate).toBe('2026-01-01')
    // L'importo e' quello del **record**: la transazione ri-deriva la somma con
    // quello del disco, e un importo diverso qui darebbe `stale-preview`.
    expect(bozza.amountCents).toBe(90_000)
  })

  it('l ancora mensile e quella scritta nel record, non il giorno della data nuova', () => {
    // ADR 020. Retrodatare una regola "il 1 del mese" al 23 giugno non la
    // trasforma in "il 23 del mese": le istanze gia' generate il 1 resterebbero
    // fuori calendario, con id deterministici che nessuna finestra ripropone.
    const regola = makeRule({ startDate: '2026-08-01', cadence: 'monthly', anchorDay: 1 })
    const bozza = rewindDraft(regola, '2026-06-23')
    expect(bozza.anchorDay).toBe(1)
    const { result } = rewindOf(regola, '2026-06-23')
    expect(result.firstDate).toBe('2026-07-01')
    expect(result.lastDate).toBe('2026-08-01')
  })

  it('una settimanale non si porta dietro nessuna ancora', () => {
    const bozza = rewindDraft(makeRule({ startDate: '2026-08-01', cadence: 'weekly' }), '2026-07-04')
    expect(bozza.cadence).toBe('weekly')
    expect(bozza.anchorDay).toBeUndefined()
  })

  it('la bozza porta solo cio che la regola ha: nessun campo inventato', () => {
    // Qui c'era "la data di fine viaggia, perche' restringe la finestra". Non
    // c'e' piu' niente da far viaggiare: `endDate` e' stata tagliata per zero
    // produttori, e un test che la costruiva a mano avrebbe tenuto in vita un
    // campo che nessuna schermata poteva scrivere.
    //
    // Cio' che resta e' la proprieta' che conta: la bozza del rewind e'
    // **esattamente** quella di una regola appena creata con quella data —
    // stesso ramo di `materializationWindow`, quindi niente da verificare caso
    // per caso.
    const bozza = rewindDraft(
      makeRule({ startDate: '2026-08-01', cadence: 'monthly', anchorDay: 1 }),
      '2026-01-01',
    )
    expect(Object.keys(bozza).sort()).toEqual([
      'amountCents',
      'anchorDay',
      'cadence',
      'interval',
      'startDate',
    ])
  })
})

describe('cosa dice il riavvolgimento prima di scrivere', () => {
  it('il caso vero: l affitto partito a gennaio dice 8 spese, le date e il totale', () => {
    // I tre numeri che l'utente deve vedere prima di confermare una scrittura in
    // blocco su dati veri: quante, da quando a quando, quanto in tutto.
    const regola = makeRule({
      startDate: '2026-08-01',
      anchorDay: 1,
      amountCents: 90_000,
      lastMaterializedDate: OGGI,
    })
    const { result, copy } = rewindOf(regola, '2026-01-01')
    expect(result.count).toBe(8)
    expect(copy.text).toContain('8 spese')
    expect(copy.text).toContain('1 gennaio')
    expect(copy.text).toContain('1 agosto')
    expect(copy.text).toContain('7200,00')
    // Il bottone dice cosa scrive, e la casella pure: sono i due bersagli che si
    // attraversano per arrivare alla scrittura.
    expect(copy.confirmLabel).toContain('8')
    expect(copy.saveLabel).toContain('8')
    expect(copy.saveLabel).toContain('7200,00')
  })

  it('una sola spesa arretrata non si scrive "1 spese"', () => {
    // Il 15 luglio e non il 1: cosi' la finestra riaperta contiene un solo
    // primo-del-mese (il 1 agosto), che e' il caso a uno.
    const regola = makeRule({ startDate: '2026-08-01', anchorDay: 1, amountCents: 90_000 })
    const { result, copy } = rewindOf(regola, '2026-07-15')
    expect(result.count).toBe(1)
    expect(copy.text).toContain('1 spesa arretrata')
    expect(norm(copy.saveLabel)).toBe('Crea 1 spesa · 900,00 €')
  })

  it('niente da creare nel passato: la data si sposta, e la frase lo dice', () => {
    // Una regola che non ha ancora cominciato, retrodatata a un giorno che e'
    // ancora nel futuro. `count: 0` e' legittimo, e "0 spese" non e' una frase.
    // Senza questo ramo il piede resterebbe muto proprio dove serve dire che
    // qualcosa **e'** cambiato.
    const regola = makeRule({ startDate: '2026-10-01', anchorDay: 1 })
    const { result, copy } = rewindOf(regola, '2026-09-01')
    expect(result.count).toBe(0)
    expect(copy.text).toContain('1 settembre')
    // Niente da confermare: una casella che compare sempre smette di essere
    // letta, ed e' questo ramo a tenerla onesta.
    expect(copy.confirmLabel).toBeNull()
    expect(copy.saveLabel).toBe('Sposta la data d’inizio')
  })

  it('la spesa di oggi non e "arretrata": e il solo caso di count>0 senza arretrato', () => {
    // Una regola che parte domani riportata a oggi. Chiamarla arretrata sarebbe
    // falso di un giorno, e il giorno singolo e' proprio cio' che questa
    // operazione esiste per correggere.
    const domani = '2026-08-20'
    const regola = makeRule({ startDate: domani, cadence: 'daily', amountCents: 1200 })
    const { result, copy } = rewindOf(regola, OGGI)
    expect(result.count).toBe(1)
    expect(result.backdated).toBe(false)
    expect(norm(copy.text)).toBe('Crea la spesa di oggi: 12,00 €.')
    expect(copy.confirmLabel).toBe('Crea anche la spesa di oggi')
    expect(copy.saveLabel).toContain('12,00')
  })

  it('le stesse frasi esistono in inglese, e non sono le italiane', () => {
    setLanguage('en')
    const regola = makeRule({ startDate: '2026-08-01', anchorDay: 1, amountCents: 90_000 })
    const arretrato = rewindOf(regola, '2026-01-01').copy
    expect(arretrato.text).toContain('8 past expenses')
    expect(arretrato.confirmLabel).toContain('8')
    const nulla = rewindOf(makeRule({ startDate: '2026-10-01', anchorDay: 1 }), '2026-09-01').copy
    expect(nulla.text).toContain('Nothing to create in the past')
    expect(nulla.saveLabel).toBe('Move the start date')
    setLanguage('it')
  })
})

describe('quando il riavvolgimento dice di no', () => {
  it('la mezzanotte: la stessa frase dell altra porta, perche e lo stesso fatto', () => {
    const testo = rewindRefusalText(
      {
        ok: false,
        reason: 'stale-preview',
        stale: { staleness: 'day', previewedOn: '2026-08-18', today: OGGI },
      },
      OGGI,
    )
    expect(testo).toContain('ieri')
    expect(testo).toContain('ricontrolla e conferma')
  })

  it('l impronta cambiata dice di rifare, e non cita nessun numero', () => {
    // `announced` e `actual` sono due impronte, e la seconda e' gia' quella che
    // si legge nel piede: un numero nel messaggio sarebbe un numero da
    // riconciliare con lo schermo.
    const testo = rewindRefusalText(
      {
        ok: false,
        reason: 'stale-preview',
        stale: {
          staleness: 'footprint',
          announced: { count: 8, totalCents: 720_000, firstDate: '2026-01-01', lastDate: '2026-08-01' },
          actual: { count: 8, totalCents: 736_000, firstDate: '2026-01-01', lastDate: '2026-08-01' },
        },
      },
      OGGI,
    )
    expect(testo).toContain('è cambiata')
    expect(testo).toContain('ricontrolla e conferma')
    expect(testo).not.toMatch(/\d/)
  })

  it('il verso sbagliato porta tutte e due le date, e dice cosa fare', () => {
    const testo = rewindRefusalText(
      { ok: false, reason: 'not-earlier', startDate: '2026-09-01', currentStartDate: '2026-08-01' },
      OGGI,
    )
    expect(testo).toContain('1 settembre')
    expect(testo).toContain('1 agosto')
    expect(testo).toContain('Scegline un’altra')
  })

  it('un record che non si legge non si sposta, e non si mostra il messaggio del core', () => {
    // `validateRule` risponde con una stringa da log ("anchorDay non valido:
    // 44"): a chi non ha scritto quel record a mano non dice niente.
    const testo = rewindRefusalText(
      { ok: false, reason: 'invalid', message: 'anchorDay non valido: 44' },
      OGGI,
    )
    expect(testo).not.toContain('anchorDay')
    expect(testo).toContain('non torna')
  })

  it('la regola sparita riusa la frase che esiste: non c e niente da riconfermare', () => {
    const testo = rewindRefusalText({ ok: false, reason: 'unknown' }, OGGI)
    expect(testo).toContain('non c’è più')
    expect(testo).not.toContain('conferma')
  })

  it('i quattro rifiuti esistono in inglese', () => {
    setLanguage('en')
    expect(
      rewindRefusalText(
        { ok: false, reason: 'not-earlier', startDate: '2026-09-01', currentStartDate: '2026-08-01' },
        OGGI,
      ),
    ).toContain('Pick another day')
    expect(
      rewindRefusalText({ ok: false, reason: 'invalid', message: 'x' }, OGGI),
    ).toContain('does not add up')
    expect(
      rewindRefusalText(
        {
          ok: false,
          reason: 'stale-preview',
          stale: {
            staleness: 'footprint',
            announced: { count: 1, totalCents: 1, firstDate: null, lastDate: null },
            actual: { count: 2, totalCents: 2, firstDate: null, lastDate: null },
          },
        },
        OGGI,
      ),
    ).toContain('changed in the meantime')
    expect(rewindRefusalText({ ok: false, reason: 'unknown' }, OGGI)).toContain('gone')
    setLanguage('it')
  })
})
