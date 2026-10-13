import { describe, expect, it } from 'vitest'
import { computeAllocation, policyIsValid, splitByBps } from './allocation'
import { summarize } from './summary'
import { categoryBreakdown, TRADING_KEY } from './analytics'
import type { Transaction } from '../types/ledger'

const policy = { reserveBps: 2000, reinvestBps: 3000, ownerBps: 5000 }

describe('reparto de ganancias', () => {
  it('reparte según tus porcentajes cuando hay base y excedente suficientes', () => {
    const r = computeAllocation({ baseMinor: 100000, policy, cashNowMinor: 300000, minReserveMinor: 100000, upcomingOutflowsMinor: 50000 })
    expect(r).toMatchObject({ reason: 'ok', surplusMinor: 150000, allocatableMinor: 100000, ownerMinor: 50000, reinvestMinor: 30000, reserveMinor: 20000, heldBackMinor: 0 })
  })
  it('no reparte más que el excedente: respeta reserva mínima y pagos que vienen', () => {
    const r = computeAllocation({ baseMinor: 100000, policy, cashNowMinor: 180000, minReserveMinor: 100000, upcomingOutflowsMinor: 50000 })
    expect(r.surplusMinor).toBe(30000)
    expect(r.allocatableMinor).toBe(30000)
    expect(r.ownerMinor + r.reinvestMinor + r.reserveMinor).toBe(30000)
    expect(r.heldBackMinor).toBe(70000)
  })
  it('si el efectivo no cubre reserva y obligaciones, no se reparte nada', () => {
    const r = computeAllocation({ baseMinor: 100000, policy, cashNowMinor: 120000, minReserveMinor: 100000, upcomingOutflowsMinor: 50000 })
    expect(r).toMatchObject({ reason: 'no_surplus', ownerMinor: 0, allocatableMinor: 0, heldBackMinor: 100000 })
  })
  it('sin ganancia en el periodo no hay nada que repartir', () => {
    expect(computeAllocation({ baseMinor: 0, policy, cashNowMinor: 1e6, minReserveMinor: 0, upcomingOutflowsMinor: 0 }).reason).toBe('no_profit')
    expect(computeAllocation({ baseMinor: -5000, policy, cashNowMinor: 1e6, minReserveMinor: 0, upcomingOutflowsMinor: 0 })).toMatchObject({ reason: 'no_profit', ownerMinor: 0, heldBackMinor: 0 })
  })
  it('sin porcentajes definidos no inventa un reparto, pero sí informa el excedente', () => {
    const r = computeAllocation({ baseMinor: 100000, policy: null, cashNowMinor: 300000, minReserveMinor: 100000, upcomingOutflowsMinor: 0 })
    expect(r).toMatchObject({ reason: 'no_policy', allocatableMinor: 100000, ownerMinor: 0 })
    expect(computeAllocation({ baseMinor: 1000, policy: { reserveBps: 1000, reinvestBps: 1000, ownerBps: 1000 }, cashNowMinor: 1e6, minReserveMinor: 0, upcomingOutflowsMinor: 0 }).reason).toBe('no_policy')
  })
  it('el reparto suma exactamente lo repartible (sin perder centavos)', () => {
    for (const total of [1, 2, 3, 7, 99, 100001, 123457, 999999]) {
      const parts = splitByBps(total, [3333, 3333, 3334])
      expect(parts.reduce((s, v) => s + v, 0)).toBe(total)
      expect(parts.every((p) => p >= 0)).toBe(true)
    }
    const r = computeAllocation({ baseMinor: 100001, policy: { ownerBps: 3333, reinvestBps: 3333, reserveBps: 3334 }, cashNowMinor: 1e6, minReserveMinor: 0, upcomingOutflowsMinor: 0 })
    expect(r.ownerMinor + r.reinvestMinor + r.reserveMinor).toBe(100001)
  })
  it('valida políticas: deben sumar 100 %', () => {
    expect(policyIsValid(policy)).toBe(true)
    expect(policyIsValid({ reserveBps: 5000, reinvestBps: 5000, ownerBps: 1 })).toBe(false)
    expect(policyIsValid(null)).toBe(false)
  })
})

let n = 0
const tx = (p: Partial<Transaction> & Pick<Transaction, 'type' | 'amountMinor'>): Transaction => ({
  id: `t${++n}`, scope: 'business', businessId: 'b1', accountId: 'a', counterpartAccountId: null, transferId: null, transferPurpose: null, direction: null,
  date: '2026-10-05', currency: 'USD', categoryId: null, status: 'confirmed', description: '', counterparty: '', voidedAt: null, voidReason: null, createdAt: null, updatedAt: null, ...p,
})

describe('trading en el resumen', () => {
  it('los retiros son ingreso aparte de las ventas; depósitos y fondeo no se mezclan', () => {
    const s = summarize([
      tx({ type: 'trading_withdrawal', amountMinor: 80000 }),
      tx({ type: 'income', amountMinor: 10000 }),
      tx({ type: 'investment', amountMinor: 50000 }),
      tx({ type: 'expense', amountMinor: 15000 }),
    ], null)
    expect(s.tradingWithdrawals).toBe(80000)
    expect(s.income).toBe(10000)
    expect(s.netIncome).toBe(90000)
    expect(s.investments).toBe(50000)
    expect(s.expenses).toBe(15000)
    expect(s.operatingResult).toBe(75000)
    expect(s.netCashFlow).toBe(80000 + 10000 - 50000 - 15000)
  })
  it('un retiro planificado no cuenta hasta confirmarse', () => {
    expect(summarize([tx({ type: 'trading_withdrawal', amountMinor: 5000, status: 'planned' })], null).tradingWithdrawals).toBe(0)
  })
  it('aparece como "Retiros de trading" en el origen del dinero', () => {
    const slices = categoryBreakdown([tx({ type: 'trading_withdrawal', amountMinor: 8000 }), tx({ type: 'income', amountMinor: 2000 })], [], 'income')
    expect(slices[0]).toMatchObject({ categoryId: TRADING_KEY, name: 'Retiros de trading', totalMinor: 8000, share: 0.8 })
  })
})
