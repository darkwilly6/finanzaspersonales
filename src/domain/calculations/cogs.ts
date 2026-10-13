import type { Sale } from '../types/ledger'
import type { LedgerSummary } from './summary'

/**
 * Costo de lo vendido (CMV) de un periodo y ámbito, tomado de las ventas no anuladas.
 * Las ventas con algún producto sin costo conocido no se cuentan y se informan aparte (no se inventa un costo).
 */
export function cogsFor(
  sales: readonly Pick<Sale, 'id' | 'accountId' | 'date' | 'costMinor'>[],
  opts: { cancelled: ReadonlySet<string>; scopeAccountIds: ReadonlySet<string> | null; from?: string; to?: string },
): { cogsMinor: number; unknownSales: number } {
  let cogs = 0
  let unknown = 0
  for (const s of sales) {
    if (opts.cancelled.has(s.id)) continue
    if (opts.scopeAccountIds && !opts.scopeAccountIds.has(s.accountId)) continue
    if (opts.from && s.date < opts.from) continue
    if (opts.to && s.date > opts.to) continue
    if (s.costMinor === null) unknown += 1
    else cogs += s.costMinor
  }
  return { cogsMinor: cogs, unknownSales: unknown }
}

/** Resultado operativo = ingresos netos − gastos operativos − costo de lo vendido. */
export function withCogs(summary: LedgerSummary, cogs: { cogsMinor: number; unknownSales: number }): LedgerSummary {
  return { ...summary, cogs: cogs.cogsMinor, cogsUnknownSales: cogs.unknownSales, operatingResult: summary.netIncome - summary.expenses - cogs.cogsMinor }
}
