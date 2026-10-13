import { z } from 'zod'
import type { Account, Business, Category, InventoryMoveDoc, Product, ProductDoc, SaleDoc, SaleLine, TransactionDoc } from '../types/ledger'
import { isValidDateString } from '../calculations/dates'
import { parseMoneyToMinor } from '../calculations/money'
import { computeSale, roundDiv, type SaleTotals } from '../calculations/sales'
import { costOfRemoval, emptyStock, type StockState } from '../calculations/inventory'
import type { BuiltTx } from './ledger'

/* ───────────── Producto ───────────── */

export const productFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Escribe el nombre del producto.').max(80, 'Máximo 80 caracteres.'),
    sku: z.string().trim().max(40, 'Máximo 40 caracteres.'),
    businessId: z.string().min(1, 'Elige el negocio.'),
    price: z.string().trim().min(1, 'Escribe el precio de venta.'),
    cost: z.string().trim(),
    trackStock: z.boolean(),
    reorderPoint: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.reorderPoint !== '' && !/^\d{1,6}$/.test(v.reorderPoint)) ctx.addIssue({ code: 'custom', path: ['reorderPoint'], message: 'Escribe un número entero de unidades o déjalo vacío.' })
    if (parseMoneyToMinor(v.price) === null) ctx.addIssue({ code: 'custom', path: ['price'], message: 'Escribe un precio válido, por ejemplo 25.00.' })
    if (v.cost !== '' && parseMoneyToMinor(v.cost) === null) ctx.addIssue({ code: 'custom', path: ['cost'], message: 'Escribe un costo válido o déjalo vacío.' })
  })
export type ProductFormValues = z.infer<typeof productFormSchema>

export function productFormToDoc(v: ProductFormValues, active = true): ProductDoc {
  return {
    name: v.name.trim(), sku: v.sku.trim(), businessId: v.businessId, unitPriceMinor: parseMoneyToMinor(v.price) ?? 0,
    unitCostMinor: v.cost === '' ? null : parseMoneyToMinor(v.cost), active, trackStock: v.trackStock, reorderPoint: v.trackStock && v.reorderPoint !== '' ? Number(v.reorderPoint) : null,
  }
}

/* ───────────── Venta ───────────── */

export interface SaleLineInput { productId: string; name: string; quantity: string; unitPrice: string; unitCost: string }

export interface SaleInput {
  accountId: string
  date: string
  customer: string
  status: 'paid' | 'pending'
  lines: SaleLineInput[]
  discount: string
  pricesIncludeTax: boolean
  categoryId: string
  notes: string
}

export interface SaleContext {
  business: Business
  accounts: readonly Account[]
  products: readonly Product[]
  categories: readonly Category[]
  today: string
  /** Stock actual por producto (solo de productos que controlan unidades). */
  stock?: ReadonlyMap<string, StockState>
}

type LineField = 'productId' | 'name' | 'quantity' | 'unitPrice' | 'unitCost'
export interface SaleValidation {
  errors: Partial<Record<'accountId' | 'date' | 'discount' | 'lines' | 'categoryId' | 'customer' | 'notes' | 'total', string>>
  lineErrors: Record<number, Partial<Record<LineField, string>>>
  lines: SaleLine[] | null
  discountMinor: number | null
  totals: SaleTotals | null
  /** Salidas de stock que generará la venta (productos que controlan unidades). */
  stockOut: { lineIndex: number; productId: string; quantity: number; costTotalMinor: number }[]
}

const MAX_MINOR = 100_000_000_000

export function parseQuantity(s: string): number | null {
  const t = s.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= 100_000 ? n : null
}

