# ADR 013 — Le premesse d'ambiente si dichiarano

(Il font e' la terza; il tempo — fuso **e** istante — e' la quarta: vedi
l'aggiornamento in fondo.)

Data: 2026-08-24
Stato: accettata

## Contesto

La CI e' andata rossa su due commit, job e2e, con 97 verdi in locale. Quattro
blocchi della Home, sempre gli stessi, sempre lo stesso numero:

```
.slot height: 184 -> 197.75 (13.75px)
.budget top:  353.81 -> 367.56
.today  top:  405.81 -> 419.56
```

Nessuna regressione del codice: sul runner Ubuntu lo stack di font dell'app
(`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, ...`)
non trova nessuno dei primi nomi e cade su cio' che fontconfig ha installato quel
mese. Glifi piu' larghi, una riga in piu', riserva sfondata.

E' la **terza volta** che lo stesso difetto si presenta con un vestito diverso:

1. i test sul DST passavano sempre in CI perche' il runner gira in UTC, che l'ora
   legale non ce l'ha (`TZ: 'Europe/Amsterdam'` in `vitest.config.ts`);
2. le asserzioni sul copy italiano funzionavano solo perche' `it-IT` era cablato
   dentro `formatCents`; tolto di li', Chromium partiva in `en-US`
   (`locale: 'it-IT'` in `playwright.config.ts`);
3. adesso le asserzioni geometriche, che misuravano contro qualunque font fosse
   installato sulla macchina.

Ogni volta l'ambiente decideva qualcosa **al posto nostro, in silenzio**, e la
suite era verde per un motivo diverso da quello per cui la credevamo verde.

## Decisione

**Ogni premessa d'ambiente che entra in un'asserzione e' dichiarata nel
repository, in un posto visibile, con un commento che dice perche' esiste.**

Per il font: `tests/e2e/font.ts` e' la base di ogni `test` della suite (ne
discendono `installed.ts` e `install.spec.ts`) e inietta, prima di qualunque
script di pagina, un font vero versionato in `tests/fonts/`:

- **Inter variabile, sottoinsieme latino, 48 KB**, da @fontsource-variable/inter
  5.3.0, licenza OFL (copiata accanto al file). Copre le accentate delle due
  lingue, l'euro, il punto mediano e l'apostrofo tipografico;
- iniettato con l'API `FontFace` a partire dai byte gia' in memoria (base64
  dentro `addInitScript`): niente rete, niente fontconfig, niente cartelle di
  sistema. Gli stessi byte su macOS e su Linux, quindi gli stessi punti in cui
  il testo va a capo;
- l'override e' su `--font-sans` e `--font-numeric` con `!important`, cioe' **sui
  token**, non sui componenti.

### Perche' un font vero e non un ripiego

- *Un font di sistema comune ai due sistemi operativi* non esiste: macOS non ha
  DejaVu, Ubuntu non ha SF Pro.
- *Ritoccare le metriche* (`size-adjust`, `ascent-override`) sistema l'altezza
  della riga ma non le larghezze dei glifi, che sono quelle che decidono dove il
  testo va a capo — cioe' il difetto vero.
- *Eseguire i test in un container* sarebbe deterministico ma sposterebbe il
  costo su chi sviluppa, ogni giorno, per un difetto che si e' visto una volta.

Inter e non un font qualunque: ha metriche vicine a SF Pro Text, quindi la
riserva misurata contro di lui resta un numero plausibile anche sul telefono. Un
font largo il doppio avrebbe dato una riserva "sicura" e mezzo schermo vuoto.

## Cosa questa decisione **non** compra

Non compra la fedelta' al telefono: SF Pro non e' Inter, e nessun font in CI lo
e'. Compra una cosa piu' piccola e piu' utile — **due macchine che misurano la
stessa cosa** — cosi' un rosso significa "il layout e' cambiato" e non "il runner
ha un altro font". La verifica sul font vero resta il dispositivo, ed e' nel
criterio di chiusura di ogni fase (CLAUDE.md, caso 2 della tassonomia).

Restano fuori le emoji delle categorie, che vengono ancora dal sistema: un font a
colori pesa megabyte e nessuna asserzione geometrica dipende dalla loro
larghezza. Il giorno che ne dipendera' una, si aggiunge li'.

## Conseguenze

- La premessa e' **verificata, non assunta**: `home.spec.ts` registra al primo
  frame utile se il font dichiarato era gia' in pagina e ogni gate lo asserisce.
  Se un giorno arrivasse tardi, il messaggio direbbe "la premessa non ha fatto in
  tempo" invece di accusare una riserva che non ha colpe.
- L'app spedita non cambia di un byte: `dist` non contiene niente di tutto
  questo, e i token restano lo stack di sistema — zero webfont, zero richieste,
  zero FOUT sul telefono.
