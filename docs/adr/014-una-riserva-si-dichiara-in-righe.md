# ADR 014 — Una riserva di spazio si dichiara in righe, non in `rem`

Data: 2026-08-24
Stato: accettata

## Contesto

Il riquadro sotto il numero grande della Home (`.slot`) ha un'altezza
**riservata**: deve occupare da vuoto lo spazio che occupera' da pieno, o
all'apertura del database il bottone del budget e le spese di oggi scendono di
qualche decina di pixel (regola "Ordine di pittura", CLS > 0 sulla prima
schermata).

La riserva era un numero tondo: `9.5rem`, poi `11.5rem` quando e' arrivata la
riga di ADR 010. Misurato una volta, su una macchina, e arrotondato per eccesso —
con un commento onesto che diceva "il resto e' margine per le metriche del font
vero".

Non ha retto. Il primo runner Linux ha aggiunto una riga al testo e ha sfondato
la riserva. Ed e' il difetto interessante: **dichiarare il font (ADR 013) avrebbe
fatto tornare il verde senza toccare la causa**. La riserva sarebbe rimasta un
numero che non sa cosa sta riservando, pronta a cedere alla prossima riga di
troppo — SF Pro sul telefono, una terza lingua, un importo a cinque cifre.

## Decisione

**Una riserva di spazio si esprime in cio' che deve contenere: righe di testo, e
per ognuna la sua altezza di riga.** Il valore in pixel e' una conseguenza, mai
una scelta.

In `Home.css`:

```css
--line-allowance: calc(var(--fs-400) * var(--lh-snug)); /* 1lh di .allowance */
--line-note: calc(var(--fs-100) * var(--lh-snug));      /* .allowance__sub, .since */
--line-pace: calc(var(--fs-200) * var(--lh-body));      /* .pace, .invite */

--rows-allowance: 2;
--rows-sub: 1;
--rows-since: 2;
--rows-pace: 2;

--slot-min: calc(/* aria + barra + le quattro frasi, gap per gap */);
```

E' la dottrina che `.sheet__hint` gia' applicava pinnandosi a `1lh` invece che a
un `1.25rem` "abbastanza vicino". Qui `lh` non si puo' usare direttamente —
risponderebbe al font di `.home`, non a quello dei figli, che hanno tipografie
diverse — quindi si scrive lo stesso numero a mano, come il `calc` di ripiego che
`.sheet__hint` tiene accanto al suo `1lh`.

I conteggi sono misurati, non stimati: due lingue, quattro stati del riquadro,
larghezze 320 / 375 / 390 / 800. `--rows-allowance: 2` non e' prudenza — "The
budget for this period is used up." va a capo a 375 punti, e cosi' "Puoi spendere
~18.000,00 € al giorno".

## Il guardiano ha due lati, e di solito ne manca uno

Una riserva generosa fa passare **tutto**, gate compreso, e il giorno che il
layout si rompe davvero non lo dice nessuno. Quindi i test in `home.spec.ts`
("la riserva del riquadro") misurano da due lati opposti:

1. **copre**: nessuno stato sfonda, in nessuna delle due lingue, e nessuna frase
   supera le righe che il CSS dichiara — il conteggio si legge da
   `getComputedStyle`, non e' riscritto nel test;
2. **non avanza**: sullo stato piu' alto la riserva e' esattamente il contenuto.
   Il test allunga davvero il testo finche' va a capo una volta di piu' e
   pretende che il riquadro cresca. Se assorbisse, il gate sarebbe ancora li' ma
   non guarderebbe piu' niente.

Le due mutazioni sono state provate: alzare `--rows-pace` a 3 fa cadere il
secondo ("la riserva avanza di 22.5px: una riga intera ci sta dentro senza che il
gate la veda"), abbassare `--rows-allowance` a 1 fa cadere il primo con il nome
dell'elemento e dello stato.

## Compromessi accettati

- La stessa dichiarazione copre 375 e 390 punti. A 375 lo stato piu' alto riempie
  la riserva al pixel; a 390 la disponibilita' non va a capo, quindi restano
  25px di avanzo — una riga della disponibilita' che li' nessuno userebbe. Il
  prezzo di **non** tarare la riserva per larghezza: farlo vorrebbe dire
  scommettere che SF Pro, a 390 punti, spezzi le frasi dove le spezza Inter.
  Quella scommessa e' esattamente il difetto da cui veniamo.
- La controprova gira dove la riserva e' dimensionata (375) e si salta altrove,
  dicendolo. Un test che passasse in tre posti misurando davvero in uno solo
  sarebbe peggio di un test saltato.
- Il numero di righe resta una proprieta' della **copy**: se una lingua nuova
  facesse tre righe dove oggi ne bastano due, la risposta e' accorciare la frase
  o dichiarare la riga in piu' — una decisione, presa guardando il costo in
  spazio. Non e' piu' possibile alzare la costante finche' il verde torna, perche'
  la costante non c'e'.
