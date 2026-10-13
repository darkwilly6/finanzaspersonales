import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BarsChart, LineChart, ShareBars, niceScale } from './Charts'

describe('niceScale', () => {
  it('incluye siempre el cero y usa pasos redondos', () => {
    const s = niceScale(0, 123456)
    expect(s.lo).toBe(0)
    expect(s.hi).toBeGreaterThanOrEqual(123456)
    expect([1, 2, 5].includes(Number(String(s.step)[0]))).toBe(true)
    expect(niceScale(-5000, 20000).lo).toBeLessThan(0)
  })
  it('datos todo en cero no producen NaN ni división por cero', () => {
    const s = niceScale(0, 0)
    expect(Number.isFinite(s.lo + s.hi + s.step)).toBe(true)
    expect(s.hi).toBeGreaterThan(s.lo)
  })
})

describe('gráficos', () => {
  it('barras: sin NaN, con descripción accesible y tabla de datos', () => {
    const { container } = render(<BarsChart title="Ingresos y gastos" aLabel="Ingresos" bLabel="Gastos" data={[{ month: '2026-09', a: 10000, b: 4000 }, { month: '2026-10', a: 0, b: 0 }]} />)
    expect(screen.getByRole('img', { name: 'Ingresos y gastos' })).toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    expect(screen.getAllByRole('row').length).toBeGreaterThan(2)
  })
  it('barras con datos vacíos o todo cero no revientan', () => {
    const { container } = render(<BarsChart title="t" aLabel="a" bLabel="b" data={[]} />)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })
  it('línea: marca el mínimo en rojo cuando es negativo y no genera NaN con un solo punto', () => {
    const { container, rerender } = render(<LineChart title="Saldo" data={[{ date: '2026-10-10', value: 5000 }, { date: '2026-10-11', value: -2000 }, { date: '2026-10-12', value: 3000 }]} />)
    expect(container.querySelector('.pt-neg')).toBeInTheDocument()
    expect(container.querySelector('.neg-zone')).toBeInTheDocument()
    rerender(<LineChart title="Saldo" data={[{ date: '2026-10-10', value: 0 }]} />)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })
  it('participación por categoría: mensaje vacío y porcentajes', () => {
    const { rerender } = render(<ShareBars slices={[]} empty="Sin datos" />)
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    rerender(<ShareBars empty="" slices={[{ categoryId: 'c', name: 'Publicidad', color: '#f5c451', totalMinor: 7500, share: 0.75 }]} />)
    expect(screen.getByText('Publicidad')).toBeInTheDocument()
    expect(screen.getByText(/75 %/)).toBeInTheDocument()
  })
})
