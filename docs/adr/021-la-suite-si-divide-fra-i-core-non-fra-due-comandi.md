# ADR 021 — La suite si divide fra i core, non fra due comandi

Data: 2026-08-25
Stato: accettata

## Contesto

ROADMAP aveva fissato una soglia in anticipo, per non doverla discutere nel
momento sbagliato: **se la suite e2e locale supera i 5 minuti su una macchina
scarica, si divide.** La soglia e' scattata.

Misura, albero fermo, nessun altro processo pesante, `npm run test:e2e`:

```
209 passed, 16 skipped (6.6m)
real 399,86s   user 204,71s   sys 48,17s
```

Il numero che decide non e' il 399, e' il rapporto: **(user + sys) / real =
0,63**. La suite occupava **meno di due terzi di un core su otto**. Non era
lenta perche' calcolava: era lenta perche' aspettava — navigazioni, `expect`
che ripolla, animazioni vere, un toast che vive sei secondi.

Dove andava il tempo, sommando le durate dei singoli test (390,9s dei 399,9s
totali; il resto e' la build e l'avvio del server):

| file | tempo | quota |
|---|---|---|
| `ricorrenze.spec.ts` | 158,1s | 40,4% |
| `home.spec.ts` | 87,5s | 22,4% |
| `overlays.spec.ts` | 45,0s | 11,5% |
| `guide.spec.ts` | 38,0s | 9,7% |
| gli altri otto | 62,3s | 16,0% |

E per progetto, che e' la ripartizione piatta che ci si aspetta da tre viewport
che rimisurano le stesse schermate: `iphone-14` 135,1s, `iphone-se` 128,3s,
`landscape` 120,1s, `dark` 7,5s.

## La forma decisa in anticipo, e perche' non e' quella applicata

ROADMAP diceva: *"si divide in due comandi — uno veloce che si lancia sempre,
uno completo prima del commit"*.

**L'argomento di quella riga sopravvive; la sua forma no.** L'argomento e' che
una verifica troppo lenta viene eseguita di meno, e da li' in poi non protegge
piu' niente — la stessa calibrazione per cui l'hook `pre-commit` fa solo il
typecheck. Ma "uno veloce e uno completo" produce esattamente il difetto che
l'argomento teme, spostato di un metro: il comando completo diventa **il comando
che nessuno lancia**, e le verifiche che ci finiscono dentro sono le stesse che
oggi non proteggevano piu' niente, con in piu' l'illusione di essere in suite.

I numeri lo dicono senza bisogno del ragionamento. Il tempo di **calcolo** non
era il problema: 0,63 core su 8. Non c'era niente da tagliare — c'erano sette
core fermi.

**Si divide il lavoro fra i processi, non i test fra due comandi.**

## Decisione

`workers: '50%'` in `playwright.config.ts`. `fullyParallel: false` **resta**, ed
e' la meta' importante della decisione.

### Il grano e' il file

`fullyParallel: false` decide che cosa un worker non puo' spezzare: i test
dentro un file restano in ordine e nello stesso processo. Quindi il passaggio da
uno a quattro worker **non cambia niente di cio' che un file assume su se
stesso**. Con `fullyParallel: true` il grano diventerebbe il singolo test: si
guadagnerebbero una ventina di secondi e si comprerebbe il requisito che ogni
file sia corretto anche letto a pezzi — un requisito che oggi nessuno verifica e
che nessuno ha chiesto.

### Quattro e non sei, e il perche' e' misurato

| worker | attesa | somma delle durate | tassa di contesa |
|---|---|---|---|
| 1 | 6m40s (399,9s) | 390,9s | — |
| 4 | 2m13s (133,3s) | 409,0s | +4,6% |
| 6 | 1m56s (115,8s) | 455,6s | +16,6% |

La distribuzione dei singoli test, che e' cio' che dice se la contesa sta
mangiando il margine sui timeout:

