/**
 * Tutto quello che le Statistiche decidono **prima** di disegnare: quali righe
 * esistono, quanto sono lunghe, e quali portano un confronto.
 *
 * Sta qui e non in `Stats.tsx` per la stessa ragione di `budget-view.ts`: la
 * geometria e' aritmetica, e l'aritmetica si prova senza un browser. Il
 * componente riceve frazioni gia' calcolate e le trasforma in attributi SVG,
 * senza decidere niente.
 *
 * ## Le due domande, e la terza che non e' un grafico
 *
 * - **A — "dove sono finiti i soldi?"** Ripartizione per categoria del periodo
 *   corrente, **ricorrenti comprese** (ADR 016 §1: le fisse sono uscite davvero,
 *   ed e' *solo il budget* a escluderle), in **due sezioni su una scala sola**:
 *   fisse e variabili. Le sezioni raggruppano e ordinano; l'unita' di misura e'
 *   una. Perche' una, dopo essere stata due: sotto.
 * - **B — "sto spendendo piu' o meno degli altri periodi?"** Una riga per
 *   periodo, **solo variabile**, con la traccia del budget **dove il confronto
 *   ha una risposta**. Qui l'esclusione non contraddice §1: **B *e'* il
 *   confronto col budget**, cioe' esattamente il caso che §1 nomina. Una barra
 *   che comprendesse l'affitto contro una traccia che non lo comprende
 *   metterebbe due unita' di misura sullo stesso asse, e la settimana del primo
 *   leggerebbe "disastro" per costruzione — che e' il difetto per cui ADR 016
 *   esiste.
 * - **C — "quanto mi costa stare qui?"** Due cifre in testa, non un grafico: e'
 *   ADR 016 §3 ("due numeri, non uno"), ed e' cio' che rende leggibile B — che
 *   le fisse le esclude — senza che l'esclusione resti taciuta.
 *
 * ## Perche' A e' in due sezioni, e perche' la scala e' comunque una sola
 *
 * Sembrano la stessa decisione e sono due: **la sezione e' un raggruppamento,
 * la scala e' un'unita' di misura.** Per qualche giorno sono state legate — ogni
 * sezione con la propria scala — e questa nota esiste per chi arriva qui con in
 * mano la misura che le aveva legate e la voglia di rimetterle insieme.
 *
 * ### La misura che aveva prodotto le due scale non e' scaduta
 *
 * Con l'affitto dentro e una scala sola, una settimana vera a 390 punti dava:
 * Casa 192,73 px · Trasporti 12,53 · Spesa 9,88 · Fuori 5,50 · Coffeeshop 3,41 ·
 * Sigarette 2,84. **Sei righe su sette dentro dieci pixel.** Chi rifa' il conto
 * oggi ottiene gli stessi numeri: la scala unica **schiaccia davvero**, e non e'
 * per un difetto di quella misura che le due scale sono uscite.
 *
 * ### Cio' che le ha tolte e' l'incrocio con la soglia, che nessuna delle due regole poteva mostrare da sola
 *
 * La scala per sezione viveva accanto a `BREAKDOWN_MIN_ROWS` applicata **per
 * sezione**. Misurato a schermo sul periodo 24–30 agosto, con la colonna a
 * `--plot-min` (112 px):
 *
 *     Casa      (fisse)  507,00 €   nessuna barra
 *     Trasporti (fisse)   23,00 €   nessuna barra
 *     Spesa     (var)     42,00 €   112 px — la piu' lunga della schermata
 *     Svago     (var)     26,00 €    70 px
 *     Coffeeshop(var)     24,00 €    65 px
 *     Fuori     (var)     10,00 €    28 px
 *     Trasporti (var)     10,00 €    28 px
 *
 * Le fisse erano **due** righe, cioe' sotto la soglia, quindi la sezione che
 * conteneva 530,00 € su 642,00 € non aveva **nessuna** barra, e la barra piu'
 * lunga dello schermo ne valeva 42,00. **Il peso visivo era l'inverso degli
 * importi.** Ogni regola, presa da sola, faceva il suo mestiere; il difetto
 * stava nel loro incrocio — e un incrocio non lo guarda nessun gate. Cadono
 * tutte e due: la scala per sezione **e** il minimo per sezione. Meno regole,
 * meno incroci.
 *
 * ### Cosa compensa lo schiacciamento, visto che la misura resta vera
 *
 * Non "niente", e va scritto qui perche' il compenso arriva da **altri due
 * pezzi**: chi legge solo questo file vedrebbe una regressione dove c'e' uno
 * scambio.
 *
 * - **La proporzione sale in cima** (`Breakdown.split`). Il fatto dominante —
 *   due terzi sono l'affitto — non ha piu' bisogno che a portarlo sia la
 *   lunghezza di una barra fra sette. Non e' che la barra lo portasse: lo
 *   portava male, ed e' per non farglielo portare che erano nate le due scale.
 * - **Il confronto fra le quotidiane torna a richiesta** (`StatsInput.showFixed`).
 *   Spente le fisse, la scala **si ricalcola** sulle righe rimaste: le stesse sei
 *   righe che stavano in dieci pixel si riaprono su tutta la colonna, cioe'
 *   esattamente cio' che la scala per sezione dava — ma quando l'utente lo
 *   chiede, e senza mai avere due unita' di misura contemporaneamente a schermo.
 *   E' un **ricalcolo**, non un filtro: filtrare lasciando la scala dov'era
 *   lascerebbe quelle sei righe schiacciate come prima, cioe' sarebbe un
 *   selettore che non serve a niente.
 *
 * Ne segue che **la sezione dichiara la natura, non l'unita' di misura**: due
 * righe di sezioni diverse con lo stesso importo hanno la stessa lunghezza, ed e'
 * questo che rende leggibile *"l'affitto pesa quanto tutto il resto messo
 * insieme"* — una frase che con due scale non si poteva ne' leggere ne' scrivere.
 *
 * Resta vero che **una categoria puo' comparire in tutte e due** — Trasporti
 * 23,00 di abbonamento e 10,00 di taxi — ed e' informativo: dice quanto di quella
 * spesa e' deciso e quanto e' occasionale. Con la scala unica le due righe sono
 * anche **confrontabili fra loro**, cosa che prima non erano: con due scale i
 * 10,00 occasionali si disegnavano **piu' lunghi** dei 23,00 decisi.
 *
 * ### L'invariante che dichiarava le due scale, e quello che lo sostituisce
 *
 * Diceva: *"in ogni sezione la barra piu' lunga arriva a fondo colonna"*, ed era
 * il modo in cui la geometria dichiarava da sola che le scale erano due. Adesso
 * vale **una volta sola su tutta A**: fra tutte le righe visibili, quella con
 * l'importo piu' alto ha frazione esattamente 1, e nessun'altra ce l'ha se non a
 * pari importo. Due barre piene con due importi diversi sono tornate a essere il
 * difetto che erano prima di diventare una dichiarazione.
 *
 * ### Ogni sezione porta il proprio totale
 *
 * Le due cifre di C sono in **unita' diverse** — quella variabile e' del periodo,
 * `fixedMonthlyCents` e' al mese, come impone ADR 016 §3 — quindi affiancate non
 * dicono "530,00 contro 112,00 questa settimana". Percio' ogni sezione porta il
 * proprio `totalCents`, **entrambi del periodo** e quindi confrontabili fra loro.
 *
 * **La ragione e' stata ri-derivata, non ricopiata**, perche' quella scritta qui
 * prima e' scaduta con la scala unica: diceva *"finche' c'era la barra gigante
 * quel confronto lo faceva l'occhio sul grafico, togliendola lo perderemmo"* — e
 * la barra gigante e' tornata. Ma l'occhio sul grafico confronta **la riga piu'
 * grande di qua con la riga piu' grande di la'**, che e' un'altra domanda:
 * `507,00 contro 42,00` non e' `530,00 contro 112,00`. E con le fisse spente
 * (`StatsInput.showFixed`) di qua non c'e' nessuna riga da guardare. Il totale di
 * sezione resta l'unico posto in cui si confrontano i due **insiemi**.
 *
 * Con **una riga sola** quel totale non c'e', ed e' la stessa ragione letta al
 * contrario: il confronto che la cifra serviva a permettere lo fa gia' la riga,
 * e cio' che resterebbe e' la stessa cifra due volte. Sta su
 * `BreakdownSection`, con la misura che l'ha prodotto.
 *
 * Ne segue l'obbligo su **questo** strato: A e B contano cose diverse, quindi
 * ognuno dei due deve poter **dichiarare cosa conta**, e i numeri per dirlo
 * escono di qui gia' fatti. Un'esclusione taciuta e' un numero che mente per
 * omissione; una **inclusione** taciuta, che e' il caso di A, e' una barra di
 * cui non si sa di cosa e' fatta.
 *
 * ## Perche' le righe sono orizzontali
 *
 * Nome a sinistra, barra al centro, importo a destra: **il grafico e' la
 * tabella**. Non esiste una seconda vista da tenere allineata — che sarebbe una
 * parafrasi del grafico, promossa a schermata — le etichette entrano sempre
 * anche a otto categorie su 375 punti, e non c'e' nessun testo ruotato.
 *
 * Ne segue che il colore non porta l'identita': la porta l'etichetta. Il colore
 * porta la **continuita' con il resto dell'app** — e' lo stesso colore del chip
 * che l'utente ha scelto e riconosce dallo Storico. E' un lavoro diverso da
 * quello che una tavolozza di grafico farebbe, e per questo importarne una
 * estranea spezzerebbe l'unica associazione gia' imparata.
 *
 * ## Nessun testo esce di qui
 *
 * I titoli delle sezioni, l'etichetta della riga orfana e le due frasi di C li
 * nomina il componente, che ha il dizionario. Qui ci sono numeri e un
 * discriminante.
 */
import { computeBudgetMetrics, countsTowardBudget, periodRange } from '../core/budget'
import type { BudgetMetrics, PeriodRange } from '../core/budget'
import { addDays, isBefore } from '../core/date'
import type { IsoDate } from '../core/date'
import { monthlyFixedCosts } from '../core/recurring-plan'
import type { Budget, BudgetPeriod, Category, Expense, RecurringRule } from '../core/types'
import type { Cents } from '../core/money'

/**
 * Quanti periodi indietro guarda B.
 *
 * **Otto, ed e' una finestra dichiarata invece che una soglia scoperta.** La
 * domanda di B e' *"sto spendendo piu' o meno degli **altri** periodi"*, cioe' un
 * confronto col normale recente — e due mesi sono il normale recente. Oltre,
 * smette di essere un confronto e diventa una storia (*"com'e' andato l'anno"*),
 * che e' un'altra domanda e non ha una schermata.
 *
 * Il numero e' anche cio' che impedisce a B di cambiare forma: otto righe
 * scorrono su qualunque telefono, quindi non esiste una soglia oltre la quale
 * comprimere. La schermata cresce per scorrimento, mai per compressione.
 */
