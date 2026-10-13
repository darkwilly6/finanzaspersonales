import { describe, expect, it } from 'vitest'
import type { SaleLine, Transaction } from '../types/ledger'
import { computeSale, lineBreakdown, roundDiv, saleStatus, splitByWeights, taxToReserve } from './sales'
import { summarize } from './summary'

const line = (quantity: number, unitPriceMinor: number, unitCostMinor: number | null = null, name = 'Camisa'): SaleLine => ({ productId: null, name, quantity, unitPriceMinor, unitCostMinor })

describe('totales de una venta', () => {
  it('sin impuesto: ingreso = total; margen con costo conocido', () => {
    const t = computeSale([line(2, 2500, 1000), line(1, 4000, 1500)], 0, { enabled: false, rateBps: 0, pricesIncludeTax: false })
    expect(t).toMatchObject({ linesTotalMinor: 9000, netMinor: 9000, taxMinor: 0, totalMinor: 9000, units: 3, costMinor: 3500, marginMinor: 5500 })
    expect(t.marginPct).toBeCloseTo(61.11, 1)
  })
  it('impuesto incluido en el precio: el cliente paga lo escrito y se separa lo que es tuyo', () => {
    const t = computeSale([line(1, 11300)], 0, { enabled: true, rateBps: 1300, pricesIncludeTax: true })
    expect(t).toMatchObject({ totalMinor: 11300, netMinor: 10000, taxMinor: 1300 })
  })
  it('impuesto aparte: se suma al precio y el ingreso propio es lo escrito', () => {
    const t = computeSale([line(1, 10000)], 0, { enabled: true, rateBps: 1300, pricesIncludeTax: false })
    expect(t).toMatchObject({ netMinor: 10000, taxMinor: 1300, totalMinor: 11300 })
  })
  it('el descuento reduce la base antes del impuesto', () => {
    const t = computeSale([line(1, 10000)], 2000, { enabled: true, rateBps: 1300, pricesIncludeTax: false })
    expect(t).toMatchObject({ netMinor: 8000, taxMinor: 1040, totalMinor: 9040 })
  })
  it('redondeo en centavos: net + impuesto siempre es exactamente el total, en ambos modos', () => {
    for (const price of [1, 99, 101, 999, 1234, 5555, 99999]) {
      for (const bps of [1, 1300, 1999, 10000]) {
        const inc = computeSale([line(1, price)], 0, { enabled: true, rateBps: bps, pricesIncludeTax: true })
        expect(inc.netMinor + inc.taxMinor).toBe(inc.totalMinor)
        expect(inc.totalMinor).toBe(price)
        const sep = computeSale([line(1, price)], 0, { enabled: true, rateBps: bps, pricesIncludeTax: false })
        expect(sep.netMinor + sep.taxMinor).toBe(sep.totalMinor)
        expect(sep.netMinor).toBe(price)
      }
    }
    expect(roundDiv(5, 2)).toBe(3)
    expect(roundDiv(4, 2)).toBe(2)
  })
  it('sin costo conocido en alguna línea: el margen queda sin calcular, no en cero', () => {
    const t = computeSale([line(1, 5000, 2000), line(1, 3000, null)], 0, { enabled: false, rateBps: 0, pricesIncludeTax: false })
    expect(t.costMinor).toBeNull()
    expect(t.marginMinor).toBeNull()
    expect(t.marginPct).toBeNull()
  })
  it('impuesto activado con tasa 0 no cobra nada', () => {
    expect(computeSale([line(1, 5000)], 0, { enabled: true, rateBps: 0, pricesIncludeTax: true }).taxMinor).toBe(0)
  })
})

describe('desglose por línea', () => {
  it('reparte el ingreso propio sin perder centavos y calcula la ganancia por línea', () => {
    const lines = [line(3, 3333, 1000, 'A'), line(1, 1, 0, 'B'), line(7, 777, null, 'C')]
    const totals = computeSale(lines, 150, { enabled: true, rateBps: 1300, pricesIncludeTax: true })
    const rows = lineBreakdown({ lines, netMinor: totals.netMinor })
    expect(rows.reduce((s, r) => s + r.revenueMinor, 0)).toBe(totals.netMinor)
    expect(rows[0]!.profitMinor).toBe(rows[0]!.revenueMinor - 3000)
    expect(rows[2]!.profitMinor).toBeNull()
  })
  it('splitByWeights suma exactamente el total', () => {
    for (const total of [0, 1, 7, 100, 12345]) expect(splitByWeights(total, [1, 1, 1]).reduce((s, v) => s + v, 0)).toBe(total)
    expect(splitByWeights(100, [0, 0])).toEqual([0, 0])
  })
})

describe('estado de la venta e impuesto a reservar', () => {
  it('el estado se deriva de los movimientos', () => {
    expect(saleStatus([{ status: 'confirmed' }, { status: 'confirmed' }])).toBe('paid')
    expect(saleStatus([{ status: 'pending' }, { status: 'pending' }])).toBe('pending')
    expect(saleStatus([{ status: 'cancelled' }, { status: 'cancelled' }])).toBe('cancelled')
  })
  it('impuesto cobrado menos pagado, solo confirmados', () => {
    expect(taxToReserve([
      { type: 'tax_collected', status: 'confirmed', amountMinor: 1300 },
      { type: 'tax_collected', status: 'confirmed', amountMinor: 700 },
      { type: 'tax_collected', status: 'pending', amountMinor: 9999 },
      { type: 'tax_collected', status: 'cancelled', amountMinor: 9999 },
      { type: 'tax_payment', status: 'confirmed', amountMinor: 500 },
    ])).toBe(1500)
  })
  it('el impuesto cobrado no es ingreso en el resumen, pero sí entra efectivo', () => {
    const base = { scope: 'business', businessId: 'b', accountId: 'a', counterpartAccountId: null, transferId: null, transferPurpose: null, direction: null, date: '2026-10-05', currency: 'USD', categoryId: null, status: 'confirmed', description: '', counterparty: '', voidedAt: null, voidReason: null, createdAt: null, updatedAt: null } as const
    const txs = [
      { ...base, id: '1', type: 'income', amountMinor: 10000 },
      { ...base, id: '2', type: 'tax_collected', amountMinor: 1300 },
    ] as Transaction[]
    const s = summarize(txs, null)
    expect(s.netIncome).toBe(10000)
    expect(s.taxCollected).toBe(1300)
    expect(s.cashIn).toBe(11300)
    expect(s.operatingResult).toBe(10000)
  })
})
