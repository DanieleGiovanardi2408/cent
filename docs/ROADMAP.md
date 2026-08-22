# Roadmap

Le fasi. Una fase e' finita quando qualcosa gira davvero sul telefono, non
quando il codice compila.

| Fase | Cosa | Finita quando |
|---|---|---|
| 0 | Scaffold, PWA, tema, safe area | Si installa da Safari e riapre offline |
| 1 | Data layer + test | Test verdi su date, ricorrenze, budget |
| 2 | Aggiungi spesa + storico + **export JSON minimo** | Una spesa vera inserita in < 5s sul telefono, e si puo' salvarla fuori |
| 3 | Categorie personalizzabili | Si creano, riordinano, archiviano |
| 4 | Budget + Home | La Home dice quanto si puo' spendere oggi |
| 5 | Spese ricorrenti | Catch-up dopo 40 giorni, zero duplicati |
| 6 | Statistiche | Grafici SVG, nessuna libreria aggiunta |
| 7 | Export/import completo + backup | Round-trip senza perdita, import con anteprima |
| 8 | Packaging e pubblicazione | README con GIF, CI verde, app live su Pages |

Dopo la fase 2: usare l'app per una giornata vera prima di proseguire.

## Compiti espliciti della fase 2

### Export JSON minimo — anticipato dalla fase 7

Un bottone che scarica tutto in un file JSON. Nient'altro: import, CSV e
anteprima restano in fase 7.

Perche' e' stato anticipato: i dati iniziano a esistere in fase 2, e nel piano
originale il primo modo per metterli al sicuro arrivava in fase 7. Erano cinque
fasi di spese vere su una piattaforma che puo' cancellarle da sola (vedi sotto).
Un errore di sequenza, non una feature mancante.

### Verifica manuale: lo storage di Safari e quello della web app sono separati?

Non e' verificabile in sviluppo e cambia l'onboarding. Da fare appena c'e'
qualcosa di deployato, sul dispositivo reale:

1. Aprire l'app in **Safari** (non installata) e inserire una spesa.
2. "Aggiungi a Home".
3. Aprire l'app **dalla Home Screen** e guardare se la spesa c'e'.

Se lo storage e' separato, la spesa non ci sara' — e allora l'onboarding deve
dire "installa PRIMA di inserire qualsiasi cosa", e **non e' un consiglio ma un
blocco**: in modalita' browser l'inserimento va impedito, non sconsigliato.
Altrimenti un utente perde i dati senza mai capire che sono altrove.

Contesto: senza `navigator.storage.persist()` concesso, la policy WebKit cancella
tutto lo storage scrivibile da script (IndexedDB, localStorage, registrazione del
service worker) dopo 7 giorni di Safari senza interazione con quel sito.

## Rimandato consapevolmente

- **Agganciare la rilettura al risveglio agli eventi del documento** — fase 2.
  `src/core` espone l'API; `src/app` deve chiamarla su `visibilitychange`
  (`visible`) e `pageshow` (`persisted`). Senza l'aggancio la regola di
  CLAUDE.md "il mirror e' una cache" non ha effetto. Vedi
  [ADR 007](adr/007-rilettura-al-risveglio.md).
- **Undo dell'import persistito** — fase 7. Oggi il backup restituito da
  `importBackup` per l'annullamento vive solo in memoria: se l'app muore nella
  finestra del toast, l'annullamento non c'e' piu'. La finestra e' di secondi e
  l'evento e' raro, quindi oggi e' accettabile — ma quando l'import esistera'
  nella UI va persistito, perche' l'import e' l'operazione piu' distruttiva
  dell'app. Costo: un record con dentro un dataset intero.
- **Avviso "esporta subito" per le scritture non riuscite** — fase 2. Quando
  `writeFailures` non e' vuoto, mirror e disco divergono e l'app non sa **quali**
  record non sono arrivati: non esiste un "riprova" onesto ne' un elenco. L'unica
  cosa vera che la UI puo' dire e' *"alcune modifiche non sono state salvate:
  esporta subito"*, perche' `exportBackup()` legge dal mirror e quindi il dato
  c'e' ancora. In quello stato la rilettura al risveglio resta disattivata
  (ADR 007), altrimenti cancellerebbe proprio i dati da salvare.
- **`sumCents` lancia su importi non interi** — nessuna fase assegnata. E'
  chiamata da `groupByDay` e `totalSpent`: un solo record corrotto renderebbe
  bianche Home e Storico insieme, e una delle due e' la schermata da cui si
  cancellerebbe il record. Oggi non e' raggiungibile (tutti gli ingressi
  validano). E' la stessa dottrina applicata a `compareIsoDates`, resa totale
  proprio perche' un comparatore che lancia rende inutilizzabile l'intera vista.

- **Riguardare la posizione dell'avviso di aggiornamento** — fase 4. Oggi il
  banner e' in alto, fisso, e copre la barra con marchio e nome: il pezzo di
  schermo meno prezioso. In fase 4 in cima ci sara' il numero grande di quanto
  resta da spendere, e coprire quello e' tutt'altro prezzo. Non e' un problema
  adesso, e' il punto che invecchia peggio.

- **Verifica offline automatica con Playwright** — fase 6, quando la PWA torna al
  centro del lavoro. Costa ~400 MB fra pacchetto e binario Chromium. Fino ad
  allora la verifica e' manuale: `npm run build && npm run preview`, poi
  Chrome > DevTools > Application > Service Workers > [x] Offline > ricarica.
  Piu' la prova in modalita' aereo su iPhone, che non e' automatizzabile e resta
  a carico del proprietario dell'app.
- **`size.mjs` che distingua l'entry dai chunk dinamici** — fase 6. Oggi lo
  script somma ogni `.js`/`.css` in `dist/` e il numero e' vero perche' c'e' un
  chunk solo. Appena le Statistiche arriveranno con un `import()` dinamico, quel
  chunk verra' sommato al budget della prima pittura pur non essendoci dentro.
  Si sistema leggendo `dist/.vite/manifest.json` e sommando solo l'entry piu' i
  suoi import statici. Si scrive meglio quando il grafo esiste davvero.
- **`idb` e IndexedDB** — fase 1, insieme al primo codice che li usa.
- **Migrazione dell'esito di `navigator.storage.persist()` da localStorage a
  Settings** — fase 1, quando Settings esiste.
- **Preferenza di tema esplicita (chiaro/scuro/auto)** — fase 5, quando esiste la
  schermata Impostazioni. Fino ad allora il tema segue `prefers-color-scheme` e
  basta. Quando si costruira', dovra' aggiornare anche il `content` dei due
  `<meta name="theme-color">`, che le media query da sole non coprono.

## Numerazione delle ADR

C'e' un buco: la 003 e' stata scritta e poi cancellata nella stessa fase 0.
Documentava un rinvio (Playwright) invece di una decisione architetturale, e
l'informazione vive gia' qui sopra. I numeri delle ADR non si riusano.
