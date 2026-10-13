import { describe, expect, it } from 'vitest'
import type { Account, Business, Category, Product } from '../types/ledger'
import { buildSale, productFormSchema, productFormToDoc, saleIncomeId, saleIsValid, saleTaxId, validateSale, type SaleContext, type SaleInput } from './sales'

const business = (tax = { enabled: false, label: '', rateBps: 0, pricesIncludeTax: true }): Business => ({ id: 'b1', name: 'NYXAR', tax } as Business)
const acc = (over: Partial<Account> = {}): Account => ({ id: 'a1', name: 'Banco', scope: 'business', businessId: 'b1', accountType: 'bank', currency: 'USD', openingBalanceMinor: 0, openingBalanceDate: '2026-01-01', status: 'active', ...over })
const products: Product[] = [
  { id: 'p1', name: 'Camisa negra', sku: 'CN-1', businessId: 'b1', unitPriceMinor: 2500, unitCostMinor: 1000, active: true },
  { id: 'p2', name: 'Gorra', sku: '', businessId: 'b1', unitPriceMinor: 1500, unitCostMinor: null, active: true },
  { id: 'p3', name: 'Ajena', sku: '', businessId: 'otro', unitPriceMinor: 100, unitCostMinor: 50, active: true },
  { id: 'p4', name: 'Vieja', sku: '', businessId: 'b1', unitPriceMinor: 100, unitCostMinor: 50, active: false },
]
const cats: Category[] = [{ id: 'v', name: 'Ventas', kind: 'income', scope: 'shared', businessId: null, color: '#52d99a', active: true }, { id: 'g', name: 'Gasto', kind: 'expense', scope: 'shared', businessId: null, color: '#fff000', active: true }]
const ctx = (b = business(), accounts = [acc()]): SaleContext => ({ business: b, accounts, products, categories: cats, today: '2026-10-10' })
const input = (over: Partial<SaleInput> = {}): SaleInput => ({
  accountId: 'a1', date: '2026-10-05', customer: '', status: 'paid', discount: '', pricesIncludeTax: true, categoryId: '', notes: '',
  lines: [{ productId: 'p1', name: '', quantity: '2', unitPrice: '25.00', unitCost: '' }], ...over,
})

describe('validateSale', () => {
  it('acepta una venta del catálogo y hereda el costo del producto', () => {
    const v = validateSale(input(), ctx())
    expect(saleIsValid(v)).toBe(true)
    expect(v.lines![0]).toMatchObject({ productId: 'p1', name: 'Camisa negra', quantity: 2, unitPriceMinor: 2500, unitCostMinor: 1000 })
    expect(v.totals).toMatchObject({ totalMinor: 5000, costMinor: 2000, marginMinor: 3000, units: 2 })
  })
  it('permite productos sin catálogo (nombre libre) y costo opcional', () => {
    const v = validateSale(input({ lines: [{ productId: '', name: 'Sudadera', quantity: '1', unitPrice: '40', unitCost: '' }] }), ctx())
    expect(saleIsValid(v)).toBe(true)
    expect(v.lines![0]).toMatchObject({ productId: null, name: 'Sudadera', unitCostMinor: null })
    expect(v.totals!.costMinor).toBeNull()
  })
  it('el precio puede cambiarse en la venta sin tocar el catálogo', () => {
    const v = validateSale(input({ lines: [{ productId: 'p1', name: '', quantity: '1', unitPrice: '20', unitCost: '' }] }), ctx())
    expect(v.lines![0]!.unitPriceMinor).toBe(2000)
  })
  it.each(['0', '-1', '1.5', 'abc', ''])('rechaza unidades %j', (q) => {
    const v = validateSale(input({ lines: [{ productId: 'p1', name: '', quantity: q, unitPrice: '25', unitCost: '' }] }), ctx())
    expect(v.lineErrors[0]?.quantity).toBeTruthy()
  })
  it('rechaza productos de otro negocio, desactivados o inexistentes, y líneas libres sin nombre', () => {
    for (const id of ['p3', 'p4', 'nope']) {
      expect(validateSale(input({ lines: [{ productId: id, name: '', quantity: '1', unitPrice: '1', unitCost: '' }] }), ctx()).lineErrors[0]?.productId).toBeTruthy()
    }
    expect(validateSale(input({ lines: [{ productId: '', name: ' ', quantity: '1', unitPrice: '1', unitCost: '' }] }), ctx()).lineErrors[0]?.name).toBeTruthy()
  })
  it('exige al menos un producto y un total mayor que cero', () => {
    expect(validateSale(input({ lines: [] }), ctx()).errors.lines).toBeTruthy()
    expect(validateSale(input({ lines: [{ productId: '', name: 'Regalo', quantity: '1', unitPrice: '0', unitCost: '' }] }), ctx()).errors.total).toBeTruthy()
  })
  it('el descuento no puede superar la venta', () => {
    expect(validateSale(input({ discount: '60' }), ctx()).errors.discount).toBeTruthy()
    expect(saleIsValid(validateSale(input({ discount: '10' }), ctx()))).toBe(true)
  })
  it('la cuenta debe ser de este negocio, activa y no de inversión', () => {
    expect(validateSale(input(), ctx(business(), [acc({ businessId: 'otro' })])).errors.accountId).toBeTruthy()
    expect(validateSale(input(), ctx(business(), [acc({ status: 'archived' })])).errors.accountId).toMatch(/archivada/)
    expect(validateSale(input(), ctx(business(), [acc({ accountType: 'investment' })])).errors.accountId).toMatch(/inversión/)
    expect(validateSale(input({ accountId: '' }), ctx()).errors.accountId).toBeTruthy()
  })
  it('una venta cobrada no puede ser futura; una pendiente sí', () => {
    expect(validateSale(input({ date: '2026-12-01' }), ctx()).errors.date).toMatch(/futura/)
    expect(saleIsValid(validateSale(input({ date: '2026-12-01', status: 'pending' }), ctx()))).toBe(true)
    expect(validateSale(input({ date: '2025-12-31' }), ctx()).errors.date).toMatch(/saldo inicial/)
  })
  it('la categoría debe ser de ingreso y del ámbito correcto', () => {
    expect(saleIsValid(validateSale(input({ categoryId: 'v' }), ctx()))).toBe(true)
    expect(validateSale(input({ categoryId: 'g' }), ctx()).errors.categoryId).toBeTruthy()
  })
})

