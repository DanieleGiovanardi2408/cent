# ADR 026 — L'import sostituisce, e lascia una rete

**3 settembre 2026.** Apre la fase 7. Le decisioni qui dentro sono state prese
sui fatti derivati dall'albero, non su una proposta: cio' che il codice **fa
oggi** e' citato con file e riga, e cio' che e' stato **misurato** e' segnato
come tale.

## 1. Sostituzione, non fusione — e non e' un compromesso

**L'import sostituisce tutto.** Non fonde, e la fusione non e' una versione piu'
grande della stessa cosa: e' un'altra cosa, che il modello di quest'app non puo'
reggere. Due fatti la chiudono, e sono fatti del codice.

**Senza antenato comune gli id non collidono mai.** Tutte le entita' hanno un
`crypto.randomUUID()`, tranne le spese ricorrenti che hanno un id deterministico
`rec:<recurringId>:<date>` (ADR 006) — dove `recurringId` e' a sua volta un UUID.
Fra due telefoni indipendenti la fusione e' quindi **un'unione disgiunta**:
sedici categorie (di cui otto finiscono in archivio per il tetto) e due storie di
budget sovrapposte. Non e' quello che chiede chi importa.

**Con antenato comune gli id coincidono tutti**, e serve un arbitro per record.
L'unico candidato e' `updatedAt`.

> **La fusione richiederebbe un arbitro fra due dispositivi, e un arbitro
> richiede un tempo condiviso. Un'app senza account non ce l'ha.**

`updatedAt` e' un orologio **di dispositivo**: due telefoni non sono
confrontabili per costruzione — e' lo stesso fatto per cui una nota d'uso di
questo progetto dice che un orologio puo' andare avanti, indietro, o
attraversare un fuso senza che nessuno abbia sbagliato.

Questa riga e' scritta cosi' perche' **chi riproporra' la fusione sappia cosa
deve portare con se'**: non un algoritmo di merge — quello e' la parte facile —
ma un tempo che i due dispositivi condividono. Oggi non esiste, e crearlo vuol
dire un server, cioe' il vincolo che l'app dichiara all'utente in Impostazioni.

C'e' anche un costo strutturale, e vale la pena averlo scritto: una fusione e'
per definizione *"il valore da scrivere dipende da cosa c'e' sul disco"*, cioe'
il caso che **ADR 008** obbliga a decidere **dentro la transazione**. Nessuna
delle operazioni strette di `WriteBatch` sa fondere, e `replaceAll` riceve un
`DataSet` gia' calcolato. Le due strade sono calcolare il merge sul mirror —
esattamente cio' che ADR 008 vieta, col precedente di `planBudgetChange` e i suoi
tre bug — oppure una sesta operazione stretta con due implementazioni.

## 2. Ma la sostituzione dev'essere reversibile: lo scatto pre-import

**Sarebbe assurdo che l'unica operazione irreversibile dell'app fosse proprio il
ripristino** — una schermata che esiste perche' i dati non si perdano. Oggi
l'unica rete e' un Annulla che vive in memoria e muore con la chiusura dell'app.

**Prima di `replaceAll`, lo stato corrente viene salvato in uno store suo.**

**Il peso, misurato sui dati veri** (il backup del 26 agosto: 18 spese, 12 vive):

    file intero          7,7 KB
    spese                270 byte/record
    categorie            202 byte/record
    regole               319 byte/record

    proiezione:    18 spese ->    7,4 KB
                1.000 spese ->  266 KB
                5.000 spese ->  1,3 MB      (il tetto dichiarato in CLAUDE.md)

**Il peso non e' il problema.** Uno scatto solo, mai una serie.

### Il costo vero e' nei tipi, e va pagato comunque

`MigrationStep` ha gia' `createStores`, e uno step con `createStores` e **senza
`transform`** e' la migrazione piu' economica possibile: nessun record viene
toccato.

Ma `StoreSpec.name` e' tipato `StoreName`, un'unione di cinque stringhe da cui
dipendono `RawDataSet`, `emptyRawDataSet`, ogni firma di `transform`,
`buildBackup`, i `counts` di `parseBackup` e `STORE_NAMES` — diciassette
occorrenze in quattro file. Allargarla a sei farebbe tre danni, e il terzo e'
fatale:

