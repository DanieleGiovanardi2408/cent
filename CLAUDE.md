# Cent — expense tracker PWA

## Cos'e'
App web installabile (PWA) per tracciare le spese quotidiane. Mobile-first
(iPhone, Safari, "Aggiungi a Home"). Primo contesto d'uso: un soggiorno ad
Amsterdam. L'app e' pensata per uso continuativo.

**Dal 23 agosto 2026 non e' piu' solo per il suo autore**: la useranno anche altre
persone — amici in Erasmus. Resta **local-first e senza account**: ogni persona ha
i propri dati sul proprio telefono, e non esiste nessuna condivisione fra
dispositivi. Cambia il pubblico, non l'architettura.

Cosa cambia davvero: **niente puo' piu' essere giustificato con "tanto lo sa gia'
l'unico utente".** Le convenzioni non ovvie — il chip della categoria che salva,
l'importo che si riempie da destra — vanno spiegate, non presupposte. Vedi
`docs/ROADMAP.md`, "Cambio di scopo".

## Principio guida n.1
**Inserire una spesa deve richiedere meno di 5 secondi e al massimo 3 tap oltre
alle cifre dell'importo. L'obiettivo e' 2.**

Le cifre non contano come attrito: l'importo e' contenuto, non navigazione, e non
esiste modo di farlo entrare nell'app senza digitarlo. Contarlo renderebbe la
metrica priva di senso.

I 2 tap si raggiungono cosi': **FAB -> cifre -> tap sulla categoria, che E' la
conferma.** Nessun pulsante "Conferma". L'importo si digita cents-first, stile
bancomat (1250 -> 12,50), quindi il tasto virgola non esiste. La categoria si
sceglie sempre esplicitamente: mai preselezionata all'ultima usata. Vedi ADR 004.

Se una decisione di design o di architettura peggiora questo numero, e' la
decisione sbagliata. Tutto il resto dell'app e' secondario a questo flusso.

## Vincoli non negoziabili
- Nessun backend, nessuna API esterna a runtime, nessun login, nessun account.
- Tutti i dati restano sul dispositivo (IndexedDB). Deve funzionare 100% offline.
- Nessuna dipendenza da CDN a runtime. Tutto bundlato.
- Importi come **interi in centesimi**. Mai float per il denaro.
- Date come stringhe locali `YYYY-MM-DD`. Mai aritmetica su Date in UTC.
- Settimana che inizia **lunedi'**. EUR, `Intl.NumberFormat`.
- **Due lingue, it ed en**, con **default inglese** quando la lingua del
  dispositivo non e' italiana (vedi "Due lingue"). Questa riga diceva
  `Locale it-IT` fino alla fase 3: era vera quando l'utente era uno solo, ed e'
  rimasta scritta due giorni dopo che aveva smesso di esserlo.

## Stack
- Vite + TypeScript (strict) + Preact
- Nessuna libreria UI. CSS puro con custom properties. Niente CSS-in-JS runtime.
- IndexedDB tramite `idb` (~2KB). Niente Dexie.
- Vitest per i test del data layer. `vite-plugin-pwa` per manifest + service worker.
- Zero altre dipendenze runtime senza una ADR scritta in `docs/adr/`.

## Performance budget (verificabile)
- Bundle JS iniziale < 60 KB gzip. Se si supera, si taglia.
- FCP < 1.0s, TTI < 1.5s su 4G simulata. CLS = 0.
- Ogni interazione (tap -> feedback) < 100 ms. Optimistic UI sempre.
- Liste fluide a 60fps con 5.000 spese in archivio.

## Da qui in avanti i dati sono veri
Il database sul dispositivo contiene spese reali che nessuno puo' ricreare. Ogni
migrazione di schema, ogni scrittura in blocco e ogni correzione a `src/core` da
questo punto opera su **dati irripetibili**.

Le migrazioni non sono piu' un esercizio: prima di una migrazione che tocchi
record esistenti, il piano va verificato su una **copia del backup reale**, non
solo su dati sintetici.

## Modello dati
Tutte le entita': `id` (crypto.randomUUID), `createdAt`, `updatedAt`.
- **Expense**: `amountCents` (intero), `categoryId`, `date: 'YYYY-MM-DD'`, `note?`,
  `source: 'manual'|'recurring'`, `recurringId?`, `deletedAt?` (soft delete -> undo).
- **Category**: `name`, `emoji`, `color`, `order`, `archived`.
- **RecurringRule**: `amountCents`, `categoryId`,
  `cadence: 'daily'|'weekly'|'monthly'`, `interval`, `anchorDay?`,
  `startDate`, `endDate?`, `lastMaterializedDate?`, `active`.
  **`note` non c'e' piu'** (fase 5): tre lettori, zero produttori. Vedi
  **"Un campo e' prodotto quando un valore entra da fuori"**.
- **Budget**: `period: 'weekly'|'monthly'`, `amountCents`, `categoryId?`,
  `effectiveFrom`, `effectiveTo?`. I budget sono **storicizzati**: cambiare il
  budget di oggi non deve riscrivere i totali dei periodi passati.
- **Settings**: `weekStartsOn: 1`, `theme`, `lastBackupAt?`, `schemaVersion`,
  `language?` (it | en), `onboardingCompletedAt?`. Gli ultimi due arrivano con la
  migrazione 2 -> 3, entrambi opzionali con default.

