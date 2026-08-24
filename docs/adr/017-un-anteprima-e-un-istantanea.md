# ADR 017 — Un'anteprima e' un'istantanea, e vale nell'istante in cui e' stata presa

Data: 2026-08-24
Stato: accettata

## Contesto

Una regola ricorrente con `startDate` a gennaio, creata ad agosto, scrive **otto
spese** per 7.200 € e cambia i totali di otto periodi passati nell'istante in cui
si salva. `previewMaterialization` esiste per dichiararlo prima.

Fino alla prima consegna della fase 5 il vincolo era scritto **nel commento di un
metodo**:

> Chi chiama deve aver gia' mostrato `previewMaterialization` e chiesto conferma
> quando `backdated` e' vero. Il core non puo' imporlo.

Era disciplina, non tipo. Chi salvava senza anteprima scriveva gli otto arretrati
in silenzio, **e compilava**.

Restavano due difetti piu' specifici, e nessuno dei due e' teorico.

**1. L'anteprima si calcola a T e si spende a T+n.** Se in quella finestra cambia
il giorno civile — regola creata alle 23:59:50, confermata alle 00:00:05 — la
finestra di materializzazione si allarga di un giorno e la scrittura produce
**un'occorrenza in piu' di quelle annunciate**. E' il verso sbagliato: la regola
dichiarata su `previewMaterialization` e' *"si annuncia piu' di quanto si fa"*, e
questo caso la viola. In questo progetto la mezzanotte ha gia' morso due volte —
un test che confrontava due letture a cavallo delle 00:00, e un run di CI partito
alle 23:58:47 che ha confrontato alle 00:00:00.

**2. L'argomento non nomina la creazione.** Nomina la **generazione
retroattiva**, e quella ha tre inneschi, non uno: creare, spostare il calendario
all'indietro, riaccendere una regola dormiente. Se l'anteprima fosse obbligatoria
solo sulla creazione, gli altri due sarebbero la porta di servizio dello stesso
difetto. E' la lezione di "Una decisione vale dove vale il suo argomento",
applicata **prima** che il secondo caso esista invece che dopo.

## Decisione

### 1. Il permesso di scrivere e' un valore, e ha un solo produttore

`previewMaterialization`, nel suo esito positivo, restituisce una
`ConfirmedPreview`. `addRecurringRule` la richiede. Chi salta l'anteprima **non
ha niente da passare, quindi non compila**.

Non e' un booleano e non e' un flag, e la differenza e' tutta qui: con
`confirmed: boolean` chi non chiama l'anteprima scrive `true` e il compilatore e'
contento. E' ADR 012 applicato a un'operazione invece che a un campo.

**Il tipo e' nominale, non strutturale.** Il contenuto vive sotto un `Symbol`
non esportato. Con un campo fantasma normale (`readonly __brand: 'confirmed'`) il
valore sarebbe **copiabile con uno spread** — `{ ...permesso, day: ieri }`
compilerebbe — e la guardia del punto 2 sarebbe aggirabile in una riga da chi ha
fretta. Con la chiave privata lo spread produce una copia identica, che e'
innocua.

**La bozza si congela dentro il permesso.** `readonly` e' un fatto del
compilatore, non del runtime: chi ha chiamato l'anteprima resta padrone
dell'oggetto che ha passato, e potrebbe cambiargli `startDate` dopo. Il permesso
ne tiene una copia.

### 2. Il permesso porta con se' il giorno civile, e la scrittura lo confronta

`redeemPreview(confirmed, today, currentMarker)` rifiuta se il giorno e' cambiato.

**E' la stessa guardia dell'mtime su un file**: non ci si fida di un'istantanea
presa in un momento diverso da quello in cui si agisce.

Il confronto e' **di uguaglianza, non di ordine**. Un'anteprima di domani
cadrebbe nel verso accettabile — annuncerebbe piu' di quanto si scrive — ma non
descriverebbe comunque *adesso*, e un orologio che salta in avanti non e' una
condizione da assecondare in silenzio.

La stessa guardia vale sull'altro estremo dell'intervallo: `materializationWindow`
apre la finestra al giorno dopo `lastMaterializedDate`, quindi il permesso
confronta anche **il segnaposto**. Se una materializzazione e' passata fra il
calcolo e la scrittura, i numeri annunciati non descrivono piu' la finestra vera.