1. `RawDataSet` guadagnerebbe una chiave, e ogni migrazione dovrebbe averla;
2. `buildBackup` metterebbe lo scatto **dentro il backup** — un backup che
   contiene lo scatto del backup precedente, ricorsivo e sbagliato;
3. **`replaceAll` cancella `STORE_NAMES`**: lo scatto verrebbe distrutto dalla
   stessa transazione che dovrebbe proteggerlo.

> **Che le tre liste — cosa si migra, cosa finisce nel backup, cosa `replaceAll`
> cancella — coincidano oggi e' una coincidenza, non un fatto.** Lo scatto non
> crea questo debito: lo **scopre**.

Quindi nasce la famiglia degli **store di sistema**. `StoreName` resta i cinque
dell'archivio; le tre liste diventano tre.

### `replaceAll` cambia contratto, e non e' un parametro in piu'

Per **ADR 008** lo scatto e l'import stanno **nella stessa transazione**.
Altrimenti esiste uno stato osservabile *"import senza scatto"*, che e'
esattamente quello da cui lo scatto protegge. `replaceAll` oggi apre la
transazione sui soli `STORE_NAMES`: deve aprirla su tutti gli store coinvolti, e
lo scatto e' parte di cio' che quell'operazione **significa**, non un argomento
opzionale.

### La regola di scarto: al ripristino successivo

**Ne esiste sempre e solo uno, l'ultimo.** Le altre due strade — dopo N giorni, o
a mano — chiedono rispettivamente un orologio e un bottone. E in un'app senza
account **un orologio ha lo stesso problema di `updatedAt` al punto 1**: e' la
stessa obiezione, in una stanza piu' piccola.

Costo massimo: 1,3 MB costanti.

### E dev'essere trovabile, o e' una rete che nessuno sa di avere

Subito dopo l'import sulla schermata, e **in Impostazioni finche' lo scatto
esiste**, con **la data di cio' a cui riporterebbe** — non un "Annulla" nudo, che
non dice a cosa. Quando non c'e' nessuno scatto **la voce non compare**: e'
assenza strutturale, non uno stato vuoto. E' la stessa distinzione della striscia
dei sette giorni sulla Home — *una sezione non sparisce perche' i suoi dati sono
vuoti; sparisce se la funzione a cui appartiene non esiste per questo utente*.

## 3. L'import accetta solo stati che l'app avrebbe potuto produrre

**Misurato**: `parseBackup({app:'cent', schemaVersion:5, data:{}})` restituisce
`ok: true` e un `DataSet` valido. **54 byte** che, importati, cancellano
l'archivio e lasciano l'app con **zero categorie e zero spese** — e non si
ri-semina, perche' le categorie di default nascono solo `if (settings === null)`
e `settings` non e' null.

La regola non e' *"rifiuta i backup vuoti"*: quella sarebbe una preferenza. Si
deriva:

> **L'import accetta solo stati che l'app avrebbe potuto produrre.**

**Zero spese e' producibile** — e' l'export di un'installazione nuova. **Zero
categorie no**: l'app le semina al primo avvio e il tetto di otto attive non
permette di archiviarle tutte. **Il criterio cade quindi sulle categorie, non
sulle spese**, e non l'ha scelto nessuno.

Nello stesso giro, la stessa famiglia:

- **`app` assente non passa.** Misurato: oggi `parseBackup({schemaVersion:5,
  data:{}})` da' `ok: true`. Rompe la retrocompatibilita' con **zero file reali**
  — ogni file scritto da `buildBackup` ha `app: 'cent'`.
