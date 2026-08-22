# Roadmap

Le fasi. Una fase e' finita quando qualcosa gira davvero sul telefono, non
quando il codice compila.

| Fase | Cosa | Finita quando |
|---|---|---|
| 0 | Scaffold, PWA, tema, safe area | Si installa da Safari e riapre offline |
| 1 | Data layer + test | Test verdi su date, ricorrenze, budget |
| 2 | Aggiungi spesa + storico + **export JSON minimo** | Una spesa vera inserita in < 5s sul telefono, e si puo' salvarla fuori |
| 3 | Categorie personalizzabili | Si creano, riordinano, archiviano |
| 4 | Budget + Home | La Home dice quanto si puo' spendere oggi |
| 5 | Spese ricorrenti | Catch-up dopo 40 giorni, zero duplicati |
| 6 | Statistiche | Grafici SVG, nessuna libreria aggiunta |
| 7 | Export/import completo + backup | Round-trip senza perdita, import con anteprima |
| 8 | Packaging e pubblicazione | README con GIF, CI verde, app live su Pages |

Dopo la fase 2: usare l'app per una giornata vera prima di proseguire.

## Compiti espliciti della fase 2

### Export JSON minimo — anticipato dalla fase 7

Un bottone che scarica tutto in un file JSON. Nient'altro: import, CSV e
anteprima restano in fase 7.

Perche' e' stato anticipato: i dati iniziano a esistere in fase 2, e nel piano
originale il primo modo per metterli al sicuro arrivava in fase 7. Erano cinque
fasi di spese vere su una piattaforma che puo' cancellarle da sola (vedi sotto).
Un errore di sequenza, non una feature mancante.

### Verifica manuale: lo storage di Safari e quello della web app sono separati?

Non e' verificabile in sviluppo e cambia l'onboarding. Da fare appena c'e'
qualcosa di deployato, sul dispositivo reale:

1. Aprire l'app in **Safari** (non installata) e inserire una spesa.
2. "Aggiungi a Home".
3. Aprire l'app **dalla Home Screen** e guardare se la spesa c'e'.

Se lo storage e' separato, la spesa non ci sara' — e allora l'onboarding deve
dire "installa PRIMA di inserire qualsiasi cosa", e **non e' un consiglio ma un
blocco**: in modalita' browser l'inserimento va impedito, non sconsigliato.
Altrimenti un utente perde i dati senza mai capire che sono altrove.

Contesto: senza `navigator.storage.persist()` concesso, la policy WebKit cancella
tutto lo storage scrivibile da script (IndexedDB, localStorage, registrazione del
service worker) dopo 7 giorni di Safari senza interazione con quel sito.

## Compiti espliciti della fase 6

### Statistiche per fascia oraria e giorno della settimana

`Expense.timeMinutes` (minuti dalla mezzanotte locale, intero 0..1439) viene
registrato automaticamente all'inserimento **solo quando la spesa e' di oggi**.
Le spese retrodatate non ce l'hanno, di proposito: un orario inventato sarebbe
peggio di nessun orario, perche' la statistica lo tratterebbe come vero.

Da qui il taglio colazione/pranzo/cena si calcola dalle fasce orarie, invece di
farlo pagare all'utente con un tap a ogni spesa: se il telefono sa gia' che sono
le 20:40, chiedere "Cena" e' chiedere un'informazione che abbiamo gia'.

**Vincolo scritto adesso, prima che il grafico esista**: le spese senza
`timeMinutes` non entrano nel taglio per fascia, e il report deve **dire quante
ne ha escluse**. Una statistica che scarta record in silenzio mente — e qui
scarterebbe proprio le spese inserite in ritardo, che non sono un campione
casuale.

## Compiti espliciti della fase 3

### Riordino delle categorie: avvisare, non impedire

Quando le categorie diventeranno riordinabili, la UI deve dire che cambiare
l'ordine dopo che la memoria muscolare si e' formata costa piu' di quanto
sembri: dopo pochi giorni si tocca per posizione senza leggere l'etichetta, e
un riordino trasforma quel gesto in una spesa categorizzata male. Non va
impedito — sono categorie sue — va detto.

## Verifica offline automatica — anticipata dalla fase 6

`npm run test:offline` esiste di nuovo, e stavolta **fa qualcosa**. La versione
precedente era un segnaposto che usciva con codice 1: e' stata cancellata al gate
della fase 0 proprio perche' uno script che non fa niente e' un TODO travestito.

