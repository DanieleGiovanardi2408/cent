# ADR 002 — Niente router, navigazione a stato

Data: 2026-08-22
Stato: accettata

## Contesto

L'app ha cinque schermate (Home, Aggiungi spesa, Storico, Statistiche,
Impostazioni). La tentazione automatica e' installare un router.

## Decisione

Nessun router. La schermata attiva e' stato dell'applicazione.

## Motivazione

In standalone su iOS **non esiste il tasto Indietro del browser**. Il valore
principale di un router — sincronizzare la UI con la history del browser perche'
l'utente possa tornare indietro e mettere link nei preferiti — semplicemente non
si applica: non c'e' history visibile, non ci sono URL da condividere, non c'e'
deep link da onorare. L'app e' single-user e i dati sono solo sul dispositivo,
quindi un URL non identifica niente di condivisibile.

Restano i costi: un router e' peso nel bundle (contro un budget di 60 KB) e
soprattutto e' una fonte di attrito sul flusso che il brief dichiara sacro —
inserire una spesa in meno di 5 secondi. "Aggiungi spesa" e' un bottom sheet
sopra la Home, non una destinazione: modellarlo come una rotta sarebbe gia' la
modellazione sbagliata.

## Conseguenze

- La navigazione interna basta a se stessa: ogni schermata ha la propria via di
  uscita esplicita, perche' non c'e' un Indietro di sistema su cui contare.
- Costo nel bundle: zero.
- Se un giorno servisse il deep link (non e' previsto: non c'e' backend, non
  c'e' condivisione), si aggiunge allora, con una ADR che lo giustifichi.
