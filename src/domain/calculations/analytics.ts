import type { Account, Business, Category, Transaction } from '../types/ledger'
import { addMonths, endOfMonth, monthKey, startOfMonth } from './dates'
import { summarize, type LedgerSummary } from './summary'
import { withCogs } from './cogs'
import { affectsCash } from './transactionRules'

/**
 * Variación porcentual. Devuelve null cuando el periodo anterior es 0: "no comparable" no es lo mismo que 0 %.
 * Usa el valor absoluto del anterior para que pasar de -100 a -50 se lea como mejora.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export interface MonthPoint {
  month: string // YYYY-MM
  netIncomeMinor: number
  expensesMinor: number
  cogsMinor: number
  resultMinor: number
  netCashFlowMinor: number
}

/** Últimos `months` meses terminando en el mes de `today`. Recibe movimientos YA acotados al ámbito. */
export function monthlySeries(txs: readonly Transaction[], scopeAccountIds: ReadonlySet<string> | null, today: string, months: number, cogsOf?: (from: string, to: string) => number): MonthPoint[] {
  const out: MonthPoint[] = []
  for (let i = months - 1; i >= 0; i--) {
    const m = monthKey(addMonths(today, -i))
    const inMonth = txs.filter((t) => t.status !== 'cancelled' && monthKey(t.date) === m)
    const s = summarize(inMonth, scopeAccountIds)
    const cogs = cogsOf ? cogsOf(startOfMonth(`${m}-01`), endOfMonth(`${m}-01`)) : 0
    out.push({ month: m, netIncomeMinor: s.netIncome, expensesMinor: s.expenses, cogsMinor: cogs, resultMinor: s.operatingResult - cogs, netCashFlowMinor: s.netCashFlow })
  }
  return out
}

export const TRADING_KEY = '__trading_withdrawal'

export interface CategorySlice { categoryId: string | null; name: string; color: string; totalMinor: number; share: number }

/** Reparto por categoría de movimientos confirmados. Ingresos: ingresos menos devoluciones de la misma categoría. */
export function categoryBreakdown(txs: readonly Transaction[], categories: readonly Category[], kind: 'expense' | 'income'): CategorySlice[] {
  const totals = new Map<string | null, number>()
  for (const t of txs) {
    if (!affectsCash(t.status)) continue
    let sign = 0
    if (kind === 'expense' && t.type === 'expense') sign = 1
    if (kind === 'income' && t.type === 'income') sign = 1
    if (kind === 'income' && t.type === 'refund') sign = -1
    if (kind === 'income' && t.type === 'trading_withdrawal') sign = 1
    if (sign === 0) continue
    const key = t.type === 'trading_withdrawal' ? TRADING_KEY : t.categoryId
    totals.set(key, (totals.get(key) ?? 0) + sign * t.amountMinor)
  }
  const rows = [...totals.entries()].filter(([, v]) => v > 0)
  const grand = rows.reduce((s, [, v]) => s + v, 0)
  return rows
    .map(([id, total]) => {
      if (id === TRADING_KEY) return { categoryId: id, name: 'Retiros de trading', color: '#b18cff', totalMinor: total, share: grand > 0 ? total / grand : 0 }
      const c = id ? categories.find((x) => x.id === id) : undefined
      return { categoryId: id, name: c?.name ?? 'Sin categoría', color: c?.color ?? '#a0a5ad', totalMinor: total, share: grand > 0 ? total / grand : 0 }
    })
    .sort((a, b) => b.totalMinor - a.totalMinor)
}

export interface BusinessRow {
  businessId: string
  name: string
  summary: LedgerSummary
  /** Resultado operativo / ingresos netos. null si no hubo ingresos (no se inventa 0 %). */
  marginPct: number | null
}

export function businessComparison(businesses: readonly Business[], accounts: readonly Account[], txsInPeriod: readonly Transaction[], cogsOf?: (ids: ReadonlySet<string>) => { cogsMinor: number; unknownSales: number }): BusinessRow[] {
  return businesses
    .map((b) => {
      const ids = new Set(accounts.filter((a) => a.businessId === b.id).map((a) => a.id))
      const raw = summarize(txsInPeriod.filter((t) => ids.has(t.accountId)), ids)
      const s = cogsOf ? withCogs(raw, cogsOf(ids)) : raw
      return { businessId: b.id, name: b.name, summary: s, marginPct: s.netIncome > 0 ? (s.operatingResult / s.netIncome) * 100 : null }
    })
    .sort((a, b) => b.summary.operatingResult - a.summary.operatingResult)
}

/** Periodo inmediatamente anterior de igual duración, para comparar. */
export function previousPeriod(from: string, to: string): { from: string; to: string } | null {
  if (from === '0000-01-01' || to === '9999-12-31') return null
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  const len = Math.round((b - a) / 86_400_000) + 1
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  // Mes calendario completo → mes calendario anterior (más justo que restar N días).
  if (from === startOfMonth(from) && to === endOfMonth(from)) {
    const prev = addMonths(from, -1)
    return { from: startOfMonth(prev), to: endOfMonth(prev) }
  }
  return { from: fmt(a - len * 86_400_000), to: fmt(a - 86_400_000) }
}
