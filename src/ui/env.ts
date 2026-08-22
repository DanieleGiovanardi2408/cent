/**
 * Due fatti sull'ambiente che la UI deve **dire**, non indovinare.
 *
 * `isSecureContext` e' falso su `http://` da rete locale — il modo in cui questa
 * app viene provata dal telefono mentre la si scrive. Li' mancano due cose
 * insieme: `crypto.randomUUID` (senza cui l'app non partiva affatto) e la
 * registrazione del service worker, cioe' proprio la parte che si sta andando a
 * misurare. Una build senza service worker non e' rappresentativa, e senza una
 * banda che lo dica si finisce per misurare la cosa sbagliata senza accorgersene.
 *
 * Sta qui e non in un `if` sparso: la diagnosi va scritta una volta sola, e
 * dev'essere la stessa nello Storico e nella banda in cima all'app.
 */
export const insecureContext = !window.isSecureContext
