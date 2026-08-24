/**
 * Implementazione di `Persistence` in memoria. **Solo per i test.**
 *
 * Nessun file di `src/app` o `src/ui` deve importarla: non finisce nel bundle
 * perche' nessuno la importa, ed e' bene resti cosi'.
 *
 * Convive con `fake-indexeddb` (ADR 001) e non e' un doppione: quello serve a
 * verificare IndexedDB (transazioni, migrazioni, due contesti sullo stesso
 * database), questo serve a **far morire il disco a comando**, che IndexedDB
 * non sa fare su richiesta. I test che parlano di interruzioni e di errori di
 * scrittura vivono qui; quelli che parlano di concorrenza vivono su `idb.ts`.
 *
 * Due dettagli non decorativi:
 *
 * - **clona in ingresso e in uscita** (`structuredClone`). Un doppio che
 *   restituisse gli stessi oggetti del chiamante nasconderebbe ogni aliasing fra
 *   mirror e disco: un test passerebbe perche' i due lati sono lo stesso oggetto,
 *   non perche' la scrittura funziona. IndexedDB clona davvero, e questo doppio
 *   deve mentire il meno possibile.
 * - sa **morire a comando** (`crashAfter`). E' cosi' che si testa
 *   l'interrompibilita': la scrittura numero N fallisce senza applicare nulla e
 *   da li' in poi l'oggetto e' morto, esattamente come una scheda terminata da
 *   iOS. I dati sopravvissuti restano ispezionabili e riapribili.
 */

import { planResolvedBudgetChange } from './budget'
import { planCategoryDeletion, planCategoryPlacement } from './categories'
import { planRecurringRuleDeletion } from './recurring-plan'
import type { RecurringRuleDeletion } from './recurring-plan'
import type { CategoryDeletion, CategoryPlacement } from './categories'
import { isAfter } from './date'
import { NOTHING_SKIPPED } from './persistence'
import type {
  CategoryArchival,
  LoadedData,
  Persistence,
  RecurringMarkerAdvance,
  WriteBatch,
  WriteResult,
} from './persistence'
import type { Budget, Category, DataSet, Expense, RecurringRule, Settings } from './types'

export interface MemoryDisk {
  expenses: Expense[]
  categories: Category[]
  recurringRules: RecurringRule[]
  budgets: Budget[]
  settings: Settings | null
}

export interface MemoryPersistence extends Persistence {
  /** Il contenuto del "disco". Sopravvive al crash, come IndexedDB. */
  readonly disk: MemoryDisk
  /** Numero di `write` andate a buon fine. */
  readonly writeCount: number
  /**
   * Fa fallire l'`n`-esima scrittura successiva (1 = la prossima) senza
   * applicarla, e rende inutilizzabile l'istanza. Il disco resta.
   */
  crashAfter(n: number): void
}

export class SimulatedCrashError extends Error {
  constructor() {
    super('Persistenza terminata (crash simulato)')
    this.name = 'SimulatedCrashError'
  }
}

export function emptyDisk(): MemoryDisk {
  return { expenses: [], categories: [], recurringRules: [], budgets: [], settings: null }
}

function upsert<T extends { readonly id: string }>(target: T[], incoming: readonly T[]): void {
  for (const record of incoming) {
    const clone = structuredClone(record) as T
    const index = target.findIndex((r) => r.id === record.id)
    if (index === -1) target.push(clone)
    else target[index] = clone
  }
}

/**
 * Upsert delle categorie che **non tocca `archived`**, come `idb.ts`: il valore
 * si rilegge dal disco. E' cio' che impedisce a un mirror vecchio di riportare
 * in griglia una categoria archiviata altrove, cioe' di farne nove.
 */
function upsertCategories(target: Category[], incoming: readonly Category[]): void {
  for (const record of incoming) {
    const index = target.findIndex((c) => c.id === record.id)
    const current = target[index]
    const clone = structuredClone(record)
    if (current === undefined) target.push(clone)
    else target[index] = { ...clone, archived: current.archived }
  }
}

/** Toglie dalla griglia, e basta. Non esiste il verso opposto. */
function archiveCategories(target: Category[], archivals: readonly CategoryArchival[]): void {
  for (const archival of archivals) {
    const index = target.findIndex((c) => c.id === archival.id)
    const current = target[index]
    if (current === undefined || current.archived) continue
    target[index] = { ...current, archived: true, updatedAt: archival.updatedAt }
  }
}

/**
 * Fa avanzare i segnaposti rileggendo dal disco, come `idb.ts`.
 *
 * Le tre regole del contratto stanno tutte qui: record sparito = niente,
 * segnaposto gia' piu' avanti = niente, e `updatedAt` si tocca solo se il
 * segnaposto si e' mosso davvero.
 */
function advanceMarkers(
  target: RecurringRule[],
  advances: readonly RecurringMarkerAdvance[],
): void {
  for (const advance of advances) {
    const index = target.findIndex((r) => r.id === advance.id)
    const current = target[index]
    if (current === undefined) continue
    const previous = current.lastMaterializedDate
    if (previous !== undefined && !isAfter(advance.lastMaterializedDate, previous)) continue
    target[index] = {
      ...current,
      lastMaterializedDate: advance.lastMaterializedDate,
      updatedAt: advance.updatedAt,
    }
  }
}