describe('buildSale', () => {
  it('sin impuestos crea la venta y un único ingreso confirmado, con ids deterministas', () => {
    const b = buildSale(input(), ctx(), 'S1')
    expect(b.txs).toHaveLength(1)
    expect(b.txs[0]).toMatchObject({ id: saleIncomeId('S1'), data: { type: 'income', amountMinor: 5000, status: 'confirmed', saleId: 'S1', scope: 'business', businessId: 'b1', accountId: 'a1' } })
    expect(b.sale).toMatchObject({ netMinor: 5000, taxMinor: 0, totalMinor: 5000, costMinor: 2000, units: 2, taxEnabled: false })
  })
  it('con impuesto: ingreso propio y impuesto cobrado van en movimientos separados que suman lo que paga el cliente', () => {
    const tax = { enabled: true, label: 'IVA', rateBps: 1300, pricesIncludeTax: true }
    const b = buildSale(input({ lines: [{ productId: '', name: 'Pack', quantity: '1', unitPrice: '113', unitCost: '' }] }), ctx(business(tax)), 'S2')
    expect(b.txs.map((t) => [t.id, t.data.type, t.data.amountMinor])).toEqual([[saleIncomeId('S2'), 'income', 10000], [saleTaxId('S2'), 'tax_collected', 1300]])
    expect(b.txs.reduce((s, t) => s + t.data.amountMinor, 0)).toBe(b.sale.totalMinor)
    expect(b.sale).toMatchObject({ taxEnabled: true, taxLabel: 'IVA', taxRateBps: 1300, pricesIncludeTax: true })
  })
  it('respeta la elección "impuesto aparte" de esta venta', () => {
    const tax = { enabled: true, label: 'IVA', rateBps: 1300, pricesIncludeTax: true }
    const b = buildSale(input({ pricesIncludeTax: false, lines: [{ productId: '', name: 'Pack', quantity: '1', unitPrice: '100', unitCost: '' }] }), ctx(business(tax)), 'S3')
    expect(b.totals).toMatchObject({ netMinor: 10000, taxMinor: 1300, totalMinor: 11300 })
  })
  it('una venta pendiente genera movimientos pendientes que no cambian el saldo todavía', () => {
    const b = buildSale(input({ status: 'pending' }), ctx(), 'S4')
    expect(b.txs.every((t) => t.data.status === 'pending')).toBe(true)
  })
  it('se niega a construir una venta inválida', () => {
    expect(() => buildSale(input({ lines: [] }), ctx(), 'S5')).toThrow()
  })
})

describe('producto', () => {
  it('convierte a centavos; costo vacío = desconocido', () => {
    const base = { name: 'Camisa', sku: '', businessId: 'b1', price: '25', cost: '', trackStock: false, reorderPoint: '' }
    expect(productFormSchema.safeParse(base).success).toBe(true)
    expect(productFormToDoc({ ...base, name: ' Camisa ', sku: ' CN ' })).toEqual({ name: 'Camisa', sku: 'CN', businessId: 'b1', unitPriceMinor: 2500, unitCostMinor: null, active: true, trackStock: false, reorderPoint: null })
    expect(productFormToDoc({ ...base, cost: '10.50' }).unitCostMinor).toBe(1050)
    expect(productFormToDoc({ ...base, trackStock: true, reorderPoint: '5' })).toMatchObject({ trackStock: true, reorderPoint: 5 })
    expect(productFormToDoc({ ...base, trackStock: false, reorderPoint: '5' }).reorderPoint).toBeNull()
    expect(productFormSchema.safeParse({ ...base, reorderPoint: 'x' }).success).toBe(false)
    expect(productFormSchema.safeParse({ ...base, name: 'C', businessId: '', price: 'x' }).success).toBe(false)
  })
})
