/**
 * Dinero en unidades menores (centavos) como enteros. Nunca se usan floats para sumar o guardar.
 * Todas las funciones son puras y testeables.
 */

export type MinorUnits = number

/** Decimales de una moneda ISO 4217 (USD=2, JPY=0). */
export function currencyDecimals(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

/**
 * Convierte un texto escrito por una persona a unidades menores.
 * Acepta "1234.56", "1,234.56", "1.234,56", "1234,56" y "$ 1 234,50".
 * Un único separador seguido de exactamente 3 dígitos se interpreta como miles.
 * Devuelve null si el texto no es un importe válido o es negativo.
 */
export function parseMoneyToMinor(input: string, currency = 'USD'): MinorUnits | null {
  const decimals = currencyDecimals(currency)
  const s = input.trim().replace(/[\s\u00a0$€£]/g, '')
  if (s === '' || !/^[\d.,]+$/.test(s)) return null

  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  let decimalSep: '.' | ',' | null = null

  if (lastDot !== -1 && lastComma !== -1) {
    decimalSep = lastDot > lastComma ? '.' : ','
    // El otro separador solo puede ser de miles: nunca repetirse como decimal.
    const other = decimalSep === '.' ? ',' : '.'
    if (s.split(decimalSep).length - 1 > 1) return null
    if (s.lastIndexOf(other) > s.lastIndexOf(decimalSep)) return null
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ','
    const count = s.split(sep).length - 1
    const tail = s.length - s.lastIndexOf(sep) - 1
    if (count === 1 && tail !== 3) decimalSep = sep
    else if (count === 1 && tail === 3 && decimals === 3) decimalSep = sep
    else if (count > 1 && tail !== 3) return null
  }

  let intPart = s
  let fracPart = ''
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep)
    intPart = s.slice(0, idx)
    fracPart = s.slice(idx + 1)
  }
  intPart = intPart.replace(/[.,]/g, '')
  if (intPart === '') intPart = '0'
  if (!/^\d+$/.test(intPart) || (fracPart !== '' && !/^\d+$/.test(fracPart))) return null
  if (fracPart.length > decimals) return null

  fracPart = fracPart.padEnd(decimals, '0')
  const minor = Number(intPart + fracPart)
  if (!Number.isSafeInteger(minor)) return null
  return minor
}

/** Formatea unidades menores para mostrar. */
export function formatMinor(amount: MinorUnits, currency = 'USD', locale = 'es-SV'): string {
  const decimals = currencyDecimals(currency)
  const major = amount / 10 ** decimals
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(major)
}

/** Suma segura de enteros: lanza si el resultado deja de ser un entero seguro. */
export function sumMinor(values: readonly MinorUnits[]): MinorUnits {
  let total = 0
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error('Importe no entero: usa unidades menores.')
    total += v
    if (!Number.isSafeInteger(total)) throw new Error('Suma fuera del rango seguro.')
  }
  return total
}
