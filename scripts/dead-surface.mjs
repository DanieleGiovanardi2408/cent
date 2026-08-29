// Superficie dichiarata e mai prodotta, o mai letta. Gira in CI, esce con
// errore se trova qualcosa.
//
//   node scripts/dead-surface.mjs        (npm run audit:source)
//
// Quattro domande, ognuna nata da un difetto vero:
//
//   A. Ogni campo dei tipi in `src/core/types.ts` ha una **scrittura** che non
//      sia `parseBackup`, una migrazione o un test? `RecurringRule.note` aveva
//      tre lettori e zero produttori; `endDate` ne aveva quindici, tre giorni
//      dopo che la regola era stata scritta.
//
//   B. Ogni chiave dei due dizionari ha almeno un **lettore** in codice di
//      produzione? `history.blank.install` e' rimasta viva nel codice e morta
//      nei fatti dopo ADR 011.
//
//   C. Ogni **membro** di un'unione di letterali compare almeno una volta in
//      produzione? E' la granularita' **sotto** quella di A, e A non la vede per
//      costruzione: `Settings.theme` passa A perche' il seed scrive `'auto'`,
//      mentre `'light'` e `'dark'` non li scrive nessuno. Un campo vivo con
//      due valori morti.
//
//      C dice **presenza, non produzione**, e la scelta e' deliberata: la forma
//      ovvia — cercare `campo: 'valore'` — dichiarerebbe morti `'it'` e `'en'`,
//      perche' `updateSettings({ language: next })` passa una variabile e il
//      letterale al punto di scrittura non c'e'. Precisione al posto della
//      copertura: quel che segnala e' morto di sicuro, e sul resto tace.
//
//   D. Ogni campo di un'interfaccia esportata nei moduli di vista (`*-view.ts`)
//      ha un lettore di produzione? E' la superficie che A **non** guarda, perche'
//      A interroga `src/core/types.ts`: fra il dominio e i componenti c'e' uno
//      strato che dichiara i propri tipi, e in una sola sessione ci sono passate
//      cinque superfici morte tenute vive dai soli test.
//
//      Come C, precisione al posto della copertura — e con un falso negativo
//      **misurato**, non ipotizzato, scritto accanto alla funzione.
//
// ## Perche' un file nuovo e non `scripts/audit.mjs`
//
// `audit.mjs` guarda i **dati** (un backup passato come argomento), lo lancia
// una persona, e non fallisce mai: e' un referto da leggere. Questo guarda il
// **codice**, non prende argomenti, lo lancia la CI, e il suo unico prodotto
// utile e' il codice di uscita. Fonderli avrebbe voluto dire un sottocomando e
// due semantiche di `process.exit` nello stesso file, cioe' il posto esatto in
// cui un giorno la CI lancia il ramo sbagliato e nessuno se ne accorge, perche'
// tacere e' l'esito normale di entrambi.
//
// ## Il vincolo di progetto: zero falsi positivi
//
// Una guardia che grida al lupo viene disattivata entro una settimana, ed e'
// peggio di nessuna guardia. Quindi ogni volta che l'analisi non sa decidere,
// **tace**: un'occorrenza che non si riesce ad attribuire a un tipo non accusa
// nessuno, semplicemente non salva nessuno. Il prezzo e' che questo script
// prende **meno** casi di quanti ne esistano, ed e' il prezzo giusto.
//
// ## "Zero produttori" non vuol dire "nessuno lo scrive"
//
// E' la definizione senza la quale A e' decorativa, e l'ha imposta la prova
// storica (vedi qui sotto): al commit in cui `endDate` era ancora nei tipi,
// **ogni** sua scrittura esisteva ed era `draft.endDate`, `input.endDate`,
// `rule.endDate`. Contarle come produttori dava verde su un albero che aveva il
// difetto.
//
// Un campo e' prodotto quando **un valore entra da fuori almeno una volta**.
// Una scrittura la cui espressione contiene soltanto letture dello stesso campo
// e' una copia, e una catena di sole copie gira a vuoto.
//
// ## La prova che questo script fallisce dove deve
//
// Rilanciato su due alberi passati (worktree staccati, `scripts/` copiato
// dentro):
//
//   f4f21e7  -> RecurringRule.note, RecurringRule.anchorDay, RecurringRule.endDate
//   998f704  -> RecurringRuleCommon.endDate
//
// Cioe' i due campi che sono stati trovati a mano — `note` e, tre giorni dopo,
// `endDate` — piu' `anchorDay`, che aveva la stessa malattia ed e' guarito da
// solo con ADR 020. Chi cambia l'euristica rifaccia questa prova: e' l'unica
// che dice se lo script serve ancora a qualcosa.
//
// ## COSA QUESTO SCRIPT NON SA VEDERE (elenco esplicito, fa parte della resa)
//
// Analisi lessicale: niente parser TypeScript. `typescript@7` non espone piu'
// una API JS (`lib/` contiene solo `version.cjs` e il binario), quindi non
// c'era nemmeno la scelta di usare il compilatore gia' installato.
//
//   1. **Chiavi calcolate**: `{ [nome]: valore }`. Non le vede. L'unica viva
//      oggi ha una chiave `symbol` (`recurring-plan.ts`), che non e' un campo di
//      dominio. Le stampa fra i punti ciechi quando c'e' un reperto, cosi' chi
//      legge l'accusa sa cosa deve escludere a mano.
//   2. **Scritture per solo spread**: `{ ...rule }` non nomina nessun campo,
//      quindi non produce niente. E' voluto — copiare non e' produrre — ma vuol
//      dire che un campo scritto **solo** cosi' risulterebbe morto: oggi non
//      succede perche' uno spread da solo non porta dentro un valore nuovo.
//   3. **Attribuzione al tipo**: un'occorrenza `campo:` va a un tipo solo se nel
//      letterale (o in uno che lo contiene) c'e' una chiave **esclusiva** di quel
//      tipo. Senza quell'indizio non accusa nessuno e non salva nessuno. Un campo
//      il cui unico produttore vivesse in un letterale senza chiavi esclusive
//      verrebbe segnalato a torto: e' il modo in cui A puo' mentire.
//   4. **Valore riciclato con un altro nome**: `const x = rule.endDate` e poi
//      `{ endDate: x }` non e' riconosciuto come copia. Lo script tace, cioe'
//      sbaglia dalla parte giusta.
//   5. **Legami dentro una lista di parametri**: `function f({ note })` e'
//      un legame, ma qui la destrutturazione si riconosce da `const|let|var`
//      prima o da `=` dopo, quindi quella forma conta come scrittura. Silenzio.
//   6. **Testo dei template**: il contenuto letterale di `` `...` `` sparisce;
//      il codice dentro `${...}` no. Un record costruito componendo stringhe e'
//      invisibile.
//   7. **Campi non `readonly`** in `src/core/types.ts`: non entrano
//      nell'inventario. Oggi lo sono tutti.
//   8. **Chiavi i18n costruite a pezzi**: `t(\`x.${y}\`)` o un `as Key`. Non
//      esistono oggi; se ne comparisse una, B si dichiara **non applicabile** e
//      non fallisce, invece di accusare le chiavi che non riesce a vedere.
//   9. **Elenco dei lettori**: cerca il nome, non il tipo. Per un campo dal nome
//      condiviso (`categoryId` sta su tre entita') l'elenco contiene anche le
//      letture delle altre. L'accusa viene dalle scritture, che sono attribuite;
//      l'elenco no, e il referto lo dice.
//  10. **Solo `src/` e `tests/`**: `scripts/` non viene letto. `audit.mjs` legge
//      `e.note` da un backup, ma non e' l'app.
//
// ## Cosa NON e' un produttore (esclusioni, con la ragione)
//
// Test, fabbriche per i test, import di backup, migrazioni e le dichiarazioni
// stesse. L'elenco vive in `NON_PRODUTTORI` qui sotto: chi ne aggiunge uno
// scrive anche perche'.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TYPES_FILE = 'src/core/types.ts'
const DICTIONARIES = ['src/ui/i18n/it.ts', 'src/ui/i18n/en.ts']

