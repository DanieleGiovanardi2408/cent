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