export const TREND_PERIODS = 8

/**
 * Sotto quante categorie con spesa **A** smette di essere un grafico.
 *
 * **Tre, e l'argomento e' la domanda di A: "come si ripartisce".** Due
 * categorie non sono una ripartizione — sono due importi, e la barra piu' corta
 * non aggiunge niente a un numero gia' scritto accanto; una sola e' il bar
 * chart a una barra, l'anti-esempio da manuale. Sotto la soglia le stesse righe
 * si leggono senza barra: nome e importo.
 *
 * La soglia esiste perche' il caso vuoto e' stato disegnato per primo: partendo
 * dai dati pieni, questo stato sarebbe arrivato come un grafico degenere invece
 * che come una forma sua.
 *
 * **Si applica all'insieme delle righe visibili, non per sezione — e questo e'
 * cambiato.** L'argomento di prima era simmetrico a quello della scala: ogni
 * sezione fa la domanda sui propri soldi con la propria scala, quindi ha il
 * proprio minimo. Caduta la scala per sezione, quell'argomento non ha piu' la
 * premessa: le righe stanno tutte sulla **stessa** unita' di misura, quindi la
 * ripartizione che A mostra e' **una**, ed e' quella che va contata.
 *
 * **E la soglia per sezione non era solo priva di premessa: era la causa
 * misurata del difetto.** Due righe di fisse cadevano sotto il minimo e restavano
 * senza barra mentre valevano 530,00 € su 642,00 €, e la barra piu' lunga della
 * schermata ne valeva 42,00 — il peso visivo inverso agli importi. La tabella
 * misurata sta in cima al file.
 *
 * Ne segue che sotto soglia **A intera** perde le barre, non una meta': con due
 * righe in croce non c'e' nessuna ripartizione da leggere, e dividerle in due
 * intestazioni non ne fa nascere una.
 *
 * **Non e' la stessa soglia di `TREND_MIN_ROWS`, e le due non si unificano.**
 * Qui c'era scritto *"due barre non sono un confronto"*, che e' falso quindici
 * righe piu' sotto: per B due barre **sono** il confronto. Sono due domande
 * diverse con due minimi diversi, e ognuno tiene accanto l'argomento della
 * propria domanda invece di uno solo che ne serve una e contraddice l'altra.
 *
 * **E non differiscono solo nel numero: differiscono nell'effetto.** Sotto
 * questa soglia una sezione di A **tiene le righe e perde le barre**, perche'
 * due categorie non sono una ripartizione ma sono due fatti da leggere — nome e
 * importo. Sotto `TREND_MIN_ROWS` **B non c'e' affatto**, perche' la sua unica
 * riga non e' un confronto ridotto: e' una cifra che sta gia' in testa alla
 * stessa schermata. Due domande, due comportamenti, scritti accanto perche' chi
 * legge non li prenda per un'incoerenza.
 */
export const BREAKDOWN_MIN_ROWS = 3

/**
 * Sotto quanti periodi **B non c'e'**.
 *
 * **Due, e l'argomento e' la domanda di B: "piu' o meno degli altri periodi".**
 * Due periodi sono **letteralmente** la domanda — questa settimana contro la
 * scorsa e' il confronto che l'utente si sta facendo — quindi il minimo e' due,
 * e alzarlo a tre nasconderebbe la risposta proprio a chi ha appena finito la
 * seconda settimana di Erasmus. Con una riga sola non esiste nessun "prima": e'
 * lo speso del periodo corrente, che la Home mostra gia' e con piu' contesto.
 *
 * ## La soglia governa l'esistenza della sezione, non la forma delle barre
 *
 * Quella frase — *"con una riga sola non esiste nessun prima"* — nomina **la
 * riga**, non il grafico, e per un giorno e' stata applicata al solo `asChart`.
 * Il difetto misurato e' quello del **primo giorno d'uso**, cioe' lo stato di
 * chiunque installi l'app: tutte le spese datate oggi, e sotto il titolo
 * `SETTIMANA PER SETTIMANA` **una riga sola**, `17–23 ago 90,00 €`, mentre la
 * scheda in testa diceva gia' `Quotidiane 90,00 € · 17–23 ago`. Stessi due
 * fatti, due volte, a 400 px di distanza — e `90,00 €` **tre volte** sulla
 * stessa schermata, che e' esattamente la misura per cui la nota sotto B era
 * stata tolta, rientrata da un'altra porta.
 *
 * Quindi sotto soglia `Trend.rows` esce **vuota**. Non serve un ramo nuovo da
 * nessuna parte: il componente ha gia' "elenco vuoto -> nessuna sezione", che
 * era li' per il caso senza periodi.
 *
 * Ne segue che `Trend` **non ha un `asChart`**: sopra soglia B e' un grafico,
 * sotto soglia non esiste, e un campo sempre vero e' un ramo che nessuno
 * percorre. Il confronto con `BREAKDOWN_MIN_ROWS`, che invece un `asChart` ce
 * l'ha e per una ragione, sta accanto a quella costante.
 */
export const TREND_MIN_ROWS = 2

/**
 * Il pavimento di una barra: **la lunghezza piu' corta che si dipinge davvero**,
 * espressa come frazione della colonna del grafico. Vale `1/56`.
 *
 * ## Da dove vengono i due numeri
 *
 * `2 / 112`, e nessuno dei due e' scelto:
 *
 * - **2 px** e' l'inchiostro minimo di `.stat__bar` (Stats.css). Ha
 *   `border: 1px solid` — che non e' decorazione: quattro degli otto colori
 *   delle categorie stanno sotto 3:1 sul fondo in tema chiaro — e con
 *   `box-sizing: border-box` un box bordato non puo' essere piu' stretto della
 *   somma dei suoi bordi. **Senza `border-box` il contorno non sarebbe un
 *   pavimento e tutto questo argomento cadrebbe**: e' una delle cose che la
 *   misura in `statistiche.spec.ts` verifica, non una che si da' per scontata.
 * - **112 px** e' `--plot-min: 7rem`, la colonna piu' stretta in cui una barra
 *   puo' cadere (`grid-template-columns: ... minmax(var(--plot-min), 1fr) ...`).
 *   Si prende la **piu' stretta** perche' il pavimento e' una garanzia: su una
 *   colonna piu' larga la barra minima e' piu' larga di 2 px, mai piu' stretta.
 *   Il 7rem ha una sua ragione, che vive in Stats.css e non si ricopia qui: su
 *   un plot largo P due importi che differiscono del 20% restano distinti a un
 *   pixel solo da `f >= 5/P` in su, e 112 e' dove il caso di prova (26,00 € su
 *   una scala da 507,00 €, cioe' il 5%) passa il pixel con margine.
 *
 * Il legame col CSS e' dichiarato **e misurato**: `statistiche.spec.ts` risolve
 * `--plot-min` dalla pagina, legge il bordo dipinto di una barra vera e li
 * confronta con questa costante. Se uno dei due si muove senza l'altro, quella
 * cade e dice quale — che e' cio' che e' successo quando la colonna e' passata
 * da 4rem a 7rem.
 *
 * ## Il pavimento e' esatto **solo** sulla colonna piu' stretta
 *
 * Su una colonna piu' larga la barra minima e' proporzionalmente piu' larga: a
 * 390 punti, dove il plot vale 192,73 px, la barra minima si dipinge **3,44 px**
 * invece di 2. E' una sovrastima innocua — l'inchiostro minimo resta il piu'
 * piccolo che A produce, e nessuna barra viva sparisce — ma va detta
 * qui: chi legge "2 px" senza questa riga crede che il numero valga a ogni
 * viewport, e la garanzia e' `>= 2 px`, non `= 2 px`. L'unico verso in cui
 * romperla sarebbe un `rem` piu' piccolo di 16 px: Dynamic Type allarga, non
 * stringe, quindi oggi non succede.
 *
 * ## Perche' il pavimento sta qui e non nel CSS
 *
 * Perche' altrimenti quella quantita' ha **due proprietari**: il modello calcola
 * la frazione e il CSS la corregge verso l'alto senza dirlo. Misurato a 320
 * punti con l'affitto a 507,00 €, tutto cio' che stava sotto ~11,00 € usciva di
 * qui **diverso** (9,00 € -> 0,0177 · 7,50 € -> 0,0148) e si dipingeva
 * **identico** (2,00 px, rapporto vero 1,2:1). Nessuna verifica poteva cadere:
 * il guardiano e2e chiede `larghezza > 0`, e 2 px lo soddisfa; e il test
 * unitario che dichiarava di sorvegliare proprio questo — *"un centesimo contro
 * novecento euro resta un centesimo, non un minimo"* — non poteva fallire,
 * perche' il minimo non era nel modello.
 *
 * E' la stessa condizione dell'argomento con cui era nato `[data-zero]` — *"una
 * barra a 0% restava larga 2 px: un periodo davvero a zero si leggeva «un
 * pochino»"* — e la condizione non nomina lo zero: **una lunghezza sotto i 2 px
 * si dipinge 2 px**, che a zero e' un "pochino" inventato e a 9,00 € e' due
 * importi diversi disegnati uguali. Vale identico a 9,00 €, e nessuno se n'era
 * accorto.
 *
 * ## La forma: si trasla, non si taglia
 *
 * Un minimo a soglia dura (`max(f, MIN)`) rimetterebbe il difetto: due importi
 * diversi entrambi sotto soglia tornerebbero identici. Quindi la quota si
 * **rimappa**, `f -> MIN + (1 - MIN) · f`, e:
 *
 * - **zero resta zero**, ed e' l'unica discontinuita': l'assenza non si
 *   arrotonda a "un pochino". La presenza prende l'inchiostro minimo, l'assenza
 *   non prende niente;
 * - la mappa e' **strettamente crescente su tutto [0, 1]**, quindi due importi
 *   diversi non nulli danno due lunghezze diverse — anche a un centesimo di
 *   distanza;
 * - **la piu' grande vale esattamente 1**, in virgola mobile e non solo in
 *   algebra: `MIN + (1 - MIN) · 1 === 1`.
 *
 * ### Perche' quell'ultimo `=== 1` e' vero, riscritto come proprieta'
 *
 * Qui c'era scritto *"`MIN` e' `2^-5`, quindi l'aritmetica chiude esatta"*. Era
 * una condizione **sufficiente e non necessaria**, ed e' scaduta nel momento in
 * cui `--plot-min` e' passato a 7rem: `2/112` non e' una potenza di due, e chi
 * fosse arrivato qui col numero nuovo avrebbe letto una ragione che non si
 * applica al numero che ha davanti — cioe' non avrebbe saputo se fidarsi.
 *
 * La ragione vera non e' del numero, e' della **forma**: per **ogni** `MIN`
 * rappresentabile in `(0, 1)`, `MIN + (1 - MIN)` in doppia precisione vale
 * esattamente 1. L'errore commesso arrotondando `1 - MIN` vale al massimo mezzo
 * ulp di un numero minore di 1 (`2^-54`); rimetterlo dentro cade quindi entro
 * mezzo ulp da 1, e li' l'arrotondamento al piu' vicino restituisce 1 — anche
 * nel pareggio esatto, dove il pari e' proprio 1. Provato oltre a dimostrato: su
 * tre milioni di valori, comprese le potenze di due, i loro vicini di un ulp e
 * i valori a ridosso di 0 e di 1, **nessun contro-esempio**.
 *
 * Conseguenza pratica per chi cambiera' di nuovo la colonna: il numero si
 * ricalcola e basta. Non c'e' una potenza di due da preservare, e non esiste un
 * valore di `MIN` che rompa la chiusura in alto. Cio' che la romperebbe e'
 * cambiare la **forma** della rimappatura — per esempio traslare senza
 * comprimere (`MIN + f`), che manda la piu' grande a `1 + MIN`.
 *
 * ## Cosa si perde, e il limite che va detto qui invece che scoperto
 *
 * Il **rapporto** fra due lunghezze non e' piu' il rapporto fra due importi: c'e'
 * una traslazione costante, uguale per **tutte** le barre di A — che da quando la
 * scala e' una sola vuol dire davvero tutte, comprese quelle di sezioni diverse.
 * Resta esatta la **differenza**, che e' l'altra meta' della lettura: due
 * lunghezze differiscono di `(1 - MIN) · (differenza degli importi) / scala`.
 *
 * E il limite: sotto una certa scala **l'ordine sopravvive nel modello e non nei
 * pixel**. 9,00 € e 7,50 € su una scala da 507,00 € distano 0,0029, cioe' **0,56
 * px** sul plot da 192,73 di un 390: diversi qui, indistinguibili li'. Allargare
 * la colonna sposta il confine e non lo toglie — e' esattamente il conto con cui
 * `--plot-min` e' passato a 7rem, e vale la pena leggerlo in Stats.css invece di
 * ricopiarlo qui.
 *
 * **La scala unica allarga questa zona, ed e' il prezzo dichiarato dello
 * scambio.** Finche' le scale erano due, quelle due righe cadevano su una scala
 * che l'affitto non conteneva e si separavano di 31,5 px; oggi cadono sulla scala
 * che lo contiene, e restano dentro il pixel. Cio' che le separa li' e' l'importo
 * scritto accanto — e, quando servono separate davvero, il selettore delle fisse
 * (`StatsInput.showFixed`), che ricalcolando la scala sulle sole quotidiane
 * rimette quelle stesse due righe a 31,5 px l'una dall'altra. Non e' un caso che
 * sia lo stesso numero: e' la stessa scala di prima, chiesta invece che imposta.
 */
