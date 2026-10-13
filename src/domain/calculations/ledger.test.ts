import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from '../types/ledger'
import { computeBalances, cashDelta } from './transactionRules'
import { summarize } from './summary'
import { applyFilter, accountsInScope, DEFAULT_FILTER, resolvePeriod } from './filters'

const acc = (id: string, scope: 'personal' | 'business', businessId: string | null, opening = 0, type: Account['accountType'] = 'bank'): Account => ({
  id, name: id, scope, businessId, accountType: type, currency: 'USD', openingBalanceMinor: opening, openingBalanceDate: '2026-01-01', status: 'active',
})

let n = 0
const tx = (p: Partial<Transaction> & Pick<Transaction, 'type' | 'accountId' | 'amountMinor'>): Transaction => ({
  id: `t${++n}`, scope: 'business', businessId: 'b1', counterpartAccountId: null, transferId: null, transferPurpose: null, direction: null,
  date: '2026-10-05', currency: 'USD', categoryId: null, status: 'confirmed', description: '', counterparty: '',
  voidedAt: null, voidReason: null, createdAt: null, updatedAt: null, ...p,
})

const transfer = (from: string, to: string, amountMinor: number, purpose: Transaction['transferPurpose'] = 'internal', extra: Partial<Transaction> = {}): Transaction[] => {
  const id = `tr${++n}`
  return [
    tx({ id: `${id}_out`, type: 'transfer', accountId: from, counterpartAccountId: to, transferId: id, transferPurpose: purpose, direction: 'out', amountMinor, ...extra }),
    tx({ id: `${id}_in`, type: 'transfer', accountId: to, counterpartAccountId: from, transferId: id, transferPurpose: purpose, direction: 'in', amountMinor, ...extra }),
  ]
}

const A = acc('bizBank', 'business', 'b1', 100000)
const B = acc('bizCash', 'business', 'b1', 0, 'cash')
const P = acc('personal', 'personal', null, 50000)
const accounts = [A, B, P]
const all = new Set(accounts.map((a) => a.id))

describe('saldos', () => {
  it('saldo = saldo inicial + movimientos confirmados', () => {
    const txs = [tx({ type: 'income', accountId: 'bizBank', amountMinor: 25000 }), tx({ type: 'expense', accountId: 'bizBank', amountMinor: 4000 })]
    expect(computeBalances(accounts, txs).get('bizBank')!.balanceMinor).toBe(121000)
  })
  it('los movimientos planificados, pendientes y anulados no alteran el efectivo real', () => {
    const txs = (['planned', 'pending', 'cancelled'] as const).map((status) => tx({ type: 'income', accountId: 'bizBank', amountMinor: 99900, status }))
    expect(computeBalances(accounts, txs).get('bizBank')!.balanceMinor).toBe(100000)
    expect(txs.every((t) => cashDelta(t) === 0)).toBe(true)
  })
  it('no cuenta movimientos anteriores al saldo inicial y lo informa', () => {
    const old = tx({ type: 'income', accountId: 'bizBank', amountMinor: 1000, date: '2025-12-31' })
    const b = computeBalances(accounts, [old]).get('bizBank')!
    expect(b.balanceMinor).toBe(100000)
    expect(b.ignoredBeforeOpening).toBe(1)
  })
  it('una transferencia baja una cuenta y sube la otra', () => {
    const b = computeBalances(accounts, transfer('bizBank', 'bizCash', 30000))
    expect(b.get('bizBank')!.balanceMinor).toBe(70000)
    expect(b.get('bizCash')!.balanceMinor).toBe(30000)
  })
  it('anular ambos lados de una transferencia devuelve los saldos originales', () => {
    const b = computeBalances(accounts, transfer('bizBank', 'bizCash', 30000, 'internal', { status: 'cancelled' }))
    expect(b.get('bizBank')!.balanceMinor).toBe(100000)
    expect(b.get('bizCash')!.balanceMinor).toBe(0)
  })
  it('un ajuste respeta su dirección', () => {
    const t = tx({ type: 'adjustment', accountId: 'bizBank', amountMinor: 500, direction: 'out' })
    expect(computeBalances(accounts, [t]).get('bizBank')!.balanceMinor).toBe(99500)
  })
})

