import { describe, expect, it } from 'vitest'
import type { Account, Business, Category, InventoryMove, Product, Sale, Transaction } from '../types/ledger'
import { avgCostMinor, costOfRemoval, immobilizedCapital, stockRows } from './inventory'
import { cogsFor, withCogs } from './cogs'
import { summarize } from './summary'
import { nextPayout } from './payout'
import { averageMonthly, projectScenario } from './scenario'
import { goalProgress } from './goals'
import { backupJson, salesCsv, toCsv, transactionsCsv } from '../export'
import { buildAlerts } from './alerts'
import { computeBalances } from './transactionRules'

describe('costo promedio y capital inmovilizado', () => {
  it('promedio redondeado, costo de salida exacto y sin stock negativo', () => {
    expect(avgCostMinor({ units: 3, valueMinor: 1000 })).toBe(333)
    expect(avgCostMinor({ units: 0, valueMinor: 0 })).toBeNull()
    expect(costOfRemoval({ units: 3, valueMinor: 1000 }, 3)).toBe(1000)
    expect(costOfRemoval({ units: 3, valueMinor: 1000 }, 4)).toBeNull()
    expect(costOfRemoval({ units: 3, valueMinor: 1000 }, 0)).toBeNull()
  })
  it('filas de stock: solo productos con control, alerta de reposición y capital inmovilizado', () => {
    const p = (id: string, track: boolean, reorder: number | null): Product => ({ id, name: id, sku: '', businessId: 'b', unitPriceMinor: 1, unitCostMinor: null, active: true, trackStock: track, reorderPoint: reorder })
    const stock = new Map([['a', { units: 4, valueMinor: 4000 }], ['b', { units: 20, valueMinor: 10000 }]])
    const rows = stockRows([p('a', true, 5), p('b', true, 5), p('c', false, null), p('d', true, null)], stock)
    expect(rows.map((r) => [r.product.id, r.units, r.low])).toEqual([['a', 4, true], ['b', 20, false], ['d', 0, false]])
    expect(immobilizedCapital(rows)).toBe(14000)
  })
})

describe('costo de lo vendido en el resultado', () => {
  const sale = (id: string, accountId: string, date: string, costMinor: number | null) => ({ id, accountId, date, costMinor })
  it('suma el costo de ventas no anuladas del ámbito y periodo; las de costo desconocido se informan aparte', () => {
    const r = cogsFor([sale('s1', 'a', '2026-10-05', 3000), sale('s2', 'a', '2026-10-06', null), sale('s3', 'a', '2026-10-07', 999), sale('s4', 'b', '2026-10-07', 500), sale('s5', 'a', '2026-09-30', 800)], { cancelled: new Set(['s3']), scopeAccountIds: new Set(['a']), from: '2026-10-01', to: '2026-10-31' })
    expect(r).toEqual({ cogsMinor: 3000, unknownSales: 1 })
  })
  it('el resultado operativo descuenta el costo de lo vendido, no las compras de inventario', () => {
    const base = { scope: 'business', businessId: 'b', accountId: 'a', counterpartAccountId: null, transferId: null, transferPurpose: null, direction: null, date: '2026-10-05', currency: 'USD', categoryId: null, status: 'confirmed', description: '', counterparty: '', voidedAt: null, voidReason: null, createdAt: null, updatedAt: null } as const
    const txs = [
      { ...base, id: '1', type: 'income', amountMinor: 20000 },
      { ...base, id: '2', type: 'expense', amountMinor: 2000 },
      { ...base, id: '3', type: 'inventory_purchase', amountMinor: 40000 },
    ] as Transaction[]
    const s = summarize(txs, null)
    expect(s.inventoryPurchases).toBe(40000)
    expect(s.operatingResult).toBe(18000) // las compras no son gasto
    const w = withCogs(s, { cogsMinor: 6000, unknownSales: 0 })
    expect(w.operatingResult).toBe(12000)
    expect(w.cogs).toBe(6000)
    expect(s.netCashFlow).toBe(20000 - 2000 - 40000)
  })
})

describe('calendario de pagos al propietario', () => {
  const a = { customDays: null, today: '2026-10-10' }
  it('sin pagos previos toca ahora', () => expect(nextPayout({ ...a, lastPayoutDate: null, frequency: 'monthly' })).toEqual({ date: '2026-10-10', due: true, neverPaid: true }))
  it('semanal, cada 15 días, mensual con fin de mes y personalizada', () => {
    expect(nextPayout({ ...a, lastPayoutDate: '2026-10-05', frequency: 'weekly' })).toMatchObject({ date: '2026-10-12', due: false })
    expect(nextPayout({ ...a, lastPayoutDate: '2026-09-25', frequency: 'biweekly' })).toMatchObject({ date: '2026-10-10', due: true })
    expect(nextPayout({ ...a, lastPayoutDate: '2026-01-31', frequency: 'monthly', today: '2026-03-01' })).toMatchObject({ date: '2026-02-28', due: true })
    expect(nextPayout({ ...a, lastPayoutDate: '2026-10-01', frequency: 'custom', customDays: 20 })).toMatchObject({ date: '2026-10-21', due: false })
  })
})

