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
 * ## Cosa NON sta qui
 *
 * I **nomi delle categorie**. Sono dati dell'utente, non interfaccia: vivono in
 * `defaults.ts`, finiscono nel database al primo avvio e dal passo 3 di questa
 * fase si modificano. Tradurli significherebbe che cambiare lingua rinomina le
 * categorie di chi le ha gia' rinominate — cioe' riscrivere dati per una scelta
 * di visualizzazione.
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
  'history.blank.install':
    'Aggiungi Cent alla schermata Home: si apre a schermo intero e parte anche senza rete.',

  /* --- riga di spesa e azioni -------------------------------------------- */
  'row.categoryRemoved': 'Categoria rimossa',
  'acts.label': 'Azioni sulla spesa',
  'acts.delete': 'Elimina',
  'acts.close': 'Chiudi',

  /* --- tastierino -------------------------------------------------------- */
  'keypad.erase': 'Cancella l’ultima cifra. Tieni premuto per azzerare',

  /* --- foglio "aggiungi spesa" ------------------------------------------- */
  'add.label': 'Nuova spesa',
  'add.hint.failed': 'Non sono riuscito a salvare. Tocca di nuovo la categoria.',
  'add.hint.max': 'Importo massimo raggiunto',
  'add.hint.empty': 'Quanto hai speso?',
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
  'cat.delete.note': 'Non la usa nessuna spesa e nessuna ricorrenza. Questa non si annulla.',
  'cat.inUse.expenses.one': '1 spesa',
  'cat.inUse.expenses.other': '{count} spese',
  'cat.inUse.rules.one': '1 spesa ricorrente',
  'cat.inUse.rules.other': '{count} spese ricorrenti',
  'cat.inUse.both': '{a} e {b}',
  'cat.inUse.text':
    'La usa {what}: cancellarla lascerebbe quelle righe senza nome, quindi non si può. Archiviarla fa quello che ti serve — sparisce dalla griglia e lo Storico resta intero.',
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

  /* --- promemoria di backup ------------------------------------------------ */
  // Corte perche' la banda deve restare **discreta**: due righe di testo e un
  // bottone, non un cartello. La frase lunga la dice Impostazioni, dove c'e'
  // spazio e dove si arriva di propria volonta'.
  'nudge.never': 'Non hai mai esportato',
  'nudge.since': 'Ultimo backup: {days} fa',
  'nudge.hint': 'I dati stanno solo qui.',
  'nudge.action': 'Esporta',
} as const
