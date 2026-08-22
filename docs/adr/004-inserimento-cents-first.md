# ADR 004 — Inserimento cents-first, categoria come conferma

Data: 2026-08-22
Stato: accettata

## Contesto

Il principio guida n.1 diceva "meno di 5 secondi e meno di 4 tap". Il vincolo
era ambiguo su un punto decisivo: **le cifre dell'importo contano come tap?**
Se contano, digitare `12,50` ne consuma gia' 4 da solo e il vincolo e'
aritmeticamente irraggiungibile appena aggiungi apertura, categoria e conferma.

L'ambiguita' non e' accademica: le due letture producono due app diverse, e in
assenza di una decisione la fase 2 avrebbe scelto per inerzia.

## Decisione

**Le cifre non contano.** L'importo e' contenuto, non navigazione: non esiste
modo di farlo entrare nell'app senza digitarlo, quindi contarlo come attrito
rende la metrica priva di senso.

Il vincolo e': **massimo 3 tap oltre alle cifre dell'importo, obiettivo 2.**

I 2 tap si raggiungono con due scelte vincolanti per la fase 2:

### 1. Inserimento cents-first, stile bancomat

Si digitano solo cifre e l'importo si riempie da destra: `1` -> `0,01`,
`12` -> `0,12`, `1250` -> `12,50`.

Conseguenze:
- Il tasto virgola **sparisce** dal tastierino. Con lui spariscono l'ambiguita'
  fra `,` e `.`, il doppio separatore, il separatore in prima posizione e i tre
  decimali. Non esiste piu' un input malformato da gestire: l'unico stato
  possibile e' una sequenza di cifre.
- `parseAmountToCents` in `src/core/money.ts` resta comunque necessaria, ma per
  un altro consumatore: l'import di dati esterni (fase 7), dove le stringhe
  arrivano da un file e possono essere malformate davvero. Non e' piu' sulla via
  del tastierino.
- Il tastierino resta custom, non quello di iOS: serve solo 0-9 e cancella.

### 2. Il chip della categoria E' il tasto di conferma

Il flusso completo: **FAB -> cifre -> tap sulla categoria -> salvato.**
Due tap oltre alle cifre. Nessun pulsante "Conferma", nessun passaggio finale.

### Rifiutato esplicitamente: la categoria preselezionata all'ultima usata

Risparmierebbe un altro tap e porterebbe il flusso a 1. E' stata scartata.

Motivo: introdurrebbe l'unico errore **silenzioso e permanente** dell'app. Un
caffe' registrato sotto Affitto perche' non hai guardato non da' nessun segnale
al momento dell'inserimento, e corrompe le statistiche e i budget di categoria
per sempre. Una spesa inserita lentamente te ne accorgi subito e la rifai; una
spesa categorizzata male non la scopri mai.

La categoria si sceglie sempre, esplicitamente. Il tap in piu' e' il prezzo di
un dato di cui ci si puo' fidare, ed e' un prezzo che paghiamo volentieri.

## Conseguenze

- Il salvataggio avviene su un tap che e' anche una scelta di contenuto: la
  conferma non e' un passaggio separato ma un effetto collaterale della scelta
  della categoria. Serve quindi che l'annullamento sia immediato e visibile —
  il toast con "Annulla" del soft delete non e' un di piu', e' la rete di
  sicurezza di questo design.
- La data e' oggi per default e la nota e' collassata: entrambe restano fuori
  dal percorso a 2 tap e si raggiungono solo se servono.
- Se una futura schermata aggiunge un passaggio a questo flusso, va misurata
  contro questo documento prima che contro il gusto di chi la propone.
