import { describe, expect, it } from 'vitest'
import { makeExpense, makeSettings } from '../core/testing'
import type { Expense } from '../core/types'
import { BACKUP_GRACE_DAYS, backupNudge, daysSince } from './backup-nudge'

/**
 * Il promemoria di backup, provato dove si puo' provare: la **regola**, non il
 * riquadro.
 *
 * Quello che puo' sbagliare qui non e' il disegno — sono tre confini che a mano
 * non si toccano mai, perche' per vederli bisognerebbe lasciar passare due
 * settimane vere: la soglia, il caso "non ha mai esportato" e il caso "non c'e'
 * niente da perdere". Un errore su uno qualunque dei tre e' silenzioso in
 * entrambe le direzioni, e la direzione peggiore — il banner che tace a torto —
 * lascia senza copia chi crede di averla.
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

  it('tace sotto la soglia e parla appena la supera', () => {
    const settings = makeSettings({ createdAt: PRIMO_AVVIO })
    expect(backupNudge(settings, una, dopo(BACKUP_GRACE_DAYS - 1))).toBeNull()
    expect(backupNudge(settings, una, dopo(BACKUP_GRACE_DAYS))).toEqual({
      days: BACKUP_GRACE_DAYS,
      ever: false,
    })
  })

  it('distingue "mai esportato" da "esportato tempo fa": sono due frasi diverse', () => {
    const mai = makeSettings({ createdAt: PRIMO_AVVIO })
    const vecchio = makeSettings({ createdAt: PRIMO_AVVIO, lastBackupAt: dopo(10) })

    expect(backupNudge(mai, una, dopo(20))?.ever).toBe(false)
    // Dal backup sono passati dieci giorni, non venti: il conto parte dall'ultima
    // copia **osservata**, non dal primo avvio.
    expect(backupNudge(vecchio, una, dopo(20))).toBeNull()
    expect(backupNudge(vecchio, una, dopo(25))).toEqual({ days: 15, ever: true })
  })

  it('un export appena fatto lo spegne', () => {
    const settings = makeSettings({ createdAt: PRIMO_AVVIO, lastBackupAt: dopo(100) })
    expect(backupNudge(settings, una, dopo(100))).toBeNull()
  })

  it('conta anche le spese cancellate: restano nell\'export', () => {
    // Un soft delete e' nel backup e nello Storico. Se l'archivio contiene solo
    // spese cancellate, c'e' comunque qualcosa da perdere.
    const settings = makeSettings({ createdAt: PRIMO_AVVIO })
    const cancellata = [makeExpense({ date: '2026-08-02', deletedAt: dopo(1) })]
    expect(backupNudge(settings, cancellata, dopo(30))).not.toBeNull()
  })

  it('su un timestamp illeggibile tace invece di inventare un numero', () => {
    const rotto = makeSettings({ createdAt: 'non-una-data' })
    expect(backupNudge(rotto, una, dopo(30))).toBeNull()
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
