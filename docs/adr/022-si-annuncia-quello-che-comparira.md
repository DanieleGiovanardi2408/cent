# ADR 022 — Si annuncia quello che comparira'

Data: 2026-08-25
Stato: accettata
Estende: ADR 017 (un'anteprima e' un'istantanea), ADR 018 (il segnaposto arretra
solo se glielo si chiede)

## La decisione

Il numero che l'anteprima del rewind annuncia, quello che la casella di conferma
fa spuntare, quello che il bottone porta scritto e quello che il toast riporta
sono **lo stesso numero**, ed e' **il numero di righe che comparira' nello
Storico**.

Si ottiene per **sottrazione**: dalle date del calendario si tolgono quelle gia'
occupate da un record esistente. `count`, `totalCents` e i due estremi
dell'impronta descrivono le **nuove**, e la ri-derivazione dentro la transazione
rifa' la stessa sottrazione.

## Perche' non bastava ammorbidire la frase

La regola precedente era *"si annuncia piu' di quanto si fa, che e' l'unico verso
accettabile"*. Era **giusta dove e' nata**: sul salvataggio di una regola copre una
**corsa** — fra l'anteprima e la conferma un altro contesto puo' aver materializzato
— e sbagliare per eccesso e' il verso sicuro.

Copiata sul rewind, la stessa frase copre una **certezza**. Il rewind esiste **solo**
per regole gia' materializzate (ADR 018), quindi la sovrapposizione fra la finestra
e cio' che e' gia' a disco e' **≥ 1 sempre, per costruzione**. Il numero non era
sbagliato a volte: era gonfiato **ogni volta**, esattamente del numero di occorrenze
gia' esistenti.

Il caso misurato: affitto 900/mese dal 1 giugno, materializzato; giugno corretto a
920, luglio cancellato; rewind al 1 febbraio. Il pannello annunciava **7 spese e
6.300,00 €**, ne nascevano **4**, e nello Storico se ne vedevano **6 per 5.420,00 €**.

Due righe sopra, la nota del pannello prometteva *"una spesa che hai corretto tiene
il tuo importo, e una che hai cancellato resta cancellata"*. **Prometteva di non
toccarle e le contava.**

## Il numero esatto non e' solo piu' onesto: e' quello che serve

Sette e 6.300 sono **l'ampiezza del calendario**. Cio' che l'utente sta per fare
alla propria storia e' **+4 spese e +3.600 €**. La prima coppia non risponde a
nessuna domanda che si stia facendo.

## La forma economica, non quella cara

La forma cara e' *"per ognuna delle N date candidate, chiedi al disco se esiste"*:
su una giornaliera riavvolta di due anni sono 730 interrogazioni.

La forma scelta e' l'inversa: **si legge una volta l'insieme delle date gia'
occupate da quella regola e si sottrae.** L'insieme e' piccolo **per definizione** —
sono le occorrenze generate da quando la regola e' nata: **non scala con la
finestra, scala con l'eta' della regola.** La transazione legge un insieme piccolo,
non ne interroga uno grande.

`occupiedOccurrenceDates` guarda **l'id**, non il campo `date`: l'id e'
`rec:<ruleId>:<giorno>` (ADR 006) e il campo `date` l'utente puo' cambiarlo —
l'affitto di agosto spostato al 5 settembre tiene l'id del 1 agosto. E' lo stesso
predicato che `materializeRecurring` applica prima di scrivere, ed e' asserito come
**identita'** in un test invece che confrontato a occhio.

Le lapidi contano come occupate: occupano l'id, `add` salta, quindi una spesa
cancellata a mano non deve rientrare fra le nuove.

## Il terzo parametro e' obbligatorio

`previewMaterialization(draft, today, occupied)` non ha un default vuoto. Un default
avrebbe lasciato il conteggio gonfiato in **ogni chiamante non aggiornato**, cioe'
esattamente dove il difetto era. **Chi non ha guardato il disco deve dirlo**
(`NO_OCCURRENCES`), non ometterlo.

## Il test si ripara prima del codice

Cinque test in `repository.test.ts` e uno in `ricorrenze.spec.ts` **codificavano il
difetto**: il piu' esplicito asseriva `count` 61 e `created` 58, con un commento che
spiegava perche' la discrepanza andasse bene; l'e2e asseriva otto annunciate e sette
righe a schermo nello stesso test.

Un test che codifica un difetto non lo nasconde soltanto: e' **l'artefatto che
domani ne giustifica la reintroduzione**. Quei commenti si tolgono, non si
riscrivono.

## Cosa non e' stato fatto, e perche'

Non c'e' un indice su `recurringId`: la transazione fa un `getAll()` sullo store
delle spese, identico a quello che la cancellazione di una regola fa gia'. Un indice
sparso porterebbe la lettura da ~700 KB a ~1 KB su un archivio da 5.000 spese, ma
costa uno `schemaVersion` 5 su **dati veri** per un gesto **raro**. Rimandato,
dichiarato qui, e non dimenticato in un TODO.