/**
 * File che esistono, compilano, e **non** contano come produttori di campi.
 * La ragione sta accanto: senza, fra sei mesi questa lista e' un elenco di
 * scuse invece che di decisioni.
 */
const NON_PRODUTTORI = new Map([
  [TYPES_FILE, 'sono le dichiarazioni: dichiarare non e\' scrivere'],
  [
    'src/core/backup.ts',
    'export e `parseBackup`: l\'import non produce niente di nuovo — con zero ' +
      'produttori nemmeno un backup puo\' contenere il campo, perche\' un backup ' +
      'e\' l\'export di dati scritti da quest\'app',
  ],
  ['src/core/schema.ts', 'migrazioni: riscrivono record esistenti, non ne inventano'],
  ['src/core/testing.ts', 'fabbriche di entita\' per i test, dichiarato nel file stesso'],
  ['src/core/memory-persistence.ts', 'doppio della persistenza, solo per i test'],
])

/**
 * Membri di un'unione che **non compaiono in produzione e va bene cosi'**, con
 * accanto la ragione e **la condizione che li rende di nuovo un difetto**.
 *
 * Non e' una lista di eccezioni: e' una lista di decisioni. La differenza sta
 * nella seconda colonna — un'eccezione senza condizione e' una scusa che nessuno
 * rilegge, ed e' esattamente la forma dei rinvii che questo progetto continua a
 * riscoprire per caso.
 */
const MEMBRI_DICHIARATI = new Map([
  [
    "ThemePreference.'light'",
    'preferenza di tema esplicita, rimandata a fase 7 (vedi ROADMAP). Il campo ' +
      "resta perche' `'auto'` un produttore ce l'ha, e nessuna schermata finge di " +
      'cambiare il tema. Torna a essere un difetto **il giorno in cui il selettore ' +
      'esiste e non scrive**, o se la fase 7 si chiude senza costruirlo.',
  ],
  [
    "ThemePreference.'dark'",
    'stessa decisione di `light`: si spediscono insieme o non si spediscono.',
  ],
])

/* ------------------------------------------------------------------------ *
 * Lessico: via i commenti, via il contenuto delle stringhe.
 * ------------------------------------------------------------------------ */

/**
 * Restituisce due copie della sorgente, della stessa lunghezza dell'originale
 * (gli indici restano validi):
 *
 * - `code`: senza commenti **e** senza il contenuto delle stringhe. E' quella
 *   su cui si contano le graffe, perche' una `{` dentro una stringa non apre
 *   niente.
 * - `text`: senza commenti ma con le stringhe intatte. Serve a B: una chiave
 *   e' una stringa, e un nome citato in un commento non e' un lettore.
 *
 * I `/` sono il punto delicato: divisione o inizio di espressione regolare. La
 * regola e' quella classica — dopo un valore e' una divisione, dopo un
 * operatore e' una regex — con `<` **escluso** dagli operatori, o `</div>` in
 * un file `.tsx` aprirebbe una regex che non finisce piu'.
 */
function scan(source) {
  const code = source.split('')
  const text = source.split('')
  const blank = (from, to, target) => {
    for (let k = from; k < to; k += 1) if (target[k] !== '\n') target[k] = ' '
  }
  let previous = '' // ultimo carattere significativo di `code`

  /**
   * Il testo di un template si cancella, il codice dentro `${...}` no.
   *
   * La prima versione cancellava il template **intero**, e il primo giro l'ha
   * subito punita: `aria-label={`${category.name}, ${t('add.cat.hint')}`}` e'
   * un lettore vero, sparito insieme al template, e la chiave e' stata accusata
   * a torto. Cioe' il difetto che questo script esiste per non avere: un
   * allarme falso al primo giro e' uno script disattivato alla settimana.
   */
  function template(start) {
    let j = start + 1
    while (j < source.length) {
      const ch = source[j]
      if (ch === '\\') { blank(j, j + 2, code); blank(j, j + 2, text); j += 2; continue }
      if (ch === '`') return j + 1
      if (ch === '$' && source[j + 1] === '{') {
        // I due caratteri di apertura non sono codice: via anche loro, cosi'
        // `${` non lascia una graffa aperta nell'albero dei letterali.
        blank(j, j + 2, code)
        blank(j, j + 2, text)
        j = normale(j + 2, true)
        continue
      }
      blank(j, j + 1, code)
      blank(j, j + 1, text)
      j += 1
    }
    return j
  }

  /**
   * Codice normale da `start`. Con `dentroInterpolazione` si ferma alla graffa
   * che chiude il `${`, restituendo l'indice successivo.
   */
  function normale(start, dentroInterpolazione) {
    let i = start
    let depth = 0
    while (i < source.length) {
      const c = source[i]
      const d = source[i + 1]
      if (c === '/' && d === '/') {
        let end = source.indexOf('\n', i)
        if (end === -1) end = source.length
        blank(i, end, code)
        blank(i, end, text)
        i = end
        continue
      }
      if (c === '/' && d === '*') {
        let end = source.indexOf('*/', i + 2)
        end = end === -1 ? source.length : end + 2
        blank(i, end, code)
        blank(i, end, text)
        i = end
        continue
      }
      if (c === '"' || c === "'") {
        let j = i + 1
        while (j < source.length && source[j] !== c) {
          if (source[j] === '\\') j += 1
          if (source[j] === '\n') break
          j += 1
        }
        blank(i + 1, j, code)
        previous = c
        i = j + 1
        continue
      }
      if (c === '`') {
        i = template(i)
        previous = '`'
        continue
      }
      if (c === '/' && regexPuoIniziare(previous)) {
        let j = i + 1
        let inClass = false
        while (j < source.length) {
          const ch = source[j]
          if (ch === '\\') { j += 2; continue }
          if (ch === '[') inClass = true
          else if (ch === ']') inClass = false
          else if (ch === '/' && !inClass) break
          else if (ch === '\n') { j = -1; break }
          j += 1
        }
        if (j > 0) {
          blank(i + 1, j, code)
          previous = '/'
          i = j + 1
          continue
        }
      }
      if (c === '{') depth += 1
      if (c === '}') {
        if (dentroInterpolazione && depth === 0) {
          blank(i, i + 1, code)
          blank(i, i + 1, text)
          return i + 1
        }
        depth -= 1
      }
      if (!/\s/.test(c)) previous = c
      i += 1
    }
    return i
  }

  normale(0, false)
  return { code: code.join(''), text: text.join('') }
}

