# ADR 005 — Aggiornamento del service worker: 'prompt', non 'autoUpdate'

Data: 2026-08-22
Stato: accettata

## Contesto

`vite-plugin-pwa` offre due strategie di aggiornamento. `autoUpdate` era la
scelta iniziale, presa per default e senza discussione.

Con `autoUpdate` il service worker generato contiene `skipWaiting()` e
`clientsClaim()`, e il codice client registra:

    addEventListener('activated', e =>
      (e.isUpdate || e.isExternal) && window.location.reload())

Cioe': appena il browser scarica e attiva una nuova versione del SW, la pagina
si ricarica. Senza chiedere, senza sapere cosa stia succedendo nella UI.

## Decisione

`registerType: 'prompt'`. L'aggiornamento viene segnalato con un avviso
discreto e applicato solo quando l'utente lo tocca.

## Motivazione

Lo scenario concreto: pubblichi una versione alle 18:00. Alle 19:30, al
ristorante, apri l'app da Home Screen. Parte dalla cache vecchia, tocchi il FAB
e digiti `12,50`. Nel frattempo il browser scarica il nuovo `sw.js`, lo installa,
`skipWaiting` lo attiva, la pagina si ricarica. Il bottom sheet sparisce e
l'importo digitato non e' mai esistito.

E' l'unico percorso di perdita di dati presente nel codice, e contraddice
frontalmente la regola "ogni azione distruttiva e' annullabile": l'unica azione
non annullabile sarebbe quella che l'utente non ha nemmeno chiesto.

## Cosa questa decisione NON risolve

Il reload del SW e' **un** modo in cui l'app puo' morire a meta' di una
scrittura, non l'unico. iOS termina le web app in background, l'utente fa swipe
via dallo switcher, la batteria finisce.

Quindi la materializzazione delle ricorrenze deve essere idempotente e
interrompibile **a prescindere** da questa ADR. Questo documento toglie un
innesco, non il requisito. Chi legge questa ADR mentre progetta il data layer
non deve trarne la conclusione che il problema sia risolto.

## Attenzione a chi fara' grep sul bundle

Nel bundle di produzione **restano due `location.reload()` e la stringa
`skipWaiting`**, e nessuno dei tre e' un bug.

- `dist/sw.js` contiene `self.skipWaiting()` una volta sola, dentro un listener
  `message` che risponde a `{ type: 'SKIP_WAITING' }`. E' il meccanismo con cui
  il tap sull'avviso applica l'aggiornamento: senza, il worker nuovo resterebbe
  in attesa per sempre. Non c'e' nessun `skipWaiting()` di primo livello e
  nessun `clientsClaim()` — quelli sarebbero il sintomo di `autoUpdate`.
- Il chunk client contiene ancora il ramo di `autoUpdate`:
  `addEventListener('activated', e => (e.isUpdate || e.isExternal) && location.reload())`.
  E' **codice morto a runtime**: e' dietro un flag che vale `false`.
  `vite-plugin-pwa` compila la strategia come confronto fra stringhe
  (`Te = Ce === 'true'`), quindi esbuild non piega la costante e non elimina il
  ramo. Sopravvive a una grep ingenua pur non potendo mai eseguire.
- Il secondo `location.reload()` e' quello vivo, dietro l'evento `controlling`,
  che puo' scattare solo dopo che il nostro messaggio ha attivato il worker.

Come verificare che la strategia sia ancora quella giusta, senza fidarsi della
grep: cercare `clientsClaim` in `dist/sw.js`. Se compare, si e' tornati ad
`autoUpdate` e vale di nuovo lo scenario del ristorante descritto sopra.

Nota su `vite-plugin-pwa@1.3.0`: `updateSW(reloadPage)` **ignora il proprio
argomento**; il ricaricamento e' pilotato dal listener `controlling`. Chi si
aspettasse che `updateSW(false)` eviti il reload resterebbe deluso.

## Conseguenze

- Serve un elemento di UI per l'avviso di aggiornamento. Deve essere discreto e
  non deve mai coprire il FAB ne' il tastierino.
- Un utente che ignora l'avviso resta su una versione vecchia finche' non lo
  tocca. E' accettabile: l'app e' single-user, offline, senza backend con cui
  restare compatibile. Non esiste un aggiornamento "urgente" da forzare.
