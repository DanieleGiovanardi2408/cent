# ADR 019 — Una sheet di modifica mostra sempre il valore attuale

Data: 2026-08-25
Stato: accettata

## Decisione

Una sheet che **modifica un'entita' esistente** offre sempre l'unione

    { valori validi } ∪ { valore attuale dell'entita' }

e **marca visibilmente** il valore attuale quando non e' piu' fra quelli validi.

## Il caso che l'ha prodotta

Si crea la regola dell'affitto sulla categoria "Casa". Un mese dopo si vuole una
nona categoria e si archivia "Casa" — archiviare non ha vincoli, e nessuno avvisa
che una regola la usa.

Si riapre la regola dall'elenco, che la mostra ancora — giustamente — come "Casa".
Nel foglio **nessuno degli otto chip e' premuto**, perche' il foglio riceve solo le
categorie **attive**, e la riga d'aiuto dice "Cambia quello che serve" perche' il
campo non e' vuoto.

Il foglio si legge come *"categoria non scelta"*. Il gesto naturale — toccare un
chip per sistemare — **sposta l'affitto su un'altra categoria in silenzio**, e da
li' in poi tutte le spese generate ci finiscono.

## Perche' e' una regola e non una toppa

**Aprire una sheet per cambiare un campo non deve poterne cambiare un altro.**

E' la stessa famiglia dell'errore silenzioso e permanente per cui ADR 004 rifiuta
la categoria preselezionata e CLAUDE.md vieta la griglia che si riordina: un dato
sbagliato che non da' nessun segnale al momento in cui si produce, e che corrompe
tutto quello che viene dopo.

E' anche il primo punto in cui l'app dava **due risposte diverse alla stessa
domanda** — *"che categoria ha questa regola?"* — in due schermate adiacenti:
l'elenco diceva "Casa", il foglio diceva "niente".

La regola vale per ogni sheet di modifica esistente e futura: il foglio delle
regole oggi, il foglio della spesa quando avra' la modifica, e qualunque altro
campo che possa uscire dall'insieme dei valori validi mentre un record continua a
usarlo — una categoria archiviata, una regola disattivata, un budget chiuso.

## Conseguenza

Il valore attuale non e' semplicemente presente: e' **marcato**. Un chip che
compare senza distinzione fra gli altri direbbe che quella categoria e' ancora
scegliibile, il che sarebbe falso in un altro verso.
