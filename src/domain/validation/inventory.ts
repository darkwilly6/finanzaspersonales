import type { Account, InventoryMoveDoc, Product } from '../types/ledger'
import { isValidDateString } from '../calculations/dates'
import { parseMoneyToMinor } from '../calculations/money'
import { costOfRemoval, emptyStock, type StockState } from '../calculations/inventory'
import { parseQuantity, type BuiltMove } from './sales'
import type { BuiltTx } from './ledger'

export type InventoryInputKind = 'opening' | 'purchase' | 'return' | 'adjustment'

export interface InventoryInput {
  kind: InventoryInputKind
  productId: string
  date: string
  quantity: string
  /** Costo por unidad (compra, stock inicial, devolución o ajuste que suma). */
  unitCost: string
  direction: 'in' | 'out'
  accountId: string
  payStatus: 'paid' | 'pending'
  supplier: string
  note: string
  /** Devolución: dinero devuelto al cliente (opcional). */
  refundAmount: string
}

export interface InventoryContext {
  products: readonly Product[]
  accounts: readonly Account[]
  stock: ReadonlyMap<string, StockState>
  today: string
}

export interface InventoryValidation {
  errors: Partial<Record<keyof InventoryInput | 'form', string>>
  quantity: number | null
  totalCostMinor: number | null
  refundMinor: number | null
}

const MAX_MINOR = 100_000_000_000

export function validateInventory(input: InventoryInput, ctx: InventoryContext): InventoryValidation {
  const errors: InventoryValidation['errors'] = {}
  const product = ctx.products.find((p) => p.id === input.productId)
  if (!product) errors.productId = 'Elige un producto.'
  else if (!product.trackStock) errors.productId = 'Este producto no controla stock. Actívalo en Productos.'
  else if (!product.active) errors.productId = 'Este producto está desactivado.'

  const qty = parseQuantity(input.quantity)
  if (qty === null) errors.quantity = 'Unidades: un número entero de 1 en adelante.'

  const pendingPurchase = input.kind === 'purchase' && input.payStatus === 'pending'
  if (!isValidDateString(input.date)) errors.date = 'Elige una fecha válida.'
  else if (!pendingPurchase && input.date > ctx.today) errors.date = 'La fecha no puede ser futura.'

  const needsCash = input.kind === 'purchase' || (input.kind === 'return' && input.refundAmount.trim() !== '')
  const acc = ctx.accounts.find((a) => a.id === input.accountId)
  if (needsCash) {
    if (!acc) errors.accountId = input.kind === 'purchase' ? 'Elige la cuenta con la que pagas.' : 'Elige la cuenta de donde sale el reembolso.'
    else if (acc.status !== 'active') errors.accountId = 'Esta cuenta está archivada.'
    else if (product && acc.businessId !== product.businessId) errors.accountId = 'La cuenta debe ser del negocio del producto.'
    else if (acc.accountType === 'investment') errors.accountId = 'Elige una cuenta de efectivo, banco, billetera o procesador.'
    else if (!errors.date && isValidDateString(input.date) && input.date < acc.openingBalanceDate) errors.date = 'La fecha es anterior al saldo inicial de la cuenta.'
  }

  let unitCost: number | null = null
  let total: number | null = null
  const state = (product && ctx.stock.get(product.id)) || emptyStock()
  const outAdjust = input.kind === 'adjustment' && input.direction === 'out'

  if (outAdjust) {
    if (qty !== null) {
      total = costOfRemoval(state, qty)
      if (total === null) errors.quantity = `No hay suficiente stock: tienes ${Math.max(0, state.units)} unidad(es).`
    }
  } else {
    unitCost = input.unitCost.trim() === '' ? null : parseMoneyToMinor(input.unitCost)
    if (unitCost === null) errors.unitCost = input.unitCost.trim() === '' ? 'Indica el costo por unidad.' : 'Costo no válido.'
    else if (input.kind === 'purchase' && unitCost <= 0) errors.unitCost = 'El costo de una compra debe ser mayor que cero.'
    else if (qty !== null) {
      total = qty * unitCost
      if (total > MAX_MINOR) errors.unitCost = 'El total es demasiado grande.'
    }
  }

  if (input.kind === 'adjustment' && input.note.trim().length < 5) errors.note = 'Explica el motivo del ajuste (mínimo 5 caracteres).'
  if (input.note.length > 200) errors.note = 'Máximo 200 caracteres.'
  if (input.supplier.length > 80) errors.supplier = 'Máximo 80 caracteres.'

  let refund: number | null = null
  if (input.kind === 'return' && input.refundAmount.trim() !== '') {
    refund = parseMoneyToMinor(input.refundAmount)
    if (refund === null || refund <= 0) errors.refundAmount = 'Escribe un importe mayor que cero o déjalo vacío.'
  }
  return { errors, quantity: errors.quantity ? null : qty, totalCostMinor: total, refundMinor: refund }
}

export const inventoryIsValid = (v: InventoryValidation) => Object.keys(v.errors).length === 0 && v.quantity !== null && v.totalCostMinor !== null

export interface BuiltInventory { move: BuiltMove; tx: BuiltTx | null }

export const inventoryPayId = (moveId: string) => `inv_${moveId}_pay`
export const inventoryRefundId = (moveId: string) => `inv_${moveId}_ref`

/** Un movimiento de stock y, si mueve dinero (compra o reembolso), su movimiento de efectivo ligado. */
export function buildInventory(input: InventoryInput, ctx: InventoryContext, moveId: string): BuiltInventory {
  const v = validateInventory(input, ctx)
  if (!inventoryIsValid(v)) throw new Error('El movimiento de stock no es válido.')
  const product = ctx.products.find((p) => p.id === input.productId)!
  const qty = v.quantity!
  const out = input.kind === 'adjustment' && input.direction === 'out'
  const txId = input.kind === 'purchase' ? inventoryPayId(moveId) : input.kind === 'return' && v.refundMinor ? inventoryRefundId(moveId) : null

  const data: InventoryMoveDoc = {
    productId: product.id, businessId: product.businessId, date: input.date, kind: input.kind, quantity: out ? -qty : qty,
    totalCostMinor: v.totalCostMinor!, saleId: null, txId, supplier: input.supplier.trim(), note: input.note.trim(),
  }
  let tx: BuiltTx | null = null
  const common = { scope: 'business' as const, businessId: product.businessId, accountId: input.accountId, counterpartAccountId: null, transferId: null, transferPurpose: null, direction: null, date: input.date, currency: 'USD' as const, categoryId: null, counterparty: input.supplier.trim(), voidedAt: null, voidReason: null }
  if (input.kind === 'purchase') {
    tx = { id: txId!, data: { ...common, type: 'inventory_purchase', amountMinor: v.totalCostMinor!, status: input.payStatus === 'paid' ? 'confirmed' : 'pending', description: `Compra: ${qty} × ${product.name}` } }
  } else if (input.kind === 'return' && v.refundMinor) {
    tx = { id: txId!, data: { ...common, type: 'refund', amountMinor: v.refundMinor, status: 'confirmed', description: `Devolución: ${qty} × ${product.name}` } }
  }
  return { move: { id: moveId, data }, tx }
}
