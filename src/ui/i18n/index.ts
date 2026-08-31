/**
 * Due lingue, nessuna libreria.
 *
 * ## Perche' non c'e' una libreria
 *
 * Il budget e' 60 KB gzip e siamo intorno ai 29. Una libreria di i18n — ICU
 * MessageFormat, plurali, contesti, caricamento pigro dei bundle — costerebbe
 * piu' di tutto il resto dell'app messo insieme, per risolvere un problema che
 * qui ha due lingue, due regole di plurale identiche e nessun genere
 * grammaticale in gioco. Quello che serve davvero e' un oggetto, una
 * sostituzione di segnaposto e il compilatore.
 *
 * ## La parita' delle chiavi e' del compilatore
 *
 * `it.ts` e' la fonte delle chiavi; `en.ts` e' `Record<keyof typeof it, string>`.
 * Una chiave mancante o di troppo e' un errore di `tsc`, non un test rosso — e
 * nemmeno una stringa italiana che spunta in mezzo all'inglese, che e' il modo
 * in cui questa classe di bug arriva in produzione (sembra un refuso, quindi
 * nessuno la segnala come difetto).
 *
 * ## Perche' lo stato e' un modulo e non un contesto Preact
 *
 * La lingua attiva non e' stato di un sottoalbero: e' un fatto globale, come il
 * fuso orario. Un contesto avrebbe imposto `useContext` in ogni componente e
 * avrebbe reso **impossibile** usare `t()` dalle funzioni pure che compongono le
 * frasi della Home (`budget-view.ts`), che non sono componenti e non devono
 * diventarlo per poter dire "Restano".
 *
 * Il rischio del singleton — cambiare lingua e non ridipingere — qui non esiste:
 * la lingua vive in `Settings`, quindi cambiarla passa dal mirror del
 * repository, e `App` si ridipinge dalla radice a ogni sua notifica. E' `App` a
 * chiamare `setLanguage()` in cima al proprio render, prima di qualunque figlio.
 *
 * ## Il locale non e' la lingua
 *
 * `it -> it-IT`, `en -> en-GB`. Non `en-US`: gli utenti sono ad Amsterdam, in
 * euro, e `en-US` scriverebbe `8/23/2026`. La lingua e' una scelta dell'utente,
 * il locale e' come si scrivono numeri e date in quella lingua **in questo
 * contesto** — sono due cose diverse e vanno tenute separate, o si finisce a
 * mostrare date americane a chi ha scelto l'inglese per capirsi con gli amici.
 */

import { assertCents } from '../../core/money'
import type { Cents } from '../../core/money'
import { addDays, fromIsoDate, toDateParts } from '../../core/date'
import type { IsoDate } from '../../core/date'
import type { PeriodRange } from '../../core/budget'
import type { BudgetPeriod, Cadence, Language } from '../../core/types'
import type { DefaultCategoryNames } from '../../core/defaults'
import { it } from './it'
import { en } from './en'

export type { Language }

/** Ogni chiave del dizionario. Sbagliarne una e' un errore di compilazione. */
export type Key = keyof typeof it

const DICTIONARIES: Record<Language, Record<Key, string>> = { it, en }

/** La lingua scritta nella propria lingua: quello che si legge nel selettore. */
export const LANGUAGE_NAMES: Record<Language, Key> = {
  it: 'settings.language.it',
  en: 'settings.language.en',
}

const LOCALES: Record<Language, string> = { it: 'it-IT', en: 'en-GB' }

/**
 * I formatter di un locale, costruiti una volta sola.
 *
 * `Intl.DateTimeFormat` costa qualche millisecondo a istanziarlo: nello Storico
 * con 5.000 spese verrebbe istanziato una volta per giorno visibile. Erano gia'
 * costruiti a livello di modulo in `labels.ts`; qui la differenza e' che sono
 * **due insiemi**, uno per lingua, creati pigramente e tenuti in cache — chi non
 * cambia mai lingua ne paga uno solo.
 */
