import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { TextField, SelectField } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/feedback/Toast'
import { businessFormSchema, businessFormToDoc, type BusinessFormValues } from '../../domain/validation/ledger'
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, PAYOUT_FREQUENCIES, PAYOUT_FREQUENCY_LABELS, PAYOUT_METHODS, PAYOUT_METHOD_LABELS, type Business } from '../../domain/types/ledger'
import { createBusiness, newId, updateBusiness } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

function toForm(b: Business | undefined, today: string): BusinessFormValues {
  if (!b) {
    return { name: '', description: '', type: 'physical', startDate: today, payoutMethod: 'owner_draw', payoutFrequency: 'monthly', payoutCustomDays: '', minReserve: '', taxEnabled: false, taxLabel: 'IVA', taxRate: '', taxPricesInclude: 'included', allocReserve: '', allocReinvest: '', allocOwner: '', notes: '' }
  }
  return {
    name: b.name, description: b.description, type: b.type, startDate: b.startDate, payoutMethod: b.payout.method, payoutFrequency: b.payout.frequency,
    payoutCustomDays: b.payout.customDays ? String(b.payout.customDays) : '', minReserve: b.reserve.minReserveMinor ? (b.reserve.minReserveMinor / 100).toFixed(2) : '',
    taxEnabled: b.tax.enabled, taxLabel: b.tax.label || 'IVA', taxRate: b.tax.rateBps ? String(b.tax.rateBps / 100) : '', taxPricesInclude: b.tax.pricesIncludeTax ? 'included' : 'separate',
    allocReserve: b.allocation ? String(b.allocation.reserveBps / 100) : '', allocReinvest: b.allocation ? String(b.allocation.reinvestBps / 100) : '', allocOwner: b.allocation ? String(b.allocation.ownerBps / 100) : '', notes: b.notes,
  }
}

export function BusinessForm({ business, onDone }: { business?: Business; onDone: () => void }) {
  const { user } = useAuth()
  const { today } = useLedger()
  const { notify } = useToast()
  // Id fijado al abrir: un doble clic no crea dos negocios.
  const [newBusinessId] = useState(() => business?.id ?? newId(user!.uid, 'businesses'))
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<BusinessFormValues>({ resolver: zodResolver(businessFormSchema), defaultValues: toForm(business, today) })
  const freq = watch('payoutFrequency')
  const taxOn = watch('taxEnabled')
  const type = watch('type')

  const onSubmit = handleSubmit(async (v) => {
    try {
      const doc = businessFormToDoc(v, business?.status ?? 'active')
      if (business) await updateBusiness(user!.uid, business.id, doc)
      else await createBusiness(user!.uid, newBusinessId, doc)
      notify('success', business ? 'Negocio actualizado.' : 'Negocio creado.')
      onDone()
    } catch (e) { notify('error', humanizeFirebaseError(e)) }
  })

  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <div className="grid-2">
        <TextField label="Nombre" error={errors.name?.message} {...register('name')} />
        <SelectField label="Tipo de negocio" error={errors.type?.message} {...register('type')}>
          {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{BUSINESS_TYPE_LABELS[t]}</option>)}
        </SelectField>
      </div>
      <div className="grid-2">
        <TextField label="Fecha de inicio" type="date" error={errors.startDate?.message} {...register('startDate')} />
        <TextField label="Moneda" value="USD (dólar estadounidense)" readOnly hint="La primera versión trabaja solo en USD." />
      </div>
      <TextField label="Descripción (opcional)" error={errors.description?.message} {...register('description')} />

      <fieldset className="fieldset">
        <legend>Cómo te pagas de este negocio</legend>
        <div className="grid-2">
          <SelectField label="Método" error={errors.payoutMethod?.message} {...register('payoutMethod')}>
            {PAYOUT_METHODS.map((m) => <option key={m} value={m}>{PAYOUT_METHOD_LABELS[m]}</option>)}
          </SelectField>
          <SelectField label="Frecuencia" error={errors.payoutFrequency?.message} {...register('payoutFrequency')}>
            {PAYOUT_FREQUENCIES.map((f) => <option key={f} value={f}>{PAYOUT_FREQUENCY_LABELS[f]}</option>)}
          </SelectField>
        </div>
        {freq === 'custom' ? <TextField label="Cada cuántos días" inputMode="numeric" error={errors.payoutCustomDays?.message} {...register('payoutCustomDays')} /> : null}
        <TextField label="Reserva mínima de efectivo (USD)" inputMode="decimal" placeholder="0.00" hint="Efectivo que el negocio no debería bajar de este nivel. Se usará para calcular cuánto puedes pagarte." error={errors.minReserve?.message} {...register('minReserve')} />
      </fieldset>

      <fieldset className="fieldset">
        <legend>Reparto de lo que genera (opcional)</legend>
        <p className="field-hint">Cómo repartir el excedente: reserva, reinversión y lo que te corresponde. Los tres deben sumar 100. Déjalo vacío si aún no lo defines: Capital OS no inventa porcentajes.</p>
        <div className="grid-3">
          <TextField label="Reserva (%)" inputMode="decimal" error={errors.allocReserve?.message} {...register('allocReserve')} />
          <TextField label="Reinversión (%)" inputMode="decimal" error={errors.allocReinvest?.message} {...register('allocReinvest')} />
          <TextField label="Para mí (%)" inputMode="decimal" error={errors.allocOwner?.message} {...register('allocOwner')} />
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Impuestos indirectos (opcional)</legend>
        <label className="check"><input type="checkbox" {...register('taxEnabled')} /> Este negocio cobra impuestos indirectos (por ejemplo IVA)</label>
        {taxOn ? (
          <>
            <div className="grid-2">
              <TextField label="Nombre del impuesto" error={errors.taxLabel?.message} {...register('taxLabel')} />
              <TextField label="Tasa (%)" inputMode="decimal" placeholder="Escríbela tú" error={errors.taxRate?.message} {...register('taxRate')} />
            </div>
            <SelectField label="Por defecto, el precio de venta…" {...register('taxPricesInclude')}>
              <option value="included">Ya incluye el impuesto</option>
              <option value="separate">No lo incluye: se añade aparte</option>
            </SelectField>
            <p className="field-hint">Solo es una configuración. Capital OS no calcula obligaciones legales por su cuenta ni asume el tratamiento fiscal de tus operaciones.</p>
          </>
        ) : null}
      </fieldset>

      {type === 'physical' ? <p className="field-hint">Valoración de inventario: costo promedio ponderado (método inicial).</p> : null}
      <TextField label="Notas (opcional)" error={errors.notes?.message} {...register('notes')} />
      <div className="row modal-actions">
        <Button type="submit" loading={isSubmitting}>{business ? 'Guardar cambios' : 'Crear negocio'}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}
