# 025 — La palette si misura su tutte le coppie, e su una colonna sola

Data: 30 agosto 2026 · Stato: accettata

## Contesto

Fino alla fase 5 il colore di una categoria era **ornamento**: nelle Statistiche
la lunghezza della barra portava il dato e il colore diceva soltanto *"questa
riga e' quella riga"*. Dalla fase 6 le Quotidiane hanno una **ciambella**, e li'
il colore **e' il dato**: due fette che non si distinguono non sono due
categorie, sono una fetta piu' grande.

Misurata con il validatore della skill `dataviz` sulle superfici vere
(`#f6f6f3` / `#101413`), la palette di fase 5 cadeva su tutti e quattro i
controlli calcolabili: ΔE 9,4 fra Spesa e Coffeeshop a vista piena (pavimento
15), ΔE 4,3 fra Svago ed Extra in deuteranopia (pavimento 8), tre tinte sotto la
croma minima — fra cui Extra a **0,015**, cioe' un grigio — e quattro tinte fuori
dalla banda di luminosita' del tema scuro.

Serviva quindi una palette nuova **e** un controllo che ne sorvegliasse la
sostituzione, perche' un difetto di palette non lo trova nessun test di
comportamento: si vede solo misurando.

## Le due decisioni

### 1. La pairlist e' **tutte le 28 coppie**, non le otto adiacenti

La disciplina dei grafici distingue due liste: **adiacenti** dove solo i vicini
si toccano (barre impilate, linee), **tutte le coppie** dove due marche qualunque
possono trovarsi affiancate.

La proposta in discussione era: *"fissiamo l'ordine di disegno delle fette
all'ordine delle categorie invece che a quello degli importi; cosi' l'adiacenza
smette di dipendere dai dati e le otto coppie adiacenti sono note a build
time"*. L'argomento e' quello, giusto, che la griglia dei chip non si riordina
mai — *"dopo pochi giorni l'utente tocca per posizione senza leggere
l'etichetta"*.

**L'ordine di disegno va fissato lo stesso, per quell'argomento. Ma non produce
la conseguenza che gli era stata attribuita**, e le tre ragioni sono fatti
dell'albero:

1. **la ciambella disegna solo le categorie con spese nella finestra**
   (`quoteOf` costruisce le fette da `part.rows`, e le righe sono le categorie
   con un totale nella finestra). Se
   Fuori non ha spese questa settimana, Spesa e Coffeeshop diventano vicine pur
   non essendolo nell'ordine. Con un sottoinsieme di due, **qualunque** coppia
   diventa adiacente;
2. **l'ordine della griglia lo decide l'utente**: `Category.order` si modifica
   dall'editor (`onMove` in `CategorySheet`);
3. **quali otto siano le attive lo decide chi archivia e sostituisce.**

Quindi l'ordine fissato rende l'adiacenza **stabile finche' tutte e otto sono
presenti**, non indipendente dai dati. L'unica pairlist verificabile a build time
e' quella completa — ed e' anche piu' severa, quindi passandola si passano anche
le adiacenti, comunque cadano.

**L'obiezione che sembrava chiudere il caso, e perche' non lo chiude.** La skill
scrive che *"with all 28 pairs in play no ordering can"* passare, e propone un
tetto di tre serie. Quella frase parla del **riordinare i suoi esadecimali
documentati** — lo dice la riga accanto, *"re-stepping is off the table by the
documented-palette rule"* — e infatti l'aggiunge subito: *"the all-pairs pairlist
doesn't depend on order"*. Noi non riordiniamo una palette data: **scegliamo le
tinte**. Una ricerca su OKLCH dentro i vincoli ha trovato otto tinte che passano
tutte e 28 le coppie in tutti e due i temi, verificate anche con il validatore
della skill. L'impossibilita' era dell'ordinamento, non del problema.

### 2. **Una colonna sola**, e P4 si soddisfa nell'intersezione delle due bande

