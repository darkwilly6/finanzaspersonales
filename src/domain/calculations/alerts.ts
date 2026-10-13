import type { Account, Business, Recurring, Transaction } from '../types/ledger'
import type { AccountBalance } from './transactionRules'
import { addDays, formatDateEs } from './dates'
import { formatMinor } from './money'
import { occurrencesBetween } from './recurrence'
import type { ForecastResult } from './forecast'

export type Severity = 'critical' | 'warning' | 'info'
export interface Alert { id: string; severity: Severity; title: string; detail: string; href?: string }

const ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 }

/** Alertas derivadas de los datos. No se guardan: se recalculan, así nunca quedan desactualizadas. */
export function buildAlerts(a: {
  accounts: readonly Account[]
  balances: ReadonlyMap<string, AccountBalance>
  businesses: readonly Business[]
  transactions: readonly Transaction[]
  recurring: readonly Recurring[]
  forecast: ForecastResult | null
  today: string
  truncated: boolean
  lowStock?: { name: string; units: number; reorderPoint: number }[]
}): Alert[] {
  const out: Alert[] = []
  const active = a.accounts.filter((x) => x.status === 'active')

  for (const acc of active) {
    const b = a.balances.get(acc.id)
    if (!b) continue
    if (b.balanceMinor < 0 && acc.accountType !== 'investment') {
      out.push({ id: `neg-${acc.id}`, severity: 'critical', title: `Saldo negativo en ${acc.name}`, detail: `El saldo calculado es ${formatMinor(b.balanceMinor)}. Revisa si falta registrar una entrada o corrige con un ajuste documentado.`, href: '/cuentas' })
    }
    if (b.ignoredBeforeOpening > 0) {
      out.push({ id: `pre-${acc.id}`, severity: 'warning', title: `Movimientos anteriores al saldo inicial de ${acc.name}`, detail: `${b.ignoredBeforeOpening} movimiento(s) confirmados no se cuentan porque son anteriores a la fecha del saldo inicial.`, href: '/cuentas' })
    }
  }

  if (a.forecast?.firstNegativeDate && a.forecast.firstNegativeDate > a.today) {
    out.push({ id: 'forecast-neg', severity: 'critical', title: 'Tu efectivo proyectado queda en negativo', detail: `Según lo planificado y tus pagos fijos, el ${formatDateEs(a.forecast.firstNegativeDate)} llegarías a ${formatMinor(a.forecast.minMinor)} como mínimo.`, href: '/calendario' })
  }

  for (const biz of a.businesses) {
    if (biz.status !== 'active' || biz.reserve.minReserveMinor <= 0) continue
    const cash = active.filter((x) => x.businessId === biz.id && x.accountType !== 'investment').reduce((s, x) => s + (a.balances.get(x.id)?.balanceMinor ?? 0), 0)
    if (cash < biz.reserve.minReserveMinor) {
      out.push({ id: `reserve-${biz.id}`, severity: 'warning', title: `${biz.name} está bajo su reserva mínima`, detail: `Efectivo ${formatMinor(cash)} frente a una reserva mínima de ${formatMinor(biz.reserve.minReserveMinor)}.`, href: `/negocios/${biz.id}` })
    }
  }

  const open = a.transactions.filter((t) => t.status === 'planned' || t.status === 'pending')
  const overdue = open.filter((t) => t.date < a.today && !(t.type === 'transfer' && t.direction === 'in'))
  if (overdue.length) {
    out.push({ id: 'overdue', severity: 'warning', title: `${overdue.length} movimiento(s) vencidos sin confirmar`, detail: 'Su fecha ya pasó pero siguen como planificados o pendientes. Confírmalos o anúlalos para que tus saldos reflejen la realidad.', href: '/movimientos' })
  }
  const soon = open.filter((t) => t.date >= a.today && t.date <= addDays(a.today, 7) && !(t.type === 'transfer' && t.direction === 'in'))
  if (soon.length) {
    out.push({ id: 'soon', severity: 'info', title: `${soon.length} movimiento(s) en los próximos 7 días`, detail: 'Revisa el calendario para ver qué entra y qué sale esta semana.', href: '/calendario' })
  }

  const uncategorized = a.transactions.filter((t) => t.status === 'confirmed' && (t.type === 'income' || t.type === 'expense') && !t.categoryId)
  if (uncategorized.length) {
    out.push({ id: 'uncat', severity: 'info', title: `${uncategorized.length} movimiento(s) sin categoría`, detail: 'Sin categoría no se puede ver en qué se va tu dinero.', href: '/movimientos' })
  }

  const horizon = addDays(a.today, 30)
  const ungenerated = a.recurring.filter((r) => {
    if (!r.active) return false
    const dates = occurrencesBetween(r, a.today, horizon)
    return dates.some((d) => !a.transactions.some((t) => t.recurringId === r.id && t.date === d))
  })
  if (ungenerated.length) {
    out.push({ id: 'recurring', severity: 'info', title: `${ungenerated.length} pago(s) fijo(s) sin movimientos creados`, detail: 'Se cuentan en la proyección, pero aún no existen como movimientos planificados. Puedes generarlos desde Pagos fijos.', href: '/pagos-fijos' })
  }

  for (const low of a.lowStock ?? []) {
    out.push({ id: `stock-${low.name}`, severity: 'warning', title: `Reponer ${low.name}`, detail: `Quedan ${low.units} unidad(es); tu aviso está en ${low.reorderPoint}.`, href: '/stock' })
  }

  if (a.truncated) {
    out.push({ id: 'truncated', severity: 'warning', title: 'Historial muy grande', detail: 'Solo se cargaron los movimientos más recientes; los saldos pueden quedar incompletos.' })
  }
  return out.sort((x, y) => ORDER[x.severity] - ORDER[y.severity])
}
