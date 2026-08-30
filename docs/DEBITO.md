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

**Stato: CHIUSA il 28 agosto 2026**, con `0cbc6ac` — il commit che ha rimesso
`tsc` verde. Era la condizione dichiarata, e si e' chiusa quel giorno e non prima:
una voce di debito che si chiude quando fa comodo invece che alla propria
condizione e' una voce che non era un debito.

Resta scritta perche' **la regola che l'ha prodotta vale da adesso**, e perche' il
prossimo caso vada contato contro questo e non contro zero.

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

## 5. Due unita' diverse, numericamente identiche una settimana su quattro — **CHIUSA**

**Stato: CHIUSA il 29 agosto 2026.** La voce resta scritta per intero — con la
condizione di riapertura in fondo — perche' un debito chiuso cancellato e' un
argomento che il prossimo deve riderivare da zero.

Restava aperta **anche dopo** la riparazione delle etichette, perche' la
coincidenza tornava con altri importi. Quella sotto e' la misura di allora.

Misurato sulla configurazione canonica di ADR 016 — una regola mensile da 900,00 €
con ancora il 18, budget settimanale, il 19 agosto:

    Spese fisse   900,00 €   ogni mese      <- proiezione dalle regole
    ...
    Casa          900,00 €                  <- speso in questo periodo

Due quantita' in **unita' diverse** — al mese contro nel periodo — **numericamente
identiche per costruzione** una settimana su quattro, tutti i mesi.

**Perche' e' l'ambiguita' peggiore che esista**: il lettore non ha **nessun
indizio** che siano due cose diverse. Due numeri **diversi** che si somigliano si
notano e si va a controllare; due numeri **identici** che significano cose diverse
non si notano affatto — la coincidenza li fa leggere come conferma reciproca.

