# Messaggi da incollare in Claude Code

Questo file non serve a Claude: serve a te, per copiare i messaggi al momento giusto.

---

## 1. PRIMO MESSAGGIO (fase 0)

Leggi CLAUDE.md: contiene il brief completo del progetto. In .claude/agents/ trovi
quattro sub-agent (data-core, ui-craft, product-critic, release-packager): usali,
non fare tu il lavoro che e' di loro competenza.

Tu sei il coordinatore. Il tuo compito e' dividere il lavoro, passare agli agenti il
contesto che serve (hanno memoria separata dalla tua) e tenere il progetto coerente.

Lavoriamo per fasi. Alla fine di ogni fase ti fermi, lanci product-critic, mi riporti
il suo report e aspetti la mia risposta prima di iniziare la fase successiva.
Non incatenare le fasi da solo.

Regola trasversale: ogni fase termina con qualcosa che gira davvero sul telefono.
Niente fasi che producono solo impalcatura.

FASE 0 — Fondamenta (falla adesso)
- Scaffold Vite + TypeScript strict + Preact, vite-plugin-pwa, Vitest.
- Struttura: src/core (dominio, agente data-core), src/ui (agente ui-craft),
  src/app (composizione e routing).
- Token CSS di base, tema chiaro e scuro, layout mobile con safe area.
- Una schermata che mostra "Ciao" e si installa da Safari su iPhone.
- Verifica: npm run build passa, bundle < 60 KB gzip, il service worker si registra,
  la seconda apertura funziona in modalita' aereo.

Prima di scrivere codice, dimmi in massimo 15 righe come intendi strutturare le
cartelle e quali dipendenze installi. Se una scelta del brief ti sembra sbagliata,
dimmelo ora, non dopo.

---

## 2. GATE DI REVIEW (da incollare alla fine di ogni fase)

Fase completata. Prima di procedere:

1. Lancia product-critic sul lavoro di questa fase. Passagli il contesto: cosa e'
   stato costruito, quali file sono cambiati, cosa e' dichiarato "finito".
2. Esegui la build e riportami: peso del bundle gzip, numero di test, test falliti.
3. Riportami il report del critico integralmente, senza addolcirlo.
4. Poi dammi la tua raccomandazione: cosa correggere adesso, cosa rimandare a
   ROADMAP, cosa ignorare — e perche'.

Non iniziare la fase successiva. Aspetta la mia risposta.

---

## 3. PROMPT DI RIFLESSIONE (quando vuoi)

Fermati. Chiama product-critic con questa domanda: dato quello che l'app fa oggi,
qual e' la singola cosa che rende l'esperienza peggiore per chi la usa
quotidianamente? Non la feature piu' mancante — l'attrito piu' grande in quello che
gia' c'e'. Voglio una risposta sola, con lo scenario concreto che la dimostra.

---

## 4. LE FASI

| Fase | Cosa | Fatto quando |
|---|---|---|
| 0 | Scaffold, PWA, tema, safe area | Si installa da Safari e riapre offline |
| 1 | Data layer + test | Test verdi su date, ricorrenze, budget |
| 2 | Aggiungi spesa + storico | Inserisci una spesa vera in < 5s sul telefono |
| 3 | Categorie personalizzabili | Crei, riordini, archivi categorie tue |
| 4 | Budget + Home | La Home dice quanto puoi spendere oggi |
| 5 | Spese ricorrenti | Catch-up dopo 40 giorni, zero duplicati |
| 6 | Statistiche | Grafici SVG, nessuna libreria aggiunta |
| 7 | Export/import + backup | Round-trip senza perdita, import con anteprima |
| 8 | Packaging e pubblicazione | README con GIF, CI verde, app live su Pages |

Dopo la fase 2: metti l'app sul telefono e usala per una giornata vera prima di
andare avanti.
