/**
 * Il dizionario italiano. **E' la fonte delle chiavi**, non una delle due
 * traduzioni alla pari: `en.ts` e' tipizzato come `Record<keyof typeof it,
 * string>`, quindi da qui nascono i nomi e la' vanno riempiti tutti.
 *
 * ## Come si legge una chiave
 *
 * `zona.cosa` — la zona e' la schermata o il componente, la cosa e' il ruolo.
 * Niente chiavi che sono la frase stessa (`'Tocca il + qui sotto'`): cambiare il
 * copy cambierebbe la chiave in tutti i file che la usano, e la prima volta che
 * qualcuno corregge un refuso il dizionario inglese resta indietro in silenzio.
 *
 * ## I segnaposto
 *
 * `{nome}` viene sostituito da `t()`. Non c'e' nessun motore di template:
 * niente plurali automatici, niente formattazione dentro la stringa. Dove il
 * plurale conta ci sono **due chiavi** (`days.one` / `days.other`), perche' due
 * lingue con la stessa regola non giustificano un motore che pesa piu' di tutto
 * il modulo.
 *
 * ## I nomi delle otto categorie di default stanno qui, e non sono interfaccia
 *
 * `cat.default.*` sono le uniche chiavi di questo file che **non si rileggono a
 * ogni render**: si leggono **una volta sola**, al primo avvio, per scrivere le
 * otto categorie nel database gia' nella lingua risolta (`src/app/main.tsx`).
 * Da quell'istante sono **dati dell'utente**, come se le avesse scritte lui —
 * e cambiare lingua dopo **non** le ritraduce. E' corretto: sono sue, e
 * rinominarle e' esattamente cio' che l'editor delle categorie serve a fare.
 *
 * Qui c'era scritto il contrario, e l'argomento era buono finche' i nomi erano
 * otto stringhe italiane cablate in `defaults.ts`: tradurre *quelle* avrebbe
 * significato rinominare a ogni cambio di lingua le categorie di chi le aveva
 * gia' rinominate. Quel difetto non e' stato accettato, e' stato **spostato di
 * momento**: il dizionario tocca i nomi solo prima che esistano, e il core non
 * ha piu' nessun nome dentro (`buildDefaultCategories` li prende come
 * argomento). Chi ripristinasse la vecchia frase riporterebbe otto etichette
 * italiane sul telefono di chi legge in inglese — cioe' il secondo dei due tap,
 * il solo che decide *cosa* stai salvando, in una lingua che non legge.
 *
 * Il criterio, per la prossima chiave dubbia: **una chiave e' interfaccia se si
 * rilegge; e' un seme se si scrive.** I semi vivono qui perche' qui c'e' la
 * lingua, non perche' siano testo dell'app.
 */