La riparazione delle **etichette** (`stats.fixedInPeriod`, "Fisse in questo
periodo") ha tolto la contraddizione fra due nomi uguali. Non toglie questa: la
metrica che in questa fase ha trovato tre difetti guarda **la cifra**, e la cifra
e' ancora doppia. E' la stessa lezione gia' scritta — *"il titolo diceva «un
numero», e il numero era solo il caso visto per primo"* — applicata al verso
opposto: qui i nomi sono giusti e a coincidere sono i valori.

**La condizione che la chiude**: una forma che renda le due unita' distinguibili
**senza leggere l'etichetta** — perche' e' esattamente l'etichetta che la
coincidenza fa saltare.

### Chiusa il 29 agosto: **l'unita' e' entrata nel numero**

La proiezione non si scrive piu' `530,00 €` con `ogni mese` sotto: si scrive
**`530,00 €/mese`** (`stats.perMonthRate`, `{amount}/mese` · `{amount}/month`).
Accanto, in A, l'altra quantita' resta `530,00 €`.

**Perche' questa soddisfa la condizione e la riparazione delle etichette no.** La
condizione chiedeva di distinguere **senza leggere l'etichetta**, e il suffisso non
e' un'etichetta: e' **parte della stringa del numero**, nello stesso blocco di
glifi, alla stessa dimensione. Le due cifre non sono piu' identiche — `530,00 €/mese`
e `530,00 €` differiscono nei caratteri, non solo nel contesto. La metrica che in
questa fase ha trovato tre difetti guarda la cifra, e adesso la cifra e' diversa.

**Cosa la chiusura NON afferma.** Non che i due numeri non si somiglino piu': si
somigliano, ed e' giusto, perche' una proiezione mensile e un mese di spese fisse
maturate **sono** quasi lo stesso denaro. Afferma che un lettore che li vede non
puo' piu' scambiarli per la stessa quantita' senza aver letto niente — che era il
danno, non la somiglianza.

**Come si riapre.** Il giorno in cui una delle due cifre perde il suffisso — un
restringimento di colonna che lo taglia, una traduzione che lo sposta
nell'etichetta, una terza schermata che ripete la proiezione senza — questa voce
torna aperta con lo stesso argomento. **La cosa da sorvegliare e' il suffisso
attaccato al numero**, non il testo che lo circonda.

### Poi la coppia si e' sciolta: `stats.perMonthRate` non esiste piu'

Chi cerca il suffisso nel codice non lo trova, e va detto qui prima che qualcuno
concluda che la chiusura e' stata disfatta.

Il 29 agosto sera, **la proiezione mensile e' uscita dalle Statistiche**: era una
riga in testa alla schermata (`.stats__rate`) e scriveva la stessa cifra che il
totale della parte fisse scrive duecento pixel piu' sotto. Il suffisso distingueva
le **unita'** — ed e' cio' che chiudeva questa voce — ma non toglieva il fatto che
il numero fosse a schermo **due volte nella stessa occhiata**, il che era un
secondo difetto, di un'altra famiglia, che il suffisso non aveva mai avuto il
compito di riparare.

Con la riga se ne sono andate `stats.fixed` e `stats.perMonthRate` (nessun lettore
rimasto, controllo B di `audit:source`).

**Questa voce resta chiusa, e per una ragione piu' forte di prima**: le due
quantita' non stanno piu' sulla stessa schermata, quindi la coincidenza non ha piu'
dove prodursi. La proiezione vive dove ADR 016 §3 la mette — *"accanto al budget,
**in Impostazioni**"* — con la propria etichetta (`fixed.total`, *"In tutto
{amount} al mese."*), sotto il gruppo del budget.

**E come si riapre adesso**: il giorno in cui una schermata torna a scrivere le due
quantita' insieme. Se succedesse, il rimedio gia' trovato — l'unita' dentro il
numero — resta valido e va rimesso; ma il primo rimedio e' non rimetterle insieme.

## 6. "In corso" e "ultima riga" sono indistinguibili da qualunque test

**Stato: aperto**, e non si chiude scrivendo un altro test — nessuno puo' cadere.

`PeriodBar.current` dice *"questo periodo contiene oggi"*. Nel componente lo stesso
gesto si puo' scrivere `index === rows.length - 1`, che oggi da' lo stesso esito su
**ogni scena costruibile dal prodotto** — e lo dimostrano due agenti che ci sono
arrivati per strade diverse e indipendentemente:

- lo **strato puro**: l'ultimo elemento di `bars` e' per costruzione il periodo di
  oggi, perche' `trendRanges` parte da `input.day` e `inWindow` e' uno slice **dalla
  sola testa**. Provati i due scrittori che potrebbero romperlo — una spesa datata
  in avanti (cade *oltre* il fondo e non lo sposta; se e' l'unica, `rows` e' vuota)
  e un orologio tornato indietro (la finestra si ricostruisce su `input.day`) — e
  nessuno dei due separa le due cose.
- il **componente**: sostituendo `row.current` con `index === rows.length - 1`,
  **tutti e 28 i test del file restano verdi**.

**Perche' resta un debito e non una nota.** I due sono uguali per una proprieta'
della finestra, non per definizione. Il giorno che B guardasse anche i periodi
futuri, o che la finestra tagliasse dal fondo, `index === last` diventerebbe falso
**e niente diventerebbe rosso**: il difetto arriverebbe insieme alla modifica che
lo rende possibile, cioe' nel momento in cui nessuno lo sta cercando.

E' la forma pura di *"un'asserzione che passa sia col codice giusto sia con quello
sbagliato"*, con l'aggravante che qui **non e' il test a essere debole**: e' il
mondo a non contenere il controesempio.

## La cura non e' un test: e' una forma. **Valutata, e regge.**

Rendere la scelta sbagliata **inesprimibile** invece che sconsigliata — la mossa
dell'id deterministico e di `ConfirmedPreview`. Qui e' piu' vicina di quanto
sembri: **non consegnare un array.**

```ts
readonly byPeriod: {
  readonly closed: readonly PeriodBar[]
  readonly current: PeriodBar | null   // `null` solo quando la sezione non c'e'
}
```

Con questa forma **`rows.length - 1` non esiste**, perche' la riga corrente non e'
nell'array. Il componente rende `closed.map(...)` e poi `current && ...`: l'ordine
a schermo e' lo stesso, e la confusione sparisce **per costruzione** invece che per
sorveglianza.

E ne segue un secondo taglio: **`PeriodBar.current` sparisce**. Era la quinta
cucitura tenuta viva dai soli test, ha appena acquistato un lettore (il bordo
aperto), e con questa forma torna superfluo — la posizione nel tipo **e'** il fatto.
E' anche il campo che il controllo D **non puo' vedere**, perche' `.current` e'
l'idioma dei ref di Preact: toglierlo chiude un buco che nessuna macchina copriva.

### Il costo, misurato

- **`Stats.tsx`**: 2 punti. `closed.map(...)` piu' `current && <Row/>`.
- **`stats-view.ts`**: 8 punti. Lo split e' `rows.slice(0, -1)` / `rows.at(-1)`, e la
  soglia diventa `closed.length + (current ? 1 : 0) >= TREND_MIN_ROWS`.
- **`stats-view.test.ts`**: **34 asserzioni** su `byPeriod.rows`. E' il grosso.
- **e2e**: 6 riferimenti, ma sul DOM, che non cambia.

**Verdetto: vale piu' di quanto costa**, e le 34 asserzioni sono churn meccanico —
non richiedono di ripensare cosa provano. **Non e' stato fatto in questa sessione
per budget, non per dubbio.**

### Una cosa da verificare mentre si fa, e non e' scontata

`current` puo' essere `PeriodBar` e non `PeriodBar | null`? La finestra **finisce
sempre** col periodo di oggi, quindi quando la sezione esiste `current` esiste. Se
regge, il tipo diventa ancora piu' stretto e l'assenza della sezione si esprime
gia' altrove. **Va provato, non assunto**: e' precisamente il tipo di "sempre" che
questo progetto ha visto cadere tre volte.

**La condizione che chiude questa voce**: la forma sopra nel codice. In subordine —
se un giorno la finestra smettesse di finire col periodo corrente — la coincidenza
cade da sola e la voce si chiude per altra via.

## 7. La riserva della Home avanza di 61,75 px nello stato piu' comune

**Stato: aperto, e sceso da 76,75 a 61,75.** La condizione che questa voce si era
data si e' avverata il 30 agosto ed e' stata applicata; quello che resta ha una
causa diversa, quindi la voce non si chiude — si riscrive su cio' che la regge
adesso.

**Cosa.** `--slot-min` in `Home.css` copre lo stato piu' alto del riquadro. Lo
stato con budget **tipico** — una riga di disponibilita', nessuna nota di ADR 010,
nessuna spesa fissa scattata nel periodo — ne prende 121,5 a 390 punti, e 142,75 a
320. Misurato in entrambe le lingue:

| | prima | adesso |
|---|---|---|
| `--slot-min` a 390 pt | 198,25 px | **183,25** |
| `--slot-min` a 320 pt | 220,75 px | **204,5** |
| avanzo nello stato comune, 390 pt | 76,75 px | **61,75** |
| avanzo nello stato comune, 320 pt | 78 px | **61,75** |

**Cosa e' stato tolto.** L'invito dello stato senza budget e' passato da tre righe
a due (`--rows-invite`), togliendo la coda *", invece di quanto hai già speso"* —
che non portava un fatto suo: diceva cosa mostra il numero grande adesso, cioe'
`hero.spent`, scritto trenta pixel piu' su come etichetta di quel numero. Con
quello, il `max()` di `--body-min` **cambia vincitore**: la colonna piu' alta non
e' piu' quella senza budget (98 px) ma quella con budget (83).

Misurato dentro `.invite` vero, nelle due lingue: 3 righe -> 2 a 358, 343 e 288 px
di colonna. La forma intermedia — *"…not what you have spent."*, 86 caratteri — sta
in due righe a 390 e 375 e ne prende **tre a 320**: scartata sulla misura, perche'
la riserva regge alla larghezza piu' stretta o non regge.

**Perche' i 61,75 che restano non si tolgono accorciando altro.** Sono la somma
delle due righe che la colonna col budget deve riservare **insieme** — un budget
grande nato a periodo iniziato le ha tutte e due:

- **`--rows-allowance: 2`** — "Puoi spendere ~18.000,00 € al giorno per 5 giorni" va
  a capo a 390 punti;
- **`--rows-since: 2`** — la frase di ADR 010 e' 64 caratteri in italiano e 75 in
  inglese contro un tetto di 42ch. Per stare in una riga dovrebbe perdere o il
  giorno o l'importo, cioe' i due fatti per cui esiste. E **togliere il
  `max-inline-size` non basta**, che era la strada che sembrava gratis: a 390 punti
  la colonna vale ~54 caratteri e a 320 ~43. Va a capo comunque.

Restano perche' il guscio si dipinge prima di sapere se un budget esiste (regola
"Ordine di pittura") e perche' il gate `home.spec.ts`, "la Home non salta / passando
da senza budget a con budget", pretende — giustamente — che impostare un budget non
sposti la coda.

**Dove cade lo spazio** non e' cambiato, e l'argomento sta su `--slot-min` in
`Home.css`: corpo ancorato in basso, avanzo fra il blocco del numero e quello del
budget. Le altre due posizioni erano state provate a schermo — una lasciava il
bottone a 120 px dalla sua riga, l'altra faceva cadere il gate anti-CLS di 75-83 px
su un bersaglio toccabile.

**La condizione che chiude questa voce**, riscritta su cio' che la regge adesso:
`.since` smette di essere una riga riservata **sempre** per un fatto che compare in
**un periodo solo** nella vita di un utente. Non accorciandola — quella strada e'
misurata e chiusa qui sopra — ma cambiando cio' che il guscio sa: il giorno in cui
esistesse una forma di guscio che sappia gia' se il budget e' nato a periodo
iniziato, la riserva scenderebbe a 42,5 + 8 + 16,25 = 66,75 px e l'avanzo tipico a
45,5.

**E la sentinella c'e' gia', ed e' diventata piu' stretta**: `home.spec.ts`, "una
riga di troppo sfonda la riserva", pretende che sullo stato piu' alto la riserva
avanzi **meno di una riga minima** (16,25 px). Avanzava 15; adesso avanza **0** —
la riserva e' esattamente il contenuto dello stato piu' alto. Se lo scarto tornasse
a crescere, quel test cade prima che questa voce peggiori in silenzio.

## 8. `spentRatio` in `budget-view.ts` non ha piu' lettori di produzione — **CHIUSA**

**Cosa.** La barra del periodo e' uscita dalla Home (l'argomento sta in testa a
`Home.tsx`). `spentRatio` era la sua unica chiamante di produzione: adesso e'
tenuta viva soltanto dai quattro `expect` che la esercitano in
`budget-view.test.ts`.

