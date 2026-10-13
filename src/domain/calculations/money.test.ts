import { describe, expect, it } from 'vitest'
import { currencyDecimals, formatMinor, parseMoneyToMinor, sumMinor } from './money'

describe('parseMoneyToMinor', () => {
  it.each([
    ['1234.56', 123456],
    ['1,234.56', 123456],
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['$ 1 234,50', 123450],
    ['1,234', 123400],
    ['1.234', 123400],
    ['0.1', 10],
    ['0,05', 5],
    ['10', 1000],
    ['1,234,567.89', 123456789],
    ['.5', 50],
    ['12.345', 1234500],
  ])('interpreta %s como %i', (text, expected) => {
    expect(parseMoneyToMinor(text, 'USD')).toBe(expected)
  })

  it.each(['', '  ', 'abc', '-5', '1.2.3,4,5', '12.3456', '1,234.567', '1,2,3', '10 USD x', '1,23.4,5'])(
    'rechaza %j',
    (text) => {
      expect(parseMoneyToMinor(text, 'USD')).toBeNull()
    },
  )

  it('no pierde precisión con floats (0.1 + 0.2)', () => {
    const a = parseMoneyToMinor('0.10')!
    const b = parseMoneyToMinor('0.20')!
    expect(a + b).toBe(30)
  })

  it('respeta monedas sin decimales', () => {
    expect(currencyDecimals('JPY')).toBe(0)
    expect(parseMoneyToMinor('1500', 'JPY')).toBe(1500)
    expect(parseMoneyToMinor('1500.5', 'JPY')).toBeNull()
  })

  it('rechaza importes fuera del rango seguro', () => {
    expect(parseMoneyToMinor('99999999999999999999')).toBeNull()
  })
})

describe('formatMinor', () => {
  it('formatea USD con dos decimales', () => {
    const out = formatMinor(123456, 'USD').replace(/\u00a0/g, ' ')
    expect(out).toContain('1,234.56')
    expect(out).toContain('$')
  })
  it('formatea cero y negativos sin NaN', () => {
    expect(formatMinor(0, 'USD')).not.toMatch(/NaN|Infinity/)
    expect(formatMinor(-500, 'USD')).toContain('5.00')
  })
  it('respeta JPY sin decimales', () => {
    expect(formatMinor(1500, 'JPY')).toContain('1,500')
  })
})

describe('sumMinor', () => {
  it('suma enteros', () => expect(sumMinor([10, 20, 30])).toBe(60))
  it('devuelve 0 para lista vacía', () => expect(sumMinor([])).toBe(0))
  it('rechaza decimales', () => expect(() => sumMinor([0.5])).toThrow())
})