**Non e' una feature nuova: e' fase 6 anticipata a costo marginale.** Playwright e'
entrato per un'altra ragione — sorvegliare la regola "Sovrapposizioni" di CLAUDE.md,
dopo due bug in cui un overlay copriva un bersaglio interattivo — e una volta che
il browser, la configurazione e il job di CI esistono, il test offline sono venti
righe. Il costo che ne aveva giustificato il rinvio era l'infrastruttura, non il
test.

Solo **Chromium**, di proposito: il WebKit di Playwright non e' il Safari di iOS e
non comprerebbe la fedelta' che sembra promettere. La verifica su Safari vero resta
il telefono, e resta a carico del proprietario.

**Le quattro trappole**, tutte incontrate davvero e tutte documentate dentro
`tests/e2e/offline.spec.ts`:

1. `vite preview` serve sotto `/cent/`: il `baseURL` deve includerlo, altrimenti si
   ottengono 404 e li si scambia per un service worker rotto.
2. Con `registerType: 'prompt'` e senza `clientsClaim` (ADR 005) **il SW non
   controlla la prima pagina**. Serve un secondo caricamento online prima di
   spegnere la rete. Saltarlo fa fallire il test in un modo che sembra un problema
   di precache: e' la trappola che costa piu' tempo.
3. `context.setOffline(true)`, non `page.route` che aborta le richieste: il secondo
   non esercita lo stesso percorso.
4. Due asserzioni: stato 200 **e** testo identico a quello online. Un 200 con il
   guscio vuoto passerebbe la prima e non la seconda.

Quinta trappola, trovata scrivendolo: il testo va confrontato **dopo che ha smesso
di cambiare**. Per la regola "Ordine di pittura" il guscio si dipinge prima dei
dati, quindi una lettura secca cade in fasi diverse online e offline e il test
misura una corsa invece del precache. In orizzontale falliva esattamente cosi'.

## Asserzioni sull'ambiente — chiuse al gate della fase 2

Due proposte, entrambe decise dai fatti. Restano scritte perche' la ragione per cui
sono state decise vale piu' della decisione.

### 1. L'orologio che lancia nei test di `src/core` — NON si fa

Proposta: sostituire l'orologio globale nei test con uno che lancia, cosi' ogni
lettura nascosta di `Date.now()` fallirebbe invece di diventare un test che passa
oggi e cade il 29 febbraio.

**La condizione con cui era stata posta era il test sbagliato.** Diceva: "se
l'elenco dei punti che leggono `createdAt`/`updatedAt` per decidere e' vuoto a
parte i budget, il punto si chiude". L'elenco **non e' vuoto** — sono cinque:

- `budget.ts:72` — tie-break di `resolveBudget`
- `stats.ts:56` — `groupByDay`, decide l'ordine di ogni riga dello Storico
- `stats.ts:38` — `expensesInRange` (poi cancellata: nessun chiamante)
- `repository.ts:420-421` — `sameBudget`, decide se notificare i sottoscrittori
- `backup.ts:150-151` e `286-287` — fallback di un campo mancante all'import

Chiudere il punto su quella condizione sarebbe stato chiuderlo su un fatto falso.

**La ragione corretta e' un'altra, ed e' piu' forte**: in tutti e cinque i punti il
timestamp arriva **dal record**, mai dall'orologio ambientale al momento della
decisione. `stats.ts` non chiama nessun orologio, `sameBudget` nemmeno, `backup.ts`
riceve il fallback da chi lo chiama. Un orologio che lancia farebbe cadere solo il
default `clock = nowTimestamp` in `openRepository` — cioe' l'unica scrittura che e'
il mestiere di quella funzione. Costo reale, difetti intercettati zero,
dimostrabilmente.

La lezione generale: la domanda utile non e' "chi legge l'orologio", e' **"da dove
arriva il valore nel momento in cui decide"**.

### 2. Il canarino sulla formattazione della valuta — SI'. `.nvmrc` — NO

Serve **un** test che asserisca la **proprieta'**: il separatore fra numero e
simbolo dell'euro e' uno spazio **non separabile** (U+00A0, U+202F o U+2007). Se
ICU passa dall'uno all'altro resta verde, ed e' corretto: sono lo stesso pixel. Se
passa a uno spazio normale cade, ed e' un bug vero — in una colonna stretta
`1.234,56` va a capo e il `€` finisce sulla riga dopo.

