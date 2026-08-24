# Roadmap

Le fasi. Una fase e' finita quando qualcosa gira davvero sul telefono, non
quando il codice compila.

| Fase | Cosa | Finita quando |
|---|---|---|
| 0 | Scaffold, PWA, tema, safe area | Si installa da Safari e riapre offline |
| 1 | Data layer + test | Test verdi su date, ricorrenze, budget |
| 2 | Aggiungi spesa + storico + export JSON minimo | Una spesa vera inserita in < 5s sul telefono, e si puo' salvarla fuori |
| **4** | **Budget + Home** | La Home dice quanto si puo' spendere oggi |
| **3** | **Prerequisiti per condividere**: categorie, Impostazioni, due lingue, guida | Il link si puo' mandare a un amico |
| 5 | Spese ricorrenti | Catch-up dopo 40 giorni, zero duplicati |
| 6 | Statistiche | Grafici SVG, nessuna libreria aggiunta |
| 7 | Export/import completo + backup | Round-trip senza perdita, import con anteprima |
| 8 | Packaging e pubblicazione | README con GIF, CI verde, app live su Pages |

**La 4 si fa prima della 3.** I numeri restano quelli: rinumerare renderebbe
sbagliati i riferimenti "fase 3" e "fase 4" gia' sparsi nelle ADR e nei commenti
del codice. Cambia l'ordine, non l'identita' delle fasi.

Perche' lo scambio:

- Le categorie **le abbiamo scelte deliberatamente** e non saranno sbagliate prima
  di una settimana d'uso. Il numero "quanto posso spendere oggi" e' invece il
  motivo per cui si apre l'app **quando non si sta pagando** — cioe' l'unico
  motivo che oggi non e' servito da nessuna schermata.
- E quando arriveremo alle categorie modificabili **sapremo quali sono
  sbagliate**, invece di indovinarlo. Rimandarle non e' un costo: e' aspettare il
  dato che rende la fase utile.

Dopo la fase 2: usare l'app per una giornata vera prima di proseguire.


## Cambio di scopo — 23 agosto 2026

Cent passa da app per il suo autore ad app usata **anche da altre persone**: amici
in Erasmus ad Amsterdam. Resta local-first e senza account — ognuno ha i propri
dati sul proprio telefono — ma il pubblico cambia, e con lui alcune premesse su cui
si e' deciso.

**Questo e' il controllo 0 del critico applicato a un cambio di premessa invece che
a una regola nuova**: quando cade una premessa, il codice scritto sotto di essa non
si adegua da solo.

### Premesse cadute

**a) Le otto categorie sono personali.** `Coffeeshop` e `Sigarette` sono scelte di
una persona sola. Chi non fuma si ritrova **due chip morti** in una griglia dove
abbiamo difeso ogni pixel e imposto un tetto di otto. Da qui il fatto che le
categorie modificabili non siano piu' un miglioramento ma un **prerequisito**.

**b) Il taglio di "Tocca una categoria per salvare" era giustificato da "l'unico
utente lo sa gia'".** Quella premessa e' caduta. **Il chip-come-conferma non esiste
in nessun'altra app**: nessuno lo indovina. **DECISO** — vedi "La riga ... torna, agganciata a uno stato" qui sotto: la riga
torna, mostrata finche' non si sono salvate tre spese, e la guida la copre
comunque. Non una delle due per inerzia: entrambe, con compiti diversi.

**c) Il cents-first l'ha sbagliato due volte in sessanta secondi chi l'ha
progettato.** Con piu' utenti al primo giorno, l'innesco della Parte 2 del
tastierino (euro grandi, centesimi piccoli) e' da considerare **gia' scattato**:
non si aspetta che l'audit trovi un altro mis-inserimento, perche' quello
riguardava una persona che il meccanismo lo aveva progettato.

### Regola: il link non si condivide ancora

