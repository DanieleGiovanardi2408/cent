# ADR 009 — Su iOS l'avvio non e' un evento affidabile

Data: 2026-08-23
Stato: accettata

## Contesto

Alla fase 4 e' stato chiesto se l'app debba aprirsi direttamente sul tastierino
invece che sulla Home. Il conteggio dei tap diceva di si': porterebbe il flusso da
due tap a uno, meglio dell'obiettivo che ci siamo dati.

La decisione e' stata **no, resta la Home**. Ma la decisione conta meno della
ragione, che e' riutilizzabile ogni volta che qualcuno proporra' un comportamento
legato all'avvio.

## Il fatto

**Il tap sull'icona, su una PWA in background, non riesegue `load`.**

iOS non riavvia una web app che ha ancora in memoria: la riprende. Quindi
qualunque comportamento agganciato all'avvio — aprire un foglio, mostrare un
messaggio, portare l'utente su una schermata invece che un'altra — si verifica
**solo agli avvii a freddo**, cioe' solo quando iOS ha deciso di uccidere l'app
per liberare memoria.

## La conseguenza, che e' la parte riutilizzabile

**Lo stesso gesto darebbe due schermate diverse a seconda di una cosa che
l'utente non puo' vedere ne' prevedere.**

Non e' un difetto di coerenza estetica. Un'interfaccia che risponde in due modi
allo stesso gesto non costa un tap: costa la fiducia nel gesto. L'utente smette di
sapere cosa succedera' quando tocca l'icona, e da quel momento la tocca con
attenzione invece che per riflesso — che e' esattamente il contrario di cio' che
serve a un'app che deve costare meno di cinque secondi.

L'unica alternativa coerente sarebbe eseguire quel comportamento a **ogni**
risveglio, non solo agli avvii a freddo. Ma allora ogni volta che si guarda l'app
per qualsiasi motivo bisogna prima annullare il comportamento — e il costo si
sposta su chi apre l'app per leggere, che e' il caso piu' frequente in assoluto.

## Regola

**Nessun comportamento che cambi la schermata o apra qualcosa puo' essere
agganciato all'avvio.** Se una cosa deve succedere quando l'app torna in primo
piano, deve succedere a **ogni** ritorno in primo piano (`visibilitychange`), ed
essere abbastanza discreta da non dare fastidio quando si ripete.

Cio' che *deve* stare al risveglio e' la **riconciliazione**, non l'interfaccia:
rileggere il disco (ADR 007), ricalcolare il giorno civile, riconciliare i timer
(CLAUDE.md, "Stato dell'interfaccia e sospensione"). Sono tutte cose invisibili
finche' non cambiano un dato, ed e' per questo che possono ripetersi.

## Un secondo argomento, indipendente

Aprire sul tastierino significa che **ogni apertura accidentale atterra nello
stato in cui un tap su un chip scrive un record**, perche' per ADR 004 il chip
delle categorie *e'* la conferma. La Home non ha stati distruttivi.

Vale come regola a se': la schermata in cui l'app si trova senza che nessuno
l'abbia scelta non deve contenere azioni che scrivono.

## Se un giorno si volesse riaprire la questione

Non con un ragionamento, con un dato: se le aperture che finiscono in una spesa
entro dieci secondi superassero nettamente quelle che finiscono senza. E anche
allora la risposta piu' probabile non e' cambiare la schermata iniziale — e'
rendere piu' economico l'ingresso al foglio, che non ha nessuno dei due problemi
qui sopra.
