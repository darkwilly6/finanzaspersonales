import { useMemo } from 'react'
import { useLedger } from './LedgerData'
import { useFilters } from './FilterContext'
import { forecastCash, type ForecastResult } from '../../domain/calculations/forecast'
import { buildAlerts, type Alert } from '../../domain/calculations/alerts'
import type { Account } from '../../domain/types/ledger'
import { stockRows } from '../../domain/calculations/inventory'

const isCash = (a: Account) => a.status === 'active' && a.accountType !== 'investment'

/** Proyección del efectivo del ámbito elegido en los filtros globales. */
export function useScopedForecast(days: number): ForecastResult {
  const { balances, transactions, recurring, today } = useLedger()
  const { scopeAccounts } = useFilters()
  return useMemo(
    () => forecastCash({ accounts: scopeAccounts.filter(isCash), balanceOf: (id) => balances.get(id)?.balanceMinor ?? 0, transactions, recurring, today, days }),
    [scopeAccounts, balances, transactions, recurring, today, days],
  )
}

/** Alertas globales: no dependen de los filtros, así ninguna queda oculta por un filtro. */
export function useAlerts(): Alert[] {
  const { accounts, balances, businesses, transactions, recurring, today, truncated, products, stock } = useLedger()
  return useMemo(() => {
    const forecast = forecastCash({ accounts: accounts.filter(isCash), balanceOf: (id) => balances.get(id)?.balanceMinor ?? 0, transactions, recurring, today, days: 30 })
    const lowStock = stockRows(products.filter((p) => p.active), stock).filter((r) => r.low).map((r) => ({ name: r.product.name, units: r.units, reorderPoint: r.product.reorderPoint ?? 0 }))
    return buildAlerts({ accounts, balances, businesses, transactions, recurring, forecast, today, truncated, lowStock })
  }, [accounts, balances, businesses, transactions, recurring, today, truncated, products, stock])
}
