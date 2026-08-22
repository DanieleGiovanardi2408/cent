# Cent — expense tracker PWA

## Cos'e'
App web installabile (PWA) per tracciare le spese quotidiane. Uso personale,
single-user, mobile-first (iPhone, Safari, "Aggiungi a Home"). Primo contesto
d'uso: un soggiorno ad Amsterdam. L'app e' pensata per uso continuativo.

## Principio guida n.1
**Inserire una spesa deve richiedere meno di 5 secondi e al massimo 3 tap oltre
alle cifre dell'importo. L'obiettivo e' 2.**

Le cifre non contano come attrito: l'importo e' contenuto, non navigazione, e non
esiste modo di farlo entrare nell'app senza digitarlo. Contarlo renderebbe la
metrica priva di senso.

I 2 tap si raggiungono cosi': **FAB -> cifre -> tap sulla categoria, che E' la
conferma.** Nessun pulsante "Conferma". L'importo si digita cents-first, stile
bancomat (1250 -> 12,50), quindi il tasto virgola non esiste. La categoria si
sceglie sempre esplicitamente: mai preselezionata all'ultima usata. Vedi ADR 004.

Se una decisione di design o di architettura peggiora questo numero, e' la
decisione sbagliata. Tutto il resto dell'app e' secondario a questo flusso.

## Vincoli non negoziabili
- Nessun backend, nessuna API esterna a runtime, nessun login, nessun account.
- Tutti i dati restano sul dispositivo (IndexedDB). Deve funzionare 100% offline.
- Nessuna dipendenza da CDN a runtime. Tutto bundlato.
- Importi come **interi in centesimi**. Mai float per il denaro.
- Date come stringhe locali `YYYY-MM-DD`. Mai aritmetica su Date in UTC.
- Settimana che inizia **lunedi'**. Locale `it-IT`, EUR, `Intl.NumberFormat`.

## Stack
- Vite + TypeScript (strict) + Preact
- Nessuna libreria UI. CSS puro con custom properties. Niente CSS-in-JS runtime.
- IndexedDB tramite `idb` (~2KB). Niente Dexie.
- Vitest per i test del data layer. `vite-plugin-pwa` per manifest + service worker.
- Zero altre dipendenze runtime senza una ADR scritta in `docs/adr/`.

## Performance budget (verificabile)
- Bundle JS iniziale < 60 KB gzip. Se si supera, si taglia.
- FCP < 1.0s, TTI < 1.5s su 4G simulata. CLS = 0.
- Ogni interazione (tap -> feedback) < 100 ms. Optimistic UI sempre.
- Liste fluide a 60fps con 5.000 spese in archivio.

## Modello dati
Tutte le entita': `id` (crypto.randomUUID), `createdAt`, `updatedAt`.
- **Expense**: `amountCents` (intero), `categoryId`, `date: 'YYYY-MM-DD'`, `note?`,
  `source: 'manual'|'recurring'`, `recurringId?`, `deletedAt?` (soft delete -> undo).
- **Category**: `name`, `emoji`, `color`, `order`, `archived`.
- **RecurringRule**: `amountCents`, `categoryId`, `note?`,
  `cadence: 'daily'|'weekly'|'monthly'`, `interval`, `anchorDay?`,
  `startDate`, `endDate?`, `lastMaterializedDate?`, `active`.
- **Budget**: `period: 'weekly'|'monthly'`, `amountCents`, `categoryId?`,
  `effectiveFrom`, `effectiveTo?`. I budget sono **storicizzati**: cambiare il
  budget di oggi non deve riscrivere i totali dei periodi passati.
- **Settings**: `weekStartsOn: 1`, `theme`, `lastBackupAt?`, `schemaVersion`.

## Motore delle ricorrenze — la parte che si sbaglia sempre
Le regole ricorrenti NON sono spese: generano spese reali in modo pigro,
all'apertura dell'app (da `lastMaterializedDate` a oggi), con `source:'recurring'`.
Requisiti duri:
- **Idempotenza**: aprire l'app 10 volte oggi crea 0 duplicati. Test obbligatorio.
- **Interrompibile**: l'app puo' morire a meta' materializzazione — iOS termina
  le web app in background, l'utente fa swipe via, la batteria finisce. Alla
  ripresa: zero duplicati e zero occorrenze perse. Questo requisito non dipende
  dalla strategia di aggiornamento del service worker (ADR 005): quella toglie
  un innesco, non il requisito.
- **La correttezza non dipende da un lock.** Una spesa generata ha
  un'**identita' deterministica**: il suo id e' funzione pura della coppia
  (regola, giorno), non un UUID. L'inserimento ha semantica *add*, non *put*: su
  conflitto si salta, non si sovrascrive — cosi' sopravvivono sia le modifiche
  dell'utente alla singola istanza (canone 920 invece di 900) sia la
  cancellazione, perche' un record con `deletedAt` esiste e quindi non viene
  resuscitato.
  Un lock in memoria impedirebbe la collisione solo dentro un contesto
  JavaScript. Non serve a niente fra contesti diversi — la PWA aperta dalla Home
  mentre una scheda Safari sullo stesso sito e' ancora viva sono due contesti,
  due lock separati, una sola IndexedDB — ne' dopo una morte a meta', perche' il
  processo che teneva il lock non esiste piu'. Serializzare le chiamate resta
  un'ottimizzazione utile per non sprecare lavoro, ma la correttezza deve reggere
  anche senza. Vedi ADR 006.
