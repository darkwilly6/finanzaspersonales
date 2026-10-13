import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useLedger } from './LedgerData'
import { DEFAULT_FILTER, accountsInScope, applyFilter, resolvePeriod, type DateRange, type LedgerFilter } from '../../domain/calculations/filters'
import { summarize, type LedgerSummary } from '../../domain/calculations/summary'
import { cogsFor, withCogs } from '../../domain/calculations/cogs'
import type { Account, Transaction } from '../../domain/types/ledger'

interface FilterState {
  filter: LedgerFilter
  setFilter: (patch: Partial<LedgerFilter>) => void
  reset: () => void
  /** Movimientos que cumplen todos los filtros (para listas). */
  filtered: Transaction[]
  /** Cuentas del ámbito seleccionado. */
  scopeAccounts: Account[]
  /** Resumen del periodo y ámbito, con transferencias internas eliminadas. Solo movimientos confirmados. */
  summary: LedgerSummary
  /** null = todas las cuentas (consolidado). */
  scopeIds: ReadonlySet<string> | null
  /** Movimientos no anulados del ámbito, de cualquier fecha (base para comparar periodos). */
  scoped: Transaction[]
  /** Rango del periodo elegido (null = todo el historial). */
  range: DateRange | null
}

const Ctx = createContext<FilterState | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const { accounts, transactions, sales, cancelledSaleIds, today } = useLedger()
  const [filter, setFull] = useState<LedgerFilter>(DEFAULT_FILTER)

  const value = useMemo<FilterState>(() => {
    const scopeAccounts = accountsInScope(accounts, filter.scopes)
    const filtered = applyFilter(transactions, accounts, filter, today)
    // El resumen ignora filtros de cuenta/categoría/tipo/estado a propósito solo si no se usan; aquí se respeta lo que la persona ve.
    const scopeSet = new Set(scopeAccounts.map((a) => a.id))
    const scopeIds = filter.scopes.length === 0 ? null : scopeSet
    const rng = resolvePeriod(filter, today)
    // El costo de lo vendido sale de las ventas; solo aplica si no se está filtrando por cuenta, categoría, tipo o estado.
    const noDetailFilter = !filter.accountId && !filter.categoryId && !filter.type && !filter.status
    const cogsRes = noDetailFilter ? cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: scopeIds, from: rng?.from, to: rng?.to }) : { cogsMinor: 0, unknownSales: 0 }
    return {
      filter,
      setFilter: (patch) => setFull((f) => ({ ...f, ...patch })),
      reset: () => setFull(DEFAULT_FILTER),
      filtered,
      scopeAccounts,
      summary: withCogs(summarize(filtered, scopeIds), cogsRes),
      scopeIds,
      scoped: transactions.filter((t) => t.status !== 'cancelled' && scopeSet.has(t.accountId)),
      range: rng,
    }
  }, [accounts, transactions, sales, cancelledSaleIds, today, filter])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useFilters(): FilterState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useFilters debe usarse dentro de FilterProvider')
  return v
}
