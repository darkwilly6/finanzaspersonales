import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { useToast } from '../../components/feedback/Toast'
import { buildSale, saleIsValid, validateSale, type SaleInput, type SaleLineInput } from '../../domain/validation/sales'
import { formatMinor, parseMoneyToMinor } from '../../domain/calculations/money'
import { formatBps } from '../../domain/calculations/percent'
import { createSale, newId } from '../../lib/ledgerRepo'
import { avgCostMinor, emptyStock, type StockState } from '../../domain/calculations/inventory'
import { humanizeFirebaseError } from '../../lib/errors'

const EMPTY_STOCK = new Map<string, StockState>()
const emptyLine = (): SaleLineInput => ({ productId: '', name: '', quantity: '1', unitPrice: '', unitCost: '' })

export function SaleForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth()
  const { businesses, accounts, products, categories, today, stock: stockMap } = useLedger()
  const stock = stockMap ?? EMPTY_STOCK
  const { notify } = useToast()
  const activeBiz = businesses.filter((b) => b.status === 'active')
  // Un único id por formulario abierto: doble clic o reintento no duplican la venta.
  const [saleId] = useState(() => newId(user!.uid, 'sales'))
  const [businessId, setBusinessId] = useState(() => activeBiz.find((b) => accounts.some((a) => a.businessId === b.id && a.status === 'active' && a.accountType !== 'investment'))?.id ?? activeBiz[0]?.id ?? '')
  const business = activeBiz.find((b) => b.id === businessId)
  const bizAccounts = accounts.filter((a) => a.businessId === businessId && a.status === 'active' && a.accountType !== 'investment')
  const bizProducts = products.filter((p) => p.businessId === businessId && p.active)
  const [input, setInput] = useState<SaleInput>(() => ({
    accountId: '', date: today, customer: '', status: 'paid', lines: [emptyLine()], discount: '', pricesIncludeTax: business?.tax.pricesIncludeTax ?? true, categoryId: '', notes: '',
  }))
  const [busy, setBusy] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const ctx = useMemo(() => (business ? { business, accounts, products, categories, today, stock } : null), [business, accounts, products, categories, today, stock])
  const v = useMemo(() => (ctx ? validateSale({ ...input, accountId: input.accountId || (bizAccounts.length === 1 ? bizAccounts[0]!.id : '') }, ctx) : null), [ctx, input, bizAccounts])
  const effective: SaleInput = { ...input, accountId: input.accountId || (bizAccounts.length === 1 ? bizAccounts[0]!.id : '') }
  const catOptions = categories.filter((c) => c.active && c.kind === 'income' && (c.scope === 'shared' || (c.scope === 'business' && c.businessId === businessId)))

  const set = <K extends keyof SaleInput>(k: K, val: SaleInput[K]) => setInput((p) => ({ ...p, [k]: val }))
  const setLine = (i: number, patch: Partial<SaleLineInput>) => setInput((p) => ({ ...p, lines: p.lines.map((l, k) => (k === i ? { ...l, ...patch } : l)) }))
  const pick = (i: number, productId: string) => {
    const prod = bizProducts.find((p) => p.id === productId)
    setLine(i, { productId, name: '', unitCost: '', unitPrice: prod ? (prod.unitPriceMinor / 100).toFixed(2) : '' })
  }
  const changeBusiness = (id: string) => {
    const b = activeBiz.find((x) => x.id === id)
    setBusinessId(id)
    setInput((p) => ({ ...p, accountId: '', lines: [emptyLine()], categoryId: '', pricesIncludeTax: b?.tax.pricesIncludeTax ?? true }))
  }

  if (activeBiz.length === 0) return <div className="stack"><p>Para registrar ventas primero crea un negocio.</p><Link className="btn btn-primary" to="/negocios" state={{ openNew: Date.now() }} onClick={onDone}>Crear negocio</Link></div>
  if (!business || !v || !ctx) return null
  if (bizAccounts.length === 0 && activeBiz.length === 1) return <div className="stack"><p>{business.name} necesita una cuenta (efectivo, banco, billetera o procesador de pagos) donde entre el dinero de las ventas.</p><Link className="btn btn-primary" to="/cuentas" state={{ openNew: Date.now() }} onClick={onDone}>Crear cuenta</Link></div>

  const err = (m?: string) => (showErrors && m ? <p className="field-error" role="alert">{m}</p> : null)
  const valid = saleIsValid(v)
  const t = v.totals
  const taxOn = business.tax.enabled && business.tax.rateBps > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setShowErrors(true)
    if (!valid || busy || !ctx) return
    setBusy(true)
    try {
      const built = buildSale(effective, ctx, saleId)
      const r = await createSale(user!.uid, built)
      notify(r === 'duplicate' ? 'info' : 'success', r === 'duplicate' ? 'Esta venta ya estaba registrada; no se duplicó.' : 'Venta registrada.')
      onDone()
    } catch (x) { notify('error', humanizeFirebaseError(x)); setBusy(false) }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      {activeBiz.length > 1 ? (
        <div className="field"><label htmlFor="s-biz">Negocio</label>
          <select id="s-biz" value={businessId} onChange={(e) => changeBusiness(e.target.value)}>{activeBiz.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </div>
      ) : null}

      <div className="grid-3">
        <div className="field"><label htmlFor="s-date">Fecha</label><input id="s-date" type="date" value={input.date} onChange={(e) => set('date', e.target.value)} aria-invalid={showErrors && v.errors.date ? true : undefined} />{err(v.errors.date)}</div>
        <div className="field"><label htmlFor="s-acc">Cuenta donde entra</label>
          <select id="s-acc" value={effective.accountId} onChange={(e) => set('accountId', e.target.value)} aria-invalid={showErrors && v.errors.accountId ? true : undefined}>
            <option value="">Elige una cuenta…</option>{bizAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>{err(v.errors.accountId)}
        </div>
        <div className="field"><label htmlFor="s-status">Cobro</label>
          <select id="s-status" value={input.status} onChange={(e) => set('status', e.target.value as SaleInput['status'])}><option value="paid">Cobrada</option><option value="pending">Pendiente de cobro</option></select>
        </div>
      </div>
      <div className="field"><label htmlFor="s-customer">Cliente (opcional)</label><input id="s-customer" value={input.customer} onChange={(e) => set('customer', e.target.value)} maxLength={80} />{err(v.errors.customer)}</div>

      <fieldset className="fieldset">
        <legend>Productos y unidades</legend>
        {input.lines.map((l, i) => {
          const le = showErrors ? v.lineErrors[i] : undefined
          const prod = bizProducts.find((p) => p.id === l.productId)
          const qty = Number(l.quantity)
          const price = parseMoneyToMinor(l.unitPrice)
          const st = prod?.trackStock ? (stock.get(prod.id) ?? emptyStock()) : null
          const cost = st ? avgCostMinor(st) : l.unitCost.trim() !== '' ? parseMoneyToMinor(l.unitCost) : (prod?.unitCostMinor ?? null)
          const lineTotal = price !== null && Number.isInteger(qty) && qty > 0 ? qty * price : null
          const profit = lineTotal !== null && cost !== null ? lineTotal - qty * cost : null
          return (
            <div className="sale-line" key={i}>
              <div className="field">
                <label htmlFor={`l-prod-${i}`}>Producto</label>
                <select id={`l-prod-${i}`} value={l.productId} onChange={(e) => pick(i, e.target.value)} aria-invalid={le?.productId ? true : undefined}>
                  <option value="">Otro producto (escribir)</option>
                  {bizProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` · ${p.sku}` : ''}</option>)}
                </select>
                {le?.productId ? <p className="field-error" role="alert">{le.productId}</p> : null}
              </div>
              {!l.productId ? (
                <div className="field"><label htmlFor={`l-name-${i}`}>Nombre</label><input id={`l-name-${i}`} value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} aria-invalid={le?.name ? true : undefined} />{le?.name ? <p className="field-error" role="alert">{le.name}</p> : null}</div>
              ) : null}
              <div className="field"><label htmlFor={`l-qty-${i}`}>Unidades</label><input id={`l-qty-${i}`} inputMode="numeric" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} aria-invalid={le?.quantity ? true : undefined} />{le?.quantity ? <p className="field-error" role="alert">{le.quantity}</p> : null}</div>
              <div className="field"><label htmlFor={`l-price-${i}`}>Precio unitario</label><input id={`l-price-${i}`} inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} aria-invalid={le?.unitPrice ? true : undefined} />{le?.unitPrice ? <p className="field-error" role="alert">{le.unitPrice}</p> : null}</div>
              {st ? <div className="field"><span className="tiny muted">Stock: <b>{st.units}</b> unid. · costo promedio {avgCostMinor(st) === null ? '—' : formatMinor(avgCostMinor(st)!)}</span></div> : null}
              {!prod ? <div className="field"><label htmlFor={`l-cost-${i}`}>Costo unitario (opcional)</label><input id={`l-cost-${i}`} inputMode="decimal" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value })} aria-invalid={le?.unitCost ? true : undefined} />{le?.unitCost ? <p className="field-error" role="alert">{le.unitCost}</p> : null}</div> : null}
              <div className="sale-line-total">
                <span className="tiny muted">Línea</span>
                {lineTotal !== null ? <Money minor={lineTotal} /> : <span className="muted">—</span>}
                {profit !== null ? <span className="tiny">Ganas <Money minor={profit} tone /></span> : <span className="tiny muted">{cost === null ? 'Sin costo' : ''}</span>}
              </div>
              {input.lines.length > 1 ? <button type="button" className="icon-btn" aria-label={`Quitar línea ${i + 1}`} onClick={() => setInput((p) => ({ ...p, lines: p.lines.filter((_, k) => k !== i) }))}><Trash2 size={16} aria-hidden /></button> : <span />}
            </div>
          )
        })}
        {err(v.errors.lines)}
        <div className="row"><Button type="button" variant="secondary" size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => setInput((p) => ({ ...p, lines: [...p.lines, emptyLine()] }))}>Agregar producto</Button></div>
      </fieldset>

      <div className="grid-2">
        <div className="field"><label htmlFor="s-disc">Descuento total (opcional)</label><input id="s-disc" inputMode="decimal" value={input.discount} onChange={(e) => set('discount', e.target.value)} placeholder="0.00" />{err(v.errors.discount)}</div>
        <div className="field"><label htmlFor="s-cat">Categoría (opcional)</label>
          <select id="s-cat" value={input.categoryId} onChange={(e) => set('categoryId', e.target.value)}><option value="">Sin categoría</option>{catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>{err(v.errors.categoryId)}
        </div>
      </div>

      {taxOn ? (
        <div className="field"><label htmlFor="s-tax">Los precios que escribí…</label>
          <select id="s-tax" value={input.pricesIncludeTax ? 'in' : 'out'} onChange={(e) => set('pricesIncludeTax', e.target.value === 'in')}>
            <option value="in">Ya incluyen {business.tax.label} ({formatBps(business.tax.rateBps)})</option>
            <option value="out">No incluyen {business.tax.label}: se suma aparte</option>
          </select>
        </div>
      ) : null}

      <div className="field"><label htmlFor="s-notes">Notas (opcional)</label><input id="s-notes" value={input.notes} onChange={(e) => set('notes', e.target.value)} maxLength={300} /></div>

      <div className="preview" role="note" aria-label="Resumen de la venta">
        <strong>Resumen</strong>
        {t ? (
          <dl className="kv compact">
            {t.discountMinor > 0 ? <div><dt>Descuento</dt><dd>−{formatMinor(t.discountMinor)}</dd></div> : null}
            <div><dt>Ingreso tuyo</dt><dd><Money minor={t.netMinor} /></dd></div>
            {t.taxMinor > 0 ? <div><dt>{business.tax.label} cobrado (a reservar, no es ingreso)</dt><dd><Money minor={t.taxMinor} /></dd></div> : null}
            <div><dt><b>Total a cobrar al cliente</b></dt><dd><b><Money minor={t.totalMinor} /></b></dd></div>
            <div><dt>Unidades</dt><dd>{t.units}</dd></div>
            {t.costMinor !== null ? <><div><dt>Costo de lo vendido</dt><dd><Money minor={t.costMinor} /></dd></div><div><dt>Ganancia</dt><dd><Money minor={t.marginMinor ?? 0} tone />{t.marginPct !== null ? ` · ${t.marginPct.toFixed(1)} %` : ''}</dd></div></> : <div><dt>Ganancia</dt><dd className="muted">No se calcula: falta el costo de algún producto</dd></div>}
          </dl>
        ) : <p className="muted small">Completa los productos para ver el total.</p>}
        <p className="tiny muted">{input.status === 'paid' ? 'Entra al saldo de la cuenta ahora.' : 'Queda pendiente: no cambia tu saldo hasta que marques el cobro.'}</p>
      </div>
      {err(v.errors.total)}
      {showErrors && !valid ? <p className="form-error" role="alert">Revisa los campos marcados antes de guardar.</p> : null}
      <div className="row modal-actions">
        <Button type="submit" loading={busy}>Registrar venta</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}
