# ADR 015 — I nomi delle categorie di default sono un ingresso dell'apertura

Data: 2026-08-24
Stato: accettata

## Contesto

Le otto categorie di default nascevano dentro `openRepository`, al primo avvio,
con i nomi **scritti in italiano nel dominio**. Funzionava finche' l'utente era
uno solo.

Dal cambio di scopo del 23 agosto il default della lingua e' **l'inglese**. Al
gate della fase 3 lo scenario e' stato eseguito, non ipotizzato: con `locale`
inglese la guida esce in inglese e il foglio d'inserimento mostra otto chip
italiani, con "Coffeeshop" troncato a "Coffee…". **Il secondo dei due tap — l'unico
gesto che decide *cosa* si sta salvando — era etichettato in una lingua che la
persona non legge.**

## La cosa che si sbaglia: e' l'ordine, non la traduzione

Tradurre le otto etichette **senza toccare l'ordine** avrebbe prodotto otto
etichette nella lingua sbagliata **con un dizionario tradotto accanto** — cioe' il
lavoro fatto e il difetto intatto. Il seed girava **prima che una lingua
esistesse**.

## Decisione

**I nomi sono un ingresso obbligatorio dell'apertura.**

    openRepository(persistence, { defaultCategoryNames })   // secondo argomento obbligatorio

`src/app` risolve la lingua da `navigator` — sincrono, nessun database — e **poi**
apre il repository. Al primo avvio la lingua risolta **e'** quella dell'ambiente:
`Settings.language` e' per definizione assente, quindi leggere `navigator` prima di
aprire non perde niente.

Da quel momento i nomi sono **dati dell'utente**: cambiare lingua dopo **non** li
ritraduce, ed e' corretto — sono suoi, e rinominarli e' cio' che l'editor serve a
fare.

## Perche' obbligatorio, e perche' un `Record`

- Il parametro **non ha default**. La versione "compatibile" — opzionale con
  fallback italiano — e' precisamente il difetto che questa ADR chiude, e sarebbe
  tornata in silenzio.
- E' un `Record` completo su otto chiavi, **non una tupla**: dimenticarne una e'
  errore di compilazione, e **scambiare `cigarettes` con `transport` — che con otto
  stringhe in fila compilerebbe — e' impossibile**.
- Emoji, colori e **ordine** non sono passabili da fuori: restano dominio.
  L'ordine e' per frequenza di tap e i colori sono un sistema che dalla fase 6
  colora i grafici.

Il prezzo, accettato: stringere la firma ha rotto la build finche' i due chiamanti
non sono stati aggiornati. **Il difetto non poteva essere spedito, ma nemmeno la
fase** — che e' il verso giusto in cui rompere.

## Alternativa scartata: salvare una chiave invece di un nome

Gia' in CLAUDE.md, si ripete qui perche' e' qui che verra' cercata: un campo con
**due nature** (chiave o nome), una transizione fra le due, e un backup che deve
rappresentarle entrambe — per una comodita' che capita **una volta sola** nella
vita di un utente. **Una categoria ha un nome.**

## Cosa resta aperto

Due contesti che aprono insieme un database vuoto possono seminare due volte —
sedici categorie. La condizione (`settings === null`) e' identica a prima: questa
ADR non l'ha ne' introdotta ne' chiusa. La cura sarebbe **id deterministici per i
default**, sulla falsariga di ADR 006.