function regexPuoIniziare(previous) {
  return previous === '' || '(,=:[!&|?{};+-*%^~'.includes(previous)
}

/* ------------------------------------------------------------------------ *
 * Letterali: un albero di graffe con le chiavi che ciascuna dichiara.
 * ------------------------------------------------------------------------ */

const IDENT = /[A-Za-z_$]/

/**
 * Percorre `code` e costruisce l'albero dei blocchi `{ ... }`, registrando per
 * ognuno le chiavi che compaiono **direttamente** al suo interno.
 *
 * Una chiave e': un identificatore preceduto da `{` o `,` e seguito da `:`
 * (forma esplicita) oppure da `,` / `}` (forma abbreviata). Il `?` di un campo
 * opzionale e il `readonly` di una dichiarazione la escludono: sono
 * dichiarazioni di tipo, non scritture.
 */
function letterali(code) {
  const radice = { keys: new Set(), parent: null, start: -1 }
  const stack = [radice]
  const occorrenze = [] // { key, index, block, valore }
  const calcolate = [] // `{ [nome]: valore }`: il punto cieco, misurato
  // Tutte le parentesi, non solo le graffe: `(endDate: IsoDate, weeks = 8)` e'
  // una lista di parametri, e dopo una virgola ha la forma esatta di una chiave.
  // Senza questa distinzione `stats.ts` "produceva" `endDate`, ed e' il secondo
  // modo in cui questo script e' tornato verde su un albero che aveva il difetto.
  const parentesi = []
  let i = 0
  let prevTok = ''
  const salta = (j) => {
    while (j < code.length && /\s/.test(code[j])) j += 1
    return j
  }
  while (i < code.length) {
    const c = code[i]
    if (/\s/.test(c)) { i += 1; continue }
    if (c === '{') {
      const block = {
        keys: new Set(),
        parent: stack[stack.length - 1],
        start: i,
        // `const { note: _n, ...rest } = current` non scrive `note`: lo legge.
        // Il legame si riconosce da cosa c'e' **prima** della graffa...
        pattern: /\b(?:const|let|var)\s*$/.test(code.slice(Math.max(0, i - 12), i)),
      }
      stack.push(block)
      parentesi.push('{')
      prevTok = '{'
      i += 1
      continue
    }
    if (c === '}') {
      const chiuso = stack.length > 1 ? stack.pop() : null
      parentesi.pop()
      // ...oppure da cosa c'e' **dopo**: una graffa seguita da `=` (e non da
      // `=>` o `==`) e' il bersaglio di un'assegnazione, cioe' ancora un legame.
      if (chiuso !== null) {
        const dopo = salta(i + 1)
        if (code[dopo] === '=' && code[dopo + 1] !== '=' && code[dopo + 1] !== '>') {
          chiuso.pattern = true
        }
      }
      prevTok = '}'
      i += 1
      continue
    }
    if (c === '[' && (prevTok === '{' || prevTok === ',')) {
      let j = i + 1
      let depth = 0
      while (j < code.length) {
        if (code[j] === '[') depth += 1
        else if (code[j] === ']') {
          if (depth === 0) break
          depth -= 1
        }
        j += 1
      }
      const dentro = code.slice(i + 1, j)
      const dopo = salta(j + 1)
      // `[K in StoreName]: T` e' un tipo mappato, non una scrittura.
      if (code[dopo] === ':' && !/\bin\b/.test(dentro)) {
        calcolate.push({ index: i, block: stack[stack.length - 1] })
      }
      prevTok = ']'
      i = j + 1
      continue
    }
    if (c === '(' || c === '[') {
      parentesi.push(c)
      prevTok = c
      i += 1
      continue
    }
    if (c === ')' || c === ']') {
      parentesi.pop()
      prevTok = c
      i += 1
      continue
    }
    if (IDENT.test(c)) {
      let j = i
      while (j < code.length && /[\w$]/.test(code[j])) j += 1
      const word = code.slice(i, j)
      const after = salta(j)
      const next = code[after] ?? ''
      const dentroUnaGraffa = parentesi[parentesi.length - 1] === '{'
      const chiavePossibile = dentroUnaGraffa && (prevTok === '{' || prevTok === ',')
      const esplicita = next === ':'
      const abbreviata = next === ',' || next === '}'
      if (chiavePossibile && (esplicita || abbreviata) && word !== 'readonly') {
        const block = stack[stack.length - 1]
        block.keys.add(word)
        occorrenze.push({
          key: word,
          index: i,
          block,
          valore: esplicita ? espressione(code, after + 1) : null,
        })
      }
      prevTok = word
      i = j
      continue
    }
    prevTok = c
    i += 1
  }
  // Il `pattern` di una graffa si scopre a volte solo quando si chiude, quindi
  // il filtro si applica alla fine — e vale anche per i letterali annidati
  // dentro un legame (`const { a: { b } } = x`).
  const dentroUnLegame = (block) => {
    for (let b = block; b !== null; b = b.parent) if (b.pattern === true) return true
    return false
  }
  return {
    occorrenze: occorrenze.filter((o) => !dentroUnLegame(o.block)),
    calcolate: calcolate.filter((c) => !dentroUnLegame(c.block)),
  }
}

