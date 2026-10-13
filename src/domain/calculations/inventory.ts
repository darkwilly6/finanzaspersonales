import type { InventoryMove, Product } from '../types/ledger'
import { roundDiv } from './sales'

/**
 * Stock con costo promedio ponderado. Todo en enteros:
 * unidades y valor total (centavos). El costo promedio es valor / unidades y nunca se guarda.
 * Al salir unidades se descuenta su parte proporcional del valor; al sacar todo el stock se descuenta el valor restante exacto,
 * así el inventario nunca queda con centavos huérfanos.
 */
export interface StockState { units: number; valueMinor: number }
export const emptyStock = (): StockState => ({ units: 0, valueMinor: 0 })

export function stockByProduct(
  moves: readonly Pick<InventoryMove, 'productId' | 'quantity' | 'totalCostMinor' | 'saleId' | 'txId'>[],
  isVoid: (m: { saleId: string | null; txId: string | null }) => boolean,
): Map<string, StockState> {
  const map = new Map<string, StockState>()
  for (const m of moves) {
    if (isVoid(m)) continue
    const cur = map.get(m.productId) ?? emptyStock()
    cur.units += m.quantity
    cur.valueMinor += m.quantity > 0 ? m.totalCostMinor : -m.totalCostMinor
    map.set(m.productId, cur)
  }
  return map
}

/** Costo promedio por unidad, redondeado al centavo (solo para mostrar y proponer precios). */
export function avgCostMinor(s: StockState): number | null {
  return s.units > 0 ? roundDiv(Math.max(0, s.valueMinor), s.units) : null
}

/** Costo de sacar `qty` unidades; null si no hay suficientes. */
export function costOfRemoval(s: StockState, qty: number): number | null {
  if (!Number.isInteger(qty) || qty <= 0 || qty > s.units) return null
  return qty === s.units ? Math.max(0, s.valueMinor) : roundDiv(Math.max(0, s.valueMinor) * qty, s.units)
}

export interface StockRow {
  product: Product
  units: number
  valueMinor: number
  avgCostMinor: number | null
  low: boolean
}

export function stockRows(products: readonly Product[], stock: ReadonlyMap<string, StockState>): StockRow[] {
  return products
    .filter((p) => p.trackStock)
    .map((p) => {
      const s = stock.get(p.id) ?? emptyStock()
      const low = p.reorderPoint !== null && p.reorderPoint !== undefined && s.units <= p.reorderPoint
      return { product: p, units: s.units, valueMinor: s.valueMinor, avgCostMinor: avgCostMinor(s), low }
    })
}

/** Capital inmovilizado: valor del inventario que aún no se vende. */
export const immobilizedCapital = (rows: readonly StockRow[]) => rows.reduce((s, r) => s + Math.max(0, r.valueMinor), 0)
