import { describe, expect, it } from 'vitest'
import { formatBps, parsePercentToBps, parseSignedMoneyToMinor } from './percent'

describe('porcentajes y montos con signo', () => {
  it.each([['13', 1300], ['13,5', 1350], ['13.25', 1325], ['0.5 %', 50], ['100', 10000]])('%s -> %i bps', (t, v) => {
    expect(parsePercentToBps(t)).toBe(v)
  })
  it.each(['', 'abc', '-3', '1.234', '1,2,3'])('rechaza %j', (t) => expect(parsePercentToBps(t)).toBeNull())
  it('formatea bps', () => {
    expect(formatBps(1300)).toBe('13 %')
    expect(formatBps(1325)).toBe('13.25 %')
  })
  it('acepta saldos negativos y no devuelve -0', () => {
    expect(parseSignedMoneyToMinor('-120.50')).toBe(-12050)
    expect(parseSignedMoneyToMinor('-0')).toBe(0)
    expect(Object.is(parseSignedMoneyToMinor('-0'), -0)).toBe(false)
    expect(parseSignedMoneyToMinor('50')).toBe(5000)
    expect(parseSignedMoneyToMinor('x')).toBeNull()
  })
})
