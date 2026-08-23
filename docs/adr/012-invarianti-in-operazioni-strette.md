# ADR 012 — Un invariante di dominio si spezza in operazioni strette

Data: 2026-08-23
Stato: accettata

## Contesto

La griglia delle categorie ha un tetto: **massimo otto attive**. Non e' una
preferenza estetica — e' cio' che protegge i due tap, perche' una griglia che
scorre trasformerebbe il secondo tap in scroll + tap **senza che nessuna misura se
ne accorga** (CLAUDE.md, "Tetto di otto categorie attive").

L'istruzione era: deve essere **impossibile** avere nove categorie non archiviate,
non solo scomodo.

Questa e' la **quarta** applicazione del principio di ADR 008. Le prime tre erano
correzioni di bug diversi; questa e' la prima volta che il principio viene
applicato **prima** che il bug esista. Vale la pena nominare la forma, perche' e'
generale.

## Decisione

**Quando esiste un invariante, le operazioni di scrittura che potrebbero violarlo
si spezzano finche' ognuna puo' muoversi in una sola direzione — e il campo che lo
viola ha un solo produttore.**

Tre strati, in ordine di forza. Il primo e' quello che conta di piu' perche' non
richiede di ricordarsi niente.

### 1. A tempo di compilazione: togliere il campo dal tipo

`CategoryPatch` **non ha `archived`**. Con quel campo,
`updateCategory(id, { archived: false })` sarebbe una riga che compila e che fa la
nona senza passare da nessun controllo. Senza, e' un errore di compilazione.

Non c'e' una guardia da ricordarsi: c'e' un'espressione che non esiste.

### 2. Un solo produttore del valore pericoloso

`archived: false` puo' nascere in **un** punto solo. Il `WriteBatch` e' spezzato in
tre operazioni, secondo il corollario di ADR 008 ("l'operazione dev'essere la piu'
stretta possibile"):

- **`categories`** — upsert che **rilegge `archived` dal disco e lo conserva**.
  Chiude un buco che nessuno aveva visto: un mirror vecchio che rinomina una
  categoria archiviata da un altro contesto la riporterebbe in griglia, ed e' la
  nona senza che nessun controllo la veda passare. E' lo stesso difetto che
  `advanceRecurringMarkers` ha chiuso per le regole ricorrenti.
- **`archiveCategories`** — va in **una direzione sola**. Il campo per il verso
  opposto non esiste nell'operazione.
- **`categoryPlacement`** — l'unica via che produce `archived: false`, e finisce
  con un solo controllo: *quante categorie non archiviate restano dopo questo
  piano*.

### 3. Il piano si fa sul disco, mai sul mirror

Come da ADR 008: attraversa il confine **l'intenzione** ("questa entra, quella
esce"), non i record gia' calcolati.

E lo scambio e' **atomico**: le due scritture nella stessa transazione. Con un
crash a meta' restano otto categorie, nessuna archiviata e nessuna nuova — sette in
griglia sarebbe lo stato peggiore, perche' e' l'unico che nessuno si aspetta.

## La seconda meta': chi legge dev'essere totale

Come sempre in questo progetto, una difesa impedisce e una rende innocuo cio' che
esiste gia'. Su dati che violano il tetto — un JSON scritto a mano, una versione
futura — `activeCategories` restituisce otto **per regola** (`order`, poi
`createdAt`, poi `id`) e non lancia mai. La nona non viene toccata: si comporta
come archiviata finche' qualcuno non la archivia davvero.

E l'import non e' una porta di servizio: `parseBackup` normalizza il surplus
archiviandolo, e **lo dichiara nell'anteprima** — cioe' nel momento in cui l'utente
decide.

## Conseguenza sulla UI, che sembra una privazione e non lo e'

**Non esiste un'operazione "ripristina dall'archivio"**, e non e' una dimenticanza:
se esistesse, farebbe la nona. Riportare in griglia una categoria archiviata **non
compila** come operazione a se'.

Quindi dall'elenco delle archiviate il gesto e' lo stesso dell'aggiunta: si tocca
una categoria e l'app chiede *"quale sostituisce?"*. Non c'e' un bottone
"ripristina", e chi prova a scriverlo trova il compilatore che lo rifiuta.

E' la guardia che funziona, non un ostacolo da aggirare — ma va **detto prima** a
chi costruisce la UI, altrimenti lo scopre sbattendoci contro e la legge come un
difetto del modello invece che come il modello.

## Quando applicarlo

Non a ogni regola: a quelle il cui costo di violazione e' **silenzioso**. Il tetto
lo e' — una griglia che scorre non si rompe, semplicemente smette di mantenere una
promessa che nessun test misura. Le regole che falliscono rumorosamente non hanno
bisogno di questo apparato.
