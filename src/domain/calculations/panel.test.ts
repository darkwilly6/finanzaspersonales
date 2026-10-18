import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from '../types/ledger'
import { balancesAsOf, totalBalanceSeries } from './balanceSeries'
import { pickSuggestion } from './suggestion'
import { summarize } from './summary'
import { computeBalances } from './transactionRules'
import { normalize, searchApp, type SearchData } from '../search'

const acc = (id: string, opening: number, date = '2026-01-01', type: Account['accountType'] = 'bank', status: Account['status'] = 'active'): Account => ({
  id, name: id, scope: 'business', businessId: 'b', accountType: type, currency: 'USD', openingBalanceMinor: opening, openingBalanceDate: date, status,
})
let n = 0
const tx = (p: Partial<Transaction> & Pick<Transaction, 'type' | 'accountId' | 'amountMinor' | 'date'>): Transaction => ({
  id: `t${++n}`, scope: 'business', businessId: 'b', counterpartAccountId: null, transferId: null, transferPurpose: null, direction: null,
  currency: 'USD', categoryId: null, status: 'confirmed', description: '', counterparty: '', voidedAt: null, voidReason: null, createdAt: null, updatedAt: null, ...p,
})

describe('balances a una fecha', () => {
  const accounts = [acc('bank', 100000), acc('inv', 50000, '2026-01-01', 'investment'), acc('late', 7000, '2026-10-05')]
  const txs = [
    tx({ type: 'income', accountId: 'bank', amountMinor: 20000, date: '2026-09-10' }),
    tx({ type: 'expense', accountId: 'bank', amountMinor: 5000, date: '2026-10-08' }),
    tx({ type: 'income', accountId: 'bank', amountMinor: 999, date: '2026-10-09', status: 'cancelled' }),
    tx({ type: 'income', accountId: 'late', amountMinor: 1000, date: '2026-10-01' }),
  ]
  it('separa efectivo e inversión y respeta la fecha', () => {
    expect(balancesAsOf(accounts, txs, '2026-09-30')).toEqual({ cashMinor: 120000, investedMinor: 50000, totalMinor: 170000 })
    expect(balancesAsOf(accounts, txs, '2026-10-10')).toEqual({ cashMinor: 115000 + 7000, investedMinor: 50000, totalMinor: 172000 })
  })
  it('una cuenta no cuenta antes de su fecha de saldo inicial ni los movimientos anteriores a ella', () => {
    expect(balancesAsOf(accounts, txs, '2026-10-04').cashMinor).toBe(120000)
  })
  it('coincide con el saldo actual que calcula la app', () => {
    const now = balancesAsOf(accounts, txs, '2026-12-31')
    const cur = computeBalances(accounts, txs)
    const cash = ['bank', 'late'].reduce((s, id) => s + cur.get(id)!.balanceMinor, 0)
    expect(now.cashMinor).toBe(cash)
  })
  it('ignora cuentas archivadas', () => {
    expect(balancesAsOf([acc('x', 999, '2026-01-01', 'bank', 'archived')], [], '2026-10-10').totalMinor).toBe(0)
  })
  it('la serie diaria tiene un punto por día, incluido hoy, y termina en el saldo actual', () => {
    const s = totalBalanceSeries(accounts, txs, '2026-10-10', 30)
    expect(s).toHaveLength(31)
    expect(s.at(-1)).toEqual({ date: '2026-10-10', totalMinor: 172000 })
    expect(s[0]!.date).toBe('2026-09-10')
  })
})

describe('gastos de negocio y personales', () => {
  it('se separan por el ámbito de la cuenta y suman el total', () => {
    const s = summarize([
      tx({ type: 'expense', accountId: 'bank', amountMinor: 3000, date: '2026-10-01' }),
      tx({ type: 'expense', accountId: 'p', amountMinor: 1200, date: '2026-10-02', scope: 'personal', businessId: null }),
    ], null)
    expect(s.expensesBusiness).toBe(3000)
    expect(s.expensesPersonal).toBe(1200)
    expect(s.expenses).toBe(4200)
  })
})

describe('sugerencia del panel', () => {
  it('elige el negocio con más reinversión y nada si no hay', () => {
    expect(pickSuggestion([{ businessId: 'a', name: 'A', reinvestMinor: 100 }, { businessId: 'b', name: 'B', reinvestMinor: 900 }])).toMatchObject({ businessId: 'b' })
    expect(pickSuggestion([{ businessId: 'a', name: 'A', reinvestMinor: 0 }])).toBeNull()
    expect(pickSuggestion([])).toBeNull()
  })
  it('en empate decide por nombre, siempre igual', () => {
    expect(pickSuggestion([{ businessId: 'z', name: 'Zeta', reinvestMinor: 5 }, { businessId: 'a', name: 'Alfa', reinvestMinor: 5 }])!.name).toBe('Alfa')
  })
})

describe('búsqueda global', () => {
  const data: SearchData = {
    pages: [{ id: 'categorias', label: 'Categorías', path: '/categorias' }, { id: 'ventas', label: 'Ventas', path: '/ventas' }],
    businesses: [{ id: 'b1', name: 'NYXAR' }],
    accounts: [{ id: 'a1', name: 'Banco Cuscatlán' }],
    products: [{ id: 'p1', name: 'Camisa negra', sku: 'CN-1' }],
    categories: [{ id: 'c1', name: 'Publicidad' }],
    transactions: [{ id: 't1', description: 'Pago de internet', counterparty: 'Tigo', date: '2026-10-10' }],
    sales: [{ id: 's1', customer: 'Ana Pérez', date: '2026-10-02' }],
    tasks: [{ id: 'k1', title: 'Pagar impuestos' }],
    goals: [{ id: 'g1', name: 'Meta NXR' }],
  }
  it('ignora mayúsculas y acentos', () => {
    expect(normalize('  CATEGORÍAS ')).toBe('categorias')
    expect(searchApp('categoria', data)[0]).toMatchObject({ label: 'Categorías', to: '/categorias' })
    expect(searchApp('cuscatlan', data)[0]).toMatchObject({ label: 'Banco Cuscatlán', to: '/cuentas' })
    expect(searchApp('ana perez', data)[0]).toMatchObject({ to: '/ventas' })
    expect(searchApp('perez ana', data)).toHaveLength(0) // el orden de las palabras importa: no se inventan coincidencias
    expect(searchApp('perez', data)[0]).toMatchObject({ to: '/ventas' })
  })
  it('encuentra por SKU, contraparte y rutas correctas', () => {
    expect(searchApp('cn-1', data)[0]).toMatchObject({ label: 'Camisa negra', to: '/inventario' })
    expect(searchApp('tigo', data)[0]).toMatchObject({ to: '/movimientos' })
    expect(searchApp('nyx', data)[0]).toMatchObject({ to: '/negocios/b1' })
    expect(searchApp('imp', data)[0]).toMatchObject({ to: '/alertas' })
  })
  it('vacío no devuelve nada y respeta el límite', () => {
    expect(searchApp('', data)).toEqual([])
    expect(searchApp('a', data, 3).length).toBeLessThanOrEqual(3)
  })
})