interface Formats {
  readonly money: Intl.NumberFormat
  readonly rate: Intl.NumberFormat
  readonly dayLong: Intl.DateTimeFormat
  readonly dayWithYear: Intl.DateTimeFormat
  readonly dayShort: Intl.DateTimeFormat
  readonly monthLong: Intl.DateTimeFormat
  readonly weekdayLong: Intl.DateTimeFormat
  readonly weekdayShort: Intl.DateTimeFormat
  readonly dayAndMonth: Intl.DateTimeFormat
}

function buildFormats(locale: string): Formats {
  return {
    money: new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    /* I ritmi, all'euro intero. **Non e' `money` con altre opzioni**: e' un
     * secondo formato perche' sono due cose diverse — un fatto e una guida — e
     * l'argomento sta su `rate()`. Zero decimali in tutte e due le direzioni,
     * cosi' `36 €` non diventa `36,00 €` in un locale e `36` in un altro. */
    rate: new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
    dayLong: new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    dayWithYear: new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    dayShort: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }),
    monthLong: new Intl.DateTimeFormat(locale, { month: 'long' }),
    weekdayShort: new Intl.DateTimeFormat(locale, { weekday: 'short' }),
    weekdayLong: new Intl.DateTimeFormat(locale, { weekday: 'long' }),
    dayAndMonth: new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }),
  }
}

const cache = new Map<Language, Formats>()

function formatsOf(language: Language): Formats {
  const hit = cache.get(language)
  if (hit !== undefined) return hit
  const built = buildFormats(LOCALES[language])
  cache.set(language, built)
  return built
}

/* ------------------------------------------------------------------------- *
 * La lingua attiva.
 * ------------------------------------------------------------------------- */

let active: Language = 'en'
let dictionary: Record<Key, string> = en
let formats: Formats = formatsOf('en')

/**
 * La lingua dell'ambiente.
 *
 * **Inglese salvo prova contraria**, e non e' un default pigro: la lingua
 * condivisa di un gruppo Erasmus e' l'inglese, quindi chi ha il telefono in
 * neerlandese, spagnolo o tedesco e' servito meglio dall'inglese che
 * dall'italiano. L'italiano si sceglie quando il telefono lo dice.
 *
 * Si guardano **tutte** le lingue preferite, non solo la prima: chi ha il
 * telefono in inglese con l'italiano subito dopo sta dichiarando di capire
 * l'italiano, ma ha chiesto l'inglese per primo — quindi vince l'ordine, e la
 * scansione si ferma alla prima che sappiamo parlare.
 */
export function detectLanguage(): Language {
  if (typeof navigator === 'undefined') return 'en'
  const preferred: readonly string[] =
    navigator.languages !== undefined && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language]
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split('-')[0]
    if (primary === 'it') return 'it'
    if (primary === 'en') return 'en'
  }
  return 'en'
}

/**
 * Da "cosa c'e' scritto in Settings" a "che lingua si dipinge".
 *
 * `undefined` non significa italiano e non significa inglese: significa
 * **nessuno l'ha scelta**, e allora si ridecide dall'ambiente a ogni avvio. E'
 * il contratto di `Settings.language` (vedi `types.ts`), ed e' il motivo per cui
 * il selettore ha tre voci e non due: senza una voce "Automatica", toccare la
 * lingua gia' mostrata come attiva scriverebbe nel database una decisione che
 * l'utente non ha preso.
 */
export function resolveLanguage(chosen: Language | undefined): Language {
  return chosen ?? detectLanguage()
}

/** La lingua che si sta dipingendo adesso. */
export function currentLanguage(): Language {
  return active
}

/**
 * Cambia la lingua attiva. Idempotente: chiamarla col valore corrente non fa
 * niente, ed e' per questo che `App` puo' chiamarla a ogni render.
 *
 * Aggiorna anche `<html lang>` e il titolo del documento, che sono le due cose
 * che il DOM tiene fuori dall'albero di Preact: la prima decide come le
 * tecnologie assistive pronunciano ogni parola della pagina, la seconda e' il
 * nome che iOS mostra quando si condivide il link.
 */