- **`ok: true` non convive con issue di severita' `error`.** Misurato: un file in
  cui **tutte** le spese sono illeggibili da' `ok: true, counts.expenses: 0,
  discarded: 2` e due issue `error`. `ok` significa *"nessuna issue di severita'
  error"*, altrimenti non significa niente.
- **Il buco della ri-semina si chiude dov'e'**, non solo all'import: se
  `settings` esiste e le categorie sono vuote, oggi l'app non semina **mai**.
  Quello stato e' raggiungibile anche senza import, e l'import lo ha solo reso
  facile da raggiungere.

## 4. `Settings` si divide, e la divisione era gia' scritta

CLAUDE.md dice da giorni che `language`, `onboardingCompletedAt`, `lastBackupAt`
e `theme` **descrivono il dispositivo** e non i dati. Oggi `parseSettings` li
legge tutti e quattro dal file e `importBackup` sostituisce il record `settings`
**intero**: la guida ricomparirebbe sopra i dati appena importati e la lingua
tornerebbe ad "Automatica" — nell'istante in cui l'utente ha appena dimostrato di
non essere alle prime armi.

- **`language`, `theme`, `onboardingCompletedAt`: l'import non li tocca.**
- **`lastBackupAt` prende l'`exportedAt` del file.** Dopo un ripristino l'ultimo
  backup **e' proprio quello appena importato**, ed e' la risposta utile alla
  domanda che quella riga pone. E' l'unico dei quattro che non e' ne' importato
  ne' conservato: e' **derivato**.

**Esiste un test che codifica il comportamento vietato** — un `toEqual`
sull'intero stato dopo un round-trip. **Si ripara prima del codice**: un test che
difende un difetto e' l'artefatto che domani ne giustifica la reintroduzione.

## 5. L'anteprima dice i fatti su cui si decide

- **`exportedAt` non si butta piu' via.** Misurato: le chiavi del file sono
  `["app","schemaVersion","exportedAt","data"]`, e `'exportedAt' in preview` e'
  `false`. E' **il fatto piu' importante per decidere se ripristinare**, ed era
  l'unico che l'anteprima non mostrava. `null` quando il file non ce l'ha: in quel
  caso la riga si scrive **senza data**, non con una inventata.
- **`counts` conta cio' che l'utente vedra', non i record del file.** Sul primo
  backup reale avrebbe detto **6 spese dove l'app ne mostra 3** — le altre tre
  sono lapidi. Un numero che mente per eccesso in una schermata che chiede una
  conferma distruttiva.
- **`fromSchemaVersion: null` non e' un ramo.** *"Aggiorna l'app"* e *"questo non
  e' un backup"* sono messaggi **opposti** e oggi hanno lo stesso valore in quel
  campo. **La UI ramifica sull'issue, mai sul campo.**

## 6. La conferma, e la data dentro la frase

> Ripristinando un backup del ‹data›, le spese registrate dopo quella data non ci
> sono piu', e le ricorrenti verranno rigenerate da quella data in poi.

**La data sta dentro la frase, non accanto.** Una data in un'etichetta separata si
legge come metadato del file; dentro la frase e' il **soggetto** di cio' che sta
per succedere.

E la seconda meta' non e' un dettaglio tecnico: e' la conseguenza di ADR 018
emendata, ed e' un fatto che l'utente puo' verificare nello Storico. La regola
sui messaggi vale qui nel suo rovescio — **un fatto vero che nessun messaggio
dice**.

## 7. Cosa NON e' cambiato, e vale la pena scriverlo

**Le migrazioni sono gia' una fonte sola.** `MigrationStep.transform` e' una
funzione pura su record grezzi, e i due consumatori — l'apertura del database e
l'import — usano **lo stesso array**. Un backup a schema 4 importato in un'app a
5 passa dalla stessa catena del database locale, non da una copia.

**E il caso opposto e' gia' chiuso**: `SchemaTooNewError` rifiuta l'intero file
prima di qualunque scrittura, con la ragione scritta accanto — *aprirli con uno
schema piu' vecchio significherebbe scartare in silenzio i campi che non
conosciamo e riscriverli mutilati*.

Sta scritto qui perche' **e' il tipo di cosa che qualcuno riscrivera' "per
sicurezza"**, trovandosi con due catene di migrazione che divergeranno al primo
schema nuovo.

## 8. Fuori dalla fase

**`RecurringRule.endDate` esce.** Non serve a chiudere il ciclo export→import:
non e' nel tipo, non ha produttore, e **nemmeno un backup poteva contenerlo**. Va
nel suo commit, col campo di input, i due rami di lettura e le due chiavi i18n
**insieme** — o `dead-surface` va rosso.

## E una cosa da tenere a mente mentre si costruisce

**L'anteprima, la conferma e l'idempotenza che nascono qui sono le stesse che
usera' B4**, l'import dalla banca — dove la funzione non e' il parser ma la
**riconciliazione**. E' la parte riusabile, e vale la pena farla bene una volta.
