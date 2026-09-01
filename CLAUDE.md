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
- **Primo caricamento < 60 KB gzip, JS + CSS insieme.** Se si supera, si taglia —
  oppure si alza il tetto **con la ragione scritta accanto**, mai in silenzio.

  **Il numero e' nostro, e la ragione e' di prodotto**: la prima persona che
  aprira' questa app lo fara' su una connessione dati estera, in Erasmus, con un
  piano che si paga a megabyte. Sessanta chilobyte sono circa un secondo su una
  3G lenta, ed e' il tempo entro cui una PWA smette di sembrare un sito e comincia
  a sembrare un'app. Non e' una soglia di performance astratta: e' quanto siamo
  disposti a far pagare a qualcuno per la prima apertura.

  Questa riga diceva *"JS"* e lo script misura **JS + CSS** (`scripts/size.mjs`,
  `npm run size`): il documento si allinea allo script e non viceversa, perche' e'
  lo script che gira ed e' **piu' severo** di quanto il documento dichiarasse.

  **E misura `dist/` intero, non il solo chunk d'ingresso.** Spezzare un modulo in
  un chunk a richiesta non abbassa questo numero, e non abbassa nemmeno i byte
  della prima installazione: `globPatterns: ['**/*.{js,css,html,svg,woff2}']`
  mette **ogni** file nel precache del service worker. Verificato leggendo
  `dist/sw.js`. Il service worker resta fuori dal conto — arriva dopo il primo
  frame — ed e' l'unica esclusione.
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
3. **Due numeri, non uno**: accanto al budget, **in Impostazioni**, il totale
   mensile delle fisse. La seconda cifra ha senso solo se si vede la prima.

   **Le due parole `in Impostazioni` sono state riaggiunte il 29 agosto**, e la
   ragione vale piu' della correzione. Erano nell'ADR e non in questa parafrasi, e
   senza il posto *"accanto al budget"* si legge come *"in qualunque schermata
   parli di soldi"*. Su quella lettura e' stata scritta un'istruzione a un agente —
   *"se togliendo questa riga dalle Statistiche §3 cade, non toglierla"* — quando
   §3 nelle Statistiche non abitava affatto: li' il budget non c'e', quindi la
   riga citava §3 **senza la sua condizione**.
   E' [DEBITO.md](docs/DEBITO.md) §1 che morde per la prima volta su una
   **decisione** invece che su una stringa a schermo: una copia che parafrasa,
   perde una condizione, e produce un'istruzione sbagliata. L'ha presa un agente
   che e' andato a leggere l'ADR invece della parafrasi — cioe' non la regola, ma
   qualcuno che non si e' fidato di lei.


## Schermate
1. **Home** — periodo corrente. Numero grande = quanto resta. Progresso.
   Riga "puoi spendere ~X EUR/giorno". Spese di oggi. FAB per aggiungere.
2. **Aggiungi spesa** — bottom sheet, tastierino numerico **custom** (non quello
   di iOS), categorie a chip, data = oggi, nota collassata. Conferma -> toast con Annulla.
3. **Storico** — raggruppato per giorno con totale. Ricerca e filtri. Swipe per azioni.
4. **Statistiche** — **due domande, due grafici**, piu' una coppia di cifre in testa:
   *dove sono finiti i soldi* (ripartizione per categoria del **periodo corrente**)
   e *sto spendendo piu' o meno delle altre settimane* (**una riga per settimana,
   finestra fissa di otto**). SVG scritto a mano.
   Questa riga diceva "ripartizione per categoria, ultime 8 settimane" e si leggeva
   in due modi — la ripartizione **delle** otto settimane, oppure due pezzi
   distinti. Ha sostenuto una decisione di fase 6 mentre era ambigua, ed e' stata
   disambiguata subito: una riga che ha appena retto una scelta non aspetta il mese
   in cui nessuno ricordera' che una scelta c'era stata.
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

## Il pavimento e' 375x667, e non e' il telefono di nessuno

**Il viewport minimo supportato e' 375x667** (iPhone SE). Ogni misura di geometria si
rifa' anche li', non solo sul viewport di riferimento.

**Non si progetta sul telefono di chi scrive l'app.** Il telefono dell'autore e'
390x844, e progettare su quello vuol dire non scoprire mai i difetti che stanno
altrove — perche' chi potrebbe vederli non ha il telefono, e chi ha il telefono non
guarda il codice.

**Il caso che l'ha prodotta, misurato il 30 agosto**: a 375x667 `.blank__text` —
l'invito dello stato vuoto, *"Tocca il + qui sotto, digita l'importo…"* — cade
**sotto la piega**: fondo a 663,8 contro una piega a 583. A 390x844 e a 393x852 ci
sta per intero.

