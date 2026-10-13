import type { Account, Recurring, Transaction } from '../types/ledger'
import { addDays } from './dates'
import { occurrencesBetween } from './recurrence'
import { cashDelta } from './transactionRules'

export interface ForecastItem {
  date: string
  label: string
  deltaMinor: number
  source: 'planned' | 'pending' | 'recurring'
  accountId: string
  txId?: string
  recurringId?: string
  overdue?: boolean
  /** Las transferencias entre cuentas propias no son obligaciones de pago. */
  isTransfer?: boolean
}

export interface ForecastPoint { date: string; balanceMinor: number }

export interface ForecastResult {
  startMinor: number
  points: ForecastPoint[]
  minMinor: number
  minDate: string
  firstNegativeDate: string | null
  expectedInMinor: number
  expectedOutMinor: number
  /** Salidas esperadas que son pagos reales (excluye transferencias entre tus cuentas). */
  obligationsMinor: number
  items: ForecastItem[]
}

/**
 * Proyección del efectivo: saldo actual + lo planificado/pendiente + pagos fijos aún no generados.
 * - Solo cuentas incluidas (el llamador pasa las de efectivo activas del ámbito).
 * - Lo vencido y sin confirmar se espera "hoy": no desaparece del cálculo.
 * - Un pago fijo ya generado como movimiento no se cuenta dos veces.
 */
export function forecastCash(args: {
  accounts: readonly Account[]
  balanceOf: (accountId: string) => number
  transactions: readonly Transaction[]
  recurring: readonly Recurring[]
  today: string
  days: number
}): ForecastResult {
  const { accounts, balanceOf, transactions, recurring, today, days } = args
  const ids = new Set(accounts.map((a) => a.id))
  const end = addDays(today, days)
  const startMinor = accounts.reduce((s, a) => s + balanceOf(a.id), 0)
  const items: ForecastItem[] = []

  const covered = new Set<string>()
  for (const t of transactions) {
    if (t.recurringId) covered.add(`${t.recurringId}|${t.date}`)
    if (t.status !== 'planned' && t.status !== 'pending') continue
    if (!ids.has(t.accountId)) continue
    const delta = cashDelta({ ...t, status: 'confirmed' })
    if (delta === 0) continue
    const overdue = t.date < today
    const date = overdue ? today : t.date
    if (date > end) continue
    items.push({ date, label: t.description || t.counterparty || t.type, deltaMinor: delta, source: t.status, accountId: t.accountId, txId: t.id, overdue, isTransfer: t.type === 'transfer' })
  }

  for (const r of recurring) {
    if (!r.active || !ids.has(r.accountId)) continue
    for (const date of occurrencesBetween(r, addDays(today, 1), end)) {
      if (covered.has(`${r.id}|${date}`)) continue
      const sign = r.type === 'income' ? 1 : -1
      items.push({ date, label: r.name, deltaMinor: sign * r.amountMinor, source: 'recurring', accountId: r.accountId, recurringId: r.id })
    }
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const byDate = new Map<string, number>()
  let expectedIn = 0
  let expectedOut = 0
  let obligations = 0
  for (const it of items) {
    byDate.set(it.date, (byDate.get(it.date) ?? 0) + it.deltaMinor)
    if (it.deltaMinor > 0) expectedIn += it.deltaMinor
    else expectedOut += -it.deltaMinor
    if (it.deltaMinor < 0 && !it.isTransfer) obligations += -it.deltaMinor
  }

  const points: ForecastPoint[] = []
  let running = startMinor
  let minMinor = startMinor
  let minDate = today
  let firstNegativeDate: string | null = startMinor < 0 ? today : null
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i)
    running += byDate.get(date) ?? 0
    points.push({ date, balanceMinor: running })
    if (running < minMinor) { minMinor = running; minDate = date }
    if (running < 0 && firstNegativeDate === null) firstNegativeDate = date
  }
  return { startMinor, points, minMinor, minDate, firstNegativeDate, expectedInMinor: expectedIn, expectedOutMinor: expectedOut, obligationsMinor: obligations, items }
}
