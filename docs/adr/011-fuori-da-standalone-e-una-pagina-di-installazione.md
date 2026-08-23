# ADR 011 — Fuori da standalone, Cent e' una pagina di installazione

Data: 2026-08-23
Stato: accettata

## Il fatto, accertato sul dispositivo

**Su iOS lo storage di Safari e quello della web app installata sono sandbox
separate.** Non e' piu' un'ipotesi da verificare: e' stato provato sul telefono.

La verifica era prevista in `docs/ROADMAP.md` fin dalla fase 2, insieme alla
conseguenza da applicare nel caso risultasse separato: **impedire, non
sconsigliare**.

## Il problema che ne deriva

Una spesa inserita in Safari e' invisibile all'app installata — sono due database
diversi — **e** cancellabile da WebKit dopo sette giorni senza interazione, perche'
quella policy vale per i siti e non per le app installate.

Sono due modi di perdere dati, non uno. E il secondo colpisce esattamente chi ha
usato l'app per qualche giorno e poi l'ha lasciata li'.

## Decisione

Fuori da standalone, Cent non e' una versione ridotta dell'app: **e' una pagina di
installazione**.

Niente FAB, niente tastierino, **nessun percorso che scriva**. La pagina contiene
il nome, cosa fa l'app, i tre passi per installarla, e **il motivo nella copy**:

> I dati vivono nell'app installata. Quello che scrivi qui non ci arriverebbe.

Il motivo non e' ornamentale. **Un divieto senza ragione si legge come un
difetto**: chi trova un'app che si rifiuta di funzionare pensa che sia rotta, non
che lo stia proteggendo.

Non e' una privazione: e' l'unica versione onesta. L'alternativa — lasciare
scrivere e avvisare — offrirebbe un'app che accetta dati che non arriveranno mai
dove l'utente crede, e che spariranno da soli.

## Rilevamento

**Sia `navigator.standalone` (iOS) sia `matchMedia('(display-mode: standalone)')`,
non uno solo.** Il primo esiste solo su Safari iOS, il secondo e' lo standard: da
soli coprono insiemi diversi di casi.

## Il gate non vale in sviluppo

Si applica **all'origine di produzione**, non ovunque. Su `localhost` e in rete
locale il browser e' l'unico modo di lavorare sull'app, e bloccarlo li'
renderebbe il progetto non sviluppabile.

In quel contesto il segnale resta la banda "non su HTTPS: service worker assente",
che esiste gia'.

## Conseguenze sui test

Due, ed entrambe sono scelte di onesta', non dettagli:

1. **Il blocco romperebbe tutti i test end-to-end**, che girano in un browser
   normale. La soluzione **non** e' un'eccezione nel codice di produzione per far
   passare i test: sono i **test a dichiarare il proprio contesto**, con un
   `addInitScript` che imposta `navigator.standalone` prima del caricamento. Il
   gate in produzione resta vero e i test restano onesti. E' lo stesso principio
   di "Cuciture per i test" in CLAUDE.md: la cucitura si apre dove si compone, non
   dentro la regola.
2. **Serve un test che eserciti lo stato bloccato**: senza standalone forzato, la
   pagina mostra le istruzioni e **non esiste nessun bersaglio che scriva**. Un
   divieto che nessuno verifica non e' un divieto — e' una riga di codice che
   qualcuno rimuovera' credendola morta.