/** Le chiavi del letterale e di tutti quelli che lo contengono. */
function contesto(block) {
  const keys = new Set()
  for (let b = block; b !== null; b = b.parent) for (const k of b.keys) keys.add(k)
  return keys
}

/**
 * L'espressione che parte da `start` e finisce dove finisce il valore: la
 * virgola o la graffa che la chiude, a profondita' zero.
 */
function espressione(code, start) {
  let i = start
  let depth = 0
  for (; i < code.length; i += 1) {
    const c = code[i]
    if ('([{'.includes(c)) depth += 1
    else if (')]}'.includes(c)) {
      if (depth === 0) break
      depth -= 1
    } else if (c === ',' && depth === 0) break
  }
  return code.slice(start, i).trim()
}

/**
 * Una **copia di se stesso**: `{ endDate: draft.endDate }`.
 *
 * E' la distinzione senza la quale tutto questo script non serve a niente, e
 * l'ha insegnata la prova storica: al commit in cui `note` ed `endDate` erano
 * ancora nei tipi, *ogni* loro scrittura aveva questa forma — `draft.endDate`,
 * `input.note`, `rule.note`. Contate come scritture, i due campi risultavano
 * vivi e lo script tornava verde sull'albero che li conteneva: l'unica cosa
 * peggiore di nessuna guardia.
 *
 * "Zero produttori" non vuol dire che nessuno scrive il campo: vuol dire che il
 * valore **non entra mai da fuori**. Un campo e' morto quando ogni sua scrittura
 * si limita a ricopiare lo stesso campo da un'altra parte, cioe' quando l'intera
 * catena gira a vuoto.
 *
 * Verso sicuro: in dubbio e' una **produzione** (silenzio). Una copia si
 * riconosce solo nella forma piu' netta — una lettura di membro dello stesso
 * nome, niente altro.
 */
function eCopia(occ, code) {
  const nome = occ.key.replace(/[$]/g, '\\$&')
  /**
   * Vero se nell'espressione non compare **niente** oltre a letture dello
   * stesso campo (e ai due valori vuoti, che non sono un'origine).
   *
   * Non basta la forma pura `draft.endDate`: `patch.endDate === undefined ?
   * current.endDate : (patch.endDate ?? undefined)` e' altrettanto una copia, e
   * al commit in cui `endDate` era ancora nei tipi era proprio quella riga a
   * tenerlo in vita. Ma `target?.interval ?? INTERVAL` **non** lo e': `INTERVAL`
   * e' un valore che entra da fuori, ed e' l'unico intervallo che questo
   * prodotto sappia creare.
   */
  const soloLettura = (espr) => {
    const letture = new RegExp(
      `[A-Za-z_$][\\w$]*(?:\\??\\.[A-Za-z_$][\\w$]*)*\\??\\.${nome}\\b`,
      'g',
    )
    if (!letture.test(espr)) return false
    const resto = espr.replace(letture, '').replace(/\b(?:undefined|null)\b/g, '')
    return /^[\s?:!=<>()&|.,;]*$/.test(resto)
  }
  if (occ.valore !== null) return soloLettura(occ.valore)

  // Forma abbreviata: `{ endDate }`. E' una copia solo se in **questo file** il
  // nome nasce da una lettura dello stesso campo e da nient'altro:
  // `const endDate = target?.endDate`.
  //
  // Il "da nient'altro" e' la parte che conta, e l'ha insegnata un falso
  // positivo: `const interval = target?.interval ?? INTERVAL` **contiene** una
  // lettura di `interval`, ma il `??` e' un'origine vera — il valore entra da
  // fuori ogni volta che la regola e' nuova. Con la regola larga ("contiene una
  // lettura") `interval` risultava morto pur essendo l'unico intervallo che
  // questo prodotto sappia creare.
  const legame = new RegExp(`\\b(?:const|let|var)\\s+${nome}\\s*=`, 'g')
  let vistoUnLegame = false
  for (let m = legame.exec(code); m !== null; m = legame.exec(code)) {
    vistoUnLegame = true
    const rhs = espressioneDiIstruzione(code, m.index + m[0].length).trim()
    if (!soloLettura(rhs)) return false
  }
  if (vistoUnLegame) return true
  // Nessun `const`: resta la destrutturazione, `const { endDate } = rule`.
  return new RegExp(`\\{[^{}\\n]*\\b${nome}\\b[^{}\\n]*\\}\\s*=[^=]`).test(code)
}

/** Il valore di un'assegnazione: fino a fine riga, se le parentesi sono chiuse. */
function espressioneDiIstruzione(code, start) {
  let i = start
  let depth = 0
  for (; i < code.length; i += 1) {
    const c = code[i]
    if ('([{'.includes(c)) depth += 1
    else if (')]}'.includes(c)) depth -= 1
    else if (c === '\n' && depth <= 0) {
      const dopo = /^\s*(\S)/.exec(code.slice(i + 1))
      if (dopo !== null && '.?:&|+'.includes(dopo[1])) continue
      break
    }
  }
  return code.slice(start, i)
}

/* ------------------------------------------------------------------------ *
 * Inventario dei campi: `src/core/types.ts`.
 * ------------------------------------------------------------------------ */

/**
 * Ogni `readonly nome` in `types.ts`, attribuito alla dichiarazione che lo
 * precede (`interface X` o `type X =`). Le due varianti inline di
 * `WithCadence` finiscono cosi' sotto lo stesso nome, che e' cio' che serve:
 * `cadence` e `anchorDay` sono campi di quella forma, non di due.
 */
function inventarioCampi(sorgente) {
  const { code } = scan(sorgente)
  const dichiarazioni = []
  const re = /\b(?:interface|type)\s+([A-Za-z_$][\w$]*)/g
  for (let m = re.exec(code); m !== null; m = re.exec(code)) {
    dichiarazioni.push({ nome: m[1], index: m.index })
  }
  const campi = new Map() // tipo -> Set(campo)
  const campoRe = /\breadonly\s+([A-Za-z_$][\w$]*)\s*\??\s*:/g
  for (let m = campoRe.exec(code); m !== null; m = campoRe.exec(code)) {
    let proprietario = null
    for (const d of dichiarazioni) {
      if (d.index < m.index) proprietario = d.nome
      else break
    }
    if (proprietario === null) continue
    if (!campi.has(proprietario)) campi.set(proprietario, new Set())
    campi.get(proprietario).add(m[1])
  }
  return campi
}

