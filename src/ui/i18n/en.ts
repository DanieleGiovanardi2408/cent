import type { it } from './it'

/**
 * Il dizionario inglese.
 *
 * ## La parita' delle chiavi la garantisce il compilatore, non un test
 *
 * L'annotazione `Record<keyof typeof it, string>` fa due cose, e servono
 * entrambe:
 *
 * - una chiave **mancante** e' un errore di compilazione. Senza, l'inglese
 *   avrebbe un buco e `t()` dovrebbe scegliere fra restituire la chiave grezza
 *   o ricadere sull'italiano — cioe' una frase italiana in mezzo all'inglese,
 *   che nessuno segnala perche' sembra una svista di traduzione e non un bug;
 * - una chiave **di troppo** e' un errore di compilazione (controllo delle
 *   proprieta' in eccesso su un letterale annotato). Senza, le chiavi ritirate
 *   resterebbero qui per anni.
 *
 * Un test di parita' avrebbe detto la stessa cosa **dopo** un `vitest run`, e
 * solo per le chiavi: non avrebbe potuto dire niente sui punti d'uso. Il
 * compilatore lo dice mentre si scrive, e lo dice anche a chi usa `t()` con una
 * chiave che non esiste.
 *
 * ## Registro
 *
 * L'inglese e' la lingua condivisa di un gruppo Erasmus, non la lingua madre di
 * chi legge. Frasi corte, verbi semplici, nessun idioma. Vale la stessa regola
 * di tono dell'italiano: **sforare non e' un errore** — niente punti
 * esclamativi, niente "warning", niente seconda persona accusatoria.
 */
