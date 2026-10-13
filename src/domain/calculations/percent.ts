import { parseMoneyToMinor } from './money'

/** Porcentajes como puntos base (bps): 13 % = 1300. Evita floats al guardar tasas. */
export function parsePercentToBps(input: string): number | null {
  const s = input.trim().replace('%', '').replace(',', '.').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [i, f = ''] = s.split('.') as [string, string?]
  const bps = Number(i) * 100 + Number((f ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(bps) ? bps : null
}
export function formatBps(bps: number): string {
  const v = bps / 100
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '')} %`
}
/** Importe con signo permitido (para saldos iniciales que pueden ser deudas). */
export function parseSignedMoneyToMinor(input: string, currency = 'USD'): number | null {
  const t = input.trim()
  if (t.startsWith('-')) {
    const v = parseMoneyToMinor(t.slice(1), currency)
    return v === null ? null : v === 0 ? 0 : -v
  }
  return parseMoneyToMinor(t, currency)
}
