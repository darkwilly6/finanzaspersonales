import type { LedgerSummary } from '../../domain/calculations/summary'
import { Money } from '../../components/ui/Money'

export function SummaryStrip({ summary }: { summary: LedgerSummary }) {
  const items: { label: string; value: number; hint: string; tone?: boolean }[] = [
    { label: 'Ingresos netos', value: summary.netIncome, hint: 'Ingresos cobrados y retiros de trading, menos devoluciones' },
    { label: 'Gastos operativos', value: summary.expenses, hint: 'Gastos pagados; no incluye retiros, inversión ni préstamos' },
    { label: 'Resultado operativo', value: summary.operatingResult, hint: 'Ingresos netos − gastos − costo de lo vendido', tone: true },
    { label: 'Flujo neto de caja', value: summary.netCashFlow, hint: 'Entradas menos salidas de efectivo, sin transferencias internas', tone: true },
  ]
  return (
    <>
    {summary.cogsUnknownSales > 0 ? <p className="notice notice-warn small" role="status">{summary.cogsUnknownSales} venta(s) de este periodo tienen productos sin costo conocido y no se descontaron: el resultado puede estar sobrestimado. Indica el costo en Productos o controla su stock.</p> : null}
    <section className="kpis" aria-label="Resumen del periodo">
      {items.map((i) => (
        <div className="kpi" key={i.label} title={i.hint}>
          <span className="kpi-label">{i.label}</span>
          <Money minor={i.value} tone={i.tone} className="kpi-value" />
          <span className="tiny muted">{i.hint}</span>
        </div>
      ))}
      <details className="kpi-more">
        <summary>Ver desglose</summary>
        <dl className="kv">
          <div><dt>Costo de lo vendido (ya restado)</dt><dd><Money minor={summary.cogs} /></dd></div>
          <div><dt>Compras de mercancía pagadas (inventario, no gasto)</dt><dd><Money minor={summary.inventoryPurchases} /></dd></div>
          <div><dt>Retiros de trading recibidos</dt><dd><Money minor={summary.tradingWithdrawals} /></dd></div>
          <div><dt>Retiros del propietario</dt><dd><Money minor={summary.ownerWithdrawals} /></dd></div>
          <div><dt>Sueldo o remuneración</dt><dd><Money minor={summary.ownerSalary} /></dd></div>
          <div><dt>Aportes de capital</dt><dd><Money minor={summary.capitalContributions} /></dd></div>
          <div><dt>Inversiones</dt><dd><Money minor={summary.investments} /></dd></div>
          <div><dt>Préstamos recibidos</dt><dd><Money minor={summary.loansReceived} /></dd></div>
          <div><dt>Capital de préstamos pagado</dt><dd><Money minor={summary.loanPrincipalPaid} /></dd></div>
          <div><dt>Impuesto cobrado a clientes (a reservar)</dt><dd><Money minor={summary.taxCollected} /></dd></div>
          <div><dt>Impuestos pagados</dt><dd><Money minor={summary.taxesPaid} /></dd></div>
          <div><dt>Ajustes (neto)</dt><dd><Money minor={summary.adjustmentsNet} /></dd></div>
          <div><dt>Transferencias internas eliminadas</dt><dd>{summary.eliminatedTransferSides / 2 || 0} {summary.eliminatedTransferSides === 2 ? 'par' : 'pares'}</dd></div>
        </dl>
      </details>
    </section>
    </>
  )
}