export function setLanguage(language: Language): void {
  active = language
  dictionary = DICTIONARIES[language]
  formats = formatsOf(language)
  // Solo se cambia davvero: `App` chiama questa funzione a ogni render, e
  // riscrivere l'attributo produrrebbe una mutazione del DOM per ogni tap.
  // Il confronto e' con il DOM, non con una variabile: cosi' la primissima
  // chiamata allinea `<html lang>` anche quando coincide con `active`, che
  // parte da un valore qualunque e non e' ancora stato dipinto da nessuno.
  if (typeof document !== 'undefined' && document.documentElement.lang !== language) {
    document.documentElement.lang = language
    document.title = t('doc.title')
  }
}

/* ------------------------------------------------------------------------- *
 * Le stringhe.
 * ------------------------------------------------------------------------- */

/** Un valore da infilare in un segnaposto. Gia' formattato da chi chiama. */
export type Vars = Readonly<Record<string, string | number>>

/**
 * La stringa di `key` nella lingua attiva, con i `{segnaposto}` sostituiti.
 *
 * Non c'e' nessun ramo di ripiego per la chiave assente, e non e' una svista: il
 * tipo `Key` rende la chiave assente inesprimibile, quindi un `?? key` sarebbe
 * codice irraggiungibile che finge di essere una difesa. Se un giorno le chiavi
 * arrivassero da fuori — non succedera', i dizionari sono bundlati — quel giorno
 * si scriverebbe la difesa insieme alla porta che la rende necessaria.
 *
 * La sostituzione gira solo se la stringa contiene una graffa: la stragrande
 * maggioranza delle chiavi non ha segnaposto, e nello Storico `t()` viene
 * chiamata una volta per riga.
 */
export function t(key: Key, vars?: Vars): string {
  const text = dictionary[key]
  if (vars === undefined || !text.includes('{')) return text
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name]
    return value === undefined ? whole : String(value)
  })
}

/**
 * Gli otto nomi con cui scrivere le categorie di default, in una lingua.
 *
 * ## E' un seme, non un'etichetta
 *
 * Si chiama **una volta sola nella vita di un'installazione**, prima di
 * `openRepository` (`src/app/main.tsx`), e cio' che restituisce finisce sul
 * disco. Non e' testo che si ridipinge: da quel momento sono **dati
 * dell'utente**, e cambiare lingua non li ritraduce.
 *
 * ## Perche' prende la lingua invece di leggere quella attiva
 *
 * Perche' e' l'unica chiamata dell'app che non puo' permettersi di dipendere da
 * un `setLanguage()` fatto da qualcun altro prima. Il difetto che questa fase
 * chiude era esattamente questo: il seme girava dentro `openRepository`, cioe'
 * **prima che una lingua esistesse**. Un parametro obbligatorio sposta l'ordine
 * dalla disciplina alla firma — chi la chiama ha gia' in mano una `Language`,
 * o non compila.
 *
 * Il `Record` completo lo pretende `src/core/defaults.ts`, ed e' la seconda
 * meta' della stessa idea: dimenticare una chiave e' un errore di
 * compilazione, e scambiare "Sigarette" con "Trasporti" — che con otto
 * stringhe in fila compilerebbe — e' inesprimibile.
 */
export function defaultCategoryNames(language: Language): DefaultCategoryNames {
  const dict = DICTIONARIES[language]
  return {
    groceries: dict['cat.default.groceries'],
    eatingOut: dict['cat.default.eatingOut'],
    coffeeshop: dict['cat.default.coffeeshop'],
    cigarettes: dict['cat.default.cigarettes'],
    transport: dict['cat.default.transport'],
    leisure: dict['cat.default.leisure'],
    home: dict['cat.default.home'],
    extra: dict['cat.default.extra'],
  }
}

