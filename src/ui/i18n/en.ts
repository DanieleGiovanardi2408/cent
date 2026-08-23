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
  'nav.settings': 'Settings',
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

  /* --- Home -------------------------------------------------------------- */
  'hero.spent': 'Spent',
  'hero.remaining': 'Left',
  'hero.noBudget': 'no budget set for this period',
  'hero.note': 'of {budget} · {spent} spent',

  'home.invite.before': 'With a budget this line becomes ',
  'home.invite.strong': 'how much you can spend today',
  'home.invite.after': ', instead of how much you have already spent.',
  'home.budget.set': 'Set a budget',
  'home.budget.change': 'Change the budget',
  'home.blank.title': 'Nothing written down today',
  'home.blank.text':
    'Tap the + below, type the amount and pick the category. Two taps: it works at the till, with one hand.',

  'allowance.closed.main': 'This period is over.',
  'allowance.closed.sub': 'The next one starts from scratch.',
  'allowance.late.weekly': 'This week had already started.',
  'allowance.late.monthly': 'This month had already started.',
  'allowance.late.sub': 'The budget counts in full {from}.',
  'allowance.over.main': 'The budget for this period is used up.',
  'allowance.over.sub': '{days} to go: what you spend from here is on top.',
  'allowance.last.main': 'You can spend {amount} today',
  'allowance.last.sub': 'Last day of the period: tomorrow it starts from scratch.',
  'allowance.main': 'You can spend ~{amount} a day',
  'allowance.sub': 'for the {days} that are left, today included',
  'startNote': 'Budget active {from} · before that you had already spent {amount}',

  'pace.none': 'No spending in this period yet.',
  'pace.firstDay': 'It’s the first day of the period: today’s average is not a pace yet.',
  'pace.soFar.before': 'So far you are spending ',
  'pace.soFar.after': ' a day.',
  'pace.above': 'Above pace: ',
  'pace.below': 'Below pace: ',
  'pace.against': ' a day against ',
  'pace.sustainable': ' sustainable.',

  /* --- Storico ----------------------------------------------------------- */
  'history.blank.title': 'No expenses yet',
  'history.blank.text':
    'Tap the + below, type what you spent and pick the category. Two taps: it works at the till, with one hand.',
  'history.blank.install':
    'Add Cent to your Home Screen: it opens full screen and starts even without a connection.',

  /* --- riga di spesa e azioni -------------------------------------------- */
  'row.categoryRemoved': 'Category removed',
  'acts.label': 'Expense actions',
  'acts.delete': 'Delete',
  'acts.close': 'Close',

  /* --- tastierino -------------------------------------------------------- */
  'keypad.erase': 'Delete the last digit. Press and hold to clear',

  /* --- foglio "aggiungi spesa" ------------------------------------------- */
  'add.label': 'New expense',
  'add.hint.failed': 'I could not save it. Tap the category again.',
  'add.hint.max': 'Highest amount reached',
  'add.hint.empty': 'How much did you spend?',
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
}
