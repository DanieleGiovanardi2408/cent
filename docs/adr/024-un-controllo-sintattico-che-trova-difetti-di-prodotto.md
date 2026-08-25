# ADR 024 — Un controllo sintattico che trova difetti di prodotto

Data: 2026-08-25
Stato: accettata

## La decisione

`scripts/dead-surface.mjs` gira in CI, dopo il typecheck e **prima dei test**, e
ferma la pipeline quando trova:

- **A.** un campo dei tipi di dominio **senza produttore**;
- **B.** una chiave i18n **senza lettore**.

## Perche' non e' igiene del codice

L'argomento che servira' il giorno in cui qualcuno vorra' disattivarlo per far
passare una build **non e' "il codice morto e' brutto"**. E' questo:

> Rilanciato su `f4f21e7`, il controllo A segnala **`anchorDay`**.

Cioe' avrebbe segnalato il difetto dell'ancora **giorni prima** che lo trovassimo, e
**da una direzione completamente diversa**: non come *"il rewind sposta il giorno
del mese in silenzio"* — che e' un ragionamento sul comportamento, fatto da un
umano, dopo aver costruito la funzione che lo produce — ma come *"questo campo non
e' scrivibile da nessuna parte"*. **Stessa radice, vista dall'altro lato.**

Quel difetto e' costato una migrazione di schema, due ADR e un giro di gate. Un
controllo sintattico da 0,58 secondi lo vedeva.

Al primo giro sull'albero vero ha trovato **`Budget.categoryId`**: 248 occorrenze in
24 file, diciassette letture in `budget.ts` che filtravano per un campo che nessun
chiamante poteva valorizzare. Tre giorni di fase 5, un umano, un coordinatore e un
revisore critico non l'avevano visto.

## Perche' e' uno script separato da `audit.mjs`

`audit.mjs` guarda i **dati** — un backup passato come argomento — lo lancia una
persona, ed esce sempre 0: e' un referto da leggere. Questo guarda il **codice**,
non prende argomenti, lo lancia la CI, e il suo unico prodotto utile e' il **codice
di uscita**.

Fonderli voleva dire un sottocomando e **due semantiche di `process.exit` nello
stesso file**: il posto esatto in cui un giorno la CI lancia il ramo sbagliato e
nessuno se ne accorge, perche' **tacere e' l'esito normale di entrambi**.

## Zero falsi positivi, o la guardia e' gia' aggirata

E' la stessa dinamica dell'hook `pre-commit`, che fa solo il typecheck e mai la
suite: *una guardia aggirata e' peggio di nessuna guardia.* Quindi davanti a un caso
ambiguo lo script **tace**, e i punti ciechi sono dichiarati **in testa al file**,
non in un report che nessuno rilegge: chiavi calcolate, scritture per solo spread,
valori riciclati con un altro nome, testo dei template, campi non `readonly`.

Davanti a chiavi i18n costruite a pezzi, B **si dichiara non applicabile** invece di
accusare — e la guardia e' provata da un test.

Analisi lessicale, nessuna dipendenza: `typescript@7` non espone piu' una API JS.
**Un'analisi testuale onesta che dichiara i propri limiti vale piu' di un'analisi
sofisticata che li nasconde.**

## Il perimetro e' piu' stretto della regola, e lo sappiamo

A guarda `src/core/types.ts`. Ma `ExpensePatch` sta in `repository.ts`, e li' **solo
`amountCents` ha un produttore**: `date`, `categoryId` e `note` sono passati soltanto
dai test.

Cioe' l'audit ha **un perimetro piu' stretto della regola che applica** — che e'
"una decisione vale dove vale il suo argomento" applicata all'audit stesso. E'
scritto qui perche' il prossimo che lo allarga sappia **perche'** va allargato, e
non lo scopra da un difetto.