| | mediana | p95 | test piu' lungo |
|---|---|---|---|
| 1 worker | 1,5s | 6,4s | 10,1s |
| 4 worker | 1,5s | 6,5s | 10,1s |
| 6 worker | 1,7s | 6,9s | 10,8s |

A 4 la contesa non si vede. A 6 si vede: ogni test si avvicina al proprio
timeout di 30s, e si comprano 17 secondi. **Non e' lo scambio giusto** — il
tetto e' gia' battuto di tre volte a 4, e una suite piu' veloce che ogni tanto
mente costa piu' di quanto valga (CLAUDE.md, la caccia al test intermittente).

Il pavimento e' `ricorrenze.spec.ts`: ~53s per progetto, il blocco piu' grande
che nessun worker puo' dividere. Da li' in giu' non si scende aggiungendo
processi, si scende solo cambiando il grano — vedi sopra perche' non lo si fa.

### `'50%'` e non `4`

Il numero che conta e' **meta' macchina lasciata libera**, non il quattro. Su un
runner con 4 vCPU la regola da 2, cioe' **meno** parallelo di cio' che e' stato
misurato verde qui: sbaglia verso il sicuro. E una regola sola vale ovunque,
invece di una configurazione locale e una di CI che devono restare vere in due
posti — che e' la famiglia di difetti da cui nasce ADR 013.

## Cosa **non** cambia

**Le cinque premesse d'ambiente (ADR 013).** Fuso, istante, lingua, font e
movimento vivono nel contesto del browser, e i contesti restano isolati uno per
test esattamente come prima. Il parallelismo non ne tocca nessuna: sono
dichiarate nello stesso posto, si leggono nello stesso posto.

**La ricostruzione prima di servire.** `webServer.command` fa ancora
`npm run build && npm run preview`, e `test:e2e` fa ancora la sua build. Sono due
build da 1,3s ed **entrambe portano peso**: quella dentro `webServer` copre chi
lancia `npx playwright test` a mano, quella dentro `test:e2e` copre il caso
`reuseExistingServer` in cui il server c'e' gia' e `webServer` non parte
(`vite preview` legge da disco a ogni richiesta, quindi la build esterna arriva
lo stesso a destinazione).

**Ed e' l'argomento decisivo contro lo sharding**, che era l'altra strada
plausibile: N shard sono N processi, cioe' **2N build e N server su N porte**.
Piu' processi da coordinare, piu' porte da non far collidere, e la garanzia
"il dist corrisponde al sorgente" da mantenere vera N volte invece di una. Con i
worker il conto resta esattamente quello di prima: **un server, due build**.

**L'ordine di `ambiente.spec.ts`.** Il file di premesse deve stampare prima dei
fallimenti che spiega. Con `fullyParallel: false` l'unita' distribuita e' il
file e i file si consegnano in ordine alfabetico, quindi resta il primo lavoro
che parte. Verificato: primo risultato stampato sia a 1 worker sia a 4. Il
commento nel file diceva `workers: 1` — nominava il numero invece del
meccanismo, ed e' il numero che e' invecchiato.

## Conseguenze

Il tetto dei 5 minuti smette di essere vicino: si passa da 6m40s a 2m13s, cioe'
da 1,3 volte il tetto a 0,44. Il margine ricomprato e' di **quattro minuti e
mezzo**, e serve — la fase 6 aggiunge una schermata di statistiche, che sui tre
viewport geometrici sono altri test.

Quando il tetto tornera' vicino, la prossima mossa **non** e' alzare i worker: e'
guardare di nuovo il pavimento. Oggi vale 53s su 133s di attesa, cioe' il 40%:
il prossimo guadagno vero sta nello spezzare `ricorrenze.spec.ts` in file piu'
piccoli, che abbassa il pavimento **senza** cambiare il grano e senza chiedere a
nessun file di essere corretto letto a pezzi.
