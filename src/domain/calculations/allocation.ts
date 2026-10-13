/**
 * Reparto de lo que genera un negocio: cuánto reservar, cuánto reinvertir y cuánto te corresponde.
 *
 * Tres límites, siempre, de lo más estricto a lo más amplio:
 *  1. Lo que el negocio realmente ganó en el periodo (base). No se reparte más de eso.
 *  2. El efectivo que sobra DESPUÉS de la reserva mínima y de los pagos que vienen (excedente).
 *  3. Los porcentajes que tú definiste (no se inventan por defecto).
 * Todo en centavos enteros; el reparto suma exactamente lo repartible (método del mayor residuo).
 */
export interface AllocationPolicy { reserveBps: number; reinvestBps: number; ownerBps: number }

export type AllocationReason = 'ok' | 'no_policy' | 'no_profit' | 'no_surplus'

export interface AllocationInput {
  /** Resultado del periodo que se puede repartir (p. ej. retiros menos gastos de fondeo). */
  baseMinor: number
  policy: AllocationPolicy | null
  /** Efectivo actual del negocio (cuentas que no son de inversión). */
  cashNowMinor: number
  minReserveMinor: number
  /** Pagos que vienen (planificados, pendientes y pagos fijos) en el horizonte elegido. */
  upcomingOutflowsMinor: number
}

export interface AllocationResult {
  reason: AllocationReason
  baseMinor: number
  /** Efectivo - reserva mínima - pagos que vienen (nunca negativo). */
  surplusMinor: number
  /** Lo que realmente se puede repartir ahora: el menor entre base y excedente. */
  allocatableMinor: number
  reserveMinor: number
  reinvestMinor: number
  ownerMinor: number
  /** Parte de la base que no se reparte todavía porque el efectivo no alcanza. */
  heldBackMinor: number
}

export function policyIsValid(p: AllocationPolicy | null | undefined): p is AllocationPolicy {
  return !!p && [p.reserveBps, p.reinvestBps, p.ownerBps].every((n) => Number.isInteger(n) && n >= 0 && n <= 10000) && p.reserveBps + p.reinvestBps + p.ownerBps === 10000
}

/** Reparte `total` según bps sin perder ni inventar centavos. */
export function splitByBps(total: number, bps: readonly number[]): number[] {
  const base = bps.map((b) => Math.floor((total * b) / 10000))
  let rest = total - base.reduce((s, v) => s + v, 0)
  const order = bps.map((b, i) => ({ i, frac: (total * b) % 10000 })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (rest <= 0) break
    base[i]! += 1
    rest -= 1
  }
  return base
}

export function computeAllocation(a: AllocationInput): AllocationResult {
  const surplus = Math.max(0, a.cashNowMinor - a.minReserveMinor - a.upcomingOutflowsMinor)
  const base = Math.max(0, a.baseMinor)
  const allocatable = Math.min(base, surplus)
  const empty = { baseMinor: base, surplusMinor: surplus, allocatableMinor: allocatable, reserveMinor: 0, reinvestMinor: 0, ownerMinor: 0, heldBackMinor: base - allocatable }

  if (a.baseMinor <= 0) return { ...empty, reason: 'no_profit', allocatableMinor: 0, heldBackMinor: 0 }
  if (surplus <= 0) return { ...empty, reason: 'no_surplus', allocatableMinor: 0, heldBackMinor: base }
  if (!policyIsValid(a.policy)) return { ...empty, reason: 'no_policy' }

  const [owner, reinvest, reserve] = splitByBps(allocatable, [a.policy.ownerBps, a.policy.reinvestBps, a.policy.reserveBps]) as [number, number, number]
  return { ...empty, reason: 'ok', ownerMinor: owner, reinvestMinor: reinvest, reserveMinor: reserve }
}
