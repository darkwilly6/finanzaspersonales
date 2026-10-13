import type { Account, Direction, Transaction, TransactionStatus, TransactionType } from '../types/ledger'

/**
 * Tratamiento contable de cada tipo de movimiento. Es la ÚNICA fuente de verdad:
 * saldos, resúmenes, formularios y reglas leen de aquí.
 *
 * cash:   efecto sobre el efectivo de la cuenta
 * pnl:    cómo entra en el resultado operativo (ingresos / gastos). 'none' = no es ingreso ni gasto.
 */
export type CashEffect = 'in' | 'out' | 'by_direction'
export type PnlEffect = 'income' | 'expense' | 'contra_income' | 'none'

export interface TypeRule {
  label: string
  cash: CashEffect
  pnl: PnlEffect
  /** Qué ve la persona al elegir el tipo: explica el tratamiento en lenguaje simple. */
  help: string
  /** Exige cuenta de negocio (no tiene sentido en finanzas personales). */
  businessOnly?: boolean
  /** Categorías que admite: ingreso, gasto o ninguna. */
  categoryKind: 'income' | 'expense' | null
}

export const TYPE_RULES: Record<TransactionType, TypeRule> = {
  income: { label: 'Ingreso', cash: 'in', pnl: 'income', categoryKind: 'income', help: 'Entra dinero por una venta o un cobro. Cuenta como ingreso.' },
  expense: { label: 'Gasto', cash: 'out', pnl: 'expense', categoryKind: 'expense', help: 'Sale dinero por un gasto operativo. Cuenta como gasto.' },
  transfer: { label: 'Transferencia entre mis cuentas', cash: 'by_direction', pnl: 'none', categoryKind: null, help: 'Mueve dinero entre cuentas tuyas. No es ingreso ni gasto y no se duplica en la vista consolidada.' },
  capital_contribution: { label: 'Aporte de capital', cash: 'in', pnl: 'none', businessOnly: true, categoryKind: null, help: 'Pones dinero tuyo en el negocio. Entra efectivo, pero no es una venta ni un ingreso.' },
  owner_withdrawal: { label: 'Retiro del propietario', cash: 'out', pnl: 'none', businessOnly: true, categoryKind: null, help: 'Sacas dinero del negocio para ti. Sale efectivo, pero no es un gasto operativo.' },
  salary_payment: { label: 'Sueldo o remuneración', cash: 'out', pnl: 'none', businessOnly: true, categoryKind: null, help: 'Te pagas desde el negocio. Se reporta aparte del gasto operativo; su tratamiento fiscal depende de tu estructura.' },
  investment: { label: 'Inversión o depósito a broker', cash: 'out', pnl: 'none', categoryKind: null, help: 'Sale dinero que pasa a ser capital invertido: depósito a un broker o compra de un activo. No es gasto operativo. (Las cuentas de fondeo o evaluaciones que se pagan y no se recuperan van como Gasto.)' },
  trading_withdrawal: { label: 'Retiro de trading o fondeo', cash: 'in', pnl: 'income', categoryKind: null, help: 'Recibes dinero retirado de un broker o de una cuenta de fondeo. Cuenta como ingreso del negocio de trading y se reporta aparte de las ventas. Regístralo en la cuenta donde llega el dinero.' },
  tax_collected: { label: 'Impuesto cobrado en una venta', cash: 'in', pnl: 'none', businessOnly: true, categoryKind: null, help: 'Impuesto que cobraste a tus clientes dentro de una venta. Entra efectivo, pero NO es ingreso tuyo: es dinero a reservar para tus obligaciones tributarias.' },
  inventory_purchase: { label: 'Compra de mercancía (inventario)', cash: 'out', pnl: 'none', businessOnly: true, categoryKind: null, help: 'Sale dinero por mercancía que aún no vendes. No es gasto: pasa a inventario y se vuelve costo cuando se vende.' },
  refund: { label: 'Devolución a un cliente', cash: 'out', pnl: 'contra_income', categoryKind: 'income', help: 'Devuelves dinero a un cliente. Reduce los ingresos netos; no se suma como gasto.' },
  loan_received: { label: 'Préstamo recibido', cash: 'in', pnl: 'none', categoryKind: null, help: 'Entra efectivo y nace una deuda. No es ingreso ni beneficio.' },
  loan_payment: { label: 'Pago de préstamo (capital)', cash: 'out', pnl: 'none', categoryKind: null, help: 'Pagas el capital de una deuda: baja efectivo y baja la deuda. Los intereses regístralos aparte como gasto.' },
  tax_payment: { label: 'Pago de impuestos', cash: 'out', pnl: 'none', categoryKind: null, help: 'Pagas impuestos u obligaciones tributarias. Sale efectivo; no se mezcla con los gastos operativos.' },
  adjustment: { label: 'Ajuste documentado', cash: 'by_direction', pnl: 'none', categoryKind: null, help: 'Corrige una diferencia de saldo. Exige descripción y queda auditado. No es ingreso ni gasto.' },
}