/**
 * La stessa chiave in **tutte** le lingue, nell'ordine dei dizionari.
 *
 * Serve a una cosa sola, e non e' la traduzione: **riservare alle etichette del
 * guscio la larghezza massima fra le due lingue** (vedi `Fit.tsx`).
 *
 * Il guscio si dipinge prima che il database sia aperto (regola "Ordine di
 * pittura"), quindi chi ha scelto una lingua diversa da quella del telefono
 * vede per pochi frame le parole della lingua rilevata. Il difetto misurabile
 * non e' il cambio di parole — e' che "Storico" e "History" sono larghi
 * diversamente, e le schede si spostano quando i dati arrivano: CLS > 0 in un
 * caso che nessun test guardava.
 *
 * La cura e' deterministica e non introduce nessuna seconda fonte di verita':
 * si mettono nel DOM tutte le varianti, sovrapposte nella stessa cella, e si
 * rende visibile solo quella attiva. La larghezza la calcola il browser, che e'
 * l'unico a sapere quanto misura una parola con il font di sistema di questo
 * telefono.
 */
export function variants(key: Key): readonly string[] {
  return Object.values(DICTIONARIES).map((entry) => entry[key])
}

/* ------------------------------------------------------------------------- *
 * I numeri e le date.
 *
 * Stavano in `src/core/money.ts` e in `src/ui/labels.ts` con `it-IT` cablato.
 * Sono qui perche' e' qui che vive il locale attivo, e perche' formattare **e'**
 * tradurre: `1.234,56 €` e `€1,234.56` sono lo stesso intero detto in due
 * lingue, esattamente come "Restano" e "Left".
 * ------------------------------------------------------------------------- */

/**
 * Da centesimi a importo scritto: `1.234,56 €` in italiano, `€1,234.56` in
 * inglese. **La posizione del simbolo cambia con la lingua**, e non e' un
 * dettaglio da cablare: e' cio' che il locale sa e noi no.
 *
 * La divisione per 100 e' l'unico float del percorso: avviene dopo ogni calcolo,
 * su un intero gia' verificato da `assertCents`, e Intl arrotonda comunque a due
 * decimali.
 *
 * L'export CSV (fase 7) NON deve usare questa funzione ne' averne una variante
 * "senza simbolo": in italiano la virgola decimale dentro un CSV separato da
 * virgole spacca il campo, e in inglese le migliaia fanno lo stesso. Per il CSV
 * resta `(cents / 100).toFixed(2)`, che non dipende dal locale — e non deve.
 */
/**
 * **Un ritmo, arrotondato all'euro intero.**
 *
 * La distinzione e' una regola e non una preferenza, e va letta cosi':
 *
 * - **Un importo registrato si scrive al centesimo, sempre.** E' una cosa che
 *   e' successa: 42,00 € sono quarantadue euro, e nasconderne i centesimi
 *   vorrebbe dire riscrivere un fatto.
 * - **Un ritmo derivato si scrive all'euro.** *"Al giorno: 36 €"* non e' un
 *   importo, e' una **guida**: viene da una divisione (budget su giorni) e le
 *   sue ultime due cifre non significano niente. `~35,71 €` fingeva una
 *   precisione che nessuno usa, e il `~` la confessava — ma un tilde e'
 *   notazione da programmatore, non lingua.
 *
 * Il criterio, per il prossimo numero dubbio: **se il numero e' stato scritto da
 * qualcuno, centesimi; se e' il risultato di una divisione fatta dall'app,
 * euro.**
 *
 * `Math.round` e non un troncamento: 35,71 € al giorno diventa 36 e non 35, ed e'
 * il verso onesto — arrotondare per difetto darebbe una guida piu' generosa del
 * budget che la produce.
 */
export function rate(cents: Cents): string {
  assertCents(cents)
  return formats.rate.format(Math.round(cents / 100))
}

export function money(cents: Cents): string {
  assertCents(cents)
  return formats.money.format(cents / 100)
}

