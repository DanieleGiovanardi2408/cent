# ADR 016 — Due tipi di soldi: le ricorrenti non entrano nel budget

Data: 2026-08-24
Stato: accettata

## Decisione

Le spese con `source: 'recurring'` **non entrano nel calcolo del budget**.

Nessun campo nuovo, nessuna migrazione: la distinzione e' gia' nel modello dalla
fase 1.

## Perche'

**Il budget serve a decidere se prendere quel caffe'. L'affitto non e' una
decisione.**

Un affitto da 900 al mese dentro un budget settimanale da 200 renderebbe la
settimana del primo **sempre** catastrofica, e "puoi spendere ~X al giorno" —
il numero che il brief chiama il piu' utile — diventerebbe un numero che nessuno
guarda piu'. Un indicatore che grida tutti i mesi nello stesso giorno non informa:
insegna a ignorarlo.

## L'asse vero e' "impegnato in anticipo", non "ricorrente"

Sono due cose diverse, e vale la pena dirlo perche' un giorno qualcuno chiedera'
di escludere una spesa singola e grossa.

Ma qui coincidono, e la ragione e' precisa:

> **Creare una regola e' l'atto con cui l'utente dichiara che quella spesa e'
> fissa.**

Nessuno imposta una regola ricorrente per un caffe'. Il proxy e' esatto **non
perche' abbiamo indovinato bene**, ma perche' **e' l'utente a dichiararlo**, con un
gesto che ha gia' un altro scopo e che quindi non puo' essere frainteso.

E' la stessa forma dell'identita' deterministica (ADR 006): non si sorveglia una
condizione, si usa un fatto che esiste gia'.

## Le tre conseguenze, tutte obbligatorie

1. **Storico e statistiche continuano a mostrare tutto.** Sono spese vere, uscite
   davvero. E' **solo il budget** a escluderle. Una spesa che sparisce dallo
   Storico sarebbe una bugia sui dati; una che non entra nel budget e' una scelta
   su cosa quel numero misura.

2. **La Home deve dirlo.** Una riga accanto al numero grande: *"oltre alle spese
   fisse"*. **Un'esclusione taciuta e' un numero che mente per omissione**, ed e'
   la stessa famiglia dell'indicatore di backup che tace a torto (CLAUDE.md,
   Backup). Il numero e' giusto solo se si sa cosa non c'e' dentro.

3. **Due numeri, non uno.** Accanto al budget, in Impostazioni, il totale mensile
   delle fisse: *"Fisse: 1.040 € al mese"* contro *"Budget: 200 € a settimana"*.
   Sono la fotografia del mese in due cifre, e **la seconda ha senso solo se si
   vede la prima**. Mostrare il budget da solo, dopo aver escluso le fisse, e'
   esattamente l'omissione del punto 2 in forma numerica.

## Conseguenza sull'ordine di consegna

L'esclusione **arriva prima o insieme** alla possibilita' di creare regole dalla
UI. Il contrario aprirebbe una finestra in cui l'app in produzione — su dati veri —
calcola un budget che conta l'affitto, cioe' proprio il numero che questa ADR
esiste per proteggere.

## Cosa questa ADR non decide

Non decide che una spesa **manuale** grossa e impegnata (una caparra, un volo)
debba poter essere esclusa. Se un giorno servira', l'asse da introdurre e'
"impegnato in anticipo" e sara' un campo dichiarato dall'utente — non un'euristica
sull'importo, che indovinerebbe.
