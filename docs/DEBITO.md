# Debito

**Cosa ci sta**: difetti noti, accettati e non ancora riparati. Ognuno con la
ragione per cui e' accettabile oggi e la condizione che lo rende non piu'
accettabile.

**Cosa non ci sta**: le cose da fare (quelle stanno in [ROADMAP.md](ROADMAP.md)) e
le decisioni (quelle stanno nelle [ADR](adr/)). Un debito non e' un compito
rimandato: e' qualcosa che **e' rotto adesso** e che abbiamo scelto di tenere.

## Perche' questo file esiste

Il messaggio di commit di `888699a` si chiudeva cosi', a proposito di alcune copie
che parafrasavano: *"Quattro erano gia' false e sono chiuse. **Le altre sono
elencate come debito.**"*

**Non erano elencate da nessuna parte.** L'elenco esisteva nella sessione che lo
aveva prodotto, ed e' morto con lei. Quando una sessione nuova e' andata a
cercarlo — perche' il messaggio glielo prometteva — non c'era niente da leggere.

La citazione sta qui come **reperto della promessa non mantenuta**, non come dato:
i numeri che quel messaggio portava sono rimasti nel messaggio, e un numero che
vive solo li' non e' una misura. Il conteggio vero e' quello della sezione 1, fatto
da capo.

E' la stessa curva di lettura di un campo senza produttore: **scritto una volta,
letto mai.** Un messaggio di commit e' l'ultimo posto in cui mettere qualcosa che
va riletto, perche' e' il solo posto del repository dove nessuno guarda due volte.

### La regola, che vale da adesso

- **Il debito si dichiara in un file.** Un messaggio di commit puo' **rimandarci**,
  mai contenerlo.
- **Un elenco che un commit dichiara esistente deve esistere prima del commit.**
  Se la frase "sono elencate come debito" e' vera, l'elenco e' gia' in questo file
  quando quella frase viene scritta.

---

## 1. Le copie che parafrasano

**Stato: aperto.** Riderivate il 26 agosto 2026 rifacendo la passata da zero,
perche' l'elenco originale non e' mai stato scritto.

### Cos'e' una copia che parafrasa

Una chiave il cui testo **ridice a parole proprie un fatto gia' espresso altrove**
— da un'altra chiave, da un valore composto, o da una costante in `src/core`.

Il difetto non e' la ripetizione: e' che **cambiare il fatto richiede di
modificare piu' di un posto**, e dimenticarne uno lascia una falsita' silenziosa
davanti all'utente. E' esattamente cosi' che sono nati i quattro difetti chiusi in
`888699a`: nessuno li ha introdotti, e' cambiato cio' che gli stava intorno.

### Il conteggio

**18 copie in 9 famiglie.** Di queste, **16 non sono dichiarate** — nessun commento
avverte che esiste un'altra copia da tenere allineata.

**Questo e' il dato**, e non si confronta con niente. Il messaggio di commit che
prometteva l'elenco portava anche un conteggio, ma un numero in un messaggio di
commit non e' una misura: e' una frase in un posto che abbiamo appena smesso di
considerare memoria. Non esiste in nessun file, quindi non c'e' niente con cui
confrontarsi — e riportarlo qui, fosse anche solo per contraddirlo, gli
restituirebbe l'autorita' che gli stiamo togliendo.

### La conclusione che il numero porta

Diciotto copie in nove famiglie **non sono quattro correzioni: sono una regola
mancante.** Ripararle una a una lascerebbe in piedi la causa, ed e' gia' successo —
`888699a` ne ha chiuse quattro, e tutte le altre sono rimaste esattamente dov'erano
— compresa una che era la **gemella esatta** di una appena riparata (1.7) e una che
era **falsa allo stesso modo** di un'altra corretta quindici righe piu' su nella
stessa schermata (1.10).

**La forma della regola, presa da cio' che `888699a` ha fatto quando ha funzionato:**
un fatto ha **una casa**, e chi lo ridice lo **compone dalla stessa fonte** invece
di riscriverlo. `toast.catInUse` e' stato riparato cosi' — non correggendone la
frase, ma facendogli usare `{what}`, cioe' **la stessa lista** che il foglio
costruisce. Dove comporre non si puo', il fatto resta in una chiave sola e le altre
schermate la **citano**, non la parafrasano.

