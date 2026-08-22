# ADR 007 — Rilettura al risveglio, non lock e non BroadcastChannel

Data: 2026-08-22
Stato: accettata

## Contesto

Il repository tiene un mirror in memoria dell'intero dataset e serve alla UI
letture sincrone. Le scritture sono ottimistiche: il mirror cambia subito, il
disco poco dopo.

Due contesti aperti sullo stesso database rompono questo modello. Un contesto con
il mirror vecchio che scrive puo' annullare le modifiche dell'altro: la review
della fase 1 ha dimostrato che un contesto stantio riattiva una regola che
l'utente aveva disattivato, e che un'occorrenza cancellata puo' tornare viva e
poi essere riscritta sul disco.

**Due contesti non sono un caso di laboratorio.** Non serve nemmeno scomodare la
PWA: due schede Safari sullo stesso indirizzo condividono la stessa IndexedDB,
sempre. Su un telefono con decine di schede aperte lo scenario esiste comunque.
La verifica in ROADMAP su Safari-vs-Home Screen non cambia questa conclusione:
cambia solo quante coppie di contesti sono possibili, e serve a decidere la copy
di onboarding, non questa decisione.

## Il fatto che decide la forma della soluzione

**Su iOS due contesti non girano mai davvero insieme.** Quello in secondo piano
e' congelato. Non c'e' concorrenza da arbitrare: c'e' un contesto che si
risveglia con un mirror vecchio e scrive.

La finestra pericolosa non e' "mentre entrambi lavorano". E' **"quando B torna in
primo piano"**. La cura sta esattamente li'.

## Decisione

Il mirror e' una cache, non la fonte di verita'. Dopo ogni sospensione e'
scaduto: su `visibilitychange` con `visibilityState === 'visible'` (e su
`pageshow` con `persisted === true`) il repository rilegge lo stato dal disco
**prima di qualunque scrittura**, materializzazione compresa.

**Vincolo di sicurezza.** La rilettura non gira se ci sono scritture pendenti o
fallite in coda: in quel caso il mirror contiene dati che il disco non ha, e
rileggere li cancellerebbe. Se `writeFailures` non e' vuoto, niente rilettura e
si resta nello stato "esporta subito".

## Alternative rifiutate

### Un lock in IndexedDB

Rifiutato. Un lock ha bisogno di heartbeat e scadenza, perche' un contesto morto
non rilascia niente. Un lock appeso significa mostrare "Cent e' gia' aperto in
un'altra finestra" davanti a un'app che non e' aperta da nessuna parte: l'app
diventa inutilizzabile finche' l'utente non capisce come sbloccarla, cosa che
nessuno capisce. E' un fallimento peggiore di quello che previene, e la logica di
scadenza e' a sua volta una fonte di bug.

### `BroadcastChannel`

Rifiutato **per ora**. Sincronizza contesti concorrenti, e su iOS contesti
concorrenti non esistono: e' peso architetturale per un problema che la
piattaforma non ha.

Resta scoperto un solo caso: due finestre desktop affiancate, entrambe in primo
piano davvero. Non e' un caso d'uso di questa app — single-user, mobile-first,
installata sul telefono. Se un giorno lo diventasse, la risposta sarebbe
`BroadcastChannel`, non il lock.

## Perche' questa infrastruttura serviva comunque

La rilettura al risveglio non e' un cerotto su questo bug. E' il punto in cui va
gestito il **cambio di giorno**: app lasciata aperta la notte, il periodo cambia,
il budget e il "disponibile al giorno" vanno ricalcolati sul giorno nuovo. Ed e'
il secondo dei due eventi che in una PWA significano "aprire l'app" — il primo e'
il `load`. Stiamo scrivendo qualcosa che andava scritto in ogni caso.

## Conseguenze

- Il buco che il mirror mostra dopo la correzione di ADR 006 — le occorrenze che
  il disco ha saltato e che il mirror non inventa piu' — si chiude al primo
  risveglio invece che al riavvio. La soluzione onesta diventa anche accettabile.
- La rilettura e' un `getAll` su tutti gli store: con 5.000 spese sono ~5 ms
  misurati in memoria, e avviene mentre l'app e' gia' dipinta. Non e' sul
  percorso del primo frame (vedi "Ordine di pittura" in CLAUDE.md).
- Il repository espone la rilettura come API; l'aggancio agli eventi del
  documento e' di `src/app`, perche' `src/core` non tocca il DOM.
