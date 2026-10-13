import { describe, expect, it } from 'vitest'
import type { Account, Business, Category, Recurring, Transaction } from '../types/ledger'
import { addMonthsClamped, daysBetween } from './dates'
import { nextOccurrence, occurrencesBetween, plannedId } from './recurrence'
import { forecastCash } from './forecast'
import { businessComparison, categoryBreakdown, monthlySeries, percentChange, previousPeriod } from './analytics'
import { buildAlerts } from './alerts'
import { computeBalances } from './transactionRules'

const acc = (id: string, businessId: string | null, opening = 0, type: Account['accountType'] = 'bank'): Account => ({
  id, name: id, scope: businessId ? 'business' : 'personal', businessId, accountType: type, currency: 'USD', openingBalanceMinor: opening, openingBalanceDate: '2026-01-01', status: 'active',
})
let n = 0
const tx = (p: Partial<Transaction> & Pick<Transaction, 'type' | 'accountId' | 'amountMinor'>): Transaction => ({
  id: `t${++n}`, scope: 'business', businessId: 'b1', counterpartAccountId: null, transferId: null, transferPurpose: null, direction: null,
  date: '2026-10-05', currency: 'USD', categoryId: null, status: 'confirmed', description: '', counterparty: '', voidedAt: null, voidReason: null, createdAt: null, updatedAt: null, ...p,
})
const rec = (p: Partial<Recurring> = {}): Recurring => ({
  id: 'r1', name: 'Alquiler', type: 'expense', accountId: 'bank', scope: 'business', businessId: 'b1', amountMinor: 30000, frequency: 'monthly',
  startDate: '2026-01-31', endDate: null, categoryId: null, description: '', active: true, ...p,
})

