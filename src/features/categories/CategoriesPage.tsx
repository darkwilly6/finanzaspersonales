import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Sparkles } from 'lucide-react'
import { useLedger } from '../ledger/LedgerData'
import { LedgerGate } from '../ledger/LedgerGate'
import { useAuth } from '../auth/AuthContext'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { TextField, SelectField } from '../../components/ui/Field'
import { useToast } from '../../components/feedback/Toast'
import { SUGGESTED_CATEGORIES, categoryFormSchema, categoryFormToDoc, type CategoryFormValues } from '../../domain/validation/ledger'
import type { Category } from '../../domain/types/ledger'
import { createCategoriesBatch, createCategory, newId, updateCategory } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

function CategoryForm({ category, onDone }: { category?: Category; onDone: () => void }) {
  const { user } = useAuth()
  const { businesses } = useLedger()
  const { notify } = useToast()
  const [id] = useState(() => category?.id ?? newId(user!.uid, 'categories'))
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: category ? { name: category.name, kind: category.kind, scope: category.scope, businessId: category.businessId ?? '', color: category.color } : { name: '', kind: 'expense', scope: 'shared', businessId: '', color: '#60a5fa' },
  })
  const scope = watch('scope')
  const onSubmit = handleSubmit(async (v) => {
    try {
      const doc = categoryFormToDoc(v, category?.active ?? true)
      if (category) await updateCategory(user!.uid, category.id, doc); else await createCategory(user!.uid, id, doc)
      notify('success', category ? 'Categoría actualizada.' : 'Categoría creada.'); onDone()
    } catch (e) { notify('error', humanizeFirebaseError(e)) }
  })
  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <TextField label="Nombre" error={errors.name?.message} {...register('name')} />
      <div className="grid-2">
        <SelectField label="Tipo" disabled={!!category} error={errors.kind?.message} {...register('kind')}>
          <option value="income">Ingreso</option><option value="expense">Gasto</option>
        </SelectField>
        <SelectField label="Disponible en" error={errors.scope?.message} {...register('scope')}>
          <option value="shared">Todos los ámbitos</option><option value="personal">Solo personal</option><option value="business">Un negocio</option>
        </SelectField>
      </div>
      {scope === 'business' ? (
        <SelectField label="Negocio" error={errors.businessId?.message} {...register('businessId')}>
          <option value="">Elige un negocio…</option>
          {businesses.filter((b) => b.status === 'active').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </SelectField>
      ) : null}
      <TextField label="Color" type="color" error={errors.color?.message} {...register('color')} />
      <div className="row modal-actions">
        <Button type="submit" loading={isSubmitting}>{category ? 'Guardar cambios' : 'Crear categoría'}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}

export function CategoriesPage() {
  const { user } = useAuth()
  const { categories, businesses } = useLedger()
  const { notify } = useToast()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [seeding, setSeeding] = useState(false)
  const bizName = (id: string | null) => businesses.find((b) => b.id === id)?.name ?? ''

  async function seed() {
    setSeeding(true)
    try {
      await createCategoriesBatch(user!.uid, SUGGESTED_CATEGORIES.map((c) => ({ ...c, scope: 'shared' as const, businessId: null, active: true })))
      notify('success', 'Categorías sugeridas creadas. Puedes editarlas o desactivarlas.')
    } catch (e) { notify('error', humanizeFirebaseError(e)) } finally { setSeeding(false) }
  }
  async function toggle(c: Category) {
    try { await updateCategory(user!.uid, c.id, { name: c.name, kind: c.kind, scope: c.scope, businessId: c.businessId, color: c.color, active: !c.active }) }
    catch (e) { notify('error', humanizeFirebaseError(e)) }
  }

  const section = (title: string, kind: 'income' | 'expense') => (
    <section className="panel" aria-label={title}>
      <h2>{title}</h2>
      <ul className="rows">
        {categories.filter((c) => c.kind === kind).map((c) => (
          <li key={c.id} className={c.active ? '' : 'is-void'}>
            <div><span className="chip"><i style={{ background: c.color }} aria-hidden />{c.name}</span> <span className="tiny muted">{c.scope === 'shared' ? 'Todos los ámbitos' : c.scope === 'personal' ? 'Solo personal' : bizName(c.businessId)}</span></div>
            <span />
            <div className="actions">
              <button type="button" className="icon-btn" aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)}><Pencil size={16} aria-hidden /></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(c)}>{c.active ? 'Desactivar' : 'Activar'}</button>
            </div>
          </li>
        ))}
        {categories.filter((c) => c.kind === kind).length === 0 ? <li><span className="muted">Sin categorías de este tipo.</span></li> : null}
      </ul>
    </section>
  )

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Categorías</h1><p className="muted">Clasifican tus ingresos y gastos. Las categorías no se borran: se desactivan para conservar el historial.</p></div>
        <Button icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>Nueva categoría</Button>
      </header>
      <LedgerGate>
        {categories.length === 0 ? (
          <div className="empty"><h2>Aún no hay categorías</h2><p>Puedes crear las tuyas o empezar con un conjunto sugerido y ajustarlo después.</p><Button variant="secondary" icon={<Sparkles size={16} aria-hidden />} loading={seeding} onClick={seed}>Crear categorías sugeridas</Button></div>
        ) : <>{section('Ingresos', 'income')}{section('Gastos', 'expense')}</>}
      </LedgerGate>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva categoría' : 'Editar categoría'}>
        {editing !== null ? <CategoryForm category={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  )
}