export const BAR_MIN_FRACTION = 2 / 112

/**
 * **Chi e'** una riga di A: una categoria, oppure il fatto che una categoria non
 * c'e' piu'.
 *
 * E' un'unione e non tre campi annullabili perche' i tre viaggiano insieme: un
 * `name` senza `categoryId` non esiste, e in un'interfaccia sola sarebbe uno
 * stato rappresentabile che nessuno produce — la cosa che questo progetto
 * elimina da giorni. Qui narrow su `orphan` e i tre arrivano o mancano insieme.
 *
 * **Il testo e il colore della riga orfana non stanno qui.** `stats-view.ts` non
 * conosce il dizionario e non deve inventare un'etichetta: l'etichetta e'
 * `row.categoryRemoved`, **la stessa chiave che gia' usano Storico, azioni sulla
 * spesa e costi fissi** per lo stesso fatto — cosi' l'utente legge la stessa
 * parola nei quattro posti invece di quattro parafrasi. Il colore lo sceglie il
 * componente, che ha gia' un neutro (`var(--brand)`) per il caso senza colore.
 */
export type SliceIdentity =
  | {
      readonly orphan: false
      readonly categoryId: string
      readonly name: string
      /** Il colore che l'utente ha scelto per il chip. Continuita', non identita'. */
      readonly color: string
    }
  | {
      /**
       * Le spese la cui categoria non esiste piu': **una riga sola, aggregata**.
       * Non un elenco di righe senza nome — sarebbero N parafrasi dello stesso
       * fatto — e non una riga saltata, perche' da quando una sezione dichiara
       * un totale una riga saltata e' un totale che le righe non spiegano.
       *
       * **Una per sezione, e non si fondono.** Una spesa senza categoria puo'
       * essere ricorrente o manuale, quindi le orfane sono due fatti diversi:
       * "canoni che non si sa piu' a cosa erano" e "spese a mano che non si sa
       * piu' a cosa erano". Fonderle rimetterebbe insieme le due nature che A
       * divide.
       *
       * **Il secondo argomento che c'era qui e' scaduto, e va detto**: diceva
       * *"per giunta sarebbe una riga che non potrebbe stare in nessuna delle due
       * scale"*, cioe' fondere le due orfane era **impossibile**. Con la scala
       * unica e' diventato possibile, e la riga resta divisa per il primo
       * argomento soltanto — che regge da solo, ma adesso deve reggere davvero:
       * sono due fatti, e la sezione e' il posto in cui si dice quale.
       */
      readonly orphan: true
      /** Non c'e' un id: qui dentro ci sono categorie diverse, tutte sparite. */
      readonly categoryId: null
      readonly name: null
      readonly color: null
    }

/**
 * Una riga di A: una categoria dentro una sezione del periodo corrente, o
 * l'aggregato delle orfane di quella sezione. **La sezione decide dove sta e
 * accanto a chi si ordina, non quanto e' lunga.**
 *
 * **Non porta piu' `recurringCents` ne' `recurringShare`.** Servivano a
 * distinguere la parte fissa *dentro* la barra quando la sezione era una sola;
 * adesso la natura e' la sezione, quindi quei due campi varrebbero `cents` e `1`
 * in ogni riga delle fisse e `0` e `0` in ogni riga delle variabili — cioe' un
 * valore deciso da quale elenco contiene la riga. Un campo che ripete il proprio
 * contenitore e' uno stato che si puo' scrivere sbagliato e nessuno puo'
 * leggere giusto.
 */
export type CategorySlice = SliceIdentity & {
  /** Quanto e' uscito su questa categoria, in questa sezione, nel periodo. */
  readonly cents: Cents
  /**
   * Lunghezza della barra, 0..1 sulla **scala unica di A**: il massimo fra tutte
   * le righe **visibili**, non fra quelle della propria sezione.
   *
   * "Visibili" e non "esistenti", ed e' la meta' che conta del selettore: con
   * `StatsInput.showFixed` a `false` la scala si ricalcola sulle sole quotidiane,
   * quindi **la stessa riga con lo stesso importo cambia lunghezza**. Un filtro
   * che togliesse le righe lasciando la scala dov'era non farebbe niente di
   * utile, ed e' per questo che il selettore sta nel modello e non nel
   * componente.
   *
   * Zero, oppure almeno `BAR_MIN_FRACTION`: mai una via di mezzo che il CSS
   * dovrebbe correggere.
   */
  readonly fraction: number
}

/**
 * La traccia del budget dietro la barra di un periodo. **Esiste solo dove il
 * confronto ha una risposta** (`BudgetMetrics.comparableToBudget`): dove non ce
 * l'ha, questo e' `null` e la barra e' nuda.
 *
 * Non esiste una traccia parziale, e la ragione e' che nessuna lunghezza sarebbe
 * onesta. Sulla settimana in cui il budget e' nato l'ultimo giorno, una traccia
 * intera legge "sei stato bravo" e una traccia da un settimo legge "disastro":
 * 136,45 su 200 non e' nessuna delle due. L'assenza si dichiara con la
 * geometria, non con una nota.
 */
export interface BudgetTrack {
  /** Lunghezza della traccia, 0..1 sulla scala condivisa di B. */
  readonly fraction: number
  /**
   * Dove cade il **maturato**: il punto a cui la barra arriverebbe se il passo
   * fosse esattamente quello del budget, cioe' l'immagine di
   * `budget · giorni vissuti / giorni totali` sulla stessa scala della barra.
   * A periodo chiuso coincide con `fraction`.
   *
   * **`[accruedFraction, fraction]` non si dipinge**, e qui c'era scritto il
   * contrario. Quell'intervallo era una banda che ridipingeva col fondo la parte
   * di rotaia non ancora accaduta, e con essa l'incompletezza del periodo era
   * "un dato e non un ramo" — vero, e non era quello il problema: **la rotaia e'
   * l'unico posto della schermata in cui e' scritto quanto vale il tetto del
   * periodo** (le barre si leggono contro di lei, non contro un asse), quindi
   * accorciarla riduce il tetto proprio li'. Mercoledi' di una settimana da
   * 200,00 € la rotaia ne mostrava tre settimi: **85,71 € letti dove la Home ne
   * dice 200,00.** E' il pro-rata che ADR 010 rifiuta, dipinto invece che
   * calcolato — l'unico posto dell'app in cui esisteva.
   *
   * La distinzione che aveva ingannato chi l'ha disegnata: **il segno marca un
   * istante sopra la rotaia intera; la banda le toglieva superficie.** Stessa
   * area dello schermo, due statuti diversi. Il segno resta; la banda no.
   *
   * ## Era `livedFraction`, ed e' cambiato per una ragione, non per gusto
   *
   * Era la frazione di periodo vissuta (0..1) e il componente moltiplicava:
   * `fraction · livedFraction`, "il segno cade a 3/7 della traccia", senza un
   * terzo campo da tenere allineato. Quella moltiplicazione e' esatta finche'
   * lunghezza e valore stanno nella stessa scala lineare — e con
   * `BAR_MIN_FRACTION` non ci stanno piu': ogni lunghezza porta una traslazione
   * costante, e i 3/7 di una lunghezza traslata non sono la lunghezza dei 3/7
   * del valore. Il segno sarebbe caduto fino a `MIN · 4/7` di colonna prima del
   * dovuto, cioe' la barra avrebbe letto "sopra il passo" stando esattamente sul
   * passo — nell'unico caso in cui quel segno dice qualcosa.
   *
   * Quindi il maturato passa per **la stessa mappa** della barra e della
   * traccia, e le tre lunghezze tornano confrontabili per costruzione:
   * `barra >= maturato` se e solo se `speso >= budget · vissuto`.
   */
  readonly accruedFraction: number
}

