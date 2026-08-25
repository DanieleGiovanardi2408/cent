# ADR 023 — Il giorno di pagamento si vede e si cambia

Data: 2026-08-25
Stato: accettata
Estende: ADR 018 (il segnaposto arretra solo se glielo si chiede), ADR 020
(l'ancora mensile e' un campo, non una conseguenza)

## La decisione

Due cose insieme, e nessuna delle due regge da sola:

1. **Il giorno del mese in cui una regola mensile scatta compare su ogni
   schermata che la descrive** — la riga dell'elenco delle spese fisse e il
   foglio della regola. *"Ogni mese, il giorno 25"*, non *"ogni mese"*.
2. **In modifica il giorno e' un campo che si cambia.** L'ancora congelata di
   ADR 020 resta il **default**; smette di essere l'unico valore possibile.

In **creazione** l'ancora continua a derivarsi da `startDate`, una volta sola,
come dice ADR 020: li' non c'e' niente da correggere, perche' il giorno lo si e'
appena scelto scegliendo la data.

## Il fatto che l'ha prodotta

Oggi 25 agosto. Si crea *"Affitto 900, mensile, da oggi"*: `anchorDay` nasce 25.
Ci si accorge che l'affitto esiste da febbraio e si usa il pannello di ADR 018:
rewind al 1 febbraio.

Da quel momento, con tutte le schermate aperte a turno:

- il foglio dice **«Data d'inizio: 1 febbraio»**;
- l'elenco delle fisse dice **«ogni mese · 900,00 €»**;
- il **25** non compare da nessuna parte.

E l'affitto nascera' il 25 di ogni mese, per sempre.

## Perche' non bastava mostrarlo

Perche' ADR 020 e il rewind, messi insieme, producono uno stato in cui il default
**e' sbagliato in un caso ordinario** — quello appena descritto, che e' anche il
motivo per cui il rewind esiste. Mostrare il 25 senza un modo di correggerlo
avrebbe dato all'utente la certezza di un errore e nessuna mossa.

Il verso opposto — far scrivere l'ancora al rewind, cioe' *"parte dal 1 febbraio,
quindi paga il 1"* — e' esattamente cio' che ADR 020 ha vietato, e per una ragione
che non e' cambiata: sposterebbe in silenzio le istanze gia' generate fuori dal
calendario.

Quindi **congelare e' giusto, ed e' una trappola finche' non c'e' un campo.** Le
due meta' sono una decisione sola.

## Perche' e' un campo e non una nuova operazione

Il rewind e' un'operazione a se' — con anteprima, conferma e permesso — perche'
**scrive spese**. Cambiare l'ancora non ne scrive nessuna:

- le istanze gia' generate hanno la data **dentro l'id** (`rec:<id>:<data>`,
  ADR 006): sono fatti storici, e nessuna riscrittura della regola le tocca;
- la materializzazione va **solo in avanti** dal segnaposto, quindi il calendario
  nuovo vale da li' in poi.

E' un aggiornamento normale della regola, **come cambiare l'importo**: passa da
`calendarChanged` → `reviseRecurringRule`, paga la stessa conferma quando c'e'
dell'arretrato, e entra nella firma della casella di conferma (`signature`) come
tutti gli altri campi che cambiano cio' che verrebbe scritto.

> *La regola descrive il futuro; le istanze sono il passato.*

## L'argomento contrario, e quando e' morto

ADR 020 e il foglio dicevano: *"niente selettore del giorno: il giorno lo scegli
gia' scegliendo `startDate`"*. Era **vero prima che esistesse il rewind**. Il
rewind e' precisamente l'operazione che fa divergere le due cose — quindi
l'argomento e' morto nell'istante in cui e' nata la funzione che lo smentisce, e
non nell'istante in cui qualcuno se n'e' accorto.

E' *"una decisione vale dove vale il suo argomento"* letta nell'altro verso: non
"cerca dove altro vale", ma **"controlla se la premessa c'e' ancora"**.

L'ostacolo tecnico era gia' caduto per conto suo: il selettore avrebbe aperto il
difetto di `previewCopy` che ripiegava su `draft.startDate` per annunciare la
prima spesa, e `nextDate` — atterrato il giorno prima per un'altra ragione — l'ha
chiuso.

## Cosa resta scoperto, dichiarato

- **Il selettore non c'e' in creazione.** Chi vuole "parte il 5, pagalo il 27" al
  primo colpo deve creare e poi riaprire. E' un tap in piu' su un caso che non ha
  ancora prodotto una richiesta, contro una riga in piu' nel foglio piu' alto
  dell'app per tutti gli altri.
- **Cambiare l'ancora non riallinea le istanze gia' scritte**, ed e' voluto: se
  l'affitto di luglio e' uscito il 25, il 25 e' quello che e' successo.
- Il selettore e' un `<select>` di sistema (su iOS la rotella). Non e' la
  tastiera di sistema, che questo progetto vieta **sugli importi** e per un'altra
  ragione: apre lenta, zooma, sposta il layout. Qui il bersaglio e' un chip da
  44px che non cambia misura.