- Nessuna dipendenza nuova. Il binario e' versionato con la sua licenza, e
  `tests/node-fs.d.ts` dichiara a mano l'unica funzione di Node che serve per
  leggerlo: `@types/node` avrebbe portato `process` e `Buffer` dentro `src`,
  dove la regola e' che `src/core` non sappia niente della piattaforma.

---

## Aggiornamento — la quarta premessa e' il tempo, ed e' due cose

Data: 2026-08-24

Il run partito alle 23:58:47 ha confrontato alle 00:00:00, e due test sono andati
rossi con la stessa causa sotto due forme:

```
offline.spec.ts:53
  Expected: "... Questa settimana · 17–23 ago ..."
  Received: "... Questa settimana · 24–30 ago ..."
```

Il test legge il testo della pagina online, spegne la rete, ricarica e rilegge.
Fra le due letture e' passata la mezzanotte: l'app ha ricalcolato il giorno
civile al risveglio — cioe' **ha fatto esattamente quello che ADR 007 le
chiede** — e il confronto ha accusato il precache di una cosa che non aveva
fatto.

### Cosa si dichiara, e dove

1. **Il fuso**, `timezoneId: 'Europe/Amsterdam'` in `playwright.config.ts`,
   accanto a `locale`. E' lo stesso `TZ` di `vitest.config.ts`: due suite sullo
   stesso prodotto non possono misurare contro due calendari diversi. Senza, il
   fuso era quello della macchina — Europe/Rome in locale, **UTC sul runner**.
2. **L'istante**, `metadata.istante` nello stesso file, letto dai test tramite
   `tests/e2e/clock.ts`. Perche' il fuso da solo **non basta**: anche con
   Europe/Amsterdam fissato, un run che parte alle 23:59 attraversa comunque la
   mezzanotte. Ogni asserzione che dipende da "oggi" fissa l'orologio invece di
   ereditarlo.

`setFixedTime` e non `install`: i timer devono continuare a correre, o i fogli
non finiscono di chiudersi e i toast non se ne vanno mai. `home.spec.ts` lo
faceva gia' cosi', ed e' il modello.

### La trappola che si apre proprio dichiarando il fuso

`new Date('2026-08-23T23:30:00')` non e' un orario di Amsterdam: e' un orario nel
fuso del **processo Node**, che in CI e' UTC. Dichiarare `timezoneId` senza
toccare quelle stringhe avrebbe spostato "domenica 23 alle 23:30" all'una e mezza
di lunedi' 24 **sul solo runner**, facendo cadere i test sul confine di settimana
nell'atto stesso di riparare gli altri. Verificato togliendo un offset e
rilanciando con `TZ=UTC`: il test cade con `24–30 ago`.

Quindi ogni istante nei test porta l'offset scritto (`+02:00` per agosto), e il
giorno civile che serve a Node — `todayIso()` in `home.spec.ts` — si ricava
dall'istante dichiarato e non da `new Date()`.

### La prova al confine, ripetibile

Un test che passa a mezzogiorno e cade a mezzanotte non e' riparato, e' fortunato.
La prova si rifa' senza toccare il codice:

    CENT_ORA='2026-08-23T23:59:30+02:00' npx playwright test
    TZ=UTC CENT_ORA='2026-08-23T23:59:30+02:00' npx playwright test

Trenta secondi prima della mezzanotte, e nella forma del runner. 104 passati, 10
saltati in entrambe.

### Il secondo rosso non era la stessa radice

`overlays.spec.ts` accusava il promemoria di backup di coprire quattro chip delle
categorie. Non era ne' la mezzanotte ne' una sovrapposizione: era **la sonda**.
Prendeva il centro del rettangolo intero, lo arrotondava e lo confrontava con
bordi frazionari, cosi' un bersaglio a cavallo del bordo inferiore di uno
scroller veniva interrogato **oltre** quel bordo, dove si vede cio' che e'
dipinto sotto la lista. Riprodotto in locale spostando quella riga di 0,3 px.

Da li' e' venuta fuori la parte che l'aritmetica piu' fine non risolve:
`getBoundingClientRect` e il test di collisione del browser non cadono sullo
stesso decimale — misurati ~0,7 px di disaccordo su uno scroller della Home. La
sonda ora interroga il **centro della parte visibile** (il bersaglio intersecato
con gli antenati che ritagliano) e dichiara `ritagliato` cio' che resta sotto i
2 px. Un overlay non ritaglia, quindi la regola delle Sovrapposizioni non si
addolcisce di un pixel. Dettagli e misure in `tests/e2e/probe.ts`.

Effetto collaterale utile: i bersagli ritagliati ora si **contano in tabella**.
Lo stesso stato dava 14 bersagli in CI e 10 in locale, e nessuna riga lo diceva.
