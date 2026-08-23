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