/** Una riga di B: un periodo. */
export interface PeriodBar {
  /** `range.start`: identita' stabile, non l'indice di riga. */
  readonly key: IsoDate
  readonly range: PeriodRange
  readonly cents: Cents
  readonly fraction: number
  readonly track: BudgetTrack | null
  /**
   * Il periodo che contiene oggi.
   *
   * ## Non si ricava da `daysLived < daysTotal`, e la differenza dura un giorno per periodo
   *
   * Sembrano la stessa domanda e non lo sono. **L'ultimo giorno del periodo** —
   * la domenica, per una settimana — `daysLived === daysTotal` e il periodo e'
   * **ancora in corso**: la giornata non e' finita e ci si puo' ancora spendere.
   * Chi togliesse questo campo *"perche' si ricava dai giorni"* romperebbe
   * esattamente quel giorno: **una volta a settimana** la domenica, e l'ultimo
   * del mese sul periodo mensile — cioe' proprio quando quanto resta e' la cosa
   * piu' utile della schermata. C'e' un test su quel giorno, ed e' li' per
   * questo.
   *
   * ## E non e' "l'ultima riga dell'elenco"
   *
   * Oggi le due cose **coincidono**, e coincidono per un invariante scritto:
   * `trendRanges` costruisce la finestra a partire da `input.day`, quindi
   * l'ultimo periodo e' quello di oggi, e la finestra **si taglia dalla testa e
   * mai dal fondo** (vedi `inWindow` in `statsView`). Coincidere non e' essere
   * la stessa cosa: la posizione e' una **conseguenza** della costruzione della
   * finestra, `current` e' un **fatto sulle date**.
   *
   * La distinzione conta in due posti. Nel **componente**, dove leggere
   * `index === rows.length - 1` invece di questo campo compilerebbe, passerebbe
   * ogni fixture e diventerebbe falso il giorno in cui la finestra smettesse di
   * finire con oggi. E **qui**, se un giorno la finestra scorresse indietro fino
   * a dove i dati ci sono — una tentazione vera, rifiutata con un argomento su
   * `inWindow`: allora l'ultima riga sarebbe un periodo **chiuso**, e il campo
   * direbbe la cosa giusta senza che nessuno lo tocchi.
   *
   * Il test che sorveglia la coincidenza la asserisce **insieme alla sua
   * ragione** — l'ultima riga e' corrente *perche'* il suo intervallo contiene
   * `input.day` — invece che da sola: da sola sarebbe la fotografia di un
   * accidente, e domani giustificherebbe di leggere la posizione.
   *
   * **E va detto, perche' chi lo riprovera' lo scoprira' da solo**: sostituire
   * qui `current` con `indice === ultimo` e' un **mutante equivalente**, e non
   * per debolezza dei test. E' un teorema di tre righe: l'ultimo elemento di
   * `bars` ha per costruzione `range === current.range`, e `inWindow` e' uno
   * `slice` dalla sola testa, quindi ogni `rows` non vuota finisce con la riga
   * corrente — nessun input puo' violarlo. Cio' che i test prendono e' la
   * **premessa**: tagliando la finestra anche dal fondo cadono 24 asserzioni.
   *
   * ## Ha smesso di essere una cucitura diventando utile
   *
   * Fino a questa riparazione era dichiarato, prodotto dal modello e **letto da
   * nessuno in produzione**: lo tenevano vivo i soli test. Le altre superfici di
   * questa famiglia trovate finora — `expensesInRange`, `planBudgetChange`,
   * `accruedCents`, `breakdownTotal`, `fixedInPeriodCents`, `livedFraction` —
   * sono state **cancellate**. Questa e' la prima che si chiude in senso
   * opposto: le mancava il
   * **lettore**, non la funzione, e il lettore e' arrivato quando il periodo in
   * corso ha smesso di essere disegnato come se fosse finito.
   *
   * Sta scritto accanto al campo perche' cambia la domanda che si fa davanti a
   * una cucitura: non e' sempre *"si taglia?"*, e' **"manca il lettore o manca
   * la funzione?"**. Le due hanno la stessa evidenza — zero chiamanti di
   * produzione — e due rimedi opposti.
   */
  readonly current: boolean
  /**
   * I giorni del periodo **davvero vissuti, oggi compreso**
   * (`BudgetMetrics.daysLived`). Su una riga chiusa vale `daysTotal`; sulla riga
   * corrente e' `<= daysTotal`, e li' e' uguale l'ultimo giorno del periodo.
   *
   * ## Perche' esce di qui: il periodo in corso era disegnato come se fosse finito
   *
   * E' il difetto da cui questa fase e' partita — *"una barra da 112 accanto a
   * una da 136 dice «sto spendendo meno»: mancano tre giorni"* — e per un giorno
   * e' stato riparato **solo dove c'e' un budget**. L'unica marca che dichiarava
   * l'incompletezza era la regione fra `accruedFraction` e `fraction`, che
   * esiste **solo se esiste la rotaia**: cioe' l'incompletezza era legata a un
   * campo con cui non c'entra niente, e restava invisibile nello stato **senza
   * budget** — che e' la prima settimana di chiunque, e uno dei due stati che la
   * suite stessa dichiara fra i piu' probabili.
   *
   * Misurato senza budget, di mercoledi': tre settimane piene da 70,00 € e la
   * corrente con 30,00 € su tre giorni. Barre `175,98 / 175,98 / 175,98 / 77,20`
   * px, DOM identico, nessuna marca. **Il passo e' lo stesso in tutte e
   * quattro** — 10,00 € al giorno — e la forma diceva 44%.
   *
   * ## Sono due interi, e **non** una lunghezza
   *
   * Qui non nasce nessun `unlivedFraction`, e non e' una dimenticanza: **la
   * dichiarazione dell'incompletezza non e' una misura sull'asse.** Con il
   * budget la regione vuota funziona perche' la rotaia e' **denaro**, e il tempo
   * si converte in denaro passando per il maturato. Senza budget quella
   * conversione **non esiste**: l'asse e' denaro e basta. Disegnare "mancano
   * quattro giorni" come una lunghezza li' significherebbe **inventare un valore
   * in euro per il tempo che resta** — una proiezione, cioe' un'affermazione sul
   * futuro che i dati non sostengono, sulla schermata che guarda il passato.
   * Sarebbe il difetto della fase riparato con un difetto della stessa famiglia,
   * ed e' la stessa ragione per cui `.stat__unlived` e' durato un giorno solo
   * (vedi `BudgetTrack.accruedFraction` e `BudgetMetrics.daysLived`).
   *
   * **Come i due numeri si dichiarino a schermo** — un bordo aperto, un'etichetta
   * — lo decide il componente, che ha il dizionario. Nessuna delle due cose e'
   * una frazione, e nessuna delle due sta su questo asse.
   *
   * ## Non si ricalcolano
   *
   * Vengono dalle `BudgetMetrics` **della riga**, gia' calcolate per avere
   * `cents` e la traccia: sono esposti, non computati una seconda volta. Una
   * seconda aritmetica sui giorni sarebbe una copia da tenere allineata con
   * `periodRange`, e si scoprirebbe sbagliata sul **mese** — dove `daysTotal`
   * vale 28, 29, 30 o 31 e non una costante.
   */
  readonly daysLived: number
  /** Quanti giorni ha il periodo. Vedi `daysLived`, che porta l'argomento dei due. */
  readonly daysTotal: number
}

/**
 * Le due cifre in testa (C).
 *
 * ## Le fisse sono **due** quantita', ed erano un nome solo
 *
 * `fixedMonthlyCents` e' una **proiezione**: quanto costeranno al mese le regole
 * in vigore, da qui in avanti. Le fisse **davvero uscite nel periodo** sono un
 * fatto retrospettivo, e sono un'altra cosa. Il difetto misurato, quando si
 * chiamavano tutte e due "fisse": disattivando la regola dell'affitto **dopo**
 * che ha generato la spesa, la scheda spariva — `monthlyFixedCosts` conta solo
 * le regole attive — mentre A continuava a mostrare 507,00 € di fisse uscite. E
 * disattivare e' **quello che l'app consiglia**: `toast.ruleInUse` dice *"si
 * puo' solo disattivare"*.
 *
 * **Il difetto non era che la scheda sparisse**: era che sparendo contraddiceva
 * una riga che diceva "fisse" con la stessa parola. Dati due nomi diversi, oggi
 * in quel caso la scheda tace ed e' la cosa giusta — l'argomento per esteso sta
 * su `hasFixed`.
 *
 * ## Il fatto retrospettivo non e' un campo di qui, ed e' la stessa decisione
 *
 * Ha vissuto un giorno come `fixedInPeriodCents`, ed e' stato tolto: il
 * componente quel numero lo prende da `BreakdownSection.totalCents` della parte
 * fisse, che e' dove ha un **invariante** — e' la somma delle righe che gli
 * stanno sotto — mentre qui sarebbe stato lo stesso numero con un secondo nome,
 * senza chiamanti, tenuto vivo dai propri test. E' il precedente di
 * `expensesInRange` e `planBudgetChange`, applicato una terza volta, e la
 * condizione qui e' scritta e non citata: la separazione serviva a rendere
 * **inesprimibile** la confusione fra proiezione e fatto, e due nomi diversi in
 * due tipi diversi la rendono inesprimibile esattamente quanto due campi nello
 * stesso tipo — con un numero in meno da tenere allineato.
 *
 * Chi cerca il totale delle fisse del periodo lo trova in un posto solo, e li'
 * viene dalle metriche e spiega le righe che sono a schermo.
 */
export interface StatsTiles {
  /** Il tasso mensile delle regole in vigore oggi. **Al mese**, non del periodo. */
  readonly fixedMonthlyCents: Cents
  /**
   * **C'e' un tasso mensile da annunciare**, cioe' `fixedMonthlyCents > 0`.
   *
   * E' la condizione della cifra che la scheda mostra, e nient'altro: la scheda
   * *e'* quel numero, quindi dove il numero e' zero la scheda non ha niente da
   * dire.
   *
   * ## Ha avuto un secondo disgiunto per un giorno, e la sua ragione e' scaduta
   *
   * Era `|| c'e' una sezione di fisse in A`, aggiunto per un difetto vero:
   * disattivando la regola **dopo** che ha generato la spesa — cioe' facendo
   * quello che l'app stessa consiglia (`toast.ruleInUse`) — la scheda spariva
   * mentre A mostrava 507,00 € di fisse uscite. Ma quel difetto era una
   * **contraddizione fra due etichette uguali**: `Spese fisse / 0,00 € / ogni
   * mese` sopra `Spese fisse 620,00 €`.
   *
   * E' stato riparato una seconda volta e meglio, **dando alla parte di A
   * un'etichetta propria** (`stats.fixedInPeriod`, "Fisse in questo periodo").
   * Con due nomi distinti la scheda non contraddice piu' niente stando via: A
   * dice cos'e' uscito nel periodo, e nessuno afferma che un tasso mensile
   * esista.
   *
   * Restandoci, il disgiunto produceva invece un'affermazione **nuova**, e
   * misurata: `Spese fisse / 0,00 € / ogni mese` in cifre grandi sopra `Fisse in
   * questo periodo 900,00 €`. Uno zero in corpo grande non e' un'informazione
   * prudente, e' una risposta a una domanda che nessuno ha fatto.
   *
   * Resta falso anche nel caso degenere della ricorrente da **zero centesimi**,
   * che produce una sezione di fisse con una riga sola: li' la scheda tace e
   * sotto `Fisse in questo periodo` c'e' una riga che dice `0,00 €` — il totale
   * di parte non c'e', perche' con una riga sola sarebbe la stessa cifra due
   * volte (vedi `BreakdownSection`). Le due cose non si contraddicono: sono un
   * silenzio e un fatto, non due fatti diversi.
   *
   * E' la stessa ragione per cui `hero.fixed` tace: annunciare dove non c'e'
   * niente da annunciare insegna a non leggere l'annuncio.
   */
  readonly hasFixed: boolean
}