La palette di riferimento ha **due colonne**, chiara e scura: le stesse tinte,
ristagliate per il fondo. Qui non si puo', e la ragione non e' pigrizia:
`Category.color` e' **un campo solo** e il suo valore lo sceglie l'utente. Un
secondo campo sarebbe una superficie che nessuno produce — la regola *"un campo
e' prodotto quando un valore entra da fuori"* — e vorrebbe una migrazione su dati
altrui per un guadagno che l'utente puo' cancellare al primo tap sull'editor.

Le alternative valutate:

- **derivare il passo scuro a runtime** (funzione pura o `color-mix`/`oklch()`
  in CSS): non risolve il vincolo che stringe. La banda scura resta
  0,48–0,67 — larga 0,19 — e le otto tinte scure devono passare le 28 coppie
  **li' dentro** comunque. La derivazione allarga solo il tema chiaro, che non
  era il collo di bottiglia, e in cambio raddoppia l'insieme da verificare e
  aggiunge un modulo che a oggi avrebbe un lettore solo;
- **dichiarare che P4 non vale nel tema scuro**: era la via legittima solo se le
  altre due non reggevano, e una regge;
- **scegliere tinte dentro tutte e due le bande**, cioe' nell'intersezione
  **L ∈ [0,48 · 0,67]**. Esistono, ed e' la scelta presa.

**Il regalo che fa questa scelta, e che e' la ragione per cui e' anche la piu'
robusta**: ΔE fra due tinte non dipende dalla superficie. Con una colonna sola,
**P1, P2 e P3 non hanno una dimensione "tema"** — sono lo stesso numero sui due
fondi, per costruzione, non per fortuna. Solo P4 e il contrasto guardano il tema.
Un criterio che non puo' divergere fra due temi e' meglio di uno che si verifica
due volte.

## Conseguenze

- `scripts/palette.mjs` (`npm run audit:palette`, in CI) misura i quattro
  pavimenti su tutte le 28 coppie e nei due temi. Legge le tinte da
  `src/core/defaults.ts` e le superfici da `src/ui/tokens.css`: nessuna copia.
- Le otto tinte di default cambiano. **Le categorie esistenti no**: sono dati
  dell'utente, nessuna migrazione le tocca.
- **Extra non e' piu' un grigio.** Il grigio e' il colore con cui l'interfaccia
  dice *"qui non c'e' un dato"* — ed e' proprio quello che indossa l'aggregato
  delle orfane, nella stessa figura.
- Il contrasto sul fondo si **misura e non si sbarra**: e' un controllo che la
  disciplina stessa dichiara rilassabile dove i valori sono leggibili altrimenti,
  e qui la condizione e' soddisfatta e documentata (etichetta e contorno su ogni
  riga). Sbarrarlo vorrebbe dire rifiutare palette per una ragione che il
  prodotto ha gia' risolto.
- **Debito aperto**: `COLOR_NAMES` in `CategorySheet.tsx` e' indicizzata
  sull'esadecimale e non e' stata aggiornata; e le chiavi di colore nei dizionari
  sono otto, di cui una `color.grey`, mentre la palette nuova non ha un grigio.
  Voce 10 di [DEBITO.md](../DEBITO.md), con le due strade e i loro costi.

## Cosa questa decisione **non** copre

- **Non guarda i colori scelti dall'utente.** Il controllo vale sui default; chi
  rinomina e ricolora le proprie categorie puo' produrre due tinte
  indistinguibili, e nessun gate lo impedisce. La tavolozza dell'editor offre
  otto pastiglie proprio per rendere il caso raro, ma non impossibile.
- **Non guarda la nona marca**, l'aggregato delle orfane in `--text-muted`: non
  e' una tinta categorica ed e' esclusa per costruzione.
- **Non e' una verifica su schermo.** Misura esadecimali, non pixel: non vede
  l'antialiasing, la resa di Safari, ne' un colore alterato da un'opacita' in
  CSS. La copertura vera resta il telefono.
