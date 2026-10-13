import { describe, expect, it } from 'vitest'
import { addDays, addMonths, endOfMonth, endOfYear, isValidDateString, startOfMonth, startOfWeek, todayIn } from './dates'

describe('fechas de negocio', () => {
  it('valida fechas reales', () => {
    expect(isValidDateString('2026-02-28')).toBe(true)
    expect(isValidDateString('2026-02-30')).toBe(false)
    expect(isValidDateString('2024-02-29')).toBe(true)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidDateString('26-1-1')).toBe(false)
  })
  it('maneja fin de mes y año bisiesto', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29')
    expect(endOfMonth('2026-12-31')).toBe('2026-12-31')
    expect(startOfMonth('2026-07-19')).toBe('2026-07-01')
    expect(endOfYear('2026-03-03')).toBe('2026-12-31')
  })
  it('suma días y meses cruzando meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-01')
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-01')
  })
  it('la semana empieza el lunes', () => {
    expect(startOfWeek('2026-10-10')).toBe('2026-10-05') // sábado
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05') // lunes
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05') // domingo
  })
  it('"hoy" respeta la zona horaria', () => {
    const instant = new Date('2026-10-11T02:30:00Z')
    expect(todayIn('America/El_Salvador', instant)).toBe('2026-10-10')
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-10-11')
  })
})