/* ------------------------------------------------------------------------ *
 * File.
 * ------------------------------------------------------------------------ */

function file(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) file(full, out)
    else if (/\.(ts|tsx)$/.test(entry)) out.push(relative(ROOT, full).split(sep).join('/'))
  }
  return out
}

const eTest = (p) => /\.test\.tsx?$/.test(p) || p.startsWith('tests/')

function leggi(p) {
  return readFileSync(join(ROOT, p), 'utf8')
}

function riga(sorgente, index) {
  let n = 1
  for (let i = 0; i < index; i += 1) if (sorgente[i] === '\n') n += 1
  return n
}

/* ------------------------------------------------------------------------ *
 * A. Campi senza produttore.
 * ------------------------------------------------------------------------ */

function campiSenzaProduttore(tuttiIFile) {
  const campiPerTipo = inventarioCampi(leggi(TYPES_FILE))

  // Una chiave e' **esclusiva** di un tipo se nessun'altra dichiarazione la
  // dichiara: e' l'unico indizio con cui questo script sa dire a quale tipo
  // appartiene un letterale, senza sapere niente di tipi.
  const quantiTipi = new Map()
  for (const campi of campiPerTipo.values()) {
    for (const campo of campi) quantiTipi.set(campo, (quantiTipi.get(campo) ?? 0) + 1)
  }
  const esclusiva = (campo) => quantiTipi.get(campo) === 1

  const produttori = new Map() // "Tipo.campo" -> [{ file, line }]
  const produzione = tuttiIFile.filter((p) => !eTest(p) && !NON_PRODUTTORI.has(p))

  for (const p of produzione) {
    const sorgente = leggi(p)
    const { code } = scan(sorgente)
    for (const occ of letterali(code).occorrenze) {
      const tipiCheDichiarano = [...campiPerTipo]
        .filter(([, campi]) => campi.has(occ.key))
        .map(([tipo]) => tipo)
      if (tipiCheDichiarano.length === 0) continue
      // Ricopiare il campo da un'altra parte non lo produce: il valore deve
      // entrare da fuori almeno una volta, o la catena gira a vuoto.
      if (eCopia(occ, code)) continue
      const ctx = contesto(occ.block)
      // Attribuisce solo dove c'e' un indizio positivo; in caso di indizi per
      // piu' tipi li accredita **tutti** (il silenzio, mai l'allarme).
      const attribuiti = tipiCheDichiarano.filter((tipo) => {
        for (const k of ctx) if (campiPerTipo.get(tipo).has(k) && esclusiva(k)) return true
        return false
      })
      for (const tipo of attribuiti) {
        const id = `${tipo}.${occ.key}`
        if (!produttori.has(id)) produttori.set(id, [])
        produttori.get(id).push({ file: p, line: riga(sorgente, occ.index) })
      }
    }
  }

  const morti = []
  for (const [tipo, campi] of campiPerTipo) {
    for (const campo of campi) {
      const id = `${tipo}.${campo}`
      if ((produttori.get(id) ?? []).length > 0) continue
      const altri = [...campiPerTipo]
        .filter(([t, campi]) => t !== tipo && campi.has(campo))
        .map(([t]) => t)
      morti.push({ tipo, campo, altri, lettori: lettori(campo, tuttiIFile) })
    }
  }
  const quantiCampi = [...campiPerTipo.values()].reduce((n, s) => n + s.size, 0)
  // L'inventario si puo' stampare (`--dettagli`): un verde di cui non si vede
  // *cosa* e' stato guardato non dice niente, e un inventario vuoto darebbe
  // verde per il motivo peggiore.
  const inventario = []
  for (const [tipo, campi] of campiPerTipo) {
    for (const campo of campi) {
      inventario.push({
        tipo,
        campo,
        esclusiva: esclusiva(campo),
        produttori: produttori.get(`${tipo}.${campo}`) ?? [],
      })
    }
  }
  return {
    morti,
    inventario,
    quantiCampi,
    quanteDichiarazioni: campiPerTipo.size,
    quantiFile: produzione.length,
  }
}

/**
 * Le occorrenze del nome fuori dalle dichiarazioni: e' cio' che tiene in vita
 * un campo morto, ed e' la lista che serve a chi deve cancellarlo. Include i
 * test di proposito — sono la meta' del problema, non un dettaglio.
 *
 * Limite: cerca il nome, non la sua origine. Per un campo con lo stesso nome su
 * due tipi (`note` era su `Expense` e su `RecurringRule`) l'elenco contiene
 * anche le letture dell'altro. L'accusa arriva dai produttori, non da qui.
 */
function lettori(campo, tuttiIFile) {
  const re = new RegExp(`\\b${campo}\\b`)
  const perFile = []
  let totale = 0
  for (const p of tuttiIFile) {
    if (p === TYPES_FILE) continue
    const { text } = scan(leggi(p))
    const righe = []
    text.split('\n').forEach((linea, index) => {
      if (re.test(linea)) righe.push(index + 1)
    })
    if (righe.length === 0) continue
    totale += righe.length
    perFile.push({ file: p, righe, test: eTest(p) })
  }
  // Prima i file di produzione: sono quelli da cui si comincia a cancellare.
  perFile.sort((a, b) => Number(a.test) - Number(b.test) || a.file.localeCompare(b.file))
  return { perFile, totale }
}

