import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LedgerGate } from '../ledger/LedgerGate'
import { useLedger } from '../ledger/LedgerData'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { InventoryForm, KIND_TITLE } from './InventoryForm'
import { immobilizedCapital, stockRows } from '../../domain/calculations/inventory'
import { formatDateEs } from '../../domain/calculations/dates'
import { INVENTORY_KIND_LABELS } from '../../domain/types/ledger'
import type { InventoryInputKind } from '../../domain/validation/inventory'

export function StockPage() {
  const { products, businesses, stock, inventoryMoves, cancelledSaleIds, transactions } = useLedger()
  const [bizFilter, setBizFilter] = useState('')
  const [dialog, setDialog] = useState<{ kind: InventoryInputKind; productId: string } | null>(null)
  const rows = useMemo(() => stockRows(products.filter((p) => !bizFilter || p.businessId === bizFilter), stock), [products, stock, bizFilter])
  const capital = immobilizedCapital(rows)
  const low = rows.filter((r) => r.low && r.product.active)
  const cancelledTx = useMemo(() => new Set(transactions.filter((t) => t.status === 'cancelled').map((t) => t.id)), [transactions])
  const name = new Map(products.map((p) => [p.id, p.name]))
  const history = inventoryMoves.filter((m) => !bizFilter || m.businessId === bizFilter).slice(0, 30)
  const activeBiz = businesses.filter((b) => b.status === 'active')

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Stock e inventario</h1><p className="muted">Unidades disponibles con costo promedio ponderado. Comprar mercancía no es un gasto: se vuelve costo cuando la vendes.</p></div>
        <Button onClick={() => setDialog({ kind: 'purchase', productId: '' })}>Registrar compra</Button>
      </header>
      {activeBiz.length > 1 ? (
        <label className="inline-field"><span className="sr-only">Negocio</span>
          <select value={bizFilter} onChange={(e) => setBizFilter(e.target.value)} aria-label="Negocio"><option value="">Todos los negocios</option>{activeBiz.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
      ) : null}
      <LedgerGate>
        <section className="kpis two" aria-label="Resumen de inventario">
          <div className="kpi"><span className="kpi-label">Capital inmovilizado</span><Money minor={capital} className="kpi-value" /><span className="tiny muted">Valor del inventario sin vender, a costo</span></div>
          <div className="kpi"><span className="kpi-label">Por reponer</span><span className="kpi-value">{low.length}</span><span className="tiny muted">Productos en o bajo su aviso</span></div>
        </section>
        {rows.length === 0 ? (
          <div className="empty"><h2>Aún no controlas stock</h2><p>Activa “Controlar unidades en stock” en un producto, registra su stock inicial y tus compras, y cada venta descontará unidades y usará el costo real.</p><Link className="btn btn-primary" to="/inventario">Ir a Productos</Link></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Producto</th><th className="num">Unidades</th><th className="num">Costo promedio</th><th className="num">Valor en stock</th><th>Estado</th><th>Registrar</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.product.id} className={r.product.active ? '' : 'is-void'}>
                    <td data-label="Producto"><strong>{r.product.name}</strong>{r.product.sku ? <span className="tiny muted block">{r.product.sku}</span> : null}</td>
                    <td data-label="Unidades" className="num">{r.units}</td>
                    <td data-label="Costo promedio" className="num">{r.avgCostMinor === null ? <span className="muted">—</span> : <Money minor={r.avgCostMinor} />}</td>
                    <td data-label="Valor en stock" className="num"><Money minor={r.valueMinor} /></td>
                    <td data-label="Estado">{r.units < 0 ? <span className="tag tag-cancelled">Revisar</span> : r.low ? <span className="tag tag-pending">Reponer</span> : <span className="tag tag-confirmed">Ok</span>}</td>
                    <td className="actions-wrap">
                      <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'purchase', productId: r.product.id })}>Compra</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'opening', productId: r.product.id })}>Inicial</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'return', productId: r.product.id })}>Devolución</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'adjustment', productId: r.product.id })}>Ajuste</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history.length ? (
          <section className="panel" aria-labelledby="hist-title">
            <h2 id="hist-title">Últimos movimientos de stock</h2>
            <ul className="rows">
              {history.map((m) => {
                const void_ = (m.saleId !== null && cancelledSaleIds.has(m.saleId)) || (m.txId !== null && cancelledTx.has(m.txId))
                return (
                  <li key={m.id} className={void_ ? 'is-void' : ''}>
                    <div><strong>{INVENTORY_KIND_LABELS[m.kind]} · {name.get(m.productId) ?? 'Producto'}</strong><p className="tiny muted">{formatDateEs(m.date)}{m.supplier ? ` · ${m.supplier}` : ''}{m.note ? ` · ${m.note}` : ''}{void_ ? ' · anulado' : ''}</p></div>
                    <span className={m.quantity < 0 ? 'neg' : 'pos'}>{m.quantity > 0 ? '+' : ''}{m.quantity} u.</span>
                    <Money minor={m.totalCostMinor} />
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
        <p className="tiny muted">El stock se calcula sumando movimientos; no se edita a mano. Si algo no cuadra, regístralo como Ajuste con su motivo. Si anulas una venta o una compra, sus unidades vuelven o salen solas.</p>
      </LedgerGate>
      <Modal open={!!dialog} onClose={() => setDialog(null)} title={dialog ? KIND_TITLE[dialog.kind] : ''} size="lg">
        {dialog ? <InventoryForm kind={dialog.kind} productId={dialog.productId} onDone={() => setDialog(null)} /> : null}
      </Modal>
    </div>
  )
}