describe('doble conteo en el consolidado', () => {
  it('una transferencia entre cuentas propias no crea ingreso ni gasto y el flujo neto es cero', () => {
    const s = summarize(transfer('bizBank', 'bizCash', 30000), all)
    expect(s.income).toBe(0)
    expect(s.expenses).toBe(0)
    expect(s.cashIn).toBe(0)
    expect(s.cashOut).toBe(0)
    expect(s.netCashFlow).toBe(0)
    expect(s.eliminatedTransferSides).toBe(2)
  })

  it('retiro del negocio a cuenta personal: en el consolidado se elimina; no es ingreso personal ni gasto del negocio', () => {
    const s = summarize(transfer('bizBank', 'personal', 20000, 'owner_withdrawal', { scope: 'business' }), all)
    expect(s.netCashFlow).toBe(0)
    expect(s.income).toBe(0)
    expect(s.expenses).toBe(0)
    expect(s.ownerWithdrawals).toBe(0)
  })

  it('viendo solo el negocio, el retiro SÍ aparece como salida del ámbito (no se esconde dinero)', () => {
    const txs = transfer('bizBank', 'personal', 20000, 'owner_withdrawal')
    const bizScope = new Set(['bizBank', 'bizCash'])
    const s = summarize(txs.filter((t) => bizScope.has(t.accountId)), bizScope)
    expect(s.ownerWithdrawals).toBe(20000)
    expect(s.expenses).toBe(0)
    expect(s.cashOut).toBe(20000)
    expect(s.operatingResult).toBe(0)
  })

  it('viendo solo lo personal, el mismo retiro aparece como entrada pero no como ingreso externo', () => {
    const txs = transfer('bizBank', 'personal', 20000, 'owner_withdrawal')
    const pScope = new Set(['personal'])
    const s = summarize(txs.filter((t) => pScope.has(t.accountId)), pScope)
    expect(s.income).toBe(0)
    expect(s.ownerWithdrawals).toBe(-20000)
    expect(s.cashIn).toBe(20000)
  })

  it('invariante: flujo neto del consolidado = cambio de saldos, con mezcla de movimientos', () => {
    const txs = [
      tx({ type: 'income', accountId: 'bizBank', amountMinor: 80000 }),
      tx({ type: 'expense', accountId: 'bizBank', amountMinor: 15000 }),
      tx({ type: 'refund', accountId: 'bizBank', amountMinor: 5000 }),
      tx({ type: 'capital_contribution', accountId: 'bizBank', amountMinor: 10000 }),
      tx({ type: 'loan_received', accountId: 'bizBank', amountMinor: 40000 }),
      tx({ type: 'loan_payment', accountId: 'bizBank', amountMinor: 7000 }),
      tx({ type: 'investment', accountId: 'bizBank', amountMinor: 12000 }),
      tx({ type: 'tax_payment', accountId: 'bizBank', amountMinor: 3000 }),
      tx({ type: 'adjustment', accountId: 'bizBank', amountMinor: 200, direction: 'in' }),
      tx({ type: 'income', accountId: 'bizBank', amountMinor: 9999, status: 'planned' }),
      ...transfer('bizBank', 'bizCash', 20000),
      ...transfer('bizBank', 'personal', 11000, 'owner_withdrawal'),
      ...transfer('personal', 'bizCash', 4000, 'capital_contribution'),
    ]
    const before = computeBalances(accounts, [])
    const after = computeBalances(accounts, txs)
    const delta = accounts.reduce((acc2, a) => acc2 + after.get(a.id)!.balanceMinor - before.get(a.id)!.balanceMinor, 0)
    expect(summarize(txs, all).netCashFlow).toBe(delta)
  })

  it('invariante por ámbito: flujo neto del negocio = cambio de sus saldos aunque haya transferencias hacia fuera', () => {
    const txs = [
      tx({ type: 'income', accountId: 'bizBank', amountMinor: 50000 }),
      ...transfer('bizBank', 'bizCash', 10000),
      ...transfer('bizBank', 'personal', 7000, 'salary'),
    ]
    const bizAccounts = accounts.filter((a) => a.businessId === 'b1')
    const ids = new Set(bizAccounts.map((a) => a.id))
    const scoped = txs.filter((t) => ids.has(t.accountId))
    const before = computeBalances(accounts, [])
    const after = computeBalances(accounts, txs)
    const delta = bizAccounts.reduce((s, a) => s + after.get(a.id)!.balanceMinor - before.get(a.id)!.balanceMinor, 0)
    expect(summarize(scoped, ids).netCashFlow).toBe(delta)
  })
})

