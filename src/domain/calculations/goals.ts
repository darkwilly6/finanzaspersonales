import type { Goal } from '../types/ledger'

export interface GoalContext { cashMinor: number; monthResultMinor: number; monthRevenueMinor: number }
export interface GoalProgress { currentMinor: number; pct: number | null; reached: boolean }

export function goalProgress(goal: Pick<Goal, 'kind' | 'targetMinor'>, ctx: GoalContext): GoalProgress {
  const current = goal.kind === 'cash' ? ctx.cashMinor : goal.kind === 'monthly_result' ? ctx.monthResultMinor : ctx.monthRevenueMinor
  const pct = goal.targetMinor > 0 ? Math.max(0, (current / goal.targetMinor) * 100) : null
  return { currentMinor: current, pct, reached: goal.targetMinor > 0 && current >= goal.targetMinor }
}
