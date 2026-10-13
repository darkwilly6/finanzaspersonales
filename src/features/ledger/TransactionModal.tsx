import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/feedback/Toast'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from './LedgerData'
import { TYPE_RULES } from '../../domain/calculations/transactionRules'
import { formatMinor } from '../../domain/calculations/money'
import { buildTransactionDocs, validateTransaction, type TransactionInput } from '../../domain/validation/ledger'
import { STATUS_LABELS, TRANSACTION_TYPES, TRANSFER_PURPOSE_LABELS, TRANSFER_PURPOSES, type Account, type Transaction, type TransactionType } from '../../domain/types/ledger'
import { createTransactions, newId, updateTransactions } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

export interface OpenOptions { type?: TransactionType; edit?: Transaction; prefill?: Partial<TransactionInput> }

function accountOptions(accounts: Account[], businessName: (id: string | null) => string) {
  const groups = new Map<string, Account[]>()
  for (const a of accounts.filter((x) => x.status === 'active')) {
    const key = a.scope === 'personal' ? 'Personal' : businessName(a.businessId)
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  return [...groups.entries()]
}

function AccountSelect({ id, label, value, onChange, error, exclude, groups, businessOnly }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; exclude?: string
  groups: [string, Account[]][]; businessOnly?: boolean
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined}>
        <option value="">Elige una cuenta…</option>
        {groups.map(([g, list]) => (
          <optgroup key={g} label={g}>
            {list.filter((a) => a.id !== exclude).map((a) => <option key={a.id} value={a.id} disabled={businessOnly && a.scope !== 'business'}>{a.name}</option>)}
          </optgroup>
        ))}
      </select>
      {error ? <p className="field-error" role="alert">{error}</p> : null}
    </div>
  )
}

export function TransactionModal({ open, onClose, options }: { open: boolean; onClose: () => void; options: OpenOptions }) {
  return (
    <Modal open={open} onClose={onClose} title={options.edit ? 'Editar movimiento' : 'Registrar movimiento'} size="lg">
      {open ? <TransactionForm options={options} onDone={onClose} /> : null}
    </Modal>
  )
}

