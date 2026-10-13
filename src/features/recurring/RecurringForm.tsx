import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { TextField, SelectField } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/feedback/Toast'
import { recurringFormSchema, recurringFormToDoc, type RecurringFormValues } from '../../domain/validation/phase3'
import { RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABELS, RECURRING_TYPES, type Recurring } from '../../domain/types/ledger'
import { TYPE_RULES } from '../../domain/calculations/transactionRules'
import { createRecurring, newId, updateRecurring } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

export function RecurringForm({ recurring, onDone }: { recurring?: Recurring; onDone: () => void }) {
  const { user } = useAuth()
  const { accounts, categories, businesses, today } = useLedger()
  const { notify } = useToast()
  const [id] = useState(() => recurring?.id ?? newId(user!.uid, 'recurring'))
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: recurring
      ? { name: recurring.name, type: recurring.type, accountId: recurring.accountId, amount: (recurring.amountMinor / 100).toFixed(2), frequency: recurring.frequency, startDate: recurring.startDate, endDate: recurring.endDate ?? '', categoryId: recurring.categoryId ?? '', description: recurring.description }
      : { name: '', type: 'expense', accountId: '', amount: '', frequency: 'monthly', startDate: today, endDate: '', categoryId: '', description: '' },
  })
  const type = watch('type')
  const accountId = watch('accountId')
  const acc = accounts.find((a) => a.id === accountId)
  const kind = type === 'income' ? 'income' : type === 'expense' ? 'expense' : null
  const catOptions = categories.filter((c) => c.active && c.kind === kind && (c.scope === 'shared' || (c.scope === 'personal' && acc?.scope === 'personal') || (c.scope === 'business' && c.businessId === acc?.businessId)))
  const bizName = (bid: string | null) => businesses.find((b) => b.id === bid)?.name ?? 'Negocio'
  const active = accounts.filter((a) => a.status === 'active' || a.id === recurring?.accountId)

  const onSubmit = handleSubmit(async (v) => {
    const r = recurringFormToDoc(v, accounts, categories, recurring?.active ?? true)
    if ('error' in r) { setError(r.field, { message: r.error }); return }
    try {
      if (recurring) await updateRecurring(user!.uid, recurring.id, r.doc)
      else await createRecurring(user!.uid, id, r.doc)
      notify('success', recurring ? 'Pago fijo actualizado.' : 'Pago fijo creado.')
      onDone()
    } catch (e) { notify('error', humanizeFirebaseError(e)) }
  })

  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <TextField label="Nombre" placeholder="Ej.: Alquiler del local, Suscripción de software" error={errors.name?.message} {...register('name')} />
      <div className="grid-2">
        <SelectField label="Tipo" error={errors.type?.message} {...register('type')}>
          {RECURRING_TYPES.map((t) => <option key={t} value={t}>{TYPE_RULES[t].label}</option>)}
        </SelectField>
        <TextField label="Importe (USD)" inputMode="decimal" placeholder="0.00" error={errors.amount?.message} {...register('amount')} />
      </div>
      <SelectField label="Cuenta" error={errors.accountId?.message} {...register('accountId')}>
        <option value="">Elige una cuenta…</option>
        {active.map((a) => <option key={a.id} value={a.id}>{a.scope === 'personal' ? 'Personal' : bizName(a.businessId)} · {a.name}</option>)}
      </SelectField>
      <div className="grid-2">
        <SelectField label="Se repite" error={errors.frequency?.message} {...register('frequency')}>
          {RECURRING_FREQUENCIES.map((f) => <option key={f} value={f}>{RECURRING_FREQUENCY_LABELS[f]}</option>)}
        </SelectField>
        <TextField label="Primera fecha" type="date" hint="Mensual y anual conservan este día del mes." error={errors.startDate?.message} {...register('startDate')} />
      </div>
      <TextField label="Termina el (opcional)" type="date" error={errors.endDate?.message} {...register('endDate')} />
      {kind ? (
        <SelectField label="Categoría (opcional)" error={errors.categoryId?.message} {...register('categoryId')}>
          <option value="">Sin categoría</option>
          {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
      ) : null}
      <TextField label="Descripción (opcional)" error={errors.description?.message} {...register('description')} />
      <p className="field-hint">Esto es la plantilla. Los movimientos reales se crean como <b>planificados</b> cuando los generas, y solo cambian tus saldos cuando los confirmas.</p>
      <div className="row modal-actions">
        <Button type="submit" loading={isSubmitting}>{recurring ? 'Guardar cambios' : 'Crear pago fijo'}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}