/** Validación completa de una venta. Pura y testeable. */
export function validateSale(input: SaleInput, ctx: SaleContext): SaleValidation {
  const errors: SaleValidation['errors'] = {}
  const lineErrors: SaleValidation['lineErrors'] = {}
  const parsed: SaleLine[] = []
  const stockOut: SaleValidation['stockOut'] = []
  const working = new Map<string, StockState>()
  let linesOk = true

  if (input.lines.length === 0) { errors.lines = 'Agrega al menos un producto.'; linesOk = false }
  if (input.lines.length > 50) { errors.lines = 'Máximo 50 productos por venta.'; linesOk = false }

  input.lines.forEach((l, i) => {
    const e: Partial<Record<LineField, string>> = {}
    const product = l.productId ? ctx.products.find((p) => p.id === l.productId) : undefined
    if (l.productId && !product) e.productId = 'El producto no existe.'
    else if (product && product.businessId !== ctx.business.id) e.productId = 'Este producto es de otro negocio.'
    else if (product && !product.active) e.productId = 'Este producto está desactivado.'

    const name = product ? product.name : l.name.trim()
    if (!product && (name.length < 1 || name.length > 80)) e.name = 'Escribe el nombre del producto.'
    const qty = parseQuantity(l.quantity)
    if (qty === null) e.quantity = 'Unidades: un número entero de 1 en adelante.'
    const price = parseMoneyToMinor(l.unitPrice)
    if (price === null || price > MAX_MINOR) e.unitPrice = 'Escribe un precio válido.'
    let cost: number | null = null
    let stockCost: number | null = null
    if (product && product.trackStock && qty !== null && !e.productId) {
      // Producto con stock: el costo sale del costo promedio ponderado y se descuentan unidades (también entre líneas del mismo producto).
      const st = working.get(product.id) ?? { ...(ctx.stock?.get(product.id) ?? emptyStock()) }
      const c = costOfRemoval(st, qty)
      if (c === null) e.quantity = `No hay suficiente stock: tienes ${Math.max(0, st.units)} unidad(es) disponible(s).`
      else { working.set(product.id, { units: st.units - qty, valueMinor: st.valueMinor - c }); stockCost = c }
    } else if (l.unitCost.trim() !== '') {
      cost = parseMoneyToMinor(l.unitCost)
      if (cost === null) e.unitCost = 'Costo no válido.'
    } else if (product) {
      cost = product.unitCostMinor
    }
    if (Object.keys(e).length) { lineErrors[i] = e; linesOk = false }
    else if (stockCost !== null) {
      parsed.push({ productId: product!.id, name, quantity: qty!, unitPriceMinor: price!, unitCostMinor: roundDiv(stockCost, qty!), costMinor: stockCost })
      stockOut.push({ lineIndex: i, productId: product!.id, quantity: qty!, costTotalMinor: stockCost })
    } else parsed.push({ productId: product?.id ?? null, name, quantity: qty!, unitPriceMinor: price!, unitCostMinor: cost })
  })

  let discountMinor: number | null = 0
  if (input.discount.trim() !== '') {
    discountMinor = parseMoneyToMinor(input.discount)
    if (discountMinor === null) errors.discount = 'Escribe un descuento válido o déjalo vacío.'
  }

  let totals: SaleTotals | null = null
  if (linesOk && discountMinor !== null) {
    const gross = parsed.reduce((s, l) => s + l.quantity * l.unitPriceMinor, 0)
    if (discountMinor > gross) errors.discount = 'El descuento no puede superar el total de la venta.'
    else {
      totals = computeSale(parsed, discountMinor, { enabled: ctx.business.tax.enabled, rateBps: ctx.business.tax.rateBps, pricesIncludeTax: input.pricesIncludeTax })
      if (totals.totalMinor <= 0 || totals.netMinor <= 0) { errors.total = 'La venta no tiene nada que cobrar.'; totals = null }
      else if (totals.totalMinor > MAX_MINOR) { errors.total = 'El total es demasiado grande.'; totals = null }
    }
  }

  const acc = ctx.accounts.find((a) => a.id === input.accountId)
  if (!acc) errors.accountId = 'Elige la cuenta donde entra el dinero.'
  else if (acc.status !== 'active') errors.accountId = 'Esta cuenta está archivada.'
  else if (acc.businessId !== ctx.business.id) errors.accountId = 'La cuenta debe ser de este negocio.'
  else if (acc.accountType === 'investment') errors.accountId = 'Elige una cuenta de efectivo, banco, billetera o procesador, no de inversión.'

  if (!isValidDateString(input.date)) errors.date = 'Elige una fecha válida.'
  else if (input.status === 'paid' && input.date > ctx.today) errors.date = 'Una venta cobrada no puede tener fecha futura. Márcala como pendiente.'
  else if (acc && acc.businessId === ctx.business.id && input.date < acc.openingBalanceDate) errors.date = 'La fecha es anterior al saldo inicial de la cuenta.'

  if (input.customer.length > 80) errors.customer = 'Máximo 80 caracteres.'
  if (input.notes.length > 300) errors.notes = 'Máximo 300 caracteres.'
  if (input.categoryId) {
    const cat = ctx.categories.find((c) => c.id === input.categoryId)
    if (!cat || cat.kind !== 'income') errors.categoryId = 'Elige una categoría de ingreso.'
    else if (cat.scope === 'personal') errors.categoryId = 'Esta categoría es solo personal.'
    else if (cat.scope === 'business' && cat.businessId !== ctx.business.id) errors.categoryId = 'Esta categoría pertenece a otro negocio.'
  }
  return { errors, lineErrors, lines: linesOk ? parsed : null, discountMinor, totals, stockOut }
}