describe('tratamiento de tipos', () => {
  it('aporte de capital, préstamo e inversión no son ingreso ni gasto', () => {
    const s = summarize([
      tx({ type: 'capital_contribution', accountId: 'bizBank', amountMinor: 100000 }),
      tx({ type: 'loan_received', accountId: 'bizBank', amountMinor: 50000 }),
      tx({ type: 'investment', accountId: 'bizBank', amountMinor: 30000 }),
      tx({ type: 'owner_withdrawal', accountId: 'bizBank', amountMinor: 10000 }),
      tx({ type: 'salary_payment', accountId: 'bizBank', amountMinor: 20000 }),
      tx({ type: 'loan_payment', accountId: 'bizBank', amountMinor: 5000 }),
      tx({ type: 'tax_payment', accountId: 'bizBank', amountMinor: 2000 }),
    ], all)
    expect(s.income).toBe(0)
    expect(s.expenses).toBe(0)
    expect(s.operatingResult).toBe(0)
    expect(s.netCashFlow).toBe(100000 + 50000 - 30000 - 10000 - 20000 - 5000 - 2000)
  })
  it('una devolución reduce los ingresos netos y no suma como gasto', () => {
    const s = summarize([tx({ type: 'income', accountId: 'bizBank', amountMinor: 10000 }), tx({ type: 'refund', accountId: 'bizBank', amountMinor: 2500 })], all)
    expect(s.income).toBe(10000)
    expect(s.refunds).toBe(2500)
    expect(s.netIncome).toBe(7500)
    expect(s.expenses).toBe(0)
  })
  it('no suma planificados ni pendientes', () => {
    const s = summarize([tx({ type: 'income', accountId: 'bizBank', amountMinor: 10000, status: 'pending' }), tx({ type: 'expense', accountId: 'bizBank', amountMinor: 500, status: 'planned' })], all)
    expect(s.cashIn + s.cashOut).toBe(0)
  })
  it('resumen vacío devuelve ceros, nunca NaN', () => {
    const s = summarize([], all)
    expect(Object.values(s).every((v) => Number.isFinite(v))).toBe(true)
  })
})

describe('filtros', () => {
  const txs = [
    tx({ type: 'income', accountId: 'bizBank', amountMinor: 100, date: '2026-10-02', categoryId: 'c1' }),
    tx({ type: 'expense', accountId: 'personal', amountMinor: 200, date: '2026-09-30', scope: 'personal', businessId: null }),
    tx({ type: 'expense', accountId: 'bizCash', amountMinor: 300, date: '2026-10-09', status: 'cancelled' }),
  ]
  const today = '2026-10-10'
  it('mes actual y ámbito consolidado; excluye anulados por defecto', () => {
    expect(applyFilter(txs, accounts, DEFAULT_FILTER, today).map((t) => t.accountId)).toEqual(['bizBank'])
  })
  it('ámbito personal / negocio', () => {
    expect(applyFilter(txs, accounts, { ...DEFAULT_FILTER, period: 'all', scopes: ['personal'] }, today)).toHaveLength(1)
    expect(applyFilter(txs, accounts, { ...DEFAULT_FILTER, period: 'all', scopes: ['b1'] }, today)).toHaveLength(1)
    expect(accountsInScope(accounts, ['b1']).map((a) => a.id)).toEqual(['bizBank', 'bizCash'])
  })
  it('filtra por estado anulado, categoría y tipo', () => {
    expect(applyFilter(txs, accounts, { ...DEFAULT_FILTER, period: 'all', status: 'cancelled' }, today)).toHaveLength(1)
    expect(applyFilter(txs, accounts, { ...DEFAULT_FILTER, period: 'all', categoryId: 'c1' }, today)).toHaveLength(1)
    expect(applyFilter(txs, accounts, { ...DEFAULT_FILTER, period: 'all', type: 'expense' }, today)).toHaveLength(1)
  })
  it('rangos de periodo sin errores de fin de mes', () => {
    expect(resolvePeriod({ ...DEFAULT_FILTER, period: 'lastMonth' }, '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(resolvePeriod({ ...DEFAULT_FILTER, period: 'thisMonth' }, '2024-02-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(resolvePeriod({ ...DEFAULT_FILTER, period: 'last7' }, '2026-10-10')).toEqual({ from: '2026-10-04', to: '2026-10-10' })
    expect(resolvePeriod({ ...DEFAULT_FILTER, period: 'all' }, '2026-10-10')).toBeNull()
  })
})

import { totalsByKind } from './transactionRules'
describe('totales por tipo de cuenta', () => {
  it('separa efectivo disponible de capital en cuentas de inversión y omite archivadas', () => {
    const inv = acc('inv', 'business', 'b1', 70000, 'investment')
    const arch = { ...acc('old', 'business', 'b1', 99999), status: 'archived' as const }
    const list = [A, B, P, inv, arch]
    const t = totalsByKind(list, computeBalances(list, []))
    expect(t.cashMinor).toBe(100000 + 0 + 50000)
    expect(t.investedMinor).toBe(70000)
  })
})
