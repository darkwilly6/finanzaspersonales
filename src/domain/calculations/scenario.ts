export interface MonthlyBaseline { netIncomeMinor: number; expensesMinor: number; cogsMinor: number }

export interface ScenarioInput {
  /** Cambio porcentual de ingresos netos (10 = +10 %). */
  incomePct: number
  expensesPct: number
  cogsPct: number
  /** Costo mensual adicional (por ejemplo publicidad). */
  extraMonthlyCostMinor: number
  /** Inversión inicial única del escenario. */
  oneTimeInvestmentMinor: number
}

export interface ScenarioResult {
  baselineResultMinor: number
  projectedResultMinor: number
  deltaMonthlyMinor: number
  /** Meses para recuperar la inversión con la mejora mensual; null si no hay mejora o no hay inversión. */
  paybackMonths: number | null
  projected: MonthlyBaseline
}

const bump = (v: number, pct: number) => Math.round(v * (1 + pct / 100))

/** Qué pasaría cada mes si cambian ingresos, gastos y costo. Es una proyección de tus propios números, no una predicción. */
export function projectScenario(base: MonthlyBaseline, s: ScenarioInput): ScenarioResult {
  const projected: MonthlyBaseline = {
    netIncomeMinor: bump(base.netIncomeMinor, s.incomePct),
    expensesMinor: bump(base.expensesMinor, s.expensesPct) + s.extraMonthlyCostMinor,
    cogsMinor: bump(base.cogsMinor, s.cogsPct),
  }
  const baselineResult = base.netIncomeMinor - base.expensesMinor - base.cogsMinor
  const projectedResult = projected.netIncomeMinor - projected.expensesMinor - projected.cogsMinor
  const delta = projectedResult - baselineResult
  return {
    baselineResultMinor: baselineResult,
    projectedResultMinor: projectedResult,
    deltaMonthlyMinor: delta,
    paybackMonths: s.oneTimeInvestmentMinor > 0 && delta > 0 ? s.oneTimeInvestmentMinor / delta : null,
    projected,
  }
}

/** Promedio mensual de varios meses (ya calculados). Con cero meses, todo en 0. */
export function averageMonthly(months: readonly MonthlyBaseline[]): MonthlyBaseline {
  const n = months.length
  if (n === 0) return { netIncomeMinor: 0, expensesMinor: 0, cogsMinor: 0 }
  const sum = (f: (m: MonthlyBaseline) => number) => Math.round(months.reduce((s, m) => s + f(m), 0) / n)
  return { netIncomeMinor: sum((m) => m.netIncomeMinor), expensesMinor: sum((m) => m.expensesMinor), cogsMinor: sum((m) => m.cogsMinor) }
}