/** Quale delle due nature conta una sezione di A. Il titolo lo scrive il componente. */
export type BreakdownKind = 'fixed' | 'variable'

/**
 * Cio' che una sezione di A ha **sempre**: una natura e delle righe. Il totale
 * no — vive nel ramo a piu' righe, qui sotto.
 *
 * **La scala non c'e' mai stata come campo, e adesso non c'e' nemmeno come
 * fatto**: e' di A (`CategorySlice.fraction`). E **`asChart` e' salito su
 * `Breakdown`**, perche' la soglia si applica all'insieme delle righe visibili —
 * l'argomento sta su `BREAKDOWN_MIN_ROWS`, e la misura che l'ha spostato in cima
 * al file.
 *
 * Ne resta una natura sola, e il tipo resta lo stesso perche' e' cio' che
 * impedisce a `kind` di essere scritto due volte in due rami dell'unione qui
 * sotto — dove niente garantirebbe che siano lo stesso campo.
 */
interface SectionShape {
  readonly kind: BreakdownKind
}

/**
 * Una sezione di A: una natura, una scala, e — **solo se le righe sono piu' di
 * una** — un totale.
 *
 * ## Perche' il totale non c'e' sempre
 *
 * L'invariante che giustifica quella cifra — *"e' sempre la somma delle righe;
 * un totale che le sue righe non spiegano e' un fatto che l'utente non puo'
 * verificare"* — con **una riga sola e' vacuo**, e cio' che resta a schermo e' la
 * stessa stringa due volte, incolonnata sullo stesso bordo destro: misurato,
 * `Fisse in questo periodo 900,00 €` e ventotto pixel sotto `Casa 900,00 €`. La
 * cifra ripetuta e' la metrica con cui questo progetto ha gia' trovato due
 * difetti, e la parte fisse con una regola sola non e' un caso limite: **e' il
 * canone**, cioe' quello che ADR 016 da' per scontato.
 *
 * Cosa serviva quel numero lo dice la sua ragione: **confrontare fisse e
 * variabili fra loro**, che e' l'unica cosa che le due cifre di C non possono
 * fare (una e' al mese). Con una riga quel confronto lo fa gia' la riga.
 *
 * ## Ed e' un'unione, non un `totalCents: Cents | null`
 *
 * Un `null` si interpreta a occhio, e chi disegna puo' scrivere
 * `money(total ?? 0)` senza che niente cada — cioe' rimettere lo `0,00 €` sotto
 * il titolo. Qui `totalCents` **non esiste** sul ramo a una riga: disegnare un
 * totale che non serve e' un errore di compilazione. Ed e' la stessa forma con
 * cui il ramo a una riga dichiara di averne davvero una sola — `readonly
 * [CategorySlice]` — cosi' `single` non e' un campo che si puo' scrivere in
 * disaccordo con le righe che gli stanno accanto.
 */
export type BreakdownSection = SectionShape &
  (
    | {
        readonly single: true
        /** L'unica riga. E' anche il totale, ed e' per questo che il totale non c'e'. */
        readonly rows: readonly [CategorySlice]
      }
    | {
        readonly single: false
        /**
         * Dalla piu' grande. `rows[0]` e' la riga piu' grande **di questa
         * sezione**, e non porta piu' nessuna scala: la sua `fraction` vale 1
         * solo se e' anche la piu' grande di A. In una schermata con le fisse
         * accese vale 1 in **una** sezione sola, ed e' cosi' che la geometria
         * dichiara che la scala e' una.
         */
        readonly rows: readonly CategorySlice[]
        /**
         * Quanto e' uscito in questa sezione **nel periodo**. Viene dalle
         * metriche gia' calcolate (`recurringSpentCents` per le fisse,
         * `spentCents` per le variabili) e **non** da una seconda somma sulle
         * spese: due espressioni per lo stesso numero sono una copia da tenere
         * allineata, e la copia si scopre sbagliata il giorno in cui uno solo
         * dei due filtri cambia.
         *
         * **Ed e' sempre la somma delle righe**, orfane comprese: e'
         * l'invariante che permette al componente di scrivere il totale sopra
         * un elenco che quella cifra la spiega.
         *
         * Le due sezioni sono **entrambe del periodo**, quindi i due totali si
         * possono confrontare fra loro — cosa che le due cifre di C non
         * permettono, perche' una e' al mese.
         */
        readonly totalCents: Cents
      }
  )

/**
 * La proporzione fra le due nature del periodo: **il fatto dominante di A,
 * portato da un numero invece che da una lunghezza** (decisione 0b).
 *
 * ## Perche' esiste
 *
 * Due terzi di un periodo sono l'affitto, e finora non c'era **nessun posto**
 * della schermata in cui quel fatto fosse scritto. Lo portava — male — la barra
 * piu' lunga di A: male perche' una barra fra sette risponde a "quale voce e' la
 * piu' grossa", non a "come si spartisce il totale", e perche' per non fargli
 * schiacciare le altre sei erano nate due scale, cioe' due unita' di misura sulla
 * stessa schermata. Portandolo qui, A torna a rispondere alla propria domanda con
 * una scala sola.
 *
 * ## Le due meta' sono **un** numero, non due che devono accordarsi
 *
 * `fixedFraction` sta in `[0, 1]` e l'altra meta' e' `1 - fixedFraction`: due
 * frazioni scritte accanto sono uno stato che si puo' scrivere in disaccordo, e
 * un grafico a due segmenti che non chiude a 1 e' un difetto che si vede solo su
 * certi dati.
 *
 * ## `null` quando una delle due meta' e' zero
 *
 * **La divisione di una cosa sola non e' una divisione.** Con zero fisse la
 * ciambella sarebbe un cerchio pieno con una legenda a due voci di cui una a
 * `0,00 €`, cioe' un'affermazione — *"ecco come si divide"* — dove non c'e'
 * niente da dividere. E' la stessa forma per cui la sezione con una riga sola non
 * porta un totale, e per cui `hasFixed` tace dove il tasso e' zero: **annunciare
 * dove non c'e' niente da annunciare insegna a non leggere l'annuncio.**
 *
 * ## I due importi sono gli stessi delle due sezioni, e la cosa va detta
 *
 * `fixedCents` e `variableCents` vengono dalle **stesse** metriche da cui viene
 * `BreakdownSection.totalCents` (`recurringSpentCents` e `spentCents`), quindi
 * non possono divergere — non e' una copia da tenere allineata, e' lo stesso
 * numero letto una seconda volta.
 *
 * Ma **se il componente scrive tutti e due**, la stessa cifra compare due volte
 * sulla stessa schermata: accanto alla barra divisa e sopra la sezione. E' la
 * metrica con cui questo progetto ha gia' trovato tre difetti, e qui non e' un
 * difetto **del modello** — e' una decisione di chi dipinge, nominata qui perche'
 * si veda prima dello schermo e non dopo. Il modello non ha modo di prenderla:
 * con le fisse spente la sezione non c'e' e il totale nemmeno, quindi togliere il
 * campo lascerebbe senza numero proprio il caso in cui serve.
 */
export interface BreakdownSplit {
  /** Le ricorrenti uscite nel periodo. `> 0`, o questo oggetto non esiste. */
  readonly fixedCents: Cents
  /** Le quotidiane del periodo. `> 0`, o questo oggetto non esiste. */
  readonly variableCents: Cents
  /**
   * Quota delle fisse sul totale del periodo, in `(0, 1)`. L'altra meta' si
   * ricava, e per questo non si scrive.
   */
  readonly fixedFraction: number
}

export interface Breakdown {
  /**
   * Le sezioni con almeno una riga, nell'ordine: fisse, poi variabili.
   *
   * **Un elenco, e non due campi**, cosi' che il componente le disegni senza
   * sapere quante sono: senza fisse ne resta una sola, e senza niente nel
   * periodo l'elenco e' vuoto — nessuno dei due e' un ramo in piu' da scrivere
   * a mano.
   *
   * Un elenco vuoto arriva a schermo **solo se B ha delle righe**: e' il caso
   * di chi questa settimana non ha ancora speso niente, e la risposta e' nel
   * confronto con le settimane prima. Se sono vuote tutte e due la vista non e'
   * `ready` affatto (`StatsView`, ramo `outside`).
   *
   * **L'ordine e' fisso e non dipende dagli importi.** Fisse e variabili sono
   * una distinzione di natura, non una classifica: una schermata che riordina le
   * proprie sezioni a seconda del mese fa cercare due volte la stessa riga. E'
   * la stessa ragione per cui la griglia delle categorie non si riordina mai.
   *
   * **Con `StatsInput.showFixed` a `false` la sezione delle fisse non c'e'.**
   * Non e' lo stesso vuoto di "nessuna fissa nel periodo" — quello e' un fatto
   * sui dati, questo e' una scelta di lettura — e la differenza si vede in due
   * posti: `split` resta — dice cosa si sta nascondendo, ed e' l'argomento di
   * ADR 016 §2, *"un'esclusione taciuta e' un numero che mente per omissione"*,
   * che nella sua ragione non nomina la Home — e lo stato `outside` non arriva
   * mai per questa via (vedi `statsView`).
   */
  readonly sections: readonly BreakdownSection[]
  /**
   * **A e' un grafico, oppure e' un elenco di righe** — nome e importo, senza
   * barre — e la decisione e' presa **sull'insieme delle righe visibili**, non
   * per sezione.
   *
   * La soglia e' `BREAKDOWN_MIN_ROWS` e porta il proprio argomento; qui sta il
   * campo, e sta su `Breakdown` e non su `BreakdownSection` perche' e' li' che
   * era la causa misurata del difetto piu' grosso della fase: due righe di fisse
   * sotto soglia restavano senza barra mentre valevano 530,00 € su 642,00 €.
   *
   * "Visibili" comprende il selettore: spegnendo le fisse restano solo le
   * quotidiane, e se sono meno di tre A smette di essere un grafico. E' la stessa
   * regola, applicata a cio' che c'e' a schermo — l'unica cosa di cui la soglia
   * ha mai parlato.
   *
   * **Ha due valori veri, in B no**: A sotto soglia esiste lo stesso — nome e
   * importo si leggono senza barra — mentre B sotto la propria soglia non esiste
   * affatto, e infatti `Trend` un campo cosi' non ce l'ha.
   */
  readonly asChart: boolean
  /**
   * La proporzione fisse/quotidiane del periodo, o `null` dove non c'e' niente
   * da dividere. L'argomento sta su `BreakdownSplit`.
   *
   * **Non dipende da `showFixed`**: e' cio' che dice all'utente *cosa* sta
   * nascondendo. Nasconderlo insieme alle righe sarebbe ADR 016 §1 dalla porta di
   * servizio — 530,00 € che spariscono dallo schermo senza lasciare traccia —
   * cioe' esattamente il difetto che il selettore ha il divieto esplicito di
   * reintrodurre.
   */
  readonly split: BreakdownSplit | null
}

