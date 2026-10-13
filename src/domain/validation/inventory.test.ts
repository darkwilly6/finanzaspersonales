import { describe, expect, it } from 'vitest'
import type { Account, Business, Product } from '../types/ledger'
import { emptyStock, stockByProduct, type StockState } from '../calculations/inventory'
import { buildInventory, inventoryIsValid, inventoryPayId, inventoryRefundId, validateInventory, type InventoryContext, type InventoryInput } from './inventory'
import { buildSale, saleMoveId, validateSale, saleIsValid, type SaleContext, type SaleInput } from './sales'

const acc = (over: Partial<Account> = {}): Account => ({ id: 'a1', name: 'Banco', scope: 'business', businessId: 'b1', accountType: 'bank', currency: 'USD', openingBalanceMinor: 0, openingBalanceDate: '2026-01-01', status: 'active', ...over })
const prod = (over: Partial<Product> = {}): Product => ({ id: 'p1', name: 'Camisa', sku: '', businessId: 'b1', unitPriceMinor: 2500, unitCostMinor: null, active: true, trackStock: true, reorderPoint: 5, ...over })
const ctx = (stock: Map<string, StockState> = new Map(), products: Product[] = [prod()]): InventoryContext => ({ products, accounts: [acc()], stock, today: '2026-10-10' })
const input = (over: Partial<InventoryInput> = {}): InventoryInput => ({ kind: 'purchase', productId: 'p1', date: '2026-10-05', quantity: '50', unitCost: '8', direction: 'in', accountId: 'a1', payStatus: 'paid', supplier: 'Proveedor', note: '', refundAmount: '', ...over })

describe('compras y stock inicial', () => {
  it('una compra crea el movimiento de stock y un movimiento de efectivo que NO es gasto', () => {
    const b = buildInventory(input(), ctx(), 'M1')
    expect(b.move).toMatchObject({ id: 'M1', data: { kind: 'purchase', quantity: 50, totalCostMinor: 40000, productId: 'p1', businessId: 'b1', txId: inventoryPayId('M1') } })
    expect(b.tx).toMatchObject({ id: inventoryPayId('M1'), data: { type: 'inventory_purchase', amountMinor: 40000, status: 'confirmed', accountId: 'a1', businessId: 'b1' } })
  })
  it('una compra pendiente de pago no mueve efectivo todavía y admite fecha futura', () => {
    const b = buildInventory(input({ payStatus: 'pending', date: '2026-10-20' }), ctx(), 'M2')
    expect(b.tx!.data.status).toBe('pending')
  })
  it('el stock inicial no mueve dinero', () => {
    const b = buildInventory(input({ kind: 'opening', accountId: '' }), ctx(), 'M3')
    expect(b.tx).toBeNull()
    expect(b.move.data).toMatchObject({ kind: 'opening', quantity: 50, totalCostMinor: 40000, txId: null })
  })
  it('valida producto, unidades, costo, cuenta y fecha', () => {
    expect(validateInventory(input({ productId: '' }), ctx()).errors.productId).toBeTruthy()
    expect(validateInventory(input(), ctx(new Map(), [prod({ trackStock: false })])).errors.productId).toMatch(/no controla stock/)
    expect(validateInventory(input({ quantity: '0' }), ctx()).errors.quantity).toBeTruthy()
    expect(validateInventory(input({ unitCost: '0' }), ctx()).errors.unitCost).toBeTruthy()
    expect(validateInventory(input({ unitCost: '' }), ctx()).errors.unitCost).toBeTruthy()
    expect(validateInventory(input({ accountId: '' }), ctx()).errors.accountId).toBeTruthy()
    expect(validateInventory(input({ date: '2026-12-01' }), ctx()).errors.date).toMatch(/futura/)
    expect(validateInventory(input({ date: '2025-12-31' }), ctx()).errors.date).toMatch(/saldo inicial/)
  })
})

describe('devoluciones y ajustes', () => {
  it('una devolución suma unidades y, si indicas reembolso, crea la devolución de dinero', () => {
    const b = buildInventory(input({ kind: 'return', quantity: '2', unitCost: '8', refundAmount: '50' }), ctx(), 'R1')
    expect(b.move.data).toMatchObject({ kind: 'return', quantity: 2, totalCostMinor: 1600, txId: inventoryRefundId('R1') })
    expect(b.tx).toMatchObject({ data: { type: 'refund', amountMinor: 5000, status: 'confirmed' } })
  })
  it('una devolución sin reembolso solo mueve unidades', () => {
    expect(buildInventory(input({ kind: 'return', quantity: '1', unitCost: '8' }), ctx(), 'R2').tx).toBeNull()
  })
  it('un ajuste exige motivo; si resta, usa el costo promedio y no deja stock negativo', () => {
    const stock = new Map([['p1', { units: 10, valueMinor: 8000 }]])
    expect(validateInventory(input({ kind: 'adjustment', direction: 'out', quantity: '1', note: '' }), ctx(stock)).errors.note).toBeTruthy()
    const b = buildInventory(input({ kind: 'adjustment', direction: 'out', quantity: '4', note: 'Mercancía dañada' }), ctx(stock), 'A1')
    expect(b.move.data).toMatchObject({ quantity: -4, totalCostMinor: 3200, kind: 'adjustment' })
    expect(validateInventory(input({ kind: 'adjustment', direction: 'out', quantity: '11', note: 'Pérdida de inventario' }), ctx(stock)).errors.quantity).toMatch(/No hay suficiente stock/)
  })
  it('un ajuste que suma exige costo', () => {
    expect(validateInventory(input({ kind: 'adjustment', direction: 'in', unitCost: '', note: 'Conteo físico' }), ctx()).errors.unitCost).toBeTruthy()
    expect(inventoryIsValid(validateInventory(input({ kind: 'adjustment', direction: 'in', unitCost: '8', note: 'Conteo físico' }), ctx()))).toBe(true)
  })
})

