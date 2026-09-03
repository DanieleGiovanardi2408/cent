# ADR 018 — Il segnaposto arretra solo se glielo si chiede

Data: 2026-08-25
Stato: accettata

## Decisione

Il segnaposto di una regola ricorrente (`lastMaterializedDate`) **arretra solo
attraverso `rewindRecurringRule`** — cioe' solo per un'operazione **nominata**, con
anteprima e conferma esplicita dell'utente.

**Non arretra mai come effetto collaterale**: non per orologio, non per fuso, non
per ricalcolo.

> **Emendata il 3 settembre 2026: `import` esce da questo elenco.** L'ADR
> affermava una garanzia che il codice non ha mai dato **e che non deve dare**.
> L'argomento e' sotto, in "L'import non e' un effetto collaterale: e' un altro
> inizio".

## Perche' questa formulazione e non "non arretra mai"

La prima versione di questa ADR diceva *"il segnaposto e' monotono, non arretra
mai per nessuna causa"*. Era piu' semplice ed era **sbagliata**: chiudeva anche
l'unica porta che serve.

Il bisogno reale — *"l'affitto in realta' e' partito a febbraio"* — e' il gesto che
qualcuno fa il giorno in cui installa l'app. Vietarlo del tutto avrebbe lasciato
l'utente in uno stato da cui non esce dall'interno: la regola ha gia' generato
un'istanza, quindi `planRecurringRuleDeletion` la rifiuta per sempre, e non
esisteva nessuna schermata capace di spostare il segnaposto.

Questa formulazione tiene chiuso l'innesco che era stato ri-derivato al gate —
**l'orologio** (un telefono con la data avanti, un volo Amsterdam→Tokyo) — e apre
l'unica porta che serve, **con la maniglia dalla parte dell'utente**.

Qui era nominato anche **`importBackup`**, ed e' l'emendamento del 3 settembre.

## L'import non e' un effetto collaterale: e' un altro inizio

**Emendamento del 3 settembre 2026.** Questa ADR elencava `import` fra gli inneschi
chiusi. **Nessuna riga di codice lo garantiva**, e la verifica e' stata eseguita su
tutte e due le implementazioni di `Persistence` — in memoria e su IndexedDB:

    marker prima = 2026-09-02   dopo = 2026-07-01
    spese  prima = 4            dopo = 2
    la correzione a 920,00 sopravvive?  no
    la lapide sopravvive?               no

La guardia di monotonia esiste, ma su un'altra porta: `idb.ts`, ramo
`advanceRecurringMarkers`. **`replaceAll` non passa di li'** — fa `clear()` e poi
un `put` liscio.

### E il comportamento misurato non e' un difetto: e' la semantica del ripristino

**Ripristinare un backup del 1º luglio significa tornare al 1º luglio.** Le
correzioni fatte il 5 agosto non sono nel file perche' **a luglio non esistevano**,
e perderle e' cio' che "ripristina" vuol dire. L'istanza cancellata il 2 settembre
torna viva perche' al 1º luglio **non era ne' creata ne' cancellata**: la lapide
non c'era. Il motore non sta sbagliando, sta rigenerando dal punto in cui il backup
lo lascia — e **se non lo facesse, l'affitto di agosto e settembre mancherebbe**.

> **La monotonia del segnaposto vale dentro una storia continua.** Un import
> **sostituisce** la storia, e chiedere monotonia attraverso quel confine e' come
> chiedere a un orologio di essere monotono attraverso l'atto di rimetterlo.

### Perche' l'errore e' finito qui, che e' la parte da ricordare

**Questa ADR e' stata scritta per il rewind, dove le spese restano.** Li' la
sicurezza dell'arretramento poggia su due proprieta' vere: gli id deterministici di
ADR 006 sono **gia' occupati**, quindi `add` salta e la correzione dell'utente
sopravvive; e la lapide **e' un record**, quindi occupa l'id e l'istanza non
risorge.

**Sull'import nessuna delle due vale**, perche' `replaceAll` ha appena fatto
`clear()`: gli id non sono piu' occupati e le lapidi non ci sono piu'. L'argomento
e' stato **esteso a un caso che non nominava, senza essere ri-derivato li'** — ed
e' *"una decisione vale dove vale il suo argomento"* nella forma che questo
progetto ha gia' visto otto volte, stavolta dentro una ADR invece che dentro il
codice.

Il codice sapeva gia' di sapere: `recurring-plan.ts` nomina l'import fra le cause
per cui il segnaposto puo' trovarsi **oltre** `today`, e lo gestisce. La direzione
opposta — troppo **indietro** — non era nominata da nessuna parte, e nessuno se
l'era chiesta.

### Conseguenze

1. **Nessuna modifica al codice.** `advanceRecurringMarkers` tiene la guardia dove
   serve; `replaceAll` non deve averla.
2. **La conferma dell'import lo dice**, con la data del file **dentro** la frase:
   ripristinando un backup del ‹data›, le spese registrate dopo quella data non ci
   sono piu', e le ricorrenti verranno rigenerate da quella data in poi. E' un
   fatto che l'utente puo' verificare nello Storico — la regola che vale qui e' il
   suo rovescio: **un fatto vero che nessun messaggio dice**.
3. **Un test** che dopo l'import lo stato e' esattamente quello implicato dalla
   data del backup **piu' la materializzazione fino a oggi**. E' l'unico modo di
   accorgersi se un domani qualcuno "ripara" questo comportamento — e senza, la
   prossima persona che legge la sonda la leggera' come un bug.

