# ADR 008 — Le scritture che dipendono dallo stato altrui si pianificano dentro la transazione

Data: 2026-08-22
Stato: accettata

## Contesto

Questa decisione e' stata presa tre volte di fila, ogni volta come correzione di
un bug diverso, prima che qualcuno si accorgesse che era sempre la stessa. La
scrivo qui perche' la quarta volta non serva un altro bug per arrivarci.

I tre casi:

1. **L'id delle spese ricorrenti** (ADR 006). Generare un UUID e poi controllare
   se l'occorrenza esiste gia' e' una decisione presa leggendo lo stato prima di
   scrivere. Due contesti leggono lo stesso stato e decidono la stessa cosa.
2. **Il segnaposto delle ricorrenze.** Il batch scriveva l'intera regola,
   ricostruita da una copia letta dal mirror: un contesto stantio riattivava una
   regola che l'utente aveva disattivato. Corretto con
   `advanceRecurringMarkers`, che porta in transazione solo l'intenzione
   ("porta avanti il segnaposto a questa data") e rilegge il record dal disco.
3. **`setBudget`.** `planBudgetChange` decideva *quale record chiudere* leggendo
   i budget dal mirror. Un contesto stantio non vedeva il budget aperto
   dall'altro e non lo chiudeva: due record aperti sovrapposti, per sempre.
   Corretto portando la pianificazione dentro la transazione readwrite.
   (`planBudgetChange` e' stato poi cancellato: era rimasto solo come wrapper
   senza chiamanti sopra `planResolvedBudgetChange`, che e' la funzione che gira
   davvero in transazione.)

## Decisione

**Se il valore da scrivere dipende da cosa c'e' gia' sul disco, la decisione si
prende dentro la transazione, sui dati riletti dal disco.**

Quello che attraversa il confine della persistenza e' l'**intenzione**
("porta avanti il segnaposto", "il budget da oggi e' 200 euro"), non il
**risultato** gia' calcolato ("scrivi questo record cosi' com'e'").

Corollari operativi:

- L'operazione nel `WriteBatch` deve essere il piu' **stretta** possibile. Il
  campo si chiama `advanceRecurringMarkers` e accetta solo
  `{id, lastMaterializedDate, updatedAt}` proprio perche' un nome generico tipo
  `patchRecurringRules` invita a farci passare `amountCents` — che e'
  esattamente la malattia. Un'API stretta rende il bug irrappresentabile invece
  di vietarlo per convenzione.
- Gli identificatori e i timestamp si **pregenerano fuori** e viaggiano nella
  richiesta. Sembra il contrario di questa ADR, ma non lo e': servono a rendere
  la scrittura ripetibile. Se la connessione muore e il ritentativo rifa' la
  stessa richiesta, con l'id dentro il secondo tentativo aggiorna il record
  invece di aprirne un altro.
- Leggere "appena prima" della transazione **non e' una soluzione**: e' la stessa
  gara con una finestra piu' stretta.

## La seconda meta': rendere totale chi legge

Impedire che uno stato incoerente si crei non basta, perche' puo' arrivare da
altrove: un crash a meta', un import di un JSON scritto a mano, un bug futuro,
dati di una versione precedente.

Quindi ogni funzione che **risolve** uno stato ambiguo deve essere totale e
deterministica, mai arbitraria e mai un throw:

- `compareIsoDates` ordina anche stringhe che non sono date, perche' un
  comparatore che lancia rende inutilizzabile l'intera lista.
- `resolveBudget` di fronte a due record sovrapposti sceglie per regola —
  `effectiveFrom` piu' recente, poi `createdAt`, poi `id` — invece di dipendere
  dall'ordine in cui IndexedDB ha restituito i record. Il terzo livello non ha
  significato di dominio: esiste solo perche' un pareggio non diventi un caso
  indefinito.
- `parseBackup` non lancia su nessun output di `JSON.parse`.

Le due meta' insieme sono lo schema ricorrente: **una difesa che impedisce, una
che rende innocuo cio' che esiste gia'.** Nessuna delle due, da sola, e'
sufficiente — e la correttezza non deve dipendere da un solo strato.

## Conseguenze

- `Persistence` non e' un archivio passivo: conosce qualche operazione di
  dominio. E' un prezzo accettato consapevolmente. L'alternativa — un archivio
  puro piu' un lock applicativo — e' stata rifiutata in ADR 007.
- Ogni nuova implementazione di `Persistence` deve implementare anche queste
  operazioni, non solo le `put`. Oggi ce ne sono due, quella vera e il doppio in
  memoria per i test, e devono restare osservabilmente identiche: se divergono,
  i test provano una cosa e la produzione ne fa un'altra.
- Quando si aggiunge una scrittura, la domanda da farsi e' una sola: **il valore
  che sto per scrivere dipende da cosa c'e' gia' li'?** Se si', non si pianifica
  dal mirror.