E la ragione per cui quel difetto specifico e' il piu' caro possibile: **lo stato
vuoto e' la prima schermata che vede un amico su un'installazione pulita**, e il test
degli amici e' il criterio di chiusura della fase 3, ancora aperto. Il primo contatto
con l'app sarebbe un testo tagliato, su un telefono che nessuno di noi ha in mano.

**Non e' un'attenzione: e' un invariante verificabile.** Un test fallisce se un
elemento dello stato vuoto esce dalla piega a 375x667.

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

### E il rovescio: si salva quando un agente rientra, non a fine sessione

La regola qui sopra dice **quando non misurare**. Questa dice **quando salvare**, ed
e' la stessa famiglia: tutte e due guardano il momento in cui l'albero e' fermo.

> **Commit e push del ramo ogni volta che un agente rientra.** Non a fine sessione.

**Un agente che consegna e' il punto naturale in cui l'albero e' coerente** — ha
appena finito, `tsc` e la suite sono appena stati letti — e committare li' costa
dieci secondi.

**Perche' non basta farlo alla fine.** Perche' la fine puo' non essere nostra. Tre
sessioni di questo progetto sono finite di colpo: le prime due le abbiamo chiuse
noi, con calma; la terza e' stata **terminata dal limite di sessione** mentre
`ui-craft` scriveva, e in quel momento vivevano solo su questa macchina **tre
commit** piu' il lavoro non committato di due agenti. Nessuna procedura di chiusura
puo' proteggere da una chiusura che non ti lascia eseguire niente: **una fine
involontaria non esegue una chiusura ordinata**, quindi la protezione non puo'
stare alla fine — dev'essere **periodica**.

E' lo stesso spostamento gia' fatto due volte in questo progetto: dal *ricordare* al
*leggere* per le dichiarazioni di irraggiungibilita', dal *ricordare* all'*hook* per
il typecheck. Qui e' dal *ricordare a fine sessione* a **un innesco che arriva da
solo**, perche' l'arrivo di un rapporto e' un evento che non si puo' dimenticare: e'
gia' sullo schermo.

**Il ramo, mai `main`.** Salvare non e' spedire — su `main` continuano a valere i
criteri di chiusura, gate compreso. Un ramo di lavoro spinto e' una copia, e una
copia non ha bisogno di essere finita per valere.

**Cosa fare se `tsc` e' rosso perche' il lavoro e' a meta'**: se e' questione di
poche righe si completa; altrimenti si committa lo stesso con `--no-verify`
**dichiarato nel messaggio insieme alla ragione**. E' ammesso quando si **salva** un
albero, mai quando se ne **spedisce** uno. Un messaggio che tace un `--no-verify` e'
gia' un debito dichiarato in un messaggio di commit, cioe' non dichiarato affatto.

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

## Le varianti da guardare si iniettano, non si applicano

Quando una scelta si decide **a occhio** — due disegni affiancati, e sceglie una
persona — le varianti si costruiscono come **override sopra l'app gia' costruita**
(`page.addStyleTag`), non modificando i sorgenti.

Non e' un trucco per andare piu' veloci: e' cio' che rende vero *"non applicare
niente prima della scelta"*. Con i sorgenti toccati, l'albero e' in uno stato che
nessuno ha scelto mentre si aspetta una risposta — e se la sessione muore li',
quello che resta e' meta' di una variante scartata. Con gli override, l'albero
durante l'attesa e' **esattamente** quello dell'ultimo commit.

Regole pratiche che l'hanno fatta funzionare la prima volta (le tre varianti
della pastiglia, 30 agosto):

- l'override **non cambia la geometria** — un anello si mette `inset`, non come
  bordo — altrimenti il confronto e' fra due layout invece che fra due colori;
- lo scatto passa dalle stesse cuciture della suite: `navigator.standalone`
  dichiarato come in `tests/e2e/installed.ts`, la guida attraversata col suo
  bottone. Una tavola presa su un'app in uno stato che i test non conoscono
  mostra una schermata che nessuno vedra';
- **il server di anteprima si spegne dopo.** `vite preview` rimasto vivo serve un
  `dist/` vecchio alla e2e successiva, che partirebbe verde su un artefatto che
  non e' l'albero — la stessa trappola che `playwright.config.ts` documenta nel
  suo `webServer`, ed e' gia' successa una volta in questo progetto.

Vale per ogni prossima scelta a occhio, non solo per i colori.

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

## Prima di scrivere una motivazione, cerca quella contraria

Prima di scrivere la motivazione di una decisione, **cerca nell'albero se ne
esiste gia' una contraria sullo stesso oggetto. Se c'e', o le rispondi o non
decidi.**

