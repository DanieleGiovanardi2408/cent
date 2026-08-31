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
 *   ed e' *solo il budget* a escluderle), in **due sezioni, ognuna con la propria
 *   scala**: fisse e variabili. La sezione raggruppa, ordina **e misura**, e
 *   dichiara quanto vale una barra piena (`BreakdownSection.scaleCents`).
 *   Perche' due, dopo essere state una per un giorno: sotto.
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
 * ## Perche' A e' in due sezioni, e perche' ognuna ha la propria scala
 *
 * Sono due decisioni, non una: **la sezione raggruppa, la scala misura.** Per un
 * giorno sono state slegate — due sezioni su un'unita' di misura sola — e questa
 * nota esiste perche' chi arriva qui trovi l'argomento di adesso, e la ragione
 * per cui quello di prima non copriva questo caso. Senza, fra un mese qualcuno
 * rifa' il giro con le stesse buone intenzioni.
 *
 * ### L'argomento che aveva prodotto la scala unica, e dove non valeva
 *
 * Era l'anti-pattern numero uno di `dataviz`: *"mai due scale nello stesso campo
 * visivo — l'allineamento fra le due e' arbitrario, quindi il grafico inventa una
 * correlazione che nei dati non c'e'"*. E' vero, e **parla di due scale sullo
 * stesso asse di uno stesso grafico**. Due sezioni con intestazione propria,
 * colonna propria e la barra piu' lunga a fondo colonna sono un'altra forma: sono
 * **small multiples**, che la stessa disciplina raccomanda proprio quando due
 * misure hanno ordini di grandezza diversi.
 *
 * E' *"una decisione vale dove vale il suo argomento"* nel verso meno frequente —
 * non applicata troppo stretta, ma **troppo larga**: l'argomento era giusto, il
 * caso era un altro.
 *
 * ### La misura che decide, e il criterio che le da' il peso
 *
 * > **Un difetto misurato batte un difetto ipotizzato.**
 *
 * Il difetto della scala unica e' stato misurato in pagina, 390 punti, colonna
 * 195,81 px, sull'export vero del 26 agosto (periodo 24–30, 642,00 €):
 *
 *     Casa       (fisse)  507,00 €   195,81 px
 *     Spesa      (var)     42,00 €    19,42
 *     Svago      (var)     26,00 €    13,34
 *     Coffeeshop (var)     24,00 €    12,59
 *     Trasporti  (var)     23,00 €    12,22
 *     Fuori      (var)     10,00 €     7,28
 *
 * Svago e Coffeeshop distano **0,75 px**, Coffeeshop e Trasporti **0,37**. Sotto
 * il pixel non e' "difficile da confrontare": e' **identico**, cioe' l'ordine
 * sopravvive nel modello e non sullo schermo. Il difetto dell'altra forma — la
 * correlazione inventata — resta **ipotetico**, e per giunta oggi e' contraddetto
 * prima di potersi formare: la proporzione vera sta scritta **sopra** le righe
 * (`Breakdown.split`, decisione 0b), quindi chi guarda ha `530 / 112` in mano
 * prima di arrivare alle barre. E' un elemento che quando 0a fu presa **non
 * esisteva ancora**.
 *
 * ### Cio' che non torna indietro: la soglia
 *
 * Il difetto piu' grosso della fase — le fisse senza barre, 530,00 € su 642,00 €
 * e nessuna barra mentre la piu' lunga dello schermo ne valeva 42,00 — aveva
 * **una** causa, e non era la scala: era `BREAKDOWN_MIN_ROWS` applicata **per
 * sezione**, con le fisse a due righe contro un minimo di tre. Il rilievo che
 * l'aveva descritto ne nominava due, e la seconda fu riparata senza misurarla.
 *
 * Quindi la soglia resta sull'insieme delle righe visibili (`Breakdown.asChart`),
 * e la simmetria *"ogni sezione ha la propria scala, quindi il proprio minimo"*
 * **non si ricostruisce**: e' una simmetria di forma, e una delle sue due meta'
 * ha una misura contro.
 *
 * ### La condizione che rende accettabili le due scale: si dichiarano
 *
 * **Non basta che le scale siano due: devono dirsi.** Sui dati veri `Casa
 * 507,00 €` e `Spesa 42,00 €` disegnano **esattamente la stessa lunghezza**, e
 * due barre piene identiche accanto a due importi di un ordine di grandezza
 * diverso sono una bugia grafica finche' niente dice che i due fondi colonna
 * valgono cose diverse.
 *
 * La forma precedente diceva *"si dichiarano nella geometria: due barre piene con
 * due importi diversi dicono da sole che le scale sono due"*. **Non e' vero, e
 * non lo era nemmeno allora**: dice che *qualcosa* non torna, non *cosa*. E' una
 * deduzione chiesta al lettore, ed e' *"nessun messaggio afferma un fatto che
 * l'utente non puo' verificare"* nella forma senza cifre che quella regola
 * dichiara di coprire.
 *
 * Quindi ogni sezione porta `BreakdownSection.scaleCents` — quanto vale una barra
 * piena li' dentro — e la schermata lo scrive.
 *
 * ### Cosa si perde, e va detto qui perche' non lo scopra lo schermo
 *
 * **Due righe di sezioni diverse non sono confrontabili per lunghezza.** Il caso
 * concreto e' una categoria che compare in tutte e due — Trasporti 23,00 di
 * abbonamento e 10,00 di taxi: la divisione e' informativa, perche' dice quanto
 * di quella spesa e' deciso e quanto e' occasionale, e le due righe sono
 * **disegnate con la piu' piccola piu' lunga**, perche' 10,00 su una scala da
 * 42,00 batte 23,00 su una da 507,00. Con la scala unica quelle due righe erano
 * confrontabili, ed e' l'unica cosa che la scala unica dava e che qui non c'e'.
 *
 * Il compenso e' `scaleCents` in testa a ogni sezione, e **non e' pieno**: dice
 * come leggere ognuna delle due colonne, non mette le due righe sullo stesso
 * righello.
 *
 * **Sono tutti e due difetti veri, e non e' il criterio a scegliere fra loro: e'
 * la loro grandezza.** Questo costa una lettura in piu' su una coppia di righe —
 * quante sono le categorie che compaiono in tutte e due, cioe' una o due; quello
 * costava l'ordine di sei righe su sette, su ogni periodo con un affitto dentro.
 * Il criterio *"un difetto misurato batte un difetto ipotizzato"* separa invece
 * questo dalla **correlazione inventata**, che ipotizzata lo e' davvero e che
 * `split` contraddice.
 *
 * Resta vero che la frase *"l'affitto pesa quanto tutto il resto messo insieme"*
 * non si legge dalle barre. Non e' una perdita nuova, ed e' esattamente il motivo
 * per cui `Breakdown.split` esiste: quel fatto e' **un numero**, e farlo portare a
 * una lunghezza e' cio' che ha prodotto tutto questo giro.
 *
 * ### Ogni sezione porta il proprio totale
 *
 * Le due cifre di C sono in **unita' diverse** — quella variabile e' del periodo,
 * `fixedMonthlyCents` e' al mese, come impone ADR 016 §3 — quindi affiancate non
 * dicono "530,00 contro 112,00 questa settimana". Percio' ogni sezione porta il
 * proprio `totalCents`, **entrambi del periodo** e quindi confrontabili fra loro.
 *
 * **La ragione e' stata ri-derivata due volte, e questa e' la seconda.** Con la
 * scala unica diceva: *"l'occhio sul grafico confronta la riga piu' grande di qua
 * con la piu' grande di la', che e' un'altra domanda — `507,00 contro 42,00` non
 * e' `530,00 contro 112,00`"*. Con la scala per sezione **e' peggio**, non uguale:
 * quelle due righe sono due barre **piene**, quindi l'occhio che le confronta non
 * legge una domanda sbagliata, legge `507,00 = 42,00`. Il totale di sezione e'
 * l'unico posto in cui si confrontano i due **insiemi**.
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
import type { Budget, BudgetPeriod, Category, Expense, RecurringRule } from '../core/types'
import { sumCents } from '../core/money'
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
 * **Quante righe servono perche' una parte sia un grafico: tre, e la soglia e'
 * della PARTE.**
 *
 *     0 righe  -> la parte non c'e' (un fatto sui dati)
 *     1 riga   -> nome e importo. Il bar chart a una barra e' l'anti-esempio
 *                 da manuale, e il numero e' gia' scritto accanto
 *     2 righe  -> nome e importo, incolonnati a destra. Due numeri si
 *                 confrontano leggendoli
 *     3+ righe -> ciambella con leggenda, e le barre a un tap
 *
 * ## Il 31 agosto la soglia e' passata dallo schermo alla parte, e la ragione
 *
 * Contava le righe di **tutta A insieme**, con questo argomento: *"la soglia per
 * sezione era la causa misurata del difetto piu' grosso della fase — due righe
 * di fisse restavano senza barra mentre valevano 530,00 € su 642,00 €, e la
 * barra piu' lunga dello schermo ne valeva 42,00: il peso visivo inverso agli
 * importi"*.
 *
 * **Quel difetto ha ricevuto due rimedi nello stesso commit** (`118848d`): la
 * soglia sull'insieme **e** la barra divisa in cima, che dice la proporzione fra
 * le due nature. Spediti insieme, e nessuno ha verificato se ne bastasse uno.
 *
 * Ne bastava uno. La barra in cima da' alle fisse il loro peso — 530 su 954 e'
 * il 55% della striscia — **indipendentemente da quante righe abbiano**. La
 * soglia sull'insieme non aggiunge niente a quel peso, e in cambio produce il
 * difetto opposto: con due righe soltanto, `507,00 €` contro `23,00 €` sono una
 * barra piena e una briciola piu' alta che larga, che si legge come un
 * distintivo e non come una misura. La riga *"Barra intera = 507,00 €"* era la
 * confessione che quelle due barre da sole non si leggono.
 *
 * E' la stessa forma gia' vista due volte questa settimana — *una decisione vale
 * dove vale il suo argomento* — in una variante che merita il nome suo:
 * **due rimedi per un difetto, spediti insieme, e quello meno giustificato
 * sopravvive senza che nessuno lo riesamini.**
 *
 * ## Perche' una sola costante, e non due
 *
 * C'era anche `PIE_MIN_SLICES` in `Stats.tsx`, sempre 3, sempre per parte: *"sotto
 * tre voci non c'e' ciambella"*. Con la scala qui sopra le due soglie **scattano
 * nello stesso punto e dicono la stessa cosa** — *questa parte ha abbastanza
 * righe per essere un grafico* — e la ciambella e le barre sono le due viste
 * dello stesso grafico, non due grafici con due minimi. Due numeri uguali con
 * due nomi sono due posti in cui divergere.
 *
 * **Non si unifica invece con `TREND_MIN_ROWS`**, e l'argomento di allora regge
 * intatto: per B due barre **sono** il confronto, e sotto la sua soglia B non
 * c'e' affatto invece di perdere le barre. Due domande, due minimi, due effetti.
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
 * Quindi sotto soglia **B non c'e'**: `byPeriod` e' `null`. Qui c'era scritto
 * *"`Trend.rows` esce vuota"*, e il componente aveva gia' "elenco vuoto ->
 * nessuna sezione" — cioe' l'assenza era **dedotta da un valore**. Adesso e'
 * dichiarata, e per la stessa ragione per cui e' dichiarato `outside`.
 *
 * **E la soglia conta la riga di oggi**, che nell'elenco dei chiusi non sta:
 * `closed.length + 1 >= TREND_MIN_ROWS`. Due periodi sono un chiuso piu' oggi,
 * non due chiusi.
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
 * una traslazione costante, uguale per **tutte** le barre — la mappa e' la stessa
 * ovunque, anche dove le scale sono due, perche' ci passa ogni lunghezza che
 * questo modulo emette. Resta esatta la **differenza**, che e' l'altra meta' della
 * lettura, e li' la scala entra: due lunghezze **della stessa sezione**
 * differiscono di `(1 - MIN) · (differenza degli importi) / scaleCents`. Fra
 * sezioni diverse quella sottrazione non significa niente, ed e' il prezzo
 * dichiarato delle due scale (l'argomento e' in cima al file).
 *
 * E il limite: sotto una certa scala **l'ordine sopravvive nel modello e non nei
 * pixel**. 9,00 € e 7,50 € su una scala da 507,00 € distano 0,0029, cioe' **0,56
 * px** sul plot da 192,73 di un 390: diversi qui, indistinguibili li'. Allargare
 * la colonna sposta il confine e non lo toglie — e' esattamente il conto con cui
 * `--plot-min` e' passato a 7rem, e vale la pena leggerlo in Stats.css invece di
 * ricopiarlo qui.
 *
 * **La scala per sezione stringe questa zona e non la chiude**, e la differenza
 * fra i due casi e' `source`. Se l'affitto e' una **ricorrente** — il caso
 * normale, ed e' quello che ADR 016 da' per scontato — quelle due briciole cadono
 * su una scala che non lo contiene e si separano di 31,5 px, senza che l'utente
 * debba chiedere niente. Se invece l'affitto e' stato inserito **a mano** — la
 * settimana in cui si paga il deposito con la carta — cade nella stessa sezione
 * delle briciole, e li' la zona resta larga esattamente com'era: niente in questo
 * modulo la puo' chiudere, e cio' che separa quelle due righe e' l'importo scritto
 * accanto.
 *
 * (Qui c'era scritto che la via d'uscita fosse **il selettore delle fisse**. Non
 * lo era gia' allora — da quando la scala e' della sezione, spegnere le fisse non
 * cambiava di un pixel le righe rimaste — e adesso il selettore non esiste. La via
 * d'uscita vera e' che le due righe cadano in **sezioni diverse**, dove ognuna ha
 * la propria scala: e' cio' che le separa, e non richiede nessun gesto.)
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
       * **Il secondo argomento e' andato e tornato, e va detto cosi'**: diceva
       * *"per giunta sarebbe una riga che non potrebbe stare in nessuna delle due
       * scale"*, cioe' fondere le due orfane era **impossibile**. Con la scala
       * unica era scaduto — fondere era diventato possibile — e con la scala di
       * nuovo per sezione e' vero un'altra volta, perche' una riga fusa non
       * avrebbe nessun `scaleCents` a cui appartenere.
       *
       * Resta il **secondo**, e la distinzione e' cio' che impedisce al prossimo
       * giro di riaprire anche questa: se fosse il primo, la riga tornerebbe unica
       * il giorno in cui la scala cambia ancora. Sono due fatti diversi, e lo
       * sarebbero anche disegnati senza nessuna barra.
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
   * Lunghezza della barra, 0..1 sulla scala **della propria sezione**
   * (`BreakdownSection.scaleCents`): il massimo fra le righe di quella sezione,
   * non fra tutte quelle a schermo.
   *
   * Ne segue la cosa da sapere **prima** di leggerla: due frazioni di sezioni
   * diverse non si confrontano. Non e' un difetto da riparare qui — e' il costo
   * dichiarato della decisione 0a, scritto per esteso in cima al file — ed e'
   * anche il motivo per cui `scaleCents` non e' facoltativo: una lunghezza senza
   * il numero che la interpreta e' meta' di un fatto.
   *
   * **La scala e' della sezione**, e non di cio' che si sta guardando: nessuna
   * scelta di lettura la muove, perche' non ce n'e' piu' nessuna da fare.
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

