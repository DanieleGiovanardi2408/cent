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

### La migrazione 5 -> 6, verificata su una copia del backup reale

**3 settembre 2026.** CLAUDE.md lo chiede prima di una migrazione che tocchi
record esistenti, e questa ne tocca **uno**: il singleton delle impostazioni,
campo `schemaVersion`. Provata sulla catena intera **4 -> 6**, perche' e' quella
che girera' davvero sul telefono:

    ok=true, da schema 4 -> 6      issues=[]      scartati=0
    spese      18 -> 18            categorie   8 -> 8
    regole      2 -> 2             budget      1 -> 1
    somma centesimi   88.493 -> 88.493
    lapidi                 6 -> 6
    settings.schemaVersion 4 -> 6      <- l'unico record cambiato
    ancore mensili         [25, 25]    (derivate dal passo 3->4, intatte)

**Niente perso, niente riscritto tranne il campo che doveva cambiare.** Le sei
lapidi sopravvivono, che e' il caso su cui una migrazione sbaglia piu' spesso —
un filtro distratto le tratta come record invalidi.

**Sulla forma della prova**: il file vero non e' stato committato, e il suo
percorso non e' finito dentro nessun test — e' arrivato da una variabile
d'ambiente, e senza quella il test non gira. E' gia' successo in fase 3, e quei
test furono cancellati per questo.

**E l'ADR aveva torto su un dettaglio.** Diceva *"uno step con `createStores` e
senza `transform`: nessun record viene toccato"*. Misurato: senza `transform`, un
database che arriva dalla v1 finisce a schema 6 con `Settings.schemaVersion`
**uguale a 5**, mentre un'installazione nuova nasce con 6. Serve il `transform`
minimo, sul solo singleton. **L'argomento resta intero** — parlava di non
riscrivere l'archivio, che e' cio' che costa — e l'archivio esce per riferimento
identico.

### Il lato lettura, differito

`snapshotTakenAt`, `restoreSnapshot` e `snapshotPayload` **non sono state
spedite** con lo scatto. Lo scatto si prende; niente lo legge e niente lo
ripristina, perche' non esiste ancora una schermata che lo chieda.

**La ragione e' la regola, non il tetto**: *una funzione si spedisce insieme al
suo chiamante, o non si spedisce* — la stessa con cui `expensesInRange` e
`planBudgetChange` sono state cancellate, e con cui `note` ed `endDate` sono
uscite dai tipi. Il tetto del bundle ha fatto da **rivelatore**: 61.554 byte
contro 61.440 con le due dentro, 61.215 senza. Se fosse stato piu' alto la regola
sarebbe valsa lo stesso, e sta scritto perche' fra sei mesi la tentazione sara'
rimetterle "tanto adesso c'e' spazio".

**Condizione**: arrivano nel commit del dialogo di ripristino. **Se quel dialogo
non arriva in fase 7, non arrivano nemmeno loro** — e lo scatto resta una rete
che nessuno puo' tirare, che e' un difetto suo e va guardato allora.

Gli argomenti che vivevano su quelle funzioni stanno qui, perche' sono decisioni
e una decisione non vive nel commento di una funzione che non esiste:

**Il ripristino consuma lo scatto**, per tre ragioni in ordine di forza:

1. **tenerlo direbbe una cosa falsa.** La voce dichiara la data dello stato a cui
   riporta, e dopo il ripristino quello stato e' quello in cui si e' gia': un
   gesto che non fa niente, con accanto un fatto che lo schermo non conferma.
2. **scambiarlo** — mettere al suo posto i dati importati, per disfare il
   disfacimento — sarebbe un redo che nessuno ha chiesto, e in uno slot solo: la
   rete diventerebbe un interruttore fra due stati, cioe' un'altra funzione.
3. **cio' che si perde ha gia' un'altra copia.** Il file importato l'ha scelto
   l'utente e sta ancora dove stava; **lo stato pre-import non esisteva da
   nessun'altra parte**, ed e' l'unica cosa che questa rete e' nata per tenere.