/**
 * B, e **non ha un `asChart`**: `TREND_MIN_ROWS` decide se la sezione esiste,
 * quindi ogni `rows` non vuota e' un grafico e il campo varrebbe sempre `true`.
 *
 * `rows` vuota vuol dire **la sezione non c'e'**, e i modi sono tre: non ci sono
 * ancora due periodi da confrontare, non ce n'e' nessuno, oppure ce ne sono e
 * **non hanno niente da confrontare** — ogni riga della finestra vale zero,
 * perche' cio' che B conta e' tutto piu' vecchio della finestra. L'ultimo e' il
 * caso di chi torna dopo mesi, e l'argomento sta accanto alla condizione in
 * `statsView`.
 */
export interface Trend {
  readonly rows: readonly PeriodBar[]
}

export type StatsView =
  | {
      /** Nessuna spesa viva, mai. Non "poche": nessuna. */
      readonly kind: 'blank'
    }
  | {
      /**
       * **Ci sono spese vive, e nessuna cade dove questa schermata guarda**:
       * A non ha nessuna sezione (niente nel periodo corrente) e B non ha
       * nessuna riga (niente che B conti nella sua finestra).
       *
       * ## Perche' e' uno stato e non due vuoti che il componente somma
       *
       * Perche' altrimenti e' uno stato **dedotto da due valori** invece che
       * dichiarato — la malattia che questo file ha gia' chiuso due volte — e
       * finche' e' stato dedotto non l'ha disegnato nessuno. Misurato: unica
       * spesa viva datata oltre la fine del periodo corrente, `expenses.length
       * > 0` quindi nemmeno `blank`, e cio' che restava a schermo era per
       * intero `Quotidiane · 0,00 € · 17–23 ago`, una scheda alta 109 px e 400
       * px di niente, senza una parola.
       *
       * ## Chi ci arriva davvero
       *
       * Il commento che stava sul ramo diceva *"succede a chi segna in avanti
       * un pagamento"*, e nominava **un produttore che non esiste**: `AddSheet`
       * limita il selettore della data a `max={day}`, `updateExpense` dalla UI
       * riscrive solo `amountCents`, e la materializzazione si ferma a `today`
       * (`materializationWindow`). Nessuna schermata scrive una spesa futura.
       * Gli scrittori veri di quel caso sono due, e sono entrambi fuori
       * dall'app:
       *
       * - `parseBackup`, cioe' l'import di un backup scritto altrove;
       * - **l'orologio del dispositivo che torna indietro** — fuso, data
       *   sbagliata, cambio a mano: le spese di ieri diventano future senza che
       *   nessuno le abbia scritte, perche' `input.day` viene dal telefono.
       *
       * Ma i casi che contano oggi sono altri due, ed e' per quelli che questo
       * ramo si vede davvero:
       *
       * - da quando la finestra di B si apre sulla prima spesa **che B conta**,
       *   chi ha appena acceso la regola dell'affitto a ritroso e non ha ancora
       *   segnato niente a mano ci atterra dritto — lo stato di chi ha appena
       *   finito la configurazione;
       * - **chi torna dopo mesi**: le spese ci sono, ma sono tutte piu' vecchie
       *   della finestra di B. Misurato a 390x844 con tre spese manuali (40,00 ·
       *   25,00 · 12,00) datate 200, 210 e 220 giorni fa, cioe' l'Erasmus che
       *   riapre l'app dopo la pausa estiva. Prima che la finestra si svuotasse
       *   anche per valore, quella schermata era otto barre a zero sotto
       *   `SETTIMANA PER SETTIMANA` e **nove** occorrenze di `0,00 €`, mentre i
       *   77,00 € a disco non comparivano da nessuna parte.
       *
       * ## Non porta **importi**, e porta il confine del periodo
       *
       * Le due cifre **del periodo** sono zero per costruzione: se `spentCents`
       * fosse > 0 ci sarebbe una riga variabile in A, e la sezione esisterebbe.
       * L'unica che potrebbe non esserlo e' la proiezione mensile delle regole
       * — cioe' il canone — e qui non entra: **il canone si vede in A quando
       * cade nel periodo corrente, e fuori appartiene allo Storico e alle Spese
       * fisse**. Una schermata che lo tirasse dentro per non restare vuota
       * risponderebbe con un tasso mensile a una domanda sul periodo.
       *
       * Qui c'era scritto *"non porta numeri"*, e la difesa era circolare: il
       * ramo non portava `range` perche' qualcuno aveva scelto di non
       * mettercelo, non perche' un confine non esistesse. **Le due cose sono
       * diverse.** Cio' che non si scrive e' un **importo**, per l'argomento
       * qui sopra; il **confine del periodo** e' invece cio' che rende
       * verificabile l'unica affermazione che questo ramo fa.
       *
       * Misurato: affitto datato l'11 agosto, oggi il 19, periodo settimanale —
       * il testo di **tutta la pagina** non conteneva una sola data. L'utente ha
       * pagato otto giorni fa, legge che non cade "in questo periodo", e sullo
       * schermo non c'e' niente che dica che il periodo comincia il 17. Ogni
       * altro stato stampa `periodRangeLabel`: l'unico che parla del confine era
       * l'unico che non lo disegnava, cioe' *"nessun messaggio afferma un fatto
       * che l'utente non puo' verificare"* nella forma senza cifre che quella
       * regola dichiara di coprire.
       *
       * Le parole le mette il componente, che ha il dizionario: qui c'e' il
       * fatto, cioe' che non c'e' ancora niente da confrontare, e il periodo di
       * cui il fatto parla.
       */
      readonly kind: 'outside'
      /** Serve al componente per scegliere la forma dell'etichetta, non per contare. */
      readonly period: BudgetPeriod
      /** Il periodo corrente: **il confine di cui parla la frase di questo ramo.** */
      readonly range: PeriodRange
    }
  | {
      readonly kind: 'ready'
      readonly period: BudgetPeriod
      readonly current: BudgetMetrics
      readonly tiles: StatsTiles
      readonly byCategory: Breakdown
      readonly byPeriod: Trend
    }

export interface StatsInput {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly rules: readonly RecurringRule[]
  readonly budgets: readonly Budget[]
  readonly period: BudgetPeriod
  readonly day: IsoDate
  /**
   * **Le fisse si vedono in A** (decisione 0c). Il valore che l'app passa
   * all'apertura e' `true`: partire da `false` nasconderebbe 530,00 € dietro un
   * controllo, che e' ADR 016 §1 dalla porta di servizio.
   *
   * ## Perche' e' un ingresso del modello e non stato del componente
   *
   * Perche' non toglie righe: **ricalcola la scala.** Le lunghezze di A sono
   * frazioni del massimo fra le righe visibili, quindi nascondere l'affitto
   * riapre le sei righe che stavano in dieci pixel — ed e' l'unica cosa che il
   * selettore fa di utile. Un filtro applicato in `Stats.tsx` a un modello gia'
   * calcolato lascerebbe quelle sei righe **esattamente dov'erano**: un
   * interruttore che accorcia l'elenco e non risponde a nessuna domanda.
   *
   * ## Non tocca B, e la ragione e' geometrica
   *
   * `byPeriod` non lo guarda. B **e'** il confronto col budget, e il budget le
   * fisse le esclude: una barra che comprendesse l'affitto contro una traccia che
   * non lo comprende metterebbe due unita' di misura sullo stesso asse. Non c'e'
   * niente da accendere di la', quindi non c'e' nessun ramo — e questa riga
   * esiste perche' chi legge il campo non vada a cercarlo.
   */
  readonly showFixed: boolean
}

/**
 * Una riga di A mentre si accumula: l'identita', che non cambia piu', e il
 * contatore. La frazione non c'e' perche' si calcola quando la scala e' nota,
 * cioe' — da quando la scala e' una sola — dopo l'ultima spesa di **tutte** le
 * sezioni visibili, non dopo l'ultima della propria.
 *
 * L'identita' e' **la stessa** `SliceIdentity` della riga finita, non una copia
 * dei suoi campi: un membro aggiunto la' non puo' restare indietro qui.
 */
type Tally = SliceIdentity & { cents: Cents }

/** Vive = non cancellate. Le lapidi non sono spese, e nessun grafico le conta. */
function alive(expenses: readonly Expense[]): readonly Expense[] {
  return expenses.filter((expense) => expense.deletedAt === undefined)
}

/**
 * Gli `TREND_PERIODS` periodi che finiscono con quello di oggi, dal piu' vecchio
 * al piu' recente.
 *
 * Si cammina all'indietro da `range.start - 1`, che appartiene per costruzione al
 * periodo precedente — vale per la settimana come per il mese, e per i mesi di
 * lunghezza diversa, perche' e' `periodRange` a decidere i confini e non
 * un'aritmetica sui giorni.
 */
export function trendRanges(period: BudgetPeriod, day: IsoDate): readonly PeriodRange[] {
  const ranges: PeriodRange[] = []
  let cursor = day
  for (let i = 0; i < TREND_PERIODS; i += 1) {
    const range = periodRange(period, cursor)
    ranges.unshift(range)
    cursor = addDays(range.start, -1)
  }
  return ranges
}

/** Quota grezza di `value` su `scale`, con `scale === 0` che non divide per zero. */
function share(value: Cents, scale: Cents): number {
  return scale <= 0 ? 0 : value / scale
}

