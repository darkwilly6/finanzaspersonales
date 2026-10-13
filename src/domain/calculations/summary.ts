import type { Transaction } from '../types/ledger'
import { TYPE_RULES, cashDelta } from './transactionRules'

export interface LedgerSummary {
  /** Ingresos operativos cobrados (tipo ingreso, sin retiros de trading). */
  income: number
  /** Devoluciones a clientes: restan de ingresos, no suman como gasto. */
  refunds: number
  /** Retiros recibidos de brokers o cuentas de fondeo (ingreso del negocio de trading, aparte de ventas). */
  tradingWithdrawals: number
  /** Impuesto cobrado a clientes (a reservar): entra efectivo pero no es ingreso. */
  taxCollected: number
  /** Compras de mercancía pagadas: dinero que sale hacia inventario, no gasto. */
  inventoryPurchases: number
  /** Costo de lo vendido en el periodo (de las ventas, no de movimientos). Lo aplica applyCogs. */
  cogs: number
  cogsUnknownSales: number
  netIncome: number
  /** Gastos operativos pagados. */
  expenses: number
  /** Ingresos netos − gastos operativos − costo de lo vendido (si se aplicó). Base efectivo; no es el beneficio contable completo. */
  operatingResult: number
  ownerWithdrawals: number
  ownerSalary: number
  capitalContributions: number
  investments: number
  loansReceived: number
  loanPrincipalPaid: number
  taxesPaid: number
  adjustmentsNet: number
  /** Transferencias hacia/desde cuentas fuera del alcance filtrado que no tienen propósito especial. */
  transfersInOther: number
  transfersOutOther: number
  cashIn: number
  cashOut: number
  /** Entradas − salidas de efectivo, sin las transferencias internas (que se eliminan). */
  netCashFlow: number
  /** Cuántos lados de transferencia interna se eliminaron del consolidado y su importe (un lado). */
  eliminatedTransferSides: number
}

const zero = (): LedgerSummary => ({
  income: 0, refunds: 0, tradingWithdrawals: 0, taxCollected: 0, inventoryPurchases: 0, cogs: 0, cogsUnknownSales: 0, netIncome: 0, expenses: 0, operatingResult: 0,
  ownerWithdrawals: 0, ownerSalary: 0, capitalContributions: 0, investments: 0,
  loansReceived: 0, loanPrincipalPaid: 0, taxesPaid: 0, adjustmentsNet: 0,
  transfersInOther: 0, transfersOutOther: 0,
  cashIn: 0, cashOut: 0, netCashFlow: 0, eliminatedTransferSides: 0,
})

/**
 * Resume movimientos YA FILTRADOS por periodo y ámbito.
 * @param scopeAccountIds cuentas incluidas en el ámbito seleccionado (null = todas).
 *   Una transferencia es interna —y se elimina— solo si su contraparte también está en el ámbito.
 *   Si la contraparte queda fuera (p. ej. retiro de un negocio hacia tu cuenta personal viendo solo ese negocio),
 *   el lado visible se reporta según su propósito: no se esconde dinero que sale del ámbito.
 * Solo cuentan movimientos que afectan efectivo (confirmados/conciliados).
 */
export function summarize(txs: readonly Transaction[], scopeAccountIds: ReadonlySet<string> | null): LedgerSummary {
  const s = zero()
  for (const t of txs) {
    const delta = cashDelta(t)
    if (delta === 0) continue

    if (t.type === 'transfer') {
      const internal = t.counterpartAccountId !== null && (scopeAccountIds === null || scopeAccountIds.has(t.counterpartAccountId))
      if (internal) {
        s.eliminatedTransferSides += 1
        continue
      }
      const amount = Math.abs(delta)
      switch (t.transferPurpose) {
        case 'owner_withdrawal': s.ownerWithdrawals += delta < 0 ? amount : -amount; break
        case 'salary': s.ownerSalary += delta < 0 ? amount : -amount; break
        case 'capital_contribution': s.capitalContributions += delta > 0 ? amount : -amount; break
        case 'investment_deposit': s.investments += delta < 0 ? amount : -amount; break
        default:
          if (delta > 0) s.transfersInOther += amount
          else s.transfersOutOther += amount
      }
    } else {
      const amount = Math.abs(delta)
      switch (t.type) {
        case 'income': s.income += amount; break
        case 'refund': s.refunds += amount; break
        case 'trading_withdrawal': s.tradingWithdrawals += amount; break
        case 'tax_collected': s.taxCollected += amount; break
        case 'inventory_purchase': s.inventoryPurchases += amount; break
        case 'expense': s.expenses += amount; break
        case 'owner_withdrawal': s.ownerWithdrawals += amount; break
        case 'salary_payment': s.ownerSalary += amount; break
        case 'capital_contribution': s.capitalContributions += amount; break
        case 'investment': s.investments += amount; break
        case 'loan_received': s.loansReceived += amount; break
        case 'loan_payment': s.loanPrincipalPaid += amount; break
        case 'tax_payment': s.taxesPaid += amount; break
        case 'adjustment': s.adjustmentsNet += delta; break
      }
    }
    if (delta > 0) s.cashIn += delta
    else s.cashOut += -delta
  }
  s.netIncome = s.income + s.tradingWithdrawals - s.refunds
  s.operatingResult = s.netIncome - s.expenses
  s.netCashFlow = s.cashIn - s.cashOut
  return s
}

/** Comprobación: el tipo y su regla pnl coinciden con lo que suma el resumen (usado en pruebas). */
export const PNL_TYPES = (Object.keys(TYPE_RULES) as (keyof typeof TYPE_RULES)[]).filter((k) => TYPE_RULES[k].pnl !== 'none')
