# ADR 020 — L'ancora mensile e' un campo, non una conseguenza

Data: 2026-08-25
Stato: accettata
Sostituisce: niente. Estende ADR 018 (il segnaposto arretra solo se glielo si chiede).

## Il fatto

`rewindRecurringRule` retrodata `startDate`. Fino allo schema 3 una regola
mensile poteva non avere `anchorDay`, e il motore, quando mancava, lo derivava:

```ts
const anchorDay = rule.anchorDay ?? toDateParts(rule.startDate).day
```

Quindi retrodatare **spostava il giorno del mese**. Una regola "il 1 del mese"
retrodatata al 23 giugno diventava "il 23 del mese", senza dire niente, e le
istanze gia' generate il 1 restavano fuori calendario — id deterministici che
nessuna finestra futura ripropone piu'.

## La riparazione ovvia, e perche' e' quella sbagliata

Far scrivere al rewind un terzo campo (`anchorDay`, congelato prima di spostare
`startDate`) chiude il caso e lascia in piedi la causa.

La causa e' che **`anchorDay` e' implicito**: il significato della regola dipende
da un campo che un'altra operazione puo' cambiare. Finche' resta implicito, ogni
operazione futura che tocca `startDate` deve **ricordarsi** di congelarlo. E'
disciplina, ed e' esattamente cio' che questo progetto ha passato tre fasi a
sostituire con la costruzione: id deterministici invece di lock (ADR 006),
`PreviewedWrite` sotto un `Symbol` invece di un booleano `confirmed` (ADR 012),
l'intenzione invece del risultato gia' calcolato (ADR 008).

E non era ipotetico: **i writer erano gia' due**. `RuleSheet` conservava
`anchorDay` se c'era e non lo creava, quindi il secondo writer esisteva gia' e
gia' non stabiliva l'invariante.

## La decisione

**`anchorDay` e' esplicito e obbligatorio sulle regole mensili**, e a renderlo
obbligatorio e' il **compilatore**, non un controllo a runtime.

```ts
export type WithCadence<T> =
  | (T & { readonly cadence: 'monthly'; readonly anchorDay: number })
  | (T & { readonly cadence: 'daily' | 'weekly'; readonly anchorDay?: never })

export type RecurringRule = WithCadence<RecurringRuleCommon>
export type RecurrenceDraft = WithCadence<RecurrenceDraftCommon>   // stesso tipo
```

Un `{ cadence: 'monthly' }` senza ancora non e' un record che qualcosa rifiuta:
e' un record che **non si puo' scrivere**. Se il tipo lo lasciasse esprimibile e
un controllo a runtime lo rifiutasse, non avremmo fatto niente — sarebbe lo
stesso stato rappresentabile-ma-ambiguo che questo progetto elimina da giorni.

La bozza usa **lo stesso** tipo della regola, e non una copia che le somiglia: la
bozza e' l'unico ingresso da cui un calendario entra in un record, quindi un
`anchorDay?` rimasto opzionale li' riaprirebbe il buco un piano piu' sotto.

## Il momento e' adesso, e la ragione e' aritmetica

La migrazione 3 -> 4 deriva l'ancora da `startDate`. E' **l'unica migrazione di
questo progetto che scrive un campo sui record esistenti**, contro la dottrina
dei passi 2 (`timeMinutes`) e 3 (`language`, `onboardingCompletedAt`), dove
riempire un campo opzionale avrebbe registrato un'osservazione che nessuno aveva
fatto.

La differenza e' che qui il valore **e' gia' in uso**: si scrive cio' che il
motore calcolava a ogni apertura. La migrazione non cambia il calendario di
nessuna regola, lo rende esplicito.

E va fatta **adesso** perche' in questo momento `startDate` non e' ancora stato
spostato da nessuno. Fatta dopo il primo rewind, deriverebbe l'ancora sbagliata e
la scriverebbe come se fosse quella giusta — un dato falso, plausibile, e senza
piu' nessun posto da cui rileggere quello vero.

## Conseguenze

1. **Ogni lettore perde il suo ramo di fallback.** `nextOccurrenceOnOrAfter` legge
   `rule.anchorDay` e basta.
2. **`rewindRecurringRule` continua a toccare due campi**, `startDate` e il
   segnaposto (tolto). ADR 018 resta vera parola per parola.
3. **`validateRule` dichiara non utilizzabile una mensile senza ancora** invece di
   derivargliela. Il caso e' raggiungibile da una strada sola — un record letto
   dal disco, che `loadAll` non valida — e li' derivare sarebbe peggio che
   fermarsi: `startDate` a quel punto puo' gia' essere stata spostata.
4. **`parseBackup` deriva l'ancora come la migrazione.** E' la strada che la
   migrazione non copre: un file puo' dichiarare **gia'** lo schema 4 e non avere
   nessun passo da applicargli. Li' l'unico esito ammesso e' una regola valida —
   non un rifiuto, che perderebbe l'unica copia di un record che l'utente non ha
   altrove. Vale anche per un'ancora fuori scala, che prima costava l'intera
   regola per un campo derivabile.

## Cosa questa decisione non copre, dichiarato

- **Il tipo non dice che l'ancora sia quella giusta**, dice che c'e'. Una regola
  a cui l'utente sceglie il giorno sbagliato resta una regola sbagliata; questa
  decisione garantisce solo che nessuna operazione la cambi **al posto suo**.
- **`clampDayOfMonth` resta l'unica risposta ai mesi corti.** `anchorDay: 31` a
  febbraio e' il 28 (o il 29), e non sconfina mai nel mese successivo. La mossa
  non lo tocca: e' verificato sul motore e sulla catena d'import.
- **Un record gia' sul disco con una mensile senza ancora non e' impossibile**:
  puo' arrivarci solo da un JSON scritto a mano importato da una versione che non
  esiste, o da una corruzione. Il tipo non lo previene, `validateRule` lo dichiara
  inutilizzabile e il motore lo salta **dicendolo**. Non lo ripara: non c'e'
  niente da cui rileggere il valore vero.