E' la forma esatta di `expensesInRange` e di `planBudgetChange`, cancellate in
questo repo per questa ragione: **un'API pubblica senza chiamanti, mantenuta viva
dai test che la chiamano.** Il controllo `audit:source` non la vede — guarda i
campi dei tipi e le chiavi i18n, non le funzioni esportate.

**Perche' e' ancora li'.** `budget-view.ts` era in mano a un altro agente nel
momento in cui la barra e' uscita, e cancellare una funzione dentro un file che
qualcun altro sta scrivendo produce il conflitto peggiore: non un merge, un pezzo
di lavoro perso.

**La condizione che chiude questa voce**: `spentRatio` e i suoi test si cancellano
alla prima sessione in cui `budget-view.ts` e' fermo. Se invece la barra tornasse
in qualche forma, la funzione riacquista un lettore e la voce si chiude da sola —
ma allora torna anche il vincolo dei 3:1 su `--over` come superficie, che
`colori.spec.ts` non sorveglia piu'.

### CHIUSA il 30 agosto: la condizione si e' avverata nello stesso giro

`budget-view.ts` si e' fermato — `data-core` aveva finito la striscia e `ui-craft`
non lo tocca — e la funzione e' stata cancellata con le sue quattro asserzioni.
**La prima meta' della condizione, non la seconda**: la barra non e' tornata, quindi
il vincolo dei 3:1 su `--over` come superficie resta fuori da `colori.spec.ts`, e
resta scritto dove rimetterlo.