/** I punti in cui l'analisi e' cieca, se ce ne sono: si stampano col reperto. */
function puntiCiechi(tuttiIFile) {
  const trovati = []
  for (const p of tuttiIFile) {
    if (eTest(p) || NON_PRODUTTORI.has(p)) continue
    const sorgente = leggi(p)
    const { code } = scan(sorgente)
    for (const c of letterali(code).calcolate) {
      trovati.push({ file: p, line: riga(sorgente, c.index), che: 'chiave calcolata' })
    }
    const assign = /Object\.assign\s*\(/g
    for (let m = assign.exec(code); m !== null; m = assign.exec(code)) {
      trovati.push({ file: p, line: riga(sorgente, m.index), che: 'Object.assign' })
    }
  }
  return trovati
}

/* ------------------------------------------------------------------------ *
 * D. Campi di `src/ui` senza nessun lettore.
 * ------------------------------------------------------------------------ */

/**
 * I moduli di vista: dove vive la superficie che A non guarda.
 *
 * A interroga `src/core/types.ts`, cioe' il **dominio**. Ma fra il dominio e i
 * componenti c'e' uno strato — `*-view.ts` — che dichiara i propri tipi, e li'
 * nessuno guarda: in una sola sessione ci sono passate **cinque** superfici morte,
 * `accruedCents`, `breakdownTotal`, `fixedInPeriodCents`, `livedFraction` e i tre
 * `null` del ramo orfano, tutte tenute vive dai soli test.
 */
const MODULI_DI_VISTA = [
  'src/ui/stats-view.ts',
  'src/ui/budget-view.ts',
  'src/ui/recurring-view.ts',
  'src/ui/backup-nudge.ts',
]

/**
 * Campi di interfacce esportate nei moduli di vista che **non compaiono in nessun
 * file di produzione**, il proprio compreso.
 *
 * ## Perche' "il proprio compreso", e non "fuori dal proprio file"
 *
 * Provata prima la forma larga — *nessun lettore **fuori** dal file che lo
 * dichiara* — su 52 campi: **due segnalati, uno falso**. `BudgetStart.beforeCents`
 * ha tre lettori dentro `budget-view.ts` ed e' vivissimo: e' un dettaglio interno
 * di un tipo di ritorno, non una superficie morta. Un controllo che lo segnala
 * insegna a ignorarlo.
 *
 * La forma stretta — *nessun lettore da nessuna parte* — sugli stessi 52 campi da'
 * **un solo flag e zero falsi positivi**. E' la stessa scelta di C: **precisione al
 * posto della copertura.** Cio' che segnala e' morto di sicuro; su un campo letto
 * una volta sola in casa, tace.
 *
 * ## Il punto cieco, dichiarato invece che scoperto
 *
 * Un campo dal nome comune (`rows`, `name`, `cents`) **sembra vivo** perche' quella
 * stringa compare ovunque: questo controllo ha **falsi negativi per costruzione**,
 * e non e' un difetto da riparare — e' il prezzo di non averne di positivi. Un
 * controllo che segnalasse `.name` verrebbe spento in una settimana.
 *
 * Quindi: **cio' che passa non e' dichiarato vivo.** E' dichiarato "non
 * riconoscibile come morto da qui".
 *
 * ## Il falso negativo misurato, sui due campi di `Trend`
 *
 * Non e' un'ipotesi, ed e' **provato disfacendo**: cancellando da `Stats.tsx` la
 * riga che legge `trend.current`, e poi quella che legge `trend.closed`, questo
 * controllo resta **verde tutte e due le volte**. Sono due campi vivi che il
 * controllo non saprebbe dichiarare morti.
 *
 * Cosa li tiene su, letto strumentando il confronto invece che indovinandolo:
 *
 * - **`current`** matcha in **diciannove** file di produzione, e in nessuno di
 *   loro e' quel campo. L'idioma dei ref di Preact — `dialog.current`,
 *   `toastTimer.current`, `sentinel.current`, `holdTimer.current` — copre da solo
 *   dieci componenti e in questa base di codice esistera' sempre. Poi
 *   `{ ...current, ... }` in `idb.ts`, `repository.ts` e `recurrence.ts`, dove
 *   `current` e' una variabile locale; `RuleSheet.tsx`, che dichiara un
 *   **proprio** `readonly current: Category | null`; e `settings.budget.current`,
 *   che e' una chiave del dizionario.
 * - **`closed`** matcha in **quattro**: `[...closed, created]` in `budget.ts`
 *   (variabile locale), `t('allowance.closed')` in `budget-view.ts`, e la stessa
 *   chiave dichiarata nei due dizionari.
 *
 * **E `closed` nomina una classe di maschere che l'esempio precedente non
 * nominava.** Non e' l'idioma dei ref: e' **la chiave i18n puntata**. Il
 * confronto cerca `[.?]campo\b`, e `'allowance.closed'` e' una stringa che
 * contiene un punto seguito dal nome — quindi **qualunque delle 340 chiavi il cui
 * ultimo segmento coincida con un campo di vista lo tiene vivo**, e i dizionari
 * sono file di produzione perche' il controllo B ha bisogno che lo siano. La
 * maschera non richiede nemmeno un lettore: basta che la chiave sia dichiarata.
 *
 * **Un campo con un nome comune in un tipo di vista e' invisibile a questo
 * controllo per costruzione**, e non c'e' niente da riparare senza sapere i tipi:
 * distinguerli richiederebbe risolvere a quale dichiarazione appartiene ogni
 * accesso, cioe' un analizzatore invece di una ricerca.
 *
 * Vale la pena scriverlo perche' il controllo **e' verde su un campo morto** dal
 * giorno in cui e' nato: chi lo legge deve sapere che il silenzio su un nome
 * comune non significa niente.
 *
 * ## Perche' l'esempio e' cambiato, che e' la parte da non ricopiare
 *
 * Qui c'era scritto **`PeriodBar.current`**, con la previsione che avrebbe
 * "acquistato un lettore vero" e chiuso il caso dai fatti. Non e' andata cosi':
 * quel campo e' stato **tolto** (DEBITO §6), perche' ripeteva la propria
 * posizione nel tipo. Il commento e' quindi rimasto a documentare **un esempio
 * inesistente** — cioe' un campo senza produttore applicato alla prosa, dentro il
 * file che quel difetto esiste per prendere.
 *
 * L'esempio nuovo non e' lo stesso nome trasferito: e' stato **ri-misurato**, e
 * la misura ha dato una causa diversa (la chiave i18n) e un campo in piu'
 * (`closed`) che la prima derivazione non aveva. Chi lo ritocca rifaccia
 * l'esperimento — togliere il lettore, rilanciare — invece di riscrivere la
 * frase: e' l'unica differenza fra questo paragrafo e un'ipotesi.
 */
function campiDiVistaSenzaLettore(tuttiIFile) {
  const produzione = tuttiIFile.filter((p) => !eTest(p) && !NON_PRODUTTORI.has(p))
  const testi = produzione.map((p) => ({ file: p, code: scan(leggi(p)).text }))

  const morti = []
  let quanti = 0
  for (const modulo of MODULI_DI_VISTA) {
    if (!existsSync(join(ROOT, modulo))) continue
    const { text } = scan(leggi(modulo))
    for (const m of text.matchAll(/export interface (\w+) \{([\s\S]*?)\n\}/g)) {
      for (const c of m[2].matchAll(/readonly (\w+)\??:/g)) {
        quanti += 1
        const campo = c[1]
        const vivo = testi.some(({ file, code }) =>
          file === modulo
            ? new RegExp(`[.?]${campo}\\b`).test(code)
            : new RegExp(`[.?]${campo}\\b|\\b${campo}\\s*[,:}]`).test(code),
        )
        if (!vivo) morti.push({ tipo: m[1], campo, modulo })
      }
    }
  }
  return { moduli: MODULI_DI_VISTA.length, quanti, morti }
}

/* ------------------------------------------------------------------------ *
 * C. Membri di un'unione di letterali che non compaiono da nessuna parte.
 * ------------------------------------------------------------------------ */

/**
 * Le unioni di soli letterali dichiarate in `types.ts`.
 *
 * Solo quelle di **soli** letterali: se il corpo contiene un identificatore, un
 * generico o un altro tipo, non e' un'enumerazione e non si guarda.
 */
function unioniDiLetterali(testo) {
  const trovate = []
  const decl = /export type (\w+) =([^;]*?)(?=\n\s*\n|\nexport |\n\/\*|\n\/\/|$)/g
  for (let m = decl.exec(testo); m !== null; m = decl.exec(testo)) {
    const corpo = m[2].trim()
    if (!/^'[^']*'(\s*\|\s*'[^']*')*$/.test(corpo)) continue
    trovate.push({ nome: m[1], membri: [...corpo.matchAll(/'([^']*)'/g)].map((x) => x[1]) })
  }
  return trovate
}

/**
 * **La granularita' sotto quella del controllo A**, e il difetto che l'ha
 * chiesta: `Budget.period` e' vivo perche' `setBudget` lo scrive, quindi A lo
 * dichiara prodotto — ma questo non dice niente su *quali* dei suoi valori
 * qualcuno scriva davvero. `Settings.theme` e' stato spedito con `'auto'`
 * scritto dal seed e con `'light'` e `'dark'` che nessuna schermata scrive: un
 * campo che passa la lettera di A e non il suo spirito.
 *
 * ## Cosa questo controllo dice davvero, che e' meno di quel che sembra
 *
 * **Dice presenza, non produzione.** Segnala un membro che non compare
 * **da nessuna parte** in produzione, fuori dalla propria dichiarazione. Non
 * dice che i membri rimasti siano prodotti: dice solo che quelli segnalati non
 * lo sono di sicuro.
 *
 * ## Il punto cieco, dichiarato invece che scoperto
 *
 * La forma ovvia — cercare assegnamenti `campo: 'valore'` — **non regge**, e la
 * prova e' `Settings.language`: si scrive con `updateSettings({ language: next })`,
 * dove `next` e' una variabile, quindi i letterali `'it'` e `'en'` **non
 * compaiono mai al punto di scrittura**. Un controllo cosi' li dichiarerebbe
 * morti tutti e due. Distinguere richiederebbe analisi di flusso, che su questo
 * progetto e' sproporzionata.
 *
 * Da cui la scelta: **precisione al posto della copertura.** Un membro che non
 * compare mai e' morto con certezza; uno che compare puo' essere vivo o solo
 * nominato, e questo controllo tace. Misurato sull'albero al momento di
 * scriverlo: quindici membri su sei unioni, **due segnalati e zero falsi
 * positivi**.
 *
 * `NON_PRODUTTORI` vale anche qui, e per la stessa ragione di A: che
 * `parseBackup` accetti un valore non dice che l'app lo produca — una porta che
 * si apre non e' qualcuno che entra.
 */
function membriSenzaUso(tuttiIFile) {
  const { text: dichiarazioni } = scan(leggi(TYPES_FILE))
  const unioni = unioniDiLetterali(dichiarazioni)

  const produzione = tuttiIFile.filter((p) => !eTest(p) && !NON_PRODUTTORI.has(p))
  const testi = produzione.map((p) => ({ file: p, sorgente: leggi(p) }))

  const morti = []
  const dichiarati = []
  let quanti = 0
  for (const unione of unioni) {
    for (const membro of unione.membri) {
      quanti += 1
      const ago = `'${membro}'`
      let vivo = false
      for (const { sorgente } of testi) {
        if (scan(sorgente).text.includes(ago)) {
          vivo = true
          break
        }
      }
      if (vivo) continue
      const chiave = `${unione.nome}.'${membro}'`
      const dichiarato = MEMBRI_DICHIARATI.get(chiave)
      if (dichiarato === undefined) morti.push({ unione: unione.nome, membro })
      else dichiarati.push({ chiave, perche: dichiarato })
    }
  }
  return { unioni: unioni.length, quanti, morti, dichiarati }
}

/* ------------------------------------------------------------------------ *
 * B. Chiavi i18n senza lettore.
 * ------------------------------------------------------------------------ */

function chiaviSenzaLettore(tuttiIFile) {
  const chiavi = new Set()
  for (const dizionario of DICTIONARIES) {
    const { text } = scan(leggi(dizionario))
    const re = /^\s*'([^']+)'\s*:/gm
    for (let m = re.exec(text); m !== null; m = re.exec(text)) chiavi.add(m[1])
  }

  // Guardia: se una chiave puo' essere costruita a pezzi, B non sa piu' dire
  // chi legge cosa. In quel caso si dichiara non applicabile invece di
  // accusare le chiavi che non vede.
  const sospetti = []
  const lettura = tuttiIFile.filter((p) => !eTest(p) && !DICTIONARIES.includes(p))
  for (const p of lettura) {
    const { text: sorgente } = scan(leggi(p))
    const visti = new Set()
    for (const [re, che] of [
      [/\bt\(\s*`/g, 'chiave da template'],
      [/\bas\s+Key\b/g, 'cast a Key'],
    ]) {
      for (let m = re.exec(sorgente); m !== null; m = re.exec(sorgente)) {
        const line = riga(sorgente, m.index)
        if (visti.has(`${line}`)) continue
        visti.add(`${line}`)
        sospetti.push({ file: p, line, che })
      }
    }
  }
  if (sospetti.length > 0) return { applicabile: false, sospetti, quante: chiavi.size }

  const viste = new Map() // chiave -> [{file, line}]
  for (const p of [...lettura, ...tuttiIFile.filter((x) => eTest(x))]) {
    const sorgente = leggi(p)
    const { text } = scan(sorgente)
    for (const chiave of chiavi) {
      for (const q of ["'", '"', '`']) {
        let from = 0
        for (;;) {
          const at = text.indexOf(q + chiave + q, from)
          if (at === -1) break
          if (!viste.has(chiave)) viste.set(chiave, [])
          viste.get(chiave).push({ file: p, line: riga(sorgente, at), test: eTest(p) })
          from = at + 1
        }
      }
    }
  }

  const morte = []
  for (const chiave of chiavi) {
    const occorrenze = viste.get(chiave) ?? []
    if (occorrenze.some((o) => !o.test)) continue
    morte.push({ chiave, soloTest: occorrenze })
  }
  return { applicabile: true, morte, quante: chiavi.size, quantiFile: lettura.length }
}

/* ------------------------------------------------------------------------ *
 * Referto.
 * ------------------------------------------------------------------------ */

const tuttiIFile = [...file(join(ROOT, 'src')), ...file(join(ROOT, 'tests'))].sort()
const dettagli = process.argv.includes('--dettagli')
let rotto = false

console.log('')
const a = campiSenzaProduttore(tuttiIFile)
if (dettagli) {
  for (const voce of a.inventario) {
    const primo = voce.produttori[0]
    console.log(
      `     ${voce.esclusiva ? '·' : ' '} ${`${voce.tipo}.${voce.campo}`.padEnd(38)}` +
        `${String(voce.produttori.length).padStart(3)} scritture` +
        `${primo === undefined ? '' : `   prima: ${primo.file}:${primo.line}`}`,
    )
  }
  console.log(
    `\n     · = nome esclusivo di quella dichiarazione, cioe' cio' che permette di\n` +
      `       riconoscere un letterale di quel tipo. I nomi condivisi si salvano solo\n` +
      `       se stanno in un letterale che ne contiene almeno uno esclusivo.\n`,
  )
}
console.log(
  `  A. Campi senza produttore — ${a.quantiCampi} campi in ${a.quanteDichiarazioni} dichiarazioni ` +
    `di ${TYPES_FILE}, ${a.quantiFile} file di produzione`,
)
if (a.morti.length === 0) {
  console.log('     nessuno: ogni campo ha una scrittura fuori da import, migrazioni e test.\n')
} else {
  rotto = true
  for (const { tipo, campo, altri, lettori: trovate } of a.morti) {
    console.log(
      `\n     ── ${tipo}.${campo} — nessun valore entra mai da fuori, ` +
        `${trovate.totale} occorrenze in ${trovate.perFile.length} file lo tengono in vita`,
    )
    if (altri.length > 0) {
      console.log(
        `        (il nome e' anche di ${altri.join(', ')}: l'elenco contiene anche quelle letture.\n` +
          `         L'accusa viene dalle scritture, che sono attribuite al tipo; questo elenco no.)`,
      )
    }
    for (const f of trovate.perFile) {
      console.log(
        `        ${f.test ? 'test ' : '     '}${f.file}  ` +
          `${f.righe.length} — righe ${f.righe.join(', ')}`,
      )
    }
  }
  const ciechi = puntiCiechi(tuttiIFile)
  if (ciechi.length > 0) {
    console.log('\n     Punti in cui l\'analisi e\' cieca (da escludere a mano prima di cancellare):')
    for (const c of ciechi) console.log(`        ${c.file}:${c.line}  ${c.che}`)
  }
  console.log(
    '\n     Un campo si spedisce insieme al suo produttore, o non si spedisce.\n' +
      '     La cancellazione e\' una decisione umana: questo script si limita a non farla passare in silenzio.\n',
  )
}

const b = chiaviSenzaLettore(tuttiIFile)
if (!b.applicabile) {
  console.log(
    `  B. Chiavi i18n senza lettore — NON APPLICABILE: ${b.sospetti.length} chiavi costruite a pezzi`,
  )
  for (const s of b.sospetti) console.log(`        ${s.file}:${s.line}  ${s.che}`)
  console.log('     Con una chiave costruita a runtime non so piu\' dire chi legge cosa: taccio.\n')
} else {
  console.log(`  B. Chiavi i18n senza lettore — ${b.quante} chiavi, ${b.quantiFile} file di produzione`)
  if (b.morte.length === 0) {
    console.log('     nessuna: ogni chiave dei due dizionari ha almeno un lettore di produzione.\n')
  } else {
    rotto = true
    for (const { chiave, soloTest } of b.morte) {
      const coda =
        soloTest.length === 0
          ? 'nessun lettore, in nessun file'
          : `letta solo da ${soloTest.length} punto/i di test`
      console.log(`\n     ── ${chiave} — ${coda}`)
      for (const o of soloTest) console.log(`        ${o.file}:${o.line}`)
    }
    console.log(
      '\n     Una chiave senza lettore e\' testo che nessuno vedra\' mai, in due lingue.\n',
    )
  }
}

const c = membriSenzaUso(tuttiIFile)
console.log(
  `  C. Membri di un'unione senza nessun uso — ${c.quanti} membri in ${c.unioni} unioni di ${TYPES_FILE}`,
)
if (c.morti.length === 0) {
  console.log('     nessuno senza dichiarazione.')
} else {
  rotto = true
  for (const { unione, membro } of c.morti) {
    console.log(`\n     ── ${unione}.'${membro}' — non compare in nessun file di produzione`)
  }
  console.log(
    '\n     Un campo vivo con un valore morto passa il controllo A e non fa niente:\n' +
      "     e' la granularita' sotto quella dei campi, e nessuno la guarda.\n",
  )
}
for (const { chiave, perche } of c.dichiarati) {
  console.log(`     ${chiave} — non compare, ed e' dichiarato: ${perche}`)
}
console.log('')

const d = campiDiVistaSenzaLettore(tuttiIFile)
console.log(
  `  D. Campi di \`src/ui\` senza lettore — ${d.quanti} campi in ${d.moduli} moduli di vista`,
)
if (d.morti.length === 0) {
  console.log('     nessuno: ogni campo dichiarato ha almeno un lettore di produzione.\n')
} else {
  rotto = true
  for (const { tipo, campo, modulo } of d.morti) {
    console.log(`\n     ── ${tipo}.${campo} — nessun lettore di produzione (${modulo})`)
  }
  console.log(
    '\n     Una superficie di vista senza lettori e` tenuta viva dai suoi test:\n' +
      "     e' la famiglia di `expensesInRange` e `planBudgetChange`, gia' cancellate due volte.\n",
  )
}

process.exit(rotto ? 1 : 0)
