/**
 * Fechas de negocio como texto YYYY-MM-DD (sin hora), para evitar errores de zona horaria
 * y de fin de mes. La aritmética se hace en UTC sobre la fecha calendario.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateString(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

const fmt = (dt: Date) => dt.toISOString().slice(0, 10)
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d))
}

/** "Hoy" en la zona horaria elegida por el usuario. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return fmt(now)
  }
}

export function addDays(s: string, n: number): string {
  const dt = parse(s)
  dt.setUTCDate(dt.getUTCDate() + n)
  return fmt(dt)
}
export function startOfMonth(s: string): string {
  return `${s.slice(0, 7)}-01`
}
export function endOfMonth(s: string): string {
  const dt = parse(startOfMonth(s))
  dt.setUTCMonth(dt.getUTCMonth() + 1, 0)
  return fmt(dt)
}
export function addMonths(s: string, n: number): string {
  const dt = parse(startOfMonth(s))
  dt.setUTCMonth(dt.getUTCMonth() + n, 1)
  return fmt(dt)
}
/** Lunes de la semana de la fecha dada. */
export function startOfWeek(s: string): string {
  const dt = parse(s)
  const dow = (dt.getUTCDay() + 6) % 7 // lunes = 0
  dt.setUTCDate(dt.getUTCDate() - dow)
  return fmt(dt)
}
export function startOfYear(s: string): string {
  return `${s.slice(0, 4)}-01-01`
}
export function endOfYear(s: string): string {
  return `${s.slice(0, 4)}-12-31`
}
export function formatDateEs(s: string): string {
  if (!isValidDateString(s)) return s
  return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parse(s))
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

/** Suma meses conservando el día ancla; si el mes no lo tiene, usa su último día (31 ene + 1 mes = 28/29 feb). */
export function addMonthsClamped(s: string, n: number, anchorDay: number): string {
  const [y, m] = s.split('-').map(Number) as [number, number, number]
  const idx = y * 12 + (m - 1) + n
  const year = Math.floor(idx / 12)
  const month = (idx % 12) + 1
  const day = Math.min(anchorDay, daysInMonth(year, month))
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
}
export function monthKey(s: string): string {
  return s.slice(0, 7)
}