**Non si manda a nessuno finche' categorie modificabili, Impostazioni, due lingue e
guida non sono tutte e quattro finite.** Le prime impressioni si spendono una volta
sola: un'app che chiede di installarsi, poi mostra due chip che non c'entrano
niente e non spiega come si salva, non ha una seconda occasione.

## Compiti espliciti della fase 2

### Export JSON minimo — anticipato dalla fase 7

Un bottone che scarica tutto in un file JSON. Nient'altro: import, CSV e
anteprima restano in fase 7.

Perche' e' stato anticipato: i dati iniziano a esistere in fase 2, e nel piano
originale il primo modo per metterli al sicuro arrivava in fase 7. Erano cinque
fasi di spese vere su una piattaforma che puo' cancellarle da sola (vedi sotto).
Un errore di sequenza, non una feature mancante.

### Verifica manuale: storage di Safari — FATTA, vedi "Verifiche sul dispositivo"

Esito: **separati**. La conseguenza e' in ADR 011.


## Verifiche sul dispositivo — FATTE

Eseguite sull'iPhone, sulla PWA installata da GitHub Pages. Non sono piu' aperte.

### Export JSON — funziona
Il file e' stato scaricato, aperto e verificato riga per riga: sei spese, otto
categorie, il budget, le impostazioni, `schemaVersion: 2`. **Il quinto esito
silenzioso** — `kind: 'downloaded'` che non scarica niente, il caso peggiore
previsto al gate della fase 2 — **non si e' verificato.**

Verificato di passaggio un dettaglio che finora era solo testato: una spesa creata
alle `23:13:38Z` ha `date: '2026-08-23'` e `timeMinutes: 73` (01:13 locali). **La
trappola della mezzanotte regge su dati veri**, non solo nei test: data civile e
minuti vengono dallo stesso istante e non appartengono a giorni diversi.

### Primo budget a meta' settimana — come previsto
La Home si comporta come deciso in [ADR 010](adr/010-il-budget-e-del-periodo.md).
Tre note di copy raccolte sul dispositivo sono state corrette subito dopo.

### Storage di Safari e della PWA — SEPARATI, fatto accertato
Non e' piu' una cosa da verificare. Sono sandbox distinte, provato sul telefono.
La conseguenza prevista fin dalla fase 2 — **impedire, non sconsigliare** — e'
stata applicata: vedi
[ADR 011](adr/011-fuori-da-standalone-e-una-pagina-di-installazione.md).

## Mis-inserimenti da cents-first

Dopo 24 ore d'uso vero: due importi digitati in centesimi invece che in euro
(`0,23` per `23,00`, `0,25` per `25,00`), il secondo sopravvissuto **13 ore e 17
minuti**. Il cents-first **resta** e il tasto virgola **non torna**: ha eliminato
per costruzione ogni input malformato, e ADR 004 non si riapre.

### Fatto: l'importo e' sceso fra le categorie e il tastierino

La causa non era disattenzione, era geometria — misurata: **246 px** dal tasto
all'importo contro **74 px** dal tasto al chip da toccare, con l'occhio che si
ferma 172 px prima del numero. A ~30 cm sono ~7 gradi di eccentricita', dove non
si risolve la posizione di una virgola. La controprova era gia' nel repo: in
orizzontale sono **4 px** e il problema non esiste.

Non e' stata fatta nessuna baseline prima di spedire, di proposito: **nessun esito
di quella misura avrebbe cambiato l'azione, quindi non era una misura ma un
rinvio.** Una misurazione vale il suo costo solo se qualche risultato cambia cosa
fai. Il difetto era strutturale — vero anche in una settimana senza errori — e un
difetto strutturale non si conta, si corregge.

Costo accettato: il chip piu' vicino si allontana dal pollice di ~57 px, ~70 ms
sul secondo tap.

### Da fare in fase 3: euro grandi, centesimi piccoli

`0,23 €` e `23,00 €` hanno oggi la stessa quantita' di inchiostro, e il
discriminante e' una virgola da 3 px. Rendendo la parte frazionaria al ~55% del
corpo, la magnitudine smette di essere codificata in *quale* glifo e diventa
**quanto inchiostro grande c'e'** — che si vede in periferia. Costo stimato ~150
byte con `formatToParts`.

