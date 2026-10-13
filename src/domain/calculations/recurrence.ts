import type { RecurringFrequency } from '../types/ledger'
import { addDays, addMonthsClamped } from './dates'

export interface RecurrenceRule {
  frequency: RecurringFrequency
  startDate: string
  endDate: string | null
}

/** Id determinista del movimiento planificado de un pago fijo en una fecha: impide duplicados al regenerar. */
export const plannedId = (recurringId: string, date: string) => `rec_${recurringId}_${date}`

/**
 * Fechas en que ocurre un pago fijo dentro de [from, to] (ambas incluidas).
 * Mensual y anual conservan el día de la fecha de inicio (31 → fin de mes en meses cortos).
 */
export function occurrencesBetween(rule: RecurrenceRule, from: string, to: string, max = 500): string[] {
  const out: string[] = []
  const last = rule.endDate && rule.endDate < to ? rule.endDate : to
  if (last < rule.startDate || last < from) return out
  const anchorDay = Number(rule.startDate.slice(8, 10))

  for (let k = 0; k < 10_000 && out.length < max; k++) {
    let d: string
    switch (rule.frequency) {
      case 'weekly': d = addDays(rule.startDate, 7 * k); break
      case 'every15': d = addDays(rule.startDate, 15 * k); break
      case 'monthly': d = addMonthsClamped(rule.startDate, k, anchorDay); break
      case 'yearly': d = addMonthsClamped(rule.startDate, 12 * k, anchorDay); break
    }
    if (d > last) break
    if (d >= from) out.push(d)
  }
  return out
}

/** Próxima fecha desde `from` (incluida), o null si ya terminó. */
export function nextOccurrence(rule: RecurrenceRule, from: string): string | null {
  const horizon = rule.frequency === 'yearly' ? 800 : 400
  return occurrencesBetween(rule, from, addDays(from, horizon), 1)[0] ?? null
}