`norm()` in `money.test.ts` **resta**: normalizzare gli spazi e' la scelta giusta
per il grosso della suite, e un test che cade su un carattere invisibile e' fragile
su qualcosa che non conta. Serve un canarino, non venti test fragili.

**`.nvmrc` non si fa**, e l'argomento che chiude la questione e' questo: **la
runtime che formatta il denaro in produzione e' l'ICU di WebKit sull'iPhone, non
quella di Node.** Pinnare Node rende ripetibile la CI e non dice niente sul
dispositivo. Il test di proprieta' invece codifica un invariante che *anche* il
telefono deve soddisfare. Fra i due non c'e' partita.

Nota: un canarino simile **esisteva gia' senza che nessuno lo sapesse**.
`money.test.ts:39` asserisce `'1234,56 €'`, cioe' il `useGrouping: 'min2'` che ICU
70 ha introdotto per it-IT: quel test cadrebbe se la runtime tornasse a raggruppare
le quattro cifre. Funzionava da prima ed era involontario.

### 3. Il locale mai implicito — RITIRATA dal proprietario

Le quattro costruzioni di `Intl` esistenti passano tutte `'it-IT'` esplicito:
sarebbe stato un test che oggi non puo' fallire, scritto per sorvegliare una riga
futura. Ritirata dal proprietario stesso applicando il criterio del taglio alle
proprie proposte.

**Ma l'asserzione d'ambiente che renderebbe davvero e' un'altra, ed e' emersa al
gate**: `crypto.randomUUID` esiste solo in contesto sicuro. Su `http://` da rete
locale sparisce e l'app non parte — un cambio di runtime che nessun test vede,
perche' ogni test inietta `newId`.

## Rischi noti: contesto stantio che scrive

Due contesti sullo stesso database sono normali ma mai simultanei su iOS (quello
in secondo piano e' congelato). La cura generale e' la **rilettura al risveglio**:
[ADR 007](adr/007-rilettura-al-risveglio.md). Questi quattro punti sono coperti
da quella, non da una difesa loro. Sono scritti qui perche' un rischio noto e non
scritto e' un rischio che si avvera.

Tutti e quattro sono **last-writer-wins su record che l'utente ha toccato
consapevolmente**: il danno e' visibile e correggibile dalla UI. E' il criterio
che li separa da `setBudget`, che ha avuto una correzione vera perche' li' il
record sporco non era correggibile da nessuna schermata.

1. **`updateExpense` / `deleteExpense` / `restoreExpense`** fanno `put` del record
   intero costruito dalla copia nel mirror. Con un mirror vecchio, correggere
   l'importo riscrive anche `date`, `note`, `categoryId` e l'assenza di
   `deletedAt` con i valori di ore prima. Dopo la rilettura l'utente agisce su
   quello che c'e' davvero; il residuo e' accettabile per un'app single-user.
   L'alternativa sarebbe un patch per campo su ogni scrittura, cioe' un modello
   di merge.
2. **`updateRecurringRule`**: stesso profilo. La materializzazione non ci passa
   piu' (usa `advanceRecurringMarkers`), ma una modifica utente da mirror vecchio si'.
3. **`updateSettings`** riscrive il record intero: due contesti che toccano tema e
   `lastBackupAt` si sovrascrivono. Danno minimo.
4. **Primo avvio contemporaneo di due contesti** su database vuoto: entrambi
   vedono `settings === null` e scrivono le categorie di default con id diversi,
   quindi 16 categorie invece di 8.

**Residuo che la rilettura non copre: due finestre desktop affiancate**, entrambe
in primo piano davvero. Li' non c'e' nessun risveglio da agganciare, e il punto 4
diventa raggiungibile. E' lo stesso confine tracciato da ADR 007 per rifiutare
`BroadcastChannel`: non e' un caso d'uso di questa app — single-user, mobile-first,
installata sul telefono — e se lo diventasse la risposta sarebbe `BroadcastChannel`,
non un lock.

## Decisioni rimandate a una fase precisa

- **Se l'app debba aprirsi sul tastierino invece che sulla lista** — decisione di
  **fase 4**. Oggi la domanda e' malposta: non esiste la Home, quindi manca meta'
  del confronto. Si decide quando esistono entrambi i motivi per aprire l'app —
  segnare una spesa, oppure vedere quanto resta — e non prima.

## Rimandato consapevolmente

- **Agganciare la rilettura al risveglio agli eventi del documento** — fase 2.
  `src/core` espone l'API; `src/app` deve chiamarla su `visibilitychange`
  (`visible`) e `pageshow` (`persisted`). Senza l'aggancio la regola di
  CLAUDE.md "il mirror e' una cache" non ha effetto. Vedi
  [ADR 007](adr/007-rilettura-al-risveglio.md).
- **Undo dell'import persistito** — fase 7. Oggi il backup restituito da
  `importBackup` per l'annullamento vive solo in memoria: se l'app muore nella
  finestra del toast, l'annullamento non c'e' piu'. La finestra e' di secondi e
  l'evento e' raro, quindi oggi e' accettabile — ma quando l'import esistera'
  nella UI va persistito, perche' l'import e' l'operazione piu' distruttiva
  dell'app. Costo: un record con dentro un dataset intero.
- **Avviso "esporta subito" per le scritture non riuscite** — fase 2. Quando
  `writeFailures` non e' vuoto, mirror e disco divergono e l'app non sa **quali**
  record non sono arrivati: non esiste un "riprova" onesto ne' un elenco. L'unica
  cosa vera che la UI puo' dire e' *"alcune modifiche non sono state salvate:
  esporta subito"*, perche' `exportBackup()` legge dal mirror e quindi il dato
  c'e' ancora. In quello stato la rilettura al risveglio resta disattivata
  (ADR 007), altrimenti cancellerebbe proprio i dati da salvare.
- **`sumCents` lancia su importi non interi** — nessuna fase assegnata. E'
  chiamata da `groupByDay` e `totalSpent`: un solo record corrotto renderebbe
  bianche Home e Storico insieme, e una delle due e' la schermata da cui si
  cancellerebbe il record. Oggi non e' raggiungibile (tutti gli ingressi
  validano). E' la stessa dottrina applicata a `compareIsoDates`, resa totale
  proprio perche' un comparatore che lancia rende inutilizzabile l'intera vista.