/**
 * Lo stesso importo, **in parti**: `integer`, `decimal`, `fraction`, `currency`,
 * `literal`. E' `money()` senza la concatenazione finale.
 *
 * Serve a una cosa sola, ed e' la ragione per cui esiste invece di essere una
 * `split` su `money()`: **la guida anima l'importo che si riempie da destra, e
 * l'animazione va ancorata alle parti, non ai glifi.**
 *
 * Il fatto che lo impone e' stato verificato, non supposto: `it-IT` scrive
 * `0,05 €` e `en-GB` scrive `€0.05` — **il simbolo cambia lato**, e l'inglese e'
 * la lingua di default. Un'animazione scritta sulla stringa farebbe scorrere le
 * cifre sotto il simbolo dell'euro in una delle due lingue, e nessuno se ne
 * accorgerebbe finche' non apre l'app in inglese.
 *
 * Con le parti l'invariante e' dichiarabile: la cella `decimal` e' l'ancora, la
 * `currency` sta ferma dove il locale l'ha messa, e le cifre si muovono solo
 * dentro `integer` e `fraction`. Vedi `Guide.tsx`.
 */
export function moneyParts(cents: Cents): readonly Intl.NumberFormatPart[] {
  assertCents(cents)
  return formats.money.formatToParts(cents / 100)
}

/**
 * Le parti di un importo, ridotte ai **cinque ruoli** che l'interfaccia
 * distingue davvero.
 *
 * `Intl` ne produce di piu' (`group`, `literal`, `minusSign`, e domani altri):
 * chi disegna un importo non deve conoscerle tutte, deve sapere una cosa sola
 * per ogni pezzo — **e' inchiostro che varia con la magnitudine, oppure sta
 * fermo?** Le cifre di `integer` e `fraction` variano; il separatore decimale,
 * il simbolo e tutto il resto stanno fermi dove il locale li ha messi.
 *
 * ## Perche' una funzione sola per due schermate
 *
 * La usano la guida (`Guide.tsx`, che spezza `integer` e `fraction` cifra per
 * cifra per animarle) e il foglio d'inserimento (`AddSheet.tsx`, che
 * rimpicciolisce `decimal` e `fraction`). Sono due usi diversi della **stessa**
 * classificazione, e la classificazione e' la parte che si sbaglia: in `it-IT`
 * il simbolo sta in coda (`0,05 €`), in `en-GB` in testa (`€0.05`). Due copie
 * avrebbero potuto divergere proprio li', cioe' nella lingua di default, che e'
 * anche quella in cui nessuno di noi rilegge.
 *
 * `group` finisce fra i fermi insieme al resto: il separatore delle migliaia
 * compare solo sopra i mille e non e' un'ancora, ma non e' nemmeno una cifra —
 * rimpicciolirlo o animarlo lo staccherebbe dal numero di cui fa parte.
 */
export type AmountCellKind = 'integer' | 'decimal' | 'fraction' | 'currency' | 'gap'

export interface AmountCell {
  readonly kind: AmountCellKind
  readonly text: string
}

