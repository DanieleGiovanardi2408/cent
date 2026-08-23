/**
 * Il cancello: fuori da standalone, Cent non scrive niente (ADR 011).
 *
 * ## Il fatto da cui nasce
 *
 * Su iOS lo storage di Safari e quello della web app installata sono **sandbox
 * separate**. Non e' un'ipotesi: e' stato provato sul telefono. Una spesa
 * inserita nel browser e' invisibile all'app installata — sono due database
 * diversi — **e** cancellabile da WebKit dopo sette giorni senza interazione,
 * perche' quella policy vale per i siti e non per le app installate.
 *
 * Sono due modi di perdere dati, non uno. Da qui la decisione: **impedire, non
 * sconsigliare**. Fuori da standalone l'app non e' una versione ridotta, e' una
 * pagina di installazione — nessun FAB, nessun tastierino, nessun percorso che
 * scriva, database mai aperto.
 *
 * ## Le due condizioni, e perche' sono due
 *
 * 1. `navigator.standalone` esiste **solo** su Safari iOS ed e' l'unico segnale
 *    affidabile li'.
 * 2. `matchMedia('(display-mode: standalone)')` e' lo standard, e copre tutto il
 *    resto (Chrome, Edge, Android).
 *
 * Da soli coprono insiemi diversi: usarne uno solo significherebbe o bloccare la
 * PWA installata su Android, o lasciar passare Safari iOS — cioe' proprio il
 * caso per cui il cancello esiste.
 *
 * ## Il cancello non vale in sviluppo
 *
 * Si applica **all'origine di produzione**, non ovunque: sul dev server il
 * browser e' l'unico modo di lavorare sull'app, e bloccarlo li' renderebbe il
 * progetto non sviluppabile.
 *
 * La distinzione **non e' l'hostname**. `vite preview` serve la build di
 * produzione su `localhost`, ed e' la stessa build che finisce su GitHub Pages:
 * esentare `localhost` significherebbe che il codice piu' provato dell'app —
 * quello che gira nei test end-to-end — non e' quello che gira sul telefono. La
 * distinzione e' fra **build di sviluppo** (`import.meta.env.DEV`, cioe' il dev
 * server) e build di produzione, piu' il contesto non sicuro:
 *
 * - `http://` da rete locale — il modo in cui l'app viene provata dal telefono
 *   mentre la si scrive — non e' un contesto sicuro. Li' il service worker non
 *   si registra nemmeno, quindi installare e' impossibile e una pagina che
 *   chiede di installare sarebbe un vicolo cieco. Il segnale resta la banda
 *   "non su HTTPS" che l'app mostra gia'.
 * - L'origine di produzione e' https, quindi il cancello e' sempre attivo li'.
 *
 * Conseguenza voluta sui test: `vite preview` **e'** produzione, quindi i test
 * end-to-end incontrano il cancello come lo incontra un telefono. Non c'e'
 * un'eccezione per loro nel codice di produzione: sono i test a dichiarare il
 * proprio contesto (`tests/e2e/installed.ts`), che e' la cucitura giusta —
 * quella nello strato di composizione, non dentro la regola.
 */

/** I tre fatti d'ambiente da cui dipende il cancello. Nient'altro. */
export interface DisplayContext {
  /** L'app gira come applicazione a se' (Home Screen iOS, PWA installata). */
  readonly standalone: boolean
  /** Build del dev server (`import.meta.env.DEV`), non quella di produzione. */
  readonly developmentBuild: boolean
  /** `window.isSecureContext`: falso su `http://` da rete locale. */
  readonly secureContext: boolean
}

/**
 * True se questo contesto **non deve poter scrivere**, cioe' se al posto
 * dell'app va mostrata la pagina di installazione.
 *
 * E' una funzione pura e prende i suoi fatti come argomenti: cosi' i quattro
 * casi che contano si provano in node, senza browser e senza finti globali.
 */
export function writesAreBlocked(context: DisplayContext): boolean {
  if (context.standalone) return false
  if (context.developmentBuild) return false
  if (!context.secureContext) return false
  return true
}

/** True se l'app gira come applicazione a se'. Le due sonde, non una. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  // `navigator.standalone` esiste solo su Safari iOS e non e' nel lib DOM.
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone
  return legacy === true || window.matchMedia('(display-mode: standalone)').matches
}

/**
 * Legge l'ambiente una volta sola, all'avvio.
 *
 * Non si riosserva a ogni render, e non e' una svista: passare da browser a
 * standalone significa aprire l'app dalla schermata Home, cioe' un documento
 * nuovo. Un `matchMedia` con listener sorveglierebbe una transizione che su iOS
 * non esiste, al prezzo di una schermata che puo' cambiare identita' sotto le
 * dita.
 */
export function readDisplayContext(): DisplayContext {
  return {
    standalone: isStandaloneDisplay(),
    developmentBuild: import.meta.env.DEV,
    secureContext: typeof window !== 'undefined' && window.isSecureContext,
  }
}