function TransactionForm({ options, onDone }: { options: OpenOptions; onDone: () => void }) {
  const { user } = useAuth()
  const { accounts, categories, businesses, today } = useLedger()
  const { notify } = useToast()
  const edit = options.edit
  // Un único id por formulario abierto: el doble clic o un reintento nunca duplican el movimiento.
  const [baseId] = useState(() => (edit ? (edit.transferId ?? edit.id) : newId(user!.uid, 'transactions')))
  const [busy, setBusy] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const [input, setInput] = useState<TransactionInput>(() => {
    if (edit) {
      const out = edit.type === 'transfer' && edit.direction === 'in' ? undefined : edit
      const source = edit.type === 'transfer' && edit.direction === 'in' ? edit.counterpartAccountId ?? '' : edit.accountId
      return {
        type: edit.type, status: edit.status === 'planned' || edit.status === 'pending' ? edit.status : 'confirmed', date: edit.date,
        amount: (edit.amountMinor / 100).toFixed(2), accountId: out ? edit.accountId : source,
        destinationAccountId: edit.type === 'transfer' ? (edit.direction === 'in' ? edit.accountId : (edit.counterpartAccountId ?? '')) : '',
        transferPurpose: edit.transferPurpose ?? 'internal', direction: edit.direction ?? 'in', categoryId: edit.categoryId ?? '',
        description: edit.description, counterparty: edit.counterparty,
      }
    }
    return {
      type: options.type ?? 'income', status: 'confirmed', date: today, amount: '', accountId: '', destinationAccountId: '',
      transferPurpose: 'internal', direction: 'in', categoryId: '', description: '', counterparty: '',
      ...options.prefill,
    }
  })

  const ctx = useMemo(() => ({ accounts, categories, today }), [accounts, categories, today])
  const { errors, amountMinor } = useMemo(() => validateTransaction(input, ctx), [input, ctx])
  const valid = Object.keys(errors).length === 0
  const rule = TYPE_RULES[input.type]
  const bizName = (id: string | null) => businesses.find((b) => b.id === id)?.name ?? 'Negocio'
  const groups = accountOptions(accounts, bizName)
  const set = <K extends keyof TransactionInput>(k: K, v: TransactionInput[K]) => setInput((p) => ({ ...p, [k]: v }))
  const err = (k: keyof TransactionInput) => (showErrors ? errors[k] : undefined)
  const src = accounts.find((a) => a.id === input.accountId)
  const dst = accounts.find((a) => a.id === input.destinationAccountId)
  const catOptions = categories.filter((c) => c.active && c.kind === rule.categoryKind && (c.scope === 'shared' || (c.scope === 'personal' && src?.scope === 'personal') || (c.scope === 'business' && c.businessId === src?.businessId)))

  if (accounts.filter((a) => a.status === 'active').length === 0) {
    return (
      <div className="stack">
        <p>Para registrar movimientos primero necesitas al menos una cuenta con su saldo inicial real.</p>
        <Link className="btn btn-primary" to="/cuentas" state={{ openNew: Date.now() }} onClick={onDone}>Crear mi primera cuenta</Link>
      </div>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setShowErrors(true)
    if (!valid || busy) return
    setBusy(true)
    try {
      const built = buildTransactionDocs(input, ctx, baseId)
      if (edit) {
        await updateTransactions(user!.uid, built)
        notify('success', 'Movimiento actualizado.')
      } else {
        const r = await createTransactions(user!.uid, built)
        notify(r === 'duplicate' ? 'info' : 'success', r === 'duplicate' ? 'Este movimiento ya estaba registrado; no se duplicó.' : input.type === 'transfer' ? 'Transferencia registrada en ambas cuentas.' : 'Movimiento registrado.')
      }
      onDone()
    } catch (x) {
      notify('error', humanizeFirebaseError(x))
      setBusy(false)
    }
  }

  const fieldErr = (m?: string, id?: string) => (m ? <p className="field-error" id={id} role="alert">{m}</p> : null)
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="tx-type">Tipo de movimiento</label>
        <select id="tx-type" value={input.type} disabled={!!edit} onChange={(e) => setInput((p) => ({ ...p, type: e.target.value as TransactionType, categoryId: '', destinationAccountId: '' }))}>
          {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_RULES[t].label}</option>)}
        </select>
        <p className="field-hint">{rule.help}</p>
      </div>

      <div className="grid-2">
        <div className="field">
          <label htmlFor="tx-amount">Importe (USD)</label>
          <input id="tx-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={input.amount} onChange={(e) => set('amount', e.target.value)} aria-invalid={err('amount') ? true : undefined} />
          {amountMinor !== null ? <p className="field-hint">Se registrará {formatMinor(amountMinor, 'USD')}</p> : null}
          {fieldErr(err('amount'))}
        </div>
        <div className="field">
          <label htmlFor="tx-date">Fecha</label>
          <input id="tx-date" type="date" value={input.date} onChange={(e) => set('date', e.target.value)} aria-invalid={err('date') ? true : undefined} />
          {fieldErr(err('date'))}
        </div>
      </div>

      {input.type === 'transfer' ? (
        <>
          <div className="grid-2">
            <AccountSelect groups={groups} businessOnly={rule.businessOnly} id="tx-from" label="Desde la cuenta" value={input.accountId} onChange={(v) => set('accountId', v)} error={err('accountId')} />
            <AccountSelect groups={groups} businessOnly={rule.businessOnly} id="tx-to" label="Hacia la cuenta" value={input.destinationAccountId} onChange={(v) => set('destinationAccountId', v)} error={err('destinationAccountId')} exclude={input.accountId} />
          </div>
          <div className="field">
            <label htmlFor="tx-purpose">Motivo</label>
            <select id="tx-purpose" value={input.transferPurpose} onChange={(e) => set('transferPurpose', e.target.value as TransactionInput['transferPurpose'])}>
              {TRANSFER_PURPOSES.map((p) => <option key={p} value={p}>{TRANSFER_PURPOSE_LABELS[p]}</option>)}
            </select>
            {fieldErr(err('transferPurpose'))}
          </div>
        </>
      ) : (
        <AccountSelect groups={groups} businessOnly={rule.businessOnly} id="tx-account" label="Cuenta" value={input.accountId} onChange={(v) => set('accountId', v)} error={err('accountId')} />
      )}

      {input.type === 'adjustment' ? (
        <div className="field">
          <label htmlFor="tx-dir">El ajuste…</label>
          <select id="tx-dir" value={input.direction} onChange={(e) => set('direction', e.target.value as 'in' | 'out')}>
            <option value="in">Suma al saldo de la cuenta</option>
            <option value="out">Resta del saldo de la cuenta</option>
          </select>
          {fieldErr(err('direction'))}
        </div>
      ) : null}

      {rule.categoryKind ? (
        <div className="field">
          <label htmlFor="tx-cat">Categoría (opcional)</label>
          <select id="tx-cat" value={input.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="">Sin categoría</option>
            {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {catOptions.length === 0 ? <p className="field-hint">No hay categorías para este tipo. Puedes crearlas en <Link to="/categorias" onClick={onDone}>Categorías</Link>.</p> : null}
          {fieldErr(err('categoryId'))}
        </div>
      ) : null}

      <div className="grid-2">
        <div className="field">
          <label htmlFor="tx-party">Contraparte (opcional)</label>
          <input id="tx-party" value={input.counterparty} onChange={(e) => set('counterparty', e.target.value)} placeholder="Cliente, proveedor…" />
          {fieldErr(err('counterparty'))}
        </div>
        <div className="field">
          <label htmlFor="tx-status">Estado</label>
          <select id="tx-status" value={input.status} onChange={(e) => set('status', e.target.value as TransactionInput['status'])}>
            <option value="confirmed">{STATUS_LABELS.confirmed} (ya ocurrió)</option>
            <option value="pending">{STATUS_LABELS.pending} (aún no se cobra o paga)</option>
            <option value="planned">{STATUS_LABELS.planned} (futuro)</option>
          </select>
          <p className="field-hint">Solo los confirmados cambian tus saldos.</p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="tx-desc">Descripción{input.type === 'adjustment' ? '' : ' (opcional)'}</label>
        <input id="tx-desc" value={input.description} onChange={(e) => set('description', e.target.value)} maxLength={200} />
        {fieldErr(err('description'))}
      </div>

      {valid && amountMinor !== null ? (
        <div className="preview" role="note" aria-label="Vista previa del efecto">
          <strong>Vista previa</strong>
          {input.type === 'transfer' && src && dst ? (
            <p>Saldrán {formatMinor(amountMinor, 'USD')} de <b>{src.name}</b> y entrarán en <b>{dst.name}</b>. Se crearán dos registros vinculados. No cuenta como ingreso ni gasto.</p>
          ) : (
            <p>{input.status === 'confirmed' ? 'Cambia el saldo de' : 'No cambia todavía el saldo de'} <b>{src?.name}</b>: {rule.cash === 'in' || (rule.cash === 'by_direction' && input.direction === 'in') ? '+' : '−'}{formatMinor(amountMinor, 'USD')}. {rule.pnl === 'none' ? 'No cuenta como ingreso ni gasto operativo.' : rule.pnl === 'income' ? 'Cuenta como ingreso.' : rule.pnl === 'expense' ? 'Cuenta como gasto operativo.' : 'Reduce los ingresos netos.'}</p>
          )}
        </div>
      ) : null}

      {showErrors && !valid ? <p className="form-error" role="alert">Revisa los campos marcados antes de guardar.</p> : null}
      <div className="row modal-actions">
        <Button type="submit" loading={busy}>{edit ? 'Guardar cambios' : input.type === 'transfer' ? 'Confirmar transferencia' : 'Guardar movimiento'}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}