/** @param disk lo stato iniziale; passare quello di un'istanza morta la "riapre". */
export function createMemoryPersistence(disk: MemoryDisk = emptyDisk()): MemoryPersistence {
  let writes = 0
  let remainingBeforeCrash = Number.POSITIVE_INFINITY
  let dead = false

  function guard(): void {
    if (dead) throw new SimulatedCrashError()
    remainingBeforeCrash -= 1
    if (remainingBeforeCrash < 0) {
      dead = true
      throw new SimulatedCrashError()
    }
  }

  return {
    disk,
    get writeCount() {
      return writes
    },
    crashAfter(n: number): void {
      remainingBeforeCrash = n - 1
    },
    async loadAll(): Promise<LoadedData> {
      if (dead) throw new SimulatedCrashError()
      return structuredClone({
        expenses: disk.expenses,
        categories: disk.categories,
        recurringRules: disk.recurringRules,
        budgets: disk.budgets,
        settings: disk.settings,
      })
    },
    async write(batch: WriteBatch): Promise<WriteResult> {
      guard()
      // Applicazione "tutto o niente": si costruisce a parte e si sostituisce.
      const next = structuredClone(disk)
      const skippedIds: string[] = []
      let budgetsWritten: readonly Budget[] = []
      let placement: CategoryPlacement | undefined
      let deletion: CategoryDeletion | undefined
      let ruleDeletion: RecurringRuleDeletion | undefined
      if (batch.addExpenses) {
        // Semantica add, identica a quella di `idb.ts`: l'id gia' presente si
        // salta, non si sovrascrive. Qui non serve nessuna transazione perche'
        // non c'e' nessun parallelismo vero, ma il comportamento osservabile
        // deve essere lo stesso, altrimenti i test verificano un'altra app.
        for (const record of batch.addExpenses) {
          if (next.expenses.some((e) => e.id === record.id)) {
            skippedIds.push(record.id)
            continue
          }
          next.expenses.push(structuredClone(record))
        }
      }
      if (batch.expenses) upsert(next.expenses, batch.expenses)
      if (batch.categories) upsertCategories(next.categories, batch.categories)
      if (batch.archiveCategories) archiveCategories(next.categories, batch.archiveCategories)
      if (batch.categoryPlacement) {
        // Pianificazione sulle categorie del "disco", come in `idb.ts`: il tetto
        // lo decide lo stato che c'e' li', non quello che aveva in mano chi ha
        // chiesto la scrittura.
        placement = planCategoryPlacement(next.categories, batch.categoryPlacement)
        if (placement.ok) upsert(next.categories, placement.written)
      }
      if (batch.categoryDeletion) {
        deletion = planCategoryDeletion(
          next.categories,
          next.expenses,
          next.recurringRules,
          next.budgets,
          batch.categoryDeletion,
        )
        if (deletion.ok) {
          const id = deletion.deleted.id
          next.categories = next.categories.filter((c) => c.id !== id)
        }
      }
      if (batch.recurringRules) upsert(next.recurringRules, batch.recurringRules)
      if (batch.recurringRuleDeletion) {
        // Come in `idb.ts`: il permesso lo da' lo stato del "disco", non quello
        // che aveva in mano chi ha chiesto la scrittura.
        ruleDeletion = planRecurringRuleDeletion(
          next.recurringRules,
          next.expenses,
          batch.recurringRuleDeletion,
        )
        if (ruleDeletion.ok) {
          const id = ruleDeletion.deleted.id
          next.recurringRules = next.recurringRules.filter((r) => r.id !== id)
        }
      }
      if (batch.advanceRecurringMarkers) {
        advanceMarkers(next.recurringRules, batch.advanceRecurringMarkers)
      }
      if (batch.budgets) upsert(next.budgets, batch.budgets)
      if (batch.budgetChange) {
        // Pianificazione sui budget del "disco", come in `idb.ts`: il doppio
        // deve sbagliare le stesse cose e indovinare le stesse, altrimenti i
        // test verificano un'altra app.
        budgetsWritten = planResolvedBudgetChange(next.budgets, batch.budgetChange)
        upsert(next.budgets, budgetsWritten)
      }
      if (batch.settings) next.settings = structuredClone(batch.settings)
      disk.expenses = next.expenses
      disk.categories = next.categories
      disk.recurringRules = next.recurringRules
      disk.budgets = next.budgets
      disk.settings = next.settings
      writes += 1
      if (
        skippedIds.length === 0 &&
        budgetsWritten.length === 0 &&
        placement === undefined &&
        deletion === undefined &&
        ruleDeletion === undefined
      ) {
        return NOTHING_SKIPPED
      }
      return {
        skippedIds,
        budgets: budgetsWritten,
        ...(placement !== undefined ? { categoryPlacement: placement } : {}),
        ...(deletion !== undefined ? { categoryDeletion: deletion } : {}),
        ...(ruleDeletion !== undefined ? { recurringRuleDeletion: ruleDeletion } : {}),
      }
    },
    async replaceAll(data: DataSet): Promise<void> {
      guard()
      const clone = structuredClone(data) as DataSet
      disk.expenses = [...clone.expenses]
      disk.categories = [...clone.categories]
      disk.recurringRules = [...clone.recurringRules]
      disk.budgets = [...clone.budgets]
      disk.settings = clone.settings
      writes += 1
    },
    close(): void {
      dead = true
    },
  }
}
