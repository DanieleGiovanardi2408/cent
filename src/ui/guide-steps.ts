/**
 * I tre stati dell'importo della scheda 1 della guida, in centesimi:
 * `2 -> 0,02`, `23 -> 0,23`, `230 -> 2,30`.
 *
 * **Perche' 23 e non 5.** Il secondo stato e' `0,23`: e' l'errore che il
 * proprietario ha fatto due volte in sessanta secondi, e il sottotitolo della
 * scheda dice cosa digitare davvero per 23 euro. Cosi' l'animazione e il testo
 * raccontano **un caso solo** invece di due, e la scheda smette di insegnare la
 * meccanica senza mai mostrare l'errore che esiste per prevenire: il lettore
 * vede comparire `0,23` e legge la correzione nello stesso gesto.
 *
 * Sta in un modulo suo, senza JSX e **senza import di CSS**, per una ragione
 * concreta: `guide.spec.ts` costruisce l'atteso della tabella **derivandolo da
 * qui** invece di ricopiarne i valori, e importarlo da `Guide.tsx` trascinerebbe
 * i suoi `import './...css'`, che il transpiler dei test non sa leggere.
 *
 * Perche' derivarlo: prima le asserzioni scrivevano `'0,05 €'` a mano, cioe'
 * **codificavano la costante mentre ne controllavano un'altra**. Cambiare
 * l'esempio della guida le faceva cadere, e chi lo faceva credeva di aver rotto
 * qualcosa. E' la seconda volta in questo progetto, dopo il test del promemoria
 * che congelava la soglia unica.
 *
 * Sono tre perche' due non mostrerebbero il passaggio dell'unita' e quattro
 * sarebbero un esercizio. E hanno una proprieta' che il resto della scheda usa:
 * **tutti e tre producono lo stesso numero di cifre** (tre) e la stessa sequenza
 * di parti, in tutte e due le lingue — e' cio' che rende le celle stabili,
 * quindi l'ancora vera. Un quarto stato a quattro cifre la romperebbe.
 */
export const STEPS = [2, 23, 230] as const

/** Quanto resta a schermo ogni stato. Sotto il secondo non si legge. */
export const STEP_MS = 1300

/**
 * **Le schede della guida, in ordine, come dato.**
 *
 * Erano tre ternari annidati in `Guide.tsx` — `card === 0 ? … : card === 1 ? …`
 * — e il numero **tre** viveva scritto a mano in altri tre posti: il contatore
 * *"Passo {index} di 3"* nei due dizionari, e la didascalia in Impostazioni che
 * diceva *"le due cose che in Cent non si indovinano"* **quando le schede erano
 * gia' tre**.
 *
 * Quella didascalia e' rimasta falsa finche' qualcuno non l'ha letta a schermo:
 * nessuna misura poteva accorgersene, perche' era prosa che descriveva una
 * funzione senza essere legata alla funzione. **La prosa che descrive una
 * funzione e' parte della funzione**, e come il resto della funzione va
 * derivata, non ricordata.
 *
 * Da qui derivano: l'ordine di disegno, il denominatore del contatore, e
 * l'elenco dentro la didascalia. **Aggiungere una quarta scheda aggiorna tutti e
 * tre da solo** — e se qualcuno la aggiunge senza scriverne le chiavi, non
 * compila.
 *
 * Sta in questo modulo per la ragione gia' scritta sopra: niente JSX, niente
 * import di CSS, quindi lo possono leggere sia la UI sia i test.
 */
export const CARDS = ['amount', 'save', 'chart'] as const

/** Una scheda della guida. */
export type Card = (typeof CARDS)[number]