**Questa voce e' vissuta poche ore, e va detto perche' e' il caso buono.** Non e'
stata scritta per rimandare: e' stata scritta perche' nel momento in cui il difetto
e' nato **il file era in mano a un altro agente**, e cancellare dentro un file che
qualcuno sta scrivendo produce il conflitto peggiore — non un merge, un pezzo di
lavoro perso. La voce ha fatto esattamente il suo mestiere: **ha tenuto il difetto
fuori dalla memoria di una sessione**, che e' il posto dove muore.

E la prova che serviva davvero: la cancellazione non e' stata ricordata, e' stata
**letta da qui** da chi ha coordinato il giro dopo. Un difetto accettato con la sua
condizione scritta e' una decisione; lo stesso difetto tenuto a mente e' una
scommessa sul fatto che qualcuno se ne ricordi.

## 9. Le fisse sono mensili e nessuna schermata ha un orizzonte mensile

**Stato: aperto.** Non e' un difetto della fase 6: e' una **lacuna di prodotto**
emersa misurando M1 e M2 il 30 agosto.

**Cosa.** Le spese fisse sono mensili — 530,00 € al mese, di cui **507,00 € di
affitto**. La Home e le Statistiche rispondono entrambe **alla settimana**: l'eroe
dice *"Questa settimana · 24–30 ago"*, il budget e' settimanale, B confronta
settimane. **Non esiste il posto dove leggere "come sta andando il mese"**, cioe'
l'orizzonte su cui la voce di spesa piu' grande della vita dell'utente e' definita.

**Come e' emersa, ed e' la parte che vale.** La richiesta di misurare le categorie
diceva *"mese corrente"*. L'app ragiona a settimana ovunque, quindi la misura e'
stata fatta su tutte e due le finestre — e le due danno **numeri diversi**: nel mese
`Coffeeshop` vale il 39,0% e nella settimana il 21,4%. Nessuno dei due e' sbagliato:
sono due domande, e l'app ne risponde una sola.