> Una motivazione nuova che non sa di averne contro una vecchia non e' una
> decisione: e' una svista con le virgolette.

**Il caso che l'ha prodotta, il 30 agosto.** La ciambella ordinava le fette per
`Category.order`, con due argomenti scritti accanto. Il primo — *"cosi' le coppie
adiacenti sono sempre le stesse otto"* — era falso, e ADR 025 lo refuta con tre
fatti dell'albero. Il secondo — la memoria muscolare del pollice sulla griglia
dei chip — era **vero, ma di un'altra stanza**, trapiantato senza ri-derivarlo.

E nel trapianto ha scavalcato **un argomento esplicito e contrario che
nell'albero c'era gia', scritto prima**, in `00d849b`, dentro `stats-view.ts`:

> *"Dalla piu' grande: la domanda e' 'dove sono finiti i soldi', e la risposta si
> legge dall'alto. **Non** per ordine di griglia, che serve al pollice in cassa."*

Il risultato non era un ordinamento discutibile: erano **due** ordinamenti nella
stessa schermata. Le barre per importo, le fette e la legenda per griglia, e il
tap che rimescolava le righe — stesse categorie, posizioni diverse — quando il
tap deve cambiare la domanda, non la mappa.

**Perche' e' una regola nuova e non un corollario.** *"Un argomento spostato di
contesto va ri-derivato"* dice cosa fare **con l'argomento che si ha in mano**.
Questa dice di andare a cercare **quello che non si ha in mano**, ed e' un gesto
diverso: si esegue prima di scrivere, con un `grep`, e non richiede di sospettare
niente. Il costo di saltarla e' il solito — un difetto che si crede gia' corretto
— piu' uno peggiore: **un test che lo difende**. `statistiche.spec.ts` asseriva
l'ordine di griglia citando la motivazione refutata.

E la contromisura, dove la si puo' costruire: quando due viste mostrano le stesse
cose, l'invariante da sorvegliare non e' *"l'ordine e' quello giusto"* ma
**l'identita' fra le viste** — che resta vera anche il giorno in cui si cambia
idea sull'ordine, e cade solo sul difetto vero.

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

### A. Campi senza produttore — `scripts/dead-surface.mjs` (`npm run audit:source`), in CI
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

### Due script, e non vanno confusi

Questa sezione attribuiva i controlli A e B a `scripts/audit.mjs`. **Sono in
`scripts/dead-surface.mjs`**, che e' un altro file.

- **`dead-surface.mjs`** (`npm run audit:source`) guarda il **codice**: campi senza
  produttore, chiavi i18n senza lettore. Gira **in CI**, a ogni push, senza
  argomenti.
- **`audit.mjs`** guarda i **dati**: si lancia a mano su un backup vero
  (`node scripts/audit.mjs <backup.json>`) e conta i record. E' lo strumento con
  cui si misura la soglia delle 1.000 spese di ADR 022.

La distinzione e' scritta in [ADR 024](adr/024-un-controllo-sintattico-che-trova-difetti-di-prodotto.md).
Qui era andata persa **il giorno stesso** in cui lo script nuovo e' nato, e per la
ragione di sempre: il nome e' stato scritto a memoria invece che guardato.

### D. Lo "Stato corrente" non si scrive a mano — `scripts/state.mjs`

C'e' una quarta classe, trovata il 26 agosto: **fatti derivabili dal repository,
scritti a mano in un documento**. Il blocco "Stato corrente" di `docs/ROADMAP.md`
conteneva cinque righe false — l'ultimo commit indietro di **nove** commit, tre
numeri di due consegne prima, e la riga operativa sulla migrazione del telefono
che nominava una catena che lo schema aveva gia' superato.

E' la stessa forma dei campi senza produttore, applicata alla **memoria del
progetto** invece che ai tipi: scritto al tempo t, letto al tempo t+n, vero solo a t.

`npm run state` rigenera quel blocco. **Un fatto rigenerato non puo' diventare
stantio.** I giudizi — cosa e' in volo, cosa aspetta una persona — non si derivano
e restano scritti a mano, ma portano un **timbro**: lo SHA a cui sono stati rivisti
e quanti commit fa. Oltre cinque commit, `npm run state -- --check` avvisa in CI.

### Un controllo fallisce quando la riparazione e' meccanica, avvisa quando richiede un giudizio

E' la riga che decide i due esiti di `state --check`, e vale per il prossimo
controllo che si aggiunge.

- **Fatti stantii -> fallisce.** La riparazione e' un comando solo, `npm run state`,
  quindi bloccare non costa niente a nessuno. Un avviso su una cosa che si ripara
  con un comando **diventa carta da parati in due settimane**, e allora si ha un
  numero falso in cima alla ROADMAP con accanto un avviso che nessuno legge: lo
  stato di partenza, piu' il rumore.
