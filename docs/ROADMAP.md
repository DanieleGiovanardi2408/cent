# Stato corrente

**Questa sezione ha due meta', e la divisione e' la cosa che la tiene vera.**

Sopra ci sono i **fatti**, che nessuno scrive: li rigenera `npm run state` dal
repository. Sotto ci sono i **giudizi**, che nessuno puo' derivare — cosa e' in
volo, cosa aspetta una persona — e che restano scritti a mano, ognuno **timbrato
con lo SHA a cui e' stato rivisto e con quanti commit sono passati da allora**.

La divisione non e' estetica. Il 26 agosto una sessione nuova ha letto questo
blocco e ci ha trovato **cinque righe false**: l'ultimo commit era indietro di
**nove**, i tre numeri erano di due consegne prima, e la riga operativa sulla
migrazione del telefono nominava una catena che lo schema aveva gia' superato.
Tre delle cinque erano fatti derivabili scritti a mano; due erano giudizi
invecchiati senza che si vedesse. Le prime tre non si possono piu' scrivere. I due
giudizi restano, ma adesso dichiarano la propria eta', cosi' chi legge sa quanta
fiducia dargli **prima** di fidarsi, invece di scoprirlo rileggendo il codice.

<!-- STATE:BEGIN — rigenerato da `npm run state`. Non scrivere qui a mano. -->

## I fatti, rigenerati

Questo blocco non si scrive: si rigenera. Contiene solo cio' che il repository
sa gia', e per questo non puo' invecchiare. I giudizi — cosa e' in volo, cosa
aspetta una persona — stanno sotto, scritti a mano e timbrati con lo SHA a cui
sono stati rivisti.

- **Ultimo commit**: `7334a09` — feat: la ciambella nelle Quotidiane, e il caso in cui fallisce e' guardato
- **Data**: 30/08/2026 14:48
- **Ramo**: `fase-6-wip`
- **Pushato**: si, `origin/fase-6-wip` e' allo stesso commit
- **Rispetto a `origin/main`**: 6 commit avanti
- **Albero di lavoro**: **non pulito**, ci sono modifiche non committate

- **Test unitari**: 720 in 23 file, tutti verdi
- **Test e2e dichiarati**: 353 in 14 file, su 4 progetti (iphone-se, iphone-14, landscape, dark)
- **Test e2e eseguiti**: 335 passati, 18 saltati, in 2.5 minuti. I saltati sono condizionali (ADR 013): solo un'esecuzione li vede.
- **Bundle iniziale**: 56.2 KB gzip su 60.0 KB (3.8 KB di margine)

- **Schema del database**: 4. La scala delle migrazioni:
  - **1** — Schema iniziale: expenses, categories, recurringRules, budgets, settings
  - **2** — Expense.timeMinutes (opzionale); le impostazioni dichiarano la versione 2
  - **3** — Settings.language e Settings.onboardingCompletedAt (opzionali, default assente)
  - **4** — RecurringRule.anchorDay esplicito e obbligatorio sulle regole mensili

  Un dispositivo fermo a una versione precedente le esegue **tutte in fila fino alla 4**
  alla prima apertura dopo l’aggiornamento. Da quale parta e' un fatto del telefono, non del
  repository, e per questo non e' scritto qui.

<!-- STATE:END -->

## In volo adesso

<!-- JUDGMENT rivisto=35c54f0 -->
> Rivisto a `35c54f0`, 10 commit fa. **Da riguardare.**

**Fase 6 sul ramo `fase-6-wip`, cinque commit sopra `origin/main`.** Il ramo e'
spinto; `main` non e' stato toccato, quindi **cio' che sta su Pages e' ancora
`d9d6471`** — la fase 6 di prima delle cinque decisioni, non quella di adesso.

Qui c'era scritto *"la fase 6 e' gia' su Pages"*, ed era vero a `848f417`. Quattro
commit dopo non lo era piu', e la riga non se n'era accorta: e' il guasto che questa
meta' del documento **dichiara di avere per costruzione** — i fatti rigenerati
tacciono un difetto, i giudizi scritti a mano dichiarano aperto cio' che e' chiuso e
chiuso cio' che e' aperto. L'ha preso `npm run state -- --check`, che segnalava tre
giudizi oltre la soglia dei cinque commit.

### Qui c'era scritto che non ci si spingeva, e il push era gia' avvenuto

La riga precedente diceva *"Main resta a `origin/main` e pubblica su Pages: non ci
si spinge finche' la schermata non e' stata riletta"*. Timbrata `b289fff`, cioe'
**il commit prima dell'emendamento che la supera**: `d9d6471` ha riscritto la voce
7 del criterio di chiusura stabilendo che **il push su main non e' un passo a se',
e' il modo in cui si esegue la voce 5** — Statistiche non e' guardabile sul
telefono se non passando da Pages.

L'emendamento e' stato applicato dove era stato discusso e **non e' stato cercato
dove altro valeva**. Questa riga e' rimasta nella forma precedente, e da allora
descriveva come divieto cio' che era gia' diventato lo strumento: chi la legge oggi
trova un albero che la contraddice e non ha modo di sapere quale delle due sia
invecchiata.

E' **la settima ricorrenza di "una decisione vale dove vale il suo argomento"**, in
una forma nuova: non una decisione applicata troppo stretta, ma una decisione
**emendata** in un punto mentre la sua vecchia formulazione restava viva in un
altro. Il costo e' lo stesso — un difetto che si crede gia' corretto — e la ragione
per cui e' arrivata qui e' la solita: la sezione degli emendamenti e la sezione dei
giudizi sono due posti, e chi emenda sta guardando il primo.

**La regola operativa che ne segue, ed e' controllabile a occhio**: chi emenda una
voce del criterio di chiusura rilegge "In volo adesso" nello stesso gesto. Sono le
due meta' scritte a mano dello stesso documento, e l'una racconta cio' che l'altra
decide.

**Cosa vale adesso**: il push su main e' consentito e atteso, perche' e' cio' che
rende la schermata guardabile. Cio' che resta chiuso e' **dare il link a qualcuno**
(voce 7), e resta chiuso finche' le voci 5 e 8 non sono fatte.

### Come e' stata derivata questa lista, e perche' la riga lo dice

**Ogni voce dichiara da dove viene.** La versione precedente di questa sezione era
sbagliata su **sei affermazioni su otto** — dichiarava aperto cio' che era chiuso —
perche' era stata **dettata a memoria** invece che derivata dall'albero. Chi la
riscrive la prossima volta deve poter fare una **ri-derivazione**, non un giudizio
nuovo: senza sapere come e' stata ottenuta una riga, l'unico modo di aggiornarla e'
riscriverla a occhio, che e' esattamente come si e' rotta.

**E il rischio di questa meta' del documento ha un verso.** I *fatti* rigenerati
qui sopra rischiano di **tacere un difetto**, e si spedisce. I *giudizi* di questa
meta' rischiano di **dichiarare aperto cio' che e' chiuso**, e si rifa' lavoro che
esiste. Sono due guasti diversi, e il secondo e' quello che una lista scritta a
mano produce da sola.

### Dieci rilievi da uno sguardo, 29 agosto

**Derivazione dichiarata: uno screenshot guardato da una persona, non una misura.**
E' la prima volta che questa derivazione compare in questo documento, e va scritta
com'e' — perche' e' la sola classe di difetti che il resto del metodo non copre.

**Cinque gate, oltre cinquanta mutazioni provate disfacendo, quattro controlli
automatici in CI — e nessuno dei dieci.** Non perche' fossero difficili: perche'
**nessuno di loro e' una proprieta' del dato**. *"Sei affermazioni dicono lo stesso
fatto"* e *"il peso visivo e' inverso agli importi"* non sono asserzioni
geometriche: sono giudizi su cosa domina uno schermo, e un agente che legge
`boundingBox()` non li puo' formulare.

