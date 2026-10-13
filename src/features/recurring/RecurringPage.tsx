import { useMemo, useState } from 'react'
import { CalendarPlus, Pause, Pencil, Play, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { LedgerGate } from '../ledger/LedgerGate'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { useToast } from '../../components/feedback/Toast'
import { RecurringForm } from './RecurringForm'
import { RECURRING_FREQUENCY_LABELS, type Recurring } from '../../domain/types/ledger'
import { TYPE_RULES } from '../../domain/calculations/transactionRules'
import { addMonths, formatDateEs } from '../../domain/calculations/dates'
import { nextOccurrence, occurrencesBetween, plannedId } from '../../domain/calculations/recurrence'
import { generatePlanned, setRecurringActive } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

const HORIZONS = [1, 3, 6, 12]

function GenerateDialog({ recurring, onDone }: { recurring: Recurring; onDone: () => void }) {
  const { user } = useAuth()
  const { transactions, today } = useLedger()
  const { notify } = useToast()
  const [months, setMonths] = useState(3)
  const [busy, setBusy] = useState(false)

  const dates = useMemo(() => {
    const from = recurring.startDate > today ? recurring.startDate : today
    const all = occurrencesBetween(recurring, from, addMonths(today, months))
    const existing = new Set(transactions.filter((t) => t.recurringId === recurring.id).map((t) => t.id))
    return all.filter((d) => !existing.has(plannedId(recurring.id, d)))
  }, [recurring, transactions, today, months])

  async function run() {
    setBusy(true)
    try {
      const n = await generatePlanned(user!.uid, recurring, dates)
      notify('success', n === 0 ? 'No había nada nuevo que crear.' : `${n} movimiento(s) planificado(s) creados.`)
      onDone()
    } catch (e) { notify('error', humanizeFirebaseError(e)); setBusy(false) }
  }

  return (
    <div className="stack">
      <p>Se crearán movimientos <b>planificados</b> de <b>{recurring.name}</b>. No cambian tus saldos hasta que los confirmes, y puedes editar o anular cada uno.</p>
      <div className="field">
        <label htmlFor="gen-months">Generar los próximos</label>
        <select id="gen-months" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {HORIZONS.map((m) => <option key={m} value={m}>{m} {m === 1 ? 'mes' : 'meses'}</option>)}
        </select>
      </div>
      {dates.length === 0 ? <p className="muted">Ya existen todos los movimientos de este periodo. Nada que crear.</p> : (
        <>
          <p><b>{dates.length}</b> movimiento(s) nuevos: {dates.slice(0, 6).map(formatDateEs).join(', ')}{dates.length > 6 ? '…' : ''}</p>
        </>
      )}
      <div className="row modal-actions">
        <Button loading={busy} disabled={dates.length === 0} onClick={run}>{dates.length ? `Crear ${dates.length} planificado(s)` : 'Nada que crear'}</Button>
        <Button variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </div>
  )
}

export function RecurringPage() {
  const { user } = useAuth()
  const { recurring, accounts, transactions, today } = useLedger()
  const { notify } = useToast()
  const [editing, setEditing] = useState<Recurring | 'new' | null>(null)
  const [generating, setGenerating] = useState<Recurring | null>(null)
  const accName = new Map(accounts.map((a) => [a.id, a.name]))

  async function toggle(r: Recurring) {
    try { await setRecurringActive(user!.uid, r.id, r.name, !r.active); notify('success', r.active ? 'Pago fijo pausado.' : 'Pago fijo reactivado.') }
    catch (e) { notify('error', humanizeFirebaseError(e)) }
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Pagos fijos</h1><p className="muted">Suscripciones, alquiler, cobros recurrentes. Defínelos una vez y genera sus movimientos planificados cuando quieras. También alimentan la proyección de tu caja.</p></div>
        <Button icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>Nuevo pago fijo</Button>
      </header>
      <LedgerGate>
        {recurring.length === 0 ? (
          <div className="empty"><h2>Aún no tienes pagos fijos</h2><p>Crea el primero, por ejemplo tu alquiler o una suscripción. Necesitas al menos una cuenta.</p><Button onClick={() => setEditing('new')} disabled={accounts.length === 0}>Crear mi primer pago fijo</Button>{accounts.length === 0 ? <p className="tiny">Primero crea una cuenta en “Cuentas y saldos”.</p> : null}</div>
        ) : (
          <ul className="cards">
            {recurring.map((r) => {
              const next = r.active ? nextOccurrence(r, today) : null
              const generated = transactions.filter((t) => t.recurringId === r.id && (t.status === 'planned' || t.status === 'pending') && t.date >= today).length
              return (
                <li key={r.id} className={`card ${r.active ? '' : 'is-void'}`}>
                  <div className="card-link">
                    <div className="card-head"><strong>{r.name}</strong><span className="tag">{TYPE_RULES[r.type].label}</span>{r.active ? null : <span className="tag">Pausado</span>}</div>
                    <div className="row between"><Money minor={r.type === 'income' ? r.amountMinor : -r.amountMinor} tone className="kpi-value" /><span className="muted small">{RECURRING_FREQUENCY_LABELS[r.frequency]}</span></div>
                    <dl className="kv compact">
                      <div><dt>Cuenta</dt><dd>{accName.get(r.accountId) ?? '—'}</dd></div>
                      <div><dt>Próximo</dt><dd>{next ? formatDateEs(next) : r.active ? 'Terminado' : '—'}</dd></div>
                      <div><dt>Planificados creados</dt><dd>{generated}</dd></div>
                    </dl>
                    <div className="row">
                      <Button variant="secondary" size="sm" icon={<CalendarPlus size={14} aria-hidden />} disabled={!r.active} onClick={() => setGenerating(r)}>Generar planificados</Button>
                      <button type="button" className="icon-btn" aria-label={`Editar ${r.name}`} title="Editar" onClick={() => setEditing(r)}><Pencil size={16} aria-hidden /></button>
                      <button type="button" className="icon-btn" aria-label={r.active ? `Pausar ${r.name}` : `Reactivar ${r.name}`} title={r.active ? 'Pausar' : 'Reactivar'} onClick={() => toggle(r)}>{r.active ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}</button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </LedgerGate>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo pago fijo' : 'Editar pago fijo'} size="lg">
        {editing !== null ? <RecurringForm recurring={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
      <Modal open={!!generating} onClose={() => setGenerating(null)} title="Generar movimientos planificados">
        {generating ? <GenerateDialog recurring={generating} onDone={() => setGenerating(null)} /> : null}
      </Modal>
    </div>
  )
}