/**
 * La lunghezza disegnata di una quota 0..1: **zero resta zero, tutto il resto
 * parte dal pavimento**. L'argomento per esteso sta su `BAR_MIN_FRACTION`.
 *
 * Ci passa **ogni** lunghezza che questo modulo emette — le barre di A, quelle
 * di B, la traccia e il maturato — e non e' uniformita' per gusto: una lunghezza
 * mappata accanto a una non mappata sarebbe un confronto falsato di `MIN` sulla
 * riga, cioe' una barra che supera la propria traccia stando esattamente sul
 * budget. Le tre lunghezze di una riga di B stanno nella stessa mappa, quindi
 * l'ordine fra loro e' quello degli importi, esattamente.
 */
function barLength(quota: number): number {
  return quota <= 0 ? 0 : BAR_MIN_FRACTION + (1 - BAR_MIN_FRACTION) * quota
}

/**
 * Le righe di una sezione **prima che la scala esista**: aggregate per
 * categoria e ordinate. La frazione non c'e' perche' la scala non e' nota — e
 * adesso non lo e' finche' non si sono viste **tutte** le righe visibili di A,
 * non solo quelle di questa sezione. E' l'unica differenza strutturale che la
 * scala unica ha prodotto in questo file: prima una sezione si finiva da sola,
 * adesso passa da due tempi.
 *
 * Elenco vuoto quando non c'e' nessuna riga: una sezione senza righe non e' una
 * sezione da dipingere vuota, e' una sezione che non c'e' — senza fisse la
 * schermata ne mostra una sola, e non un titolo sopra il nulla.
 */
function tallyRows(
  expenses: readonly Expense[],
  named: ReadonlyMap<string, Category>,
): readonly Tally[] {
  // La chiave `null` e' il secchio delle orfane: un `categoryId` vero non e' mai
  // `null`, quindi non serve una stringa magica che un giorno collidera' con un
  // id vero. E' per sezione, quindi le orfane fisse e quelle manuali restano due
  // righe: sono due fatti diversi, e fonderle rimetterebbe insieme le due nature
  // che le sezioni dividono.
  const tallies = new Map<string | null, Tally>()
  for (const expense of expenses) {
    const category = named.get(expense.categoryId)
    // Una spesa la cui categoria non esiste piu' — `parseBackup` le importa di
    // proposito, quindi lo stato esiste — non ha un nome ne' un colore da
    // mostrare, e non se ne inventa uno qui. Confluisce in una riga sola, con la
    // stessa geometria delle altre: la sezione dichiara un totale, e un totale
    // che le sue righe non spiegano e' un numero che l'utente non puo'
    // verificare.
    const key = category === undefined ? null : expense.categoryId
    const tally: Tally =
      tallies.get(key) ??
      (category === undefined
        ? { orphan: true, categoryId: null, name: null, color: null, cents: 0 }
        : {
            orphan: false,
            categoryId: expense.categoryId,
            name: category.name,
            color: category.color,
            cents: 0,
          })
    tally.cents += expense.amountCents
    tallies.set(key, tally)
  }

  const slices = [...tallies.values()]
  // Dalla piu' grande: la domanda e' "dove sono finiti i soldi", e la risposta si
  // legge dall'alto. **Non** per ordine di griglia, che serve al pollice in cassa.
  // L'aggregato delle orfane sta in mezzo alle altre per importo, non in fondo
  // per convenzione: se quei soldi sono i piu' grossi, sono la risposta.
  // A pari importo il pareggio si scioglie sul nome, e la riga che un nome non
  // ce l'ha sta in fondo al pareggio — un ordine qualunque, ma sempre lo stesso.
  slices.sort(
    (a, b) =>
      b.cents - a.cents ||
      Number(a.orphan) - Number(b.orphan) ||
      (a.name ?? '').localeCompare(b.name ?? ''),
  )
  return slices
}

/** Una sezione prima della scala: cio' che serve per finirla quando la scala c'e'. */
interface SectionSource {
  readonly kind: BreakdownKind
  readonly tallies: readonly Tally[]
  readonly totalCents: Cents
}

/**
 * Una sezione finita: le stesse righe, messe in scala su un numero che **arriva
 * da fuori**. Che sia il massimo di A e non il proprio e' precisamente cio' che
 * questa funzione non decide piu'.
 *
 * Con `tallies` vuoto uscirebbe una sezione a zero righe, che romperebbe
 * `single === (rows.length === 1)`. **Non e' una dichiarazione di
 * irraggiungibilita' a parole**: il chiamante e' uno solo — `statsView` — e
 * `shown` e' un sottoinsieme di `present`, che e' `parts` filtrato proprio su
 * `tallies.length > 0`. Chi aggiungesse un secondo chiamante legge questa riga
 * insieme alla firma.
 */
function sectionOf(source: SectionSource, scale: Cents): BreakdownSection {
  const rows = source.tallies.map((t) => ({ ...t, fraction: barLength(share(t.cents, scale)) }))
  // Con una riga sola il totale **non esiste**: sarebbe la stessa cifra della
  // riga, scritta due volte sullo stesso bordo destro. L'argomento per esteso
  // sta su `BreakdownSection`.
  const only = rows[0]
  if (rows.length === 1 && only !== undefined) {
    return { kind: source.kind, single: true, rows: [only] }
  }
  return { kind: source.kind, single: false, rows, totalCents: source.totalCents }
}

/**
 * La proporzione fra le due nature, o `null` dove non c'e' niente da dividere.
 *
 * I due importi arrivano dalle **metriche**, cioe' dalla stessa sorgente dei
 * totali di sezione: non e' una seconda somma sulle spese, ed e' per questo che
 * `split.fixedCents` e il totale della sezione fisse non possono divergere.
 *
 * `<= 0` e non `=== 0`: lo zero e' il caso vero — un periodo senza fisse, che e'
 * la prima settimana di chiunque — e il confronto largo copre anche un totale
 * negativo **senza dover dichiarare che nessuno lo scrive**. Una dichiarazione
 * cosi' varrebbe solo enumerando ogni scrittore di `amountCents`, e qui la difesa
 * costa un carattere: sopra un totale negativo `fixedFraction` uscirebbe fuori da
 * `[0, 1]`, cioe' due segmenti che non chiudono.
 */
function breakdownSplit(fixedCents: Cents, variableCents: Cents): BreakdownSplit | null {
  if (fixedCents <= 0 || variableCents <= 0) return null
  return { fixedCents, variableCents, fixedFraction: fixedCents / (fixedCents + variableCents) }
}