**L'innesco e' scattato per il cambio di scopo, non per l'audit.** Era scritto cosi':
*"si spedisce se l'audit trova un altro mis-inserimento dopo che lo spostamento
dell'importo e' in produzione"*. Quella condizione presupponeva **un solo utente,
che il meccanismo lo aveva progettato** — e che ciononostante lo ha sbagliato due
volte in sessanta secondi. Con altre persone al primo giorno la condizione non ha
piu' senso di aspettare: si considera **gia' scattata**.

Resta la divisione del lavoro fra i due rimedi, che e' il motivo per cui servono
entrambi: **la guida spiega una volta, la tipografia spiega ogni volta.**


### Scartato: qualunque avviso sotto una soglia

`0,80 €` per un caffe' e' plausibile, quindi qualunque soglia o e' inutile o
grida al lupo. Vale per la UI; **non** vale per l'audit offline, che e' un elenco
letto in blocco e non un allarme al momento sbagliato.

### La riga "failed" resta in cima al foglio, e la ragione non e' che lo stato e' raro

Dopo lo spostamento dell'importo, il messaggio di errore del salvataggio resta a
~278 px dal pollice mentre dice *"Tocca di nuovo la categoria"* — cioe' la stessa
distanza che per l'importo e' stata giudicata inaccettabile. Non si sposta, ma
**"lo stato e' raro" non e' la ragione**: quell'argomento avrebbe giustificato
anche il non correggere lo `0,25`, che era altrettanto raro.

La ragione vera e' un'altra: **il messaggio dice di fare esattamente cio' che si
fa d'istinto.** Se il salvataggio non e' andato, la reazione naturale e' toccare
di nuovo la categoria — l'istruzione e' ridondante rispetto al gesto, quindi non
leggerla non costa quasi niente.

E' il contrario del caso dell'importo, dove **non guardare significava non
sapere**: nessun gesto naturale avrebbe rivelato che `0,23` non era `23,00`.

La distinzione e' quella che serve la prossima volta: un messaggio fuori dal
percorso dell'occhio e' un problema quando porta un'informazione che l'utente non
ha in nessun altro modo, non quando ripete cio' che farebbe comunque.

### Dissenso registrato: il chip "Oggi" non si toglie

Era stato proposto di eliminarlo — la data e' gia' oggi, quindi e' raggiungibile
solo come annullamento di "Ieri", e occupa lo slot piu' raggiungibile della riga.

**Rifiutato, e la ragione vale piu' della decisione**: il rischio nominato (tap
accidentale) ha **conseguenza zero**, perche' toccare il chip gia' selezionato e'
un no-op. E toglierlo renderebbe "oggi" uno **stato implicito** — niente
selezionato = oggi — che e' esattamente la categoria di cose che questo progetto
ha passato la sessione a eliminare. La larghezza liberata non serve: il chip nota
sta gia' comodo.

Se la proposta torna, si riparte da qui.

### L'audit: `scripts/audit.mjs`

Uno **script**, non una schermata: zero byte nel bundle, zero superficie nella UI,
e puo' essere piu' ricco di quanto una schermata potrebbe permettersi. Si lancia
sul file di backup quando si esporta:

    node scripts/audit.mjs ~/Downloads/cent-2026-08-23.json

Cerca due firme, e servono entrambe:

- **L'errore preso** — una cancellata `D` e una nuova `N` con stessa categoria,
  stessa data, `N.amountCents === D.amountCents * 100`, create a pochi minuti di
  distanza. Riporta la **latenza di accorgersi** (`deletedAt − createdAt`), che e'
  la metrica che conta: sopra i 60 s l'errore e' sopravvissuto abbastanza da
  sporcare le statistiche della fase 6. Non e' `N.createdAt − D.deletedAt`, che
  misura solo quanto si e' veloci a rifarla.
