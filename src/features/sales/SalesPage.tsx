import { useMemo, useState } from 'react'
import { Ban, CheckCircle2, Plus } from 'lucide-react'
import { FilterBar } from '../ledger/FilterBar'
import { LedgerGate } from '../ledger/LedgerGate'
import { useFilters } from '../ledger/FilterContext'
import { useLedger } from '../ledger/LedgerData'
import { useAuth } from '../auth/AuthContext'
import { SaleForm } from './SaleForm'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { useToast } from '../../components/feedback/Toast'
import { lineBreakdown, saleStatus, taxToReserve, type SaleStatus } from '../../domain/calculations/sales'
import { formatDateEs } from '../../domain/calculations/dates'
import type { Sale } from '../../domain/types/ledger'
import { setTransactionsStatus, voidTransactions } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

const STATUS_LABEL: Record<SaleStatus, string> = { paid: 'Cobrada', pending: 'Pendiente de cobro', cancelled: 'Anulada' }
const TAG: Record<SaleStatus, string> = { paid: 'confirmed', pending: 'pending', cancelled: 'cancelled' }

export function SalesPage() {
  const { user } = useAuth()
  const { sales, businesses, accounts, transactions, today } = useLedger()
  const { filter, range } = useFilters()
  const { notify } = useToast()
  const [creating, setCreating] = useState(false)
  const [voiding, setVoiding] = useState<Sale | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const bizName = (id: string) => businesses.find((b) => b.id === id)?.name ?? '—'

  const rows = useMemo(() => {
    return sales
      .filter((s) => filter.scopes.length === 0 || filter.scopes.includes(s.businessId))
      .filter((s) => !range || (s.date >= range.from && s.date <= range.to))
      .map((s) => {
        const txs = transactions.filter((t) => t.saleId === s.id)
        return { sale: s, txs, status: saleStatus(txs) }
      })
  }, [sales, transactions, filter.scopes, range])

  const kpi = useMemo(() => {
    const live = rows.filter((r) => r.status !== 'cancelled')
    const withCost = live.filter((r) => r.sale.costMinor !== null)
    return {
      count: live.length,
      units: live.reduce((s, r) => s + r.sale.units, 0),
      net: live.reduce((s, r) => s + r.sale.netMinor, 0),
      tax: live.reduce((s, r) => s + r.sale.taxMinor, 0),
      profit: withCost.reduce((s, r) => s + (r.sale.netMinor - (r.sale.costMinor ?? 0)), 0),
      profitNet: withCost.reduce((s, r) => s + r.sale.netMinor, 0),
      withoutCost: live.length - withCost.length,
      pendingTotal: live.filter((r) => r.status === 'pending').reduce((s, r) => s + r.sale.totalMinor, 0),
    }
  }, [rows])

  const taxBusinesses = businesses.filter((b) => b.tax.enabled && (filter.scopes.length === 0 || filter.scopes.includes(b.id)))

  async function markPaid(sale: Sale, txs: typeof transactions) {
    if (sale.date > today) { notify('error', 'La venta tiene fecha futura. Los movimientos de una venta no se editan: anúlala y regístrala con la fecha real.'); return }
    setBusy(true)
    try { await setTransactionsStatus(user!.uid, txs.filter((t) => t.status === 'pending'), 'confirmed'); notify('success', 'Cobro confirmado.') }
    catch (e) { notify('error', humanizeFirebaseError(e)) } finally { setBusy(false) }
  }

  async function doVoid() {
    if (!voiding || reason.trim().length < 3) return
    setBusy(true)
    try {
      await voidTransactions(user!.uid, transactions.filter((t) => t.saleId === voiding.id && t.status !== 'cancelled'), reason)
      notify('success', 'Venta anulada. Se conserva en el historial.'); setVoiding(null); setReason('')
    } catch (e) { notify('error', humanizeFirebaseError(e)) } finally { setBusy(false) }
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Ventas</h1><p className="muted">Cada venta con sus productos y unidades. El impuesto cobrado se separa de tu ingreso y las ventas pendientes no tocan tu saldo hasta que se cobran.</p></div>
        <Button icon={<Plus size={16} aria-hidden />} onClick={() => setCreating(true)}>Nueva venta</Button>
      </header>
      <FilterBar compact />
      <LedgerGate>
        <section className="kpis" aria-label="Resumen de ventas">
          <div className="kpi"><span className="kpi-label">Ventas</span><span className="kpi-value">{kpi.count}</span><span className="tiny muted">{kpi.units} unidad(es) vendidas</span></div>
          <div className="kpi"><span className="kpi-label">Ingreso propio</span><Money minor={kpi.net} className="kpi-value" /><span className="tiny muted">Sin impuesto</span></div>
          <div className="kpi"><span className="kpi-label">Ganancia bruta</span><Money minor={kpi.profit} tone className="kpi-value" /><span className="tiny muted">{kpi.profitNet > 0 ? `${((kpi.profit / kpi.profitNet) * 100).toFixed(1)} % de margen` : 'Ingreso menos costo de lo vendido'}{kpi.withoutCost > 0 ? ` · ${kpi.withoutCost} venta(s) sin costo no cuentan` : ''}</span></div>
          <div className="kpi"><span className="kpi-label">Impuesto cobrado</span><Money minor={kpi.tax} className="kpi-value" /><span className="tiny muted">A reservar; no es ingreso</span></div>
        </section>
        {kpi.pendingTotal > 0 ? <p className="small muted">Pendiente de cobro en este periodo: <b><Money minor={kpi.pendingTotal} /></b></p> : null}

        {taxBusinesses.length > 0 ? (
          <section className="panel" aria-labelledby="taxres-title">
            <h2 id="taxres-title">Impuesto cobrado pendiente de pagar</h2>
            <dl className="kv">
              {taxBusinesses.map((b) => {
                const ids = new Set(accounts.filter((a) => a.businessId === b.id).map((a) => a.id))
                return <div key={b.id}><dt>{b.name} · {b.tax.label}</dt><dd><Money minor={taxToReserve(transactions.filter((t) => ids.has(t.accountId)))} /></dd></div>
              })}
            </dl>
            <p className="tiny muted">Es lo cobrado menos lo que registraste como “Pago de impuestos”, desde el inicio. Es una referencia para que lo tengas apartado; no calcula tus obligaciones legales.</p>
          </section>
        ) : null}

        {rows.length === 0 ? (
          <div className="empty"><h2>No hay ventas en este periodo</h2><p>Registra la primera con sus productos y unidades.</p><Button onClick={() => setCreating(true)}>Registrar una venta</Button></div>
        ) : (
          <div className="stack">
            {rows.map(({ sale, txs, status }) => {
              const breakdown = lineBreakdown(sale)
              const summary = sale.lines.map((l) => `${l.quantity} × ${l.name}`).join(', ')
              return (
                <details key={sale.id} className={`sale-card ${status === 'cancelled' ? 'is-void' : ''}`}>
                  <summary>
                    <span className="sale-main"><strong>{sale.customer || 'Venta'}</strong><span className="muted small block">{formatDateEs(sale.date)} · {bizName(sale.businessId)} · {summary}</span></span>
                    <span className={`tag tag-${TAG[status]}`}>{STATUS_LABEL[status]}</span>
                    <Money minor={sale.totalMinor} className="row-amount" />
                  </summary>
                  <div className="sale-detail">
                    <div className="table-wrap flat">
                      <table className="table">
                        <thead><tr><th>Producto</th><th className="num">Unid.</th><th className="num">Precio</th><th className="num">Ingreso</th><th className="num">Costo</th><th className="num">Ganancia</th></tr></thead>
                        <tbody>
                          {breakdown.map((r, i) => (
                            <tr key={i}>
                              <td data-label="Producto">{r.line.name}</td>
                              <td data-label="Unid." className="num">{r.line.quantity}</td>
                              <td data-label="Precio" className="num"><Money minor={r.line.unitPriceMinor} /></td>
                              <td data-label="Ingreso" className="num"><Money minor={r.revenueMinor} /></td>
                              <td data-label="Costo" className="num">{r.costMinor === null ? <span className="muted">—</span> : <Money minor={r.costMinor} />}</td>
                              <td data-label="Ganancia" className="num">{r.profitMinor === null ? <span className="muted">—</span> : <Money minor={r.profitMinor} tone />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <dl className="kv compact">
                      {sale.discountMinor > 0 ? <div><dt>Descuento</dt><dd>−<Money minor={sale.discountMinor} /></dd></div> : null}
                      <div><dt>Ingreso propio</dt><dd><Money minor={sale.netMinor} /></dd></div>
                      {sale.taxMinor > 0 ? <div><dt>{sale.taxLabel} cobrado ({sale.pricesIncludeTax ? 'incluido en el precio' : 'sumado aparte'})</dt><dd><Money minor={sale.taxMinor} /></dd></div> : null}
                      <div><dt>Total del cliente</dt><dd><b><Money minor={sale.totalMinor} /></b></dd></div>
                      {sale.costMinor !== null ? <div><dt>Ganancia bruta</dt><dd><Money minor={sale.netMinor - sale.costMinor} tone /></dd></div> : <div><dt>Ganancia bruta</dt><dd className="muted">Falta el costo de algún producto</dd></div>}
                    </dl>
                    {sale.notes ? <p className="small muted">{sale.notes}</p> : null}
                    {status !== 'cancelled' ? (
                      <div className="row">
                        {status === 'pending' ? <Button size="sm" icon={<CheckCircle2 size={14} aria-hidden />} loading={busy} onClick={() => markPaid(sale, txs)}>Marcar como cobrada</Button> : null}
                        <Button size="sm" variant="ghost" icon={<Ban size={14} aria-hidden />} onClick={() => { setVoiding(sale); setReason('') }}>Anular venta</Button>
                      </div>
                    ) : null}
                  </div>
                </details>
              )
            })}
          </div>
        )}
      </LedgerGate>

      <Modal open={creating} onClose={() => setCreating(false)} title="Nueva venta" size="lg">
        {creating ? <SaleForm onDone={() => setCreating(false)} /> : null}
      </Modal>
      <Modal open={!!voiding} onClose={() => setVoiding(null)} title="Anular venta">
        {voiding ? (
          <div className="stack">
            <p>La venta <b>no se borra</b>: queda en el historial como anulada y su ingreso e impuesto dejan de contar en tus saldos y reportes.</p>
            <div className="field">
              <label htmlFor="void-sale-reason">Motivo de la anulación</label>
              <input id="void-sale-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={150} autoFocus />
            </div>
            <div className="row modal-actions">
              <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={doVoid}>Anular venta</Button>
              <Button variant="ghost" onClick={() => setVoiding(null)}>Cancelar</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
