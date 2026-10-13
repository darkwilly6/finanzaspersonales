import { useMemo, useState } from 'react'
import { ArrowLeftRight, Ban, CheckCircle2, Pencil } from 'lucide-react'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { useToast } from '../../components/feedback/Toast'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from './LedgerData'
import { useRegister } from './RegisterContext'
import { STATUS_LABELS, type Transaction } from '../../domain/types/ledger'
import { TYPE_RULES, cashDelta } from '../../domain/calculations/transactionRules'
import { formatDateEs } from '../../domain/calculations/dates'
import { setTransactionsStatus, voidTransactions } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

const PAGE = 100

export function TransactionList({ rows, emptyText }: { rows: Transaction[]; emptyText?: string }) {
  const { user } = useAuth()
  const { accounts, categories, transactions, today } = useLedger()
  const { openTransaction } = useRegister()
  const { notify } = useToast()
  const [visible, setVisible] = useState(PAGE)
  const [voiding, setVoiding] = useState<Transaction | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])
  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const pairOf = (t: Transaction) => (t.transferId ? transactions.filter((x) => x.transferId === t.transferId) : t.saleId ? transactions.filter((x) => x.saleId === t.saleId) : [t])

  async function confirm(t: Transaction) {
    if (t.date > today) { notify('error', 'Este movimiento tiene fecha futura. Edítalo y ponle la fecha real antes de confirmarlo.'); return }
    setBusy(true)
    try {
      await setTransactionsStatus(user!.uid, pairOf(t), 'confirmed')
      notify('success', 'Movimiento confirmado.')
    } catch (e) { notify('error', humanizeFirebaseError(e)) } finally { setBusy(false) }
  }

  async function doVoid() {
    if (!voiding) return
    if (reason.trim().length < 3) return
    setBusy(true)
    try {
      await voidTransactions(user!.uid, pairOf(voiding).filter((x) => x.status !== 'cancelled'), reason)
      notify('success', voiding.transferId ? 'Transferencia anulada en ambas cuentas.' : voiding.saleId ? 'Venta anulada.' : 'Movimiento anulado. Se conserva en el historial.')
      setVoiding(null); setReason('')
    } catch (e) { notify('error', humanizeFirebaseError(e)) } finally { setBusy(false) }
  }

  if (rows.length === 0) return <div className="empty"><p>{emptyText ?? 'No hay movimientos con estos filtros.'}</p></div>

  return (
    <>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Fecha</th><th>Detalle</th><th>Cuenta</th><th>Estado</th><th className="num">Importe</th><th><span className="sr-only">Acciones</span></th></tr>
          </thead>
          <tbody>
            {rows.slice(0, visible).map((t) => {
              const rule = TYPE_RULES[t.type]
              const cat = t.categoryId ? catMap.get(t.categoryId) : undefined
              const delta = t.status === 'cancelled' || t.status === 'planned' || t.status === 'pending'
                ? cashDelta({ ...t, status: 'confirmed' }) // signo teórico para mostrar
                : cashDelta(t)
              const real = cashDelta(t) !== 0
              const openState = t.status === 'planned' || t.status === 'pending'
              const editable = openState && !t.saleId // un movimiento de venta no se edita: su monto debe cuadrar con la venta
              return (
                <tr key={t.id} className={t.status === 'cancelled' ? 'is-void' : openState ? 'is-soft' : ''}>
                  <td data-label="Fecha">{formatDateEs(t.date)}</td>
                  <td data-label="Detalle">
                    <strong>{rule.label}{t.type === 'transfer' ? (t.direction === 'out' ? ' · salida' : ' · entrada') : ''}</strong>
                    <span className="muted small block">
                      {t.type === 'transfer' ? <><ArrowLeftRight size={12} aria-hidden /> {accName.get(t.counterpartAccountId ?? '') ?? 'Cuenta'}</> : null}
                      {t.description || t.counterparty ? ` ${[t.description, t.counterparty].filter(Boolean).join(' · ')}` : ''}
                    </span>
                    {cat ? <span className="chip"><i style={{ background: cat.color }} aria-hidden />{cat.name}</span> : null}
                    {t.status === 'cancelled' && t.voidReason ? <span className="tiny muted block">Motivo: {t.voidReason}</span> : null}
                  </td>
                  <td data-label="Cuenta">{accName.get(t.accountId) ?? '—'}</td>
                  <td data-label="Estado"><span className={`tag tag-${t.status}`}>{STATUS_LABELS[t.status]}</span></td>
                  <td data-label="Importe" className={`num ${real ? '' : 'muted'}`}>
                    <Money minor={delta === 0 ? t.amountMinor : delta} tone={real} />
                  </td>
                  <td className="actions">
                    {t.status !== 'cancelled' ? (
                      <>
                        {editable ? <button type="button" className="icon-btn" title="Editar" aria-label="Editar movimiento" onClick={() => openTransaction({ edit: t })}><Pencil size={16} aria-hidden /></button> : null}
                        {openState ? <button type="button" className="icon-btn" title="Confirmar" aria-label="Confirmar movimiento" disabled={busy} onClick={() => confirm(t)}><CheckCircle2 size={16} aria-hidden /></button> : null}
                        <button type="button" className="icon-btn" title="Anular" aria-label="Anular movimiento" onClick={() => { setVoiding(t); setReason('') }}><Ban size={16} aria-hidden /></button>
                      </>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > visible ? <div className="row"><Button variant="secondary" onClick={() => setVisible((v) => v + PAGE)}>Mostrar más ({rows.length - visible} restantes)</Button></div> : null}

      <Modal open={!!voiding} onClose={() => setVoiding(null)} title="Anular movimiento">
        {voiding ? (
          <div className="stack">
            <p>El movimiento <b>no se borra</b>: queda en el historial como anulado y deja de afectar tus saldos y reportes.{voiding.transferId ? ' Al ser una transferencia, se anulan ambos lados a la vez.' : ''}{voiding.saleId ? ' Al ser parte de una venta, se anula la venta completa (ingreso e impuesto).' : ''}</p>
            <div className="field">
              <label htmlFor="void-reason">Motivo de la anulación</label>
              <input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={150} autoFocus />
              {reason.length > 0 && reason.trim().length < 3 ? <p className="field-error" role="alert">Escribe al menos 3 caracteres.</p> : null}
            </div>
            <div className="row modal-actions">
              <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={doVoid}>Anular movimiento</Button>
              <Button variant="ghost" onClick={() => setVoiding(null)}>Cancelar</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