export function amountCells(cents: Cents): readonly AmountCell[] {
  return moneyParts(cents).map((part) => ({
    kind:
      part.type === 'integer' || part.type === 'fraction' || part.type === 'decimal'
        ? part.type
        : part.type === 'currency'
          ? 'currency'
          : 'gap',
    text: part.value,
  }))
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * L'intestazione di un giorno nello Storico. "Oggi" e "Ieri" per esteso: sono
 * le due righe che si leggono ogni giorno, e una data numerica costringerebbe a
 * fare il conto ogni volta.
 *
 * Il `capitalize` serve all'italiano, dove `lunedì 17 agosto` esce minuscolo, e
 * non fa danni all'inglese, dove `Monday 17 August` e' gia' maiuscolo.
 */
export function dayHeading(date: IsoDate, todayIso: IsoDate): string {
  if (date === todayIso) return t('day.today')
  if (date === addDays(todayIso, -1)) return t('day.yesterday')
  const sameYear = toDateParts(date).year === toDateParts(todayIso).year
  const formatter = sameYear ? formats.dayLong : formats.dayWithYear
  return capitalize(formatter.format(fromIsoDate(date)))
}

/** Forma corta per il chip della data: `18 ago`, `18 Aug`. */
export function dayChipLabel(date: IsoDate): string {
  return formats.dayShort.format(fromIsoDate(date))
}

/**
 * Il periodo della Home in due parole: "Questa settimana", "This month".
 *
 * Non "Settimana corrente": la Home si legge in piedi, e "questa" e' la parola
 * che si usa parlando.
 */
export function periodName(period: BudgetPeriod): string {
  return t(period === 'weekly' ? 'period.weekly' : 'period.monthly')
}

/**
 * L'estensione del periodo: `18–24 ago` per la settimana, `agosto` per il mese.
 *
 * `formatRange` fonde le parti uguali (`18–24 ago` invece di `18 ago – 24 ago`)
 * e a cavallo di due mesi le riapre da solo (`31 ago – 6 set`). E' la stessa
 * differenza che farebbe una persona scrivendolo a mano, in tutte e due le
 * lingue: come si fonde un intervallo lo sa il locale.
 */
export function periodRangeLabel(period: BudgetPeriod, range: PeriodRange): string {
  if (period === 'monthly') return formats.monthLong.format(fromIsoDate(range.start))
  return formats.dayShort.formatRange(fromIsoDate(range.start), fromIsoDate(range.end))
}

/**
 * "da mercoledì" dentro una settimana, "dal 19 agosto" dentro un mese.
 *
 * Il giorno della settimana basta solo se il periodo e' la settimana: in un mese
 * ci sono quattro mercoledi' e "da mercoledì" non direbbe quale.
 *
 * La preposizione viene dal dizionario e non da chi compone la frase, perche' in
 * italiano cambia con la forma della data ("da mercoledì" ma "dal 19 agosto") e
 * sarebbe l'errore piu' facile da fare. In inglese e' "since" in entrambi i
 * casi: e' la lingua che distingue a dettare quante chiavi servono.
 */
export function fromDayLabel(period: BudgetPeriod, date: IsoDate): string {
  const at = fromIsoDate(date)
  return period === 'weekly'
    ? t('fromDay.weekly', { day: formats.weekdayLong.format(at) })
    : t('fromDay.monthly', { day: formats.dayAndMonth.format(at) })
}

/**
 * L'etichetta di una colonna della striscia dei sette giorni: `mer`, `Wed`.
 *
 * **`short` e non `narrow`, e la ragione e' la larghezza che c'e'.** `narrow`
 * darebbe `L M M G V S D` in italiano e `M T W T F S S` in inglese: in tutte e
 * due le lingue tre lettere su sette sono ambigue (M/M, T/T, S/S), e si
 * disambiguano solo contando le colonne da lunedi'. Un grafico che si legge
 * contando non risponde alla domanda per cui esiste — *in quale giorno parte la
 * mano* — perche' la risposta e' il nome di un giorno.
 *
 * Il conto della larghezza dice che non serve pagare quell'ambiguita': a 320
 * punti il passo di una colonna e' 41,1 px e `mer` a 13 px ne misura ~23,
 * `Wed` ~27. Ci sta con margine nella lingua peggiore delle due.
 */
export function weekdayShortLabel(date: IsoDate): string {
  return formats.weekdayShort.format(fromIsoDate(date))
}

/** `1 giorno` / `5 giorni`. Il singolare esiste ed e' il giorno che conta di piu'. */
export function daysLabel(days: number): string {
  return days === 1 ? t('days.one') : t('days.other', { count: days })
}

/** `a settimana` / `al mese`, la coda delle frasi sul budget. */
export function cadenceLabel(period: BudgetPeriod): string {
  return t(period === 'weekly' ? 'cadence.weekly' : 'cadence.monthly')
}

/* ------------------------------------------------------------------------- *
 * Le spese fisse (ADR 016).
 * ------------------------------------------------------------------------- */

/**
 * Ogni quanto scatta una regola: `ogni mese`, `ogni 2 settimane`.
 *
 * Sei chiavi e non una con tre segnaposto: `interval === 1` cambia la **forma**
 * della frase, non un numero dentro di essa. In italiano "ogni 1 mese" e' un
 * refuso, in inglese "every 1 month" pure, ed e' esattamente il caso piu'
 * comune — quello che l'interfaccia propone per prima.
 */
export function cadencePhrase(cadence: Cadence, interval: number): string {
  const one = interval === 1
  switch (cadence) {
    case 'daily':
      return one ? t('cad.daily.one') : t('cad.daily.other', { count: interval })
    case 'weekly':
      return one ? t('cad.weekly.one') : t('cad.weekly.other', { count: interval })
    case 'monthly':
      return one ? t('cad.monthly.one') : t('cad.monthly.other', { count: interval })
  }
}

/**
 * Un giorno per esteso: `1 gennaio`, `1 January`. Con l'anno se non e' quello
 * di `todayIso` — un affitto registrato da diciotto mesi ha una prima
 * occorrenza che senza anno e' indistinguibile da quella di quest'anno.
 */
export function fullDayLabel(date: IsoDate, todayIso: IsoDate): string {
  const sameYear = toDateParts(date).year === toDateParts(todayIso).year
  const formatter = sameYear ? formats.dayAndMonth : formats.dayWithYear
  return formatter.format(fromIsoDate(date))
}

/**
 * Due giorni come **intervallo**: `1 gennaio – 1 agosto`.
 *
 * ## Perche' non c'e' una preposizione
 *
 * Perche' in italiano non ce n'e' una sola: "dal 1 gennaio" e' giusto, "dal 8
 * agosto" no — si elide in "dall'8", e lo stesso vale per l'11. Sono due giorni
 * su trentuno, cioe' un errore di grammatica che compare **a volte**: la classe
 * peggiore, perche' passa indenne ogni rilettura fatta in un giorno qualsiasi.
 * Un intervallo scritto come intervallo non ha il problema, in nessuna delle
 * due lingue.
 *
 * ## Perche' **non** usa `formatRange`, che sarebbe la scelta ovvia
 *
 * Perche' su `{ day: 'numeric', month: 'long' }` in `it-IT` impagina i giorni a
 * due cifre: `formatRange` da' `01 gennaio – 01 agosto` dove `format` da'
 * `1 gennaio`. In `en-GB` no — li' e' `1 January – 1 August`. Cioe' lo zero
 * comparirebbe **solo in italiano e solo negli intervalli**, che e' esattamente
 * il difetto che nessuno vede finche' non apre l'app nell'altra lingua.
 * Verificato, non supposto: `Intl.DateTimeFormat('it-IT', {day:'numeric',
 * month:'long'}).formatRange(1 gen, 1 ago)` -> `'01 gennaio – 01 agosto'`.
 *
 * `periodRangeLabel` continua a usare `formatRange`, ed e' corretto: li' il
 * formato e' `dayShort`, che non ha questo comportamento, e la fusione
 * (`18–24 ago`) e' il punto.
 *
 * Il prezzo, dichiarato: qui le parti uguali **non** si fondono, quindi due
 * date dello stesso mese si scrivono per esteso (`1 agosto – 8 agosto`) invece
 * che `1 – 8 agosto`. E' piu' lungo di quattro caratteri e non e' mai
 * sbagliato.
 *
 * L'anno lo decide ciascuna delle due date per conto suo (`fullDayLabel`): un
 * intervallo a cavallo di capodanno lo porta dove serve, invece che su
 * entrambe o su nessuna.
 */
export function dayRangeLabel(from: IsoDate, to: IsoDate, todayIso: IsoDate): string {
  return `${fullDayLabel(from, todayIso)} – ${fullDayLabel(to, todayIso)}`
}
