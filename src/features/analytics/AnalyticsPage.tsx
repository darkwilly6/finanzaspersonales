import { useMemo } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { FilterBar } from '../ledger/FilterBar'
import { LedgerGate } from '../ledger/LedgerGate'
import { useFilters } from '../ledger/FilterContext'
import { useLedger } from '../ledger/LedgerData'
import { BarsChart, ShareBars } from '../../components/charts/Charts'
import { Money } from '../../components/ui/Money'
import { businessComparison, categoryBreakdown, monthlySeries, percentChange, previousPeriod } from '../../domain/calculations/analytics'
import { summarize } from '../../domain/calculations/summary'
import { cogsFor, withCogs } from '../../domain/calculations/cogs'
import { totalsByKind } from '../../domain/calculations/transactionRules'
import { formatDateEs } from '../../domain/calculations/dates'

function Delta({ cur, prev, invert = false }: { cur: number; prev: number | null; invert?: boolean }) {
  if (prev === null) return <span className="tiny muted">Sin periodo anterior para comparar</span>
  const pct = percentChange(cur, prev)
  if (pct === null) return <span className="tiny muted">Sin base de comparación (el periodo anterior fue 0)</span>
  const good = invert ? pct < 0 : pct > 0
  const Icon = Math.abs(pct) < 0.05 ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight
  return <span className={`tiny delta ${Math.abs(pct) < 0.05 ? '' : good ? 'pos' : 'neg'}`}><Icon size={12} aria-hidden /> {pct > 0 ? '+' : ''}{pct.toFixed(1)} % vs periodo anterior</span>
}

export function AnalyticsPage() {
  const { businesses, accounts, categories, balances, sales, cancelledSaleIds, today } = useLedger()
  const { scoped, scopeIds, range, scopeAccounts, filter } = useFilters()

  const data = useMemo(() => {
    const inRange = (from: string, to: string) => scoped.filter((t) => t.date >= from && t.date <= to)
    const rangeTxs = range ? inRange(range.from, range.to) : scoped
    const prev = range ? previousPeriod(range.from, range.to) : null
    const prevTxs = prev ? inRange(prev.from, prev.to) : null
    const cogsIn = (from?: string, to?: string) => cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: scopeIds, from, to })
    const cur = withCogs(summarize(rangeTxs, scopeIds), cogsIn(range?.from, range?.to))
    const before = prevTxs && prev ? withCogs(summarize(prevTxs, scopeIds), cogsIn(prev.from, prev.to)) : null
    return {
      rangeTxs, prev, cur, before,
      months: monthlySeries(scoped, scopeIds, today, 6, (from, to) => cogsIn(from, to).cogsMinor),
      expenses: categoryBreakdown(rangeTxs, categories, 'expense'),
      income: categoryBreakdown(rangeTxs, categories, 'income'),
      rows: businessComparison(businesses.filter((b) => filter.scopes.length === 0 || filter.scopes.includes(b.id)), accounts, rangeTxs, (ids) => cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: ids, from: range?.from, to: range?.to })),
    }
  }, [scoped, scopeIds, range, today, categories, businesses, accounts, filter.scopes, sales, cancelledSaleIds])

  const totals = totalsByKind(scopeAccounts, balances)

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Analítica</h1><p className="muted">Cómo se mueve tu dinero. Todo se calcula con movimientos confirmados; las transferencias entre tus cuentas no cuentan como ingreso ni gasto.</p></div>
      </header>
      <FilterBar compact />
      <LedgerGate>
        <p className="muted small">Periodo: {range ? `${formatDateEs(range.from)} – ${formatDateEs(range.to)}` : 'todo el historial'}{data.prev ? ` · se compara con ${formatDateEs(data.prev.from)} – ${formatDateEs(data.prev.to)}` : ''}</p>
        <section className="kpis" aria-label="Indicadores del periodo">
          <div className="kpi"><span className="kpi-label">Ingresos netos</span><Money minor={data.cur.netIncome} className="kpi-value" /><Delta cur={data.cur.netIncome} prev={data.before?.netIncome ?? null} /></div>
          <div className="kpi"><span className="kpi-label">Gastos operativos</span><Money minor={data.cur.expenses} className="kpi-value" /><Delta cur={data.cur.expenses} prev={data.before?.expenses ?? null} invert /></div>
          <div className="kpi"><span className="kpi-label">Resultado operativo</span><Money minor={data.cur.operatingResult} tone className="kpi-value" /><Delta cur={data.cur.operatingResult} prev={data.before?.operatingResult ?? null} /></div>
          <div className="kpi"><span className="kpi-label">Efectivo disponible hoy</span><Money minor={totals.cashMinor} className="kpi-value" /><span className="tiny muted">Sin cuentas de inversión</span></div>
        </section>

        <section className="panel" aria-labelledby="months-title">
          <h2 id="months-title">Últimos 6 meses</h2>
          <BarsChart title="Ingresos netos y gastos operativos por mes" aLabel="Ingresos netos" bLabel="Gastos y costo vendido" data={data.months.map((m) => ({ month: m.month, a: m.netIncomeMinor, b: m.expensesMinor + m.cogsMinor }))} />
        </section>

        <div className="grid-2 top">
          <section className="panel"><h2>En qué se va el dinero</h2><ShareBars slices={data.expenses} empty="No hay gastos confirmados en este periodo." /></section>
          <section className="panel"><h2>De dónde viene</h2><ShareBars slices={data.income} empty="No hay ingresos confirmados en este periodo." /></section>
        </div>

        {data.rows.length > 0 ? (
          <section className="panel" aria-labelledby="biz-title">
            <h2 id="biz-title">Comparación entre negocios</h2>
            <div className="table-wrap flat">
              <table className="table">
                <thead><tr><th>Negocio</th><th className="num">Ingresos netos</th><th className="num">Gastos</th><th className="num">Costo vendido</th><th className="num">Resultado</th><th className="num">Margen</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.businessId}>
                      <td data-label="Negocio"><strong>{r.name}</strong></td>
                      <td data-label="Ingresos netos" className="num"><Money minor={r.summary.netIncome} /></td>
                      <td data-label="Gastos" className="num"><Money minor={r.summary.expenses} /></td>
                      <td data-label="Costo vendido" className="num"><Money minor={r.summary.cogs} /></td>
                      <td data-label="Resultado" className="num"><Money minor={r.summary.operatingResult} tone /></td>
                      <td data-label="Margen" className="num">{r.marginPct === null ? <span className="muted" title="Sin ingresos en el periodo">—</span> : `${r.marginPct.toFixed(1)} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tiny muted">Resultado operativo: ingresos netos menos gastos menos costo de lo vendido. No incluye retiros, sueldo, inversión, compras de mercancía ni impuestos. La recomendación de dónde reinvertir llega en la Fase 6.</p>
          </section>
        ) : null}
      </LedgerGate>
    </div>
  )
}