describe('recurrencias', () => {
  it('mensual conserva el día ancla y ajusta fin de mes', () => {
    expect(occurrencesBetween(rec(), '2026-01-01', '2026-05-31')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'])
    expect(addMonthsClamped('2024-01-31', 1, 31)).toBe('2024-02-29')
  })
  it('semanal, cada 15 días y anual', () => {
    expect(occurrencesBetween(rec({ frequency: 'weekly', startDate: '2026-10-01' }), '2026-10-01', '2026-10-22')).toEqual(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'])
    expect(occurrencesBetween(rec({ frequency: 'every15', startDate: '2026-10-01' }), '2026-10-01', '2026-11-15')).toEqual(['2026-10-01', '2026-10-16', '2026-10-31', '2026-11-15'])
    expect(occurrencesBetween(rec({ frequency: 'yearly', startDate: '2024-02-29' }), '2024-01-01', '2026-12-31')).toEqual(['2024-02-29', '2025-02-28', '2026-02-28'])
  })
  it('respeta la fecha de fin y el rango pedido', () => {
    expect(occurrencesBetween(rec({ startDate: '2026-01-15', endDate: '2026-03-20' }), '2026-02-01', '2026-12-31')).toEqual(['2026-02-15', '2026-03-15'])
    expect(occurrencesBetween(rec({ startDate: '2026-06-01' }), '2026-01-01', '2026-05-31')).toEqual([])
  })
  it('próxima ocurrencia y id determinista', () => {
    expect(nextOccurrence(rec({ startDate: '2026-01-10' }), '2026-10-11')).toBe('2026-11-10')
    expect(nextOccurrence(rec({ startDate: '2026-01-10', endDate: '2026-02-01' }), '2026-10-11')).toBeNull()
    expect(plannedId('r1', '2026-11-10')).toBe('rec_r1_2026-11-10')
    expect(daysBetween('2026-10-01', '2026-10-11')).toBe(10)
  })
})

describe('proyección de caja', () => {
  const bank = acc('bank', 'b1', 100000)
  const balances = computeBalances([bank], [])
  const base = { accounts: [bank], balanceOf: (id: string) => balances.get(id)!.balanceMinor, today: '2026-10-10', days: 30 }

  it('sin nada planificado el saldo se mantiene', () => {
    const f = forecastCash({ ...base, transactions: [], recurring: [] })
    expect(f.points).toHaveLength(31)
    expect(f.points.every((p) => p.balanceMinor === 100000)).toBe(true)
    expect(f.firstNegativeDate).toBeNull()
  })
  it('suma planificados y pagos fijos aún no generados, en su fecha', () => {
    const f = forecastCash({
      ...base,
      transactions: [tx({ type: 'income', accountId: 'bank', amountMinor: 50000, status: 'planned', date: '2026-10-15' })],
      recurring: [rec({ startDate: '2026-10-20' })],
    })
    expect(f.points.find((p) => p.date === '2026-10-14')!.balanceMinor).toBe(100000)
    expect(f.points.find((p) => p.date === '2026-10-15')!.balanceMinor).toBe(150000)
    expect(f.points.find((p) => p.date === '2026-10-20')!.balanceMinor).toBe(120000)
    expect(f.expectedInMinor).toBe(50000)
    expect(f.expectedOutMinor).toBe(30000)
  })
  it('un pago fijo ya generado como movimiento no se cuenta dos veces', () => {
    const generated = tx({ id: plannedId('r1', '2026-10-20'), type: 'expense', accountId: 'bank', amountMinor: 30000, status: 'planned', date: '2026-10-20', recurringId: 'r1' })
    const f = forecastCash({ ...base, transactions: [generated], recurring: [rec({ startDate: '2026-10-20' })] })
    expect(f.points.at(-1)!.balanceMinor).toBe(70000)
    expect(f.items).toHaveLength(1)
  })
  it('lo vencido y sin confirmar se espera hoy', () => {
    const f = forecastCash({ ...base, transactions: [tx({ type: 'expense', accountId: 'bank', amountMinor: 10000, status: 'pending', date: '2026-10-01' })], recurring: [] })
    expect(f.points[0]!.balanceMinor).toBe(90000)
    expect(f.items[0]!.overdue).toBe(true)
  })
  it('detecta el primer día en negativo y el mínimo', () => {
    const f = forecastCash({ ...base, transactions: [tx({ type: 'expense', accountId: 'bank', amountMinor: 130000, status: 'planned', date: '2026-10-18' }), tx({ type: 'income', accountId: 'bank', amountMinor: 60000, status: 'planned', date: '2026-10-25' })], recurring: [] })
    expect(f.firstNegativeDate).toBe('2026-10-18')
    expect(f.minMinor).toBe(-30000)
    expect(f.minDate).toBe('2026-10-18')
    expect(f.points.at(-1)!.balanceMinor).toBe(30000)
  })
  it('pausados, terminados y de otras cuentas no cuentan; las transferencias internas se anulan', () => {
    const other = acc('cash', 'b1', 0, 'cash')
    const bal2 = computeBalances([bank, other], [])
    const f = forecastCash({
      accounts: [bank, other], balanceOf: (id) => bal2.get(id)!.balanceMinor, today: '2026-10-10', days: 30,
      transactions: [
        tx({ id: 'o', type: 'transfer', accountId: 'bank', counterpartAccountId: 'cash', transferId: 'x', transferPurpose: 'internal', direction: 'out', amountMinor: 20000, status: 'planned', date: '2026-10-12' }),
        tx({ id: 'i', type: 'transfer', accountId: 'cash', counterpartAccountId: 'bank', transferId: 'x', transferPurpose: 'internal', direction: 'in', amountMinor: 20000, status: 'planned', date: '2026-10-12' }),
      ],
      recurring: [rec({ active: false, startDate: '2026-10-20' }), rec({ id: 'r2', accountId: 'elsewhere', startDate: '2026-10-20' })],
    })
    expect(f.points.at(-1)!.balanceMinor).toBe(100000)
  })
})

describe('analítica', () => {
  it('variación porcentual: null si no hay base de comparación', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(100, 0)).toBeNull()
    expect(percentChange(-50, -100)).toBe(50)
  })
  it('periodo anterior: mes calendario completo y rango arbitrario', () => {
    expect(previousPeriod('2026-03-01', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(previousPeriod('2026-10-04', '2026-10-10')).toEqual({ from: '2026-09-27', to: '2026-10-03' })
    expect(previousPeriod('0000-01-01', '2026-10-10')).toBeNull()
  })
  const ids = new Set(['bank', 'pb'])
  it('serie mensual agrupa por mes, ignora anulados y no cuenta transferencias', () => {
    const txs = [
      tx({ type: 'income', accountId: 'bank', amountMinor: 10000, date: '2026-09-10' }),
      tx({ type: 'expense', accountId: 'bank', amountMinor: 4000, date: '2026-09-11' }),
      tx({ type: 'income', accountId: 'bank', amountMinor: 20000, date: '2026-10-02' }),
      tx({ type: 'income', accountId: 'bank', amountMinor: 99999, date: '2026-10-03', status: 'cancelled' }),
      tx({ type: 'transfer', accountId: 'bank', counterpartAccountId: 'pb', transferId: 'z', transferPurpose: 'internal', direction: 'out', amountMinor: 5000, date: '2026-10-04' }),
      tx({ type: 'transfer', accountId: 'pb', counterpartAccountId: 'bank', transferId: 'z', transferPurpose: 'internal', direction: 'in', amountMinor: 5000, date: '2026-10-04' }),
    ]
    const s = monthlySeries(txs, ids, '2026-10-10', 3)
    expect(s.map((p) => p.month)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(s[0]).toMatchObject({ netIncomeMinor: 0, resultMinor: 0 })
    expect(s[1]).toMatchObject({ netIncomeMinor: 10000, expensesMinor: 4000, resultMinor: 6000 })
    expect(s[2]).toMatchObject({ netIncomeMinor: 20000, netCashFlowMinor: 20000 })
  })
  it('desglose por categoría con porcentaje; sin categoría aparece aparte; ingresos netos de devoluciones', () => {
    const cats: Category[] = [{ id: 'c1', name: 'Publicidad', kind: 'expense', scope: 'shared', businessId: null, color: '#f5c451', active: true }, { id: 'v', name: 'Ventas', kind: 'income', scope: 'shared', businessId: null, color: '#52d99a', active: true }]
    const txs = [
      tx({ type: 'expense', accountId: 'bank', amountMinor: 7500, categoryId: 'c1' }),
      tx({ type: 'expense', accountId: 'bank', amountMinor: 2500 }),
      tx({ type: 'income', accountId: 'bank', amountMinor: 10000, categoryId: 'v' }),
      tx({ type: 'refund', accountId: 'bank', amountMinor: 4000, categoryId: 'v' }),
      tx({ type: 'expense', accountId: 'bank', amountMinor: 1, status: 'planned' }),
    ]
    const exp = categoryBreakdown(txs, cats, 'expense')
    expect(exp.map((e) => [e.name, e.totalMinor, e.share])).toEqual([['Publicidad', 7500, 0.75], ['Sin categoría', 2500, 0.25]])
    expect(categoryBreakdown(txs, cats, 'income')).toMatchObject([{ name: 'Ventas', totalMinor: 6000, share: 1 }])
  })
  it('comparación entre negocios con margen; sin ingresos el margen es null', () => {
    const biz = (id: string, name: string): Business => ({ id, name } as Business)
    const accs = [acc('a1', 'b1'), acc('a2', 'b2')]
    const rows = businessComparison([biz('b1', 'Uno'), biz('b2', 'Dos')], accs, [
      tx({ type: 'income', accountId: 'a1', amountMinor: 10000 }), tx({ type: 'expense', accountId: 'a1', amountMinor: 2500 }),
      tx({ type: 'expense', accountId: 'a2', amountMinor: 1000 }),
    ])
    expect(rows[0]).toMatchObject({ name: 'Uno', marginPct: 75 })
    expect(rows[1]).toMatchObject({ name: 'Dos', marginPct: null })
    expect(rows[1]!.summary.operatingResult).toBe(-1000)
  })
})

describe('alertas', () => {
  const bank = acc('bank', 'b1', 5000)
  const business = { id: 'b1', name: 'NYXAR', status: 'active', reserve: { minReserveMinor: 20000 } } as Business
  const base = { accounts: [bank], businesses: [business], recurring: [], forecast: null, today: '2026-10-10', truncated: false }
  const run = (txs: Transaction[], extra: Partial<Parameters<typeof buildAlerts>[0]> = {}) => buildAlerts({ ...base, transactions: txs, balances: computeBalances([bank], txs), ...extra })

  it('reserva mínima, vencidos, próximos y sin categoría', () => {
    const txs = [
      tx({ type: 'expense', accountId: 'bank', amountMinor: 100, status: 'pending', date: '2026-10-01' }),
      tx({ type: 'income', accountId: 'bank', amountMinor: 100, status: 'planned', date: '2026-10-12' }),
      tx({ type: 'expense', accountId: 'bank', amountMinor: 100, categoryId: null }),
    ]
    const ids = run(txs).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['reserve-b1', 'overdue', 'soon', 'uncat']))
  })
  it('saldo negativo es crítico y va primero', () => {
    const txs = [tx({ type: 'expense', accountId: 'bank', amountMinor: 9000, categoryId: 'c' })]
    const alerts = run(txs)
    expect(alerts[0]).toMatchObject({ id: 'neg-bank', severity: 'critical' })
  })
  it('proyección negativa y pagos fijos sin generar', () => {
    const forecast = forecastCash({ accounts: [bank], balanceOf: () => 5000, transactions: [], recurring: [rec({ amountMinor: 9000, startDate: '2026-10-20' })], today: '2026-10-10', days: 30 })
    const ids = run([], { forecast, recurring: [rec({ amountMinor: 9000, startDate: '2026-10-20' })] }).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['forecast-neg', 'recurring']))
  })
  it('sin problemas no hay alertas', () => {
    const ok = acc('bank', 'b1', 500000)
    expect(buildAlerts({ ...base, accounts: [ok], transactions: [], balances: computeBalances([ok], []) })).toEqual([])
  })
})