## Ordinamento delle categorie
La griglia serve al momento del pagamento. Si ordina **per frequenza di tap, non
per importo**: l'affitto e' la spesa piu' grande e dalla fase 5 sara' inserito da
una ricorrenza, cioe' con zero tap. Non merita un posto in griglia.

La griglia e' **stabile**: non si riordina mai in base all'ora, al giorno o
all'uso recente. Dopo pochi giorni l'utente tocca per posizione senza leggere
l'etichetta, e una griglia che si muove produce spese categorizzate male senza
che se ne accorga. E' la stessa ragione per cui ADR 004 rifiuta la categoria
preselezionata: un errore silenzioso e permanente e' peggio di un tap in piu'.

Ordine dei default (4x2):

    Spesa · Fuori · Coffeeshop · Sigarette
    Trasporti · Svago · Casa · Extra

Tutte e otto devono stare in griglia insieme al tastierino, senza scroll, sul
viewport piu' piccolo supportato. Se non ci stanno si ripensa il layout: non si
aggiunge uno scroll e non si nasconde niente dietro un "Altre" — sarebbero i due
tap promessi che diventano tre in silenzio.

### Tetto di otto categorie attive
L'utente puo' modificare, aggiungere e riordinare le proprie categorie, ma
**al massimo otto restano attive sulla griglia**. Quante se ne vuole in archivio.

La ragione e' il vincolo che protegge i due tap: la griglia 4x2 **senza scroll**.
Uno scroll ucciderebbe la promessa in silenzio — i due tap diventerebbero
scroll + tap senza che nessuna misura se ne accorga. Il tetto rende il vincolo
vero **per costruzione** invece che per disciplina.

**Archiviare non e' cancellare.** Una categoria archiviata sparisce dalla griglia
ma **resta su tutte le spese che l'hanno usata**: Storico e statistiche continuano
a mostrarla. Archiviare e' un'azione di **visualizzazione**, non sui dati. La
storia non cambia mai retroattivamente.

Cancellare davvero si puo' **solo se nessuna spesa la usa**. Altrimenti
resterebbero record orfani.

**Lo scambio e' un gesto solo.** Aggiungendo la nona, l'app chiede "quale
sostituisce?" e lo si fa li'. Se per aggiungerne una bisognasse prima andare ad
archiviarne un'altra e tornare indietro, il tetto si sentirebbe come un dispetto
invece che come una scelta — stessa regola, due prodotti diversi.

## Colori delle categorie
Gli otto colori sono **un sistema, non otto scelte separate**: diventeranno la
palette dei grafici in fase 6. Requisiti: distinguibili fra loro anche con una
carenza sul rosso-verde, contrasto AA sul testo del chip in entrambi i temi, e
leggibili anche come aree adiacenti in un grafico, non solo come chip distanziati.