---

### 1.1 — "Archiviare toglie dalla griglia, non dalle spese"

**Cinque chiavi, quattro copie.** La casa e' `settings.cats.archivedText`: sta nella
sezione "In archivio", cioe' dove il fatto vive.

| chiave | |
|---|---|
| `settings.cats.archivedText` | **la casa** |
| `settings.cats.text` | coda: *"Archiviarne una la toglie dalla griglia, non dalle spese che l'hanno usata"* |
| `cat.swap.text` | *"Quella che tocchi va in archivio: resta su tutte le spese che l'hanno usata"* |
| `cat.archive.note` | *"resta su ogni spesa che l'ha usata, e continui a vederla nello Storico"* |
| `cat.inUse.text` | coda: *"Archiviala: esce dalla griglia e lo Storico resta intero"* |

**Perche' e' la famiglia piu' pericolosa**: e' la stessa in cui e' nato uno dei
quattro difetti chiusi. `settings.cats.archivedText` diceva *"lo Storico **e le
statistiche** continuano a mostrarle"*, con le statistiche che non esistono. E'
stato corretto **li'** — e le altre quattro copie non sono state guardate.

**Oggi tutte e cinque sono vere.** Il debito e' che sono cinque.

### 1.2 — "I dati stanno solo su questo telefono"

**Tre chiavi, due copie.** La casa e' `settings.data.text`: sta in "I tuoi dati",
accanto al bottone di export che e' la conseguenza del fatto.

- `settings.data.text` — **la casa**
- `install.lead` — *"senza rete, senza account, e i dati restano sul telefono"*
- `nudge.hint` — *"I dati stanno solo qui."*

**Nota**: `nudge.hint` e' corta di proposito (la banda dev'essere discreta) e questa
e' una ragione buona. Non toglie che il fatto sia scritto tre volte a mano.

### 1.3 — "Le spese fisse stanno fuori dal budget" (ADR 016)

**Tre chiavi, due copie.** La casa e' `hero.fixed`: e' la riga che ADR 016 §2
impone accanto al numero grande, ed e' l'unica delle tre **composta con l'importo
vero**.

- `hero.fixed` — **la casa**
- `fixed.text` — *"le tiene fuori dal budget, perche' non sono una decisione"*
- `amount.fixed` — *"Resta una spesa fissa: correggerla non tocca il budget del periodo"*

**Perche' preoccupa piu' delle altre**: ADR 016 §2 dice che *"un'esclusione taciuta
e' un numero che mente per omissione"*. Se un giorno l'esclusione cambiasse, due di
queste tre continuerebbero a dichiararla — e la piu' pericolosa e' `amount.fixed`,
che compare **mentre l'utente sta correggendo un importo**, cioe' nel momento in cui
sta decidendo se fidarsi del numero.

### 1.4 — "Si segna una spesa in due tap"

**Due chiavi sono la casa, tre la copiano.** Le istruzioni vere sono `add.hint.type`
e `add.hint.pick`, che stanno nel foglio, si mostrano **al momento giusto** e sono
agganciate allo stato (spariscono dopo tre spese salvate).

- `add.hint.type` + `add.hint.pick` — **la casa**
- `home.blank.text`
- `history.blank.text` — **quasi verbatim** di `home.blank.text`: cambia una parola
  (*"digita l'importo"* / *"digita quanto hai speso"*), il resto e' identico,
  virgole comprese
- `install.lead` — testa: *"segna le spese di ogni giorno in due tap"*

**Il caso peggiore della famiglia** e' `home.blank.text` / `history.blank.text`: due
chiavi che dicono la stessa frase con una parola di scarto. Non e' una parafrasi di
un fatto, e' una **copia di una stringa**, e la prima correzione di copy che ne
tocca una sola le fa divergere senza che niente se ne accorga.

### 1.5 — "La guida ha due schede"

**Il numero 2 e' scritto a mano in tre posti indipendenti**, e la casa e' il codice.

- `Guide.tsx` — **la casa**: `const last = card === 1`, e i ternari `card === 0 ? … : …`
- `guide.step` — *"Passo {index} di 2"*, in **entrambi** i dizionari
- `settings.guide.text` — *"Le **due** cose che in Cent non si indovinano"*