- **L'errore mai preso** — le spese **vive** sotto 1 €, da rileggere a mano. E'
  l'unico modo di vedere gli errori che non sono mai stati notati.

Non e' uno strumento d'esperimento: e' un audit permanente, e resta utile anche
se il problema non si ripresenta piu'.

## Cosa hanno insegnato le prime 24 ore d'uso

### Anticipare la cancellazione dallo Storico e' servito davvero
La cancellazione e' stata tirata dentro la fase 2 con l'argomento "dopo due giorni
qualche riga sbagliata ci sara' di sicuro", contro l'obiezione che fosse scope
della fase 3. **E' stata usata due volte in meno di 24 ore.**

Da ricordare la prossima volta che si dubitera' se anticipare una rete di
sicurezza: il costo di anticiparla si paga una volta, il costo di non averla si
paga ogni volta che serve e non c'e'.

## La riga "Tocca una categoria per salvare" torna, agganciata a uno stato

**Decisione**: la riga torna, e si mostra **finche' l'utente non ha salvato tre
spese**. Poi mai piu'.

**Due stati, non un messaggio solo.** Con l'importo vuoto i chip sono disabilitati:
dire "tocca una categoria per salvare" quando toccare non fa niente **invita a un
gesto che fallisce**, nel momento peggiore.

    importo vuoto    ->  "Digita l'importo"
    importo scritto  ->  "Tocca una categoria per salvare"

**Il conteggio si deriva, non si memorizza.** Il numero di spese e' gia' nel
repository: aggiungere un campo a `Settings` significherebbe o infilarlo nella
migrazione 2 -> 3, o farne una seconda **su dati veri**, per un contatore gia'
ricavabile. E' la stessa dottrina di `budgetCoveredPeriodStart` e del periodo della
Home: **si deriva da cio' che c'e', non si duplica**.

### Correzione: la ragione dell'`aria-live` era sbagliata, la conclusione no

Qui sopra era scritto che l'obiezione dell'annuncio doppio di VoiceOver **"e'
evaporata… perche' un testo statico non va marcato `aria-live`"**.

**Quella premessa e' falsa per la copy che stavamo per scrivere.** La riga non e'
statica: ha **due stati** e commuta esattamente alla prima cifra — cioe' nello
stesso frame in cui cambia l'importo, che e' l'altra live region. Due region
`polite` aggiornate insieme, due annunci in coda, e quello che conta arriva
secondo.

**La conclusione sopravvive, per un'altra ragione**: la riga **non e' una live
region per progetto**. Non e' un valore che cambia, e' **un'istruzione** — si legge
esplorando, non si annuncia. Annunciarla a ogni cifra sarebbe rumore anche se fosse
sola in coda.

Scartata anche la via di mezzo (`aria-live` condizionale, attivo solo per
`failed`/`max`): teneva in vita la cosa sbagliata, e avrebbe fatto discutere
**quando** annunciare invece di accorgersi che non va annunciato mai.

E la cosa che quella live region cercava di fare va dove serve davvero: **nel nome
accessibile dei chip** — *"Spesa, tocca due volte per salvare"*. Cosi' chi usa
VoiceOver lo scopre **sul controllo che sta per toccare**, non in un annuncio che
puo' arrivare secondo. Non ci si era arrivati perche' si stava scegliendo fra due
formulazioni di una riga, cioe' guardando il canale sbagliato.

Il cambio di ragione resta scritto invece di essere riscritto: e' il terzo caso in
due giorni di una premessa erosa senza che il codice cambiasse.

### Perche' tre e non uno

Non e' un numero scelto a sentimento: e' **un'asimmetria di costo**.

- Mostrarla **due volte di troppo** costa **zero**: testo statico, spazio gia'
  riservato, nessun `aria-live`, per chi ha gia' imparato.
- Mostrarla **troppo poco** costa un utente **senza piu' nessun canale** che gli
  dica come si salva, in un'app dove il salvataggio non ha un tasto.