## Chiavi di storage ritirate
Le chiavi `localStorage` non piu' usate vanno rimosse a runtime, non
dimenticate: vivono in un elenco esplicito in `src/app/legacy-cleanup`, che le
cancella al primo avvio. Chi ritira una chiave la aggiunge a quell'elenco.
Ritirata finora: `cent.storagePersisted.v1` (fase 0, sostituita da
`navigator.storage.persisted()` come unica fonte di verita').

## `Settings` si divide in due
Non tutto cio' che sta in `Settings` descrive i dati. **Meta' descrive il
dispositivo**, e la differenza decide cosa attraversa un backup.

**Viaggia col backup** (descrive i dati e come vanno interpretati):
- `schemaVersion`
- `weekStartsOn`

**Appartiene al dispositivo e non si importa MAI**:
- `language` — e' la lingua di *questo* telefono, non del file
- `onboardingCompletedAt` — chi ha gia' visto la guida qui l'ha vista qui
- `lastBackupAt` — dice quando *questo* dispositivo ha fatto una copia
- `theme`

Il caso concreto che l'ha decisa, trovato prima che la fase 7 lo scoprisse:
`importBackup` sostituisce il record `settings` **intero**. Importando un backup
piu' vecchio dei due campi nuovi, **la guida ricomparirebbe sopra i dati appena
importati e la lingua tornerebbe ad "Automatica"** — cancellando la scelta fatta su
questo telefono, nell'istante in cui l'utente ha appena dimostrato di non essere
alle prime armi.

### `weekStartsOn` viaggia col backup, e la ragione e' il criterio
Sembra una preferenza di visualizzazione, e non lo e': **cambiarlo ricalcola ogni
confine di periodo dello storico**. I budget sono storicizzati, e ogni budget
settimanale e' stato deciso contro confini precisi; un backup ripristinato sotto
una convenzione diversa **reinterpreterebbe in silenzio ogni totale settimanale**,
senza toccare un solo record.

Il criterio generale, che vale per il prossimo campo dubbio: **se cambiarlo cambia
il significato dei dati gia' scritti, descrive i dati. Se cambia solo come li si
guarda adesso, descrive il dispositivo.**

(Oggi `weekStartsOn` e' fissato a 1 dal vincolo sulla settimana che inizia lunedi',
quindi la decisione conta solo se quel vincolo cadesse. Va scritta lo stesso: il
posto in cui si scopre di non averla presa e' un import.)

## Le categorie di default si creano dopo che la lingua e' risolta
Le otto etichette esistono in **entrambi i dizionari**, e il seed le scrive nella
lingua risolta. Da quel momento **sono dati dell'utente**: cambiare lingua dopo
**non** le ritraduce, ed e' corretto — sono sue, e rinominarle e' esattamente cio'
che l'editor serve a fare.

**Il difetto da evitare e' l'ordine, non la traduzione.** Oggi il seed gira dentro
`openRepository` **prima che una lingua esista**: tradurre senza cambiare l'ordine
produce otto etichette nella lingua sbagliata con un dizionario tradotto accanto.
Quindi il vincolo e': **le categorie di default non si creano finche' la lingua non
e' risolta.**

### Alternativa scartata: salvare una chiave invece di un nome
Si potrebbe salvare una chiave e tradurla a ogni render finche' nessuno rinomina.
Darebbe nomi giusti anche a chi cambia lingua dopo.

**Scartata**: introdurrebbe un campo con **due nature** (chiave o nome), una
transizione fra le due, e un backup che deve rappresentarle entrambe — cioe'
esattamente lo stato rappresentabile-ma-ambiguo che questo progetto elimina da
giorni, pagato per una comodita' che capita **una volta sola** nella vita di un
utente.

**Una categoria ha un nome. Punto.**

## Motore delle ricorrenze — la parte che si sbaglia sempre
Le regole ricorrenti NON sono spese: generano spese reali in modo pigro,
all'apertura dell'app (da `lastMaterializedDate` a oggi), con `source:'recurring'`.
Requisiti duri:
- **Idempotenza**: aprire l'app 10 volte oggi crea 0 duplicati. Test obbligatorio.
- **Interrompibile**: l'app puo' morire a meta' materializzazione — iOS termina
  le web app in background, l'utente fa swipe via, la batteria finisce. Alla
  ripresa: zero duplicati e zero occorrenze perse. Questo requisito non dipende
  dalla strategia di aggiornamento del service worker (ADR 005): quella toglie
  un innesco, non il requisito.
- **La correttezza non dipende da un lock.** Una spesa generata ha
  un'**identita' deterministica**: il suo id e' funzione pura della coppia
  (regola, giorno), non un UUID. L'inserimento ha semantica *add*, non *put*: su
  conflitto si salta, non si sovrascrive — cosi' sopravvivono sia le modifiche
  dell'utente alla singola istanza (canone 920 invece di 900) sia la
  cancellazione, perche' un record con `deletedAt` esiste e quindi non viene
  resuscitato.
  Un lock in memoria impedirebbe la collisione solo dentro un contesto
  JavaScript. Non serve a niente fra contesti diversi — la PWA aperta dalla Home
  mentre una scheda Safari sullo stesso sito e' ancora viva sono due contesti,
  due lock separati, una sola IndexedDB — ne' dopo una morte a meta', perche' il
  processo che teneva il lock non esiste piu'. Serializzare le chiamate resta
  un'ottimizzazione utile per non sprecare lavoro, ma la correttezza deve reggere
  anche senza. Vedi ADR 006.
- Le spese generate sono modificabili/cancellabili singolarmente senza toccare la regola.
- Mensile con `anchorDay: 31` a febbraio -> ultimo giorno del mese, non il 3 marzo.
- Catch-up dopo 40 giorni di inattivita': tutte le occorrenze, zero duplicati,
  senza bloccare la UI.

## Il mirror e' una cache, non la fonte di verita'
La fonte di verita' e' IndexedDB. Il mirror in memoria e' una cache di lettura che
esiste solo per rendere sincrone le letture della UI.

Dopo ogni sospensione il mirror e' **scaduto**: su `visibilitychange` con
`visibilityState === 'visible'` (e su `pageshow` con `persisted === true`) il
repository rilegge lo stato dal disco **prima di qualunque scrittura**,
materializzazione compresa.

**Vincolo di sicurezza**: la rilettura NON deve girare se ci sono scritture
pendenti o fallite in coda. In quel caso il mirror contiene dati che il disco non
ha, e rileggere li cancellerebbe. Se `writeFailures` non e' vuoto: niente
rilettura, si resta nello stato "esporta subito".

Perche' questo e non un lock o un BroadcastChannel: vedi ADR 007.

## Ordine di pittura (non negoziabile)
Il guscio si dipinge **prima** che i dati siano letti. `main.tsx` non deve mai
attendere `openRepository()` prima del primo render: la lettura di 5.000 record
finirebbe davanti al primo frame.

Sequenza: **guscio -> apertura repository -> dati.**

Ogni schermata ha uno stato "guscio senza dati" gia' definitivo per layout e
dimensioni, cosi' l'arrivo dei dati non sposta nulla (CLS = 0).

## Sovrapposizioni
Nessun elemento in overlay puo' coprire un bersaglio interattivo. Un overlay o
**sposta il contenuto** (e allora e' layout, non sovrapposizione), o vive in una
**fascia riservata** dove non c'e' niente di toccabile.

Non esistono eccezioni motivate dallo spazio: se non c'e' spazio, l'overlay e' la
cosa da ripensare.

Questa regola nasce da due bug identici trovati insieme: il toast con "Annulla"
finiva sopra il tastierino — a 757px di altezza il bottone "Annulla" cadeva dentro
il tasto "9", centrato, quindi digitare 9 cancellava la spesa precedente — e
l'avviso di aggiornamento copriva l'unico bottone di export, dove toccare
"Esporta" ricaricava l'app. Non erano due sviste: mancava la regola.

**Il test che la sorveglia**: per ogni bersaglio interattivo, su piu' viewport e
con gli overlay **attivi**, `elementFromPoint(centro del bersaglio)` deve
restituire quel bersaglio o un suo discendente. La sonda che ha trovato i due bug
e' quella, ed era stata eseguita una volta a mano.

## Stato dell'interfaccia e sospensione
Nessuno stato dell'interfaccia sopravvive a una sospensione senza essere
riconciliato. I timer basati su `setTimeout` **si congelano in background**: al
risveglio ogni durata va confrontata con l'orologio o azzerata — altrimenti il
toast di ieri sera e' ancora li' stamattina, con "Annulla" agganciato a una spesa
di dodici ore fa.

E' lo stesso principio del mirror che e' una cache, applicato alla UI.

## Due lingue: it / en
- **Nessuna libreria.** Un modulo in `src/ui/i18n`, due dizionari, una `t()`. Il
  budget e' 60 KB e siamo a 28,4: una libreria di i18n costerebbe piu' di tutto il
  resto dell'app.
- **La parita' delle chiavi la garantisce il compilatore, non un test**: il
  dizionario inglese e' tipizzato come `Record<keyof typeof it, string>`. Una
  chiave mancante deve essere un **errore di compilazione**, non una stringa
  inglese che spunta in mezzo all'italiano.
- Rilevamento da `navigator.language` al primo avvio. **Default inglese** se non e'
  italiano: la lingua condivisa di un gruppo Erasmus e' l'inglese.
- Override manuale in Impostazioni, persistito.

### La formattazione esce da `src/core`
`money.ts` ha `it-IT` cablato. E' **presentazione dentro il dominio**, ed e' stata
invisibile finche' la lingua era una sola. Il core restituisce **interi**; la UI
formatta con il locale attivo.

Va fatto **prima** che esistano due lingue da cablare invece di una.

Il cents-first regala una cosa qui: non si digita nessun separatore decimale,
quindi **non esiste parsing dipendente dal locale**. Solo output.

Il canarino sullo spazio non separabile va esteso a **entrambi** i locali: la
posizione del simbolo cambia con la lingua, la proprieta' da difendere no.

## Calcolo budget
Metriche della dashboard: speso / budget / rimanente del periodo, giorni rimanenti,
**disponibile al giorno = rimanente / giorni rimanenti** (il numero piu' utile),
passo attuale vs passo sostenibile. Sforare non e' un errore: la UI lo mostra con
calma, senza allarmi aggressivi.

### Le ricorrenti non entrano nel budget
Le spese con `source: 'recurring'` sono escluse dal calcolo del budget: **il
budget serve a decidere se prendere quel caffe', e l'affitto non e' una
decisione**. Ragione per esteso e conseguenze in
[ADR 016](../docs/adr/016-due-tipi-di-soldi.md) — qui le tre che non si negoziano:

1. **Storico e statistiche mostrano tutto.** Sono spese vere: e' solo il budget a
   escluderle.
2. **La Home lo dice**, accanto al numero grande: *"oltre alle spese fisse"*.
   Un'esclusione taciuta e' un numero che mente per omissione.
3. **Due numeri, non uno**: accanto al budget, il totale mensile delle fisse. La
   seconda cifra ha senso solo se si vede la prima.


## Schermate
1. **Home** — periodo corrente. Numero grande = quanto resta. Progresso.
   Riga "puoi spendere ~X EUR/giorno". Spese di oggi. FAB per aggiungere.
2. **Aggiungi spesa** — bottom sheet, tastierino numerico **custom** (non quello
   di iOS), categorie a chip, data = oggi, nota collassata. Conferma -> toast con Annulla.
3. **Storico** — raggruppato per giorno con totale. Ricerca e filtri. Swipe per azioni.
4. **Statistiche** — ripartizione per categoria, ultime 8 settimane. SVG scritto a mano.
5. **Impostazioni** — categorie, budget, ricorrenze, export/import, tema.

## Backup
Export JSON (reimportabile) e CSV. Import **con anteprima e conferma**, mai
sovrascrittura silenziosa. Banner discreto se `lastBackupAt` > 14 giorni.

**Un indicatore di sicurezza che puo' sbagliare deve sbagliare verso l'allarme.**
Un banner che tace a torto e' peggio di uno che insiste a torto: il primo lascia
senza copia chi crede di averla. Quindi `lastBackupAt` si scrive **solo** sugli
esiti che l'app ha davvero osservato — una condivisione andata a buon fine, una
copia negli appunti confermata — mai su un percorso il cui successo non e'
verificabile, come `<a download>` che in PWA standalone puo' non fare nulla senza
errore.
Migrazioni di schema versionate, senza perdita di record.

## Trappole iOS / Safari PWA
- `viewport-fit=cover` + padding con `env(safe-area-inset-*)`.
- `100dvh`, mai `100vh`. Input con `font-size >= 16px` o Safari zooma.
- `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: none`.
- `apple-touch-icon` 180x180 opaca. `theme-color` per light e dark.
- In standalone non c'e' il tasto Indietro: la navigazione interna basta a se stessa.
- Chiamare `navigator.storage.persist()` al primo avvio.

## Accessibilita' e finiture
Target touch >= 44px. Contrasto AA in entrambi i temi. `prefers-reduced-motion`.
Ogni azione distruttiva e' annullabile (soft delete + toast), niente dialoghi
"Sei sicuro?". Stati vuoti con copy vero — **in tutte e due le lingue**, e
l'inglese si scrive per primo come originale: un inglese che sa di traduzione fa
piu' danno di un italiano che sa di traduzione.

## Non leggere l'intero albero mentre un agente lo sta scrivendo
Nessuna operazione che legga **tutto** il working tree — una misura o un commit —
va eseguita mentre un agente ci sta scrivendo dentro. Quello che si ottiene non e'
uno stato: e' un'istantanea fra due salvataggi.

E' successo due volte, in due forme diverse:

- una caccia a un test intermittente con `--repeat-each=10` e' stata **invalidata**
  perche' `product-critic` aveva creato e poi cancellato `__probe.spec.ts` nella
  stessa directory mentre girava: 48 test "did not run" e un numero finale che non
  significava niente;
- un `git add -A` per un commit **di sola documentazione** ha raccolto il lavoro a
  meta' di `data-core` su `src/core` — un file appena nato e un altro con gli
  import gia' scritti ma non ancora usati — e l'ha spedito su main. La CI l'ha
  preso in 40 secondi con `TS6192`.

**Regola operativa**: mettere in stage i **percorsi espliciti** di cio' che si e'
scritto, mai `git add -A`, finche' un agente e' in corso. E rimandare le misure
lunghe a quando l'albero e' fermo.

**E il perche', che serve piu' del divieto.** La regola non elenca i comandi
proibiti, perche' non e' un elenco: e' un criterio. Qualunque operazione che
**sposti o legga l'albero intero** — `git add -A`, `git stash`, un `git checkout`
largo, una misura lunga — mentre qualcuno ci sta scrivendo dentro non produce uno
stato: produce **un'istantanea a meta' fra due salvataggi**. `git stash` e' il caso
peggiore della famiglia, perche' non si limita a leggerla: **la mette via**, e cio'
che l'agente stava scrivendo in quel momento finisce in un posto che l'agente non
sa di dover cercare.

Con il criterio in mano si decide caso per caso invece di ricordarsi un divieto —
che e' il modo in cui questa regola ha una possibilita' di reggere il giorno in cui
si hanno due agenti in volo e fretta.

### La regola da sola non basta: `.githooks/pre-commit`
Questa e' esattamente il tipo di regola che fallisce, perche' chiede di ricordarsi
una cosa **nel momento in cui si stanno gestendo due agenti e si ha fretta**.
Quindi e' anche strutturale: un hook `pre-commit` esegue `tsc --noEmit` quando c'e'
qualcosa sotto `src/` in stage, e blocca il commit se non compila. Il commit che ha
prodotto questa regola sarebbe stato fermato in locale.

Attivo con `git config core.hooksPath .githooks` — se `git status` non lo mostra,
va rieseguito dopo un clone.

**Calibrazione, che e' la parte che si sbaglia**: solo il typecheck, **mai la
suite**. Un hook lento viene aggirato con `--no-verify`, e una guardia aggirata e'
peggio di nessuna guardia — la stessa ragione per cui un test che grida al lupo
viene disattivato. Se un giorno `tsc` diventasse lento su questo progetto, l'hook
si toglie: non si sopporta.

Limite dichiarato nel file stesso: controlla l'**albero di lavoro**, non il
contenuto in stage, perche' fare `git stash` mentre un agente scrive sarebbe
distruttivo. Prende il caso che conta — si committa mentre l'albero e' a meta' —
e non prende lo staging parziale di un albero sano.

## Verifiche che passano perche' la macchina non e' il bersaglio
I test girano su Chromium con i font di sistema; l'app gira su Safari con SF Pro.
Una verifica puo' essere verde qui e falsa li', e non e' un caso: sono tre cose
diverse, con tre rimedi diversi. Confonderle porta a "sistemare" cio' che e' gia'
giusto e a lasciare stare cio' che non lo e'.

Il caso che ha prodotto questa sezione: un test sul CLS restava **verde anche
togliendo la cosa che sorvegliava**, perche' su Chromium le due etichette
differivano di 1 px e uno spostamento cosi' piccolo non produce nessuna voce
`layout-shift`. Su iOS quel px puo' essere di piu'.

### 1. Asserzione con una SOGLIA dell'ambiente proxy
La metrica ha una soglia interna decisa dal browser, quindi "zero" significa
"sotto la soglia di **questo** browser", non "zero". I sei `expect(cls).toBe(0)`
sono questo.

**Rimedio: riformulare sulla causa esatta.** Il CLS approssima "qualcosa si e'
spostato": la causa e' l'identita' delle posizioni fra guscio e dati, e quella si
misura senza soglie. Il CLS **resta** come rete grossolana — prende spostamenti
orizzontali e frame intermedi che un controllo sui `top` non campiona — ma non e'
il gate.

**E la differenza dev'essere nel NOME del test, non in un commento**: chi legge
l'output deve capire quale delle due ha ceduto senza aprire il file. Un'etichetta
lontana dall'asserzione non protegge nessuno.

### 2. Asserzione ESATTA con premessa dipendente dall'ambiente
I sedici controlli sull'overflow (`scrollWidth - clientWidth <= 0`) non hanno
nessuna tolleranza: qualunque overflow fallisce. Ma **se** l'overflow accada
dipende dalle metriche del font, quindi un testo che qui sta puo' traboccare li'.

**Rimedio: nessuno in suite.** Il test e' giusto e la macchina e' sbagliata.
Va **etichettata come tale**, non "sistemata": renderla piu' severa non la
avvicinerebbe al bersaglio. La copertura vera e' il telefono, ed e' gia' nel
criterio di chiusura di ogni fase.

### 3. Costante di sistema confrontata con una misura che dipende dal font
`Math.min(width, height) < 44` usa `--tap-min`, che e' una costante nostra — ma il
numero **misurato** dipende dal font, per gli elementi dimensionati dal contenuto
invece che da `min-height`.

**Rimedio: nel CSS, non nel test.** A quegli elementi si da'
`min-block-size: var(--tap-min)` invece di lasciarli dimensionare dal contenuto.
Cosi' il numero misurato smette di dipendere dalle metriche del font e il confronto
torna esatto su entrambe le piattaforme.

E' la mossa che ricorre in tutto questo progetto: **rendere esatta la cosa
misurata, invece di tollerare l'approssimazione nella misura.**

## Ogni bersaglio dichiara le proprie misure minime
Un bersaglio toccabile **dichiara** `min-block-size` e `min-inline-size`
(`var(--tap-min)`), non le **deriva dal contenuto**. Vale su entrambi gli assi.

La ragione e' nuova, e prima non c'era: **il contenuto dipende ora da due variabili
che una settimana fa non esistevano** — la **lingua**, e **cio' che l'utente digita
nei nomi delle categorie**. Un bottone largo 77 px perche' dentro c'e' "Annulla" e'
sopra i 44 per caso, non per costruzione: in inglese quella parola si accorcia, e si
accorcia **proprio dove leggeranno quasi tutti**.

E' anche la condizione perche' il controllo `Math.min(width, height) < 44` sia una
verifica esatta invece che una misura dipendente dal font — caso 3 della tassonomia
qui sopra: **il rimedio sta nel CSS, non nel test**.

## Quando si sostituisce una soglia, la propria dev'essere piu' fine dell'effetto
Sostituendo una soglia che non controlliamo — quella interna del browser per
`layout-shift`, per esempio — con un confronto nostro, **il confronto nostro
dev'essere piu' fine dell'effetto che stiamo cercando**. Altrimenti si cambia il
nome del problema e non il problema.

Caso concreto: lo spostamento da intercettare valeva **0,82 px**. Un confronto
arrotondato al pixel intero — la prima forma che viene in mente — l'avrebbe perso
**esattamente come lo perdeva il CLS**. Il gate confronta a due decimali, e per
questo cade dove la rete non cadeva.

Corollario: prima di scrivere il confronto bisogna sapere **quanto vale l'effetto
piu' piccolo che deve fallire**. Se non lo si sa, non si sta scegliendo una
precisione: se ne sta ereditando una a caso.

## L'output di una verifica si filtra quando lo si legge, mai quando lo si registra
Una verifica lunga va **registrata intera**. Il filtro (`grep`, `tail`) si applica
alla **lettura**, non alla scrittura: nel momento in cui il risultato non torna,
l'unica cosa che serve e' proprio cio' che il filtro avrebbe scartato.

Caso concreto: una prova al confine e' tornata con **103 test passati invece di
104**, e la ricostruzione era impossibile perche' l'output era stato incanalato in
un `grep` che teneva due righe. Rifatta conservando tutto, il conteggio era pieno
(`[114/114]`), ma **la discrepanza non e' stata spiegata**: e' stata solo non
riprodotta. Il sospetto — contesa di risorse con un processo rimasto vivo — e' un
sospetto, e va detto come tale.

E' la **terza forma della stessa lezione**, dopo:
- l'albero che cambiava sotto la misura (una caccia a un test intermittente
  invalidata da un file creato e cancellato da un altro agente mentre girava);
- la misura dell'**effetto** invece della **causa** (il CLS che non vedeva 0,82 px).

Qui la misura era giusta e l'oggetto fermo: e' stata **registrata a meta'**.

## Una decisione vale dove vale il suo argomento
Prima di considerare applicata una decisione, **rileggi la sua ragione e chiediti
se nomina il caso specifico**. Se non lo nomina, la decisione vale **ovunque valga
l'argomento** — e va cercato dove altro vale, non aspettato.

E' successo tre volte in due giorni, sempre nella stessa forma:

- **`aria-live` sulla riga di aiuto.** L'argomento era *"e' un'istruzione, non un
  valore: si legge esplorando, non si annuncia"*. Non nomina mai `AddSheet` — e
  infatti valeva identico per il foglio del budget, dove la stessa riga **commuta
  alla prima cifra insieme all'importo**, cioe' ha esattamente il difetto dei due
  annunci in coda. Era stato tolto da un componente solo perche' la decisione era
  stata scritta *su quella riga*.
- **Il pavimento sulle misure minime.** La regola diceva "un bersaglio dichiara le
  proprie misure", l'argomento parlava di contenuto che dipende da font e lingua —
  nessuno dei due nominava un asse. E' stato applicato prima alla sola **altezza**;
  la larghezza e' arrivata un giorno dopo, e nel frattempo un chip valeva **29,4 px
  in inglese** a 320 punti.
- **`history.blank.install`.** ADR 011 decideva che fuori da standalone c'e' una
  pagina di installazione. Non nominava quella stringa, che e' rimasta viva nel
  codice e morta nei fatti finche' non se ne stava per scrivere una seconda copia.

Il costo di sbagliare il livello di generalita' non e' un difetto: e' **un difetto
che si crede gia' corretto**, ed e' per questo che non lo cerca nessuno.

## Nessun messaggio afferma un fatto che l'utente non puo' verificare
Se un messaggio dice *"la usano 8 spese"*, quelle otto devono essere raggiungibili
da qualche schermata. Un numero che non si puo' riconciliare con lo schermo non
informa: **lascia l'utente davanti a un rifiuto che non puo' verificare**, e da li'
o si fida o smette di fidarsi — nessuna delle due e' quello che volevamo.

Il caso che l'ha prodotta: `planRecurringRuleDeletion` rifiuta con
`reason: 'in-use', expenses: N` contando **anche le lapidi** (le spese cancellate).
Una regola le cui uniche istanze sono cancellate rifiuta quindi la cancellazione
citando un numero di spese che nello Storico **non si vedono**.

E' la stessa malattia, in scala ridotta, del messaggio *"Non c'e' niente da
recuperare"* mostrato mentre otto spese non venivano create: **un messaggio che
afferma qualcosa che lo schermo non conferma.**

### Il titolo diceva "un numero", e il numero era solo il caso visto per primo
La regola e' nata guardando `expenses: N`, quindi parlava di numeri. Poi
`planCategoryDeletion` ha ricevuto un esito `deleted-only` **senza nessun numero**
— tolto dal tipo, non per disciplina — e la frase e' rimasta lo stesso
inverificabile: *"la usano delle spese che hai cancellato"*, davanti a uno Storico
dove quelle spese non ci sono e non c'e' modo di andarle a vedere.

Togliere il numero aveva soddisfatto **la lettera**. L'argomento diceva *"lascia
l'utente davanti a un rifiuto che non puo' verificare"*, e quello vale identico per
un'affermazione senza cifre.

**Il criterio e' sul fatto, non sulla sua forma numerica.**

## Un argomento spostato di contesto va ri-derivato, non copiato
*"Si annuncia piu' di quanto si fa"* e' una scelta giusta quando copre una
**corsa**: fra l'anteprima e la conferma qualcosa puo' cambiare, e sbagliare per
eccesso e' il verso sicuro.

Lo stesso argomento e' stato copiato sul rewind, dove copre una **certezza**: il
rewind esiste solo per regole gia' materializzate, quindi la sovrapposizione fra la
finestra e cio' che e' gia' a disco e' **≥ 1 sempre, per costruzione**. Il numero
non era sbagliato a volte: era gonfiato **ogni volta**, esattamente del numero di
occorrenze gia' esistenti. Il pannello annunciava sette spese e 6.300 €, ne
nascevano quattro, e nello Storico se ne vedevano sei per 5.420 €.

E il numero esatto non e' solo piu' onesto, **e' quello che serve**: sette e 6.300
sono l'ampiezza del calendario; cio' che l'utente sta per fare alla propria storia
e' **+4 spese e +3.600 €**. La prima coppia non risponde a nessuna domanda che si
stia facendo.

E' "una decisione vale dove vale il suo argomento" applicata al **trasloco** invece
che al tempo: la stessa frase, in una stanza diversa, puo' essere falsa.

### Il test che difendeva il difetto era la parte piu' pericolosa
`ricorrenze.spec.ts` asseriva **otto** annunciate e **sette** a schermo nello stesso
test, con un commento che spiegava perche' la discrepanza andasse bene. Un test che
codifica un difetto non lo nasconde soltanto: e' **l'artefatto che domani ne
giustifica la reintroduzione**. Si ripara il test **prima** del codice, e il
commento si toglie.

## Un campo e' prodotto quando un valore entra da fuori
La prima formulazione era *"un campo si spedisce insieme al suo produttore, o non
si spedisce"*. Dice la cosa giusta a un umano e **non si puo' controllare a
macchina**, perche' non dice cosa sia un produttore.

Quella che vale:

> **Un campo e' prodotto quando un valore entra da fuori almeno una volta.** Una
> scrittura la cui espressione contiene **solo letture dello stesso campo** e' una
> **copia**, e una catena di sole copie gira a vuoto.

**Come ci si e' arrivati, che e' la parte che impedisce di riallargarla.** Lo
script scritto per meccanizzare la regola era **verde su un albero malato**: sui
commit in cui `endDate` e `note` erano morti, trovava per ciascuno delle scritture
— ed erano `draft.endDate`, `input.note`, `rule.note`. Tutte copie. Contandole come
produzione, l'audit certificava vivi proprio i due campi da cui la regola era nata.

Tre distinzioni ulteriori, ognuna nata da un errore dello script:

- una **destrutturazione** non e' una scrittura;
- `(endDate: IsoDate, weeks = 8)` e' una **lista di parametri**, non un letterale
  (contandola, `stats.ts` "produceva" `endDate`);
- `target?.interval ?? INTERVAL` **non** e' una copia: con la regola troppo larga
  risultava morto `interval`, che e' vivissimo.

Il controllo e' `scripts/dead-surface.mjs`, e gira in CI.

## Le regole non bastano scritte: due si meccanizzano, la terza si struttura
La fase 5 ha prodotto, contate a fine fase:

- **cinque** occorrenze di *"regola scritta e non applicata"* — l'ultima e'
  `endDate`, che era `note` con quindici lettori invece di tre, **tre giorni dopo**
  che la regola sui produttori era stata scritta;
- **tre** occorrenze di *"irraggiungibile dichiarato troppo presto"*;
- **sei** test che passavano per il motivo sbagliato.

Non e' disattenzione, ed e' per questo che **aggiungere un'altra regola scritta non
servirebbe a niente**: il difetto e' che le regole di questo progetto **vivono in
documenti e vengono applicate a memoria**. Chi le scrive e' la stessa entita' che
deve ricordarsene, in una sessione diversa, tre giorni dopo.

### A. Campi senza produttore — `scripts/audit.mjs`, in CI
Per ogni campo dei tipi in `src/core/types.ts`: esiste una scrittura che **non** sia
`parseBackup`, una migrazione o un test? Se no il campo e' morto, l'audit esce con
errore e stampa **i lettori che tiene in vita**.

Avrebbe preso `note` prima che lo trovassimo, e `endDate` tre giorni fa.

### B. Chiavi i18n senza lettore raggiungibile — stesso script, stessa CI
Ogni chiave dei due dizionari ha almeno un lettore? Avrebbe preso
`history.blank.install` e `rule.preview.done`, e avrebbe **impedito** i due che
stavamo per aggiungere per un dialogo d'import che non esiste.

### C. Una dichiarazione di irraggiungibilita' enumera gli scrittori, o non vale
La terza classe non si meccanizza, ma si struttura: **un commento o una ADR che dice
"non puo' succedere" senza l'elenco di chi potrebbe scrivere quello stato va
trattato come non dichiarato.** E' controllabile a occhio, e sposta il lavoro **dal
ricordare al leggere**.

I tre casi che l'hanno prodotta: *"un selettore sarebbe l'unico ingresso a questo
ramo"* (falso gia' quando fu scritto), *"questo stato e' irraggiungibile"* su un
ramo che il rewind avrebbe reso raggiungibile il giorno dopo, e
`history.blank.install`.

## Dopo una correzione, la verifica si riesegue — non si deduce
Il posto piu' probabile in cui trovare il prossimo difetto e' **dentro la
correzione appena fatta**. Una correzione tocca il codice in un punto delicato
per definizione: e' delicato, altrimenti non ci sarebbe stato un difetto.

Quindi: dopo ogni correzione la verifica che l'ha motivata va **rieseguita**, non
data per valida perche' il cambiamento "e' piccolo" o "e' ovvio".

E' successo quattro volte in questo progetto, e l'ultima e' la piu' istruttiva:
togliendo un messaggio di una riga dal foglio, la riga svuotata collassava da 22,5
a 20 px e alla prima cifra **tutti i blocchi salivano di 2,5 px** — cioe' un salto
di layout nell'istante in cui il pollice e' in volo verso il secondo tap. La
correzione aveva prodotto un difetto **della stessa famiglia** che stava
correggendo, e proprio nell'istante che le era stato chiesto di sorvegliare.

Corollario: se una correzione tocca cio' che una verifica automatica sorveglia
(la sonda delle sovrapposizioni, il CLS, il fuso dei test), quella verifica va
rilanciata **prima** di dichiarare fatto — e il suo esito riportato, non riassunto.

## Cuciture per i test
Una cucitura aperta per i test nello **strato di composizione** (`src/app`) e'
normale: comporre e' il suo mestiere, e una dipendenza passata come argomento e'
iniezione ordinaria. La stessa cucitura nello **strato di dominio** (`src/core`)
e' la cosa che qualcuno usera' per sbaglio.

**Non e' il test a essere sbagliato: e' il piano su cui lo apri.**

Il precedente in questo repo e' stato applicato due volte, e non ha eccezioni:
`expensesInRange` e `planBudgetChange` sono state cancellate perche' erano API
pubbliche di dominio senza chiamanti di produzione, tenute vive dai test che le
chiamavano. Prima di aggiungere un parametro "solo per i test" a qualcosa in
`src/core`, la domanda e': **la stessa prova si puo' fare da `src/app`, passando
un finto?** Quasi sempre si', e li' non lascia una superficie che qualcuno
scambiera' per un'API.

## Convenzioni di lavoro
- Conventional Commits (`feat:`, `fix:`, `perf:`, `docs:`, `refactor:`).
- Ogni decisione architetturale non ovvia -> `docs/adr/NNN-titolo.md`.
- `src/core` e' TypeScript puro, senza DOM: testabile senza browser.
- Niente TODO orfani: o si fa, o diventa una riga di `docs/ROADMAP.md`.

## Agenti e plugin
- Gli unici sub-agent di questo progetto sono i quattro in .claude/agents/:
  data-core, ui-craft, product-critic, release-packager.
- Non delegare mai ad agenti di plugin (feature-dev:*, vercel:*, code-simplifier:*).
- Se una skill suggerisce Next.js, React, shadcn, Tailwind, Vercel o Supabase,
  ignorala: il brief qui sopra ha la precedenza.