describe('ventas con stock y costo promedio ponderado', () => {
  const business = { id: 'b1', name: 'NYXAR', tax: { enabled: false, label: '', rateBps: 0, pricesIncludeTax: true } } as Business
  const sctx = (stock: Map<string, StockState>, products: Product[] = [prod()]): SaleContext => ({ business, accounts: [acc()], products, categories: [], today: '2026-10-10', stock })
  const sin = (qty: string, productId = 'p1'): SaleInput => ({ accountId: 'a1', date: '2026-10-05', customer: '', status: 'paid', discount: '', pricesIncludeTax: true, categoryId: '', notes: '', lines: [{ productId, name: '', quantity: qty, unitPrice: '25', unitCost: '' }] })

  it('costo promedio ponderado: dos compras a distinto costo se promedian', () => {
    // 10 u a $8 y 10 u a $12 → valor 20000 / 20 u = $10 promedio
    const moves = [
      { productId: 'p1', quantity: 10, totalCostMinor: 8000, saleId: null, txId: null },
      { productId: 'p1', quantity: 10, totalCostMinor: 12000, saleId: null, txId: null },
    ]
    const stock = stockByProduct(moves, () => false)
    expect(stock.get('p1')).toEqual({ units: 20, valueMinor: 20000 })
    const v = validateSale(sin('4'), sctx(stock))
    expect(saleIsValid(v)).toBe(true)
    expect(v.lines![0]).toMatchObject({ quantity: 4, unitCostMinor: 1000, costMinor: 4000 })
    expect(v.totals).toMatchObject({ costMinor: 4000, marginMinor: 10000 - 4000 })
  })
  it('la venta genera la salida de stock con el costo exacto y descuenta el valor proporcional', () => {
    const stock = new Map([['p1', { units: 3, valueMinor: 1000 }]]) // promedio no entero: 333.33
    const b = buildSale(sin('2'), sctx(stock), 'S1')
    expect(b.moves).toHaveLength(1)
    expect(b.moves[0]).toMatchObject({ id: saleMoveId('S1', 0), data: { kind: 'sale', quantity: -2, totalCostMinor: 667, saleId: 'S1', productId: 'p1' } })
    expect(b.sale.costMinor).toBe(667)
    // vender todo lo que queda saca el valor restante exacto: nada de centavos huérfanos
    const after = stockByProduct([...[{ productId: 'p1', quantity: 3, totalCostMinor: 1000, saleId: null, txId: null }], { productId: 'p1', quantity: -2, totalCostMinor: 667, saleId: 'S1', txId: null }], () => false)
    expect(after.get('p1')).toEqual({ units: 1, valueMinor: 333 })
    const last = buildSale(sin('1'), sctx(after), 'S2')
    expect(last.moves[0]!.data.totalCostMinor).toBe(333)
  })
  it('no permite vender más unidades de las que hay, ni entre líneas del mismo producto', () => {
    const stock = new Map([['p1', { units: 5, valueMinor: 4000 }]])
    expect(validateSale(sin('6'), sctx(stock)).lineErrors[0]?.quantity).toMatch(/5 unidad/)
    const two: SaleInput = { ...sin('3'), lines: [...sin('3').lines, ...sin('3').lines] }
    const v = validateSale(two, sctx(stock))
    expect(v.lineErrors[0]).toBeUndefined()
    expect(v.lineErrors[1]?.quantity).toMatch(/2 unidad/)
    expect(validateSale(sin('1'), sctx(new Map())).lineErrors[0]?.quantity).toMatch(/0 unidad/)
  })
  it('un producto sin control de stock sigue vendiéndose sin movimientos de stock', () => {
    const b = buildSale(sin('2'), sctx(new Map(), [prod({ trackStock: false, unitCostMinor: 1000 })]), 'S3')
    expect(b.moves).toEqual([])
    expect(b.sale.costMinor).toBe(2000)
  })
})

describe('stock derivado: movimientos anulados no cuentan', () => {
  it('ignora ventas anuladas y compras anuladas', () => {
    const cancelledSales = new Set(['S9'])
    const cancelledTx = new Set(['inv_M9_pay'])
    const moves = [
      { productId: 'p', quantity: 10, totalCostMinor: 5000, saleId: null, txId: null },
      { productId: 'p', quantity: -4, totalCostMinor: 2000, saleId: 'S9', txId: null },
      { productId: 'p', quantity: 20, totalCostMinor: 9999, saleId: null, txId: 'inv_M9_pay' },
    ]
    const s = stockByProduct(moves, (m) => (m.saleId !== null && cancelledSales.has(m.saleId)) || (m.txId !== null && cancelledTx.has(m.txId)))
    expect(s.get('p')).toEqual({ units: 10, valueMinor: 5000 })
    expect(emptyStock()).toEqual({ units: 0, valueMinor: 0 })
  })
})