Un lato dell'errore e' gratis, l'altro no: si prende quello gratis. E' la stessa
asimmetria dell'indicatore di backup, che deve sbagliare **verso l'allarme**.

### Come ci siamo arrivati — e' il caso concreto che giustifica il controllo 0

**La decisione di tagliare la riga era corretta con le premesse di allora.** Non e'
stata un errore: sono cambiate le premesse, e nessuno se ne sarebbe accorto da
solo.

Al gate della fase 2 la riga fu tagliata per quattro ragioni:

1. **ridondante** — i chip passano da `opacity: 0.45` a piena nello stesso
   istante, in un canale che l'occhio guarda davvero;
2. **31 px** in cima a un foglio dove il layout era saturo;
3. un **secondo `aria-live`** che alla prima cifra metteva VoiceOver in coda con
   due annunci, di cui contava il secondo;
4. implicita, e mai scritta: **l'unico utente lo sapeva gia'**.

Poi due cose sono successe, **nessuna delle due riguardava questa decisione**:

- correggendo il salto di layout che la rimozione stessa aveva prodotto, la riga
  e' stata **pinnata a esattamente una riga di testo**. Da quel momento la riga
  **esiste comunque, vuota, con l'altezza riservata**: rimetterci un messaggio
  costa **zero pixel e zero salti**. Le ragioni 2 e 3 sono evaporate come effetto
  collaterale di una correzione non correlata — la 3 perche' un testo statico non
  va marcato `aria-live`;
- il **cambio di scopo del 23 agosto** ha invalidato la 4: il chip-come-conferma
  non esiste in nessun'altra app, e nessuno lo indovina.

Delle quattro ragioni ne resta **una**, la prima — ed e' vera **solo per chi ha
gia' imparato**, che e' esattamente cio' che l'aggancio allo stato risolve.

**Nessuno di questi due cambiamenti ha toccato il codice della riga.** Una
decisione puo' diventare sbagliata senza che il suo codice cambi, e senza che
nessuno la stia guardando: e' il motivo per cui il controllo 0 del critico esiste,
e questo e' il caso che lo dimostra meglio della regola astratta.

## Il lampo di lingua all'avvio: si riserva la larghezza, non si cachea

Chi ha scelto una lingua **diversa** da quella rilevata dal telefono vede il guscio
nella lingua rilevata per i pochi frame fra il primo render e l'apertura del
database — conseguenza diretta della regola "Ordine di pittura", che dipinge il
guscio prima dei dati.

**La cura non e' una copia sincrona della lingua.** La regola non chiede che il
primo frame sia definitivo: chiede che l'arrivo dei dati **non sposti nulla**,
CLS = 0. Il difetto misurabile e' lo spostamento delle schede, non il cambio di
parole.

Quindi: alle etichette si riserva **la larghezza massima fra le due lingue**.
Deterministica, calcolabile, nessuna seconda copia di niente. Il lampo resta ed e'
cosmetico.

Il caso va nella sonda e2e — **lingua scelta diversa da quella rilevata** — perche'
oggi non e' misurato: chi non ha scelto niente non lo vede mai, e **un difetto che
nessun test guarda torna**.

### L'escalation, gia' argomentata: quando una cache sincrona sarebbe legittima

Se un giorno la riserva di larghezza non bastasse, la copia sincrona della lingua
fuori da IndexedDB torna sul tavolo — e passa il nostro stesso test, quindi non si
ridiscute da capo:

**Una cache che compra qualcosa e' legittima; una che non compra niente e' solo
divergenza.** Qui comprerebbe una **lettura sincrona che IndexedDB non puo' dare**
— a differenza del flag di `persisted()`, cancellato nella fase 2, che duplicava
uno stato **gia' disponibile** dal browser a ogni avvio.