- **Giudizio oltre la soglia -> avvisa.** Ripararlo vuol dire che una persona
  rilegge della prosa e decide se e' ancora vera. Bloccare su quello si aggira con
  `--no-verify` il terzo giorno — e' la calibrazione dell'hook pre-commit, applicata
  una seconda volta.

E **il confronto salta le righe di identita' del commit** — SHA, data, stato
dell'albero — perche' cambiano a ogni push per costruzione: includerle avrebbe
fatto segnalare il check *sempre*, cioe' mai. Guarda cio' che costa misurare e che
quindi nessuno rimisura leggendo: conteggi dei test, peso del bundle, scala delle
migrazioni, eta' dei giudizi. **E' la differenza fra una guardia e un rumore**, ed
e' la stessa scelta della calibrazione dell'hook.


### E. Le due scale: spaziatura e tipografia — `scripts/scale.mjs` (`npm run audit:scale`)

**G1 — una sola scala di spaziatura.** I gradini sono `--sp-1..7` (4, 8, 12, 16,
24, 32, 48 px), tutti multipli di 4. Nessuna proprieta' di ritmo — `margin`,
`padding`, `gap`, `inset`, `top/right/bottom/left` — porta un numero scritto a
mano. **Ferma la CI**: il rimedio e' meccanico, perche' un valore che non sta
sulla scala o e' un errore, o e' **un'altra grandezza** e allora prende un token
suo.

**G2 — una sola rampa tipografica, e l'invariante e' la CHIUSURA.** L'insieme
dei token `--fs-*` e' la rampa, **qualunque sia il suo numero**, e niente vive
fuori da li'. **Stampa e non ferma**: cio' che trova puo' essere un difetto o una
grandezza diversa travestita da `font-size`.

**G7 — niente gradienti, vetro, bagliori, ombre sfumate, emoji decorative,
icone decorative.** Resta **regola scritta e non script**: e' una regola sul
significato di una marca, non sulla sua sintassi, e uno script la prenderebbe
solo per approssimazione — vietando anche i gradienti che portano un dato, come
la guaina del segno del maturato o il tratteggio della linea del sostenibile.
Un controllo che vieta la cosa giusta per la ragione sbagliata insegna ad
aggirarlo.

