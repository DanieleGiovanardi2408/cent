# ADR 013 — Le premesse d'ambiente si dichiarano, e il font e' la terza

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