**Il carico va migrato al ripristino, non all'upgrade.** Fra l'import e il
ripristino ci sta un aggiornamento della PWA, e **le migrazioni non toccano gli
store di sistema**: uno scatto preso a schema 6 e ripristinato sotto lo schema 7
dev'essere portato avanti al momento in cui rientra. Per questo
`PreImportSnapshot.schemaVersion` **resta scritto** anche senza un lettore: e'
l'unico istante in cui quel numero si puo' sapere, e ricostruirlo dopo sarebbe
indovinarlo.

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
categorie no. Il criterio cade quindi sulle categorie, non sulle spese**, e non
l'ha scelto nessuno.

### La prima derivazione era sbagliata, e quella giusta e' piu' forte

Questa riga diceva: *"l'app le semina al primo avvio e **il tetto di otto attive
non permette di archiviarle tutte**"*. **Archiviarle** tutte davvero non si puo'.
Ma **cancellarle** si': `planCategoryDeletion` non ha nessun pavimento, e su
un'installazione nuova — senza spese e senza regole — le otto se ne vanno una per
una. Misurato:

    8:ok 7:ok 6:ok 5:ok 4:ok 3:ok 2:ok 1:ok   ->   restano 0

Quindi **lo stato e' producibile**, e un export preso li' e' un file vero che
questa regola rifiuta. La regola non cade: cambia argomento, e il nuovo e' piu'
forte.

> **Cio' che non e' producibile non e' lo stato: e' sopravvivergli a una
> riapertura.**

Con la ri-semina, importare quel file scriverebbe uno stato che **l'app disfa da
sola al prossimo avvio** — e nel frattempo lascerebbe a schermo una griglia da cui
non si puo' inserire niente, cioe' il principio guida n.1 azzerato senza un
messaggio. Rifiutare all'ingresso e' l'unico dei due modi che lo dice.

**E la coppia va letta insieme**: `openRepository` semina anche con `settings`
gia' scritto, `parseBackup` rifiuta un file senza categorie. Sono la stessa
affermazione — *un archivio inizializzato ha sempre categorie* — detta da due
porte, e nessuna delle due basta da sola: la prima ripara dopo, la seconda
impedisce prima.

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

## 6b. Il selettore di file su iOS, e i tre stati che e' facile confondere in uno

**E' la trappola vera di questo commit.** Un `<input type="file">` in una PWA apre
il foglio File, e il file puo' stare **su iCloud Drive**: arriva lento, o non
arriva.

### Tre stati, non uno

> **sto leggendo il file** · **il file non si e' potuto leggere** · **il file si e'
> letto e non e' un backup valido**

Il secondo e il terzo hanno **cause e rimedi opposti**, e collassarli in un
"file non valido" manda la persona a cercare un altro file quando il problema era
la rete, o a riprovare all'infinito quando il problema era il file.

- **Sto leggendo**: puo' durare secondi su iCloud. Serve dirlo, o il tocco sembra
  non aver fatto niente e si tocca di nuovo.
- **Non si e' potuto leggere**: il rimedio e' *riprovare*, o scaricare il file
  sul telefono. Non e' un difetto del backup.
- **Letto ma non e' un backup**: il rimedio e' *scegliere un altro file*.
  Riprovare con lo stesso non serve a niente.

### `accept` — e questo lo dice solo il telefono

Su iOS `accept` si risolve in UTI, e **filtrare male significa che i file JSON
appaiono grigi e non selezionabili**: la funzione non parte proprio, e il difetto
si presenta come *"il mio backup non c'e'"*. E' il caso peggiore, perche' e'
indistinguibile da un bug del salvataggio.

La forma che si spedisce dichiara **tutte e due** le strade — il tipo MIME e
l'estensione — perche' e' quella che degrada meglio se una delle due non e'
riconosciuta. **Ma qual e' quella giusta e' un fatto del dispositivo**: da questa
macchina non si deriva, e sta in "Verificabili solo sul dispositivo". Va provato
con un file su iCloud Drive **e** uno locale, prima che il link vada a qualcuno.

## 6f. L'azione dipende dallo stato, come il messaggio

Ai quattro stati corrispondono **tre azioni diverse**, e non una con quattro
etichette.