## Perche' arretrare il segnaposto e' sicuro

Il segnaposto **non e' il meccanismo di correttezza**: l'idempotenza e' garantita
dall'**id deterministico** `rec:<ruleId>:<date>` piu' la semantica **add** (ADR
006). Il segnaposto e' solo il **bordo inferiore della finestra**, cioe' una cache.

Da qui due proprieta' che vengono gratis, e che una soluzione basata sulla
cancellazione avrebbe dovuto pagare:

- **una correzione manuale sopravvive.** Il canone di agosto corretto a 920
  occupa gia' il suo id: la ri-materializzazione lo salta e l'importo resta 920.
- **un'istanza cancellata resta cancellata.** Il soft delete lascia una lapide
  **sotto lo stesso id** (`deletedAt` valorizzato, record presente), quindi `add`
  fallisce e non c'e' nessuna resurrezione.

La seconda proprieta' e' il perno, ed e' stata scoperta verificando invece che
ragionando: l'obiezione contro questa soluzione era *"riaprire la finestra fa
tornare le istanze cancellate a mano, perche' l'id torna libero"*. **E' falsa**: la
cancellazione e' soft, la chiave resta occupata. L'unica obiezione seria non
esisteva.

## L'operazione

    rewindRecurringRule(ruleId, nuovaDataInizio, ConfirmedPreview)

Un solo verso: **indietro**. Dentro la transazione scrive **due campi dello stesso
record** e nient'altro: `startDate` = la data nuova, **segnaposto = assente**. Non
cancella niente, non crea id nuovi, il `ruleId` resta.

Poi la UI chiama `materializeRecurring`, come gia' fa dopo aver salvato una regola.

### Perche' il segnaposto si azzera invece di ricevere la data nuova

La prima stesura diceva *"entrambi alla data nuova"*, ed era sbagliata di un
giorno: `materializationWindow` apre a **segnaposto + 1**, quindi l'occorrenza che
cade **esattamente sulla data scelta** non sarebbe nata. Retrodatare l'affitto al
1 gennaio, con oggi al 22 agosto, avrebbe prodotto febbraio…agosto: **sette
occorrenze invece di otto**, senza che l'anteprima mentisse — annunciava sette.

Il difetto vero non era il giorno mancante: era che la lettera della ADR rendeva il
rewind **incoerente con la creazione**. Creare oggi una regola con `startDate` nel
passato genera gia' tutto l'arretrato, quel giorno compreso, perche' il segnaposto
e' assente e la finestra apre esattamente su `startDate`. La stessa regola con la
stessa data d'inizio avrebbe dato otto spese se creata e sette se retrodatata.

Da cui la formulazione giusta, che e' anche piu' forte di "meno uno":

> `rewindRecurringRule` riporta la regola nello **stato di una regola appena creata
> con quella data d'inizio**. Non e' un'eccezione al motore: e' **il ramo che il
> motore percorre a ogni creazione**, gia' sotto test.

Cosi' la coerenza fra retrodatare e ricreare non e' una proprieta' da verificare
caso per caso: **e' la stessa riga di codice.** Otto e otto perche' e' lo stesso
ramo.

Restano due campi dello stesso record: uno riceve un valore, l'altro viene rimosso.

**In avanti non e' offerto**: spostare `startDate` avanti orfanerebbe le istanze
gia' generate prima della nuova data, ed e' un bisogno che nessuno ha espresso. Il
campo resta in sola lettura e l'unica azione e' "Sposta indietro la data d'inizio".

## La materializzazione resta fuori dalla transazione

Un'interruzione fra la scrittura del segnaposto e la materializzazione lascia una
regola con il segnaposto indietro e delle occorrenze da generare — che e' **lo
stato ordinario di ogni regola a ogni avvio**. Non c'e' niente da riparare perche'
non c'e' niente di anomalo: e' il caso normale, gia' coperto dal codice che gira
ogni volta che si apre l'app.

Portarla dentro non comprerebbe niente e costerebbe: **una transazione IndexedDB
che si allunga su lavoro non-IDB si auto-chiude quando la coda dei microtask si
svuota**, ed e' un classico su WebKit. Piu' roba dentro, piu' vicino a quel bordo,
per zero guadagno dato che `add` e' idempotente.

## Conseguenza sul nome di una variabile

In `recurrence.ts` il ciclo e' `Math.max(dates.length, 1)`, con un commento che
spiega che il segnaposto avanza anche senza occorrenze da creare. Con questa ADR
quel fatto diventa esprimibile per quello che e': **il segnaposto avanza a oggi
perche' la finestra fino a oggi e' stata considerata, non perche' sia stato
generato qualcosa.** Va detto nel **nome**, non nel commento.

## Un vincolo dichiarato invece di una proprieta' accidentale

Cancellare una regola non tocca le spese che ha generato — comprese le lapidi, che
restano con un `recurringId` che non punta piu' a niente.

> `recurringId` puo' restare orfano dopo la cancellazione di una regola. Nessun
> lettore lo dereferenzia; il primo che lo fara' deve gestire l'assenza
> **esplicitamente**, non assumerla impossibile.

Oggi e' inerte, ed e' stato verificato invece che dedotto: l'indice delle
occorrenze guarda solo **se** il campo c'e', il budget guarda `source`, e nessuna
schermata risale dalla spesa alla regola. Ma *"inerte oggi"* e' la descrizione
standard di una mina, e una riga qui la trasforma da proprieta' accidentale in
vincolo dichiarato.