E ha una proprieta' rara: **quando e' stantia degrada esattamente al comportamento
di oggi** — cioe' il guscio nella lingua sbagliata per pochi frame. Non puo'
introdurre un difetto che non esista gia'. E' la differenza fra una cache che, se
sbaglia, produce uno stato nuovo e sconosciuto, e una che al peggio torna al punto
di partenza.

## ADR 011 ha reso morto del codice che nessuno ha toccato

`history.blank.install` — la riga *"Aggiungi Cent alla schermata Home: si apre a
schermo intero e parte anche senza rete"* — esiste in **entrambi** i dizionari, e'
resa da `History.tsx` dentro `.hint--install`, ed e' `display: none` salvo
`:root[data-display="browser"]`.

Da ADR 011 in poi quello stato coesiste con l'app **solo su dev build e su `http://`
da rete locale**. Due stringhe tradotte, sei righe di CSS e un `<p>` che **nessun
utente vedra' mai**.

**E' il caso piu' puro della serie**: nessuno ha modificato quel codice, nessuna
grep lo distingue da quello vivo, e nessun test cade. E' morto perche' e' cambiata
una premessa **altrove** — ed e' stato trovato solo perche' si stava per scriverne
una seconda copia dentro la guida.

Cancellato, non spostato: la sua destinazione naturale e' una schermata **il cui
intero mestiere e' gia' quella frase**, con tre passi illustrati invece di una riga.

## Il promemoria di backup ha due soglie, non una

- **Oltre 14 giorni** dall'ultimo export -> l'avviso vive in Home e in Impostazioni.
- **Mai esportato** -> il primo avviso a **7 giorni**.

La ragione della seconda soglia: **il backup che non avviene mai e' il primo**, e
chi non e' entrato in Impostazioni in una settimana non ci entrera' spontaneamente.

Entrambe derivate da `lastBackupAt`, **nessun campo nuovo e nessuna migrazione**: la
distinzione fra le due soglie e' `lastBackupAt` assente contro presente, che e' gia'
nel modello.

## Se la suite locale supera i 5 minuti, si divide

Oggi gli e2e sono ~1,9 minuti su una macchina scarica e ~3 in CI. Va bene.

**La soglia e' decisa adesso, cosi' quando succede non si ridiscute**: se la suite
locale supera i **5 minuti su una macchina scarica**, si divide in due comandi — uno
veloce che si lancia sempre, uno completo prima del commit.

E' la stessa calibrazione dell'hook `pre-commit`, che esegue solo il typecheck e mai
la suite: **una verifica abbastanza lenta viene saltata, e una verifica saltata e'
peggio di una che non esiste** — perche' qualcuno crede che sia girata.

## Fase 3 — Prerequisiti per condividere

Non e' piu' "categorie modificabili". Contiene **quattro cose interdipendenti**, e
sono interdipendenti sul serio: Impostazioni e' il posto dove vivono lingua,
categorie e "rivedi la guida", quindi nessuna delle altre tre sta in piedi senza.

**Di conseguenza la fase 5 si alleggerisce**: la schermata Impostazioni non arriva
piu' li'.

### Promemoria di backup — anticipato dalla fase 7, ed e' una condizione

L'export **esce dalla barra e va in Impostazioni** (a 320 punti barra, due schede e
due bottoni non ci stanno). Ma il bottone in barra non era solo un accesso: **era
un promemoria**. Vederlo faceva esportare. Sepolto in Impostazioni, la frequenza di
backup scende — e da adesso non sono piu' i dati di una persona sola.

Quindi il promemoria che ROADMAP metteva in fase 7 si anticipa: **se non si esporta
da piu' di 14 giorni, un avviso discreto.** Non nella barra, non modale.

**E' una condizione, non un'aggiunta**: senza il promemoria, l'export resta in
barra. Togliere una rete senza metterne un'altra non e' un compromesso, e' una
perdita.

