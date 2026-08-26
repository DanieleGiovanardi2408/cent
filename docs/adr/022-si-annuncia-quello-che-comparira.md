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

`occupiedOccurrenceDates` guarda **l'id**, non il campo `date`. E' lo stesso
predicato che `materializeRecurring` applica prima di scrivere, ed e' asserito come
**identita'** in un test invece che confrontato a occhio.

### La ragione scritta qui era falsa, e la decisione non lo era

Fino al 26 agosto questo paragrafo diceva *"il campo `date` l'utente puo'
cambiarlo — l'affitto di agosto spostato al 5 settembre tiene l'id del 1 agosto"*.

**Non e' vero.** Gli scrittori di `Expense.date` sono quattro in tutto —
`addExpense`, `updateExpense`, `materializeRecurring`, `parseBackup` — e il secondo
ha **due soli chiamanti di produzione**, l'`AmountSheet` e il suo Annulla, che
passano entrambi `{ amountCents }`. **Nessuna schermata cambia la data di una
spesa**, e lo scenario dell'affitto spostato non e' raggiungibile dal prodotto.

`888699a` aveva gia' ritirato quella premessa dal codice, in due punti di
`recurrence.ts`, e il commento che la sostituiva diceva *"qui c'era scritto — **e
sta anche in ADR 022** — che `date` l'utente puo' cambiarla."* Stava anche qui, ed
e' rimasta un giorno in piu': la correzione era stata applicata dove il codice la
usava, non dove l'argomento era scritto.

**Le due ragioni che reggono davvero:**

1. **`date` non e' un'identita'.** E' un attributo che il record porta, e niente
   impone che concordi col giorno scritto nell'id: `parseExpense` li legge
   separatamente e non li confronta.
2. **L'import di un JSON scritto a mano e' una porta dichiarata** — le spese orfane
   entrano di proposito, con un avviso. Su un archivio cosi' la coppia
   `recurringId|date` dichiarerebbe occupato un giorno che l'id non occupa, cioe'
   filtrerebbe via l'occorrenza **vera** mentre il segnaposto avanza lo stesso: un
   canone perso senza nessun segnale.

Una decisione giusta difesa da una premessa falsa e' **peggio** di una decisione
senza difesa, perche' la premessa viene riusata altrove — ed e' esattamente cosi'
che questa frase e' arrivata fin qui, copiata dal commento che la conteneva.

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

## L'indice su `recurringId`: rimandato, con la soglia scritta

Non c'e' un indice su `recurringId`: la transazione fa un `getAll()` sullo store
delle spese. **Non e' un costo nuovo**: lo stesso `getAll()` lo fa gia' la
cancellazione di una regola, tre righe sopra, nello stesso file.

Un indice sparso porterebbe la lettura da ~700 KB a ~1 KB su un archivio da 5.000
spese — `getAllKeys(id)` restituisce esattamente gli id che servono senza clonare un
record — e il passo di migrazione sarebbe **senza `transform`**, quindi senza
rischio di perdita: IndexedDB popola l'indice da solo nella `versionchange`.

Rimandato, e la ragione e' la scala vera: **5.000 spese sono quattordici al giorno
per un anno.** Non e' la scala di nessuno degli utenti di oggi — al momento di
questa decisione il database reale ne conteneva **sei**.

**La soglia a cui si rivaluta, perche' fra sei mesi non si ridiscuta a memoria:**

- **1.000 spese in archivio.** Sopra quel numero il clone dentro la `readwrite`
  smette di essere gratis: a ~140 byte per record sono ~140 KB clonati mentre lo
  store `expenses` e' bloccato in scrittura.
- **Come si misura, senza aggiungere strumenti**: `scripts/audit.mjs` gira gia' su
  un backup vero e ne conta i record. Il numero e' `data.expenses.length` di un
  export; niente da costruire, solo da guardare.

Sotto la soglia, il costo ricorrente di un indice — una voce mantenuta a ogni
scrittura di spesa ricorrente, catch-up compreso — non e' ripagato da un gesto
raro.
