/**
 * Le premesse d'ambiente asserite, non sperate. Un test, che gira per primo.
 *
 * ## A cosa serve una riga come questa
 *
 * `window.isSecureContext` e' vero qui **per effetto collaterale** del
 * `baseURL`: localhost e' un'origine considerata sicura, quindi nessuno l'ha
 * mai dovuto chiedere. E' proprio la forma di premessa che questo progetto ha
 * gia' incontrato quattro volte — il fuso, la lingua, il font, l'istante — e
 * ogni volta si e' vista solo quando ha ceduto.
 *
 * Se cedesse questa, `env.ts` dichiarerebbe `insecureContext` e `App.tsx`
 * metterebbe la banda `.alert--env` **in cima a ogni schermata**: un blocco di
 * testo alto qualche decina di pixel sopra tutto il resto. Cioe' ogni
 * asserzione geometrica della suite — i gate sull'identita' delle posizioni, i
 * CLS, le sonde delle sovrapposizioni, le riserve in righe — rossa insieme, e
 * nessuna che dica perche'. Centotrenta fallimenti che si leggono come una
 * regressione del layout, e mezza giornata a cercarla nel posto sbagliato.
 *
 * Un'asserzione sola trasforma quel muro in un fallimento che si spiega da
 * solo. Costa una riga e un secondo per progetto.
 *
 * ## Perche' la causa e non l'effetto
 *
 * Si potrebbe asserire l'assenza di `.alert--env`, ed e' la cosa sbagliata:
 * quella e' la conseguenza, e una conseguenza puo' mancare per dieci motivi
 * diversi (la banda rinominata, un ramo che non si dipinge). Il fatto
 * d'ambiente e' `isSecureContext`, e si asserisce quello — la stessa mossa del
 * gate che ha sostituito il CLS con l'identita' delle posizioni.
 *
 * ## Perche' il nome del file comincia per "a"
 *
 * Perche' una premessa che si legge **dopo** i cento fallimenti che spiega non
 * spiega piu' niente. Chi aggiungera' un altro `*.spec.ts` di premesse lo
 * chiami in modo che resti davanti.
 *
 * Il meccanismo e' `fullyParallel: false`: l'unita' che lo scheduler distribuisce
 * e' il **file**, e i file vengono consegnati ai worker in ordine alfabetico.
 * Questo e' quindi il primo lavoro che parte, e dura 130-430 ms: esce dalla
 * stampa prima di qualunque fallimento che avrebbe spiegato.
 *
 * Diceva `workers: 1` fino al giorno in cui i worker sono diventati meta'
 * macchina, e la riga era ancora li' — vera per caso. Non e' cambiato niente
 * nei fatti (misurato: primo risultato stampato a 1 worker e a 4), ma la
 * ragione scritta nominava un numero invece del meccanismo, ed e' il numero che
 * era destinato a invecchiare.
 *
 * ## E perche' gira su tutti e tre i viewport, pur non misurando niente
 *
 * Non e' una svista di `SENZA_GEOMETRIA`: e' il solo modo perche' faccia il suo
 * mestiere. Chi lancia `--project=landscape` da solo, con quaranta test rossi
 * davanti, deve trovare la spiegazione **in quella esecuzione** — una premessa
 * asserita in un progetto che non sta girando non spiega niente a nessuno.
 * Costa un secondo per progetto, ed e' il prezzo pieno di cio' che compra.
 */
// Da `./font` e non da `./installed`: `isSecureContext` non dipende da
// standalone, e questa premessa vale anche per `install.spec.ts`, che e'
// l'unico file della suite a girare fuori dall'app installata.
import { expect, test } from './font'

test('l\'origine dei test e\' un contesto sicuro', async ({ page }) => {
  await page.goto('./')

  expect(
    await page.evaluate(() => window.isSecureContext),
    'l\'origine servita a questa suite non e\' un contesto sicuro: `env.ts` accende ' +
      '`insecureContext`, `App.tsx` mette la banda `.alert--env` in cima a ogni ' +
      'schermata, e ogni misura geometrica della suite cade insieme per una ragione ' +
      'che non e\' il layout. Il baseURL deve restare su localhost o su https.',
  ).toBe(true)
})