Nota gia' nota e voluta: `lastBackupAt` **non** viene scritto sul ramo di download
non confermabile (`<a download>` in standalone puo' non fare nulla, senza errore),
quindi l'avviso si accendera' a volte a torto. **E' la direzione giusta**, per la
regola gia' scritta in CLAUDE.md: un indicatore di sicurezza che puo' sbagliare
deve sbagliare **verso l'allarme**. Un banner che tace a torto lascia senza copia
chi crede di averla.

### 1. Categorie modificabili, con tetto di otto attive
Regole complete in CLAUDE.md, "Tetto di otto categorie attive". In sintesi:
modificare, aggiungere, riordinare; **massimo otto attive**, infinite in archivio;
**archiviare non e' cancellare** (la categoria resta su tutte le spese che l'hanno
usata, e Storico e statistiche continuano a mostrarla); cancellare davvero solo se
nessuna spesa la usa; **lo scambio e' un gesto solo** — aggiungendo la nona, l'app
chiede quale sostituisce.

Sul riordino vale l'avviso gia' scritto: dopo che la memoria muscolare si e'
formata, cambiare l'ordine costa piu' di quanto sembri. Non impedirlo, dirlo.

### 2. Impostazioni — versione minima
Lingua, budget, categorie, export, **"rivedi la guida"**. Nient'altro in fase 3.

### 3. Due lingue (it / en)
Vincoli in CLAUDE.md, "Due lingue: it / en". I due che si dimenticano:
- **la parita' delle chiavi la garantisce il compilatore**, non un test;
- **la formattazione esce da `src/core`** — va fatto ora, prima che ci siano due
  lingue da cablare invece di una.

**La pagina di installazione in browser va tradotta per prima**: e' la primissima
cosa che un amico vede, e oggi e' l'unica schermata che parla a chi non ha ancora
l'app.

### 4. Guida al primo avvio
**Tre schede, non di piu'.** Saltabile sempre. **Riapribile da Impostazioni**: chi
la salta deve poterla ritrovare.

Contenuto, in quest'ordine — che e' **l'ordine dei danni**, non l'ordine logico:

1. **L'importo si riempie da destra.** Mostrato **in movimento**, non a parole:
   `5 -> 0,05`, `50 -> 0,50`, `500 -> 5,00`. E' l'errore che ha morso l'autore due
   volte in sessanta secondi, e la Parte 2 del tastierino e' la stessa spiegazione
   resa permanente: **la guida spiega una volta, la tipografia spiega ogni volta.**
2. **Il chip della categoria E' il salvataggio.** Non esiste un tasto Salva.
3. **I dati restano su questo telefono**, nessuno li vede, l'export e' l'unico
   backup. Con l'invito a installarla sulla Home se non lo e' gia'.

**Non deve creare una spesa finta per dimostrare.**

**Conformita' ad ADR 009 — e' il punto che sembra vietato e non lo e'.** La guida
**non e' agganciata all'evento di avvio**: e' agganciata allo **stato** "mai
completata". Si mostra a ogni apertura finche' quello stato non cambia, quindi e'
**ripetibile e idempotente** — che e' esattamente cio' che ADR 009 chiede a
qualunque cosa succeda al ritorno in primo piano. Il divieto riguarda i
comportamenti che dipendono dall'*evento*, perche' su iOS quell'evento non e'
affidabile; uno stato persistito non ha quel problema.

### Migrazione 2 -> 3, una sola
`Settings.language` e `Settings.onboardingCompletedAt` **insieme**, entrambi
opzionali con default. Una migrazione sola, non due.

Vale "Da qui in avanti i dati sono veri" (CLAUDE.md): **il piano va verificato su
una copia del backup reale**, non solo su dati sintetici. `cent20260823.json` e' un
campione valido — 6 spese, 3 vive e 3 cancellate, un budget, otto categorie,
`schemaVersion: 2`.

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


## Compiti espliciti della fase 7

### L'anteprima dell'import non deve contare i record cancellati

L'export contiene i record con `deletedAt` — nel primo backup reale erano **3 su
6**. Per un backup e' **corretto** e non si cambia: un backup che perde i soft
delete perde anche l'informazione che quella spesa e' stata cancellata, e un
reimport la resusciterebbe.

