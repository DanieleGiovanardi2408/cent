# Metodo

**Come si lavora in questo progetto, e da quale incidente viene ogni regola.**

## La regola che governa questo documento

> **Ogni regola qui dentro cita l'incidente che l'ha prodotta** — un commit, una
> ADR, o la riga che un controllo ha stampato. Una regola senza incidente dietro
> e' inventata.

E inventare regole plausibili e' precisamente il difetto che questo progetto ha
gia' trovato piu' volte, in tutti e due i lati del tavolo. Se una regola si
ricorda ma non si trova il commit, **non entra**: va in fondo, sotto
["Da verificare"](#da-verificare), con scritto cosa si e' cercato e dove.

Ogni caso ha quattro righe, e la terza e' quella che vale:

1. **cosa si credeva**
2. **cosa era vero**
3. **come si e' scoperto**
4. **cosa e' cambiato nel processo**

Un elenco di buoni propositi non sarebbe questo documento: sarebbe la cosa che
questo documento esiste per sostituire.

**Questo file si compone per accumulo**, un caso alla volta, man mano che ognuno
viene verificato contro l'albero. Non e' un indice di cio' che il progetto ha
imparato: e' l'elenco di cio' che ha imparato **e che si puo' dimostrare**.

---

## 1. Una regola che chiede di ricordarsene non e' una regola

**Cosa si credeva.** Che la regola *"i dati veri non si committano mai"* fosse
sufficiente. Era scritta in due posti, era chiara, e nessuno era in disaccordo.

**Cosa era vero.** Il 23 agosto 2026 due id di spese reali, un importo, l'ora
d'inserimento e **il nome di un negozio in cui qualcuno aveva speso davvero**
sono finiti in un commento, in un repository pubblico, e ci sono rimasti
ventitre giorni.

E il modo in cui e' successa e' l'unica parte che conta. **Non e' stata
sbadataggine.** Il commit che l'ha introdotta porta *"dai dati d'uso"* nel
proprio titolo: era un caso vero, studiato sul primo backup reale, che
dimostrava un punto sottile — perche' la condizione *"stessa categoria, stessa
data, cancella-e-rifai"* non basta a riconoscere un errore da cents-first. Era
**buon lavoro**, scritto nel posto sbagliato.

La regola c'era. Chiedeva di ricordarsene nel momento in cui si stava studiando
tutt'altro, e in quel momento l'unico materiale realistico a disposizione erano
i dati veri. Non ha perso contro la disattenzione: ha perso contro una
derivazione fatta bene.

> **Una regola che dipende dal fatto che qualcuno se la ricordi mentre sta
> pensando ad altro non e' una regola: e' una speranza.**

**Come si e' scoperto.** Da una scansione fatta a mano prima di rendere il
repository presentabile — `git log --all -S` su una descrizione presa da un
backup vero. Non l'ha trovata un controllo, una rilettura o un gate: l'ha
trovata **una ricerca fatta apposta, una volta sola**, che e' la stessa forma di
tutti gli invarianti che questo progetto ha scoperto essere non meccanizzati.

Le altre due scansioni erano pulite: nessun percorso assoluto, nessun file di
backup mai entrato. La superficie era piccola — due commit, un file, tre righe —
e questo ha reso possibile deciderla con calma invece che di corsa.

**Cosa e' cambiato nel processo.** Tre cose, e nessuna delle tre e' "stare piu'
attenti".

1. **E' stata tolta la ragione, non solo l'istanza.** Esiste `docs/demo.json`:
   un backup valido, inventato per intero, plausibile. Adesso c'e' del materiale
   realistico che si puo' citare, quindi la scorciatoia verso i dati veri smette
   di essere l'unica strada. Il file che fa rispettare la regola —
   `scripts/audit.mjs` — e' il suo primo consumatore.
2. **La ricerca e' diventata un comando**: `npm run audit:dati-veri` legge i
   backup veri da una variabile d'ambiente, ne estrae id e note, e li cerca
   nell'albero **e** nella storia.
3. **Il limite del comando e' scritto accanto al comando.** Non puo' girare in
   CI, perche' la CI non ha i backup e non deve averli. E' un fatto *derivabile
   solo qui*, e quindi un controllo pre-rilascio locale: un suo verde non e' un
   verde della CI, e chi lo dimentica ha un controllo che non ha mai girato.

**E una cosa che non e' cambiata, deliberatamente.** La storia non e' stata
riscritta. Il contenuto e' un nome di negozio e 25 €; il costo sarebbe stato
riscrivere ogni SHA dal 23 agosto in poi, comprese le citazioni su cui poggiano
i documenti — questo compreso. Il trade e' stato rifiutato **con il suo motivo
scritto**, perche' la prossima persona che ci arriva non lo rifaccia da capo.

### Il corollario, che vale oltre questo caso

La prima stesura di `audit:dati-veri` cercava **ogni** id dei backup e produceva
centosei aghi, quasi tutti falsi: gli archivi veri portano ancora record delle
prime fasi con id come `exp-0` e `cat-1`, che combaciano con `package-lock.json`
e con meta' delle fixture.

Un referto cosi' non si legge due volte. E' la calibrazione gia' scritta due
volte in questo progetto — l'hook pre-commit che fa solo il typecheck, G2 che
stampa e non ferma — applicata una terza:

> **Un controllo che grida al lupo viene disattivato il terzo giorno, e allora
> non protegge nemmeno il giorno in cui ha ragione.**

Adesso cerca solo gli UUID, che sono la sola forma che identifichi qualcuno — e
**stampa quanti id scarta**, perche' un controllo che scarta in silenzio e' un
controllo di cui non si conosce la copertura, che e' peggio di uno che ne ha
poca.

---

## Da verificare

Le regole ricordate e non ancora trovate nell'albero. **Non valgono** finche'
restano qui: una regola in questa sezione e' un sospetto, non un metodo.

*(vuota)*