export const saleIsValid = (v: SaleValidation) => Object.keys(v.errors).length === 0 && Object.keys(v.lineErrors).length === 0 && v.totals !== null && v.lines !== null

export const saleIncomeId = (saleId: string) => `sale_${saleId}_income`
export const saleTaxId = (saleId: string) => `sale_${saleId}_tax`

export interface BuiltMove { id: string; data: InventoryMoveDoc }
export const saleMoveId = (saleId: string, i: number) => `sale_${saleId}_mv_${i}`

export interface BuiltSale { saleId: string; sale: SaleDoc; txs: BuiltTx[]; totals: SaleTotals; moves: BuiltMove[] }

/**
 * Una venta genera: el registro de la venta, un ingreso por lo que es tuyo (sin impuesto) y,
 * si hay impuesto, un movimiento aparte de "impuesto cobrado" que NO es ingreso. Todo con ids deterministas.
 */
export function buildSale(input: SaleInput, ctx: SaleContext, saleId: string): BuiltSale {
  const v = validateSale(input, ctx)
  if (!saleIsValid(v)) throw new Error('La venta no es válida.')
  const totals = v.totals!
  const lines = v.lines!
  const acc = ctx.accounts.find((a) => a.id === input.accountId)!
  const b = ctx.business
  const taxOn = b.tax.enabled && b.tax.rateBps > 0
  const first = lines[0]!
  const label = input.customer.trim() ? `Venta · ${input.customer.trim()}` : `Venta · ${first.name}${lines.length > 1 ? ` y ${lines.length - 1} más` : ''}`

  const sale: SaleDoc = {
    businessId: b.id, accountId: acc.id, date: input.date, customer: input.customer.trim(), lines, discountMinor: v.discountMinor ?? 0,
    taxEnabled: taxOn, taxLabel: taxOn ? b.tax.label : '', taxRateBps: taxOn ? b.tax.rateBps : 0, pricesIncludeTax: taxOn ? input.pricesIncludeTax : false,
    netMinor: totals.netMinor, taxMinor: totals.taxMinor, totalMinor: totals.totalMinor, costMinor: totals.costMinor, units: totals.units,
    categoryId: input.categoryId || null, notes: input.notes.trim(),
  }
  const status = input.status === 'paid' ? 'confirmed' : 'pending'
  const common = {
    scope: 'business' as const, businessId: b.id, accountId: acc.id, counterpartAccountId: null, transferId: null, transferPurpose: null, direction: null,
    date: input.date, currency: 'USD' as const, status: status as TransactionDoc['status'], counterparty: input.customer.trim(), voidedAt: null, voidReason: null, saleId,
  }
  const txs: BuiltTx[] = [{ id: saleIncomeId(saleId), data: { ...common, type: 'income', amountMinor: totals.netMinor, categoryId: input.categoryId || null, description: label } }]
  if (totals.taxMinor > 0) {
    txs.push({ id: saleTaxId(saleId), data: { ...common, type: 'tax_collected', amountMinor: totals.taxMinor, categoryId: null, description: `${b.tax.label} cobrado · ${label}` } })
  }
  const moves: BuiltMove[] = v.stockOut.map((o) => ({
    id: saleMoveId(saleId, o.lineIndex),
    data: { productId: o.productId, businessId: b.id, date: input.date, kind: 'sale', quantity: -o.quantity, totalCostMinor: o.costTotalMinor, saleId, txId: null, supplier: '', note: '' },
  }))
  return { saleId, sale, txs, totals, moves }
}
