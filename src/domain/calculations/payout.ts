import type { PayoutFrequency } from '../types/ledger'
import { addDays, addMonthsClamped } from './dates'

/**
 * Cuándo toca pagarte según la frecuencia configurada en el negocio.
 * Sin pagos previos, toca ahora. Es una sugerencia: nada se paga solo.
 */
export function nextPayout(args: { lastPayoutDate: string | null; frequency: PayoutFrequency; customDays: number | null; today: string }): { date: string; due: boolean; neverPaid: boolean } {
  const { lastPayoutDate: last, frequency, customDays, today } = args
  if (!last) return { date: today, due: true, neverPaid: true }
  let next: string
  switch (frequency) {
    case 'weekly': next = addDays(last, 7); break
    case 'biweekly': next = addDays(last, 15); break
    case 'monthly': next = addMonthsClamped(last, 1, Number(last.slice(8, 10))); break
    case 'custom': next = addDays(last, Math.max(1, customDays ?? 30)); break
  }
  return { date: next, due: next <= today, neverPaid: false }
}