/** Tipos que el usuario puede registrar como movimiento de una sola cuenta (todos menos transfer). */
export const SINGLE_SIDED_TYPES = (Object.keys(TYPE_RULES) as TransactionType[]).filter((t) => t !== 'transfer')

export function affectsCash(status: TransactionStatus): boolean {
  return status === 'confirmed' || status === 'reconciled'
}

/** Efecto firmado sobre el efectivo de la cuenta del movimiento (0 si aún no es real). */
export function cashDelta(tx: Pick<Transaction, 'type' | 'status' | 'amountMinor' | 'direction'>): number {
  if (!affectsCash(tx.status)) return 0
  const rule = TYPE_RULES[tx.type]
  const dir: Direction | null = rule.cash === 'by_direction' ? tx.direction : rule.cash
  if (dir === 'in') return tx.amountMinor
  if (dir === 'out') return -tx.amountMinor
  return 0 // dirección ausente en un tipo que la exige: no inventamos efecto
}

/** Saldo de una cuenta: saldo inicial + movimientos confirmados desde la fecha del saldo inicial. */
export interface AccountBalance {
  accountId: string
  balanceMinor: number
  /** Movimientos confirmados con fecha anterior al saldo inicial: no se cuentan (ya están en el saldo inicial). */
  ignoredBeforeOpening: number
}

export function computeBalances(accounts: readonly Account[], txs: readonly Transaction[]): Map<string, AccountBalance> {
  const byAccount = new Map<string, AccountBalance>()
  for (const a of accounts) byAccount.set(a.id, { accountId: a.id, balanceMinor: a.openingBalanceMinor, ignoredBeforeOpening: 0 })
  for (const t of txs) {
    const acc = accounts.find((a) => a.id === t.accountId)
    const bal = byAccount.get(t.accountId)
    if (!acc || !bal) continue
    const delta = cashDelta(t)
    if (delta === 0) continue
    if (t.date < acc.openingBalanceDate) {
      bal.ignoredBeforeOpening += 1
      continue
    }
    bal.balanceMinor += delta
    if (!Number.isSafeInteger(bal.balanceMinor)) throw new Error('Saldo fuera del rango seguro.')
  }
  return byAccount
}

/**
 * Efectivo disponible vs. capital en cuentas de inversión: no se mezclan.
 * Solo cuentas activas (archivar exige saldo cero).
 */
export function totalsByKind(accounts: readonly Account[], balances: ReadonlyMap<string, AccountBalance>): { cashMinor: number; investedMinor: number } {
  let cashMinor = 0
  let investedMinor = 0
  for (const a of accounts) {
    if (a.status !== 'active') continue
    const b = balances.get(a.id)?.balanceMinor ?? 0
    if (a.accountType === 'investment') investedMinor += b
    else cashMinor += b
  }
  return { cashMinor, investedMinor }
}
