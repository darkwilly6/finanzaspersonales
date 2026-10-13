import type { SaleDoc, SaleLine, Transaction } from '../types/ledger'

/** División entera redondeada al más cercano (mitad hacia arriba) para n >= 0. Sin floats. */
export function roundDiv(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d))
}

/** Costo total de una línea: el exacto si el producto controla stock; si no, unidades × costo unitario. */
export function lineCostMinor(l: SaleLine): number | null {
  if (l.costMinor !== undefined && l.costMinor !== null) return l.costMinor
  return l.unitCostMinor === null ? null : l.quantity * l.unitCostMinor
}

export interface TaxConfig { enabled: boolean; rateBps: number; pricesIncludeTax: boolean }

export interface SaleTotals {
  linesTotalMinor: number
  discountMinor: number
  /** Ingreso propio del negocio. */
  netMinor: number
  /** Impuesto cobrado (a reservar). */
  taxMinor: number
  /** Lo que paga el cliente. */
  totalMinor: number
  units: number
  /** null si algún producto no tiene costo conocido. */
  costMinor: number | null
  marginMinor: number | null
  /** Margen sobre el ingreso propio; null si no hay costo completo o no hubo ingreso. */
  marginPct: number | null
}

/**
 * Totales de una venta con enteros en centavos.
 * - Precios con impuesto incluido: total = lo escrito (menos descuento); ingreso propio = total / (1 + tasa); impuesto = diferencia.
 * - Impuesto aparte: ingreso propio = lo escrito (menos descuento); impuesto = ingreso × tasa; total = suma.
 * - Impuesto desactivado: no se calcula ninguno.
 * El impuesto se calcula sobre el total de la venta (no línea por línea), para no acumular redondeos.
 */
export function computeSale(lines: readonly SaleLine[], discountMinor: number, tax: TaxConfig): SaleTotals {
  const linesTotal = lines.reduce((s, l) => s + l.quantity * l.unitPriceMinor, 0)
  const afterDiscount = Math.max(0, linesTotal - discountMinor)
  let net = afterDiscount
  let taxMinor = 0
  let total = afterDiscount
  if (tax.enabled && tax.rateBps > 0) {
    if (tax.pricesIncludeTax) {
      net = roundDiv(afterDiscount * 10000, 10000 + tax.rateBps)
      taxMinor = afterDiscount - net
    } else {
      taxMinor = roundDiv(afterDiscount * tax.rateBps, 10000)
      total = afterDiscount + taxMinor
    }
  }
  const costComplete = lines.length > 0 && lines.every((l) => lineCostMinor(l) !== null)
  const cost = costComplete ? lines.reduce((s, l) => s + (lineCostMinor(l) ?? 0), 0) : null
  const margin = cost === null ? null : net - cost
  return {
    linesTotalMinor: linesTotal, discountMinor, netMinor: net, taxMinor, totalMinor: total,
    units: lines.reduce((s, l) => s + l.quantity, 0), costMinor: cost, marginMinor: margin,
    marginPct: margin !== null && net > 0 ? (margin / net) * 100 : null,
  }
}

/** Reparte `total` en proporción a `weights` sin perder centavos (mayor residuo). */
export function splitByWeights(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum <= 0) return weights.map(() => 0)
  const base = weights.map((w) => Math.floor((total * w) / sum))
  let rest = total - base.reduce((s, v) => s + v, 0)
  const order = weights.map((w, i) => ({ i, frac: (total * w) % sum })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (rest <= 0) break
    base[i]! += 1
    rest -= 1
  }
  return base
}

export interface LineBreakdown {
  line: SaleLine
  /** Parte del ingreso propio de la venta que corresponde a esta línea (ya sin descuento ni impuesto). */
  revenueMinor: number
  costMinor: number | null
  profitMinor: number | null
}

/** Ingreso, costo y ganancia por línea; los ingresos de las líneas suman exactamente el ingreso propio de la venta. */
export function lineBreakdown(sale: Pick<SaleDoc, 'lines' | 'netMinor'>): LineBreakdown[] {
  const shares = splitByWeights(sale.netMinor, sale.lines.map((l) => l.quantity * l.unitPriceMinor))
  return sale.lines.map((line, i) => {
    const revenue = shares[i]!
    const cost = lineCostMinor(line)
    return { line, revenueMinor: revenue, costMinor: cost, profitMinor: cost === null ? null : revenue - cost }
  })
}

export type SaleStatus = 'paid' | 'pending' | 'cancelled'

/** El estado de una venta se deriva de sus movimientos: así nunca puede contradecirlos. */
export function saleStatus(saleTxs: readonly Pick<Transaction, 'status'>[]): SaleStatus {
  if (saleTxs.length === 0) return 'paid'
  if (saleTxs.every((t) => t.status === 'cancelled')) return 'cancelled'
  if (saleTxs.some((t) => t.status === 'pending' || t.status === 'planned')) return 'pending'
  return 'paid'
}

/** Impuesto cobrado menos impuesto pagado (confirmados): lo que deberías tener reservado. No calcula obligaciones legales. */
export function taxToReserve(txs: readonly Pick<Transaction, 'type' | 'status' | 'amountMinor'>[]): number {
  let v = 0
  for (const t of txs) {
    if (t.status !== 'confirmed' && t.status !== 'reconciled') continue
    if (t.type === 'tax_collected') v += t.amountMinor
    if (t.type === 'tax_payment') v -= t.amountMinor
  }
  return v
}