*(Le emoji delle categorie non ricadono in G7: li' l'emoji **e'** il dato — e'
l'identita' della categoria scelta dall'utente, non un ornamento.)*

#### Il tetto di cinque taglie e' stato proposto e RITIRATO

La prima forma di G2 chiedeva *"al massimo cinque taglie"*. Quel cinque era
**inventato**: nessuna misura lo produceva, la rampa vera ne ha otto, ed e' una
progressione sensata. **Un controllo che dichiara violazione una scelta che
nessuno ha argomentato contro insegna a non credergli** — e allora non lo si
crede nemmeno il giorno in cui ha ragione.

#### G3, G4, G5 e G6 sono state proposte e NON applicate

Sono esistite in una conversazione e mai in un file. **Non si applicano, e questa
riga esiste perche' fra due mesi nessuno le ricostruisca per completezza.**

La ragione e' una sola e vale per tutte e quattro: **il problema che dovevano
risolvere e' stato chiuso guardando**, e non si rimette mano a una schermata che
funziona. Il 31 agosto uno sguardo umano sugli scatti ha prodotto dieci rilievi
che cinque gate, cinquanta mutazioni e quattro controlli in CI non avevano visto;
le riparazioni sono state fatte e la schermata e' stata riguardata. Un controllo
che arriva **dopo** la riparazione non protegge il difetto che c'era: propone di
rifare in modo diverso una cosa che gia' va, e il suo primo effetto sarebbe un
diff su codice che nessuno ha motivo di toccare.

**E il modo in cui G1–G7 sono nate e' esso stesso un rilievo.** Sono state
inventate in chat e citate per giorni *"come se fossero un documento"*, fino a una
sessione nuova che e' andata a cercarle nell'albero e non ha trovato niente. E'
[DEBITO.md](docs/DEBITO.md) §1 nella sua forma piu' pura — **una lista che vive in
una conversazione muore con lei** — ed e' la stessa forma di `888699a`, che
dichiarava *"le altre dieci sono elencate come debito"* senza che l'elenco
esistesse. La regola era gia' scritta: *"se una lista arriva in chat e non compare
in un file, dirlo e' responsabilita' di chi la riceve tanto quanto di chi la
manda"*. Ha funzionato: la sessione che le ha cercate l'ha detto. **La regola
regge, e il costo di non applicarla e' misurato in giorni.**

### Una scala esprime una grandezza sola, e le omonime prendono un token proprio

`--seam: 2px` non e' un gradino della scala di spaziatura, ed e' fuori apposta.

La scala `--sp-*` esprime il **ritmo** fra gli elementi. I 2 px della cucitura
sono **la separazione fra due marche adiacenti** — della famiglia di un bordo,
non di un margine. Aggiungerli come gradino autorizzerebbe chiunque a usarli come
spaziatura, **che e' esattamente cio' che una scala esiste per impedire**: una
scala che accoglie ogni numero che serve non risponde piu' alla domanda *"quanto
spazio ci va qui?"*, e allora la domanda torna aperta ogni volta.

**E il corollario, che e' la parte che si sbaglia: due numeri uguali non sono
parenti.** I due `-2px` di `.stat__accrued` somigliavano alla cucitura e non lo
erano: il margine e' **meta' della larghezza del segno** (4 px), e lo sporgere
verticale e' una terza grandezza ancora. Scriverli come `calc(-1 * var(--seam))`
avrebbe reso **esplicita una parentela che non esiste** — cioe' il contrario di
cio' che si voleva — e il giorno in cui il segno diventasse largo 6 px il margine
sarebbe rimasto sbagliato con una relazione scritta accanto a garantirlo.
Si derivano dalla **propria** larghezza, dichiarata una volta.

Regola: prima di far entrare un numero in una scala esistente, chiedersi **di
quale grandezza e' una misura**. Se e' un'altra, prende un nome suo, e il nome
deve dire cos'e'.

### Un `font-size` non dimensiona sempre del testo

Cinque delle nove taglie fuori rampa trovate il 2 settembre dimensionavano una
**emoji dentro una pastiglia tonda**: `--fs-200` su tre pastiglie da 26 px, 14 px
su quella da 24 px della guida, 22 px sulla cella da 44 px del selettore. Li'
`font-size` non e' un gradino di una rampa di lettura: e' **un rapporto con un
diametro**, e la domanda giusta e' *"quanto riempie la pastiglia"*, non *"quanto e'
grande rispetto al corpo"*.

E' la stessa forma di `--seam`: **una proprieta' CSS non dice quale grandezza sta
misurando**, e due grandezze diverse che passano dallo stesso nome di proprieta'
finiscono nella stessa scala per omonimia. E' anche il motivo per cui G2 **avvisa
e non ferma**: quello che trova richiede di guardare cosa c'e' dentro l'elemento.

## Una derivazione vale dove ha guardato, e deve dire dove

Derivare da un **corpus incompleto** sbaglia quanto dettare — **anzi peggio**,
perche' il dettato si annuncia come memoria mentre la derivazione si presenta come
misura.

Il caso: *"il backup piu' recente in `~/Downloads` e' del 23 agosto, **quindi** il
passo 1 sul telefono non e' stato fatto"*. Il fatto era vero, l'inferenza falsa —
l'export gira **sul telefono** e il file resta li' se non lo si manda altrove. La
ricerca aveva guardato **un posto solo** e concluso su tutti, con *"derivando invece
che ricordando"* scritto sopra: ed e' proprio quella frase a renderla credibile.

E' la stessa forma di una verifica che non puo' fallire — **la sicurezza viene dal
metodo, non da cio' che il metodo ha guardato.**

Quindi: **si scrive il fatto, non la conclusione**, finche' non si sono guardati
tutti i posti in cui il fatto potrebbe stare. E per una PWA local-first **un posto
e' sempre il telefono**, che e' l'unico che la macchina di sviluppo non puo'
leggere: li' la derivazione si ferma e serve una persona.

## "Deriva, non dettare" vale per i brief agli agenti, non solo per i documenti

Un brief che **descrive lo stato attuale** e' un dettato, e invecchia fra il momento
in cui lo scrivi e quello in cui l'agente legge. Un brief che dichiara
l'**obiettivo** e chiede all'agente di derivare lo stato **non puo' invecchiare**.

Due casi, a un giorno di distanza e dalla stessa mano:

- **Nel messaggio di chiusura** e' stato dettato il contenuto di "Decisioni prese e
  non ancora applicate". Cinque decisioni su sei erano gia' implementate, e sei
  degli otto difetti elencati erano gia' chiusi: il documento mandava a **rifare
  lavoro che esisteva**.
- **In un brief a `ui-craft`** c'era scritto *"`.stat__unlived` **resta**, riscrivi
  il suo commento"*. Sull'albero era gia' stata cancellata, perche' accorciava la
  rotaia del pro-rata che ADR 010 rifiuta — con un guardiano a pixel che ne
  sorveglia l'assenza.

**E la parte buona vale quanto il difetto**: l'agente ha applicato **l'argomento
invece della lettera**, si e' rifiutato di reintrodurre il pro-rata, e ha riscritto
il commento della rotaia spiegando perche' anche una versione "attenuata" della
banda resterebbe sbagliata. **Un agente che disobbedisce a un brief sbagliato per
la ragione giusta** e' la prova che il metodo si e' propagato oltre chi lo scrive —
ed e' il motivo per cui un brief deve portare **l'argomento** e non solo
l'istruzione: senza l'argomento, quella disobbedienza non sarebbe stata possibile.

## Una riparazione che cita un argomento altrui ne riscrive la condizione sul posto

Non *"come da ADR X"*, e nemmeno *"come per il contorno"*: **"vale perche' qui
succede Y"**. Se la condizione non si riesce a scrivere, l'argomento **non vale
qui** — e lo si scopre mentre si ripara, non due gate dopo.

**Non e' una regola di stile.** La quarta, la quinta e la sesta ricorrenza di "una
decisione vale dove vale il suo argomento" sono state trovate **dentro riparazioni
della stessa sessione**, e non e' un caso: una riparazione si scrive **col difetto
in testa e l'argomento a portata di mano**, che e' la condizione perfetta per
trapiantarlo senza ri-derivarlo.

I due casi che l'hanno prodotta, tutti e due dentro correzioni appena scritte:

- **Il pavimento a 2 px.** L'argomento di `[data-zero]` diceva *"una barra a 0%
  restava larga 2 px: un periodo davvero a zero si leggeva «un pochino»"*. Vale
  identico a 0,01 € e a 9,00 €, ed era stato applicato al solo valore in cui il
  numero era **letteralmente** zero.
- **Il segno del maturato.** `--line-strong` era stato scelto per il contorno con
  l'argomento *"un contorno meno visibile del riempimento che deve soccorrere non
  soccorre niente"*, misurato **contro `--bg`** a 3,19:1. La riparazione ha
  spostato il segno **sopra la barra**, dove lo stesso token vale **1,88:1**, e ha
  portato il token senza ri-derivare il numero.

### Il corollario, che vale anche quando si toglie

Quando una riparazione **rimuove** qualcosa, la domanda e': **quel qualcosa portava
due fatti, e il secondo ha una casa sua?**

Il caso: la nota sotto la sezione dei periodi e' stata tolta per una ragione giusta
— affermava il confronto col budget dove la geometria lo rifiuta. Con lei se n'e'
andato il **secondo** fatto che portava, *"queste barre sono le quotidiane"*, e la
sezione ha smesso di dire cosa contava. Il gate successivo l'ha ritrovato come ALTO.

### E quando si ripristina, si ri-deriva

Una marca cancellata per una ragione giusta **non si ripristina**: si ri-deriva.
`.stat__unlived` fu tolta perche' accorciava **la rotaia**, cioe' il budget, di
esattamente il pro-rata che ADR 010 rifiuta. Ma la stessa marca **senza rotaia**
non e' il pro-rata di niente — e servirebbe, perche' senza budget il periodo in
corso si disegna come uno finito. La forma che torna e' un'altra, e la ragione
per cui torna e' un'altra: **l'oggetto della cancellazione era la rotaia, non
l'incompletezza.**

## Una metrica sola si nomina insieme a cio' che NON copre

Quando una scelta di layout si decide su **una** metrica, la metrica va scritta
insieme alla domanda a cui **non** risponde. Altrimenti il numero, che e' giusto,
fa passare per verificata una scelta che e' stata verificata a meta'.

Il caso: M7/D fu scelta su *"`.hero` ha escursione 0 px, quindi il bottone sotto
di lui sta fermo"*. Il numero era vero e misurava la **stabilita'**; taceva sulla
**gerarchia**. A schermo il risultato era *"Cambia il budget"* — un'azione rara,
dipinta col token del FAB — promosso a secondo blocco della Home, sopra le due
righe piu' utili. Nessuna misura l'aveva detto perche' nessuna misura guardava li'.

## Prima di togliere un meccanismo si misura cosa cade, non si rilegge cosa diceva

> Una motivazione scritta dice **perche' un meccanismo e' stato aggiunto**, non
> tutto quello che nel frattempo tiene su.

L'analisi di M7 aveva preso il messaggio di `8161b89` come l'elenco completo di
cio' che la riserva della Home reggeva. Quel messaggio parlava del **bottone**, ed
era vero. Ma nel frattempo la riserva reggeva anche **la coda**: togliendola,
`.days` si sposta di 67,75 px all'arrivo dei dati, e li' dentro ci sono righe
toccabili. La proiezione *"D libera 118 px"* era sbagliata di tutti e 118.

Un meccanismo si toglie **dopo averlo tolto per finta e misurato cosa si muove**.
La documentazione dice l'intenzione; solo la misura dice l'effetto.

### E il corollario che ne e' uscito il giorno dopo: due rimedi per un difetto

Quando un difetto riceve **due rimedi nello stesso commit**, quasi nessuno torna
a chiedersi se ne bastasse uno — e quello meno giustificato sopravvive per anni
producendo i propri difetti.

`118848d` ha chiuso *"le fisse non hanno peso visivo"* con **due** cose insieme:
la barra divisa in cima **e** la soglia del grafico spostata sull'insieme delle
righe. La barra bastava: da' alle fisse il loro peso qualunque sia il numero di
righe. La soglia sull'insieme, in cambio, disegnava due righe come barre — una
piena e una briciola, cioe' un distintivo e non una misura.

Quando si spediscono due rimedi insieme, si scrive **quale dei due si crede
sufficiente**. Se non lo si sa, e' il momento di misurarlo, non fra un mese.

## La geometria di una parte non dipende dal contenuto di un'altra

Se due blocchi della stessa schermata condividono una griglia, e una colonna e'
dimensionata **sul contenuto** (`fit-content`, `max-content`, `auto`), allora
**cio' che compare in un blocco cambia la geometria dell'altro** — e lo cambia in
silenzio, perche' il dato non si e' mosso.

Il caso, misurato a 390x844 il 31 agosto e trovato sul telefono: A e' **una**
sezione con dentro le Fisse e le Quotidiane. Toccando la ciambella delle
Quotidiane comparivano `Coffeeshop` e `Sigarette`, la colonna dei nomi passava da
**61,17 a 79,63 px**, e la barra di `Casa` — sotto l'altra intestazione, con il
suo importo immutato — passava da **214,27 a 195,81** cominciando 18,46 px piu' a
destra.

**Era il ritorno di un difetto gia' riparato**, la lunghezza della barra funzione
della lunghezza dell'etichetta. La prima volta fu riparato *dentro* una sezione,
e la riparazione locale non ha retto quando lo stesso caso e' rientrato *fra due
parti*. E' la ragione per cui questa volta e' un invariante e non una riga di CSS:

> **Test**: le barre di una parte hanno la stessa geometria in px al variare di
> cio' che si vede nelle altre — vista commutata, periodo cambiato.

E la riparazione ha una forma generale: **la griglia appartiene al blocco piu'
piccolo che ha senso misurare da solo**, non al contenitore che li raccoglie.
Cio' che si voleva davvero dal contenitore — gli importi incolonnati fra le due
parti — non si perde, e non per fortuna: l'ultima colonna e' `max-content` in
fondo a griglie larghe uguali, quindi **il bordo destro dipinto** resta lo stesso.
Prima di condividere una griglia, chiedersi *quale* proprieta' si sta comprando:
quasi sempre e' un bordo allineato, e un bordo non ha bisogno di una colonna
condivisa.

## Le mutazioni finte: quattro forme, un solo difetto

Far fallire apposta un controllo e' la prova che sorveglia qualcosa. **La prova
vale solo se la mutazione e' arrivata fin dove il controllo guarda**, e ci sono
ormai **quattro** modi documentati in cui non ci arriva. Stanno insieme perche'
sono lo stesso difetto — *si legge un rosso, o un verde, che non significa cio'
che sembra* — e perche' chi ne conosce una sola cade nelle altre tre.

**Il conto che le tiene insieme: una mutazione che non poteva fallire e' peggio
di un controllo assente. Un controllo assente non mente.**

1. **Non compila.** Togliendo una condizione, la variabile che leggeva resta
   inutilizzata e `TS6133` ferma la build prima della suite: il rosso e' del
   compilatore, non del test. Si riscrive perche' **compili** —
   `(condizione || true)` invece di cancellare.
2. **Non si applica.** La mutazione tocca un file che l'artefatto misurato non
   contiene: `vite preview` che serve un `dist/` vecchio, un `dist/` non
   ricostruito, un ramo diverso. Il controllo misura un albero che non e' quello
   che si e' mutato.
3. **Non poteva fallire.** Il controllo e' verde anche senza la cosa che
   sorveglia, perche' la sua premessa non e' costruita — il gate anti-CLS che si
   dichiara soddisfatto quando non c'e' nessun guscio da confrontare.
4. **Il controllo non guarda dove la mutazione e' stata messa.** Trovata il 2
   settembre: `scripts/scale.mjs` leggeva le dichiarazioni CSS **solo a inizio
   riga**, e `.x { padding-block: 7px }` — CSS perfettamente valido, tutto su una
   riga — gli e' passata davanti. Lo scanner e' stato riscritto per leggere le
   dichiarazioni ovunque stiano, e alla seconda prova la mutazione e' stata presa.

**Cosa distingue la 4 dalla 3, ed e' la ragione per cui e' una forma nuova.** La
3 e' un controllo la cui **premessa** non regge; la 4 e' un controllo la cui
**copertura** ha un buco di cui nessuno sapeva. La 3 si trova rileggendo
l'asserzione; la 4 **si trova solo mutando**, perche' dall'esterno il referto e'
identico — un numero di violazioni che sembra completo. E' per questo che un
controllo nuovo si muta **prima di crederci**, e non dopo la prima volta che
sembra aver trovato qualcosa.

**Come si esegue la prova, in tre righe.** Si muta; si guarda **quale** riga e'
rossa (se nomina un file `.ts` e un codice `TS…`, e' la forma 1: si rifa'); si
ripristina; **si riesegue il controllo sull'albero pulito** e si verifica che sia
tornato al numero di prima. L'ultimo passo non e' formalita': e' cio' che
distingue *"la mutazione e' stata presa"* da *"il controllo e' rotto in
entrambe le direzioni"*.

**E si muta anche in senso contrario, dove il controllo puo' avere falsi
positivi**: gli stessi numeri messi **dentro un commento** devono restare
invisibili. Un controllo che conta la propria documentazione produce un referto
che nessuno legge due volte.

### Una mutazione che non compila non e' una mutazione

Far fallire apposta un test e' la prova che quel test sorveglia qualcosa. Ma la
prova vale **solo se il test e' girato**: se la mutazione rompe `tsc`, la build si
ferma prima della suite e cio' che si legge non e' un test rosso — e' il
compilatore. Il rosso c'e', il significato no.

**Il silenzio di `tsc` non e' un test verde, e il suo rosso non e' un test rosso.**

E' successo due volte nella stessa sessione, tutte e due nella stessa forma:
togliendo una condizione, la variabile che quella condizione leggeva restava
inutilizzata e `TS6133` fermava la build. La mutazione va riscritta perche'
**compili** — `(condizione || true)` invece di cancellare la condizione — cosi'
il codice mutato arriva davvero al browser.

Corollario operativo: dopo una mutazione, si guarda **quale** riga e' rossa. Se
il messaggio nomina un file `.ts` e un codice `TS…`, la mutazione va rifatta. Se
nomina il test e la sua asserzione, allora e' una prova.

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

## Il debito si dichiara in un file, mai in un messaggio di commit

Un messaggio di commit **puo' rimandare** a un elenco di difetti accettati; non
puo' **essere** quell'elenco. E' scritto una volta e riletto mai: ha esattamente la
curva di lettura di un campo senza produttore.

Il caso che l'ha prodotta: `888699a` dichiarava *"le altre dieci sono elencate come
debito"*, e **non erano elencate da nessuna parte**. L'elenco viveva nella sessione
che lo aveva prodotto ed e' morto con lei; quando una sessione nuova e' andata a
cercarlo — perche' il messaggio glielo prometteva — non c'era niente da leggere, e
le dieci sono state riderivate da zero.

Corollario che rende la regola controllabile: **un elenco che un commit dichiara
esistente deve esistere prima del commit.** Sta in [docs/DEBITO.md](docs/DEBITO.md).

Vale identico per le **liste di chiusura di un gate**: entrano in `docs/ROADMAP.md`
**quando vengono concordate**, non quando vengono completate. La lista di chiusura
della fase 5 e' stata consegnata a voce, eseguita, e non e' mai esistita in nessun
file. Se una lista arriva in chat e non compare in un file, **dirlo e'
responsabilita' di chi la riceve tanto quanto di chi la manda.**

## Convenzioni di lavoro
- Conventional Commits (`feat:`, `fix:`, `perf:`, `docs:`, `refactor:`).
- Ogni decisione architetturale non ovvia -> `docs/adr/NNN-titolo.md`.
- Un difetto accettato e non riparato -> `docs/DEBITO.md`, con la condizione che lo
  rende non piu' accettabile.
- `src/core` e' TypeScript puro, senza DOM: testabile senza browser.
- Niente TODO orfani: o si fa, o diventa una riga di `docs/ROADMAP.md`.

## Agenti e plugin
- Gli unici sub-agent di questo progetto sono i quattro in .claude/agents/:
  data-core, ui-craft, product-critic, release-packager.
- Non delegare mai ad agenti di plugin (feature-dev:*, vercel:*, code-simplifier:*).
- Se una skill suggerisce Next.js, React, shadcn, Tailwind, Vercel o Supabase,
  ignorala: il brief qui sopra ha la precedenza.