| stato | azione |
|---|---|
| **sto leggendo** | nessuna |
| **non si e' potuto leggere** | **Riprova** — e riprova *sul serio* |
| **non e' un backup** | **Scegli un altro file** (riapre il selettore) |
| **e' un backup, un record e' rotto** | **Scegli un altro file**, piu' il messaggio col path e i due rimedi |

### "Riprova" deve rileggere lo stesso file

**E' l'unico stato in cui riprovare ha senso**: il file va bene, e' la **lettura**
che e' fallita. Su iCloud Drive la seconda volta spesso riesce, perche' nel
frattempo il download e' partito — quindi il reader tiene l'ultimo `File` e lo
**rilegge**, senza riaprire il foglio del sistema.

### Perche' un "Riprova" che riapre il selettore e' una bugia

Il giro A ha lasciato **un'azione sola** (`onRead`) con due etichette: il bottone
dice *"Riprova"* e fa esattamente *"Scegli un altro file"*. E' il difetto scritto
nel codice, ed e' peggio di quanto sembri.

> Promette di **ritentare** e chiede invece di **ricominciare**.

E l'esito e' prevedibile: l'utente ripesca **lo stesso file**, ottiene **lo stesso
errore**, e conclude che **l'app e' rotta**. Non e' un fastidio: e' il momento in
cui una persona smette di provare a recuperare i propri dati.

E' la stessa famiglia della **terza forma** della regola sui messaggi — *un rimedio
che il dispositivo non puo' eseguire* — applicata all'**azione** invece che al
testo: qui il dispositivo potrebbe eseguirlo, ma il bottone non fa quello che dice.

> **Un'etichetta e' una promessa sull'azione. Se l'azione e' la stessa per due
> etichette diverse, una delle due sta mentendo.**

E vale il rovescio, che e' il vero rischio di semplificazione: unificare le due
etichette in *"Scegli un altro file"* farebbe sparire la bugia **e anche il
rimedio giusto** — chi non e' riuscito a leggere un file da iCloud non ha bisogno
di un altro file, ha bisogno di **quello**, un momento dopo.

## 6c. L'anteprima e' un prima/dopo, non un elenco

Il fatto da capire in un colpo d'occhio e' **cosa cambia**, e con la sostituzione
quel fatto ha **due meta'**:

    adesso    47 spese, 8 categorie
    dopo      18 spese, 8 categorie

piu' la data del file **dentro** la frase.

**Un conteggio solo dice cosa entra e tace su cosa esce**, che e' la meta' che fa
male. Il prima/dopo rende visibile la distruzione **senza drammatizzarla**: sono
due numeri accostati, non un avvertimento.

E i conteggi sono quelli che l'utente **vedra'**, non i record del file: sul primo
backup reale sarebbero 6 spese contro le 3 che lo Storico mostra, perche' tre sono
lapidi. Un numero che mente per eccesso in una schermata che chiede una conferma
distruttiva.

## 6d. La rete cambia il tono della conferma

**Con lo scatto pre-import il tocco sbagliato e' recuperabile**, quindi la
conferma non deve spaventare: niente "scrivi CANCELLA per confermare", niente
rosso, niente punti esclamativi. **Una frase chiara, e un Annulla visibile dopo.**

> Una conferma drammatica su un'operazione **reversibile** insegna a temere la
> cosa sbagliata — e poi la stessa persona tocchera' con leggerezza qualcosa che
> reversibile non e'.

E' la stessa economia dell'attenzione con cui questo progetto rifiuta i dialoghi
"Sei sicuro?" e sceglie soft delete piu' toast: **il peso di un avviso e' un
bilancio, non una scelta locale.**

## 6e. Dove si atterra dopo: sulla Home

L'import parte da **Impostazioni** e finisce sulla **Home**.

Il senso di ripristinare e' **vedere che i dati ci sono**. Restare in Impostazioni
lascia la persona a fissare un elenco di voci mentre si chiede se ha funzionato —
e la risposta a quella domanda non e' in quella schermata.

E' anche cio' che rende l'Annulla trovabile nel momento giusto: sulla Home, dove
si vede lo stato ripristinato, "torna a com'era" ha un referente a schermo.

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
