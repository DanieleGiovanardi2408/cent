/**
 * Le entita' del dominio. Nessun comportamento, solo forma.
 *
 * Regole valide per tutte:
 * - `id` e' un UUID generato da `crypto.randomUUID()`;
 * - `createdAt` / `updatedAt` sono timestamp ISO 8601 completi (istanti, non
 *   date civili): servono per l'ordinamento stabile e per i log di import;
 * - gli importi sono `Cents`, interi. Mai float.
 * - le date di dominio sono `IsoDate` (`YYYY-MM-DD`), mai `Date`.
 */

import type { Cents } from './money'
import type { IsoDate } from './date'

/** Istante ISO 8601 con fuso, es. `2026-08-22T14:03:11.482Z`. */
export type Timestamp = string

export interface EntityBase {
  readonly id: string
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

export type ExpenseSource = 'manual' | 'recurring'

export interface Expense extends EntityBase {
  readonly amountCents: Cents
  readonly categoryId: string
  readonly date: IsoDate
  readonly note?: string
  readonly source: ExpenseSource
  /** Presente solo se `source === 'recurring'`: la regola che l'ha generata. */
  readonly recurringId?: string
  /** Soft delete. Se valorizzato la spesa non entra in nessun totale. */
  readonly deletedAt?: Timestamp
}

export interface Category extends EntityBase {
  readonly name: string
  readonly emoji: string
  /** Colore in formato `#rrggbb`. */
  readonly color: string
  /** Posizione nella lista dei chip. Interi, non necessariamente contigui. */
  readonly order: number
  readonly archived: boolean
}

export type Cadence = 'daily' | 'weekly' | 'monthly'

export interface RecurringRule extends EntityBase {
  readonly amountCents: Cents
  readonly categoryId: string
  readonly note?: string
  readonly cadence: Cadence
  /** Ogni quanti giorni / settimane / mesi. Intero >= 1. */
  readonly interval: number
  /**
   * Solo per `monthly`: giorno del mese 1-31. Se assente si usa il giorno di
   * `startDate`. Un anchorDay > giorni del mese cade sull'ultimo giorno
   * (`clampDayOfMonth`) senza mai sconfinare nel mese successivo.
   */
  readonly anchorDay?: number
  readonly startDate: IsoDate
  readonly endDate?: IsoDate
  /**
   * Ultimo giorno **gia' materializzato e persistito**. Avanza solo dopo che la
   * transazione che ha scritto le spese di quel giorno e' andata a buon fine.
   * Assente = la regola non ha mai prodotto nulla.
   */
  readonly lastMaterializedDate?: IsoDate
  readonly active: boolean
}

export type BudgetPeriod = 'weekly' | 'monthly'

/**
 * Budget storicizzato: non si modifica, si chiude e se ne apre uno nuovo.
 * Un record vale per i giorni in `[effectiveFrom, effectiveTo]`; senza
 * `effectiveTo` vale fino a nuovo ordine.
 */
export interface Budget extends EntityBase {
  readonly period: BudgetPeriod
  readonly amountCents: Cents
  /** Assente = budget complessivo del periodo. Presente = budget di categoria. */
  readonly categoryId?: string
  readonly effectiveFrom: IsoDate
  readonly effectiveTo?: IsoDate
}

export type ThemePreference = 'light' | 'dark' | 'auto'

/** Record singolo: esiste una sola riga, con questo id. */
export const SETTINGS_ID = 'settings'

export interface Settings extends EntityBase {
  readonly id: typeof SETTINGS_ID
  /** Lunedi'. Il tipo e' letterale: cambiarlo e' una decisione, non un'opzione. */
  readonly weekStartsOn: 1
  readonly theme: ThemePreference
  readonly lastBackupAt?: Timestamp
  /** Versione dello schema con cui questi dati sono stati scritti. */
  readonly schemaVersion: number
}

/*
 * Nota su un campo che non c'e': `storagePersisted`.
 *
 * L'esito di `navigator.storage.persist()` non e' un dato dell'app: e' uno
 * stato che il browser gia' tiene e che `navigator.storage.persisted()` sa dire
 * a ogni avvio, gratis e sempre aggiornato. Cacharlo qui voleva dire tenerne una
 * copia che puo' solo divergere — il permesso si puo' revocare, i dati si
 * possono spostare — per non fare una chiamata che costa niente. Chi in fase 5
 * lo vorra' mostrare in Impostazioni lo legga vivo.
 */

/**
 * Tutti i dati dell'app in memoria. E' anche la forma del mirror letto dalla UI
 * e il corpo dell'export JSON.
 */
export interface DataSet {
  readonly expenses: readonly Expense[]
  readonly categories: readonly Category[]
  readonly recurringRules: readonly RecurringRule[]
  readonly budgets: readonly Budget[]
  readonly settings: Settings
}

export type StoreName = 'expenses' | 'categories' | 'recurringRules' | 'budgets' | 'settings'

/** Genera un id. Estratto per poterlo rendere deterministico nei test. */
export function newId(): string {
  return crypto.randomUUID()
}

export function nowTimestamp(): Timestamp {
  return new Date().toISOString()
}