/**
 * Una riga di B: un periodo.
 *
 * **Non porta piu' un `current: boolean`**, e non perche' quel fatto non serva
 * — serve, ed e' quello su cui il componente apre il bordo della riga di oggi.
 * Serve **da un'altra parte**: e' `Trend` a dire quale periodo contiene oggi,
 * tenendolo **fuori dall'elenco** invece che marcato dentro. L'argomento per
 * esteso, e cosa lo rendeva indistinguibile da `indice === ultimo`, stanno su
 * `Trend.current`.
 *
 * Ne segue che una `PeriodBar` **non sa** se e' quella corrente, ed e' voluto:
 * il fatto e' della finestra, non della riga. Chi lo volesse rimettere qui si
 * riporterebbe in casa esattamente lo stato che due gesti diversi potevano
 * scrivere in modo diverso.
 */
export interface PeriodBar {
  /** `range.start`: identita' stabile, non l'indice di riga. */
  readonly key: IsoDate
  readonly range: PeriodRange
  readonly cents: Cents
  readonly fraction: number
  readonly track: BudgetTrack | null
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
 * **`StatsTiles` non c'e' piu', ed e' uscita col suo ultimo lettore.**
 *
 * Portava `fixedMonthlyCents` (la proiezione al mese) e `hasFixed`, e li leggeva
 * una cosa sola: la riga `Spese fisse 530,00 €/mese` in testa alle Statistiche.
 * Quella riga e' caduta perche' **scriveva 530,00 € duecento pixel sopra un altro
 * 530,00 €** — la sezione delle fisse — e due volte lo stesso numero nella stessa
 * occhiata resta due volte, anche quando il suffisso distingue le unita'.
 *
 * ## Perche' togliendola ADR 016 §3 non cade
 *
 * §3 dice *"due numeri, non uno"*, e la sua **condizione** e' *"la seconda cifra ha
 * senso solo se si vede la prima"* — dove la prima e' **il budget**. Alla lettera:
 * *"accanto al budget, **in Impostazioni**"*. La casa di §3 e' `Settings.tsx`, dove
 * `<FixedCosts>` sta una riga sotto il gruppo del budget, ed e' li' che le due
 * cifre si vedono insieme.
 *
 * Nelle Statistiche **il budget non c'e'**. Quella riga citava §3 senza portarne la
 * condizione: era la meta' di una coppia, da sola, in una schermata dove l'altra
 * meta' non esiste. E' *"una riparazione che cita un argomento altrui ne riscrive
 * la condizione sul posto"* — se la condizione non si riesce a scrivere,
 * l'argomento non vale qui.
 *
 * ## Come l'abbiamo quasi sbagliata, che e' la parte da ricordare
 *
 * Il brief che ordinava di togliere la riga portava una condizione di
 * disobbedienza: *"se togliendola ADR 016 §3 cade, non toglierla"*. Era stata
 * scritta leggendo **la parafrasi in CLAUDE.md**, che dice *"accanto al budget, il
 * totale mensile delle fisse"* e **ha perso le due parole `in Impostazioni`**,
 * cioe' il posto. Senza il posto, "accanto al budget" si legge come "in qualunque
 * schermata parli di soldi".
 *
 * E' [DEBITO.md](../../docs/DEBITO.md) §1 che morde per la prima volta su una
 * decisione invece che su una stringa a schermo: una copia che parafrasa, perde una
 * condizione, e produce un'istruzione sbagliata. L'ha presa un agente che e' andato
 * a leggere l'ADR invece della parafrasi.
 *
 * `monthlyFixedCosts` resta viva e non e' orfana: la chiama `recurring-view.ts`, che
 * alimenta `FixedCosts` — cioe' la casa vera di §3.
 */

/** Quale delle due nature conta una sezione di A. Il titolo lo scrive il componente. */
export type BreakdownKind = 'fixed' | 'variable'

/**
 * Cio' che una sezione di A ha **sempre**: una natura e una scala. Le righe pure,
 * ma la loro forma cambia fra i due rami dell'unione qui sotto; il totale no —
 * vive nel solo ramo a piu' righe.
 *
 * **`asChart` non e' qui**, e non ci torna: la soglia si applica all'insieme
 * delle righe visibili anche adesso che la scala e' della sezione. L'argomento
 * sta su `BREAKDOWN_MIN_ROWS`, con la misura che ce l'ha portato.
 *
 * Il tipo resta un pezzo a se' perche' e' cio' che impedisce a `kind` e a
 * `scaleCents` di essere scritti due volte nei due rami dell'unione qui sotto,
 * dove niente garantirebbe che siano lo stesso campo.
 */
interface SectionShape {
  /**
   * **Questa parte si disegna come grafico**: tre righe o piu'.
   *
   * Sotto, le stesse righe restano — nome e importo — e non c'e' niente da
   * commutare: nessuna ciambella, nessuna didascalia della scala, nessun gesto
   * da annunciare. La soglia e la sua storia stanno su `BREAKDOWN_MIN_ROWS`.
   *
   * Sta qui e non sui due rami dell'unione per la ragione scritta qui sopra: e'
   * lo stesso campo, e nei due rami niente lo garantirebbe.
   */
  readonly asChart: boolean
  readonly kind: BreakdownKind
  /**
   * **Quanto vale una barra piena in questa sezione**: l'importo della riga piu'
   * grande, cioe' il denominatore di ogni `CategorySlice.fraction` qui dentro.
   * E' cio' che la schermata scrive per **dichiarare** la scala.
   *
   * ## Perche' e' un campo, visto che oggi e' anche `rows[0].cents`
   *
   * Perche' i due dicono cose diverse. `rows[0].cents` e' *"l'importo della prima
   * riga"*, e per leggerlo come una scala bisogna sapere due fatti che il tipo in
   * quel punto non promette: che le righe sono ordinate dalla piu' grande, e che
   * la scala e' il massimo. E' la **lettura per posizione** che `Trend` ha reso
   * inesprimibile all'altro capo dell'elenco (`rows.length - 1`), e la ragione e'
   * la stessa: due letture che oggi coincidono su ogni scena costruibile non sono
   * la stessa cosa, e quella per posizione diventa falsa in silenzio.
   *
   * **Non possono divergere**: `sectionOf` calcola questo numero una volta sola e
   * lo usa sia per il campo sia per le frazioni. Non e' una copia da tenere
   * allineata, e' lo stesso valore letto due volte.
   *
   * ## Obbligatorio, non annullabile
   *
   * Una sezione senza scala non esiste: le sue barre non avrebbero un
   * denominatore. Con **tutte** le righe a zero vale `0`, e li' nessuna barra si
   * disegna — `share()` non divide per zero e `barLength(0)` e' `0`. Non e' un
   * caso limite teorico: e' la ricorrente da zero centesimi, che ha gia' il suo
   * test.
   *
   * ## Con una riga sola dice la stessa cifra della riga
   *
   * Ed e' un fatto per chi dipinge, non un ramo di qui: scriverlo sopra una
   * sezione che ha una riga sola porterebbe **lo stesso numero due volte sullo
   * stesso schermo**, che e' la metrica con cui questo progetto ha gia' trovato
   * tre difetti. Stessa forma di `single` e `totalCents`, stessa divisione del
   * lavoro: il modello dichiara il fatto, il componente decide se quel fatto ha
   * un lettore.
   */
  readonly scaleCents: Cents
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
         * Dalla piu' grande. `rows[0]` e' la riga piu' grande di questa sezione,
         * quindi il suo importo **e'** `scaleCents` e la sua `fraction` vale 1
         * ogni volta che quell'importo e' sopra zero: la barra piu' lunga arriva
         * a fondo colonna, **in ogni sezione**.
         *
         * E' la geometria delle small multiples — colonne diverse, fondo colonna
         * uguale — e **da sola non dichiara niente**: due barre piene accanto a
         * `507,00 €` e `42,00 €` dicono che qualcosa non torna, non cosa. A
         * dichiararlo e' `scaleCents`, scritto in testa alla sezione.
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
 * piu' grossa", non a "come si spartisce il totale". Portandolo qui, A torna a
 * rispondere alla propria domanda e non a due.
 *
 * **Ed e' quello che rende accettabili le due scale** (0a): il rischio di due
 * unita' di misura sulla stessa schermata e' che l'occhio confronti una barra di
 * qua con una di la' e ne ricavi una proporzione falsa. Con la proporzione vera
 * scritta **sopra** le righe, quella lettura e' contraddetta prima di potersi
 * formare — da un elemento che nel momento in cui 0a fu presa non esisteva.
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

/** Il periodo prima di quello guardato, con il totale che A gli attribuisce. */
export interface BreakdownPrevious {
  readonly range: PeriodRange
  /** Tutte le spese vive di quel periodo, fisse comprese: e' il conto di A. */
  readonly totalCents: Cents
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
   * **La sezione delle fisse c'e' se e solo se nel periodo ne e' uscita almeno
   * una.** C'era un secondo modo di non averla — l'interruttore spento — e non
   * c'e' piu': un vuoto solo, e viene dai dati. La distinzione fra i due vuoti
   * costava due nomi (`present` e `shown`) e un ramo per ognuno; adesso `split`
   * resta perche' dice cos'e' uscito, ed e' l'argomento di
   * ADR 016 §2, *"un'esclusione taciuta e' un numero che mente per omissione"*,
   * che nella sua ragione non nomina la Home — e lo stato `outside` non arriva
   * mai per questa via (vedi `statsView`).
   */
  readonly sections: readonly BreakdownSection[]
  /**
   * **Il periodo precedente, e quanto ci e' caduto** — presente **solo** quando
   * `sections` e' vuoto, `null` in ogni altro caso.
   *
   * ## Perche' esiste, e chi l'ha chiesto
   *
   * La mattina del 31 agosto — un lunedi' — le Statistiche si sono presentate
   * senza la sezione A: niente titolo, niente numero grande, niente ciambella.
   * Non era una perdita di dati, era una settimana nuova; ma **una sezione che
   * sparisce si legge come un'app rotta**, e chi guardava ha creduto che l'app
   * avesse dimenticato tutto.
   *
   * La riparazione e' che la sezione **resta in piedi e dice cosa manca**. Per
   * dirlo in modo utile le serve un'uscita, e l'uscita e' il periodo prima: *"in
   * 31 ago – 06 set non hai ancora segnato niente; in 24–30 ago erano 126,00 €"*.
   *
   * ## Perche' non si legge da B
   *
   * B ha gia' le righe dei periodi chiusi coi loro totali, e riusarle sarebbe
   * costato zero. **Ma B conta solo il variabile**, e A conta tutto (ADR 016 §1):
   * la stessa settimana vale 126,00 € in B e 656,00 € in A se ci e' caduto il
   * canone. Una cifra presa da li' e messa sotto il titolo di A sarebbe **la
   * risposta a un'altra domanda**, scritta dove nessuno puo' accorgersene.
   *
   * ## `null` quando non c'e' un periodo prima
   *
   * Prima spesa in assoluto dentro il periodo corrente: non esiste un periodo
   * chiuso da nominare, e la sezione dice soltanto che qui non c'e' ancora
   * niente. Non si inventa un intervallo a zero: sarebbe un periodo di cui
   * l'utente non ha mai avuto notizia.
   */
  readonly previous: BreakdownPrevious | null
  /* **`asChart` non e' piu' qui: e' sulla sezione.**
   *
   * Contava le righe di **tutta A insieme**; dal 31 agosto la soglia e' della
   * parte, perche' due righe di fisse disegnate come barre sono una barra piena
   * e una briciola — un distintivo, non una misura. L'argomento per esteso, con
   * la data e i due rimedi spediti insieme che l'hanno tenuta viva un giorno di
   * troppo, sta su `BREAKDOWN_MIN_ROWS`. */
  /**
   * La proporzione fisse/quotidiane del periodo, o `null` dove non c'e' niente
   * da dividere. L'argomento sta su `BreakdownSplit`.
   *
   * **Non dipende da nessuna scelta di lettura**, e per un periodo la sua ragione
   * e' stata *"resta anche a fisse spente, perche' dice cosa si sta nascondendo"*.
   * Il selettore non c'e' piu' e la ragione **non cade con lui**: si spoglia. Resta
   * che 530,00 € non possono stare fuori da questa schermata senza lasciare
   * traccia, che e' ADR 016 §1 — e vale contro chiunque provi a toglierli, non
   * contro un interruttore in particolare.
   */
  readonly split: BreakdownSplit | null
}

/**
 * B, e **non ha un `asChart`**: `TREND_MIN_ROWS` decide se la sezione esiste,
 * quindi dove `Trend` c'e' e' un grafico e il campo varrebbe sempre `true`.
 *
 * ## Non e' un elenco, ed e' l'unica cosa che rende il difetto inesprimibile
 *
 * Qui c'era `rows: readonly PeriodBar[]`, e ogni riga portava un
 * `current: boolean`. Le due letture — *"il periodo che contiene oggi"* e
 * *"l'ultima riga dell'elenco"* — davano lo stesso esito su **ogni scena
 * costruibile dal prodotto**, e non per debolezza dei test: **e' il mondo a non
 * contenere il controesempio**. Sostituendo `row.current` con
 * `index === rows.length - 1` nel componente restavano verdi tutti e 28 i test
 * che lo sorvegliavano — la misura sta in `docs/DEBITO.md`, voce *"«In corso» e
 * «ultima riga» sono indistinguibili da qualunque test"* — ed erano due agenti
 * diversi ad arrivarci per strade indipendenti.
 *
 * Un test in piu' non poteva chiudere quel buco, perche' non esisteva un input
 * che lo facesse cadere. Lo chiude **la forma**: con la riga corrente **fuori
 * dall'elenco**, `rows.length - 1` non esiste — non e' sconsigliato, e' che non
 * c'e' niente su cui scriverlo. E' la mossa dell'id deterministico e di
 * `ConfirmedPreview`, applicata a un tipo di lettura.
 *
 * Ne segue il taglio di `PeriodBar.current`: **la posizione nel tipo *e'* il
 * fatto**, e un campo che ripete il proprio contenitore e' uno stato che si puo'
 * scrivere in disaccordo con dove sta. Era anche il campo che nessun controllo
 * automatico poteva sorvegliare — `.current` e' l'idioma dei ref di Preact,
 * quindi l'audit della superficie morta non lo distingue da un `useRef`.
 *
 * ## Il fatto resta un fatto sulle date, e adesso lo garantisce la costruzione
 *
 * `current` **non** e' "l'ultimo periodo", ed e' `trendRanges` a renderlo vero
 * invece che a farlo coincidere: la finestra si costruisce **da**
 * `periodRange(period, input.day)`, e i chiusi si camminano all'indietro da li'.
 * Il giorno in cui la finestra guardasse anche i periodi futuri, o tagliasse dal
 * fondo, questo campo continuerebbe a dire la cosa giusta senza che nessuno lo
 * tocchi — mentre una posizione sarebbe diventata falsa in silenzio.
 *
 * **E non si ricava da `daysLived < daysTotal`.** Sembrano la stessa domanda e
 * non lo sono: **l'ultimo giorno del periodo** — la domenica, per una settimana
 * — `daysLived === daysTotal` e il periodo e' **ancora in corso**, perche' la
 * giornata non e' finita e ci si puo' ancora spendere. Chi disegnasse la riga di
 * oggi a partire dai giorni la perderebbe **una volta a settimana**, e l'ultimo
 * del mese sul periodo mensile — cioe' proprio quando quanto resta e' la cosa
 * piu' utile della schermata. C'e' un test su quel giorno, ed e' li' per questo.
 *
 * ## Perche' `current` non e' annullabile, e dove e' finita l'assenza
 *
 * Perche' un `closed` pieno accanto a un `current` a `null` sarebbe uno stato
 * che nessuno produce e che il componente dovrebbe comunque disegnare: una
 * sezione con un buco al posto della riga di oggi. Quando B c'e', la riga
 * corrente c'e' — e adesso lo dice il tipo.
 *
 * L'assenza della sezione **non si esprimeva gia' altrove**: la esprimeva
 * `rows` vuota, cioe' un elenco vuoto letto come un fatto. Adesso e'
 * `byPeriod: Trend | null`, che e' lo stesso fatto detto una volta sola e nel
 * posto che lo possiede. I modi restano tre, e adesso sono **tre condizioni
 * scritte** invece di tre strade verso lo stesso elenco vuoto (vedi
 * `statsView`): non ci sono ancora `TREND_MIN_ROWS` periodi da confrontare;
 * non c'e' nemmeno il periodo corrente, perche' cio' che B conta e' datato
 * **oltre** la sua fine; oppure i periodi ci sono e **non hanno niente da
 * confrontare** — ogni riga vale zero, che e' il caso di chi torna dopo mesi.
 *
 * Il secondo dei tre e' oggi **mascherato** dagli altri due, cioe' nessun input
 * lo distingue: perche' resti scritto lo stesso c'e' una ragione, e sta accanto
 * alla condizione in `statsView`.
 */
export interface Trend {
  /**
   * I periodi **gia' finiti** della finestra, dal piu' vecchio al piu' recente.
   *
   * Puo' essere vuoto: e' il caso in cui la soglia lascia passare la sola riga
   * di oggi, che con `TREND_MIN_ROWS` a 2 oggi non accade — la soglia conta
   * `closed.length + 1`, quindi vuoto vuol dire una riga sola e la sezione non
   * c'e'. **E' vuoto per il valore della soglia, non per costruzione**: chi
   * abbassasse `TREND_MIN_ROWS` a 1 renderebbe questo caso vivo, e il tipo lo
   * regge gia'.
   */
  readonly closed: readonly PeriodBar[]
  /** Il periodo che contiene oggi. L'argomento e' sul tipo, qui sopra. */
  readonly current: PeriodBar
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
      readonly byCategory: Breakdown
      /**
       * B, oppure **`null` quando la sezione non c'e'** — e non un `Trend` con
       * l'elenco vuoto, che era l'assenza *dedotta* da un valore. I tre modi in
       * cui manca stanno su `Trend`.
       *
       * Non e' `outside`: quello vale solo quando **anche** A e' vuota. Un
       * periodo con il solo affitto ha una sezione in A e nessuna riga in B —
       * A conta tutto (ADR 016 §1), B solo il variabile — ed e' `ready` con
       * questo campo a `null`.
       */
      readonly byPeriod: Trend | null
    }

export interface StatsInput {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly rules: readonly RecurringRule[]
  readonly budgets: readonly Budget[]
  readonly period: BudgetPeriod
  readonly day: IsoDate
  /**
   * **Il periodo che si sta guardando**, quando non e' quello di oggi.
   *
   * Assente vuol dire "oggi", che e' il caso di ogni chiamata prima delle
   * frecce. Non sostituisce `day` e non deve: `day` resta **oggi**, e serve a
   * tutto cio' che dipende da dove sta il presente — quanti giorni sono passati
   * dentro il periodo, quali colonne sono future, quale riga di B e' quella in
   * corso. Sono due fatti diversi, e confonderli farebbe leggere una settimana
   * chiusa come se fosse a meta'.
   *
   * E' per questo che `computeBudgetMetrics` prende gia' `onDate` e `today`
   * separati: questa navigazione non aggiunge un concetto, **usa quello che il
   * dominio aveva gia'**.
   */
  readonly anchor?: IsoDate
    /**
   * **`showFixed` non c'e' piu', e con lui l'interruttore.**
   *
   * Era entrato qui — invece di restare un filtro in `Stats.tsx` — per una
   * ragione sola e vera: *"non toglie righe, ricalcola la scala"*. Con la scala
   * unica di A, spegnere le fisse rimetteva in gioco le sei righe quotidiane, che
   * a schermo valevano fra 4 e 19 px e tornavano a valere fra 49 e 196.
   *
   * **Quella ragione e' evaporata quando 0a e' stata rovesciata.** Con la scala di
   * nuovo per sezione, le righe che il tap riapriva **nascono gia' riaperte**:
   * l'affitto non e' nella loro scala, quindi non le schiaccia. Verificato e non
   * dedotto — a fisse spente le `fraction` erano **identiche** e `scaleCents` non
   * si muoveva di un centesimo.
   *
   * Restava un effetto solo: ricalcolare `asChart` sulle righe rimaste. Adesso
   * `asChart` si calcola su `present`, che e' un fatto sui dati, e non ha piu'
   * bisogno di sapere cosa qualcuno stia guardando.
   *
   * **Perche' si e' tolto invece di lasciarlo:** un interruttore che non cambia
   * quasi niente e' peggio di nessun interruttore, perche' **promette un potere
   * che non ha**. Chi lo tocca si aspetta che succeda qualcosa e vede sparire una
   * sezione, che e' meno di quanto la sua presenza annunciava.
   *
   * **E ne e' uscito un difetto che non era stato progettato.** Con l'interruttore
   * spento in una settimana di sole spese fisse, `sections` era vuota, `split`
   * nullo, e il numero grande in cima — che `Stats.tsx` dichiara *"non cambia
   * quando si spengono le fisse, ed e' voluto"* — spariva. Una **scelta di
   * lettura** che cancellava un **fatto**: 507,00 € usciti e nessun euro a
   * schermo. Togliendo il selettore quel ramo non e' piu' raggiungibile, ed e' la
   * seconda volta in questa fase che una superficie in meno chiude un difetto che
   * un controllo non copriva.
   */
}

/**
 * Una riga di A mentre si accumula: l'identita', che non cambia piu', e il
 * contatore. La frazione non c'e' perche' si calcola quando la scala e' nota,
 * cioe' dopo l'ultima spesa **della propria sezione** — che e' anche il momento
 * in cui `BreakdownSection.scaleCents` esiste.
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
 * La finestra di B: il periodo che contiene `day` e i `TREND_PERIODS - 1`
 * chiusi che lo precedono, dal piu' vecchio al piu' recente.
 *
 * Si cammina all'indietro da `range.start - 1`, che appartiene per costruzione al
 * periodo precedente — vale per la settimana come per il mese, e per i mesi di
 * lunghezza diversa, perche' e' `periodRange` a decidere i confini e non
 * un'aritmetica sui giorni.
 *
 * **Torna due cose e non un elenco**, ed e' qui che l'invariante di tutta la
 * sezione diventa vero *per costruzione* invece che per proprieta': la finestra
 * finisce col periodo di oggi perche' quel periodo e' il **primo** a essere
 * calcolato e non entra mai fra i chiusi. Finche' era un elenco, la stessa cosa
 * era un teorema — vero, dimostrabile, e indistinguibile da `ultimo elemento`
 * per qualunque test. Vedi `Trend`.
 */
export interface TrendWindow {
  /** I periodi gia' finiti, in ordine. `TREND_PERIODS - 1`, sempre. */
  readonly closed: readonly PeriodRange[]
  /** Il periodo che contiene `day`. Non "l'ultimo": quello che lo contiene. */
  readonly current: PeriodRange
}

export function trendRanges(period: BudgetPeriod, day: IsoDate): TrendWindow {
  const current = periodRange(period, day)
  const closed: PeriodRange[] = []
  let cursor = addDays(current.start, -1)
  for (let i = 1; i < TREND_PERIODS; i += 1) {
    const range = periodRange(period, cursor)
    closed.unshift(range)
    cursor = addDays(range.start, -1)
  }
  return { closed, current }
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
 * categoria e ordinate. La frazione non c'e' perche' la scala non e' nota finche'
 * non si e' contata l'ultima spesa della sezione.
 *
 * I due tempi restano anche adesso che la scala e' della sezione — accumulare,
 * poi mettere in scala — e non e' un residuo: sono due lavori con due chiavi
 * diverse (una mappa per categoria, un massimo), e tenerli in una funzione sola
 * vorrebbe dire scoprire il massimo mentre si somma, cioe' due invarianti nello
 * stesso ciclo.
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
 * Una sezione finita: le stesse righe piu' la loro lunghezza, e **la scala la
 * decide qui dentro**, perche' la scala e' della sezione (decisione 0a). Il
 * parametro che c'era — il massimo di tutta A, calcolato dal chiamante — e'
 * caduto con la scala unica.
 *
 * **Non e' una preferenza di firma: e' l'invariante reso inesprimibile.** Con la
 * scala passata da fuori, `scaleCents` e le frazioni sarebbero due cose che
 * qualcun altro deve tenere d'accordo, e *"in ogni sezione la barra piu' lunga
 * arriva a fondo colonna"* diventerebbe una proprieta' del **chiamante**. Presa
 * qui, e' una proprieta' della funzione: non c'e' nessun argomento da sbagliare,
 * e non esiste un modo di scrivere una sezione la cui scala non sia la sua.
 *
 * Con `tallies` vuoto uscirebbe una sezione a zero righe, che romperebbe
 * `single === (rows.length === 1)`. **Non e' una dichiarazione di
 * irraggiungibilita' a parole**: il chiamante e' uno solo — `statsView` — e
 * il chiamante passa `present`, che e' `parts` filtrato proprio su
 * `tallies.length > 0`. Chi aggiungesse un secondo chiamante legge questa riga
 * insieme alla firma.
 */
function sectionOf(source: SectionSource): BreakdownSection {
  // Il massimo, che oggi e' anche `tallies[0].cents` perche' `tallyRows` ordina
  // dalla piu' grande. Si ricalcola invece di leggerlo per posizione: costa un
  // `Math.max` e toglie un secondo posto in cui quell'ordinamento diventerebbe un
  // requisito. Con tutte le righe a zero vale 0, e `share` non divide per zero.
  const scaleCents = source.tallies.reduce((max, t) => Math.max(max, t.cents), 0)
  const rows = source.tallies.map((t) => ({
    ...t,
    fraction: barLength(share(t.cents, scaleCents)),
  }))
  // Con una riga sola il totale **non esiste**: sarebbe la stessa cifra della
  // riga, scritta due volte sullo stesso bordo destro. L'argomento per esteso
  // sta su `BreakdownSection`.
  const only = rows[0]
  if (rows.length === 1 && only !== undefined) {
    return { kind: source.kind, scaleCents, asChart: false, single: true, rows: [only] }
  }
  return {
    kind: source.kind,
    scaleCents,
    asChart: rows.length >= BREAKDOWN_MIN_ROWS,
    single: false,
    rows,
    totalCents: source.totalCents,
  }
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

/**
 * **Fin dove si puo' camminare all'indietro**, e cioe' il periodo che contiene la
 * prima spesa mai registrata. `null` quando non ce n'e' nessuna.
 *
 * Si esporta perche' le frecce vivono **fuori** dai rami di `StatsView`: devono
 * disegnarsi anche sullo stato vuoto di un periodo intermedio, altrimenti chi ci
 * atterra resta chiuso dentro una settimana senza spese — un controllo che puo'
 * cancellare se stesso non e' un controllo, ed e' lo stesso argomento con cui
 * l'interruttore delle fisse fu tolto.
 *
 * Guarda le spese **vive**: una lapide non e' un giorno in cui si e' speso, e far
 * camminare l'utente fino a una settimana le cui uniche spese sono cancellate lo
 * porterebbe in un periodo che lo Storico non conferma.
 */
export function firstPeriodStart(
  expenses: readonly Expense[],
  period: BudgetPeriod,
): IsoDate | null {
  let prima: IsoDate | null = null
  for (const e of alive(expenses)) {
    if (prima === null || isBefore(e.date, prima)) prima = e.date
  }
  return prima === null ? null : periodRange(period, prima).start
}

/**
 * Il periodo `quanti` passi indietro rispetto a quello che contiene `from`.
 *
 * Un passo si fa **dal confine**, non sottraendo sette giorni: il giorno prima
 * dell'inizio di un periodo sta nel periodo precedente, e vale identico per la
 * settimana e per il mese — dove sottrarre trenta giorni sbaglierebbe di uno a
 * febbraio e di uno a marzo, nella direzione opposta.
 */
export function shiftPeriod(from: IsoDate, period: BudgetPeriod, quanti: number): IsoDate {
  let giorno = from
  for (let i = 0; i < quanti; i += 1) giorno = addDays(periodRange(period, giorno).start, -1)
  return giorno
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

  // Il periodo guardato: l'ancora quando c'e', oggi altrimenti. `today` dentro
  // le metriche resta `input.day` (vedi `metricsOf`), quindi una settimana
  // passata si legge come **chiusa** e non come una a meta'.
  const anchor = input.anchor ?? input.day
  const current = metricsOf(anchor)
  const named = new Map(input.categories.map((c) => [c.id, c]))

  /* --- A: due sezioni, due scale ------------------------------------------ */

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
  // Una sezione senza righe non c'e', ed e' un fatto **sui dati**.
  //
  // Qui c'era anche `shown`, cioe' `present` filtrato dal selettore delle fisse.
  // La distinzione fra i due — *cio' che il periodo contiene* e *cio' che si
  // guarda* — esisteva perche' confonderli rendeva il selettore un vicolo cieco.
  // Tolto il selettore, la scelta di lettura non c'e' piu' e ne resta uno solo:
  // **niente da confondere, invece di due nomi da tenere distinti.**
  const present = parts.filter((part) => part.tallies.length > 0)

  // **Qui non si calcola nessuna scala**, ed e' il segno che la scala e' della
  // sezione: `sectionOf` prende il massimo delle proprie righe e lo dichiara in
  // `scaleCents`. Il `reduce` su tutte le righe visibili che stava qui era la
  // scala unica di A, ed e' caduto con lei — l'argomento sta in cima al file, la
  // misura che l'ha deciso pure.
  // Il periodo prima, e serve **solo** quando A e' vuota: e' l'uscita dello stato
  // vuoto della sezione. Si calcola qui e non nel componente perche' e' un conto
  // sulle spese, e il componente non ne fa.
  //
  // `previousRange` viene da `trendRanges`, cioe' **la stessa funzione che
  // costruisce B**: due modi di dire "il periodo prima" divergerebbero il giorno
  // in cui uno dei due cambia, e nessuno se ne accorgerebbe. L'ultimo dei chiusi
  // e' quello che confina con il corrente, per costruzione di quella funzione.
  const previous = ((): BreakdownPrevious | null => {
    if (present.length > 0) return null
    const { closed } = trendRanges(input.period, anchor)
    const range = closed[closed.length - 1]
    if (range === undefined) return null
    const dentro = expenses.filter(
      (e) => !isBefore(e.date, range.start) && !isBefore(range.end, e.date),
    )
    // Zero spese nel periodo prima non e' un'uscita: e' un secondo vuoto, e
    // mandarci l'utente sarebbe mandarlo in un'altra stanza spoglia.
    if (dentro.length === 0) return null
    return { range, totalCents: sumCents(dentro.map((e) => e.amountCents)) }
  })()

  const byCategory: Breakdown = {
    sections: present.map((part) => sectionOf(part)),
    previous,
    // La soglia conta le righe **a schermo**, tutte insieme: applicata per
    // sezione lasciava senza barre la meta' che pesava 530,00 € su 642,00 €.
    // L'argomento sta su `BREAKDOWN_MIN_ROWS`, la tabella misurata in cima al
    // file.
    // **Dalle metriche, e fuori dal selettore.** Fuori perche' e' cio' che dice
    // all'utente cosa sta nascondendo: sparendo con le righe, spegnere le fisse
    // toglierebbe 530,00 € dallo schermo senza lasciare traccia, che e' ADR 016
    // §1 dalla porta di servizio. Dalle metriche perche' sono gli stessi due
    // numeri dei totali di sezione, e due espressioni per lo stesso numero sono
    // una copia da tenere allineata.
    split: breakdownSplit(current.recurringSpentCents, current.spentCents),
  }

  /* --- B: i periodi ------------------------------------------------------- */

  // Destrutturata subito: la finestra arriva gia' divisa, e da qui in giu' non
  // esiste nessun elenco che contenga la riga di oggi insieme alle altre —
  // tranne dove le lunghezze devono stare sulla stessa scala, che e' l'unico
  // posto in cui rimetterle insieme significa qualcosa.
  // **B segue l'ancora**, cosi' la riga "in corso" del confronto e' il periodo
  // che A sta ripartendo. Con B fermo a oggi la schermata mostrerebbe una
  // settimana in cima e un confronto che finisce su un'altra, e l'occhio
  // dovrebbe invertire una mappa fra due elementi della stessa schermata — che
  // e' il difetto che il test sull'ordine delle sezioni gia' vieta.
  const { closed: closedRanges, current: currentRange } = trendRanges(input.period, anchor)
  const measured = (range: PeriodRange) => ({ range, m: metricsOf(range.start) })
  const closedMeasured = closedRanges.map(measured)
  const currentMeasured = measured(currentRange)

  // **Una scala sola per tutte le righe**, cosi' le lunghezze restano
  // confrontabili anche dove la traccia manca. Comprende i budget delle righe
  // confrontabili: altrimenti una barra sotto budget potrebbe risultare piu'
  // lunga della traccia che dovrebbe contenerla.
  //
  // Comprende anche la riga corrente, che sta fuori dall'elenco ma **dentro la
  // scala**: e' l'unica cosa per cui le due parti della finestra tornano a
  // essere una lista sola, ed e' esattamente quella per cui devono esserlo —
  // due scale renderebbero incomparabili proprio le barre che B esiste per
  // confrontare.
  const trendScale = [...closedMeasured, currentMeasured].reduce(
    (max, { m }) => Math.max(max, m.spentCents, m.comparableToBudget ? (m.budgetCents ?? 0) : 0),
    0,
  )

  const barOf = ({ range, m }: { range: PeriodRange; m: BudgetMetrics }): PeriodBar => ({
    key: range.start,
    range,
    cents: m.spentCents,
    fraction: barLength(share(m.spentCents, trendScale)),
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
  })

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
  // schermata.
  const firstCounted = expenses.reduce<IsoDate | null>(
    (earliest, e) =>
      countsTowardBudget(e) && (earliest === null || isBefore(e.date, earliest))
        ? e.date
        : earliest,
    null,
  )
  // **Il taglio e' una condizione sulle date applicata a ogni riga**, e non piu'
  // uno `slice` da un indice. L'esito e' lo stesso — i confini crescono, quindi
  // la condizione e' monotona e cio' che resta e' comunque una coda — ma non
  // c'e' nessuna posizione da leggere, e soprattutto **la riga di oggi passa per
  // la stessa condizione delle altre** invece che per il posto in cui si trova.
  const counted = (bar: PeriodBar): boolean =>
    firstCounted !== null && !isBefore(bar.range.end, firstCounted)
  const shownClosed = closedMeasured.map(barOf).filter(counted)
  // La finestra e' vuota in due casi, e sono due fatti diversi con lo stesso
  // esito: **non esiste nessuna spesa che B conti** (solo ricorrenti, che e' il
  // caso di chi ha appena acceso una regola), oppure ogni periodo della finestra
  // finisce prima della prima — cioe' quella spesa e' datata **oltre** la fine
  // del periodo corrente. Chi scrive davvero quel secondo stato e' enumerato su
  // `StatsView`, ramo `outside`: non e' nessuna schermata.
  //
  // **Il secondo caso e' l'unico in cui la riga di oggi non c'e'**, e il perche'
  // e' geometrico: la sua fine e' il confine piu' lontano della finestra, quindi
  // se non e' contata lei non e' contata nessuna. Il `null` qui sotto non e'
  // quindi una precauzione di tipo — e' quello stato, e ha due scrittori
  // dichiarati (`parseBackup` e l'orologio del dispositivo tornato indietro).
  //
  // **E va detto che oggi nessun test lo distingue, perche' nessun input puo'.**
  // Provato togliendo il filtro alla sola riga corrente: **94 test su 94
  // restano verdi**. Quando la riga di oggi non e' contata, i chiusi sono tutti
  // caduti prima di lei — quindi si finisce sotto `TREND_MIN_ROWS` — e comunque
  // il suo importo e' zero, quindi cade anche `comparable`: due condizioni
  // diverse mascherano la stessa uscita. Resta scritto cosi' lo stesso perche'
  // il taglio sulla testa e' **una regola sola applicata a tutte le righe**, e
  // privilegiare la riga di oggi vorrebbe dire che il giorno in cui una delle
  // due maschere cade — una soglia abbassata a 1, un `comparable` tolto perche'
  // "una riga a zero e' un dato" — B mostrerebbe un periodo in cui l'app non
  // aveva dati, e il difetto arriverebbe insieme alla modifica che lo rende
  // possibile.
  //
  // Qui c'era `bars.slice(-1)`, con accanto *"resta la riga di oggi"*: era vero
  // finche' una riga sola era una sezione. Da quando non lo e', quel ramo
  // produceva un valore che la soglia toglieva subito dopo — cioe' un output
  // non osservabile con accanto un argomento diventato falso.
  const currentBar = barOf(currentMeasured)
  const shownCurrent = counted(currentBar) ? currentBar : null

  // **La finestra ha delle righe e non ha niente da confrontare.** Il taglio
  // sulla testa risponde a "da quando l'app aveva dati che B conta", che e' una
  // domanda sulle **date**; questa risponde a "c'e' qualcosa da confrontare",
  // che e' una domanda sui **valori**. Sono due, e per un giorno c'e' stata solo
  // la prima: misurato a 390x844 con tre spese manuali datate 200, 210 e 220
  // giorni fa — l'Erasmus che riapre l'app dopo la pausa estiva — `firstCounted`
  // non e' `null`, quindi il taglio sulla testa non toglieva niente, quindi
  // **otto barre tutte a zero** e `0,00 €` nove volte sulla stessa schermata,
  // con i 77,00 € a disco che non comparivano da nessuna parte.
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
  const comparable =
    shownClosed.some((bar) => bar.cents > 0) || (shownCurrent !== null && shownCurrent.cents > 0)

  // **La soglia conta le righe a schermo, e quella di oggi e' una di quelle**
  // anche se non sta nell'elenco: `closed.length + 1`. E' l'unico punto in cui
  // la forma nuova costa attenzione — una soglia scritta sul solo `closed`
  // sarebbe la stessa soglia spostata di uno, senza che niente lo dica.
  //
  // Sotto `TREND_MIN_ROWS` la sezione **non c'e'**: la costante porta
  // l'argomento. Non e' un elenco svuotato per comodita' — e' l'unico modo di
  // non ristampare in fondo alla schermata, sotto un titolo che promette un
  // confronto, la stessa cifra che sta in testa.
  //
  // I tre modi di non esserci sono tre condizioni, e si leggono qui invece di
  // convergere su un elenco vuoto: niente riga di oggi, niente da confrontare,
  // troppo poche righe. Vedi `Trend`.
  const shownRows = shownClosed.length + (shownCurrent === null ? 0 : 1)
  const byPeriod: Trend | null =
    shownCurrent !== null && comparable && shownRows >= TREND_MIN_ROWS
      ? { closed: shownClosed, current: shownCurrent }
      : null

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
  if (present.length === 0 && byPeriod === null) {
    return { kind: 'outside', period: input.period, range: current.range }
  }

  /* --- C non c'e' piu': la proiezione al mese vive in Impostazioni ---------
   *
   * Qui si costruivano `tiles`, e l'unica cosa che le leggeva era la riga
   * `Spese fisse 530,00 €/mese` in testa alla schermata. E' caduta perche'
   * scriveva la stessa cifra della sezione delle fisse, duecento pixel piu'
   * sopra. L'argomento per esteso e la ragione per cui ADR 016 §3 non cade
   * stanno dove stava il tipo. */

  return {
    kind: 'ready',
    period: input.period,
    current,
    byCategory,
    byPeriod,
  }
}
