import { describe, expect, it } from 'vitest'
import type { Account, Budget, PlanBucket, Transaction } from '../types/ledger'
import { aggregatePlan, defaultPlan, planProblem, resolvePlan, splitPlan, actionForBucket } from './plan'
import { budgetStatus, periodWindow } from './budgets'
import { buildAlerts } from './alerts'
import { computeBalances } from './transactionRules'

describe('plantillas y validación del plan', () => {
  it.each(['physical', 'digital', 'service', 'training', 'mentoring', 'trading', 'other'] as const)('la plantilla de %s suma exactamente 100 %% y es válida', (t) => {
    const p = defaultPlan(t)
    expect(p.reduce((s, b) => s + b.bps, 0)).toBe(10000)
    expect(planProblem(p)).toBeNull()
    expect(p.some((b) => b.kind === 'owner')).toBe(true)
  })
  it('un negocio físico tiene inventario; uno digital no', () => {
    expect(defaultPlan('physical').some((b) => /inventario/i.test(b.name))).toBe(true)
    expect(defaultPlan('digital').some((b) => /inventario/i.test(b.name))).toBe(false)
    expect(defaultPlan('digital').some((b) => /publicidad/i.test(b.name))).toBe(true)
  })
  it('detecta problemas: vacío, nombres, porcentajes y suma', () => {
    const ok: PlanBucket[] = [{ id: 'a', name: 'Para mí', kind: 'owner', bps: 6000 }, { id: 'b', name: 'Publicidad', kind: 'use', bps: 4000 }]
    expect(planProblem(ok)).toBeNull()
    expect(planProblem([])).toBe('empty')
    expect(planProblem([{ ...ok[0]!, name: ' ' }, ok[1]!])).toBe('name')
    expect(planProblem([{ ...ok[0]!, bps: 6000.5 }, ok[1]!])).toBe('bps')
    expect(planProblem([{ ...ok[0]!, bps: 5000 }, ok[1]!])).toBe('sum')
    expect(planProblem(Array.from({ length: 11 }, (_, i) => ({ id: `x${i}`, name: `Parte ${i}`, kind: 'use' as const, bps: 0 })))).toBe('too_many')
  })
  it('el resumen en tres partes cuadra con el plan', () => {
    expect(aggregatePlan(defaultPlan('physical'))).toEqual({ ownerBps: 3000, reserveBps: 1500, reinvestBps: 5500 })
  })
  it('usa el plan detallado, si no el de tres partes, si no nada', () => {
    const plan = defaultPlan('trading')
    expect(resolvePlan({ plan, allocation: null })).toEqual(plan)
    expect(resolvePlan({ plan: null, allocation: { ownerBps: 5000, reserveBps: 2000, reinvestBps: 3000 } })!.map((b) => [b.kind, b.bps])).toEqual([['owner', 5000], ['reserve', 2000], ['use', 3000]])
    expect(resolvePlan({ plan: null, allocation: null })).toBeNull()
    expect(resolvePlan({ plan: [{ id: 'a', name: 'X', kind: 'use', bps: 1 }], allocation: null })).toBeNull()
  })
  it('el reparto suma exactamente lo repartible, sin perder centavos', () => {
    const plan: PlanBucket[] = [{ id: 'a', name: 'A', kind: 'owner', bps: 3333 }, { id: 'b', name: 'B', kind: 'reserve', bps: 3333 }, { id: 'c', name: 'C', kind: 'use', bps: 3334 }]
    for (const total of [0, 1, 7, 100001, 123457]) expect(splitPlan(total, plan).reduce((s, x) => s + x.amountMinor, 0)).toBe(total)
    expect(splitPlan(-50, plan).every((x) => x.amountMinor === 0)).toBe(true)
  })
  it('reconoce a qué acción lleva cada parte según el negocio', () => {
    expect(actionForBucket({ name: 'Inventario (mercancía)', kind: 'use' }, 'physical')).toBe('stock')
    expect(actionForBucket({ name: 'Publicidad', kind: 'use' }, 'physical')).toBe('expense')
    expect(actionForBucket({ name: 'Reinversión (broker o fondeo)', kind: 'use' }, 'trading')).toBe('investment')
    expect(actionForBucket({ name: 'Herramientas y software', kind: 'use' }, 'digital')).toBe('expense')
  })
})

