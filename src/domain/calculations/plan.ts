import type { Business, BusinessType, PlanBucket } from '../types/ledger'
import { splitByBps } from './allocation'

/**
 * Plantillas de EJEMPLO por tipo de negocio. No son recomendaciones: son un punto de partida editable,
 * porque un negocio de producto físico no gasta como uno digital o de servicios.
 */
export function defaultPlan(type: BusinessType): PlanBucket[] {
  const b = (id: string, name: string, kind: PlanBucket['kind'], pct: number): PlanBucket => ({ id, name, kind, bps: pct * 100 })
  switch (type) {
    case 'physical':
      return [b('owner', 'Para mí', 'owner', 30), b('reserve', 'Reserva', 'reserve', 15), b('stock', 'Inventario (mercancía)', 'use', 30), b('ads', 'Publicidad', 'use', 20), b('ops', 'Operación y herramientas', 'use', 5)]
    case 'digital':
    case 'service':
    case 'training':
    case 'mentoring':
      return [b('owner', 'Para mí', 'owner', 35), b('reserve', 'Reserva', 'reserve', 15), b('ads', 'Publicidad', 'use', 30), b('tools', 'Herramientas y software', 'use', 10), b('content', 'Contenido y equipo', 'use', 10)]
    case 'trading':
      return [b('owner', 'Para mí', 'owner', 40), b('reserve', 'Reserva', 'reserve', 20), b('reinvest', 'Reinversión (broker o fondeo)', 'use', 40)]
    default:
      return [b('owner', 'Para mí', 'owner', 40), b('reserve', 'Reserva', 'reserve', 20), b('reinvest', 'Reinversión', 'use', 40)]
  }
}

/** Los tres porcentajes de siempre, resumidos desde el plan detallado (así el cierre y el panel siguen cuadrando). */
export function aggregatePlan(buckets: readonly PlanBucket[]): { reserveBps: number; reinvestBps: number; ownerBps: number } {
  const sum = (k: PlanBucket['kind']) => buckets.filter((x) => x.kind === k).reduce((s, x) => s + x.bps, 0)
  return { reserveBps: sum('reserve'), reinvestBps: sum('use'), ownerBps: sum('owner') }
}

export type PlanProblem = 'empty' | 'too_many' | 'name' | 'bps' | 'sum'

export function planProblem(buckets: readonly PlanBucket[]): PlanProblem | null {
  if (buckets.length === 0) return 'empty'
  if (buckets.length > 10) return 'too_many'
  if (buckets.some((b) => b.name.trim().length < 2 || b.name.trim().length > 40)) return 'name'
  if (buckets.some((b) => !Number.isInteger(b.bps) || b.bps < 0 || b.bps > 10000)) return 'bps'
  if (buckets.reduce((s, b) => s + b.bps, 0) !== 10000) return 'sum'
  return null
}

export const PLAN_PROBLEM_TEXT: Record<PlanProblem, string> = {
  empty: 'Agrega al menos una parte al plan.',
  too_many: 'Máximo 10 partes.',
  name: 'Cada parte necesita un nombre de 2 a 40 caracteres.',
  bps: 'Cada porcentaje debe estar entre 0 y 100.',
  sum: 'Los porcentajes deben sumar exactamente 100.',
}

/** Plan efectivo del negocio: el detallado si existe y es válido; si no, el de tres partes de siempre. */
export function resolvePlan(b: Pick<Business, 'plan' | 'allocation'>): PlanBucket[] | null {
  if (b.plan && planProblem(b.plan) === null) return [...b.plan]
  const a = b.allocation
  if (a && a.reserveBps + a.reinvestBps + a.ownerBps === 10000) {
    return [
      { id: 'owner', name: 'Para mí', kind: 'owner', bps: a.ownerBps },
      { id: 'reserve', name: 'Reserva', kind: 'reserve', bps: a.reserveBps },
      { id: 'reinvest', name: 'Reinversión', kind: 'use', bps: a.reinvestBps },
    ]
  }
  return null
}

/** Reparte `amountMinor` entre las partes del plan, sin perder centavos. */
export function splitPlan(amountMinor: number, buckets: readonly PlanBucket[]): { bucket: PlanBucket; amountMinor: number }[] {
  const parts = splitByBps(Math.max(0, amountMinor), buckets.map((b) => b.bps))
  return buckets.map((bucket, i) => ({ bucket, amountMinor: parts[i] ?? 0 }))
}

/** Qué acción de la app corresponde a una parte "de uso", según su nombre y el tipo de negocio. */
export type UseAction = 'stock' | 'investment' | 'expense'

export function actionForBucket(bucket: Pick<PlanBucket, 'name' | 'kind'>, businessType: BusinessType): UseAction {
  const n = bucket.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/(invent|mercanc|stock|producto)/.test(n)) return 'stock'
  if (businessType === 'trading' || /(broker|fondeo|trading)/.test(n)) return 'investment'
  return 'expense'
}
