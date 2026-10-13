import type { Account, Transaction, TransactionStatus, TransactionType } from '../types/ledger'
import { addDays, addMonths, endOfMonth, endOfYear, startOfMonth, startOfWeek, startOfYear } from './dates'

export const PERIOD_PRESETS = ['today', 'week', 'last7', 'last30', 'last90', 'thisMonth', 'lastMonth', 'thisYear', 'all', 'custom'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]
export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoy',
  week: 'Esta semana',
  last7: 'Últimos 7 días',
  last30: 'Últimos 30 días',
  last90: 'Últimos 90 días',
  thisMonth: 'Mes actual',
  lastMonth: 'Mes anterior',
  thisYear: 'Este año',
  all: 'Todo el historial',
  custom: 'Rango personalizado',
}

export interface LedgerFilter {
  /** 'personal' y/o ids de negocio. Vacío = todos los ámbitos (vista consolidada). */
  scopes: string[]
  period: PeriodPreset
  from: string
  to: string
  accountId: string
  categoryId: string
  type: '' | TransactionType
  status: '' | TransactionStatus
}

export const DEFAULT_FILTER: LedgerFilter = {
  scopes: [], period: 'thisMonth', from: '', to: '', accountId: '', categoryId: '', type: '', status: '',
}

export interface DateRange { from: string; to: string }

/** null = sin límite de fechas. */
export function resolvePeriod(f: Pick<LedgerFilter, 'period' | 'from' | 'to'>, today: string): DateRange | null {
  switch (f.period) {
    case 'today': return { from: today, to: today }
    case 'week': return { from: startOfWeek(today), to: addDays(startOfWeek(today), 6) }
    case 'last7': return { from: addDays(today, -6), to: today }
    case 'last30': return { from: addDays(today, -29), to: today }
    case 'last90': return { from: addDays(today, -89), to: today }
    case 'thisMonth': return { from: startOfMonth(today), to: endOfMonth(today) }
    case 'lastMonth': {
      const prev = addMonths(today, -1)
      return { from: startOfMonth(prev), to: endOfMonth(prev) }
    }
    case 'thisYear': return { from: startOfYear(today), to: endOfYear(today) }
    case 'custom': {
      if (!f.from && !f.to) return null
      return { from: f.from || '0000-01-01', to: f.to || '9999-12-31' }
    }
    default: return null
  }
}

/** Cuentas que pertenecen al ámbito seleccionado. */
export function accountsInScope(accounts: readonly Account[], scopes: readonly string[]): Account[] {
  if (scopes.length === 0) return [...accounts]
  return accounts.filter((a) => (a.scope === 'personal' ? scopes.includes('personal') : a.businessId !== null && scopes.includes(a.businessId)))
}

export function isScopeAll(scopes: readonly string[]): boolean {
  return scopes.length === 0
}

/**
 * Aplica TODOS los filtros. Los filtros de interfaz nunca sustituyen a las reglas de seguridad.
 * Los anulados se excluyen salvo que se filtre expresamente por estado "Anulado".
 */
export function applyFilter(txs: readonly Transaction[], accounts: readonly Account[], f: LedgerFilter, today: string): Transaction[] {
  const scopeIds = new Set(accountsInScope(accounts, f.scopes).map((a) => a.id))
  const range = resolvePeriod(f, today)
  return txs.filter((t) => {
    if (!scopeIds.has(t.accountId)) return false
    if (range && (t.date < range.from || t.date > range.to)) return false
    if (f.accountId && t.accountId !== f.accountId) return false
    if (f.categoryId && t.categoryId !== f.categoryId) return false
    if (f.type && t.type !== f.type) return false
    if (f.status) return t.status === f.status
    return t.status !== 'cancelled'
  })
}

export function activeFilterCount(f: LedgerFilter): number {
  let n = 0
  if (f.scopes.length) n++
  if (f.period !== DEFAULT_FILTER.period) n++
  if (f.accountId) n++
  if (f.categoryId) n++
  if (f.type) n++
  if (f.status) n++
  return n
}
