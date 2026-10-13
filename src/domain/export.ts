import type { Account, Business, Category, Sale, Transaction } from './types/ledger'
import { TYPE_RULES } from './calculations/transactionRules'

type Cell = string | number | null | undefined

/** CSV listo para Excel/Sheets: comillas escapadas y, si el texto empieza con = + - @, se neutraliza para evitar inyección de fórmulas. */
export function toCsv(rows: readonly (readonly Cell[])[]): string {
  const esc = (c: Cell) => {
    if (c === null || c === undefined) return ''
    let s = String(c)
    if (typeof c === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return rows.map((r) => r.map(esc).join(',')).join('\r\n')
}

export const money = (minor: number) => (minor / 100).toFixed(2)

export function transactionsCsv(txs: readonly Transaction[], accounts: readonly Account[], businesses: readonly Business[], categories: readonly Category[]): string {
  const acc = new Map(accounts.map((a) => [a.id, a]))
  const biz = new Map(businesses.map((b) => [b.id, b.name]))
  const cat = new Map(categories.map((c) => [c.id, c.name]))
  const rows: Cell[][] = [['fecha', 'tipo', 'estado', 'ambito', 'negocio', 'cuenta', 'cuenta_contraparte', 'direccion', 'categoria', 'descripcion', 'contraparte', 'importe_usd', 'motivo_anulacion', 'id']]
  for (const t of [...txs].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    rows.push([t.date, TYPE_RULES[t.type].label, t.status, t.scope === 'personal' ? 'personal' : 'negocio', t.businessId ? (biz.get(t.businessId) ?? '') : '', acc.get(t.accountId)?.name ?? '', t.counterpartAccountId ? (acc.get(t.counterpartAccountId)?.name ?? '') : '', t.direction ?? '', t.categoryId ? (cat.get(t.categoryId) ?? '') : '', t.description, t.counterparty, money(t.amountMinor), t.voidReason ?? '', t.id])
  }
  return toCsv(rows)
}

export function salesCsv(sales: readonly Sale[], businesses: readonly Business[]): string {
  const biz = new Map(businesses.map((b) => [b.id, b.name]))
  const rows: Cell[][] = [['fecha', 'negocio', 'cliente', 'producto', 'unidades', 'precio_unitario_usd', 'costo_unitario_usd', 'descuento_venta_usd', 'ingreso_propio_venta_usd', 'impuesto_venta_usd', 'total_venta_usd', 'id_venta']]
  for (const s of [...sales].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    for (const l of s.lines) {
      rows.push([s.date, biz.get(s.businessId) ?? '', s.customer, l.name, l.quantity, money(l.unitPriceMinor), l.unitCostMinor === null ? '' : money(l.unitCostMinor), money(s.discountMinor), money(s.netMinor), money(s.taxMinor), money(s.totalMinor), s.id])
    }
  }
  return toCsv(rows)
}

export interface BackupData { [collection: string]: unknown[] }

/** Respaldo completo y legible. Los importes siguen en centavos enteros. */
export function backupJson(data: BackupData, meta: { appVersion: string; exportedAt: string; email: string }): string {
  return JSON.stringify({ app: 'Capital OS', ...meta, currency: 'USD', amountsInMinorUnits: true, counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])), data }, null, 2)
}
