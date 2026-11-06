import type { Account, Budget, BudgetPeriod, Transaction } from '../types/ledger'
import { addDays, daysBetween, daysInMonth, endOfMonth, startOfMonth, startOfWeek } from './dates'
import { cashDelta } from './transactionRules'

export interface PeriodWindow { from: string; to: string; totalDays: number; elapsedDays: number }

/** Ventana del periodo en curso: hoy, la semana (lunes a domingo) o el mes calendario. */
export function periodWindow(period: BudgetPeriod, today: string): PeriodWindow {
  if (period === 'day') return { from: today, to: today, totalDays: 1, elapsedDays: 1 }
  if (period === 'week') {
    const from = startOfWeek(today)
    return { from, to: addDays(from, 6), totalDays: 7, elapsedDays: daysBetween(from, today) + 1 }
  }
  const from = startOfMonth(today)
  return { from, to: endOfMonth(today), totalDays: daysInMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7))), elapsedDays: Number(today.slice(8, 10)) }
}

export type BudgetLevel = 'ok' | 'near' | 'over'

export interface BudgetStatus {
  budget: Budget
  window: PeriodWindow
  spentMinor: number
  /** Puede ser negativo: cuánto te pasaste. */
  remainingMinor: number
  pct: number
  level: BudgetLevel
  /** Gasto estimado al cierre del periodo si sigues a este ritmo (semana y mes, con suficientes días transcurridos). */
  projectedMinor: number | null
}

export const NEAR_THRESHOLD = 0.8

/** Cuenta solo gastos (tipo gasto) confirmados del ámbito, en el periodo y, si se indicó, de esa categoría. */
export function budgetStatus(budget: Budget, accounts: readonly Account[], txs: readonly Transaction[], today: string): BudgetStatus {
  const window = periodWindow(budget.period, today)
  const ids = new Set(
    accounts
      .filter((a) => (budget.scope === 'all' ? true : budget.scope === 'personal' ? a.scope === 'personal' : a.businessId === budget.scope))
      .map((a) => a.id),
  )
  let spent = 0
  for (const t of txs) {
    if (t.type !== 'expense' || !ids.has(t.accountId) || t.date < window.from || t.date > window.to) continue
    if (budget.categoryId && t.categoryId !== budget.categoryId) continue
    if (cashDelta(t) !== 0) spent += t.amountMinor
  }
  const ratio = budget.limitMinor > 0 ? spent / budget.limitMinor : 0
  const enough = (budget.period === 'week' && window.elapsedDays >= 2) || (budget.period === 'month' && window.elapsedDays >= 5)
  return {
    budget,
    window,
    spentMinor: spent,
    remainingMinor: budget.limitMinor - spent,
    pct: ratio * 100,
    level: ratio >= 1 ? 'over' : ratio >= NEAR_THRESHOLD ? 'near' : 'ok',
    projectedMinor: enough && spent > 0 ? Math.round((spent * window.totalDays) / window.elapsedDays) : null,
  }
}
