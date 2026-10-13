import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Plus, Power } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { useFilters } from '../ledger/FilterContext'
import { FilterBar } from '../ledger/FilterBar'
import { LedgerGate } from '../ledger/LedgerGate'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { TextField, SelectField } from '../../components/ui/Field'
import { useToast } from '../../components/feedback/Toast'
import { productFormSchema, productFormToDoc, type ProductFormValues } from '../../domain/validation/sales'
import { lineBreakdown, saleStatus } from '../../domain/calculations/sales'
import type { Product } from '../../domain/types/ledger'
import { createProduct, newId, setProductActive, updateProduct } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

function ProductForm({ product, defaultBusinessId, onDone }: { product?: Product; defaultBusinessId: string; onDone: () => void }) {
  const { user } = useAuth()
  const { businesses } = useLedger()
  const { notify } = useToast()
  const [id] = useState(() => product?.id ?? newId(user!.uid, 'products'))
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: product
      ? { name: product.name, sku: product.sku, businessId: product.businessId, price: (product.unitPriceMinor / 100).toFixed(2), cost: product.unitCostMinor === null ? '' : (product.unitCostMinor / 100).toFixed(2), trackStock: !!product.trackStock, reorderPoint: product.reorderPoint ? String(product.reorderPoint) : '' }
      : { name: '', sku: '', businessId: defaultBusinessId, price: '', cost: '', trackStock: false, reorderPoint: '' },
  })
  const track = watch('trackStock')
  const onSubmit = handleSubmit(async (v) => {
    try {
      const d = productFormToDoc(v, product?.active ?? true)
      if (product) await updateProduct(user!.uid, product.id, d); else await createProduct(user!.uid, id, d)
      notify('success', product ? 'Producto actualizado.' : 'Producto creado.'); onDone()
    } catch (e) { notify('error', humanizeFirebaseError(e)) }
  })
  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <TextField label="Nombre del producto" placeholder="Ej.: Camisa oversize negra" error={errors.name?.message} {...register('name')} />
      <div className="grid-2">
        <TextField label="Código o SKU (opcional)" error={errors.sku?.message} {...register('sku')} />
        <SelectField label="Negocio" disabled={!!product} error={errors.businessId?.message} {...register('businessId')}>
          <option value="">Elige un negocio…</option>
          {businesses.filter((b) => b.status === 'active' || b.id === product?.businessId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </SelectField>
      </div>
      <div className="grid-2">
        <TextField label="Precio de venta (USD)" inputMode="decimal" placeholder="0.00" error={errors.price?.message} {...register('price')} />
        <TextField label="Costo por unidad (USD, opcional)" inputMode="decimal" placeholder="0.00" hint="Con el costo se calcula la ganancia. Vacío = aún no lo sabes (no se asume cero)." error={errors.cost?.message} {...register('cost')} />
      </div>
      <label className="check"><input type="checkbox" {...register('trackStock')} /> Controlar unidades en stock (costo promedio ponderado)</label>
      {track ? (
        <>
          <TextField label="Avisarme cuando queden (unidades, opcional)" inputMode="numeric" error={errors.reorderPoint?.message} {...register('reorderPoint')} />
          <p className="field-hint">Con stock controlado, el costo de cada venta sale del costo promedio de tus compras y no puedes vender más unidades de las que tienes. Registra el stock inicial y las compras en Stock.</p>
        </>
      ) : null}
      <p className="field-hint">El precio y el costo son valores por defecto: al vender puedes cambiarlos. Cada venta guarda el costo de ese momento, así que cambiarlo después no altera tu historial.</p>
      <div className="row modal-actions">
        <Button type="submit" loading={isSubmitting}>{product ? 'Guardar cambios' : 'Crear producto'}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}

export function ProductsPage() {
  const { user } = useAuth()
  const { products, businesses, sales, transactions } = useLedger()
  const { range } = useFilters()
  const { notify } = useToast()
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [bizFilter, setBizFilter] = useState('')
  const bizName = (id: string) => businesses.find((b) => b.id === id)?.name ?? '—'
  const activeBiz = businesses.filter((b) => b.status === 'active')

  const stats = useMemo(() => {
    const cancelled = new Set(sales.filter((s) => saleStatus(transactions.filter((t) => t.saleId === s.id)) === 'cancelled').map((s) => s.id))
    const map = new Map<string, { units: number; profit: number; unknown: number }>()
    for (const sale of sales) {
      if (cancelled.has(sale.id)) continue
      if (range && (sale.date < range.from || sale.date > range.to)) continue
      for (const row of lineBreakdown(sale)) {
        const id = row.line.productId
        if (!id) continue
        const cur = map.get(id) ?? { units: 0, profit: 0, unknown: 0 }
        cur.units += row.line.quantity
        if (row.profitMinor === null) cur.unknown += 1
        else cur.profit += row.profitMinor
        map.set(id, cur)
      }
    }
    return map
  }, [sales, transactions, range])

  const rows = products.filter((p) => !bizFilter || p.businessId === bizFilter)

  async function toggle(p: Product) {
    try { await setProductActive(user!.uid, p.id, p.name, !p.active); notify('success', p.active ? 'Producto desactivado.' : 'Producto reactivado.') }
    catch (e) { notify('error', humanizeFirebaseError(e)) }
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Productos</h1><p className="muted">Tu catálogo para vender más rápido y ver cuánto deja cada producto. Es opcional: también puedes vender escribiendo el producto a mano.</p></div>
        <Button icon={<Plus size={16} aria-hidden />} disabled={activeBiz.length === 0} onClick={() => setEditing('new')}>Nuevo producto</Button>
      </header>
      <div className="row">
        <FilterBar hideScope compact />
        {activeBiz.length > 1 ? (
          <label className="inline-field"><span className="sr-only">Negocio</span>
            <select value={bizFilter} onChange={(e) => setBizFilter(e.target.value)} aria-label="Negocio">
              <option value="">Todos los negocios</option>
              {activeBiz.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <LedgerGate>
        {activeBiz.length === 0 ? (
          <div className="empty"><h2>Primero crea un negocio</h2><p>Los productos pertenecen a un negocio.</p></div>
        ) : rows.length === 0 ? (
          <div className="empty"><h2>Aún no hay productos</h2><p>Crea tu catálogo con precio y costo. Después, al registrar una venta, eliges el producto y la app calcula la ganancia.</p><Button onClick={() => setEditing('new')}>Crear mi primer producto</Button></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Producto</th><th className="num">Precio</th><th className="num">Costo</th><th className="num">Ganancia / unidad</th><th className="num">Vendidas</th><th className="num">Ganancia del periodo</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const st = stats.get(p.id)
                  const unit = p.unitCostMinor === null ? null : p.unitPriceMinor - p.unitCostMinor
                  return (
                    <tr key={p.id} className={p.active ? '' : 'is-void'}>
                      <td data-label="Producto"><strong>{p.name}</strong>{p.sku ? <span className="tiny muted block">{p.sku}</span> : null}{businesses.length > 1 ? <span className="tiny muted block">{bizName(p.businessId)}</span> : null}{p.active ? null : <span className="tag">Desactivado</span>}</td>
                      <td data-label="Precio" className="num"><Money minor={p.unitPriceMinor} /></td>
                      <td data-label="Costo" className="num">{p.trackStock ? <span className="tiny muted">promedio del stock</span> : p.unitCostMinor === null ? <span className="muted" title="Costo aún no indicado">—</span> : <Money minor={p.unitCostMinor} />}</td>
                      <td data-label="Ganancia / unidad" className="num">{unit === null ? <span className="muted">—</span> : <><Money minor={unit} tone />{p.unitPriceMinor > 0 ? <span className="tiny muted block">{((unit / p.unitPriceMinor) * 100).toFixed(0)} % del precio</span> : null}</>}</td>
                      <td data-label="Vendidas" className="num">{st?.units ?? 0}</td>
                      <td data-label="Ganancia del periodo" className="num">{!st ? <span className="muted">—</span> : <><Money minor={st.profit} tone />{st.unknown > 0 ? <span className="tiny muted block" title="Hay ventas de este producto sin costo conocido">parcial</span> : null}</>}</td>
                      <td className="actions">
                        <button type="button" className="icon-btn" aria-label={`Editar ${p.name}`} title="Editar" onClick={() => setEditing(p)}><Pencil size={16} aria-hidden /></button>
                        <button type="button" className="icon-btn" aria-label={p.active ? `Desactivar ${p.name}` : `Reactivar ${p.name}`} title={p.active ? 'Desactivar' : 'Reactivar'} onClick={() => toggle(p)}><Power size={16} aria-hidden /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="tiny muted">La ganancia es ingreso propio (sin impuesto y con el descuento ya repartido) menos el costo de lo vendido. Para controlar unidades, compras y costo promedio, activa el stock de cada producto y usa la sección Stock.</p>
      </LedgerGate>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'} size="lg">
        {editing !== null ? <ProductForm product={editing === 'new' ? undefined : editing} defaultBusinessId={bizFilter || activeBiz[0]?.id || ''} onDone={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  )
}