**Il rifiuto e' un risultato, non un'eccezione**: stessa forma di
`planCategoryDeletion` e `planRecurringRuleDeletion`, e porta con se' i due
giorni, perche' "l'anteprima e' di ieri: ricalcola" e' una frase che si scrive
solo se si sanno entrambi.

### 3. I campi si dividono per chi puo' allargare la finestra

Cinque porte invece di due, e ognuna si muove in una direzione sola (ADR 012):

| porta | cosa scrive | pedaggio |
| --- | --- | --- |
| `addRecurringRule(input, previewed)` | crea | si' |
| `updateRecurringRule(id, patch)` | `categoryId`, `note` | **no** |
| `reviseRecurringRule(id, previewed)` | importo e calendario | si' |
| `deactivateRecurringRule(id)` | `active: false` | **no** |
| `reactivateRecurringRule(id, previewed)` | `active: true` + importo e calendario | si' |

Il criterio non ha eccezioni: **se un campo entra in un numero annunciato, passa
dall'annuncio.** Per questo `amountCents` sta con il calendario e non con la
patch — non genera niente, ma e' dentro `totalCents`, e chi ha confermato "8
spese, 7.200 €" ha confermato anche il secondo numero.

Spegnere non ha pedaggio perche' e' l'unica direzione che non puo' generare
niente, ed e' la via che `planRecurringRuleDeletion` suggerisce quando cancellare
non si puo': metterci una conferma davanti renderebbe scomoda proprio l'uscita di
sicurezza.

### 4. Il pedaggio lo paga il codice, non sempre l'utente

Verificato, non dedotto: **spostare `startDate` indietro su una regola gia'
materializzata non genera niente**, perche' il motore riparte da
`lastMaterializedDate`. In quel caso l'anteprima risponde `count: 0,
backdated: false`, e la UI **non deve mostrare nessuna conferma**.

La distinzione e' il cuore di questa ADR: si obbliga a **chiedere**, non a
**chiedere all'utente**. Una conferma che compare sempre smette di essere letta —
la stessa ragione per cui ADR 004 rifiuta la categoria preselezionata e per cui
il promemoria di backup non grida tutti i mesi.

## Conseguenze

- **Nessuna migrazione.** Il record `RecurringRule` su disco non cambia di un
  campo: `schema.ts`, `types.ts`, `idb.ts` e `backup.ts` non sono stati toccati.
  Cambia chi puo' produrre quei valori, non quali valori esistono.
- **`addRecurringRule` resta sincrona.** La ROADMAP ipotizzava che chiudere
  questo buco richiedesse di renderla asincrona: non serviva. Il permesso e' un
  valore puro, e il confronto con l'orologio costa un confronto fra due stringhe.
- **Un chiamante rotto**, `src/ui/App.tsx`. Lasciato rotto di proposito: il
  rifiuto ha bisogno di parole in due lingue, ed e' lavoro di `ui-craft`.
- **Una trappola aperta e dichiarata**: `RuleSheet` calcola l'anteprima con
  `amountCents: 1` a ogni render, per non ricalcolare 9.728 occorrenze a ogni
  cifra. Quel permesso adesso autorizza anche a scrivere una regola da 0,01 €. Il
  rimedio e' una seconda chiamata al salvataggio con l'importo vero — un calcolo
  per tap invece che per cifra, che e' esattamente il motivo per cui la
  scorciatoia esisteva. Non e' stato chiuso con un tipo perche' servirebbe una
  seconda funzione d'anteprima **senza chiamanti di produzione oggi**, e questo
  repo ne ha gia' cancellate due per quel motivo.
- **Cio' che il permesso NON dice**: che un essere umano abbia letto qualcosa. Il
  core non puo' saperlo e non finge di saperlo. Dice che i numeri sono stati
  calcolati, su quale bozza e in quale giorno. Chiedere la conferma a una persona
  resta della UI, e resta legata a `backdated`.
- **Un cast lo aggira lo stesso.** `{} as ConfirmedPreview` compila, come per
  qualunque tipo nominale. La difesa e' contro la distrazione, non contro
  l'intenzione.