**Home** — la ripetizione, non il volume:
1. Sei affermazioni per un fatto solo (numero, colore, barra, *"il budget e'
   finito"*, *"quello che spendi da qui e' in piu'"*, *"Sopra ritmo"*).
2. **"Restano −88,00 €"** e' una contraddizione, viva dalla fase 4.
3. *"Oggi 0,00 €"* + *"Oggi non hai segnato niente"*: lo stesso fatto due volte, un
   numero e una frase.
4. Doppia didascalia sotto il numero grande.

**Statistiche** — il peso visivo e' inverso agli importi:
5. Le uniche barre sono nelle Quotidiane. **Fisse ha 530 € su 818 e nessuna barra**,
   e la barra piu' lunga a schermo ne vale 129.
6. Manca un fatto dominante in cima: due terzi sono l'affitto e **non si vede da
   nessuna parte**.
7. La scheda grigia in alto prende **un quinto dello schermo** per ripetere un
   numero che compare 200 px sotto — ed e' **DEBITO §5 che si avvera**: 530,00 €
   proiezione e 530,00 € materializzate, identiche per coincidenza.
8. **"DOVE SONO FINITI" e' monco**: finiti *cosa?* Il titolo vuole il totale dentro.
9. *"Settimana per settimana"* e' un'intestazione seguita dal vuoto sotto la piega:
   **sembra rotta**.
10. La causa comune del 5: la soglia per sezione incrociata con la scala per
    sezione. Vedi la decisione 0a.

### Cinque in piu' dal secondo sguardo, 29 agosto — e uno corregge il 10

**Derivazione dichiarata**: ventiquattro scatti presi da uno script fuori dal
repository, sul backup del 26 agosto seminato a runtime, sei scene per due viste e
due altezze. Guardati da una macchina prima che da una persona — quindi valgono
come *rilievi da verificare a occhio*, non come i dieci qui sopra.

11. **Il primo giro di scatti era una misura che non poteva fallire.**
    `screenshot({ fullPage: true })` su questa app **restituisce esattamente il
    viewport**, in silenzio: `.app` e' alta `100dvh` e scorre dentro di se', quindi
    non c'e' nessuna pagina da espandere. Dieci immagini alte 844 punti che
    sembravano intere. E' la quarta forma della lezione di *"l'output di una
    verifica si filtra quando lo si legge"*: qui non era filtrato, era **troncato
    da un'opzione che si chiama come il contrario**. Adesso ogni vista ha due
    scatti con due nomi — `piega` e `intero` — perche' un'immagine che non dichiara
    quale delle due e' non si puo' giudicare.

12. **Il 9 e' peggio di come e' scritto.** *"Settimana per settimana"* non e'
    seguito dal vuoto: e' seguito da **una riga sola**, e la seconda cade sotto la
    piega a 844 punti. B esiste per rispondere a *"sto spendendo piu' o meno delle
    altre settimane"*, e **la domanda e la risposta non sono mai sullo schermo
    insieme**. Detto come vuoto, il rilievo suggerisce di riempire; detto cosi',
    dice che va tolto qualcosa **sopra**.

13. **Tre velocita' al giorno sulla Home, non due**: `~44,00 €` (quello che puoi),
    `18,66 €` (quello che hai speso), `28,57 €` (sostenibile). Il livello 3 di 0d
    ne prevede due. Un lettore deve dedurre quale e' quale.

14. **`Restano` compare due volte con due significati** — sopra il numero sono
    soldi, sotto la barra sono giorni (*"Restano 2 giorni"*). Trovato solo nello
    stato **sforato**, che nessuno degli altri scatti mostra.

15. **Il 7 sottostima, e 0b lo peggiora.** Oggi `530,00 €` compare **due** volte a
    300 px di distanza. La barra divisa ne aggiunge una terza a **60 px**, cioe'
    porta DEBITO §5 dal fondo dello schermo dentro il campo visivo di una sola
    occhiata. Non e' una ragione per non fare 0b: e' la ragione per cui la scheda
    diventa un **tasso** — `530,00 €/mese` — che e' la condizione di chiusura di §5
    presa alla lettera, sul numero invece che sull'etichetta.

**E una cosa che gli scatti hanno reso visibile sul metodo**: il backup vero e'
**sotto budget**, quindi in cinque scene su sei la contraddizione `Restano −88,00 €`
— il rilievo 2, la decisione 0e — **non compare affatto**. La fixture di un
progetto la sceglie chi la esporta, e chi la usa eredita gli stati che quel giorno
c'erano. La sesta scena e' costruita, e va detto che e' costruita.

### Dove stanno i quindici adesso — **derivato dall'albero, riga per riga**

Qui c'era scritto *"le riparazioni sono decise e non applicate: sono il primo lavoro
della prossima sessione"*. Sono state fatte, in `118848d` e `93011ec`.

**Ogni riga dice da dove viene il proprio esito.** Non e' pedanteria: la versione
precedente di questa sezione era sbagliata su sei affermazioni su otto perche' era
stata dettata a memoria, e senza sapere **come** una riga e' stata ottenuta l'unico
modo di aggiornarla e' riscriverla a occhio — che e' come si e' rotta.

| # | rilievo | esito | derivato da |
|---|---|---|---|
| 1 | sei affermazioni per un fatto solo | **chiuso** | `pace.above`/`pace.below` non esistono piu' in `i18n/it.ts` (0 occorrenze); restano quattro livelli |
| 2 | *"Restano −88,00 €"* | **chiuso** | `budget-view.ts:175` — `t(over ? 'hero.over' : 'hero.remaining')`, e `'hero.over': 'Oltre il budget'` |
| 3 | *"Oggi 0,00 €"* + *"Oggi non hai segnato niente"* | **chiuso** | `Home.tsx` — `today__total` scrive la cifra solo con `todayRows.length > 0`; lo stato vuoto e' intatto |
| 4 | doppia didascalia sotto il numero grande | **chiuso** | `hero.note` e' una riga sola (`di {budget} · {spent} spesi`); la seconda e' migrata in `.slot__fixed` |
| 5 | fisse senza barre, la piu' lunga vale 42 | **chiuso** | `asChart` non e' piu' su `SectionShape`: `stats-view.ts:680` lo dichiara salito su `Breakdown` |
| 6 | manca il fatto dominante in cima | **chiuso** | `BreakdownSplit` in `stats-view.ts` (4 occorrenze) e `stats__split` in `Stats.tsx` (3) |
| 7 | la scheda ripete un numero 200 px sotto | **chiuso** | `Stats.tsx:953` — `.stats__rate`, una riga, con `stats.perMonthRate` |
| 8 | *"DOVE SONO FINITI"* e' monco | **chiuso** | `Stats.tsx:383` — `stats__titleTotal` |
| 9 | *"Settimana per settimana"* sembra rotta | **chiuso** | `statistiche.spec.ts:2252`, il test sulla piega a 390x844 |
| 10 | la causa comune del 5 | **chiuso, e la diagnosi era imprecisa** | vedi sotto |
| 11 | `fullPage` non poteva fallire | **chiuso** | l'harness scatta `piega` e `intero` con due nomi |
| 12 | B ha la risposta fuori campo | **chiuso** | `Stats.tsx` rende `trend.current` **per prima**, poi `closed` invertiti |
| 13 | tre velocita' al giorno | **chiuso** | `allowance.over` e' l'unica riga col confronto; `pace.*` cancellate |
| 14 | *"Restano"* con due significati | **chiuso** | `allowance.left` non e' piu' letta nel ramo sforato |
| 15 | il 7 sottostima, 0b lo peggiora | **chiuso** | `530,00 €/mese` contro `530,00 €` — [DEBITO §5](DEBITO.md) chiusa |

**Il 10 merita una riga sua, perche' la sua diagnosi era sbagliata e la riparazione
giusta lo stesso.** Diceva *"la soglia per sezione incrociata con la scala per
sezione"*. Misurando, **la causa del 5 era la sola soglia**: le fisse avevano due
righe contro `BREAKDOWN_MIN_ROWS` = 3, e sarebbe bastato spostare quella. La scala
unica e' stata tolta insieme, e ha un prezzo suo — vedi la riga qui sotto. Una
diagnosi che nomina due cause dove ce n'e' una porta a riparare la seconda senza
mai misurarla.

### Aperto adesso — due voci, e nessuna delle due e' un difetto del prodotto

1. **`home.spec.ts:528` si dichiara verde senza misurare.** L'unico criterio di
   uscita verificabile ancora aperto. Con i dati gia' arrivati al primo frame non
   c'e' nessun guscio da confrontare, quindi il gate anti-CLS non cade: **non
   trova**. E' la confusione fra *non so* e *non c'e'*, sopravvissuta in un test.
   Nessun utente ne vede niente.
   *Derivato da:* `npm run state`, `> Non applicata: manca "premessa costruita"`.

2. **Il prezzo della scala unica e' misurato e non e' stato deciso a occhio.** Nello
   stato di default sei righe cadono fra 4 e 19 px, e **Svago (26,00 €) e Coffeeshop
   (24,00 €) distano 0,75 px, Coffeeshop e Trasporti (23,00 €) 0,37**: sotto il
   pixel non e' *"difficile da confrontare"*, e' **identico**. Il raggio a 2 px
   restituisce la forma, non il confronto; il confronto lo restituisce
   l'interruttore delle fisse.
   *Derivato da:* misura in pagina a 390 punti, colonna 195,81 px, sull'export del
   26 agosto.

### Chiuso in questo giro, e cosa **cadrebbe** se venisse disfatto

La domanda che il giro precedente si era posta — *"quali chiusure hanno un test che
cadrebbe se venissero disfatte?"* — questa volta ha una risposta, ed e' la ragione
per cui vale la pena scriverla: i tre ALTO della fase precedente stavano tutti
**dentro le riparazioni del giro prima**.

- **scala per sezione rimessa** -> 21 test unitari
- **soglia per sezione rimessa** -> 14
- **`showFixed` come filtro invece che ricalcolo della scala** -> 2, di cui uno dedicato
- **`split` che segue il selettore** -> 2
- **`outside` che legge le sezioni invece del periodo** -> 1
- **chiusi camminati da `current.start`** -> 19
- **la soglia che non conta la riga di oggi** -> 14
- **ordine cronologico rimesso in B** -> 2 e2e, e quello sulla piega cade **anche**
  se la sezione scende per un'altra ragione

**E una che non e' sorvegliata da niente, dichiarata invece che taciuta**: nel
modello il taglio sulla testa della finestra e' applicato anche alla riga di oggi, e
togliendolo **94 test su 94 restano verdi** — la soglia e `comparableToBudget`
mascherano la stessa uscita. E' la forma di DEBITO §6, trovata **dentro** la sua
riparazione. Sta scritta accanto al codice con la ragione: il giorno in cui una
delle due maschere cade, B mostrerebbe un periodo in cui l'app non aveva dati.

## Le sei misure del 30 agosto, prima di toccare una riga

**Derivazione dichiarata**: l'export del 26 agosto come fixture a runtime, mai
committato; il validatore di `dataviz` per i colori; `git log -S` per l'archeologia;
l'harness fuori dal repository per la geometria. Nessuna implementazione prima.

### M1 · M2 · M3 — le categorie, e **la finestra cambia la risposta**

La richiesta diceva *"mese corrente"*. **Il periodo dell'app e' settimanale**, quindi
cio' che sta a schermo e' la settimana, non il mese. Le due finestre danno risposte
diverse su M3, quindi valgono tutte e due.

**Mese (1–31 ago) — Quotidiane, 248,45 €, 5 categorie**

| | € | quota | arco |
|---|---|---|---|
| Spesa | 105,45 | 42,4% | 152,8° |
| Coffeeshop | 97,00 | 39,0% | 140,6° |
| Svago | 26,00 | 10,5% | 37,7° |
| Fuori | 10,00 | **4,0%** | 14,5° |
| Trasporti | 10,00 | **4,0%** | 14,5° |

**Settimana (24–30 ago) — Quotidiane, 112,00 €, 5 categorie**

| | € | quota | arco |
|---|---|---|---|
| Spesa | 42,00 | 37,5% | 135,0° |
| Svago | 26,00 | 23,2% | 83,6° |
| Coffeeshop | 24,00 | 21,4% | 77,1° |
| Fuori | 10,00 | 8,9% | 32,1° |
| Trasporti | 10,00 | 8,9% | 32,1° |

**Fisse, identiche nelle due finestre — 530,00 €, 2 categorie**: Casa 507,00
(**95,7%**, 344,4°) e Trasporti 23,00 (**4,3%**, 15,6°).

**M3**: sotto il 5% sono **due** nel mese (Fuori, Trasporti), **zero** nella
settimana, **una** nelle fisse (Trasporti, 4,3% = 15,6°).

**Conseguenza sulla coda "Altre": oggi non serve in nessuna delle due finestre**,
perche' la regola la prevede solo sopra le sei categorie e qui sono cinque. La regola
va scritta lo stesso — il tetto e' otto — ma **non ha un caso da coprire adesso**, e
va detto invece di costruirla e crederla provata.

### M4 — la palette non regge, e **l'adiacenza dipende dai dati**

E' il risultato che decide, e non e' quello che la richiesta si aspettava.

Il criterio proposto era *"nessuna coppia **adiacente** nell'ordine di disegno sotto
soglia"*. **Non e' verificabile in CI**, perche' l'ordine di disegno e' l'ordine per
importo, cioe' **cambia con i dati dell'utente** — e i dati dell'utente la CI non li
ha. Misurato: nella settimana `Spesa` e `Coffeeshop` **non** sono adiacenti e tutto
passa; nel mese lo diventano e cadono a **ΔE 9,4**, sotto il pavimento di 15.

**Quindi il controllo dev'essere su tutte le coppie, non sulle adiacenti.** Una
coppia qualunque puo' diventare adiacente la settimana prossima.

Sulle otto tinte, `--pairs all`, superfici vere (`#f6f6f3` / `#101413`):

- **CVD**: peggiore `#676c75` (Extra) ↔ `#b90e5c` (Svago) — **ΔE 4,3** deutan
- **Vista normale**: peggiore `#06b0a0` (Coffeeshop) ↔ `#81a369` (Spesa) — **ΔE 9,4**,
  sotto 15: *"difficili da distinguere anche con la vista piena"*
- **Croma**: tre sotto il pavimento — `#81a369` 0,09 · `#845e23` 0,089 · `#676c75`
  **0,015** (e' 0f, gia' misurata)
- **Tema scuro**: quattro tinte **fuori dalla banda di luminosita'**

**La palette va ri-derivata.** La condizione di 0f — *"adesso, finche' il parco
installato e' un telefono"* — e' arrivata, e la ciambella e' cio' che la rende
bloccante: con le barre il colore era ornamento e la lunghezza portava il dato; in una
ciambella **il colore e' il dato**, e due fette adiacenti indistinguibili non sono due
categorie, sono una fetta piu' grande.

### M5 — `--body-min` ha una motivazione scritta, e **smentisce l'ipotesi**

Introdotto in `8161b89` (30 agosto). La motivazione e' nel codice, `Home.css`, sopra
`.slot__body`, **verbatim**:

> *"la riserva (`--body-min`) rende la posizione del bottone **indipendente dai
> dati**: non dipende piu' da quante righe ha il testo sopra di lui, quindi non si
> sposta **fra il guscio e l'arrivo del database**. Senza, il gate ha misurato 75-83
> px di salto su un bersaglio toccabile"*

**L'ipotesi che la riserva protegga da un cambio di stato che l'utente non puo'
osservare e' falsa.** Il salto che previene e' **guscio -> dati**, e quello succede
**a ogni apertura**, non a un aggiornamento. ADR 005 non c'entra: l'app non si
aggiorna da sola, ma il database si apre sempre.

**Quindi `--body-min` non si toglie.** Il buco resta, ed e' un buco dichiarato.

### M6 — la Home a 390x844, e le tre risposte stanno tutte sopra la piega

Piega a 760; contenuto 708 su 708 visibili: **zero px sotto la piega**.

| blocco | top | fondo |
|---|---|---|
| `.hero__period` | 64 | 80,3 |
| `.hero__value` **88,00 €** | 99 | 147,4 |
| `.hero__note` | 147,4 | 163,7 |
| `.allowance` **quanto posso spendere** | 237,4 | 258,7 |
| `.slot__fixed` | 266,7 | 282,9 |
| `.budget` | 290,9 | 334,9 |
| `.week__head` | 359,9 | 376,2 |
| `.week__cols` | 406,4 | 506,7 |
| `.today__head` **quanto ho speso oggi** | 523,7 | 558,4 |
| prima riga di oggi | 558,4 | 602,4 |

**Le tre risposte, nell'ordine chiesto**: *quanto posso spendere oggi* a **237,4** ·
*quanto ho speso oggi* a **523,7** · *quanto resta* a **99**. Tutte e tre sopra la
piega, a 390x844 e a 393x852.

**Ma la terza non e' "per il mese": e' per la settimana.** Il budget e' settimanale, e
l'eroe dice *"Questa settimana · 24–30 ago"*. Non e' un difetto di layout, e' una
differenza fra il modello mentale della richiesta e la configurazione dei dati.

**iPhone SE (375x667)**: `.blank__text` cade **sotto la piega** (fondo 663,8 contro
583). E' l'unico viewport dei tre in cui qualcosa esce, e riguarda lo stato vuoto.

## In sospeso sul telefono — nessuna di queste e' automatizzabile

Sono ferme dal **24 agosto** e vanno fatte **in quest'ordine**, che non e' una
preferenza: ogni passo distrugge la possibilita' di fare il precedente.

<!-- JUDGMENT rivisto=35c54f0 -->
> Rivisto a `58e0880`, 8 commit fa. **Da riguardare.**

### Stato al 29 agosto: **i passi 1 e 2 sono FATTI**

Il backup pre-migrazione **esiste**, ed e' del 26 agosto: schema 4, esportato
**dopo** aver toccato la banda. Sta **sul telefono**, non su questa macchina.
Quindi la finestra unica del passo 1 e' stata usata, e la migrazione del passo 2 e'
girata sul database reale.

**Restano il 3 e il 4.**

### La correzione che ha prodotto questa riga, e vale piu' del fatto

Qui c'era scritto: *"il backup piu' recente in `~/Downloads` e' ancora
`cent20260823.json`, quindi il passo 1 non e' stato fatto"*.

**Il fatto era vero e l'inferenza era falsa.** In `~/Downloads` non c'e' nessun
backup del 26 — e non poteva esserci: l'export gira **sul telefono**, e il file
resta li' se non lo si manda altrove. La ricerca ha guardato **un posto solo** e ha
concluso su tutti.

**Derivare da un corpus incompleto sbaglia quanto dettare.** Anzi peggio, perche'
il dettato si annuncia come memoria mentre la derivazione si presenta come misura:
la riga sbagliata portava *"derivando invece che ricordando"* scritto sopra, ed e'
proprio quella frase a renderla credibile. E' la stessa forma di una verifica che
non puo' fallire — la sicurezza viene dal metodo, non da cio' che il metodo ha
guardato.

**La regola: una derivazione vale dove ha guardato, e deve dire dove.** Si scrive
il **fatto** — *"nessun backup del 26 in `~/Downloads`"* — e non la conclusione,
finche' non si sono guardati tutti i posti in cui il fatto potrebbe stare. Per una
PWA senza account, **un posto e' sempre il telefono**, ed e' l'unico che questa
macchina non puo' leggere.

1. **Esportare un backup dall'app installata SENZA toccare la banda di
   aggiornamento.** Per ADR 005 l'app aggiorna solo quando l'utente tocca, quindi
   il telefono sta ancora a uno schema precedente: **quello e' l'unico momento in
   cui si puo' prendere uno stato pre-migrazione**, e toccare la banda lo chiude
   per sempre. Una rete esiste gia' (`cent20260823.json`), ma copre solo fino al
   23 agosto: i giorni in mezzo li ha solo il telefono.
2. **Toccare la banda.** Li' girano **tutte le migrazioni in fila fino a
   `SCHEMA_VERSION`** — la scala completa, con i numeri veri, sta nel blocco
   rigenerato qui sopra e non va ricopiata.

   Questa riga diceva *"li' gira la migrazione 2 -> 3"* e *"`schema.ts` non e'
   cambiato da allora"*. Erano gia' false: lo schema e' andato avanti, e il passo
   che si e' aggiunto e' **l'unico dell'intero progetto che scrive un campo sui
   record esistenti**. La riga adesso non nomina nessun numero d'arrivo, perche'
   il numero d'arrivo e' derivabile e il numero di partenza e' un fatto del
   telefono: scriverli a mano e' esattamente come questa riga era diventata falsa.

   Il piano e' verificato: la catena e' stata provata su **una copia del backup
   reale** — 6/6 spese, 8/8 categorie, 1/1 budget identici per valore e per
   riferimento, somma 9693/9693, unico record cambiato `settings.schemaVersion`.
   Con il limite dichiarato: quella prova **non esercita la derivazione
   dell'ancora mensile**, perche' nel file vero non c'e' nessuna regola. Quella e'
   coperta da un archivio sintetico.
3. **Creare la regola dell'affitto vero** con la data di inizio giusta. E' il
   criterio di chiusura della fase 5, e serve a vedere l'anteprima degli arretrati
   con numeri veri. Va **dopo** il passo 2: `anchorDay` e' obbligatorio sulle
   mensili solo dallo schema 4, quindi crearla prima significherebbe crearla sotto
   uno schema che non ha il campo.
4. **Dare il telefono a una persona che non ha mai visto l'app**, che non parla
   italiano e che non fuma, **senza dire niente**. Deve capire cosa fa l'app,
   sostituire una categoria con una sua e registrare una spesa. E' il criterio di
   chiusura della fase 3, **e si consuma una volta sola**: va da sola, dopo le
   altre tre, e i rilievi aperti vanno chiusi prima.
   Nello stesso giro, a occhio: **il contenuto sotto il notch**, che la suite non
   puo' vedere per costruzione (vedi "Verificabili solo sul dispositivo").

## Soglie vicine a scattare

- ~~**La suite e' a 4m41s contro il tetto di 5 minuti.**~~ **Scattata, e chiusa.**
  Misurata a **6m40s**, si e' divisa fra i core invece che fra due comandi:
  `workers: '50%'`, `fullyParallel: false` intatto, e l'attesa e' tornata sotto
  la meta'. Ragione, numeri e strade scartate in
  [ADR 021](adr/021-la-suite-si-divide-fra-i-core-non-fra-due-comandi.md).
- **Il bundle.** Il numero e il margine stanno nel blocco rigenerato: non si
  ricopiano qui. Quello che il blocco non sa dire e' **cosa deve ancora entrarci**
  — statistiche (fase 6), import con anteprima (fase 7) e packaging (fase 8).
- **L'indice su `recurringId`: soglia scritta, non ancora raggiunta.**
  **1.000 spese in archivio.** Sopra quel numero il clone dentro la `readwrite`
  smette di essere gratis (~140 byte per record, ~140 KB clonati mentre lo store
  `expenses` e' bloccato in scrittura). Si misura senza aggiungere strumenti:
  `node scripts/audit.mjs <backup.json>` conta i record, e il numero e'
  `data.expenses.length`. Ragione per esteso in
  [ADR 022](adr/022-si-annuncia-quello-che-comparira.md).
- ~~**Il disco della macchina di sviluppo.**~~ **Scattata, e chiusa**: da 2,1 a
  24 GB liberi. Vedi il giudizio qui sotto, che dice anche **da dove venivano** i
  gigabyte spariti — non era una perdita.

## Il disco

<!-- JUDGMENT rivisto=35c54f0 -->
> Rivisto a `58e0880`, cioe' a questo commit.

**Rivisto il 29 agosto, derivando: 10 GB liberi, 62% di capacita'.** Il taglio
regge — `~/.ollama` e' fermo a 12 KB, solo le chiavi — e la regola sulla e2e non
morde piu': si misura a ogni giro, tre volte in questa sessione.

**Ri-derivato la sera del 29 agosto, e i numeri non si sono mossi**: `df` da' gli
stessi 10 GB e lo stesso 62%, `~/.ollama` gli stessi 12 KB. `node_modules` del
progetto vale 160 MB e `test-results` 424 KB — cioe' le due cose che crescono qui
non crescono abbastanza da contare.

Va scritto che e' stato **ri-derivato** e non solo ritimbrato, perche' per un
momento questa voce ha portato un timbro nuovo su una misura vecchia: il timbro
dice *"qualcuno ha riguardato"*, e spostarlo senza guardare e' precisamente il
difetto che esiste per impedire. Un timbro falso e' peggio di un timbro scaduto —
lo scaduto si vede.

**La soglia non si toglie.** Il calo che l'ha prodotta veniva dal provisioning di
una VM, che ricapita a ogni sessione nuova: e' un ciclo, non un evento chiuso.

Sotto, la misura che l'ha prodotta.

**Risolto il 26 agosto: da 2,1 GB liberi a 24 GB, dal 89% al 40%.** Cancellati i
22 GB di modelli in `~/.ollama` (sei modelli locali), dopo aver fermato
`ollama serve` — che era in esecuzione, e senza fermarlo `rm` non avrebbe liberato
niente. Le chiavi in `~/.ollama` sono rimaste: 8 KB, e sono l'identita' di questa
macchina. Per riaverli: `brew services start ollama`, poi `ollama pull`.

### La caccia alla perdita: non c'e' una perdita, c'e' un provisioning

Due misure sugli stessi percorsi a 6,5 minuti di distanza. **Niente e' cresciuto**
tranne `~/Library/Logs`, +1 MB, che eravamo noi.

Il calo osservato durante la sessione — **da 6,4 a 1,6 GB** — ha invece un
colpevole con nome e ora:

    ~/Library/Application Support/Claude/vm_bundles/claudevm.bundle/
      rootfs.img       10 GiB esatti, scritto durante la misura
      rootfs.img.zst   1,1 GB, del 23 agosto
      .cowork-adopted  scritto oggi alle 14:24

E' l'immagine disco della **VM di Claude Code**, decompressa da 1,1 GB a 10 GiB
allocati quando la sessione l'ha adottata, alle 14:24. Non e' una perdita: e'
provisioning, e finisce.

**E questo spiega perche' cancellarla non funzionava**: torna perche' viene
**ricreata dal `.zst`** alla sessione successiva. Cancellarla e' un affitto di
~9 GB fino alla prossima apertura, non un acquisto — e mentre una sessione e' viva
il file e' in uso, quindi cancellarlo e' anche dannoso. La leva che funziona non e'
cancellare: e' non far partire la VM, se non serve.

### Cosa resta vero come regola

Non si lancia `npm run test:e2e` sotto le due cifre di giga. Oggi ce ne sono 24,
quindi **la e2e e' misurata e sta fra i fatti rigenerati** qui sopra, letta
dall'artefatto dell'ultima esecuzione vera — con la sua guardia: se quel file e'
piu' vecchio dei sorgenti, il fatto torna "non misurato" invece di riportare un
verde che non riguarda piu' questo codice.

Se il libero scende sotto il gigabyte questa sessione si e' gia' bloccata una volta
al punto di non poter eseguire nemmeno `df`: se ricapita, la prima mossa e' liberare
spazio da un Terminale vero, non da qui.

## Criterio di chiusura della fase 6

**Questa sezione esiste perche' la fase 5 non l'aveva.** I suoi nove criteri
vivevano in una conversazione, e quando una sessione nuova li ha cercati per
sapere cosa fosse fatto non c'era niente da leggere. Senza, una fase finisce
*"quando il critico e' soddisfatto"* — e il mestiere del critico e' non esserlo.

### La regola di uscita

**La fase 6 chiude quando un gate produce zero ALTO, e ogni MEDIO e BASSO ha o una
riparazione o una voce in [DEBITO.md](DEBITO.md) con la sua condizione di
riapertura.** Gli ALTO bloccano; il resto no — un difetto accettato **con la sua
condizione scritta** e' una decisione, uno accettato in silenzio e' un difetto.

### Le voci

Sei sono derivabili e portano il proprio controllo, come le decisioni. **Due sono
giudizi**, e sono marcate come tali: nessuna macchina puo' dire se una schermata
si legge.

#### 1. Otto decisioni su otto applicate

<!-- USCITA
     present: docs/ROADMAP.md :: ### 8. Il controllo D entra adesso
     present: scripts/dead-surface.mjs :: D. Campi di `src/ui`
-->
> **Applicata**, verificato da: `### 8. Il controllo D entra adesso`, `D. Campi di `src/ui``.

Lo dice il blocco "Decisioni" qui sotto, che si rigenera.

#### 2. `home.spec.ts:528` costruisce la propria premessa invece di sperarla

<!-- USCITA
     present: tests/e2e/home.spec.ts :: premessa costruita
-->
> **Non applicata**: manca `premessa costruita` in `tests/e2e/home.spec.ts`.

Sotto contesa il gate anti-CLS **non misura niente e si dichiara verde**: con i
dati gia' arrivati al primo frame non c'e' nessun guscio da confrontare. Non e' un
test che passa, e' un test **non misurabile** che si dichiara soddisfatto — la
confusione fra *non so* e *non c'e'*, sopravvissuta in un test invece che in un
campo.

Le due riparazioni ammesse, in ordine: **ritardare la sorgente dei dati** perche' il
primo frame sia garantito senza dati (la premessa diventa costruita dal test e non
dipende da quanti worker girano); oppure, se non praticabile, il test **si dichiara
non misurabile** e lo dice, invece di passare. Renderlo permissivo no: accetterebbe
la tautologia che quella riga esiste per impedire.

#### 3. Un gate con zero ALTO

<!-- USCITA -->
> **Giudizio**, senza controllo per costruzione: nessuna macchina puo' dirlo.

**Giudizio.** Nessun controllo puo' dirlo: e' il gate stesso a produrlo. Va scritto
qui l'esito con lo SHA su cui e' stato fatto, altrimenti "il critico e' passato"
diventa un ricordo.

#### 4. Ogni MEDIO e BASSO riparato o in DEBITO con la sua condizione

<!-- USCITA
     present: docs/DEBITO.md :: La condizione che la chiude
-->
> **Applicata**, verificato da: `La condizione che la chiude`.

Il controllo verifica che la **forma** esista, non che l'elenco sia completo:
quella parte resta a chi legge il gate. E' il limite dichiarato di questo ago,
come per la regola in CLAUDE.md.

#### 5. Gli screenshot guardati da un essere umano — **e viene PRIMA del gate**

<!-- USCITA -->
> **Giudizio**, senza controllo per costruzione: nessuna macchina puo' dirlo.

**Giudizio, e la sola voce che non puo' diventare altro.** 390 chiaro, 390 scuro,
320, stato vuoto, stato senza budget.

**Spostata prima del gate il 29 agosto, e l'ordine e' l'argomento.** Fatta una
volta, ha prodotto **dieci rilievi** che cinque gate, cinquanta mutazioni e quattro
controlli in CI non avevano visto — perche' nessuno di loro e' una proprieta' del
dato. Metterla dopo il gate significa far girare il gate su una schermata che
verra' ridisegnata: il suo rapporto scade prima di essere letto.

**L'ordine e': screenshot → guardati → riparazioni → gate.**

E la riga che vale per chi legge quanto per chi ha scritto: al gate precedente era
gia' scritto qui che *"tutte le misure di questa fase le hanno prese agenti che
leggevano numeri, non persone che leggevano una schermata"*. Era capito, ed era
**penultimo in un elenco di otto**. **Sapere dove sta il buco e metterlo in coda e'
un modo di non guardarci.** **Un grafico che nessuno ha guardato non e'
verificato** — e finora nessuno l'ha guardato: tutte le misure di questa fase le
hanno prese agenti che leggevano numeri, non persone che leggevano una schermata.

E' la stessa distinzione del criterio di chiusura di ogni fase — *"l'app installata
su un telefono vero"* — applicata dentro la fase: la suite dice che le proporzioni
sono giuste, **non** che il risultato si legga.

**Come si esegue**: con il push su main, che pubblica su Pages. Non e' un passo
successivo (vedi la voce 7): e' il gesto che rende la schermata guardabile.

**Il backup da usare come fixture**: `~/Downloads/cent-2026-08-26.json`,
**schemaVersion 4**, post-migrazione. In quella cartella ce ne sono **tre**, e gli
altri due sono a schema 2 (`cent-2026-08-22.json`, `cent20260823.json`): usare
quelli significherebbe provare la schermata contro dati che il codice di oggi non
scrive piu'.

**E la regola su quel file, che non e' una formalita'**: contiene spese vere. Si usa
come fixture **a runtime**, **non si committa mai**, e **non si scrive il suo
percorso assoluto dentro un test**. E' gia' successo in fase 3, e quei test furono
cancellati per questo.

#### 6. Le verifiche verdi e i numeri scritti

<!-- USCITA
     present: docs/ROADMAP.md :: STATE:BEGIN
-->
> **Applicata**, verificato da: `STATE:BEGIN`.

`tsc`, `audit:source` (A, B, C, D), `state --check`; bundle sotto 60 KB; e2e **col
suo numero**, non "verde". Stanno tutti nel blocco rigenerato in cima, quindi
questa voce chiede solo che quel blocco esista e sia fresco.

#### 7. Il link agli amici

<!-- USCITA -->
> **Giudizio**, senza controllo per costruzione: nessuna macchina puo' dirlo.

**Giudizio del proprietario.** Qui c'era scritto *"push su main"*, ed era il
criterio sbagliato — **emendato il 29 agosto invece che scavalcato**, perche' la
differenza fra emendare e violare e' tutto il metodo.

**`main` non e' "shippare": e' il ramo da cui Pages costruisce.** Non esistono altri
utenti e il link non e' stato dato a nessuno (vedi "Regola: il link non si condivide
ancora"). Cio' che questo criterio protegge e' **"nessuno riceve una schermata che
nessun essere umano ha guardato"** — e il proprietario che la apre sul proprio
telefono **e'** quell'essere umano.

Quindi il push su main **non e' un passo a se'**: e' **il modo in cui si esegue la
voce 5**. Statistiche non e' guardabile sul telefono se non passando da Pages,
quindi pubblicare e' il gesto che rende possibile guardarla, non quello che la
dichiara finita.

Il criterio vero e' **dare il link a qualcuno**, e resta chiuso finche' le voci 5 e
8 non sono fatte.

#### 8. Statistiche vista sul telefono coi dati veri

<!-- USCITA -->
> **Giudizio**, senza controllo per costruzione: nessuna macchina puo' dirlo.

**Giudizio**, e comprende il **picco mensile**: una spesa mensile dentro una vista
settimanale fa un salto una settimana su quattro. E' vero — e' quando i soldi sono
usciti davvero — ma va guardato coi dati veri prima di dichiararlo accettabile.

**Nessun export prima di toccare la banda, per questa consegna.** La regola dei
passi 1–2 qui sopra vale quando una consegna **alza lo schema**: li' toccare la
banda fa girare una migrazione sui dati veri, e la finestra pre-migrazione e'
unica. Questa lascia `SCHEMA_VERSION` dov'era, quindi **non gira nessuna
migrazione** e non c'e' nessuna finestra da proteggere.

Va scritto perche' la prossima volta si distingua: **un rituale eseguito dove non
serve insegna a eseguirlo senza guardare**, ed e' cosi' che smette di proteggere il
giorno in cui serviva davvero.

---

## Decisioni prese e non ancora applicate

<!-- JUDGMENT rivisto=35c54f0 -->
> Rivisto a `b289fff`, 6 commit fa. **Da riguardare.**

**L'esistenza di una decisione e' un giudizio; la sua applicazione e' un fatto
derivabile.** Erano due cose diverse nella stessa sezione, ed e' per questo che
l'intera sezione e' finita nella meta' del documento che nessuno controlla: il 27
agosto dichiarava sei decisioni e **nessuna nel codice**, mentre cinque su sei
erano gia' implementate.

Adesso ogni voce porta il proprio **controllo di applicazione** in un commento, e
`npm run state` lo esegue e ci scrive sotto **applicata / non applicata**. Il
giudizio resta umano — *cosa* si e' deciso e *perche'*. Il fatto e' derivato.

E c'e' un guadagno che vale da solo: **una decisione la cui applicazione non si
riesce a esprimere come controllo e' una decisione troppo vaga per essere
implementata.** Scrivere il controllo la filtra mentre la si prende.

### 0. Le decisioni del 29 agosto, dallo sguardo — non ancora nel codice

**Sono nate guardando gli screenshot, non da un test.** Vedi "In volo adesso" per i
dieci rilievi e per cosa questo dice del metodo.

#### 0a. ~~Scala unica per tutta A~~ — **RIAPERTA e ROVESCIATA il 29 agosto sera**

<!-- DECISION
     present: src/ui/stats-view.ts :: la scala e' della sezione
     present: src/ui/stats-view.ts :: scaleCents
-->
> **Applicata**, verificato da: `la scala e' della sezione`, `scaleCents`.

**La scala torna per sezione.** Ogni sezione di A ha la propria, con la barra piu'
lunga a fondo colonna, **e la dichiara**. La soglia resta **sull'insieme** — era lei
la causa del difetto, e non torna indietro.

##### Perche' era stata presa, e dove l'argomento non valeva

L'argomento era l'anti-pattern numero uno di `dataviz`: *"mai due scale nello stesso
campo visivo — l'allineamento fra le due e' arbitrario, quindi il grafico inventa
una correlazione che nei dati non c'e'"*.

**Quell'argomento parla di due scale sullo stesso asse di uno stesso grafico.** Due
sezioni con intestazione propria, colonna propria e la barra piu' lunga a fondo
colonna sono un'altra forma — sono **small multiples**, che la stessa disciplina
non solo ammette ma raccomanda quando due misure hanno ordini di grandezza diversi.
E' *"una decisione vale dove vale il suo argomento"* nella forma che questo progetto
non aveva ancora incontrato: non una decisione applicata troppo stretta, ma una
**applicata troppo larga** — l'argomento era giusto, il caso era un altro.

##### E la ragione per cui sembrava urgente era un'altra

Il difetto misurato era **le fisse senza barre**: 530 € su 642 e nessuna barra,
mentre la piu' lunga a schermo ne valeva 42. La causa era la **soglia per sezione**
(due righe contro `BREAKDOWN_MIN_ROWS` = 3), non la scala. Il rilievo 10 nominava
due cause dove ce n'era una, e la seconda e' stata riparata **senza mai misurarla**.

##### Il criterio, che vale oltre questo caso

> **Un difetto misurato batte un difetto ipotizzato.**

Il difetto della scala unica e' stato misurato in pagina, 390 punti, colonna 195,81
px, sull'export vero:

| | importo | scala unica | scala per sezione |
|---|---|---|---|
| Casa (fisse) | 507,00 € | 195,81 px | 195,81 px |
| Spesa | 42,00 € | **19,42** | 195,81 |
| Svago | 26,00 € | **13,34** | 122,55 |
| Coffeeshop | 24,00 € | **12,59** | 113,39 |
| Fuori | 10,00 € | **7,28** | 49,28 |

Svago e Coffeeshop distano **0,75 px**, Coffeeshop e Trasporti (23,00 €) **0,37**.
Sotto il pixel non e' *"difficile da confrontare"*: e' **identico**. Il difetto
dell'altra forma — la correlazione inventata — resta **ipotetico**, e per di piu' e'
oggi contraddetto prima di potersi formare (vedi sotto).

##### Cosa e' cambiato sotto l'argomento mentre lo applicavamo

**La barra divisa toglie a 0a la sua ragione principale.** Il rischio delle due
scale era che l'occhio confrontasse una barra di una sezione con una dell'altra e ne
ricavasse una proporzione falsa. Da 0b la proporzione vera sta **scritta sopra**:
chi guarda ha `530 / 112` in cima prima di arrivare alle righe. La lettura sbagliata
e' contraddetta da un elemento che nel momento in cui 0a e' stata presa **non
esisteva ancora**.

##### La condizione, che e' la parte nuova e non c'era prima

**Ogni sezione dichiara la propria scala.** Non basta che le scale siano due: devono
**dirsi**, perche' sui dati veri `Casa 507,00 €` e `Spesa 42,00 €` disegnano
**esattamente la stessa lunghezza**, e due barre piene identiche accanto a due
importi di un ordine di grandezza diverso sono una bugia grafica finche' qualcosa
non dice che i due fondi colonna valgono cose diverse.

La forma precedente diceva *"si dichiarano nella geometria: due barre piene con due
importi diversi dicono da sole che le scale sono due"*. **Non e' vero e non lo era
allora**: dice che *qualcosa* non torna, non *cosa*. E' una deduzione chiesta al
lettore, e questo progetto ha una regola contro — *nessun messaggio afferma un fatto
che l'utente non puo' verificare*, che vale identico per un fatto che l'utente deve
**inferire**.

Quindi il modello consegna `BreakdownSection.scaleCents` — quanto vale una barra
piena in quella sezione — e la schermata lo scrive. Il controllo di questa voce
guarda quel campo, non una frase.

##### Come ci si e' arrivati, e vale quanto la decisione

Non da un ragionamento: da **due immagini affiancate**, stessa fixture, stesso
viewport, stesso periodo, con la variante costruita dietro un provino non
committato. La misura diceva gia' tutto e non era bastata a nessuno dei due; le due
immagini hanno chiuso la questione in un secondo.

E' la stessa lezione del criterio 5, applicata a una decisione invece che a un gate:
**un grafico che nessuno ha guardato non e' verificato** — e quando due forme sono
entrambe difendibili a parole, si guardano invece di discuterle.

**Il motivo e' l'incrocio, non la singola regola.** Quelle regole erano ciascuna
difendibile, e il difetto trovato guardando lo schermo — **le barre solo nelle
Quotidiane, con il peso visivo inverso agli importi**: la sezione Fisse ha 530 € su
818 e nessuna barra, mentre la barra piu' lunga a schermo ne vale 129 — e' nato dal
loro **incrocio**. Nessun gate poteva vederlo, perche' ogni regola presa da sola
faceva il suo mestiere. **Meno regole, meno incroci.**

##### Da dove vengono i numeri di questa voce, e perche' non sono gli unici

**530 su 818 con la barra piu' lunga a 129 e' il telefono**, letto su uno screenshot
il 29 agosto. Rifacendo la scena **dall'export del 26** — 390 punti, periodo
24–30 ago, colonna a 112 px — il periodo vale **642,00 €**, le fisse **530,00 €** e
la barra piu' lunga **42,00 €**. `data-core` ha visto le due coppie e ha chiesto
quale valesse, il che e' la domanda giusta.

**Valgono tutte e due, e la forma del difetto e' identica in entrambe**: le fisse
sono i due terzi, non hanno barra, e la barra piu' lunga vale una frazione della
voce piu' grossa. Cio' che cambia e' il **corpus** — il telefono ha tre giorni in
piu' e l'export no — e la voce non lo diceva.

Quindi la riga sopra resta com'e', **col suo corpus dichiarato**, e questa lo
nomina accanto. E' *"una derivazione vale dove ha guardato, e deve dire dove"*
applicata non a una conclusione ma alle **cifre che sostengono una decisione**:
finche' non dichiarano il proprio corpus, due misure vere della stessa cosa si
leggono come una contraddizione, e chi la incontra deve fermarsi a chiedere invece
di andare avanti. Qui e' costato una domanda; il giorno in cui nessuno la fa, costa
una decisione presa contro il numero sbagliato.

#### 0b. Barra divisa in cima

<!-- DECISION
     present: src/ui/Stats.tsx :: stats__split
-->
> **Applicata**, verificato da: `stats__split`.

Porta la proporzione fisse/quotidiane e **libera A dal doverla raccontare**: due
terzi sono l'affitto, e oggi non c'e' nessun posto dove si veda.

**Un accento e un grigio, non due tinte di categoria** — e' la contraddizione di
`dataviz` accolta: *"otto tinte categoriche quando la storia e' un numero solo"* e'
l'errore da manuale, e la risposta e' **emphasis**. Con due segmenti serve una
legenda o **etichette dirette**: i due totali scritti accanto la soddisfano, ma
vanno scritti.

**La torta a sette fette e' esclusa**: 62% e sei spicchi fra 1% e 16%
costringono a una legenda e a confrontare angoli.

##### L'alternativa a ciambella in cima e' chiusa con DUE argomenti, non uno

**Un argomento solo si riapre, due no**, ed e' la ragione per cui questa voce porta
tutte e due invece della sola disciplina.

**Il primo e' della skill**: due fette sono una cifra, e una torta a due spicchi va
sostituita da una stat tile.

**Il secondo e' una misura, presa costruendo la variante e guardandola.** La
ciambella al posto del numero grande costa **979 px di contenuto contro 862** su 708
visibili, e la differenza cade tutta su cio' che sta sotto: *"Settimana per
settimana"* torna a mostrare **una riga tagliata a meta'**. E' il rilievo 12 — la
domanda di B e la sua risposta mai sullo schermo insieme — che avevamo chiuso
guadagnando 62 px. La ciambella in cima ne spende **117** per riaprirlo.

E' il caso in cui una disciplina e una misura dicono la stessa cosa per due strade
diverse. Quando succede vanno scritte tutte e due: la disciplina puo' essere
contestata da chi non la condivide, la misura no.

**E l'alternativa a ciambella e' caduta il 29 agosto, leggendo `dataviz`.** Qui
c'era scritto *"forma alternativa ammessa: ciambella a due segmenti col totale nel
mezzo — due angoli si confrontano bene"*. La skill la vieta due volte e per due
ragioni diverse: *"una torta a 2 fette -> una stat tile"* fra le forme, e *"niente
donut per confrontare valori vicini"* fra gli anti-pattern. **Resta la sola barra
orizzontale divisa**, che la stessa skill prescrive per il part-to-whole con nomi
lunghi — cioe' esattamente il nostro caso.

L'argomento che avevo scritto — *"due angoli si confrontano bene"* — non era falso:
era **il criterio sbagliato**. Due angoli si confrontano bene fra loro, e la
domanda di questa barra non e' *"quale dei due e' piu' grande"* (si sa: e'
l'affitto) ma *"quanto della mia settimana e' gia' deciso"*, che e' una lunghezza
su una lunghezza. Una decisione presa col criterio giusto per la domanda sbagliata
si riconosce solo rileggendo la domanda.

**E come e' finita scritta qui, che vale piu' della forma.** Questa riga e' stata
cancellata **dopo** essere gia' stata dichiarata cancellata in un brief a
`ui-craft` — *"ho gia' cancellato l'alternativa da 0b"* — mentre nel documento
c'era ancora. E' "deriva, non dettare" applicata a se stessa: il brief descriveva
uno stato che avrei creato invece di uno che esisteva, ed e' esattamente la forma
per cui quella regola e' stata scritta. Presa perche' il brief chiedeva all'agente
di segnalare la discrepanza; senza quella riga sarebbe passata.

#### 0c. ~~Selettore fisse si'/no su A~~ — **CHIUSA TOGLIENDO IL SELETTORE, 30 agosto**

<!-- DECISION
     absent:  src/ui/Stats.tsx :: stats__toggle
     present: src/ui/stats-view.ts :: `showFixed` non c'e' piu'
-->
> **Applicata**, verificato da: `!stats__toggle`, ``showFixed` non c'e' piu'`.

**Il selettore non c'e' piu'.** Non e' stato ridiscusso il suo default: e' caduto
l'oggetto.

##### La ragione per cui esisteva, e quando e' evaporata

0c sostituiva *"una regola di layout con un controllo dell'utente"*, e il controllo
serviva perche' con la **scala unica** (0a) le sei righe quotidiane valevano fra 4 e
19 px con l'affitto dentro. Spegnere le fisse ricalcolava la scala e le riapriva a
49–196. Era *"l'unica cosa utile che il selettore fa"*, ed era anche la sola ragione
per cui `showFixed` stava nel **modello** invece che essere un filtro nel componente.

**Rovesciata 0a, la scala e' tornata per sezione, e quelle sei righe nascono gia'
riaperte**: l'affitto non e' nella loro scala, quindi non le schiaccia. Verificato e
non dedotto — a fisse spente le `fraction` erano **identiche** e `scaleCents` non si
muoveva di un centesimo. Il test che lo dimostrava e' stato scritto, ha fatto il suo
lavoro una volta, ed e' uscito con l'oggetto che descriveva.

Restava un effetto solo: ricalcolare `Breakdown.asChart` sulle righe rimaste. Adesso
`asChart` si calcola su `present`, che e' un fatto sui dati.

##### Il criterio, che vale oltre questo caso

> **Un comando che non cambia quasi niente e' peggio di nessun comando: promette un
> potere che non ha.**

Chi lo tocca si aspetta che succeda qualcosa e vede sparire una sezione — meno di
quanto la sua presenza annunciava. E' la stessa famiglia di *"un indicatore che puo'
sbagliare deve sbagliare verso l'allarme"*: il costo non e' la funzione mancante, e'
la **fiducia** che si spende per scoprirlo.

##### E ne e' uscito un difetto che nessuno aveva progettato

Con l'interruttore spento in una settimana di **sole spese fisse**, `sections` era
vuota, `split` nullo, e il numero grande in cima — che il componente dichiara *"non
cambia quando si spengono le fisse, ed e' voluto"* — **spariva**. Una scelta di
lettura che cancellava un fatto: 507,00 € usciti e nessun euro a schermo. Togliendo
il selettore quel ramo non e' piu' raggiungibile.

**E la sua guardia e' stata sbagliata prima di essere giusta**, che e' la parte da
tenere. La prima forma chiedeva *"in `ready` A ha almeno una sezione"*, ed e' caduta
subito su uno stato legittimo: spese solo nei periodi passati — cioe' **ogni lunedi'
mattina** — dove A non ha sezioni perche' nel periodo non c'e' niente da ripartire, e
zero non e' una cifra nascosta, e' la cifra. Confondeva *"A copre tutto"* con *"A non
e' vuota"*.

La forma giusta guarda la **copertura**: la somma di ogni riga di ogni sezione e'
esattamente il denaro del periodo. E non e' solo piu' corretta, e' **piu' forte** —
avrebbe preso il difetto misurato (le fisse spente lasciavano fuori 507,00 € **e una
sezione dentro**), dove `length >= 1` sarebbe rimasta verde. Gira su ogni fixture.

##### Cosa resta vero dei tre vincoli originali

Il terzo — *"non si applica a B"* — non era un vincolo sul selettore: e' la regola di
`comparableToBudget`, e vive li'. Gli altri due sono caduti col loro oggetto.

#### 0d. Home: quattro livelli invece di sei affermazioni

<!-- DECISION
     absent: src/ui/i18n/it.ts :: 'allowance.over.main'
-->
> **Applicata**, verificato da: `!'allowance.over.main'`.

Oggi **sei affermazioni dicono lo stesso fatto**: il numero, il colore, la barra,
*"Il budget del periodo e' finito"*, *"quello che spendi da qui e' in piu'"*,
*"Sopra ritmo"*. **Ne resta una, e i numeri prendono il posto delle frasi.**

1. **enorme**: −88,00 €
2. **una riga**: oltre i 200,00 € della settimana
3. **una riga, l'unica azionabile**: 2 giorni · 48,00 €/g contro 28,57 sostenibili
4. **nota in fondo**: 530,00 € di fisse, escluse dal budget — ADR 016 §2, **resta
   obbligatoria**

Si tolgono *"Il budget del periodo e' finito"* (lo dicono il segno e il colore),
*"quello che spendi da qui e' in piu'"* (implicito in un numero negativo) e la
doppia didascalia sotto il numero grande. E *"Oggi 0,00 €"* seguito da *"Oggi non
hai segnato niente"* e' di nuovo lo stesso fatto due volte, un numero e una frase.

**La regola che tiene insieme le due riparazioni**: dove ci sono dati **si mostrano
numeri**, dove non ce ne sono **si parla**. Lo stato vuoto della Home e' l'esempio
giusto **e non si tocca**.

*(Nota su `dataviz`, che qui dice l'opposto: lei vuole etichette **selettive** — mai
un numero su ogni punto. Vince la nostra, e la ragione va scritta e non
presupposta: **non abbiamo un asse e non abbiamo un tooltip**, quindi togliere i
numeri lascerebbe il lettore senza nessun modo di sapere quanto vale una barra. La
regola di dataviz presuppone due cose che abbiamo deliberatamente rimosso.)*

#### 0e. `hero.remaining` deve cambiare col segno

<!-- DECISION
     present: src/ui/i18n/it.ts :: 'hero.over'
-->
> **Applicata**, verificato da: `'hero.over'`.

**"Restano −88,00 €" e' una contraddizione, ed e' viva dalla fase 4.** Verificato:
`heroCopy` restituisce `t('hero.remaining')` **incondizionatamente**, e non esiste
nessuna chiave per il negativo.

**E la forma del difetto e' quella della fase**: `over` **e' gia' calcolato**
(`remainingCents < 0`) e guida il **colore** (`data-tone`), non la **parola**. Il
fatto era li', usato per la decorazione e non per la frase — il "peso visivo
inverso all'importanza", in miniatura e in una riga di codice.

#### 0g. La ciambella nelle Quotidiane — e **solo** li'

<!-- DECISION
     present: src/ui/Stats.tsx :: stats__pie
     present: src/ui/Stats.css :: --pie-size
-->
> **Applicata**, verificato da: `stats__pie`, `--pie-size`.

Le Quotidiane portano **una ciambella sopra le proprie righe**. Le Fisse no. La
barra divisa in cima resta.

##### La decisione precedente e' caduta col caso che la sosteneva

Il no alla torta era scritto in 0b, e diceva: *"62% e sei spicchi fra l'1% e il 16%
costringono a una legenda e a confrontare angoli"*. Era vero, e riguardava **sette
categorie con l'affitto dentro lo stesso grafico**.

**Separando A in due sezioni quel caso non esiste piu'**, e i numeri lo dicono. Sui
dati veri del 24–30 agosto:

| | distribuzione | verdetto |
|---|---|---|
| **Quotidiane** | 42 / 26 / 24 / 10 / 10 su 112 -> **37% · 23% · 21% · 9% · 9%** | cinque fette, la piu' grande **sotto il 40%**, la piu' piccola **sopra l'8%** |
| **Fisse** | 507 / 23 su 530 -> **95,7% · 4,3%** | un cerchio con una scheggia |

La prima e' **esattamente** la distribuzione in cui una torta funziona: nessuna
domina, nessuna diventa una scheggia. La seconda e' il caso su cui `dataviz` ha
ragione — due fette sono una cifra, e la cifra e' gia' scritta.

**Non e' "la torta si puo' fare".** E' *"la torta si puo' fare su questa
distribuzione, ed ecco perche' quella di prima no"*. Un'obiezione che cade va scritta
insieme al caso che la reggeva, altrimenti la volta dopo si riapre l'intera
questione invece della parte che e' cambiata.

##### Tre trattamenti, tre ragioni — e la schermata smette di sembrare tutta uguale

- la **barra divisa** in cima -> due quantita';
- le **barre** nelle Fisse -> due o tre impegni noti, che si **controllano**;
- la **ciambella** nelle Quotidiane -> cinque voci confrontabili, che si **esplorano**.

**Ognuno con la propria condizione scritta**, altrimenti fra un mese sembrera'
varieta' decorativa — e qualcuno la uniformera' per coerenza, togliendo tre risposte
a tre domande diverse.

##### Il vincolo che tiene in piedi tutto

> **La ciambella si AGGIUNGE alle righe, non le sostituisce.**

Gli angoli danno la forma a colpo d'occhio, le righe danno i valori. Se una settimana
c'e' una spesa enorme che schiaccia le altre in schegge, **il dato resta leggibile
sotto**: la ciambella puo' fallire senza portarsi via l'informazione.

Senza questo vincolo non si fa. E' anche cio' che rende accettabile una forma che la
disciplina sconsiglia: non e' l'unico portatore di niente.

##### Il controllo di questa voce e' stato scritto sbagliato, e il difetto e' istruttivo

Chiedeva `present: src/ui/i18n/it.ts :: stats.pie`, cioe' **una chiave di dizionario
per una figura che non ha nessuna stringa**. La ciambella e' `aria-hidden` e non
porta etichette dentro — e' scritto tre righe piu' sotto, in questa stessa voce.

Il controllo contraddiceva la decisione che doveva verificare, e nel modo peggiore:
soddisfarlo avrebbe richiesto di **aggiungere una chiave senza lettore**, che e'
esattamente cio' che il controllo B di `audit:source` fa fallire in CI. Un ago che si
puo' soddisfare solo rompendo un altro controllo non e' un ago debole: e' un ago che
chiede la cosa sbagliata.

Adesso guarda **`--pie-size`**, cioe' il numero su cui la decisione si regge — quanto
e' grande la figura, che e' l'unica cosa di lei che si possa sbagliare in silenzio.

**La regola che ne esce**, e vale per il prossimo: *un controllo si scrive guardando
cosa la decisione **produce**, non cosa un'altra decisione simile aveva prodotto.* Ho
copiato la forma da `0c`, che aveva una chiave perche' aveva un comando con
un'etichetta accessibile. Questa non ha ne' l'uno ne' l'altra, e la forma e' arrivata
prima del contenuto.

##### Le altre condizioni

- **Sotto le tre voci non si disegna.** E' `BREAKDOWN_MIN_ROWS` come numero, e **non
  e' la stessa decisione**: quella governa le barre sull'insieme di A, questa governa
  la ciambella dentro una sezione. L'argomento e' un altro — due fette sono una
  cifra, non una ripartizione — e vale anche se le barre ci sono.
- **I colori sono quelli delle categorie**, che hanno separazione per daltonismo
  **8,7** misurata col validatore. Nessuna tinta nuova.
- **Le fette non portano etichette dentro.** Le portano le righe sotto, che sono la
  legenda naturale e **esistono gia'** — e' la ragione per cui questa forma non costa
  una legenda, che era meta' dell'obiezione originale.
- **Niente ciambella nelle Fisse**, col **95,7%** scritto accanto alla decisione
  perche' chi la rilegge non debba ricalcolarlo.

### 0f. Da valutare, con la condizione scritta

**Tavolozza di default.** Misurata col validatore: separazione per daltonismo
**8,7** su soglia 8 — regge — ma **tre colori su otto sotto la soglia di croma**
(`#81a369` 0,09 · `#845e23` 0,089 · `#676c75` **0,015**): si leggono come grigi, e
un colore che non fa identita' non fa il suo lavoro in un grafico. **Le categorie
esistenti non si toccano** — sono scelte dell'utente — cambiano i **default** per
chi installa dopo. **Condizione: adesso**, finche' il parco installato e' un
telefono. Dopo diventa una migrazione di dati altrui.

**Andamenti per categoria nel tempo.** Non ora, e **non per scope**: con quattro
giorni di dati risponde a una domanda che nessuno puo' ancora farsi.
**Condizione di riapertura: otto settimane piene di storia.**

**`tabular-nums` sul numero grande della Home.** `dataviz` lo vieta
esplicitamente (*"le cifre a larghezza uguale fanno sembrare `121` slegato"*); il
commento in `Home.css` porta il contro-argomento *"e' un numero che si guarda
mentre si digita dietro al foglio"*. **Da misurare, non da assumere**: se il foglio
copre quel numero mentre si digita, l'argomento e' falso e vince la skill. E' una
misura da dieci secondi, non fatta per budget.

### 1. A si divide in due sezioni — Fisse e Variabili

<!-- DECISION
     present: src/ui/stats-view.ts :: BreakdownKind
     present: src/ui/Stats.tsx :: stats.fixedInPeriod
-->
> **Applicata**, verificato da: `BreakdownKind`, `stats.fixedInPeriod`.

Ognuna con la **sua scala**, e in ognuna **la barra piu' lunga arriva a fondo
colonna**: due barre piene con due importi diversi dicono da sole che le scale sono
due, senza leggere niente. Piu' l'intestazione di sezione, il totale del periodo
per ognuna, e una separazione vera.

Le quattro ragioni, perche' fra un mese qualcuno rivorra' "il grafico unico":

- **ADR 016 §1 resta rispettato per intero**: non si nasconde niente, l'affitto c'e'
  con la sua categoria e si vede che e' la voce piu' grossa.
- **Le sei righe tornano confrontabili**, perche' la loro scala non e' piu'
  schiacciata da una voce di un altro ordine di grandezza.
- **E' il modello mentale del prodotto**, non un espediente grafico: e' la stessa
  distinzione per cui esistono ADR 016 e la schermata Spese fisse.
- **Il tratteggio dentro la barra sparisce invece di essere riparato**: esisteva
  per distinguere la parte ricorrente, e con le sezioni la distinzione **e'** la
  sezione. Quel tratteggio aveva un contrasto di 2,51–2,82 su quattro tinte,
  inclusa quella di default di Casa.

### 2. Il pavimento della barra sta nel modello, non nel CSS

<!-- DECISION
     present: src/ui/stats-view.ts :: BAR_MIN_FRACTION
     present: tests/e2e/statistiche.spec.ts :: il pavimento della barra nel modello
-->
> **Applicata**, verificato da: `BAR_MIN_FRACTION`, `il pavimento della barra nel modello`.

Aveva **due proprietari**: il modello calcolava la frazione e il CSS la correggeva
col bordo. Da li' due difetti insieme — importi diversi con barre identiche, e un
test che dichiarava di sorvegliare il minimo **senza poter cadere**, perche' il
minimo non era nel modello.

**Il controllo di questa voce e' stato riscritto, e la ragione vale per i
prossimi.** Diceva *"`BAR_MIN_FRACTION` non compare in `Stats.css`"*, e falliva —
ma non perche' il CSS correggesse ancora qualcosa: perche' due **commenti** lo
nominano, che e' il legame dichiarato fra i due file, cioe' la cosa buona.

La condizione chiedeva **l'assenza di una parola** dove la decisione riguarda
**l'assenza di un comportamento**, e sarebbe tornata verde cancellando un commento
utile. Adesso chiede la presenza della **guardia che confronta i due numeri** — il
pavimento del modello contro il contorno che il CSS dipinge — che e' la sola cosa
che possa dire davvero se i due proprietari sono tornati due.

### 3. La fixture "budget piu' giovane dei dati" entra nella suite

<!-- DECISION
     present: src/ui/stats-view.test.ts :: budget nato dentro il periodo
-->
> **Applicata**, verificato da: `budget nato dentro il periodo`.

Tutti i test usavano `effectiveFrom: '2026-01-01'`, quindi `comparableToBudget` era
**sempre vero**: il ramo della barra nuda non e' mai stato disegnato in un browser.

### 4. Le fisse hanno due nomi, perche' sono due quantita'

<!-- DECISION
     present: src/ui/i18n/it.ts :: 'stats.fixedInPeriod'
     present: src/ui/i18n/en.ts :: 'stats.fixedInPeriod'
-->
> **Applicata**, verificato da: `'stats.fixedInPeriod'`, `'stats.fixedInPeriod'`.

`monthlyFixedCosts(rules)` e' una **proiezione**; il *"gia' uscite in questo
periodo"* e' **retrospettivo**. Entrambe legittime: il difetto era che si
chiamavano uguale.

### 5. Massimo alla colonna del nome, minimo a quella del plot

<!-- DECISION
     present: src/ui/Stats.css :: --name-max
     present: src/ui/Stats.css :: --plot-min
-->
> **Applicata**, verificato da: `--name-max`, `--plot-min`.

Senza quei due vincoli la geometria resta **una funzione della tipografia**, che e'
cio' che la griglia unica per sezione doveva chiudere.

### 6. La regola sulle riparazioni, in CLAUDE.md

<!-- DECISION
     present: CLAUDE.md :: Una riparazione che cita un argomento altrui
-->
> **Applicata**, verificato da: `Una riparazione che cita un argomento altrui`.

**Quando una riparazione cita un argomento scritto altrove, deve riscriverne la
condizione sul posto.** Non *"come da ADR X"*, ma *"vale perche' qui succede Y"*.
Se la condizione non si riesce a scrivere, l'argomento non vale qui.

**Nota sul controllo di questa voce, perche' e' il caso piu' debole degli otto.**
Le altre sette hanno un ago su un **simbolo** — un tipo, una costante, una chiave —
che esiste o non esiste. Questa e' prosa, e l'unico ago possibile e' un pezzo di
testo. Il primo che ho scritto cercava *"riscriverne la condizione sul posto"* e
falliva su una regola **gia' scritta**, perche' l'intestazione la coniuga
diversamente: il controllo era agganciato a una **flessione**, non a un fatto.

Adesso l'ago e' **l'intestazione**, che e' l'ancora piu' stabile che un documento
offra — si cambia deliberatamente, non riscrivendo un paragrafo. Resta piu' debole
degli altri sette, e va detto invece che pareggiato: **dove la decisione e' prosa,
il controllo puo' solo dire che qualcosa con quel titolo esiste**, non che dica la
cosa giusta. Quella parte resta a chi legge.

Non e' stile: la quarta, la quinta e la sesta ricorrenza di *"una decisione vale
dove vale il suo argomento"* sono state trovate **dentro riparazioni della stessa
sessione** — una riparazione si scrive col difetto in testa e l'argomento a portata
di mano, che e' la condizione perfetta per trapiantarlo senza ri-derivarlo.

### 7. La scheda "Quotidiane" cade

<!-- DECISION
     absent:  src/ui/Stats.tsx :: tiles.variableCents
     present: src/ui/Stats.tsx :: stats__titleRange
-->
> **Applicata**, verificato da: `!tiles.variableCents`, `stats__titleRange`.

Decisa il 28 agosto. ADR 016 §2 vuole l'esclusione dichiarata **accanto al numero**:
con A divisa in Fisse e Variabili quella dichiarazione e' ora nella schermata
stessa, come intestazione di sezione, e la scheda delle variabili ripeterebbe il
totale di una sezione che sta trenta pixel piu' sotto.

**Resta la scheda "Fisse al mese"**, perche' e' la **proiezione** — un numero che A
non puo' mostrare, essendo retrospettiva e per periodo. Le due cifre hanno nomi
diversi proprio perche' sono due quantita' diverse, e quella che sopravvive e'
quella che nessun'altra parte della schermata dice.

**Verificato prima di applicare**, e l'esito non era quello atteso: ADR 016 §2
**regge** — la scheda `Spese fisse` e le due intestazioni di sezione nominano
ancora la quantita' e la sua esclusione. **A cadere era il confine del periodo**:
in due stati dove B non c'e' — il primo periodo di chiunque installi l'app, e "solo
ricorrenti" — dopo il taglio sullo schermo non restava **una sola data**, mentre
"Fisse in questo periodo" nominava un periodo che nulla identificava. Da qui
`periodRangeLabel` spostato sul titolo di A **prima** del taglio, non dopo.

**E il controllo di questa voce e' stato riscritto due volte, che e' un dato.**
Diceva prima *"`tile__label` non compare in `Stats.tsx`"*: falso, perche' quella
classe sopravvive sulla scheda `Spese fisse`, che resta di proposito.

E' la **terza** condizione troppo grossolana di queste otto, e **tutte e tre erano
`absent`**. Non e' un caso: un ago su `present` chiede che qualcosa di preciso sia
stato **costruito**, e c'e' un solo modo di soddisfarlo; un ago su `absent` chiede
che una parola non ci sia, e **lo soddisfa qualunque cosa la faccia sparire** —
compreso il cancellare un commento utile o il rinominare una classe che doveva
restare. Da qui la regola: **preferire `present`, e usare `absent` solo su un
simbolo che esiste unicamente per la cosa che si sta togliendo.**

Qui `absent` reggeva perche' `StatsTiles.variableCents` esisteva **solo** per quella
scheda: il controllo D l'ha trovato senza lettori nel giro stesso in cui e' rimasto
orfano, ed e' stato cancellato. E il `present` accanto verifica la meta' che conta
di piu' — che il confine sia arrivato sul titolo di A prima che la scheda uscisse.

#### E il 29 agosto ha smesso di reggere, per la ragione opposta a quella prevista

L'ago cercava `variableCents` **in `stats-view.ts`**, ed e' tornato rosso senza che
la scheda tornasse: `BreakdownSplit.variableCents` — la meta' quotidiana della barra
divisa di 0b — porta lo **stesso nome** per un'altra quantita', nello stesso file.

La regola scritta qui sopra diceva *"usare `absent` solo su un simbolo che esiste
unicamente per la cosa che si sta togliendo"*, e la prova che serve era **al momento
in cui l'ago si scrive**. Non basta: un nome puo' diventare non-unico **dopo**, e
allora l'ago si accende su un fatto che non e' il suo. Il verso del guasto e' quello
buono — un falso allarme, non un falso silenzio — ma costa comunque una lettura per
capire che non era niente, e la terza volta nessuno la fa.

**L'ago adesso guarda il lettore, non il campo**: `tiles.variableCents` in
`Stats.tsx`, cioe' l'espressione con cui il componente leggerebbe quella scheda se
tornasse. Un lettore e' piu' stretto di un nome — vive in un file solo, e nessuno lo
scrive per caso mentre chiama un'altra cosa allo stesso modo.

**La regola generale che ne esce, ed e' piu' forte della precedente**: quando la cosa
da togliere e' una **superficie**, l'ago va sul **consumo**, non sulla dichiarazione.
Un campo puo' essere ridichiarato altrove con lo stesso nome per un'altra ragione; un
uso e' sempre uso *di qualcosa*, e nomina il proprio soggetto.

### 8. Il controllo D entra adesso

<!-- DECISION
     present: scripts/dead-surface.mjs :: D. Campi di `src/ui`
-->
> **Applicata**, verificato da: `D. Campi di `src/ui``.

Non in fase 7. Cio' che trova e non si ripara oggi va nell'**elenco dichiarato**,
con la ragione e **la condizione che lo rende di nuovo un difetto** — l'idioma di
`MEMBRI_DICHIARATI`. Rimandarlo dopo il push significherebbe avere una guardia
scritta e spenta, che e' la cosa che questo progetto ha smesso di fare.

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

### FATTO: euro grandi, centesimi piccoli

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

## Se la suite locale supera i 5 minuti, si divide — successo il 25 agosto

**La soglia e' decisa adesso, cosi' quando succede non si ridiscute**: se la suite
locale supera i **5 minuti su una macchina scarica**, si divide.

E' la stessa calibrazione dell'hook `pre-commit`, che esegue solo il typecheck e mai
la suite: **una verifica abbastanza lenta viene saltata, e una verifica saltata e'
peggio di una che non esiste** — perche' qualcuno crede che sia girata.

### Com'e' andata

La soglia e' scattata il 25 agosto: **6m40s**, 209 test su quattro progetti.
L'attesa e' tornata a **2m13s** con `workers: '50%'` e `fullyParallel: false`
lasciato dov'era. Nessun test rimosso, saltato o spostato: 209 passati e 16
saltati prima, 209 passati e 16 saltati dopo, in due esecuzioni.

**La forma decisa qui in anticipo era un'altra**, e va detto invece che
riscritto: *"due comandi — uno veloce che si lancia sempre, uno completo prima
del commit"*. Non e' quella applicata.

L'argomento di questo paragrafo regge — una verifica lenta viene eseguita di
meno. La sua **forma** no: "uno veloce e uno completo" sposta il difetto di un
metro invece di toglierlo, perche' il comando completo diventa il comando che
nessuno lancia. E la misura diceva che non c'era niente da tagliare: la suite
occupava **0,63 core su 8**, cioe' aspettava. Si e' diviso il lavoro fra i
processi, non i test fra due comandi. Tutto in
[ADR 021](adr/021-la-suite-si-divide-fra-i-core-non-fra-due-comandi.md).

**La prossima volta che il tetto si avvicina, la mossa non e' alzare i worker.**
Il pavimento e' `ricorrenze.spec.ts` (~53s per progetto, il 40% dell'attesa di
oggi): e' il blocco piu' grande che nessun worker puo' spezzare, e si abbassa
dividendo quel file, non aggiungendo processi.

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

### La data del backup nella conferma, e `ImportPreview.exportedAt`

L'import mostrera' cosa entra, ma deve dire anche cosa **esce**, con la data del
file che si sta importando:

> «Le spese registrate dopo il 3 agosto non esistono piu', e quelle che avevi
> cancellato dopo quella data torneranno.»

La seconda meta' non e' un dettaglio: `importBackup` fa `replaceAll` e `buildBackup`
include le lapidi, quindi una spesa cancellata **dopo** il backup torna viva. E' la
parte che nessuno si aspetta, ed e' stata **verificata**, non supposta.

Serve `ImportPreview.exportedAt: Timestamp | null` — oggi `buildBackup` scrive la
data e `parseBackup` la **butta via** in lettura. `null` quando il file non ce l'ha:
in quel caso la riga si scrive **senza data**, non con una inventata.

Le due stringhe **non** sono state aggiunte in fase 5, di proposito: sarebbero state
chiavi vive nel codice e morte nei fatti, cioe' `history.blank.install` un'altra
volta. Arrivano insieme al dialogo che le mostra.

### DA FARE — `RecurringRule.endDate` torna, col suo campo di input

Tagliata in fase 5 per **zero produttori**: nessun foglio la scriveva, la scriveva
solo `parseBackup` — quindi con zero produttori **nemmeno un backup poteva
contenerla**, e anche quel supporto era morto. Quindici rami raggiungibili solo da
un JSON scritto a mano.

Non e' stata tagliata perche' l'idea sia sbagliata: **e' una funzione che questo
prodotto vuole davvero.** Le spese fisse di un Erasmus **finiscono tutte** — la
palestra a giugno, il tram ad agosto, l'affitto quando finisce il contratto. Una
regola senza fine costringe a ricordarsi di disattivarla, cioe' a fare a mano una
cosa che la data sapeva gia'.

Torna **col suo campo di input, nello stesso commit**. La regola nella forma che
vale — quella che `dead-surface.mjs` sa controllare — e': *un campo e' prodotto
quando un valore entra da fuori almeno una volta; una scrittura la cui espressione
contiene solo letture dello stesso campo e' una copia.* Un campo di input e' un
valore che entra da fuori; `draft.endDate = rule.endDate` no, ed e' proprio la
catena di copie su cui lo script era verde su un albero malato.

(La prima formulazione era *"un campo si spedisce insieme al suo produttore, o non
si spedisce"*: dice la cosa giusta a un umano e non si puo' controllare a macchina,
perche' non dice cosa sia un produttore. E' stata sostituita, non ammorbidita.)

Cancellare del codice non e' cancellare un'intenzione, purche' l'intenzione sia
scritta dove si rilegge.

**Torna anche con le sue parole.** Sono uscite dai due dizionari insieme al campo,
e non sono rimaste in attesa: `fixed.ended` (*"finita: {day}"*, il terzo motivo per
cui una riga dell'elenco non pesa sul mese) e `rule.preview.done` (*"Questa spesa
fissa e' finita: non creera' altre spese."*, il ramo `nextDate === null` di
`settledText`). Tenerle vive sarebbe stato `history.blank.install` per la terza
volta: chiavi vive nel codice e morte nei fatti. Rientrano insieme ai due rami che
le leggono.

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

## DA VALUTARE — il budget per categoria

**Non e' un rinvio, e' una domanda di design**, e va tenuta distinta da `endDate`
qui sopra: quella ha forma nota e piccola — un campo "fino a", una data, il motore
la sa gia' usare. Questo no.

`Budget.categoryId` e' stato tagliato in fase 5 (**248 occorrenze in 24 file, zero
produttori**: `setBudget` ha un solo chiamante e non passa mai una categoria; e
diciassette letture in `budget.ts` filtravano per un campo che non poteva essere
valorizzato). L'ha trovato `scripts/dead-surface.mjs` al primo giro, dopo che tre
giorni di fase 5 non l'avevano visto.