Ma l'**anteprima** dell'import e' un'altra cosa: se conta i record grezzi dira'
"6 spese" dove l'app ne mostra 3. Sarebbe un'anteprima che mente **proprio nel
momento in cui serve per decidere** se sovrascrivere i propri dati — cioe'
l'operazione piu' distruttiva dell'app, quella senza undo persistito.

L'anteprima conta le spese vive (`isLive`), e se vuole nominare le altre lo fa a
parte: "3 spese, piu' 3 cancellate".

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

## Il periodo della Home deriva dai budget

Non esiste una preferenza di visualizzazione: **il periodo mostrato e' quello
dell'ultimo budget impostato**. La scelta e' deliberata — aggiungere un campo in
`Settings` sarebbe una migrazione di schema **su dati veri** (CLAUDE.md, "Da qui
in avanti i dati sono veri") per sostenere un selettore che non esiste.

**La trappola, da conoscere prima che qualcuno ci costruisca sopra.** Con questo
modello, aggiungere un selettore di periodo alla Home significherebbe che
**guardare il mese crea un budget mensile permanente nello storico**: un'azione di
vista produrrebbe un record di dominio, e i budget sono storicizzati, quindi quel
record resterebbe li' per sempre a dire una cosa che l'utente non ha mai deciso.

Quindi: se quel selettore servira', **serve prima una preferenza separata in
Settings**. Non si aggiunge il selettore e basta.

Conseguenza gia' attiva oggi: settimanale e mensile possono restare aperti insieme
(`planResolvedBudgetChange` chiude solo i budget dello stesso periodo), quindi
"l'ultimo impostato" e' un ordine totale — `effectiveFrom`, poi `createdAt`, poi
`id` — con un test che verifica che l'ordine dell'array non conti. E' la stessa
dottrina di `resolveBudget` (ADR 008): mai una scelta arbitraria, mai un throw.

## Verificabili solo sul dispositivo — una categoria, non un debito

Queste cose **non sono coperte in suite e non devono esserlo**: il runner non puo'
riprodurle. Non sono buchi da chiudere ne' TODO: sono il confine fra cio' che una
macchina proxy misura e cio' che misura solo un iPhone. Nessuno provi a coprirle
con un test — verrebbe verde senza provare niente, che e' il difetto peggiore.

- **`env(safe-area-inset-*)` vale sempre 0 in Chromium.** Quindi **l'intera classe
  "contenuto sotto il notch o sotto la barra gesti" e' invisibile alla suite**,
  anche quando i test la nominano: quello che verificano e' l'aritmetica dei
  `max()`, non il valore che iOS inietta.
- **`100dvh` in Chromium e' statico.** Su iOS cambia quando la barra di Safari si
  ritrae, ed e' il momento in cui un layout a piena altezza si rompe.
- **Le quattro difese `-webkit-*`** — `overflow-scrolling`, `touch-callout`,
  `text-size-adjust`, `tap-highlight-color` — non hanno **nessun** effetto in
  Chromium: sono scritte e mai esercitate.
- **`text-wrap: pretty` / `balance`** e **`font-variant-numeric: tabular-nums`**
  decidono **dove il testo va a capo** e la larghezza delle cifre, quindi entrano
  in ogni misura geometrica — con supporto e metriche diversi fra Chromium+Inter e
  WebKit+SF Pro.
- **Il font delle emoji** (Apple Color Emoji contro Noto): dichiarato fuori scopo
  in ADR 013 e resta tale.

Sono il **caso 2 della tassonomia** in CLAUDE.md — asserzione esatta, premessa che
dipende dall'ambiente — nella sua forma piu' pura: qui la premessa non e' solo
diversa, e' **assente**.

La copertura vera e' il criterio di chiusura di ogni fase: l'app installata su un
telefono vero. Quando si fara' la prova con una persona che non ha mai visto
l'app, **il contenuto sotto il notch e' una delle cose da guardare a occhio**.

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