**Perche' non e' teorico**: la terza scheda e' stata **tagliata**, non esclusa per
sempre — il commento in `it.ts` lo dice (*"Due schede, non tre: la terza — i dati
restano su questo telefono — e' stata tagliata"*) e la ROADMAP la contempla. Il
giorno che tornasse, chi la aggiunge tocca `Guide.tsx` e si ritrova **"Passo 1 di 2"
su tre schede** e *"le due cose"* che sono tre.

E' la stessa forma dell'elenco di tag della sonda, tolto in `888699a` perche'
*"un'enumerazione scritta al tempo t e applicata al tempo t+n"*.

### 1.6 — "Otto e' il tetto"

**Una copia di una costante di dominio.**

- `MAX_ACTIVE_CATEGORIES = 8` in `src/core/categories.ts` — **la casa**
- `settings.cats.text` — *"Otto in griglia, e otto e' il massimo"*, in entrambi i
  dizionari

Il tetto e' un vincolo che CLAUDE.md dichiara *"vero per costruzione invece che per
disciplina"*. La frase che lo spiega all'utente, invece, e' vera per disciplina.

### 1.7 — "Una regola con spese non si cancella, si disattiva"

**Tre chiavi, due copie**, e qui c'e' il reperto piu' netto di tutta la passata.

- `rule.inUse.one` / `rule.inUse.other` — **la casa**: compongono col numero vero,
  `deletion.expenses`
- `rule.delete.note` — *"Si puo' solo finche' non ha nessuna spesa nello Storico"*
- `toast.ruleInUse` — *"Ha gia' creato delle spese: si puo' solo disattivare"*

**`toast.ruleInUse` e' la gemella esatta di `toast.catInUse`**, che `888699a` ha
riparato. Prima diceva *"Qualche spesa la usa ancora"*; adesso dice *"La usa
{what}"*, componendo la stessa lista del foglio. Il commento scritto sopra la
correzione spiega la ragione — *"`{what}` e' la stessa lista che il foglio mostra
sul rifiuto, non una parafrasi"* — e **non nomina le categorie**.

Quindi vale identico per le regole, e per le regole non e' stato applicato. E' la
sezione *"Una decisione vale dove vale il suo argomento"* di CLAUDE.md, colta in
diretta: la correzione e' stata fatta **dove la ragione era scritta**, non dove la
ragione valeva.

### 1.8 — "Cosa controlla `planCategoryDeletion`" — **dichiarata**

- `cat.inUse.text` `{what}` — **la casa**, composta
- `cat.delete.note` — enumera a mano: *"nessuna spesa, nessuna spesa fissa"*

**Dichiarata**: sopra la chiave c'e' un commento che dice *"L'elenco qui e' lo stesso
che `planCategoryDeletion` controlla, e per questo va riletto ogni volta che quello
cambia"*. E' una copia con un avviso attaccato — che e' meglio di una copia muta e
peggio di nessuna copia. Resta qui perche' il conteggio deve essere onesto.

### 1.9 — "Ultimo backup / mai esportato" — **dichiarata e voluta**

- `nudge.never` / `nudge.since` — la banda
- `settings.data.never` / `settings.data.last` — la schermata

Il commento dice che sono *"la stessa informazione che accende il promemoria, detta
dove si esporta"*, e che sono corte nella banda e lunghe in Impostazioni **di
proposito**. **Non e' un difetto**, ed e' elencata solo perche' il numero 18 sia
verificabile: chi lo ricontrolla deve trovare le stesse diciotto.

### 1.10 — Non una parafrasi, ma lo stesso difetto: `cat.color.note` **e' falsa oggi**

    it: 'Otto colori e non uno qualunque: e' la stessa scala dei grafici, scelta
         perche' resti distinguibile anche a chi confonde rosso e verde.'
    en: 'Eight colours, not any colour: it is the same scale the charts use, …'

**I grafici non esistono.** Le statistiche sono la fase 6.

Questa e' **letteralmente lo stesso difetto** di uno dei quattro chiusi in
`888699a`: `settings.cats.archivedText` prometteva *"lo Storico e le statistiche"* ed
e' stato corretto togliendo le statistiche. La stessa promessa, nella stessa
schermata, a quindici righe di distanza, e' rimasta.

**CHIUSA il 26 agosto 2026.** Adesso dice *"Otto colori, non otto a caso: scelti
perche' restino distinguibili fra loro anche a chi confonde rosso e verde"* — un
fatto che si verifica guardando lo schermo. Che quegli otto diventeranno la palette
dei grafici resta il progetto (CLAUDE.md, "Colori delle categorie"): si dira'
quando i grafici ci saranno.

### Come si e' arrivati a ripararla, che e' la parte che vale

Era stata lasciata aperta con questa motivazione: *"toccare una stringa che la
suite e2e guarda impone di rieseguire la e2e, e la e2e non si puo' lanciare per via
del disco."*

**La conclusione era prudente e la premessa non era stata controllata.** Il
controllo costava dieci secondi — cercare la chiave e frammenti del suo testo dentro
`tests/e2e/` — e l'esito e': **nessuna spec la nomina**, in nessuna delle due
lingue, e in produzione la legge un solo posto (`CategorySheet.tsx:352`).

*"Non posso verificarlo"* e' **una dichiarazione di irraggiungibilita'**, e questo
progetto le tratta tutte allo stesso modo: si nomina chi produce quello stato, non
si assume. Vedi CLAUDE.md, controllo C. Una prudenza non e' un fatto, e decidere su
una prudenza lascia a schermo una frase falsa per una ragione che nessuno ha
guardato.

---

## 2. Residui di premesse gia' corrette nel codice

**Stato: chiuso il 26 agosto 2026** — vedi il commit che accompagna questo file.
Elencato perche' la forma si ripresentera'.

`888699a` ha ritirato dal codice una premessa falsa — *"il campo `date` l'utente
puo' cambiarlo"* — sostituendola con le due ragioni vere, in **due** punti di
`recurrence.ts`. Il commento corretto diceva pero': *"Qui c'era scritto — **e sta
anche in ADR 022** — che `date` l'utente puo' cambiarla."*

**E in ADR 022 ci stava ancora.** La correzione era stata applicata dove il codice
la usava e non dove l'argomento era scritto, cioe' l'inverso del difetto 1.7 e la
stessa malattia.

**La forma da riconoscere**: quando una correzione dichiara *"questo stava anche
in X"*, X e' parte della correzione, non una nota.

---

## 4. `a8fee93` usa `--no-verify` e non lo dichiara nel messaggio

**Stato: aperto.** Si chiude **il giorno in cui `tsc` torna verde**, non prima.

La regola, decisa il 28 agosto: **`--no-verify` e' ammesso quando si salva un
albero, mai quando se ne spedisce uno — e va scritto nel messaggio del commit, non
solo nel resoconto.** Un resoconto vive in una conversazione; il messaggio resta
nel repository, ed e' l'unico posto dove chi fa `git log` fra sei mesi puo'
scoprire che quel commit non e' passato dalla guardia.

Due commit del 27 agosto l'hanno usato per salvare l'albero prima della fine dei
crediti, con `tsc` rosso su un helper lasciato a meta':

- **`758af03`** — lo **dichiara** nel messaggio, con la ragione (l'hook esiste per
  impedire che un albero a meta' finisca su main, e quel commit andava su un ramo
  che a main non arriva). A posto.
- **`a8fee93`** — **non lo dichiara**. E' il difetto.

**Non si riscrive la storia**: il commit e' gia' sul ramo remoto, e riscriverlo
per una riga di messaggio costerebbe piu' di quanto valga. La voce resta qui
finche' la riparazione non atterra, e allora si chiude nominandola.

**La condizione che la riapre**: un terzo `--no-verify` senza dichiarazione. A quel
punto non e' piu' un caso, e la guardia va resa strutturale invece che ricordata —
per esempio un controllo che cerchi i commit senza la parola nel messaggio quando
l'hook e' stato saltato.

## 3. Rischi noti gia' scritti altrove

Non si duplicano qui, per non creare la diciannovesima copia che parafrasa:

- **Contesto stantio che scrive** (quattro casi, `last-writer-wins`) e **due contesti
  che seminano insieme un database vuoto** — [ROADMAP.md](ROADMAP.md), "Rischi noti".
- **Undo dell'import non persistito** — ROADMAP, "Rimandato consapevolmente".
- **`sumCents` lancia su importi non interi** — idem.
- **`size.mjs` non distingue l'entry dai chunk dinamici** — idem, si sistema in
  fase 6 quando il grafo esiste davvero.