- **La posizione dell'avviso di aggiornamento** — **corretta in fase 2, non
  rimandata.** Questa riga diceva che il banner copre "il pezzo di schermo meno
  prezioso" e che si sarebbe riguardata in fase 4, quando in cima ci sarebbe
  stato il numero del budget. Era **gia' falsa in fase 2**: quella barra contiene
  l'unico bottone di export dell'app, e toccare dove c'e' scritto "Esporta"
  ricaricava la pagina. Vedi la regola "Sovrapposizioni" in CLAUDE.md.

- ~~Verifica offline automatica con Playwright~~ — **fatta**, vedi la sezione
  "Verifica offline automatica" qui sopra. Era rimandata alla fase 6 per il costo
  dell'infrastruttura; quando l'infrastruttura e' arrivata per un'altra ragione,
  il test e' costato venti righe.
- **`size.mjs` che distingua l'entry dai chunk dinamici** — fase 6. Oggi lo
  script somma ogni `.js`/`.css` in `dist/` e il numero e' vero perche' c'e' un
  chunk solo. Appena le Statistiche arriveranno con un `import()` dinamico, quel
  chunk verra' sommato al budget della prima pittura pur non essendoci dentro.
  Si sistema leggendo `dist/.vite/manifest.json` e sommando solo l'entry piu' i
  suoi import statici. Si scrive meglio quando il grafo esiste davvero.
- **`idb` e IndexedDB** — fase 1, insieme al primo codice che li usa.
- **Migrazione dell'esito di `navigator.storage.persist()` da localStorage a
  Settings** — fase 1, quando Settings esiste.
- **Preferenza di tema esplicita (chiaro/scuro/auto)** — fase 5, quando esiste la
  schermata Impostazioni. Fino ad allora il tema segue `prefers-color-scheme` e
  basta. Quando si costruira', dovra' aggiornare anche il `content` dei due
  `<meta name="theme-color">`, che le media query da sole non coprono.

## Numerazione delle ADR

C'e' un buco: la 003 e' stata scritta e poi cancellata nella stessa fase 0.
Documentava un rinvio (Playwright) invece di una decisione architetturale, e
l'informazione vive gia' qui sopra. I numeri delle ADR non si riusano.