**L'argomento a favore**: *"quanto ho speso di coffeeshop questo mese contro quanto
avevo deciso"* e' esattamente il tipo di domanda per cui esiste questa app.

**Le domande da rispondere prima**, e sono la ragione per cui questa voce non e'
un "da fare":

- ogni categoria ha il suo periodo, o si eredita quello generale?
- il budget settimanale resta, con otto budget per categoria accanto?
- **come si sommano?** Il budget generale e' il totale di quelli per categoria, o
  un tetto indipendente che li contiene? Le due cose danno numeri diversi sulla
  stessa Home.
- e l'incrocio con **ADR 016**: le ricorrenti stanno fuori dal budget. Un budget per
  "Casa" con l'affitto escluso e' un numero che qualcuno leggera' come il contrario
  di quello che dice.

Finche' queste non hanno risposta, il campo non torna: **tornerebbe come e' andato
via**, con la forma decisa a meta' e nessuno che la scrive.

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

## Un'enumerazione fatta in fretta e' un punto di partenza, non una chiusura

L'elenco delle premesse cadute nella sezione "Cambio di scopo" e' stato scritto in
dieci minuti, e poi **trattato come completo per tre passi di lavoro**.

Al gate della fase 3 il conto era: delle tre elencate, **una applicata a meta'**
(le categorie modificabili si', i loro nomi italiani no), **una non applicata**
(la Parte 2 del tastierino, con due commenti nel codice che la dichiaravano
attiva), una applicata. E **due fuori elenco**: `CLAUDE.md` continuava a dichiarare
`Locale it-IT` fra i vincoli non negoziabili e a chiedere "stati vuoti con copy
vero in italiano" — due righe rese false dal capitolo sulle due lingue, e lasciate
li' a essere lette come regola da chiunque aprisse il file per primo.

**Il critico deve ri-derivare quell'elenco, non spuntarlo.** Una lista scritta
sotto la spinta di una decisione e' un buon inizio e una pessima garanzia: contiene
cio' che veniva in mente allora, non cio' che era vero. Spuntarla da' la sensazione
di aver chiuso — che e' peggio di non averla, perche' chiude anche la ricerca.

Corollario, gia' visto altrove: la sesta premessa erosa e' stata **il promemoria di
backup dentro Impostazioni**, deciso quando Impostazioni non aveva ancora la
sezione "I tuoi dati". La sua ragione — *l'export sepolto non si vede piu'* — e'
falsa proprio nella schermata dove l'export e' in vista. Nessuno ha toccato quel
codice: e' cambiato cio' che gli sta intorno.

## Fase 5 — decisioni chiuse nella prima consegna

- **`interval` e' sempre 1 nel foglio di creazione.** Il motore accetta qualunque
  intervallo e l'elenco sa gia' scrivere "ogni 3 mesi" — una regola trimestrale
  arrivata da un backup si legge giusta. Ma affitto, abbonamenti e palestra hanno
  intervallo uno, e un selettore in piu' costerebbe una riga a un foglio che a 667
  punti gia' scorre. **Non e' un TODO: e' una decisione chiusa.** Se un giorno
  servira' il trimestrale, il motore c'e' gia' e manca solo il selettore.
- **Modifica e cancellazione** sono la consegna successiva della stessa fase.
- ~~**L'anteprima non e' imposta dal tipo.**~~ **Chiuso nella seconda consegna.**
  `addRecurringRule` riceve una `ConfirmedPreview`, che si ottiene solo da
  `previewMaterialization`, e resta sincrona: l'asincronia non serviva. Vedi
  [ADR 017](adr/017-un-anteprima-e-un-istantanea.md).

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

- **Due contesti che seminano insieme un database vuoto** — dichiarato da
  `data-core` e non chiuso. Aprendo l'app due volte in parallelo su un archivio
  nuovo, la condizione `settings === null` e' vera per entrambi e le categorie di
  default vengono scritte due volte: **sedici invece di otto**. La condizione e'
  identica a prima di ADR 015 — non e' un difetto introdotto, e' uno mai chiuso.
  La cura sono **id deterministici per i default**, sulla falsariga di ADR 006:
  l'id di una categoria di default e' funzione pura della sua chiave, quindi la
  seconda scrittura non e' rappresentabile invece che sorvegliata.
  Su iOS non e' raggiungibile (i contesti non sono mai simultanei, ADR 007);
  su desktop affiancato si', ed e' lo stesso confine di sempre.


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
