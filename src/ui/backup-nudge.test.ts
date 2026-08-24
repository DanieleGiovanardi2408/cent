import { describe, expect, it } from 'vitest'
import { makeExpense, makeSettings } from '../core/testing'
import type { Expense } from '../core/types'
import {
  BACKUP_FIRST_GRACE_DAYS,
  BACKUP_GRACE_DAYS,
  backupNudge,
  daysSince,
} from './backup-nudge'

/**
 * Il promemoria di backup, provato dove si puo' provare: la **regola**, non il
 * riquadro.
 *
 * Quello che puo' sbagliare qui non e' il disegno — sono confini che a mano non
 * si toccano mai, perche' per vederli bisognerebbe lasciar passare due settimane
 * vere: le **due** soglie, il caso "non c'e' niente da perdere" e il conto che
 * non torna. Un errore su uno qualunque e' silenzioso in entrambe le direzioni,
 * e la direzione peggiore — il banner che tace a torto — lascia senza copia chi
 * crede di averla.
 *
 * ## Questo file ha gia' fallito una volta, e non diventando rosso
 *
 * Sorvegliava **una soglia sola** applicata a entrambi i rami, cioe' esattamente
 * il codice che c'era, per due commit dopo che la decisione delle due soglie era
 * stata scritta. Era verde perche' confermava la regola vecchia.
 *
 * Da qui la forma dei test qui sotto: i due rami hanno **due `describe`
 * separati**, e ciascuno prova il proprio confine con il **numero dell'altro
 * ramo in mezzo** — a 7 giorni "mai esportato" parla e "esportato" tace, ed e'
 * quella asimmetria a essere asserita. Un ritorno alla soglia unica, in
 * qualunque delle due direzioni, cade qui.
 *
 * La geometria della banda (che non copra niente, che non sposti niente) e'
 * materia della sonda in `tests/e2e`, dove ci sono i pixel veri.
 */

const PRIMO_AVVIO = '2026-08-01T09:00:00.000Z'
const una: readonly Expense[] = [makeExpense({ date: '2026-08-02' })]

/** `giorni` dopo il primo avvio, alla stessa ora. */
function dopo(giorni: number): string {
  return new Date(Date.parse(PRIMO_AVVIO) + giorni * 24 * 60 * 60 * 1000).toISOString()
}

describe('backupNudge', () => {
  it('tace finche\' non ci sono spese: non c\'e\' niente da perdere', () => {
    const settings = makeSettings({ createdAt: PRIMO_AVVIO })
    expect(backupNudge(settings, [], dopo(90))).toBeNull()
  })

  it('conta anche le spese cancellate: restano nell\'export', () => {
    // Un soft delete e' nel backup e nello Storico. Se l'archivio contiene solo
    // spese cancellate, c'e' comunque qualcosa da perdere.
    const settings = makeSettings({ createdAt: PRIMO_AVVIO })
    const cancellata = [makeExpense({ date: '2026-08-02', deletedAt: dopo(1) })]
    expect(backupNudge(settings, cancellata, dopo(30))).not.toBeNull()
  })
})

/**
 * Il ramo "non ha mai esportato": **7 giorni**, contati dal primo avvio.
 *
 * La soglia e' piu' bassa perche' i due casi non si risolvono da soli con la
 * stessa probabilita': il backup che non avviene mai e' il primo, e chi non e'
 * entrato in Impostazioni in una settimana non ci entrera' spontaneamente.
 */
describe('backupNudge — chi non ha mai esportato', () => {
  const mai = makeSettings({ createdAt: PRIMO_AVVIO })

  it('tace a 6 giorni e parla a 7', () => {
    expect(backupNudge(mai, una, dopo(BACKUP_FIRST_GRACE_DAYS - 1))).toBeNull()
    expect(backupNudge(mai, una, dopo(BACKUP_FIRST_GRACE_DAYS))).toEqual({
      days: BACKUP_FIRST_GRACE_DAYS,
      ever: false,
    })
  })

  it('parla dove l\'altro ramo tace ancora: e\' l\'asimmetria che conta', () => {
    // Il giorno in cui le due soglie si distinguono. Con una soglia sola —
    // com'era, per due commit — questa riga sarebbe `null` e nessun'altra
    // asserzione di questo file se ne accorgerebbe.
    const vecchio = makeSettings({ createdAt: PRIMO_AVVIO, lastBackupAt: PRIMO_AVVIO })
    expect(backupNudge(mai, una, dopo(BACKUP_FIRST_GRACE_DAYS))?.ever).toBe(false)
    expect(backupNudge(vecchio, una, dopo(BACKUP_FIRST_GRACE_DAYS))).toBeNull()
  })

  it('il riferimento e\' il primo avvio, non la prima spesa', () => {
    // Dopo un import la prima spesa puo' essere vecchia di mesi: contare da li'
    // accenderebbe il promemoria su dati appena arrivati da un backup.
    const appenaInstallato = makeSettings({ createdAt: dopo(60) })
    const vecchia = [makeExpense({ date: '2026-01-05' })]
    expect(backupNudge(appenaInstallato, vecchia, dopo(63))).toBeNull()
  })
})