export const it = {
  /* --- giorni e periodi ------------------------------------------------- */
  'day.today': 'Oggi',
  'day.yesterday': 'Ieri',
  'period.weekly': 'Questa settimana',
  'period.monthly': 'Questo mese',
  // "da mercoledi'" ma "dal 19 agosto": la preposizione cambia con la forma
  // della data, quindi sta nella stringa e non nel codice che la compone.
  // In inglese sono la stessa parola, ed e' proprio per questo che le chiavi
  // restano due: la lingua che distingue detta la forma della chiave.
  'fromDay.weekly': 'da {day}',
  'fromDay.monthly': 'dal {day}',
  'days.one': '1 giorno',
  'days.other': '{count} giorni',
  'cadence.weekly': 'a settimana',
  'cadence.monthly': 'al mese',

  /* --- guscio ------------------------------------------------------------ */
  // Il <title> del documento. In standalone non si vede; nel browser si', ed e'
  // il nome che iOS propone quando si condivide il link dell'app.
  'doc.title': 'Cent — le spese di ogni giorno',
  'nav.label': 'Schermate',
  'nav.home': 'Home',
  'nav.history': 'Storico',
  'nav.settings': 'Impostazioni',
  'title.home': 'Quanto ti resta',
  'title.history': 'Le tue spese',
  'title.settings': 'Impostazioni',
  'fab.add': 'Aggiungi una spesa',

  'alert.insecure':
    'Connessione non sicura (http): il service worker non viene registrato, quindi qui l’app non funziona offline e non è quella che girerà sul telefono.',
  'alert.failures.one': 'Una modifica non è arrivata sul dispositivo.',
  'alert.failures.other': '{count} modifiche non sono arrivate sul dispositivo.',
  'alert.failures.tail': 'Il backup contiene tutto quello che vedi qui: esportalo adesso.',
  'alert.exportNow': 'Esporta ora',

  /* --- toast ------------------------------------------------------------- */
  'toast.undo': 'Annulla',
  'toast.expenseUndone': 'Spesa annullata',
  'toast.deleted': 'Eliminata: {amount}',
  'toast.deleteFailed': 'Non sono riuscito a eliminarla. Riprova.',
  'toast.gone': 'Questa spesa non c’è più.',
  'toast.restoreFailed': 'Non sono riuscito a rimetterla. Riprova.',
  'toast.restored': 'Spesa ripristinata',
  'toast.budgetSaved': 'Budget: {amount} {cadence}',
  'toast.backupShared': 'Backup condiviso.',
  'toast.backupReady': 'Backup pronto: {filename}',
  'toast.backupWhere': 'Non lo trovi?',
  'toast.exportCancelled': 'Esportazione annullata: nessun backup salvato.',
  'toast.backupUnavailable': 'Non riesco a preparare il backup.',
  'toast.backupFileFailed': 'Il file non si è salvato.',
  'toast.showData': 'Mostra i dati',
  'toast.languageFailed': 'Non sono riuscito a cambiare lingua. Riprova.',
  'toast.guideFailed': 'Non sono riuscito a riaprire la guida. Riprova.',
  // Le categorie: cosa e' successo, con i nomi veri dentro. Archiviare si
  // annulla (la griglia ha appena liberato un posto, quindi rimetterla non fa
  // la nona); cancellare no, e il foglio lo dice prima.
  'toast.catAdded': '«{name}» è in griglia',
  'toast.catSwapped': '«{name}» al posto di «{old}»',
  'toast.catArchived': '«{name}» è in archivio',
  'toast.catBack': '«{name}» è tornata in griglia',
  'toast.catDeleted': '«{name}» eliminata',
  'toast.catSaved': '«{name}» aggiornata',
  'toast.catInUse': 'Qualche spesa la usa ancora: non si può cancellare.',
  'toast.catFailed': 'Non sono riuscito a cambiare le categorie. Riprova.',

  /* --- Home -------------------------------------------------------------- */
  'hero.spent': 'Spesi',
  'hero.remaining': 'Restano',
  'hero.noBudget': 'nessun budget impostato per questo periodo',
  'hero.note': 'di {budget} · {spent} spesi',

  'home.invite.before': 'Con un budget questa riga diventa ',
  'home.invite.strong': 'quanto puoi spendere oggi',
  'home.invite.after': ', invece di quanto hai già speso.',
  'home.budget.set': 'Imposta un budget',
  'home.budget.change': 'Cambia il budget',
  'home.blank.title': 'Oggi non hai segnato niente',
  'home.blank.text':
    'Tocca il + qui sotto, digita l’importo e scegli la categoria. Sono due tap: si fa in cassa, con una mano.',

  'allowance.closed.main': 'Questo periodo è chiuso.',
  'allowance.closed.sub': 'Il prossimo riparte da capo.',
  'allowance.late.weekly': 'Questa settimana era già iniziata.',
  'allowance.late.monthly': 'Questo mese era già iniziato.',
  'allowance.late.sub': 'Il budget vale pieno {from}.',
  'allowance.over.main': 'Il budget del periodo è finito.',
  'allowance.over.sub': 'Restano {days}: quello che spendi da qui è in più.',
  'allowance.last.main': 'Puoi spendere {amount} oggi',
  'allowance.last.sub': 'Ultimo giorno del periodo: domani riparte da capo.',
  'allowance.main': 'Puoi spendere ~{amount} al giorno',
  'allowance.sub': 'per i {days} che restano, oggi compreso',
  'startNote': 'Budget attivo {from} · prima avevi già speso {amount}',

  'pace.none': 'Nessuna spesa in questo periodo, per ora.',
  'pace.firstDay': 'È il primo giorno del periodo: la media di oggi non è ancora un passo.',
  'pace.soFar.before': 'Finora stai spendendo ',
  'pace.soFar.after': ' al giorno.',
  'pace.above': 'Sopra ritmo: ',
  'pace.below': 'Sotto ritmo: ',
  'pace.against': ' al giorno contro ',
  'pace.sustainable': ' sostenibili.',

  /* --- Storico ----------------------------------------------------------- */
  'history.blank.title': 'Nessuna spesa, per ora',
  'history.blank.text':
    'Tocca il + qui sotto, digita quanto hai speso e scegli la categoria. Sono due tap: si fa in cassa, con una mano.',

  /* --- riga di spesa e azioni -------------------------------------------- */
  'row.categoryRemoved': 'Categoria rimossa',
  'acts.label': 'Azioni sulla spesa',
  // Prima di "Elimina", e non e' un dettaglio d'ordine: su una spesa generata
  // da una regola, cancellare e riscrivere a mano **cambia `source`**, cioe' la
  // fa uscire dalle spese fisse ed entrare nel budget del periodo. La
  // correzione sul posto e' la mossa giusta, quindi si legge per prima.
  'acts.amount': 'Correggi l\u2019importo',
  'acts.delete': 'Elimina',
  'acts.close': 'Chiudi',

  /* --- foglio "correggi l'importo" --------------------------------------- */
  'amount.label': 'Correggi l\u2019importo',
  'amount.hint.now': 'Adesso \u00e8 {amount}. Digita quello giusto.',
  'amount.hint.check': 'Controlla e salva.',
  'amount.hint.failed': 'Non sono riuscito a salvare. Tocca di nuovo Salva.',
  // Il numero grande della Home non si muove, e questa riga lo dice **prima**
  // che si tocchi Salva. Una correzione che non cambia il budget e' una buona
  // notizia solo se si sa che era in dubbio (ADR 016 + CLAUDE.md, "l'esclusione
  // taciuta e' un numero che mente per omissione").
  'amount.fixed':
    'Resta una spesa fissa: correggerla non tocca il budget del periodo.',
  'amount.save': 'Salva {amount}',
  'toast.amountFixed': 'Importo corretto: {amount}',
  'toast.amountBack': 'Importo di nuovo {amount}',

  /* --- tastierino -------------------------------------------------------- */
  'keypad.erase': 'Cancella l’ultima cifra. Tieni premuto per azzerare',

  /* --- foglio "aggiungi spesa" ------------------------------------------- */
  'add.label': 'Nuova spesa',
  'add.hint.failed': 'Non sono riuscito a salvare. Tocca di nuovo la categoria.',
  'add.hint.max': 'Importo massimo raggiunto',
  'add.hint.empty': 'Quanto hai speso?',
  // Le due varianti contestuali dei primi giorni, mostrate finche' non si sono
  // salvate tre spese (vedi App.tsx). Sono due e non una perche' con l'importo
  // vuoto i chip sono spenti: dire "tocca una categoria" quando toccare non fa
  // niente invita a un gesto che fallisce, nel momento peggiore.
  'add.hint.type': 'Digita l\u2019importo, poi tocca una categoria',
  'add.hint.pick': 'Tocca una categoria per salvare',
  // Il nome accessibile del chip, non un'istruzione a schermo: "tocca due
  // volte" e' la formula con cui VoiceOver chiede l'attivazione. Chi esplora
  // con lo schermo letto scopre cosi' che quel tap salva **sul controllo che
  // sta per toccare**, invece che in un annuncio che arriva secondo.
  'add.cat.hint': 'tocca due volte per salvare',
  'add.date.other': 'Altra',
  'add.date.pick': 'Scegli un’altra data',
  'add.note': 'Nota',
  'add.note.placeholder': 'Per cosa?',
  'add.note.done': 'Fatto',

  /* --- foglio del budget -------------------------------------------------- */
  'budget.label': 'Budget',
  'budget.hint.failed': 'Non sono riuscito a salvare. Tocca di nuovo Salva.',
  'budget.hint.weekly': 'Quanto vuoi spendere in una settimana?',
  'budget.hint.monthly': 'Quanto vuoi spendere in un mese?',
  'budget.hint.check': 'Controlla il periodo, poi tocca Salva',
  'budget.periods': 'Periodo del budget',
  'budget.weekly': 'A settimana',
  'budget.monthly': 'Al mese',
  'budget.none': 'nessun budget',
  'budget.now': 'ora {amount}',
  'budget.save': 'Salva',
  'budget.saveAmount': 'Salva {amount} {cadence}',

  /* --- pannello del backup ------------------------------------------------ */
  'backup.label': 'Backup dei dati',
  'backup.close': 'Chiudi',
  'backup.lead':
    'Questo è tutto il tuo archivio. Copialo e incollalo dove vuoi tenerlo al sicuro.',
  'backup.copied':
    'Copiato. Incollalo dove vuoi tenerlo: Note, una mail a te stesso, un file.',
  'backup.manual':
    'Il testo è selezionato: usa Copia del sistema e incollalo dove vuoi tenerlo.',
  'backup.copy': 'Copia tutto',
  'backup.copiedShort': 'Copiato',
  'backup.shareTitle': 'Backup di Cent',

  /* --- avviso di aggiornamento -------------------------------------------- */
  'update.ready': 'Nuova versione disponibile',
  'update.hint': 'Tocca per aggiornare',
  'update.applying': 'Aggiornamento in corso',
  'update.dismiss': 'Non ora, resta su questa versione',

  /* --- archivio non aperto ------------------------------------------------ */
  'archive.title': 'Non riesco ad aprire l’archivio',
  'archive.insecure':
    'Cent è aperto su una connessione non sicura (http). Fuori da https il browser toglie una parte delle API che servono all’archivio locale: apri Cent da un indirizzo https, o da localhost, e i dati tornano.',
  'archive.unknown':
    'Può dipendere da una finestra privata, dallo spazio esaurito o da un profilo che blocca l’archiviazione: non so dire quale sia. Prova a riaprire Cent da una finestra normale. Finché l’archivio non si apre non si possono inserire spese — quello che scrivessi qui andrebbe perso.',

  /* --- pagina di installazione (ADR 011) ---------------------------------- */
  // E' la primissima cosa che vede chi riceve il link, e oggi l'unica schermata
  // che parla a chi non ha ancora l'app: e' stata tradotta per prima.
  'install.title': 'Aggiungi Cent alla schermata Home',
  'install.lead':
    'Cent segna le spese di ogni giorno in due tap e ti dice quanto ti resta. Funziona senza rete, senza account, e i dati restano sul telefono.',
  'install.why.title':
    'I dati vivono nell’app installata. Quello che scrivi qui non ci arriverebbe.',
  'install.why.text':
    'Il browser e l’app installata tengono due archivi separati: una spesa segnata qui non comparirebbe nell’app, e dopo qualche giorno il browser la cancellerebbe da solo. Per questo qui non c’è niente da toccare: non è una parte mancante, è l’unica versione che non ti fa perdere quello che scrivi.',
  'install.how.title': 'Come si installa, in tre passi',
  'install.step1.before': 'Tocca ',
  'install.step1.strong': 'Condividi',
  'install.step1.after':
    ' nella barra del browser: il quadrato con la freccia rivolta verso l’alto.',
  'install.step2.before': 'Scorri l’elenco e scegli ',
  'install.step2.strong': 'Aggiungi a Home',
  'install.step2.after': '.',
  'install.step3.before': 'Conferma con ',
  'install.step3.strong': 'Aggiungi',
  'install.step3.after': '. Cent compare fra le app: aprila da lì ed è pronta.',
  'install.other.before': 'Su Android, Chrome o Edge il comando è nel menu del browser: ',
  'install.other.strong': 'Installa app',
  'install.other.after': '. Il motivo è lo stesso.',

  /* --- Impostazioni -------------------------------------------------------- */
  'settings.open': 'Impostazioni',
  'settings.language.title': 'Lingua',
  'settings.language.group': 'Lingua dell’app',
  // "Automatica" non e' una terza lingua: e' lo stato "nessuno l'ha scelta"
  // reso visibile. Vedi il commento in Settings.tsx.
  'settings.language.auto': 'Automatica',
  'settings.language.autoNote': 'Segue la lingua del telefono: adesso {lang}.',
  'settings.language.it': 'Italiano',
  'settings.language.en': 'English',
  'settings.budget.title': 'Budget',
  'settings.budget.none': 'Nessun budget impostato.',
  'settings.budget.current': 'Adesso: {amount} {cadence}.',
  'settings.budget.edit': 'Cambia il budget',
  'settings.budget.set': 'Imposta un budget',
  'settings.data.title': 'I tuoi dati',
  'settings.data.text':
    'Le spese restano su questo telefono: non c’è nessun account e nessun server. L’export è l’unica copia che sopravvive a un telefono perso o a un’app disinstallata.',
  'settings.data.export': 'Esporta tutto',
  // Due righe di stato, non una decorazione: sono la stessa informazione che
  // accende il promemoria, detta dove si esporta.
  'settings.data.last': 'Ultimo backup: {days} fa.',
  'settings.data.never': 'Non hai ancora esportato niente.',
  // "Rivedi la guida" e' l'unica via di ritorno per chi ha toccato "Salta": la
  // guida e' agganciata a uno stato, quindi rivederla vuol dire **cancellare
  // quello stato**, non riaprire un foglio.
  'settings.guide.title': 'Guida',
  'settings.guide.text':
    'Le due cose che in Cent non si indovinano: come si digita l’importo e cosa salva la spesa.',
  'settings.guide.again': 'Rivedi la guida',

  /* --- Impostazioni: categorie -------------------------------------------- */
  'settings.cats.title': 'Categorie',
  'settings.cats.text':
    'Otto in griglia, e otto è il massimo: sono i chip che tocchi quando paghi, e devono starci tutti senza scorrere. Archiviarne una la toglie dalla griglia, non dalle spese che l’hanno usata.',
  'settings.cats.grid': 'Categorie in griglia',
  'settings.cats.editOne': 'Modifica {name}',
  'settings.cats.add': 'Aggiungi una categoria',
  'settings.cats.archivedTitle': 'In archivio',
  'settings.cats.archivedText':
    'Fuori dalla griglia, non fuori dai dati: Storico e statistiche continuano a mostrarle. Tocca una categoria per rimetterla in griglia al posto di un’altra.',
  'settings.cats.placeOne': 'Rimetti {name} in griglia',

  /* --- i nomi delle otto categorie di default ------------------------------ *
   *
   * Si leggono una volta sola, al primo avvio, e finiscono nel database (vedi
   * la testata di questo file). L'ordine e' quello della griglia 4x2 e lo
   * decide `DEFAULT_CATEGORY_SEEDS` in `src/core/defaults.ts`: qui ci sono solo
   * le parole.
   *
   * Vincolo che non si vede leggendo: devono stare in `.cat__name` **senza
   * puntini** su un chip largo ~60px a 320 punti, dove il corpo scende a 11px.
   * "Coffeeshop" e' la piu' lunga delle due lingue ed e' il metro. */
  'cat.default.groceries': 'Spesa',
  'cat.default.eatingOut': 'Fuori',
  'cat.default.coffeeshop': 'Coffeeshop',
  'cat.default.cigarettes': 'Sigarette',
  'cat.default.transport': 'Trasporti',
  'cat.default.leisure': 'Svago',
  'cat.default.home': 'Casa',
  'cat.default.extra': 'Extra',

  /* --- foglio della categoria --------------------------------------------- */
  'cat.new.label': 'Nuova categoria',
  'cat.edit.label': 'Modifica categoria',
  'cat.place.label': 'Rimetti in griglia',
  'cat.name': 'Nome',
  'cat.name.placeholder': 'Come si chiama?',
  // Le tre righe del foglio stanno su **una riga sola** anche a 320 punti:
  // `.sheet__hint` ha l'altezza riservata di una riga e taglia con i puntini,
  // e una frase tagliata a meta' e' peggio di una frase corta.
  'cat.hint.name': 'Un nome, e scegli emoji e colore.',
  'cat.hint.replace': 'Tocca la categoria che sostituisce.',
  'cat.hint.failed': 'Non sono riuscito a salvare. Riprova.',
  'cat.emoji': 'Emoji',
  'cat.color': 'Colore',
  'cat.color.note':
    'Otto colori e non uno qualunque: è la stessa scala dei grafici, scelta perché resti distinguibile anche a chi confonde rosso e verde.',
  'cat.swap.title': 'Quale sostituisce?',
  'cat.swap.text':
    'Il tap salva. Quella che tocchi va in archivio: resta su tutte le spese che l’hanno usata, e la puoi rimettere quando vuoi.',
  'cat.add.free': 'Aggiungi alla griglia',
  'cat.place.free': 'Rimetti in griglia',
  'cat.save': 'Salva',
  'cat.archive': 'Archivia',
  'cat.archive.note':
    'La toglie dalla griglia e basta: resta su ogni spesa che l’ha usata, e continui a vederla nello Storico.',
  'cat.delete': 'Elimina del tutto',
  // La riga elencava due tipi di record su quattro, e taceva le lapidi. Non
  // e' un dettaglio: e' la meta' che spiega il messaggio dell'esito accanto,
  // dove a bloccare sono solo spese cancellate. Dirlo qui una volta rende
  // leggibile li' un rifiuto che altrimenti sembra arbitrario.
  'cat.delete.note':
    'Non la usa niente di quello che vedi: nessuna spesa, nessuna spesa fissa, nessun budget. È l’unica cosa in Cent che non si annulla.',
  // ADR 019 di nuovo, e la sua ragione non nominava le categorie: vale ovunque
  // un foglio di modifica offra un insieme da cui il valore attuale puo' essere
  // fuori. Qui succede a un dato arrivato da un backup scritto a mano — la
  // tavolozza e l'elenco delle emoji non cambiano da soli — e senza l'unione il
  // foglio mostrerebbe **niente di selezionato**, cioe' inviterebbe a toccare
  // una pastiglia e a cambiare un colore che nessuno voleva cambiare.
  'pick.current': 'Attuale',
  'cat.emoji.current':
    'L\u2019emoji marcata \u00e8 quella che questa categoria ha adesso: non \u00e8 fra quelle in elenco.',
  'cat.color.current':
    'Il colore marcato \u00e8 quello che questa categoria ha adesso: non \u00e8 in tavolozza.',
  'cat.inUse.expenses.one': '1 spesa',
  'cat.inUse.expenses.other': '{count} spese',
  'cat.inUse.rules.one': '1 spesa ricorrente',
  'cat.inUse.rules.other': '{count} spese ricorrenti',
  // "budget" resta invariato al plurale in italiano: e' una parola presa
  // dall'inglese, e "budgets" suonerebbe come un refuso.
  'cat.inUse.budgets.one': '1 budget',
  'cat.inUse.budgets.other': '{count} budget',
  'cat.inUse.both': '{a} e {b}',
  // Tre numeri sono il caso completo, non un'ipotesi: un budget di categoria
  // arriva da un import, e chi importa ha gia' spese e ricorrenze.
  'cat.inUse.three': '{a}, {b} e {c}',
  // **Il rifiuto e' giusto, la ragione scritta qui non lo era.** Diceva che
  // cancellarla lascerebbe quelle righe *"senza nome"*: e' falso, direbbero
  // "Categoria rimossa" — il ripiego esiste in tutti e quattro i lettori. La
  // frase adesso cita **quelle due parole**, cioe' esattamente quello che si
  // leggerebbe sullo schermo, e dice la cosa che davvero non si puo' disfare:
  // non esiste nessun foglio che rimetta una categoria a una spesa.
  'cat.inUse.text':
    'La usa {what}. Cancellarla trasformerebbe quelle righe in “{removed}” per sempre, e non c’è modo di ridargli una categoria. Archiviala: esce dalla griglia e lo Storico resta intero.',
  'cat.preview': 'Come sarà la griglia',
  'cat.position': 'Posizione {index} di {total}',
  'cat.move.back': 'Sposta indietro',
  'cat.move.on': 'Sposta avanti',
  // Due cose in una riga: l'avviso (la memoria muscolare) e il fatto che lo
  // spostamento non aspetta "Salva" — il bottone li' sotto e' per nome, emoji e
  // colore, e senza dirlo resterebbe da indovinare quale delle due valga.
  'cat.order.note':
    'Dopo qualche giorno tocchi per posizione, senza leggere il nome: spostare una categoria costa più di quanto sembri. Lo spostamento vale subito.',
  'color.green': 'Verde',
  'color.orange': 'Arancio',
  'color.teal': 'Turchese',
  'color.brown': 'Marrone',
  'color.blue': 'Blu',
  'color.magenta': 'Magenta',
  'color.lilac': 'Lilla',
  'color.grey': 'Grigio',

  /* --- la guida al primo avvio --------------------------------------------- */
  // Due schede, non tre: la terza — "i dati restano su questo telefono" —
  // e' stata tagliata. Restano le due convenzioni che nessuna altra app ha, e
  // che quindi nessuno indovina.
  //
  // Le stringhe inglesi sono l'originale (vedi en.ts): qui c'e' la traduzione.
  'guide.label': 'Come si usa Cent',
  'guide.step': 'Passo {index} di 2',
  'guide.skip': 'Salta',
  'guide.next': 'Avanti',
  'guide.start': 'Inizia',
  // Titolo: il fatto. Sottotitolo: la **regola operativa**, che e' la cosa che
  // serve davvero al primo importo tondo — due zeri, o si segna un centesimo.
  'guide.amount.title': 'L’importo si riempie da destra',
  'guide.amount.text': 'Per 23 € digita 2 3 0 0.',
  // "salva la spesa", non "salva la categoria": in Impostazioni le categorie si
  // salvano davvero, quindi la lettura sbagliata e' disponibile e va chiusa
  // nominando l'oggetto.
  'guide.save.title': 'Toccare una categoria salva la spesa',
  'guide.save.text':
    'È quella la conferma: non c’è un tasto Salva. Categoria sbagliata? Annulla, subito dopo.',

  /* --- promemoria di backup ------------------------------------------------ */
  // Corte perche' la banda deve restare **discreta**: due righe di testo e un
  // bottone, non un cartello. La frase lunga la dice Impostazioni, dove c'e'
  // spazio e dove si arriva di propria volonta'.
  'nudge.never': 'Non hai mai esportato',
  'nudge.since': 'Ultimo backup: {days} fa',
  // L'orologio e' andato indietro, o la data dell'ultimo backup non si legge.
  // Non si tace e non si inventa un numero: si dice che il conto non torna.
  'nudge.unknown': 'Non riesco a dire da quanto non fai una copia',
  'nudge.hint': 'I dati stanno solo qui.',
  'nudge.action': 'Esporta',

  /* --- spese fisse: le regole ricorrenti ---------------------------------- *
   *
   * "Spesa fissa" e non "ricorrenza": e' il nome che l'utente usa parlando
   * (l'affitto, l'abbonamento), ed e' anche il nome della **decisione** che ADR
   * 016 usa per tenerle fuori dal budget. Chiamarle "ricorrenti" avrebbe
   * descritto il meccanismo — che le ripete — invece del fatto che conta: che
   * non sono una scelta di oggi.
   */

  /* la riga che dichiara l'esclusione, accanto al numero grande (ADR 016 §2) */
  'hero.fixed': 'oltre a {amount} di spese fisse',

  /* la sezione in Impostazioni: il secondo dei due numeri (ADR 016 §3) */
  'fixed.title': 'Spese fisse',
  'fixed.total': 'In tutto {amount} al mese.',
  'fixed.none': 'Non hai spese fisse.',
  'fixed.text':
    'Affitto, abbonamenti, palestra: quello che esce da solo. L’app le segna al posto tuo e le tiene fuori dal budget, perché non sono una decisione.',
  // Compare solo se almeno una regola non e' mensile: una mensile da 900 vale
  // esattamente 900 al mese, e avvertire di un'approssimazione che non c'e'
  // insegnerebbe a non leggere l'avviso quando invece serve.
  'fixed.rate': 'È una media sull’anno: un mese con più scadenze ne vedrà uscire di più.',
  'fixed.add': 'Aggiungi una spesa fissa',
  'fixed.list': 'Le tue spese fisse',
  // Una regola che comincia piu' avanti c'e' ma non pesa ancora: si vede, e si
  // vede anche perche' non e' nel totale.
  'fixed.later': 'parte: {day}',
  // Una regola spenta resta nell'elenco e si legge per intero: e' l'unico dei
  // due motivi che si cambia con un tap, quindi e' anche l'unico che deve
  // portare a qualcosa. ("finita" non c'e' piu': una regola non finisce, e la
  // chiave e' uscita insieme a `endDate` invece di restare senza lettore.)
  'fixed.off': 'spenta',
  // **Il giorno di pagamento nell'elenco.** Senza, una mensile riavvolta al 1
  // febbraio si legge "ogni mese" mentre esce il 25, e il 25 non compare da
  // nessuna parte: un numero che governa i soldi e che nessuna schermata cita.
  'fixed.anchor': '{every}, il giorno {day}',

  /* ogni quanto scatta */
  'cad.daily.one': 'ogni giorno',
  'cad.daily.other': 'ogni {count} giorni',
  'cad.weekly.one': 'ogni settimana',
  'cad.weekly.other': 'ogni {count} settimane',
  'cad.monthly.one': 'ogni mese',
  'cad.monthly.other': 'ogni {count} mesi',

  /* --- il foglio che crea una regola -------------------------------------- *
   *
   * Qui **non** vale il chip-come-conferma di ADR 004: una regola si crea una
   * volta e vale per mesi, quindi si sceglie e poi si salva, come il budget.
   */
  'rule.label': 'Nuova spesa fissa',
  'rule.label.edit': 'Spesa fissa',
  'rule.hint.empty': 'Quanto esce ogni volta?',
  'rule.hint.category': 'Scegli una categoria',
  'rule.hint.check': 'Controlla ogni quanto e da quando, poi tocca Crea',
  'rule.hint.edit': 'Cambia quello che serve, poi tocca Salva',
  // Riaccendere e' il terzo innesco della generazione retroattiva (ADR 017), e
  // il piu' silenzioso: chi lo fa si aspetta "da adesso" e puo' trovarsi mesi
  // di arretrati. La riga in cima lo dice **prima** che il piede lo conti.
  'rule.hint.on': 'Guarda cosa succede quando la riaccendi',
  'rule.hint.failed': 'Non sono riuscito a creare la regola. Tocca di nuovo Crea.',
  'rule.hint.max': 'Importo massimo raggiunto',
  'rule.cadence': 'Ogni quanto',
  'rule.cadence.monthly': 'Al mese',
  'rule.cadence.weekly': 'A settimana',
  'rule.cadence.daily': 'Al giorno',
  'rule.cats': 'Categoria',
  'rule.start': 'Da quando',
  'rule.start.today': 'Oggi',
  'rule.start.pick': 'Scegli il giorno da cui parte',
  'rule.start.other': 'Un’altra data',
  // Il giorno del mese in cui la regola scatta, nel foglio. Si legge come un
  // fatto e si cambia toccandolo: e' l'unico modo perche' l'ancora congelata di
  // ADR 020 sia un default e non una trappola.
  'rule.anchor.day': 'Ogni mese, il giorno {day}',
  'rule.anchor.pick': 'Cambia il giorno del mese in cui esce',

  /* --- l'anteprima, prima di scrivere ------------------------------------- *
   *
   * Le date passate sono legittime — e' cosi' che si registra un affitto che
   * esiste da mesi — quindi non si vietano: si dichiara cosa succede. La
   * conferma compare **solo** quando c'e' dell'arretrato: una conferma che
   * compare sempre smette di essere letta.
   */
  // ## Perche' l'intervallo non ha preposizioni
  //
  // "dal 1 gennaio al 1 agosto" e' giusto, "dal 8 agosto" no: in italiano si
  // elide davanti a otto e undici ("dall'8", "dall'11"). Sono due giorni su
  // trentuno, cioe' un errore di grammatica che compare **a volte** — la classe
  // peggiore, perche' passa ogni rilettura fatta in un giorno qualsiasi.
  //
  // La stessa cosa la fa gia' `periodRangeLabel`: l'intervallo lo scrive
  // `formatRange`, che fonde le parti uguali (`1 – 8 agosto`) e le riapre a
  // cavallo di due mesi. Come si scrive un intervallo lo sa il locale, e
  // nessuna delle due lingue ha bisogno di una preposizione per dirlo.
  'rule.preview.today': 'Prima spesa: oggi.',
  'rule.preview.later': 'Prima spesa: {day}.',
  'rule.preview.back.one': 'Questa regola creerà 1 spesa arretrata: {from}, {total}.',
  'rule.preview.back.other':
    'Questa regola creerà {count} spese arretrate: {range}, {total} in totale.',
  'rule.confirm.one': 'Crea anche la spesa arretrata',
  'rule.confirm.other': 'Crea anche le {count} spese arretrate',
  'rule.save': 'Crea la spesa fissa',
  // Due chiavi e non una con un `{count}` dentro: "Crea 1 spese" e' un refuso, e
  // il caso a una sola arretrata esiste (mensile dal primo del mese corrente).
  // Il testo e la casella lo distinguevano gia'; il bottone no, ed e' l'unica
  // delle tre che si legge sempre.
  'rule.save.back.one': 'Crea 1 spesa · {total}',
  'rule.save.back.other': 'Crea {count} spese · {total}',
  'rule.save.edit': 'Salva',
  'rule.save.on': 'Riattiva',
  // Una regola gia' in pari: `count: 0` qui non vuol dire "parte piu' avanti",
  // vuol dire "non c'e' niente da recuperare". Dire "Prima spesa: 1 gennaio"
  // sarebbe falso — quella spesa e' nello Storico da mesi.
  // Copriva anche il caso della regola finita, che dalla fase 5 non esiste:
  // senza `endDate` una regola non finisce, quindi `rule.preview.done` e' uscita
  // dal dizionario invece di restare viva nel codice e morta nei fatti. Torna
  // con la scadenza, in fase 7.
  'rule.preview.settled': 'Non c’è niente da recuperare.',

  /* --- quando la scrittura dice di no ------------------------------------- *
   *
   * Nessuno dei tre e' un errore dell'utente: sono numeri cambiati sotto la
   * schermata. Quindi ognuno dice **cosa e' cambiato** e che i numeri **sono
   * gia' rifatti** — un rifiuto che annuncia solo il no lascerebbe davanti a un
   * bottone spento senza una mossa da fare.
   */
  // La mezzanotte. "Ieri" si scrive solo sapendo anche qual e' oggi: il rifiuto
  // porta tutti e due i giorni, e {day} e' il primo letto rispetto al secondo.
  'rule.refused.stale':
    'I numeri erano di {day}: dopo la mezzanotte non sono più quelli. Li ho rifatti qui sotto — ricontrolla e conferma.',
  'rule.refused.moved':
    'Nel frattempo questa spesa fissa ne ha già create alcune. I numeri qui sotto sono rifatti: ricontrolla e conferma.',
  'rule.refused.gone': 'Questa spesa fissa non c’è più. Chiudi, e guarda l’elenco.',

  /* --- spegnere, cancellare ----------------------------------------------- *
   *
   * "Disattiva" non ha una conferma davanti di proposito: e' l'uscita che il
   * rifiuto della cancellazione suggerisce, e mettere un ostacolo davanti
   * all'uscita di sicurezza la renderebbe scomoda proprio quando serve.
   */
  // ADR 019: l'insieme offerto e' { validi } unito { attuale }, e l'attuale e'
  // **marcato**. La categoria di una regola puo' uscire dalla griglia — basta
  // archiviarla — e senza queste due stringhe il foglio direbbe "categoria non
  // scelta" dove l'elenco dice "Casa".
  //
  // Il nome dentro la frase e' verificabile: una categoria che una regola usa
  // non si puo' cancellare, quindi sta sempre in Impostazioni, sotto le
  // archiviate. Nessun messaggio cita qualcosa che l'utente non puo' vedere.
  'rule.cats.current':
    '{name} \u00e8 in archivio, quindi non \u00e8 pi\u00f9 in griglia. Resta la categoria di questa spesa fissa finch\u00e9 non ne tocchi un\u2019altra.',

  /* --- spostare indietro la data d'inizio (ADR 018) ------------------------ *
   *
   * In modifica la data d'inizio **si legge**: spostarla in avanti orfanerebbe
   * le occorrenze gia' generate, e spostarla indietro a mano non generava
   * niente \u2014 la bozza conservava il segnaposto, quindi la finestra restava
   * chiusa e il gesto era un no-op silenzioso. L'unica azione e' questa, e
   * passa da `rewindRecurringRule`.
   */
  // Nessuna preposizione davanti a una data, in nessuna di queste stringhe: in
  // italiano si elide davanti a otto e undici ("dall\u20198", "dall\u201911"), cioe' due
  // giorni su trentuno \u2014 un errore di grammatica che compare **a volte**, la
  // classe peggiore, perche' passa ogni rilettura fatta in un giorno qualsiasi.
  // E' la stessa ragione per cui `dayRangeLabel` scrive un intervallo senza
  // preposizioni.
  'rewind.now': 'Data d\u2019inizio: {day}',
  'rewind.action': 'Sposta indietro la data d\u2019inizio',
  'rewind.hint': 'Scegli il giorno da cui \u00e8 partita davvero. Solo indietro.',
  'rewind.pick': 'Scegli un giorno d\u2019inizio precedente',
  'rewind.pick.none': 'Scegli il giorno',
  // Le due promesse di ADR 018 dette all'utente, prima del tap e non dopo: sono
  // proprio cio' che rende sicuro riaprire la finestra, e chi sta per creare
  // decine di spese in un colpo ha il diritto di sapere che non gli si
  // riscrivono le correzioni fatte a mano.
  'rewind.note':
    'Si sposta solo la data d\u2019inizio: l\u2019importo e ogni quanto restano quelli. E quello che c\u2019\u00e8 gi\u00e0 resta com\u2019\u00e8 \u2014 una spesa che hai corretto tiene il tuo importo, e una che hai cancellato resta cancellata.',
  'rewind.preview.none': 'Niente da creare nel passato. La data d\u2019inizio diventa {day}.',
  // `count > 0` senza arretrato esiste, ed e' un caso solo: una regola che parte
  // domani riportata a oggi. Chiamarla "arretrata" sarebbe falso di un giorno.
  'rewind.preview.today': 'Crea la spesa di oggi: {total}.',
  'rewind.confirm.today': 'Crea anche la spesa di oggi',
  'rewind.notEarlier': '{day} non viene prima di {current}: la data d\u2019inizio si sposta solo indietro.',
  'rewind.save.none': 'Sposta la data d\u2019inizio',
  'rewind.back': 'Indietro',
  // I due rifiuti che non hanno gia' delle parole. `unknown` riusa
  // `rule.refused.gone` e la mezzanotte riusa `rule.refused.stale`: sono lo
  // stesso fatto raccontato dalla stessa frase, e due copie diverse dello stesso
  // no si allontanerebbero al primo ritocco.
  'rewind.refused.notEarlier':
    'La data d\u2019inizio \u00e8 gi\u00e0 {current}, e {day} non viene prima. Scegline un\u2019altra.',
  'rewind.refused.invalid':
    'C\u2019\u00e8 qualcosa che non torna in questa spesa fissa, quindi non la sposto. Chiudi, e controllala nell\u2019elenco.',
  'rewind.refused.changed':
    'Nel frattempo questa spesa fissa \u00e8 cambiata. I numeri qui sotto sono rifatti: ricontrolla e conferma.',

  'rule.deactivate': 'Disattiva',
  'rule.delete': 'Cancella la spesa fissa',
  'rule.delete.note': 'Si può solo finché non ha nessuna spesa nello Storico.',
  // Il rifiuto arriva **prima** del bottone, con il numero vero dentro, e dice
  // anche cosa fare invece: e' `planRecurringRuleDeletion` chiamato prima di
  // disegnare, come per le categorie.
  // Il numero conta le spese **vive**: le lapidi no. E' la stessa regola del
  // core (`planRecurringRuleDeletion`), e la ragione sta nella frase: "nello
  // Storico" e' un posto dove si puo' andare a contarle. Con le cancellate
  // dentro, una regola le cui uniche istanze sono state eliminate rifiutava per
  // sempre citando spese che nello Storico non si vedono.
  'rule.inUse.one':
    'Nello Storico c’è 1 spesa creata da questa spesa fissa, quindi non si cancella: quella spesa resta. Disattivala e non ne creerà altre.',
  'rule.inUse.other':
    'Nello Storico ci sono {count} spese create da questa spesa fissa, quindi non si cancella: restano. Disattivala e non ne creerà altre.',

  'toast.ruleSaved': 'Spesa fissa creata: {name}',
  // Due chiavi e non una con `{count}` dentro, per la stessa ragione di
  // `rule.save.back.one`: il caso a una sola spesa esiste (mensile dal primo del
  // mese corrente, creata a meta' mese) e diceva **"1 spese create"**. Il
  // singolare qui non dice "arretrata" perche' il conteggio comprende anche
  // l'occorrenza di **oggi**, che arretrata non e'.
  'toast.ruleSavedBack.one': '{name}: 1 spesa creata',
  'toast.ruleSavedBack.other': '{name}: {count} spese create',
  'toast.ruleUpdated': 'Spesa fissa aggiornata: {name}',
  'toast.ruleOff': '{name}: non creerà altre spese',
  'toast.ruleOn': '{name}: torna a creare spese',
  // Stesso refuso, stessa correzione: l'argomento sopra non nomina una chiave,
  // quindi vale ovunque un conteggio finisca dentro una frase. Riaccendere una
  // regola dormiente il cui segnaposto e' fermo a un mese fa genera **una**
  // spesa, ed e' il ramo piu' comune dei due.
  'toast.ruleOnBack.one': '{name}: riattivata, 1 spesa creata',
  'toast.ruleOnBack.other': '{name}: riattivata, {count} spese create',
  // Tre esiti e non uno: la data spostata senza generare niente non e' "0 spese
  // create", e' un'altra cosa; e il singolare non dice "arretrata" perche' il
  // caso a uno comprende anche la spesa di **oggi**.
  'toast.ruleBack.none': '{name}: la data d’inizio adesso è {day}',
  'toast.ruleBack.one': '{name}: 1 spesa creata',
  'toast.ruleBack.other': '{name}: {count} spese arretrate create',
  'toast.ruleDeleted': 'Spesa fissa cancellata: {name}',
  'toast.ruleInUse': 'Ha già creato delle spese: si può solo disattivare',
  'toast.ruleFailed': 'Non ci sono riuscito. Riprova.',

  /* --- una spesa che viene da una regola ---------------------------------- */
  // Discreto, non un avviso: e' un'informazione su **da dove arriva** quella
  // riga, e le spese generate restano modificabili e cancellabili come tutte.
  'row.fixed': 'spesa fissa',
} as const
