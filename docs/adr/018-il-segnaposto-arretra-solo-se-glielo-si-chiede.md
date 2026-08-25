# ADR 018 — Il segnaposto arretra solo se glielo si chiede

Data: 2026-08-25
Stato: accettata

## Decisione

Il segnaposto di una regola ricorrente (`lastMaterializedDate`) **arretra solo
attraverso `rewindRecurringRule`** — cioe' solo per un'operazione **nominata**, con
anteprima e conferma esplicita dell'utente.

**Non arretra mai come effetto collaterale**: non per orologio, non per fuso, non
per import, non per ricalcolo.

## Perche' questa formulazione e non "non arretra mai"

La prima versione di questa ADR diceva *"il segnaposto e' monotono, non arretra
mai per nessuna causa"*. Era piu' semplice ed era **sbagliata**: chiudeva anche
l'unica porta che serve.

Il bisogno reale — *"l'affitto in realta' e' partito a febbraio"* — e' il gesto che
qualcuno fa il giorno in cui installa l'app. Vietarlo del tutto avrebbe lasciato
l'utente in uno stato da cui non esce dall'interno: la regola ha gia' generato
un'istanza, quindi `planRecurringRuleDeletion` la rifiuta per sempre, e non
esisteva nessuna schermata capace di spostare il segnaposto.

Questa formulazione tiene chiusi i due inneschi che erano stati ri-derivati al gate
— **l'orologio** (un telefono con la data avanti, un volo Amsterdam→Tokyo) e
**`importBackup`** — e apre l'unica porta che serve, **con la maniglia dalla parte
dell'utente**.

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
record** — `startDate` e il segnaposto, entrambi alla data nuova — e nient'altro.
Non cancella niente, non crea id nuovi, il `ruleId` resta.

Poi la UI chiama `materializeRecurring`, come gia' fa dopo aver salvato una regola.

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