const acc = (id: string, scope: 'personal' | 'business', businessId: string | null): Account => ({ id, name: id, scope, businessId, accountType: 'bank', currency: 'USD', openingBalanceMinor: 0, openingBalanceDate: '2026-01-01', status: 'active' })
let n = 0
const exp = (accountId: string, amountMinor: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`, type: 'expense', scope: 'business', businessId: 'b1', accountId, counterpartAccountId: null, transferId: null, transferPurpose: null, direction: null,
  date, amountMinor, currency: 'USD', categoryId: null, status: 'confirmed', description: '', counterparty: '', voidedAt: null, voidReason: null, createdAt: null, updatedAt: null, ...extra,
})
const bud = (over: Partial<Budget> = {}): Budget => ({ id: 'g1', name: 'Gasto del mes', period: 'month', scope: 'all', categoryId: null, limitMinor: 100000, active: true, ...over })
const accounts = [acc('biz', 'business', 'b1'), acc('per', 'personal', null), acc('biz2', 'business', 'b2')]

describe('ventanas de periodo', () => {
  it('día, semana (lunes a domingo) y mes', () => {
    expect(periodWindow('day', '2026-10-14')).toMatchObject({ from: '2026-10-14', to: '2026-10-14', totalDays: 1 })
    expect(periodWindow('week', '2026-10-14')).toMatchObject({ from: '2026-10-12', to: '2026-10-18', totalDays: 7, elapsedDays: 3 })
    expect(periodWindow('month', '2026-10-14')).toMatchObject({ from: '2026-10-01', to: '2026-10-31', totalDays: 31, elapsedDays: 14 })
    expect(periodWindow('month', '2024-02-10').totalDays).toBe(29)
  })
})

describe('límites de gasto', () => {
  const today = '2026-10-14'
  it('suma solo gastos confirmados del periodo y calcula el margen que queda', () => {
    const txs = [exp('biz', 30000, '2026-10-02'), exp('per', 20000, '2026-10-10', { scope: 'personal', businessId: null }), exp('biz', 99999, '2026-09-30'), exp('biz', 5000, '2026-10-05', { status: 'pending' }), exp('biz', 7000, '2026-10-06', { status: 'cancelled' }), exp('biz', 1234, '2026-10-07', { type: 'income' })]
    const s = budgetStatus(bud(), accounts, txs, today)
    expect(s).toMatchObject({ spentMinor: 50000, remainingMinor: 50000, level: 'ok' })
    expect(s.pct).toBe(50)
  })
  it('por ámbito: personal, un negocio o todo', () => {
    const txs = [exp('biz', 30000, '2026-10-02'), exp('per', 20000, '2026-10-10', { scope: 'personal', businessId: null }), exp('biz2', 10000, '2026-10-03', { businessId: 'b2' })]
    expect(budgetStatus(bud({ scope: 'personal' }), accounts, txs, today).spentMinor).toBe(20000)
    expect(budgetStatus(bud({ scope: 'b1' }), accounts, txs, today).spentMinor).toBe(30000)
    expect(budgetStatus(bud({ scope: 'b2' }), accounts, txs, today).spentMinor).toBe(10000)
    expect(budgetStatus(bud({ scope: 'all' }), accounts, txs, today).spentMinor).toBe(60000)
  })
  it('por categoría', () => {
    const txs = [exp('biz', 30000, '2026-10-02', { categoryId: 'ads' }), exp('biz', 10000, '2026-10-03', { categoryId: 'food' })]
    expect(budgetStatus(bud({ categoryId: 'ads' }), accounts, txs, today).spentMinor).toBe(30000)
  })
  it('cerca (80 %) y excedido (100 %), con el exceso en negativo', () => {
    expect(budgetStatus(bud(), accounts, [exp('biz', 80000, '2026-10-02')], today)).toMatchObject({ level: 'near', remainingMinor: 20000 })
    expect(budgetStatus(bud(), accounts, [exp('biz', 79999, '2026-10-02')], today).level).toBe('ok')
    expect(budgetStatus(bud(), accounts, [exp('biz', 100000, '2026-10-02')], today)).toMatchObject({ level: 'over', remainingMinor: 0 })
    expect(budgetStatus(bud(), accounts, [exp('biz', 130000, '2026-10-02')], today)).toMatchObject({ level: 'over', remainingMinor: -30000 })
  })
  it('semana y día usan solo su ventana', () => {
    const txs = [exp('biz', 4000, '2026-10-12'), exp('biz', 6000, '2026-10-14'), exp('biz', 9000, '2026-10-11')]
    expect(budgetStatus(bud({ period: 'week' }), accounts, txs, today).spentMinor).toBe(10000)
    expect(budgetStatus(bud({ period: 'day' }), accounts, txs, today).spentMinor).toBe(6000)
  })
  it('proyección: solo con suficientes días transcurridos y nunca en el día', () => {
    const txs = [exp('biz', 28000, '2026-10-05')]
    expect(budgetStatus(bud(), accounts, txs, today).projectedMinor).toBe(Math.round((28000 * 31) / 14))
    expect(budgetStatus(bud(), accounts, txs, '2026-10-03').projectedMinor).toBeNull()
    expect(budgetStatus(bud({ period: 'day' }), accounts, txs, '2026-10-05').projectedMinor).toBeNull()
    expect(budgetStatus(bud(), accounts, [], today).projectedMinor).toBeNull()
  })
})

describe('alertas de límites', () => {
  const base = { accounts, businesses: [], transactions: [], recurring: [], forecast: null, today: '2026-10-14', truncated: false, balances: computeBalances(accounts, []) }
  it('excedido es urgente y dice cuánto te pasaste', () => {
    const s = budgetStatus(bud(), accounts, [exp('biz', 130000, '2026-10-02')], '2026-10-14')
    const a = buildAlerts({ ...base, budgets: [s] }).find((x) => x.id === 'budget-g1')!
    expect(a.severity).toBe('critical')
    expect(a.detail).toContain('$300.00')
  })
  it('cerca del límite avisa cuánto queda', () => {
    const s = budgetStatus(bud(), accounts, [exp('biz', 85000, '2026-10-02')], '2026-10-14')
    const a = buildAlerts({ ...base, budgets: [s] }).find((x) => x.id === 'budget-g1')!
    expect(a).toMatchObject({ severity: 'warning' })
    expect(a.detail).toContain('$150.00')
  })
  it('dentro del límite no avisa; con ritmo alto, avisa como información', () => {
    expect(buildAlerts({ ...base, budgets: [budgetStatus(bud(), accounts, [exp('biz', 1000, '2026-10-02')], '2026-10-14')] }).some((x) => x.id === 'budget-g1')).toBe(false)
    const fast = budgetStatus(bud({ limitMinor: 100000 }), accounts, [exp('biz', 60000, '2026-10-02')], '2026-10-14')
    expect(fast.level).toBe('ok')
    expect(buildAlerts({ ...base, budgets: [fast] }).find((x) => x.id === 'budget-g1')).toMatchObject({ severity: 'info' })
  })
})
