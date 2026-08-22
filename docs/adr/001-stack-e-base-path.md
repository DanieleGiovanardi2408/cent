# ADR 001 — Stack e base path

Data: 2026-08-22
Stato: accettata

## Contesto

Cent e' una PWA single-user, offline-first, mobile-first, con un budget di
60 KB gzip sul bundle iniziale e il vincolo che inserire una spesa costi meno
di 5 secondi. Sara' pubblicata su GitHub Pages di progetto, quindi non alla
radice di un dominio ma sotto un sottopercorso.

## Decisione

### Stack

- **Vite 8** — build, dev server, code splitting. Nessuna alternativa valutata
  seriamente: e' quello che il brief impone e non c'e' ragione di discuterlo.
- **TypeScript 7 in strict**, piu' `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `noUnusedLocals`,
  `noUnusedParameters`. Le prime due sono le uniche due che trovano bug veri in
  un'app che manipola array di spese e campi opzionali (`note?`, `endDate?`).
- **Preact** (~4 KB gzip) invece di React (~45 KB). Con un budget di 60 KB per
  JS+CSS, React si prenderebbe da solo tre quarti del budget prima di scrivere
  una riga di app.
- **Vitest** per i test di `src/core`, che e' TypeScript puro senza DOM e gira
  in ambiente node.
- **vite-plugin-pwa** per manifest e service worker.
- Nessuna libreria UI, nessun CSS-in-JS runtime, nessuna dipendenza da CDN.

**`fake-indexeddb` e' l'unica dipendenza di test aggiunta** (devDependency: non
entra nel bundle, ~1 MB in `node_modules`). Motivo: `src/core/idb.ts` e' l'unico
file che tocca il disco, e da lui dipende ogni garanzia di non perdere spese —
atomicita' delle transazioni, migrazioni di schema, comportamento con due contesti
aperti sullo stesso database. Testarlo su un'implementazione in memoria scritta da
noi verificava il nostro sostituto, non IndexedDB. La regola "zero dipendenze senza
ADR" vale sul peso a runtime: qui il peso a runtime e' zero.

`idb` non e' installato in fase 0: entra in fase 1, quando c'e' del codice che
lo usa. Installare una dipendenza prima del codice che la giustifica e' il modo
piu' semplice per accumulare peso che nessuno rimuovera' mai.

### Base path

L'app sara' servita da `https://<utente>.github.io/cent/`. Tre valori devono
restare allineati, e sono definiti da una sola costante in `vite.config.ts`:

- `base: '/cent/'`
- `manifest.start_url: '/cent/'`
- `manifest.scope: '/cent/'` (e `manifest.id`)

## Conseguenze

Sbagliare il base path **non rompe la build e non rompe `npm run dev`**: rompe
il service worker, che registra uno scope diverso da quello in cui vive l'app.
Il sintomo — la PWA installata non parte offline — compare solo dopo il deploy
reale su Pages. Se lo si scopre in fase 8, rifare il giro (build, deploy,
reinstallazione dall'iPhone, invalidazione del SW gia' registrato sul
dispositivo) costa un ordine di grandezza piu' che scriverlo giusto ora.

Per questo la costante `BASE` e' unica e commentata nel file: non ci sono tre
stringhe da tenere sincronizzate a mano.

Prezzo da pagare: in locale l'app vive su `http://localhost:5173/cent/`, non
sulla radice. E' l'unico fastidio, ed e' esattamente la configurazione che
andra' in produzione — il che e' un vantaggio, non un difetto.