export const en: Record<keyof typeof it, string> = {
  /* --- giorni e periodi ------------------------------------------------- */
  'day.today': 'Today',
  'day.yesterday': 'Yesterday',
  'period.weekly': 'This week',
  'period.monthly': 'This month',
  // In inglese le due forme coincidono ("since Wednesday", "since 19 August").
  // Le chiavi restano due perche' la forma la detta la lingua che distingue:
  // fonderle qui vorrebbe dire riaprirle alla prossima lingua che le separa.
  'fromDay.weekly': 'since {day}',
  'fromDay.monthly': 'since {day}',
  'days.one': '1 day',
  'days.other': '{count} days',
  'cadence.weekly': 'a week',
  'cadence.monthly': 'a month',

  /* --- guscio ------------------------------------------------------------ */
  'doc.title': 'Cent — everyday spending',
  'nav.label': 'Screens',
  'nav.home': 'Home',
  'nav.history': 'History',
  'title.home': 'What you have left',
  'title.history': 'Your spending',
  'title.settings': 'Settings',
  'fab.add': 'Add an expense',

  'alert.insecure':
    'Insecure connection (http): the service worker is not registered, so here the app does not work offline and is not the one that will run on your phone.',
  'alert.failures.one': 'One change did not reach this device.',
  'alert.failures.other': '{count} changes did not reach this device.',
  'alert.failures.tail': 'The backup holds everything you see here: export it now.',
  'alert.exportNow': 'Export now',

  /* --- toast ------------------------------------------------------------- */
  'toast.undo': 'Undo',
  'toast.expenseUndone': 'Expense undone',
  'toast.deleted': 'Deleted: {amount}',
  'toast.deleteFailed': 'I could not delete it. Try again.',
  'toast.gone': 'This expense is gone.',
  'toast.restoreFailed': 'I could not put it back. Try again.',
  'toast.restored': 'Expense restored',
  'toast.budgetSaved': 'Budget: {amount} {cadence}',
  'toast.backupShared': 'Backup shared.',
  'toast.backupReady': 'Backup ready: {filename}',
  'toast.backupWhere': 'Can’t find it?',
  'toast.exportCancelled': 'Export cancelled: no backup saved.',
  'toast.backupUnavailable': 'I can’t prepare the backup.',
  'toast.backupFileFailed': 'The file was not saved.',
  'toast.showData': 'Show the data',
  'toast.languageFailed': 'I could not change the language. Try again.',
  'toast.guideFailed': 'I could not reopen the guide. Try again.',
  'toast.catAdded': '“{name}” is on the grid',
  'toast.catSwapped': '“{name}” in place of “{old}”',
  'toast.catArchived': '“{name}” is archived',
  'toast.catBack': '“{name}” is back on the grid',
  'toast.catDeleted': '“{name}” deleted',
  'toast.catSaved': '“{name}” updated',
  'toast.catInUse': 'Used by {what}: it cannot be deleted.',
  'toast.catFailed': 'I could not change the categories. Try again.',

  /* --- Home -------------------------------------------------------------- */
  'hero.spent': 'Spent',
  'hero.remaining': 'Left',
  // Vedi it.ts per l'argomento. `Left −£88.00` e' una contraddizione: il numero
  // tiene il segno perche' deve restare monotono, quindi e' l'etichetta a
  // nominare lo stato.
  'hero.over': 'Over budget',
  'hero.noBudget': 'no budget set for this period',
  'hero.note': 'of {budget} · {spent} spent',

  // Due righe, e la ragione sta in it.ts: **e' l'inglese a decidere la riserva**
  // del riquadro, quindi e' questa frase che va misurata prima di allungarla.
  // A 390 e 375 punti la versione con la coda `, instead of how much you have
  // already spent.` ne prendeva tre.
  'home.invite.before': 'With a budget this line becomes ',
  'home.invite.strong': 'how much you can spend today.',
  'home.budget.set': 'Set a budget',
  'home.budget.change': 'Change the budget',
  'home.blank.title': 'Nothing written down today',
  'home.blank.text':
    'Tap the + below, type the amount and pick the category. Two taps: it works at the till, with one hand.',

  // La striscia dei sette giorni. La legenda porta la cifra perche' il passo
  // sostenibile non e' il numero della riga sopra: vedi it.ts.
  'home.week.title': 'Day by day',
  'home.week.sustainable': '{amount} a day is sustainable',
  'home.week.aria':
    'Seven columns, Monday to Sunday: what went out each day. The highest is {day}, {amount}.',

  // Una riga sola dove ce n'erano due: il `sub` riformulava il `main` invece di
  // aggiungere un fatto. Vedi it.ts.
  'allowance.closed': 'This period is over: the next one starts from scratch.',
  'allowance.late.weekly': 'This week had already started: the budget counts in full {from}.',
  'allowance.late.monthly': 'This month had already started: the budget counts in full {from}.',
  'allowance.last': 'You can spend {amount} today, the last day of the period',
  'allowance.main': 'You can spend ~{amount} a day for {days}',
  // Sforato **il primo giorno**: non c'e' ancora un passo da mostrare accanto ai
  // giorni. Non dice "Left": quella parola sta sopra il numero grande e li'
  // sono soldi.
  'allowance.left': '{days} to the end of the period',
  // Il verdetto a parole e' uscito: lo dicono i due numeri accostati.
  'allowance.over': '{days} · {pace} a day against {sustainable} sustainable',
  'startNote': 'Budget active {from} · before that you had already spent {amount}',

  'pace.none': 'No spending in this period yet.',
  'pace.firstDay': 'It’s the first day of the period: today’s average is not a pace yet.',
  'pace.soFar.before': 'So far you are spending ',
  'pace.soFar.after': ' a day.',

  /* --- Storico ----------------------------------------------------------- */
  'history.blank.title': 'No expenses yet',
  'history.blank.text':
    'Tap the + below, type what you spent and pick the category. Two taps: it works at the till, with one hand.',

  /* --- riga di spesa e azioni -------------------------------------------- */
  'row.categoryRemoved': 'Category removed',
  'acts.label': 'Expense actions',
  'acts.amount': 'Fix the amount',
  'acts.delete': 'Delete',
  'acts.close': 'Close',

  /* --- foglio "correggi l'importo" --------------------------------------- */
  'amount.label': 'Fix the amount',
  'amount.hint.now': 'Right now it is {amount}. Type the right one.',
  'amount.hint.check': 'Check it and save.',
  'amount.hint.failed': 'I could not save it. Tap Save again.',
  'amount.fixed': 'It stays a fixed cost: fixing it does not touch this period\u2019s budget.',
  'amount.save': 'Save {amount}',
  'toast.amountFixed': 'Amount fixed: {amount}',
  'toast.amountBack': 'Amount back to {amount}',

  /* --- tastierino -------------------------------------------------------- */
  'keypad.erase': 'Delete the last digit. Press and hold to clear',

  /* --- foglio "aggiungi spesa" ------------------------------------------- */
  'add.label': 'New expense',
  'add.hint.failed': 'I could not save it. Tap the category again.',
  'add.hint.max': 'Highest amount reached',
  'add.hint.empty': 'How much did you spend?',
  // Le due varianti dei primi giorni. In inglese "pick a category" al primo
  // stato e "tap a category" al secondo: la prima descrive **cosa succedera'**,
  // la seconda e' l'istruzione per adesso, sui chip che si sono appena accesi.
  'add.hint.type': 'Type the amount, then pick a category',
  'add.hint.pick': 'Tap a category to save',
  // La formula di VoiceOver: "double tap" e' cio' che il lettore stesso chiede.
  'add.cat.hint': 'double tap to save',
  'add.date.other': 'Other',
  'add.date.pick': 'Pick another date',
  'add.note': 'Note',
  'add.note.placeholder': 'What for?',
  'add.note.done': 'Done',

  /* --- foglio del budget -------------------------------------------------- */
  'budget.label': 'Budget',
  'budget.hint.failed': 'I could not save it. Tap Save again.',
  'budget.hint.weekly': 'How much do you want to spend in a week?',
  'budget.hint.monthly': 'How much do you want to spend in a month?',
  'budget.hint.check': 'Check the period, then tap Save',
  'budget.periods': 'Budget period',
  'budget.weekly': 'Per week',
  'budget.monthly': 'Per month',
  'budget.none': 'no budget',
  'budget.now': 'now {amount}',
  'budget.save': 'Save',
  'budget.saveAmount': 'Save {amount} {cadence}',

  /* --- pannello del backup ------------------------------------------------ */
  'backup.label': 'Data backup',
  'backup.close': 'Close',
  'backup.lead': 'This is your whole archive. Copy it and paste it somewhere safe.',
  'backup.copied': 'Copied. Paste it where you want to keep it: Notes, an email to yourself, a file.',
  'backup.manual': 'The text is selected: use the system Copy and paste it where you want to keep it.',
  'backup.copy': 'Copy everything',
  'backup.copiedShort': 'Copied',
  'backup.shareTitle': 'Cent backup',

  /* --- avviso di aggiornamento -------------------------------------------- */
  'update.ready': 'New version available',
  'update.hint': 'Tap to update',
  'update.applying': 'Updating',
  'update.dismiss': 'Not now, stay on this version',

  /* --- archivio non aperto ------------------------------------------------ */
  'archive.title': 'I can’t open the archive',
  'archive.insecure':
    'Cent is open over an insecure connection (http). Outside https the browser removes some of the APIs the local archive needs: open Cent from an https address, or from localhost, and the data comes back.',
  'archive.unknown':
    'It could be a private window, no space left, or a profile that blocks storage: I can’t tell which. Try reopening Cent in a normal window. Until the archive opens you can’t add expenses — anything you wrote here would be lost.',

  /* --- pagina di installazione (ADR 011) ---------------------------------- */
  'install.title': 'Add Cent to your Home Screen',
  'install.lead':
    'Cent records what you spend every day in two taps and tells you how much is left. It works without a connection, without an account, and your data stays on the phone.',
  'install.why.title': 'The data lives in the installed app. What you write here would not reach it.',
  'install.why.text':
    'The browser and the installed app keep two separate archives: an expense written here would not show up in the app, and after a few days the browser would delete it on its own. That’s why there is nothing to tap here: it isn’t a missing part, it’s the only version that doesn’t lose what you write.',
  'install.how.title': 'How to install it, in three steps',
  'install.step1.before': 'Tap ',
  'install.step1.strong': 'Share',
  'install.step1.after': ' in the browser bar: the square with the arrow pointing up.',
  'install.step2.before': 'Scroll the list and choose ',
  'install.step2.strong': 'Add to Home Screen',
  'install.step2.after': '.',
  'install.step3.before': 'Confirm with ',
  'install.step3.strong': 'Add',
  'install.step3.after': '. Cent shows up with your apps: open it from there and it’s ready.',
  'install.other.before': 'On Android, Chrome or Edge the command is in the browser menu: ',
  'install.other.strong': 'Install app',
  'install.other.after': '. The reason is the same.',

  /* --- Impostazioni -------------------------------------------------------- */
  'settings.open': 'Settings',
  'settings.language.title': 'Language',
  'settings.language.group': 'App language',
  'settings.language.auto': 'Automatic',
  'settings.language.autoNote': 'Follows your phone’s language: right now {lang}.',
  'settings.language.it': 'Italiano',
  'settings.language.en': 'English',
  'settings.budget.title': 'Budget',
  'settings.budget.none': 'No budget set.',
  'settings.budget.current': 'Right now: {amount} {cadence}.',
  'settings.budget.edit': 'Change the budget',
  'settings.budget.set': 'Set a budget',
  'settings.data.title': 'Your data',
  'settings.data.text':
    'Your expenses stay on this phone: there is no account and no server. The export is the only copy that survives a lost phone or an app you delete.',
  'settings.data.export': 'Export everything',
  'settings.data.last': 'Last backup: {days} ago.',
  'settings.data.never': 'You have not exported anything yet.',
  'settings.guide.title': 'Guide',
  'settings.guide.text':
    'The two things about Cent nobody guesses: how you type an amount, and what saves an expense.',
  'settings.guide.again': 'Show the guide again',

  /* --- Impostazioni: categorie -------------------------------------------- */
  'settings.cats.title': 'Categories',
  'settings.cats.text':
    'Eight on the grid, and eight is the limit: they are the chips you tap while paying, and they all have to fit without scrolling. Archiving one takes it off the grid, not off the expenses that used it.',
  'settings.cats.grid': 'Categories on the grid',
  'settings.cats.editOne': 'Edit {name}',
  'settings.cats.add': 'Add a category',
  'settings.cats.archivedTitle': 'Archived',
  'settings.cats.archivedText':
    'Off the grid, not out of your data: History still shows them. Tap one to put it back on the grid in place of another.',
  'settings.cats.placeOne': 'Put {name} back on the grid',

  /* --- i nomi delle otto categorie di default ------------------------------ */
  'cat.default.groceries': 'Groceries',
  'cat.default.eatingOut': 'Eating out',
  'cat.default.coffeeshop': 'Coffeeshop',
  'cat.default.cigarettes': 'Cigarettes',
  'cat.default.transport': 'Transport',
  'cat.default.leisure': 'Fun',
  'cat.default.home': 'Home',
  'cat.default.extra': 'Extra',

  /* --- foglio della categoria --------------------------------------------- */
  'cat.new.label': 'New category',
  'cat.edit.label': 'Edit category',
  'cat.place.label': 'Back on the grid',
  'cat.name': 'Name',
  'cat.name.placeholder': 'What is it called?',
  'cat.hint.name': 'A name, then emoji and colour.',
  'cat.hint.replace': 'Tap the category it replaces.',
  'cat.hint.failed': 'I could not save it. Try again.',
  'cat.emoji': 'Emoji',
  'cat.color': 'Colour',
  'cat.color.note':
    'Eight colours, not eight at random: picked so they stay apart from each other even if you mix up red and green.',
  'cat.swap.title': 'Which one does it replace?',
  'cat.swap.text':
    'The tap saves. The one you tap goes to the archive: it stays on every expense that used it, and you can bring it back whenever you want.',
  'cat.add.free': 'Add it to the grid',
  'cat.place.free': 'Put it back on the grid',
  'cat.save': 'Save',
  'cat.archive': 'Archive',
  'cat.archive.note':
    'This only takes it off the grid: it stays on every expense that used it, and you keep seeing it in History.',
  'cat.delete': 'Delete for good',
  'cat.delete.note':
    'Nothing you can see uses it: no expense, no fixed cost. This is the only thing in Cent you cannot undo.',
  'pick.current': 'Current',
  'cat.emoji.current': 'The marked emoji is the one this category has now: it is not in the list.',
  'cat.color.current': 'The marked colour is the one this category has now: it is not in the palette.',
  'cat.inUse.expenses.one': '1 expense',
  'cat.inUse.expenses.other': '{count} expenses',
  'cat.inUse.rules.one': '1 fixed cost',
  'cat.inUse.rules.other': '{count} fixed costs',
  'cat.inUse.both': '{a} and {b}',
  'cat.inUse.text':
    'Used by {what}. Deleting it would turn those rows into “{removed}” for good, and nothing can give them a category back. Archive it instead: off the grid, History untouched.',
  'cat.preview': 'How the grid will look',
  'cat.position': 'Position {index} of {total}',
  'cat.move.back': 'Move back',
  'cat.move.on': 'Move forward',
  'cat.order.note':
    'After a few days you tap by position, without reading the name: moving a category costs more than it looks. A move takes effect right away.',
  'color.green': 'Green',
  'color.orange': 'Orange',
  'color.teal': 'Teal',
  'color.brown': 'Brown',
  'color.blue': 'Blue',
  'color.magenta': 'Magenta',
  'color.lilac': 'Lilac',
  'color.grey': 'Grey',

  /* --- la guida al primo avvio --------------------------------------------- */
  // **Queste stringhe sono l'originale**, non una traduzione: la guida e' stata
  // scritta qui e poi portata in italiano. La versione precedente era un calco
  // dall'italiano ("The last two digits are always the cents") e si sentiva —
  // l'unico punto dell'app in cui l'italiano suonava meglio dell'inglese, cioe'
  // il segno che l'originale non era l'originale.
  'guide.label': 'How Cent works',
  'guide.step': 'Step {index} of 2',
  'guide.skip': 'Skip',
  'guide.next': 'Next',
  'guide.start': 'Start',
  // Il titolo dice il fatto, il sottotitolo dice **cosa fare**: due zeri per un
  // importo tondo. Prima dicevano lo stesso fatto due volte, ed entrambi
  // descrittivi — cioe' la regola non era in nessuno dei due.
  'guide.amount.title': 'Amounts fill in from the right',
  'guide.amount.text': 'For €23, type 2 3 0 0.',
  // "saves the expense", non "saves it": senza l'oggetto, "it" si legge come la
  // categoria — e in Settings le categorie si salvano per davvero.
  'guide.save.title': 'Tapping a category saves the expense',
  'guide.save.text':
    'That’s the confirmation — no Save button. Wrong one? Undo, right after.',

  /* --- promemoria di backup ------------------------------------------------ */
  'nudge.never': 'You have never exported',
  'nudge.since': 'Last backup: {days} ago',
  'nudge.unknown': 'I cannot tell how long since your last copy',
  'nudge.hint': 'Your data lives only here.',
  'nudge.action': 'Export',

  /* --- spese fisse: le regole ricorrenti ---------------------------------- */
  // In fondo al riquadro invece che sotto il numero grande, quindi si regge da
  // sola: `on top of …` non ha piu' un referente a tre righe di distanza. Vedi
  // it.ts.
  'hero.fixed': 'Not counted: {amount} in fixed costs',

  'fixed.title': 'Fixed costs',
  'fixed.total': '{amount} a month in total.',
  'fixed.none': 'You have no fixed costs yet.',
  'fixed.text':
    'Rent, subscriptions, the gym: whatever goes out on its own. Cent writes them down for you and keeps them out of the budget, because they are not a decision.',
  'fixed.rate': 'This is a yearly average: a month with more due dates will see more go out.',
  'fixed.add': 'Add a fixed cost',
  'fixed.list': 'Your fixed costs',
  'fixed.later': 'starts: {day}',
  'fixed.off': 'off',
  'fixed.anchor': '{every}, on day {day}',

  'cad.daily.one': 'every day',
  'cad.daily.other': 'every {count} days',
  'cad.weekly.one': 'every week',
  'cad.weekly.other': 'every {count} weeks',
  'cad.monthly.one': 'every month',
  'cad.monthly.other': 'every {count} months',

  'rule.label': 'New fixed cost',
  'rule.label.edit': 'Fixed cost',
  'rule.hint.empty': 'How much goes out each time?',
  'rule.hint.category': 'Pick a category',
  'rule.hint.check': 'Check how often and from when, then tap Create',
  'rule.hint.edit': 'Change what you need, then tap Save',
  'rule.hint.on': 'Check what happens when you switch it back on',
  'rule.hint.failed': 'I could not create the rule. Tap Create again.',
  'rule.hint.max': 'Highest amount reached',
  'rule.cadence': 'How often',
  'rule.cadence.monthly': 'Monthly',
  'rule.cadence.weekly': 'Weekly',
  'rule.cadence.daily': 'Daily',
  'rule.cats': 'Category',
  'rule.start': 'Starting',
  'rule.start.today': 'Today',
  'rule.start.pick': 'Pick the day it starts from',
  'rule.start.other': 'Another date',
  'rule.anchor.day': 'Every month, on day {day}',
  'rule.anchor.pick': 'Change the day of the month it goes out',

  'rule.preview.today': 'First expense: today.',
  'rule.preview.later': 'First expense: {day}.',
  'rule.preview.back.one': 'This rule will create 1 past expense: {from}, {total}.',
  'rule.preview.back.other':
    'This rule will create {count} past expenses: {range}, {total} in total.',
  'rule.confirm.one': 'Also create the past expense',
  'rule.confirm.other': 'Also create the {count} past expenses',
  'rule.save': 'Create the fixed cost',
  'rule.save.back.one': 'Create 1 expense · {total}',
  'rule.save.back.other': 'Create {count} expenses · {total}',
  'rule.save.edit': 'Save',
  'rule.save.on': 'Switch back on',
  'rule.preview.settled': 'There is nothing to catch up on.',

  'rule.refused.stale':
    'Those numbers were from {day}: midnight changed them. I have redone them below — check and confirm.',
  'rule.refused.moved':
    'This fixed cost has created some expenses in the meantime. The numbers below are redone: check and confirm.',
  'rule.refused.gone': 'This fixed cost is gone. Close this, and look at the list.',

  'rule.cats.current':
    '{name} is archived, so it is no longer on the grid. It stays the category of this fixed cost until you tap another one.',

  /* --- moving the start date back (ADR 018) -------------------------------- */
  'rewind.now': 'Start date: {day}',
  'rewind.action': 'Move the start date back',
  'rewind.hint': 'Pick the day it really started. Backwards only.',
  'rewind.pick': 'Pick an earlier start day',
  'rewind.pick.none': 'Pick a day',
  'rewind.note':
    'Only the start date moves: the amount and how often stay as they are. What you already have stays too — an expense you corrected keeps your amount, and one you deleted stays deleted.',
  'rewind.preview.none': 'Nothing to create in the past. The start date becomes {day}.',
  'rewind.preview.today': 'This creates today’s expense: {total}.',
  'rewind.confirm.today': 'Also create today’s expense',
  'rewind.notEarlier': '{day} does not come before {current}: the start date only moves back.',
  'rewind.save.none': 'Move the start date',
  'rewind.back': 'Back',
  'rewind.refused.notEarlier':
    'The start date is already {current}, and {day} does not come before it. Pick another day.',
  'rewind.refused.invalid':
    'Something in this fixed cost does not add up, so I am not moving it. Close this, and check it in the list.',
  'rewind.refused.changed':
    'This fixed cost changed in the meantime. The numbers below are redone: check and confirm.',

  'rule.deactivate': 'Switch off',
  'rule.delete': 'Delete the fixed cost',
  'rule.delete.note': 'Only while it has no expense in your history.',
  'rule.inUse.one':
    'Your history has 1 expense from this fixed cost, so it cannot be deleted: that expense stays. Switch it off and it will create no more.',
  'rule.inUse.other':
    'Your history has {count} expenses from this fixed cost, so it cannot be deleted: they stay. Switch it off and it will create no more.',

  'toast.ruleSaved': 'Fixed cost added: {name}',
  'toast.ruleSavedBack.one': '{name}: 1 expense created',
  'toast.ruleSavedBack.other': '{name}: {count} expenses created',
  'toast.ruleUpdated': 'Fixed cost updated: {name}',
  'toast.ruleOff': '{name}: it will create no more expenses',
  'toast.ruleOn': '{name}: it will create expenses again',
  'toast.ruleOnBack.one': '{name}: back on, 1 expense created',
  'toast.ruleOnBack.other': '{name}: back on, {count} expenses created',
  'toast.ruleBack.none': '{name}: the start date is now {day}',
  'toast.ruleBack.one': '{name}: 1 expense created',
  'toast.ruleBack.other': '{name}: {count} past expenses created',
  'toast.ruleDeleted': 'Fixed cost deleted: {name}',
  'toast.ruleInUse': 'It has already created expenses: you can only switch it off',
  'toast.ruleFailed': 'That did not work. Try again.',

  /* --- Statistiche (fase 6) ------------------------------------------------ */
  'nav.stats': 'Stats',
  'title.stats': 'Where the money went',

  'stats.blank.title': 'Nothing to show yet',
  'stats.blank.text':
    'Once you have a few expenses, this is where you see what the money went on, and how this period compares with the ones before it.',

  // Vedi it.ts per l'argomento: non e' `stats.blank` con altre parole, e' un
  // altro fatto. Questa e' la stesura originale; l'italiano la segue.
  //
  // I due segnaposto sono **le due meta' verificabili** della frase, e nessuno
  // dei due e' una parola scritta qui:
  //
  // - `{range}` e' `periodRangeLabel`, cioe' **la stessa etichetta** che ogni
  //   altro stato di questa schermata stampa sotto la scheda `Day to day`;
  // - `{history}` e' `nav.history`, cioe' **la parola che si legge sulla
  //   barra**. Era scritta a mano, con un commento che dichiarava il contrario:
  //   rinominando la voce di navigazione, questa frase avrebbe continuato a
  //   mandare in un posto che non si chiama piu' cosi'.
  //
  // La frase finiva con *"and the comparison starts"*, e il confronto **non
  // comincia**: chi fa esattamente quello che legge — segna una spesa — torna
  // qui e trova una riga sola, sotto le due soglie, quindi nessuna barra e
  // nessuna sezione `Week by week`. Il confronto arriva col periodo dopo. Cio'
  // che si promette adesso e' cio' che si vede al tap successivo: la spesa
  // appena segnata compare qui, con il suo importo, sotto `What it went on`.
  //
  // E l'ultima frase e' **una constatazione, non un ordine**, perche' questo
  // ramo ha due inquilini: vedi it.ts, "La frase regge due storie".
  'stats.outside.title': 'Nothing to compare yet',
  'stats.outside.text':
    'This period is {range}, and nothing you have logged falls inside it: it is all in {history}. The next expense you add today shows up here.',

  'stats.variable': 'Day to day',

  'stats.byCategory': 'What it went on',
  // Vedi it.ts: la scheda in testa e' una previsione al mese, questa e' quanto e'
  // uscito nel periodo. Due numeri, due etichette.
  'stats.fixedInPeriod': 'Fixed this period',
  // **Quanto vale una barra piena in questa sezione.**
  //
  // Da 0a la scala e' della sezione, quindi la riga piu' grande di ciascuna
  // arriva a fondo colonna: sui dati veri `Home 507.00` e `Groceries 42.00`
  // sono dipinte della **stessa lunghezza**, una sopra l'altra. Finche' niente
  // dice che i due fondi colonna valgono cose diverse, sono due barre piene
  // identiche accanto a due importi di un ordine di grandezza diverso — cioe'
  // una bugia grafica.
  //
  // `=` e non una frase: e' una legenda, e va letta come tale in mezzo secondo.
  // Con un verbo ("bars are scaled to…") sarebbe una riga da leggere, e nessuno
  // legge una didascalia sotto un titolo.
  'stats.scale': 'Full bar = {amount}',
  'stats.byPeriod.weekly': 'Week by week',
  'stats.byPeriod.monthly': 'Month by month',

  /* **La riga del periodo in corso dice quanti giorni ha vissuto.**
   *
   * Sta sotto l'intervallo, sulla stessa riga di B, e vale **solo** per il
   * periodo corrente: sulle righe chiuse i giorni vissuti sono tutti, e dirlo
   * sarebbe rumore su sette righe su otto.
   *
   * ## Perche' non dice "mancano quattro giorni"
   *
   * Perche' il conto alla rovescia e' la stessa affermazione sul futuro che il
   * modello si rifiuta di disegnare come lunghezza (`PeriodBar.daysLived`): "ne
   * mancano quattro" invita a proiettare, e su una schermata che guarda indietro
   * non c'e' niente che sostenga la proiezione. `3 days of 7` e' un fatto
   * verificabile su un calendario, ed e' cio' che serve per leggere la barra
   * accanto: e' corta perche' e' corta, o perche' la settimana e' a meta'?
   *
   * ## Il numero dei giorni passa da `daysLabel`, il totale no
   *
   * Il primo ha un singolare che capita davvero — il lunedi', e il primo del
   * mese — e leggere `1 days` proprio il giorno in cui la barra e' piu' corta di
   * tutte sarebbe il refuso nel posto peggiore. Il secondo e' sempre >= 28.
   *
   * Corto di proposito: vive nella colonna del nome, che a 320 punti e' la prima
   * a cedere. Una frase piu' lunga andrebbe a capo li' e farebbe crescere in
   * altezza **una riga sola** dell'elenco. */
  'stats.daysSoFar': '{days} of {total}',

  'row.fixed': 'fixed cost',
}