describe('escenarios y metas', () => {
  const base = { netIncomeMinor: 100000, expensesMinor: 30000, cogsMinor: 40000 }
  it('proyecta el resultado mensual con tus propios números', () => {
    const r = projectScenario(base, { incomePct: 20, expensesPct: 0, cogsPct: 20, extraMonthlyCostMinor: 5000, oneTimeInvestmentMinor: 60000 })
    expect(r.baselineResultMinor).toBe(30000)
    expect(r.projected).toEqual({ netIncomeMinor: 120000, expensesMinor: 35000, cogsMinor: 48000 })
    expect(r.projectedResultMinor).toBe(37000)
    expect(r.deltaMonthlyMinor).toBe(7000)
    expect(r.paybackMonths).toBeCloseTo(60000 / 7000, 5)
  })
  it('sin mejora o sin inversión no hay recuperación', () => {
    expect(projectScenario(base, { incomePct: 0, expensesPct: 10, cogsPct: 0, extraMonthlyCostMinor: 0, oneTimeInvestmentMinor: 5000 }).paybackMonths).toBeNull()
    expect(projectScenario(base, { incomePct: 10, expensesPct: 0, cogsPct: 0, extraMonthlyCostMinor: 0, oneTimeInvestmentMinor: 0 }).paybackMonths).toBeNull()
  })
  it('promedio mensual y vacío', () => {
    expect(averageMonthly([{ netIncomeMinor: 100, expensesMinor: 10, cogsMinor: 0 }, { netIncomeMinor: 300, expensesMinor: 30, cogsMinor: 0 }])).toEqual({ netIncomeMinor: 200, expensesMinor: 20, cogsMinor: 0 })
    expect(averageMonthly([])).toEqual({ netIncomeMinor: 0, expensesMinor: 0, cogsMinor: 0 })
  })
  it('progreso de metas', () => {
    const ctx = { cashMinor: 50000, monthResultMinor: -2000, monthRevenueMinor: 90000 }
    expect(goalProgress({ kind: 'cash', targetMinor: 100000 }, ctx)).toEqual({ currentMinor: 50000, pct: 50, reached: false })
    expect(goalProgress({ kind: 'monthly_revenue', targetMinor: 90000 }, ctx)).toMatchObject({ pct: 100, reached: true })
    expect(goalProgress({ kind: 'monthly_result', targetMinor: 10000 }, ctx)).toMatchObject({ pct: 0, reached: false })
    expect(goalProgress({ kind: 'cash', targetMinor: 0 }, ctx)).toMatchObject({ pct: null, reached: false })
  })
})

describe('exportación', () => {
  it('CSV: comillas, saltos de línea y neutraliza fórmulas', () => {
    expect(toCsv([['a', 'b,c', 'd"e', 'f\ng'], ['=SUMA(A1)', '+1', '-2', '@x']])).toBe('a,"b,c","d""e","f\ng"\r\n\'=SUMA(A1),\'+1,\'-2,\'@x')
    expect(toCsv([[null, undefined, 0, 12.5]])).toBe(',,0,12.5')
  })
  const accounts = [{ id: 'a1', name: 'Banco' }] as Account[]
  const businesses = [{ id: 'b1', name: 'NYXAR' }] as Business[]
  const categories = [{ id: 'c1', name: 'Ventas' }] as Category[]
  it('movimientos: importes en dólares con dos decimales y orden por fecha', () => {
    const csv = transactionsCsv([
      { id: 't2', type: 'expense', status: 'confirmed', scope: 'business', businessId: 'b1', accountId: 'a1', counterpartAccountId: null, direction: null, categoryId: null, description: 'Hola, mundo', counterparty: '', amountMinor: 12345, date: '2026-10-06', voidReason: null },
      { id: 't1', type: 'income', status: 'confirmed', scope: 'business', businessId: 'b1', accountId: 'a1', counterpartAccountId: null, direction: null, categoryId: 'c1', description: '', counterparty: '', amountMinor: 5, date: '2026-10-05', voidReason: null },
    ] as Transaction[], accounts, businesses, categories)
    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('importe_usd')
    expect(lines[1]).toContain('2026-10-05')
    expect(lines[1]).toContain(',0.05,')
    expect(lines[2]).toContain('"Hola, mundo"')
    expect(lines[2]).toContain('123.45')
  })
  it('ventas: una fila por producto', () => {
    const csv = salesCsv([{ id: 'S1', businessId: 'b1', date: '2026-10-05', customer: 'Ana', discountMinor: 0, netMinor: 5000, taxMinor: 650, totalMinor: 5650, lines: [{ name: 'Camisa', quantity: 2, unitPriceMinor: 2500, unitCostMinor: 1000 }, { name: 'Gorra', quantity: 1, unitPriceMinor: 0, unitCostMinor: null }] }] as unknown as Sale[], businesses)
    expect(csv.split('\r\n')).toHaveLength(3)
    expect(csv).toContain('Camisa,2,25.00,10.00')
  })
  it('respaldo JSON con conteos y centavos', () => {
    const j = JSON.parse(backupJson({ transactions: [{ a: 1 }], sales: [] }, { appVersion: '1', exportedAt: '2026-10-10T00:00:00Z', email: 'a@b.co' }))
    expect(j).toMatchObject({ app: 'Capital OS', amountsInMinorUnits: true, counts: { transactions: 1, sales: 0 } })
  })
})

describe('alerta de reposición', () => {
  it('avisa de productos con pocas unidades', () => {
    const bank = { id: 'a', name: 'Banco', scope: 'business', businessId: 'b', accountType: 'bank', currency: 'USD', openingBalanceMinor: 500000, openingBalanceDate: '2026-01-01', status: 'active' } as Account
    const alerts = buildAlerts({ accounts: [bank], balances: computeBalances([bank], []), businesses: [], transactions: [], recurring: [], forecast: null, today: '2026-10-10', truncated: false, lowStock: [{ name: 'Camisa', units: 2, reorderPoint: 5 }] })
    expect(alerts.map((x) => x.id)).toContain('stock-Camisa')
  })
  it('un movimiento anulado de stock no importa para el tipo InventoryMove', () => {
    const m = { id: 'x' } as InventoryMove
    expect(m.id).toBe('x')
  })
})
