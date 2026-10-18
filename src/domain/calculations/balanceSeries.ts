import type { Account, Transaction } from '../types/ledger'
import { addDays } from './dates'
import { cashDelta } from './transactionRules'

export interface BalanceSplit { cashMinor: number; investedMinor: number; totalMinor: number }

/**
 * Saldos a una fecha: saldo inicial (si la cuenta ya existía ese día) + movimientos confirmados hasta esa fecha.
 * Misma regla que el saldo actual: lo anterior al saldo inicial no cuenta. Solo cuentas activas.
 */
export function balancesAsOf(accounts: readonly Account[], txs: readonly Transaction[], asOf: string): BalanceSplit {
  const acc = new Map(accounts.filter((a) => a.status === 'active').map((a) => [a.id, a]))
  const sums = new Map<string, number>()
  for (const t of txs) {
    const a = acc.get(t.accountId)
    if (!a || t.date > asOf || t.date < a.openingBalanceDate) continue
    const d = cashDelta(t)
    if (d !== 0) sums.set(a.id, (sums.get(a.id) ?? 0) + d)
  }
  let cash = 0
  let invested = 0
  for (const a of acc.values()) {
    if (a.openingBalanceDate > asOf) continue
    const bal = a.openingBalanceMinor + (sums.get(a.id) ?? 0)
    if (a.accountType === 'investment') invested += bal
    else cash += bal
  }
  return { cashMinor: cash, investedMinor: invested, totalMinor: cash + invested }
}

/** Evolución del balance total día a día (para la mini gráfica del panel). */
export function totalBalanceSeries(accounts: readonly Account[], txs: readonly Transaction[], today: string, days: number): { date: string; totalMinor: number }[] {
  const out: { date: string; totalMinor: number }[] = []
  for (let i = days; i >= 0; i--) {
    const date = addDays(today, -i)
    out.push({ date, totalMinor: balancesAsOf(accounts, txs, date).totalMinor })
  }
  return out
}