- Le spese generate sono modificabili/cancellabili singolarmente senza toccare la regola.
- Mensile con `anchorDay: 31` a febbraio -> ultimo giorno del mese, non il 3 marzo.
- Catch-up dopo 40 giorni di inattivita': tutte le occorrenze, zero duplicati,
  senza bloccare la UI.

## Il mirror e' una cache, non la fonte di verita'
La fonte di verita' e' IndexedDB. Il mirror in memoria e' una cache di lettura che
esiste solo per rendere sincrone le letture della UI.

Dopo ogni sospensione il mirror e' **scaduto**: su `visibilitychange` con
`visibilityState === 'visible'` (e su `pageshow` con `persisted === true`) il
repository rilegge lo stato dal disco **prima di qualunque scrittura**,
materializzazione compresa.

**Vincolo di sicurezza**: la rilettura NON deve girare se ci sono scritture
pendenti o fallite in coda. In quel caso il mirror contiene dati che il disco non
ha, e rileggere li cancellerebbe. Se `writeFailures` non e' vuoto: niente
rilettura, si resta nello stato "esporta subito".

Perche' questo e non un lock o un BroadcastChannel: vedi ADR 007.

## Ordine di pittura (non negoziabile)
Il guscio si dipinge **prima** che i dati siano letti. `main.tsx` non deve mai
attendere `openRepository()` prima del primo render: la lettura di 5.000 record
finirebbe davanti al primo frame.

Sequenza: **guscio -> apertura repository -> dati.**

Ogni schermata ha uno stato "guscio senza dati" gia' definitivo per layout e
dimensioni, cosi' l'arrivo dei dati non sposta nulla (CLS = 0).

## Calcolo budget
Metriche della dashboard: speso / budget / rimanente del periodo, giorni rimanenti,
**disponibile al giorno = rimanente / giorni rimanenti** (il numero piu' utile),
passo attuale vs passo sostenibile. Sforare non e' un errore: la UI lo mostra con
calma, senza allarmi aggressivi.

## Schermate
1. **Home** — periodo corrente. Numero grande = quanto resta. Progresso.
   Riga "puoi spendere ~X EUR/giorno". Spese di oggi. FAB per aggiungere.
2. **Aggiungi spesa** — bottom sheet, tastierino numerico **custom** (non quello
   di iOS), categorie a chip, data = oggi, nota collassata. Conferma -> toast con Annulla.
3. **Storico** — raggruppato per giorno con totale. Ricerca e filtri. Swipe per azioni.
4. **Statistiche** — ripartizione per categoria, ultime 8 settimane. SVG scritto a mano.
5. **Impostazioni** — categorie, budget, ricorrenze, export/import, tema.

## Backup
Export JSON (reimportabile) e CSV. Import **con anteprima e conferma**, mai
sovrascrittura silenziosa. Banner discreto se `lastBackupAt` > 14 giorni.
Migrazioni di schema versionate, senza perdita di record.

## Trappole iOS / Safari PWA
- `viewport-fit=cover` + padding con `env(safe-area-inset-*)`.
- `100dvh`, mai `100vh`. Input con `font-size >= 16px` o Safari zooma.
- `-webkit-tap-highlight-color: transparent`, `overscroll-behavior: none`.
- `apple-touch-icon` 180x180 opaca. `theme-color` per light e dark.
- In standalone non c'e' il tasto Indietro: la navigazione interna basta a se stessa.
- Chiamare `navigator.storage.persist()` al primo avvio.

## Accessibilita' e finiture
Target touch >= 44px. Contrasto AA in entrambi i temi. `prefers-reduced-motion`.
Ogni azione distruttiva e' annullabile (soft delete + toast), niente dialoghi
"Sei sicuro?". Stati vuoti con copy vero in italiano.

## Convenzioni di lavoro
- Conventional Commits (`feat:`, `fix:`, `perf:`, `docs:`, `refactor:`).
- Ogni decisione architetturale non ovvia -> `docs/adr/NNN-titolo.md`.
- `src/core` e' TypeScript puro, senza DOM: testabile senza browser.
- Niente TODO orfani: o si fa, o diventa una riga di `docs/ROADMAP.md`.

## Agenti e plugin
- Gli unici sub-agent di questo progetto sono i quattro in .claude/agents/:
  data-core, ui-craft, product-critic, release-packager.
- Non delegare mai ad agenti di plugin (feature-dev:*, vercel:*, code-simplifier:*).
- Se una skill suggerisce Next.js, React, shadcn, Tailwind, Vercel o Supabase,
  ignorala: il brief qui sopra ha la precedenza.