/**
 * Il ramo "ha gia' esportato": **14 giorni**, contati dall'ultima copia
 * **osservata** — non dal primo avvio, e non da un `<a download>` il cui esito
 * l'app non ha potuto vedere.
 */
describe('backupNudge — chi ha gia\' esportato', () => {
  const vecchio = makeSettings({ createdAt: PRIMO_AVVIO, lastBackupAt: dopo(10) })

  it('tace a 13 giorni dalla copia e parla a 14', () => {
    expect(backupNudge(vecchio, una, dopo(10 + BACKUP_GRACE_DAYS - 1))).toBeNull()
    expect(backupNudge(vecchio, una, dopo(10 + BACKUP_GRACE_DAYS))).toEqual({
      days: BACKUP_GRACE_DAYS,
      ever: true,
    })
  })

  it('il conto parte dall\'ultima copia, non dal primo avvio', () => {
    // Venti giorni dal primo avvio ma dieci dal backup: sotto la soglia.
    expect(backupNudge(vecchio, una, dopo(20))).toBeNull()
    expect(backupNudge(vecchio, una, dopo(25))).toEqual({ days: 15, ever: true })
  })

  it('un export appena fatto lo spegne', () => {
    const settings = makeSettings({ createdAt: PRIMO_AVVIO, lastBackupAt: dopo(100) })
    expect(backupNudge(settings, una, dopo(100))).toBeNull()
  })
})

/**
 * Il conto che non torna **accende**, e non e' una tolleranza: e' la regola di
 * CLAUDE.md ("Backup") applicata al caso in cui la funzione non sa rispondere.
 *
 * Prima qui c'era `toBeNull()`, cioe' il banner si spegneva **per sempre** su un
 * timestamp illeggibile o su un orologio spostato indietro. Era il difetto
 * peggiore possibile per un indicatore di sicurezza: silenzioso, permanente, e
 * scritto in un test che lo chiamava una virtu'.
 */
describe('backupNudge — quando il conto non si puo\' fare', () => {
  it('su un createdAt illeggibile accende la banda senza numero', () => {
    const rotto = makeSettings({ createdAt: 'non-una-data' })
    expect(backupNudge(rotto, una, dopo(30))).toEqual({ days: null, ever: false })
  })

  it('su un orologio tornato indietro accende, invece di tacere', () => {
    // Fuso cambiato a mano, orologio risincronizzato: l'ultima copia risulta nel
    // futuro. E' anche il genere di situazione in cui non si sa piu' cosa e'
    // stato copiato e cosa no.
    const futuro = makeSettings({ createdAt: PRIMO_AVVIO, lastBackupAt: dopo(50) })
    expect(backupNudge(futuro, una, dopo(20))).toEqual({ days: null, ever: true })
  })

  it('ma senza spese resta muto: non c\'e\' niente da perdere', () => {
    // L'allarme vale sui dati, non sull'orologio. Un database vuoto con un
    // timestamp rotto non ha niente da salvare.
    const rotto = makeSettings({ createdAt: 'non-una-data' })
    expect(backupNudge(rotto, [], dopo(30))).toBeNull()
  })
})

describe('daysSince', () => {
  it('conta giorni interi, non arrotonda per eccesso', () => {
    expect(daysSince(PRIMO_AVVIO, dopo(0))).toBe(0)
    expect(daysSince(PRIMO_AVVIO, '2026-08-14T08:59:00.000Z')).toBe(12)
    expect(daysSince(PRIMO_AVVIO, '2026-08-14T09:00:00.000Z')).toBe(13)
  })

  it('null se l\'orologio e\' andato indietro o la data non si legge', () => {
    // Succede: fuso cambiato a mano, orologio risincronizzato. Un numero
    // negativo qui diventerebbe "ultimo backup: -3 giorni fa".
    expect(daysSince(dopo(10), PRIMO_AVVIO)).toBeNull()
    expect(daysSince('boh', PRIMO_AVVIO)).toBeNull()
  })
})
