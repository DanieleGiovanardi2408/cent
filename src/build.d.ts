/**
 * Le due costanti che `vite.config.ts` inietta al momento della build: quale
 * commit e di che giorno. Non sono variabili d'ambiente e non si leggono a
 * runtime — sono **sostituite nel bundle**, quindi costano zero byte di rete e
 * non possono mentire su una build diversa da quella che le contiene.
 *
 * Dichiarate qui perche' `tsc` le veda: un `define` di Vite e' invisibile al
 * compilatore, e senza questo file un `__COMMIT__` sarebbe un errore di
 * compilazione — oppure, peggio, un `any` che nessuno nota.
 */
declare const __COMMIT__: string
declare const __BUILD_DATE__: string
