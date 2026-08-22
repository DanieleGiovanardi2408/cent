# ADR 006 — Identita' deterministica delle spese ricorrenti

Data: 2026-08-22
Stato: accettata

## Contesto

Il motore delle ricorrenze materializza spese reali a partire da regole, in modo
pigro, all'apertura dell'app. Il requisito duro e' che aprire l'app dieci volte
oggi crei zero duplicati.

La prima implementazione lo garantiva con due difese: un segnaposto
(`lastMaterializedDate`) che avanza solo dentro la stessa transazione atomica che
scrive le spese, e una deduplica sulla coppia `(recurringId, date)` costruita
all'inizio di ogni chiamata.

**Non bastavano.** Due chiamate a `materializeRecurring` avviate prima che la
prima finisca leggono lo stesso stato, costruiscono lo stesso insieme di
occorrenze gia' presenti, e generano gli stessi giorni con UUID diversi. Nessuna
delle due difese le vede: la deduplica e' locale alla chiamata, e i due
`WriteBatch` sono entrambi atomici e entrambi legittimi. Riprodotto: una regola
giornaliera su 22 giorni produce **44 spese**, ogni giorno duplicato.

## La correzione scartata: serializzare le chiamate

La cura immediata sarebbe memoizzare la promise in corso e restituirla a chi
chiama mentre il lavoro e' gia' in volo. E' un lock, e un lock vive dentro un
contesto JavaScript.

Non copre i due casi che contano davvero:

1. **Due contesti diversi sullo stesso database.** La PWA aperta dalla Home
   Screen mentre una scheda Safari sullo stesso sito e' ancora viva: due
   documenti, due lock separati, una sola IndexedDB. Di nuovo 44 spese. Non e'
   uno scenario di laboratorio — e' esattamente il setup del test manuale gia'
   previsto in `docs/ROADMAP.md` per capire se lo storage di Safari e quello
   della web app sono separati.
2. **La morte a meta'.** Un catch-up di 40 giorni interrotto da iOS: alla
   riapertura il processo che teneva il lock non esiste piu'. Il lock non ha
   nulla da dire su cosa e' stato scritto e cosa no.

## Decisione

Una spesa generata ha un'**identita' deterministica**: il suo `id` e' funzione
pura della coppia `(recurringId, date)` — nella forma `rec:<recurringId>:<date>`
— e non un `crypto.randomUUID()`.

L'inserimento ha semantica **add**, non **put**: se l'id esiste gia', la
scrittura fallisce e l'occorrenza viene **saltata**, mai sovrascritta.

## Perche' funziona

Ogni occorrenza ha **una sola identita' possibile**, quindi non esiste piu' uno
stato in cui la stessa occorrenza compare due volte: non e' una condizione che
sorvegliamo, e' una condizione che non e' rappresentabile. Due contesti
paralleli, dieci riavvii, una morte a meta': l'esito e' sempre lo stesso insieme
di record.

Il "salta, non sovrascrivere" e' la seconda meta' della decisione, ed e' quella
che protegge l'utente:

- Se ha corretto l'importo della singola istanza (canone 920 invece di 900), il
  record esiste e non viene riscritto: la correzione sopravvive al catch-up
  successivo.
- Se ha **cancellato** l'occorrenza, il record esiste comunque — il soft delete
  lascia `deletedAt` — quindi non viene resuscitato.

### Correzione: quanto sopra era vero solo a meta'

Quando questa ADR e' stata scritta, le due righe qui sopra erano date per vere
end-to-end. **Non lo erano**, e la review successiva lo ha dimostrato con un test.

La garanzia vale al livello di `Persistence`: il disco effettivamente salta l'id
gia' presente e non sovrascrive niente. Ma il mirror in memoria non lo sapeva.
`onCommitted` riceveva tutte le spese del blocco, comprese quelle che il disco
aveva saltato, e il repository inseriva **la propria copia appena costruita** —
senza `deletedAt`, con l'importo della regola. Sequenza riprodotta: due contesti,
in uno l'utente cancella l'occorrenza, l'altro materializza e se la ritrova viva
in lista; l'utente la tocca per correggerne l'importo e quella modifica, che passa
per un put legittimo, riscrive il record cancellato. La cancellazione spariva
davvero, e cosi' la correzione per-istanza.

L'errore di ragionamento e' stato assumere che "stesso id" implicasse "stesso
record": due contesti possono costruire due oggetti diversi con lo stesso id, e
solo uno dei due e' quello sul disco.

Correzione applicata: a `onCommitted` vanno **solo** le spese davvero inserite
(`created`, gia' filtrato su `skippedIds`); per gli id saltati il mirror non
inventa niente e resta col buco fino alla rilettura. La rilettura al risveglio
(ADR 007) chiude quel buco al primo ritorno in primo piano.

Questa sezione resta qui invece di riscrivere il testo sopra: un'ADR che nasconde
di essersi sbagliata vale meno di una che lo dice, e l'errore — confondere la
garanzia del livello di persistenza con quella dell'intero sistema — e' del tipo
che si ripete.

Un id leggibile (`rec:<uuid>:2026-08-22`) invece di un hash e' una scelta
deliberata: rende ovvio a chi guarda un export JSON perche' quel record e' li'.

## Il lock resta, ma declassato

La serializzazione delle chiamate concorrenti si tiene, come **ottimizzazione**:
evita di rifare lavoro che qualcun altro sta gia' facendo. Non e' piu' la fonte
della correttezza. La distinzione va tenuta viva: se un domani il lock viene
tolto per semplificare, l'app deve restare corretta.

E' scritto anche in CLAUDE.md sotto il motore delle ricorrenze, perche' e' li'
che qualcuno andra' a leggere prima di toccare questo codice.

## Conseguenze

- Gli id delle spese generate non sono piu' opachi. Chi scrivera' l'import dovra'
  tenerne conto: reimportare un backup non deve rompere l'invariante.
- Il test che conta — due repository distinti sullo **stesso** database, due
  catch-up in parallelo — e' diventato scrivibile solo con `fake-indexeddb`
  (vedi ADR 001), e vive nella suite, non fra le verifiche manuali.
- Le spese inserite a mano continuano ad avere `crypto.randomUUID()`: non hanno
  nessuna identita' naturale da cui derivare un id, e non ne hanno bisogno.
