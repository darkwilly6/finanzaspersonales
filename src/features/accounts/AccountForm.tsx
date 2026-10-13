import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { TextField, SelectField } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/feedback/Toast'
import { accountFormSchema, accountFormToDoc, type AccountFormValues } from '../../domain/validation/ledger'
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type Account } from '../../domain/types/ledger'
import { createAccount, newId, updateAccount } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

export function AccountForm({ account, defaultBusinessId, onDone }: { account?: Account; defaultBusinessId?: string; onDone: () => void }) {
  const { user } = useAuth()
  const { businesses, today } = useLedger()
  const { notify } = useToast()
  const [newAccountId] = useState(() => account?.id ?? newId(user!.uid, 'accounts'))
  const activeBiz = businesses.filter((b) => b.status === 'active' || b.id === account?.businessId)
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: account
      ? { name: account.name, scope: account.scope, businessId: account.businessId ?? '', accountType: account.accountType, openingBalance: (account.openingBalanceMinor / 100).toFixed(2), openingBalanceDate: account.openingBalanceDate }
      : { name: '', scope: defaultBusinessId ? 'business' : activeBiz.length === 0 ? 'personal' : 'business', businessId: defaultBusinessId ?? '', accountType: 'bank', openingBalance: '', openingBalanceDate: today },
  })
  const scope = watch('scope')

  const onSubmit = handleSubmit(async (v) => {
    try {
      const doc = accountFormToDoc(v, account?.status ?? 'active')
      if (account) await updateAccount(user!.uid, account.id, doc)
      else await createAccount(user!.uid, newAccountId, doc)
      notify('success', account ? 'Cuenta actualizada.' : 'Cuenta creada.')
      onDone()
    } catch (e) { notify('error', humanizeFirebaseError(e)) }
  })

  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <TextField label="Nombre de la cuenta" placeholder="Ej.: Banco principal" error={errors.name?.message} {...register('name')} />
      <div className="grid-2">
        <SelectField label="Pertenece a" disabled={!!account} error={errors.scope?.message} {...register('scope')}>
          <option value="personal">Mis finanzas personales</option>
          <option value="business">Un negocio</option>
        </SelectField>
        {scope === 'business' ? (
          <SelectField label="Negocio" disabled={!!account} error={errors.businessId?.message} {...register('businessId')}>
            <option value="">Elige un negocio…</option>
            {activeBiz.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </SelectField>
        ) : <div />}
      </div>
      {scope === 'business' && activeBiz.length === 0 ? <p className="field-hint">Primero crea un negocio en “Negocios y marcas”.</p> : null}
      <SelectField label="Tipo de cuenta" hint="Las cuentas de inversión se reportan aparte del efectivo disponible." error={errors.accountType?.message} {...register('accountType')}>
        {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
      </SelectField>
      <div className="grid-2">
        <TextField label="Saldo inicial real (USD)" inputMode="decimal" placeholder="0.00" hint={account ? 'Cambiarlo modifica el saldo actual y queda auditado.' : 'Lo que hay hoy en la cuenta. Puede ser 0 o negativo si es una deuda.'} error={errors.openingBalance?.message} {...register('openingBalance')} />
        <TextField label="Fecha del saldo inicial" type="date" hint="Los movimientos anteriores a esta fecha no se cuentan." error={errors.openingBalanceDate?.message} {...register('openingBalanceDate')} />
      </div>
      <div className="row modal-actions">
        <Button type="submit" loading={isSubmitting}>{account ? 'Guardar cambios' : 'Crear cuenta'}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}