export function statsView(input: StatsInput): StatsView {
  const expenses = alive(input.expenses)
  if (expenses.length === 0) return { kind: 'blank' }

  const metricsOf = (onDate: IsoDate): BudgetMetrics =>
    computeBudgetMetrics({
      expenses,
      budgets: input.budgets,
      period: input.period,
      onDate,
      today: input.day,
    })

  const current = metricsOf(input.day)
  const named = new Map(input.categories.map((c) => [c.id, c]))

  /* --- A: due sezioni, una scala ------------------------------------------ */

  // **Tutte** le spese vive del periodo, ricorrenti comprese: ADR 016 §1 dice
  // che a escluderle e' *solo* il budget. Il filtro che c'era qui faceva
  // leggere **0,00 €** a una settimana con 900 € di affitto, sotto un titolo
  // che chiede dove sono finiti i soldi — e citava ADR 016 per farlo.
  const inPeriod = expenses.filter(
    (e) => !isBefore(e.date, current.range.start) && !isBefore(current.range.end, e.date),
  )

  // Il taglio e' `source`, cioe' **la stessa condizione** con cui il budget
  // decide chi conta (`countsTowardBudget`): e' per questo che i totali delle
  // due sezioni possono venire dalle metriche invece che da una seconda somma.
  // Se qui si filtrasse per qualcos'altro, i totali smetterebbero di essere la
  // somma delle righe e nessuno se ne accorgerebbe finche' non se ne accorge un
  // utente.
  const parts: readonly SectionSource[] = [
    {
      kind: 'fixed',
      tallies: tallyRows(
        inPeriod.filter((e) => e.source === 'recurring'),
        named,
      ),
      totalCents: current.recurringSpentCents,
    },
    {
      kind: 'variable',
      tallies: tallyRows(
        inPeriod.filter((e) => e.source !== 'recurring'),
        named,
      ),
      totalCents: current.spentCents,
    },
  ]
  // Una sezione senza righe non c'e'. E' un fatto **sui dati**, e resta separato
  // dal selettore qui sotto, che e' una scelta di lettura: `present` e' cio' che
  // il periodo contiene, `shown` e' cio' che si guarda. Confonderli e' il modo in
  // cui il selettore diventerebbe un vicolo cieco — vedi `outside`, sotto.
  const present = parts.filter((part) => part.tallies.length > 0)
  const shown = present.filter((part) => input.showFixed || part.kind !== 'fixed')

  // **La scala unica di A**: il massimo fra tutte le righe **visibili**, non fra
  // quelle di una sezione. Le sezioni raggruppano e ordinano; l'unita' di misura
  // e' una, e con `showFixed` a `false` si ricalcola sulle sole quotidiane — che
  // e' l'unica cosa utile che il selettore fa, e la ragione per cui non e' un
  // filtro in `Stats.tsx`. Con tutte le righe a zero la scala e' zero e restano
  // tutte a zero: dipingere una barra piena per zero euro sarebbe la scala a dire
  // una cosa che i dati non dicono.
  const scale = shown.reduce(
    (max, part) => part.tallies.reduce((m, t) => Math.max(m, t.cents), max),
    0,
  )

  const byCategory: Breakdown = {
    sections: shown.map((part) => sectionOf(part, scale)),
    // La soglia conta le righe **a schermo**, tutte insieme: applicata per
    // sezione lasciava senza barre la meta' che pesava 530,00 € su 642,00 €.
    // L'argomento sta su `BREAKDOWN_MIN_ROWS`, la tabella misurata in cima al
    // file.
    asChart: shown.reduce((n, part) => n + part.tallies.length, 0) >= BREAKDOWN_MIN_ROWS,
    // **Dalle metriche, e fuori dal selettore.** Fuori perche' e' cio' che dice
    // all'utente cosa sta nascondendo: sparendo con le righe, spegnere le fisse
    // toglierebbe 530,00 € dallo schermo senza lasciare traccia, che e' ADR 016
    // §1 dalla porta di servizio. Dalle metriche perche' sono gli stessi due
    // numeri dei totali di sezione, e due espressioni per lo stesso numero sono
    // una copia da tenere allineata.
    split: breakdownSplit(current.recurringSpentCents, current.spentCents),
  }

  /* --- B: i periodi ------------------------------------------------------- */

  const ranges = trendRanges(input.period, input.day)
  const perPeriod = ranges.map((range) => {
    const m = metricsOf(range.start)
    return { range, m }
  })

  // **Una scala sola per tutte le righe**, cosi' le lunghezze restano
  // confrontabili anche dove la traccia manca. Comprende i budget delle righe
  // confrontabili: altrimenti una barra sotto budget potrebbe risultare piu'
  // lunga della traccia che dovrebbe contenerla.
  const trendScale = perPeriod.reduce(
    (max, { m }) => Math.max(max, m.spentCents, m.comparableToBudget ? (m.budgetCents ?? 0) : 0),
    0,
  )

  const bars: PeriodBar[] = perPeriod.map(({ range, m }) => ({
    key: range.start,
    range,
    cents: m.spentCents,
    fraction: barLength(share(m.spentCents, trendScale)),
    current: range.start === current.range.start,
    // I due giorni vengono dalle metriche **di questa riga**, non da `current`:
    // `metricsOf(range.start)` risolve il proprio `referenceDay` dentro il
    // proprio intervallo, quindi una riga chiusa ha `daysLived === daysTotal` e
    // solo quella di oggi puo' averli diversi. Prenderli da `current` darebbe a
    // ogni settimana passata i tre settimi di mercoledi', cioe' otto periodi
    // eternamente incompleti; e sul mese darebbe a febbraio i 31 giorni di
    // agosto. Vedi `PeriodBar.daysLived`.
    daysLived: m.daysLived,
    daysTotal: m.daysTotal,
    track:
      m.comparableToBudget && m.budgetCents !== null
        ? {
            fraction: barLength(share(m.budgetCents, trendScale)),
            // Il maturato passa per la stessa mappa della barra: e' la lunghezza
            // che avrebbe una spesa pari a `budget * vissuto`, non una frazione
            // della traccia gia' disegnata. Vedi `BudgetTrack.accruedFraction`.
            accruedFraction: barLength(
              share(m.budgetCents, trendScale) * (m.daysLived / m.daysTotal),
            ),
          }
        : null,
  }))

  // I periodi prima che l'app avesse dati non si mostrano — e "prima" e' un
  // **fatto** che questo modulo possiede, non una deduzione da uno zero:
  // `input.expenses` c'e' tutto, quindi la data della prima spesa e' un dato. Il
  // taglio precedente guardava `cents > 0`, cioe' leggeva un valore ("zero
  // speso") come un fatto ("l'app non c'era"): e' l'assenza scambiata per zero,
  // girata.
  //
  // **Ma il fatto e' "quando e' stata datata la prima spesa che questa sezione
  // conta", non "da quando l'utente segna".** Ogni barra di B e' `m.spentCents`,
  // quindi il taglio passa per `countsTowardBudget` — la stessa condizione con
  // cui il budget decide chi conta e con cui, settanta righe piu' su, A divide
  // le proprie due sezioni. Guardando **tutte** le spese vive la finestra si
  // apriva su una ricorrente, cioe' su una spesa che nessuna barra di B
  // comprende: con la regola dell'affitto accesa a ritroso di 60 giorni — uno
  // dei percorsi retroattivi che il prodotto offre — e nessuna spesa a mano, la
  // schermata mostrava otto righe e otto zeri, e i 1.800,00 € di canone non
  // comparivano da nessuna parte.
  //
  // Cosi' un periodo davvero a zero **dentro** la finestra resta e vale zero,
  // che per un Erasmus col conto corto e' la riga piu' interessante della
  // schermata. E si taglia dalla testa e mai dal fondo, perche' il periodo
  // corrente e' sempre l'ultimo.
  const firstCounted = expenses.reduce<IsoDate | null>(
    (earliest, e) =>
      countsTowardBudget(e) && (earliest === null || isBefore(e.date, earliest))
        ? e.date
        : earliest,
    null,
  )
  const firstShown =
    firstCounted === null ? -1 : bars.findIndex((bar) => !isBefore(bar.range.end, firstCounted))
  // La finestra e' vuota in due casi, e sono due fatti diversi con lo stesso
  // esito: **non esiste nessuna spesa che B conti** (solo ricorrenti, che e' il
  // caso di chi ha appena acceso una regola), oppure ogni periodo della finestra
  // finisce prima della prima — cioe' quella spesa e' datata **oltre** la fine
  // del periodo corrente. Chi scrive davvero quel secondo stato e' enumerato su
  // `StatsView`, ramo `outside`: non e' nessuna schermata.
  //
  // Qui c'era `bars.slice(-1)`, con accanto *"resta la riga di oggi"*: era vero
  // finche' una riga sola era una sezione. Da quando non lo e', quel ramo
  // produceva un valore che la soglia toglieva subito dopo — cioe' un output
  // non osservabile con accanto un argomento diventato falso.
  const inWindow = firstShown === -1 ? [] : bars.slice(firstShown)

  // **La finestra ha delle righe e non ha niente da confrontare.** Il taglio
  // sulla testa risponde a "da quando l'app aveva dati che B conta", che e' una
  // domanda sulle **date**; questa risponde a "c'e' qualcosa da confrontare",
  // che e' una domanda sui **valori**. Sono due, e per un giorno c'e' stata solo
  // la prima: misurato a 390x844 con tre spese manuali datate 200, 210 e 220
  // giorni fa — l'Erasmus che riapre l'app dopo la pausa estiva — `firstCounted`
  // non e' `null`, quindi `firstShown` vale 0, quindi **otto barre tutte a
  // zero** e `0,00 €` nove volte sulla stessa schermata, con i 77,00 € a disco
  // che non comparivano da nessuna parte.
  //
  // La condizione non e' "B non ha righe" ma **"B non ha niente da
  // confrontare"**: se ogni riga della finestra vale zero, la finestra e' vuota
  // quanto un elenco vuoto, e la sezione non c'e'. E' la stessa frase che
  // `statistiche.spec.ts` asserisce da giorni sullo stato `blank` — *"nessuna
  // barra, nemmeno lunga zero: otto righe da zero sarebbero un grafico degenere
  // spacciato per schermata vuota"* — che non nomina `blank` da nessuna parte e
  // quindi vale ovunque valga il suo argomento. Non era stata cercata nel ramo
  // accanto.
  //
  // **E non e' "l'assenza scambiata per zero" rimessa dentro**, che e' il
  // difetto per cui il taglio sulla testa guarda le date: li' uno zero veniva
  // letto come il fatto "l'app non c'era" e cancellava una riga vera; qui non si
  // deduce nessun fatto sul passato, si constata che **queste** righe non
  // rispondono alla domanda della sezione. Una settimana a zero in mezzo ad
  // altre resta, e resta la piu' interessante della schermata.
  //
  // **La finestra non scorre indietro fino a dove i dati ci sono**, ed e' una
  // decisione: otto periodi di sei mesi fa non sono il *normale recente* che B
  // esiste per confrontare (vedi `TREND_PERIODS`) — sono una **storia**, che e'
  // un'altra domanda e non ha una schermata. Far scorrere la finestra
  // cambierebbe in silenzio cosa significa l'asse: le stesse otto righe
  // vorrebbero dire "gli ultimi due mesi" a chi apre l'app tutti i giorni e "gli
  // ultimi otto periodi in cui hai speso" a chi torna a settembre, senza che
  // niente sullo schermo dica quale delle due si sta leggendo.
  const comparable = inWindow.some((bar) => bar.cents > 0)
  // Sotto `TREND_MIN_ROWS` la sezione **non c'e'**: la costante porta
  // l'argomento. Non e' un elenco svuotato per comodita' — e' l'unico modo di
  // non ristampare in fondo alla schermata, sotto un titolo che promette un
  // confronto, la stessa cifra che sta in testa.
  const rows = comparable && inWindow.length >= TREND_MIN_ROWS ? inWindow : []

  /* --- Niente da mostrare, e non e' lo stato vuoto ------------------------- */

  // A senza sezioni **e** B senza righe: le spese ci sono, ma nessuna cade dove
  // questa schermata guarda. Lo stato si dichiara qui invece di lasciarlo
  // dedurre da due elenchi vuoti al componente — che infatti non lo disegnava, e
  // mostrava una scheda sola in mezzo a 400 px di niente. L'argomento e gli
  // scrittori stanno su `StatsView`.
  //
  // **Servono tutti e due i vuoti, e da quando B si svuota anche per valore la
  // congiunzione porta piu' peso di prima.** A conta tutto (ADR 016 §1), B solo
  // il variabile: un periodo con **solo l'affitto** ha una sezione in A e zero
  // righe in B, ed e' "B assente, A presente" — uno stato che esiste gia' e che
  // qui non deve entrare. `outside` vale solo quando non c'e' niente ne' di qua
  // ne' di la'.
  //
  // Il periodo si porta dietro: e' l'unica cosa che rende verificabile la frase
  // che il componente ci scrive sopra. Vedi `StatsView`, ramo `outside`.
  //
  // **Si guarda `present`, non `byCategory.sections`, e la differenza e' il
  // selettore.** Con le fisse spente e un periodo di sole fisse — la settimana in
  // cui e' uscito solo l'affitto, che ADR 016 da' per scontata — le sezioni sono
  // zero e B non ha righe: leggendo le sezioni la schermata direbbe *"niente cade
  // dove guardo"* mentre 900,00 € ci cadono eccome, e l'utente li' ha appena
  // deciso di non guardarli. Sarebbe un'affermazione falsa, e per giunta
  // **inverificabile dallo schermo** — che e' la regola per cui questa vista
  // porta il proprio `range`.
  //
  // E sarebbe peggio di una frase sbagliata: `outside` non porta ne' `split` ne'
  // sezioni, quindi il componente non avrebbe piu' niente su cui appendere il
  // selettore. **L'utente resterebbe chiuso fuori dai propri dati con l'unico
  // interruttore che li riaccende dentro il ramo che non si disegna.** Un
  // controllo che puo' cancellare se stesso non e' un controllo.
  //
  // `present` e' un fatto sul periodo e non lo tocca nessuna scelta di lettura:
  // `outside` resta cio' che dice, cioe' che li' non e' caduto niente.
  if (present.length === 0 && rows.length === 0) {
    return { kind: 'outside', period: input.period, range: current.range }
  }

  /* --- C: le due cifre in testa ------------------------------------------- */

  const fixed = monthlyFixedCosts(input.rules, input.day)
  const tiles: StatsTiles = {
    fixedMonthlyCents: fixed.totalCents,
    // Solo il tasso: la scheda **e'** quella cifra. Il disgiunto che c'era qui
    // — "oppure c'e' una sezione di fisse" — copriva una contraddizione fra due
    // etichette uguali, che non esiste piu' da quando la parte di A si chiama
    // `stats.fixedInPeriod`; e in cambio faceva stampare `0,00 € / ogni mese`
    // in cifre grandi. Vedi `StatsTiles.hasFixed`.
    hasFixed: fixed.totalCents > 0,
  }

  return {
    kind: 'ready',
    period: input.period,
    current,
    tiles,
    byCategory,
    byPeriod: { rows },
  }
}
