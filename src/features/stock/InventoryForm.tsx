import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/feedback/Toast'
import { buildInventory, inventoryIsValid, validateInventory, type InventoryInput, type InventoryInputKind } from '../../domain/validation/inventory'
import { avgCostMinor, emptyStock } from '../../domain/calculations/inventory'
import { formatMinor } from '../../domain/calculations/money'
import { createInventoryMove, newId } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

export const KIND_TITLE: Record<InventoryInputKind, string> = { purchase: 'Registrar compra', opening: 'Stock inicial', adjustment: 'Ajuste de stock', return: 'Devolución de cliente' }

export function InventoryForm({ kind, productId, onDone }: { kind: InventoryInputKind; productId: string; onDone: () => void }) {
  const { user } = useAuth()
  const { products, accounts, stock, today } = useLedger()
  const { notify } = useToast()
  const [moveId] = useState(() => newId(user!.uid, 'inventoryMoves'))
  const [busy, setBusy] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const trackedProducts = products.filter((p) => p.trackStock && p.active)
  const [input, setInput] = useState<InventoryInput>({ kind, productId, date: today, quantity: '', unitCost: '', direction: 'in', accountId: '', payStatus: 'paid', supplier: '', note: '', refundAmount: '' })

  const product = products.find((p) => p.id === input.productId)
  const payAccounts = accounts.filter((a) => a.businessId === product?.businessId && a.status === 'active' && a.accountType !== 'investment')
  const ctx = useMemo(() => ({ products, accounts, stock, today }), [products, accounts, stock, today])
  const autoAccount = input.accountId || (payAccounts.length === 1 ? payAccounts[0]!.id : '')
  const effective = useMemo(() => ({ ...input, accountId: autoAccount }), [input, autoAccount])
  const v = useMemo(() => validateInventory(effective, ctx), [effective, ctx])
  const set = <K extends keyof InventoryInput>(k: K, val: InventoryInput[K]) => setInput((p) => ({ ...p, [k]: val }))
  const st = product ? (stock.get(product.id) ?? emptyStock()) : emptyStock()
  const avg = avgCostMinor(st)
  const err = (m?: string) => (showErrors && m ? <p className="field-error" role="alert">{m}</p> : null)
  const showCost = !(kind === 'adjustment' && input.direction === 'out')
  const needsAccount = kind === 'purchase' || (kind === 'return' && input.refundAmount.trim() !== '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setShowErrors(true)
    if (!inventoryIsValid(v) || busy) return
    setBusy(true)
    try {
      const r = await createInventoryMove(user!.uid, buildInventory(effective, ctx, moveId))
      notify(r === 'duplicate' ? 'info' : 'success', r === 'duplicate' ? 'Este movimiento ya estaba registrado.' : 'Stock actualizado.')
      onDone()
    } catch (x) { notify('error', humanizeFirebaseError(x)); setBusy(false) }
  }

  if (trackedProducts.length === 0) return <p>Primero activa “Controlar unidades en stock” en al menos un producto.</p>

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="iv-prod">Producto</label>
        <select id="iv-prod" value={input.productId} onChange={(e) => set('productId', e.target.value)}>
          <option value="">Elige un producto…</option>
          {trackedProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>{err(v.errors.productId)}
        {product ? <p className="field-hint">Ahora: {st.units} unidad(es){avg !== null ? ` · costo promedio ${formatMinor(avg)}` : ''}</p> : null}
      </div>
      {kind === 'adjustment' ? (
        <div className="field"><label htmlFor="iv-dir">El ajuste…</label>
          <select id="iv-dir" value={input.direction} onChange={(e) => set('direction', e.target.value as 'in' | 'out')}><option value="in">Suma unidades (conteo físico, hallazgo)</option><option value="out">Resta unidades (pérdida, daño, regalo)</option></select>
        </div>
      ) : null}
      <div className="grid-3">
        <div className="field"><label htmlFor="iv-qty">Unidades</label><input id="iv-qty" inputMode="numeric" value={input.quantity} onChange={(e) => set('quantity', e.target.value)} />{err(v.errors.quantity)}</div>
        {showCost ? <div className="field"><label htmlFor="iv-cost">Costo por unidad (USD)</label><input id="iv-cost" inputMode="decimal" value={input.unitCost} onChange={(e) => set('unitCost', e.target.value)} />{err(v.errors.unitCost)}</div> : <div />}
        <div className="field"><label htmlFor="iv-date">Fecha</label><input id="iv-date" type="date" value={input.date} onChange={(e) => set('date', e.target.value)} />{err(v.errors.date)}</div>
      </div>
      {kind === 'purchase' ? (
        <>
          <div className="grid-2">
            <div className="field"><label htmlFor="iv-supplier">Proveedor (opcional)</label><input id="iv-supplier" value={input.supplier} onChange={(e) => set('supplier', e.target.value)} />{err(v.errors.supplier)}</div>
            <div className="field"><label htmlFor="iv-pay">Pago</label><select id="iv-pay" value={input.payStatus} onChange={(e) => set('payStatus', e.target.value as 'paid' | 'pending')}><option value="paid">Pagada</option><option value="pending">Pendiente de pago</option></select></div>
          </div>
        </>
      ) : null}
      {kind === 'return' ? <div className="field"><label htmlFor="iv-refund">Dinero devuelto al cliente (USD, opcional)</label><input id="iv-refund" inputMode="decimal" value={input.refundAmount} onChange={(e) => set('refundAmount', e.target.value)} />{err(v.errors.refundAmount)}<p className="field-hint">Si lo indicas, se registra como “Devolución a un cliente” y reduce tus ingresos netos.</p></div> : null}
      {needsAccount ? (
        <div className="field"><label htmlFor="iv-acc">{kind === 'purchase' ? 'Cuenta con la que pagas' : 'Cuenta de donde sale el reembolso'}</label>
          <select id="iv-acc" value={effective.accountId} onChange={(e) => set('accountId', e.target.value)}><option value="">Elige una cuenta…</option>{payAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{err(v.errors.accountId)}
        </div>
      ) : null}
      {kind === 'adjustment' || kind === 'return' ? <div className="field"><label htmlFor="iv-note">Motivo{kind === 'adjustment' ? '' : ' (opcional)'}</label><input id="iv-note" value={input.note} onChange={(e) => set('note', e.target.value)} maxLength={200} />{err(v.errors.note)}</div> : null}
      {v.totalCostMinor !== null && !v.errors.quantity ? (
        <div className="preview" role="note" aria-label="Resumen del movimiento de stock">
          <strong>Resumen</strong>
          <p>{kind === 'adjustment' && input.direction === 'out' ? 'Salen' : 'Entran'} {v.quantity} unidad(es) por un valor de {formatMinor(v.totalCostMinor)}.{kind === 'purchase' ? (input.payStatus === 'paid' ? ' Sale de tu cuenta ahora, pero NO es gasto: pasa a inventario y se vuelve costo cuando vendes.' : ' Queda pendiente de pago: no cambia tu saldo todavía.') : ' No mueve dinero.'}</p>
        </div>
      ) : null}
      {showErrors && !inventoryIsValid(v) ? <p className="form-error" role="alert">Revisa los campos marcados antes de guardar.</p> : null}
      <div className="row modal-actions"><Button type="submit" loading={busy}>Guardar</Button><Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button></div>
    </form>
  )
}
