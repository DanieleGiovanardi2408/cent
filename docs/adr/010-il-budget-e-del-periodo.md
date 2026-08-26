# ADR 010 — Il budget e' del periodo, non pro-rata

Data: 2026-08-23
Stato: accettata

## Contesto

Al gate della fase 4 e' emerso questo caso, che non e' un caso limite ma il
**primo uso della feature**: si imposta il primo budget settimanale mercoledi',
avendo gia' segnato 240,00 EUR fra lunedi' e martedi'. La Home risponde
all'istante:

    Restano  -40,00 EUR        di 200,00 EUR · 240,00 EUR spesi
    Il budget del periodo e' finito.

Il numero e' corretto. La domanda che si e' aperta e' se dovesse esserlo: un
budget impostato a meta' periodo deve contare contro di se' le spese dei giorni
precedenti, oppure valere solo dal giorno in cui nasce, con il tetto ridotto in
proporzione ai giorni che restano?

## Decisione

**Il budget e' del periodo, e il periodo e' tutto. Niente pro-rata.**

Il record non cambia significato. Cambia cio' che le metriche riportano e cio'
che la Home sa dire.

## Perche' la domanda era posta male

Impostare "200 a settimana" dichiara un **ritmo**, non un fondo per i giorni che
restano. Riformulata cosi', la domanda si chiude da sola: il record significa gia'
una cosa sola, e non c'era nessuna ambiguita' semantica da risolvere.

**Il problema non era la semantica: era che la Home non poteva spiegarsi.**

## Perche' il pro-rata e' stato scartato

Questa domanda tornera' — quindi le tre ragioni, per esteso:

1. **Il tetto proporzionale e' un numero inventato.** Dividere il residuo per i
   giorni rimasti assume che il sabato costi come il martedi'. Non e' vero per
   nessuno, e non lo e' in particolare in viaggio.
2. **Renderebbe il significato di un record dipendente da quando e' nato.** Due
   budget da 200 a settimana varrebbero cose diverse a seconda del giorno in cui
   sono stati impostati. E' esattamente il tipo di stato implicito che la
   storicizzazione esiste per evitare.
3. **Romperebbe il confronto fra periodi.** "Questa settimana contro la scorsa"
   smetterebbe di essere una domanda con una risposta, perche' i due tetti non
   sarebbero piu' la stessa unita' di misura.
   **Vedi sotto: quell'argomento vale meno di quanto sembra.**

Il tutto per **addolcire un solo periodo, una volta sola**: quello in cui il
budget e' nato. Un costo permanente per un problema transitorio.

## Cosa cambia di conseguenza — e non e' una rifinitura

Se il numero resta quello, la Home deve poter dire **perche'**. Oggi non puo':
`BudgetMetrics` conserva solo `amountCents` del record risolto e butta via
`effectiveFrom`, quindi **"budget nato a meta' periodo" e "budget bruciato" sono
indistinguibili** — e sono due fatti completamente diversi per chi guarda.

Quindi:

- `BudgetMetrics` espone l'`effectiveFrom` del budget risolto.
- Nel periodo in cui il budget e' nato, la Home lo dice:
  *"Budget attivo da mercoledi' · prima avevi gia' speso 240,00 EUR"*.
- E quando il residuo e' negativo **solo perche' il periodo era gia' iniziato**,
  la frase non e' "Il budget del periodo e' finito" ma
  *"Questa settimana era gia' iniziata: il budget vale pieno da lunedi'"*.

L'ultima riga e' la parte che conta: e' vera, e' utile, e **non rimprovera per una
regola che non esisteva**. E' la stessa dottrina del tono gia' scritta in
CLAUDE.md — sforare e' un'informazione, non un errore — applicata al caso in cui
lo sforo non e' nemmeno colpa di una scelta.

## Conseguenze

- Nessuna migrazione: `BudgetMetrics` e' un tipo di ritorno calcolato, non un
  record su disco. Il campo `effectiveFrom` era gia' nei budget dal principio.
- Il caso "budget nato a meta' periodo" dura un periodo solo. Dal successivo, le
  due frasi speciali spariscono da sole senza che nessuno le spenga.
- Se un giorno servisse davvero un fondo residuo invece di un ritmo, sarebbe una
  **entita' diversa** — un obiettivo di spesa a scadenza — non una modalita' di
  `Budget`. Aggiungerla come modalita' riporterebbe tutte e tre le ragioni qui
  sopra.

## Il terzo argomento difendeva un confronto che era gia' rotto

*Aggiunto il 26 agosto 2026, progettando le statistiche (fase 6).*

La terza ragione qui sopra scarta il pro-rata perche' **romperebbe il confronto fra
periodi**. E' l'unica delle tre che parla di una cosa che questo ADR non possedeva:
una schermata che quel confronto lo faccia davvero. Non esisteva quando e' stato
scritto — arriva in fase 6 — e nel frattempo l'argomento e' stato **il piu' forte
dei tre**, perche' nomina un beneficio futuro invece di un costo presente.

**Il confronto che difendeva era gia' rotto, da un caso che questo ADR non ha
considerato.**

L'argomento assume che i due periodi confrontati **abbiano entrambi un budget per
tutta la loro durata**. Due casi lo smentiscono, ed entrambi sono ordinari:

1. **Il budget nasce dentro il periodo** — il caso che apre questo ADR, e che qui
   e' trattato solo dal lato del residuo. Nell'export reale del 26 agosto il budget
   ha `effectiveFrom` domenica 23, che e' l'**ultimo** giorno della settimana 17-23:
   copriva **un giorno su sette**. Un grafico che confronta quella settimana con un
   tetto da 200 dice "sei stato bravo" di una settimana in cui il tetto non
   esisteva. E' **la prima settimana di chiunque installi l'app**.
2. **Il budget cambia dentro il periodo.** 200 da lunedi', 250 mercoledi'. Qui
   `budgetCoveredPeriodStart` e' **vero** — un budget c'era il primo giorno — e la
   documentazione di quel campo dice, di questo caso, *"non c'e' niente da
   spiegare"*. **E' vero del residuo, dove questo ADR ha ragione**, e non dice
   niente sulla confrontabilita': i primi tre giorni verrebbero misurati contro un
   tetto che allora non esisteva.

Il pro-rata resta scartato, e le tre ragioni restano. Cambia il peso della terza:
**non stava proteggendo un confronto sano da un cambiamento pericoloso.** Stava
proteggendo da un cambiamento un confronto che, nei due casi qui sopra, non aveva
gia' una risposta.

## Cosa ne segue: `comparableToBudget`

Il rimedio non e' rivedere questa decisione — e' **rendere dicibile** quando il
confronto ha una risposta. `BudgetMetrics.comparableToBudget` e' vero se e solo se
**un unico record di budget ha coperto il periodo dal primo all'ultimo giorno**.

Chi disegna un confronto lo disegna solo li'. Dove e' falso non si disegna un
confronto **approssimato**: non si disegna nessun confronto, perche' l'assenza si
dichiara con la geometria e non con una nota — una traccia parziale leggerebbe
"disastro" con la stessa disinvoltura con cui una traccia intera legge "bravo", e
136,45 su 200 non e' nessuna delle due.

E il campo sta in `BudgetMetrics` invece che nel componente per la ragione di
sempre in questo progetto: una congiunzione scritta al chiamante viene
"semplificata" da qualcuno fra sei mesi, con i test verdi perche' nei dati di prova
le due condizioni coincidono. Come l'id deterministico e `ConfirmedPreview`, la
scelta sbagliata non e' sconsigliata: e' inesprimibile.