Non l'ha trovata un gate ne' un controllo: l'ha trovata **una parola in un brief che
non corrispondeva al codice**, e che e' stata misurata invece che corretta in
silenzio.

**Perche' non si tampona.** Una riga in Home che dica *"questo mese: X"* sarebbe un
secondo eroe su una schermata che ne ha uno solo per decisione (0d), e risponderebbe
a meta' della domanda: *"come sta andando il mese"* non e' un totale, e' un totale
**contro un'aspettativa**, e l'aspettativa mensile non esiste da nessuna parte —
il budget e' settimanale.

**La condizione di riapertura**: si decide in **fase 7**, oppure **prima se il test
degli amici lo fa emergere** — cioe' se qualcuno che non ha scritto l'app chiede
*"quanto ho speso questo mese?"* e non trova dove guardare. Fino ad allora l'eroe
**deve continuare a dire "Questa settimana · <intervallo>"**: e' l'unica frase che
impedisce di leggere quel numero come mensile, ed e' quindi parte di questa voce e
non una rifinitura del copy.

## 10. Le otto tinte nuove non hanno un nome parlato, e la ottava non ce l'ha per costruzione

**Stato: aperto.** Nato il 30 agosto, insieme alla palette che passa i quattro
pavimenti di `scripts/palette.mjs`.

**Cosa.** `COLOR_NAMES`, in `src/ui/CategorySheet.tsx`, associa un nome parlato a
ogni tinta della tavolozza ed e' indicizzata sull'**esadecimale**. Gli otto
esadecimali sono cambiati, quella mappa no: chi esplora la tavolozza con la voce
sente adesso otto volte *"Colore"* invece di *"Verde"*, *"Arancio"*, e cosi' via.
La mappa non e' rotta — le sue otto voci restano vere per le categorie di chi ha
gia' l'app, che tengono i colori vecchi — ma non copre piu' cio' che si offre a
chi installa oggi.

**Perche' non l'ha riparata chi ha cambiato le tinte.** `CategorySheet.tsx` e
`src/ui/i18n/*` erano in mano a un altro agente nello stesso momento, ed e' la
ragione gia' scritta nella voce 8: cancellare o riscrivere dentro un file che
qualcuno sta scrivendo non produce un conflitto, produce lavoro perso.

**La parte che non e' un rinvio ma una decisione da prendere.** Le chiavi di
colore nei due dizionari sono **otto**, una per famiglia, e una di esse e'
`color.grey`. La palette nuova **non ha un grigio**: Extra e' un blu d'acciaio
(`#2a6198`), perche' un grigio ha croma 0,015 e in una ciambella si legge come
*resto* e non come categoria. Quindi non esiste una chiave che descriva la nuova
ottava tinta, e le due candidate hanno costi diversi:

- **rinominare `color.grey`** in qualcosa come `color.navy` — tre righe (i due
  dizionari e la mappa), ed e' la sola che non lascia due voci con lo stesso
  nome. `color.grey` **non si puo' semplicemente cancellare**: perderebbe il suo
  unico lettore e `npm run audit:source`, controllo B, fallirebbe;
- **riusare `color.blue` per tutte e due** le tinte fredde — nessuna modifica ai
  dizionari, ma due pastiglie che si annunciano *"Blu"* in una tavolozza dove
  servono a distinguersi. E' la scelta che sembra piu' piccola e non lo e'.

**La condizione che lo rende non piu' accettabile**: al primo giro in cui
`CategorySheet.tsx` e i dizionari sono liberi. Non oltre la chiusura della fase 6
— la palette e' visibile da subito, e questa e' l'unica schermata in cui la si
tocca. Fino ad allora vale la nota gia' scritta accanto a `COLOR_NAMES`: *"una
tinta che non fosse in tavolozza resta senza nome proprio e si annuncia come
'Colore': una bugia sarebbe peggio"*. Qui il ripiego e' quello, ed e' onesto —
solo, non e' piu' il caso raro per cui era stato scritto.

## 3. Rischi noti gia' scritti altrove

Non si duplicano qui, per non creare la diciannovesima copia che parafrasa:

- **Contesto stantio che scrive** (quattro casi, `last-writer-wins`) e **due contesti
  che seminano insieme un database vuoto** — [ROADMAP.md](ROADMAP.md), "Rischi noti".
- **Undo dell'import non persistito** — ROADMAP, "Rimandato consapevolmente".
- **`sumCents` lancia su importi non interi** — idem.
- **`size.mjs` non distingue l'entry dai chunk dinamici** — idem, si sistema in
  fase 6 quando il grafo esiste davvero.
