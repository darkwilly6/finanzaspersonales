import { useMemo, useState } from 'react'
import { Pencil, Plus, Power } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { useToast } from '../../components/feedback/Toast'
import { budgetStatus, type BudgetStatus } from '../../domain/calculations/budgets'
import { formatMinor, parseMoneyToMinor } from '../../domain/calculations/money'
import { formatDateEs } from '../../domain/calculations/dates'
import { BUDGET_PERIODS, BUDGET_PERIOD_LABELS, type Budget, type BudgetPeriod } from '../../domain/types/ledger'
import { createBudget, newId, updateBudget } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

function BudgetForm({ budget, onDone }: { budget?: Budget; onDone: () => void }) {
  const { user } = useAuth()
  const { businesses, categories } = useLedger()
  const { notify } = useToast()
  const [id] = useState(() => budget?.id ?? newId(user!.uid, 'budgets'))
  const [f, setF] = useState({
    name: budget?.name ?? '',
    period: (budget?.period ?? 'month') as BudgetPeriod,
    scope: budget?.scope ?? 'all',
    categoryId: budget?.categoryId ?? '',
    limit: budget ? (budget.limitMinor / 100).toFixed(2) : '',
  })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const limit = parseMoneyToMinor(f.limit)
  const errors = {
    name: f.name.trim().length < 2 ? 'Ponle un nombre (por ejemplo "Gastos personales del mes").' : '',
    limit: limit === null || limit <= 0 ? 'Escribe un límite mayor que cero.' : '',
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setShow(true)
    if (errors.name || errors.limit || busy) return
    setBusy(true)
    try {
      const doc = { name: f.name.trim(), period: f.period, scope: f.scope, categoryId: f.categoryId || null, limitMinor: limit!, active: budget?.active ?? true }
      if (budget) await updateBudget(user!.uid, budget.id, doc)
      else await createBudget(user!.uid, id, doc)
      notify('success', budget ? 'Límite actualizado.' : 'Límite creado.')
      onDone()
    } catch (x) {
      notify('error', humanizeFirebaseError(x))
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="bg-name">Nombre</label>
        <input id="bg-name" value={f.name} maxLength={60} onChange={(e) => setF({ ...f, name: e.target.value })} />
        {show && errors.name ? <p className="field-error" role="alert">{errors.name}</p> : null}
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="bg-period">Periodo</label>
          <select id="bg-period" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value as BudgetPeriod })}>
            {BUDGET_PERIODS.map((p) => <option key={p} value={p}>{BUDGET_PERIOD_LABELS[p]} (se reinicia solo)</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="bg-limit">Límite (USD)</label>
          <input id="bg-limit" inputMode="decimal" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} placeholder="0.00" />
          {show && errors.limit ? <p className="field-error" role="alert">{errors.limit}</p> : null}
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="bg-scope">Qué gastos cuenta</label>
          <select id="bg-scope" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>
            <option value="all">Todos (personal y negocios)</option>
            <option value="personal">Solo personales</option>
            {businesses.filter((b) => b.status === 'active').map((b) => <option key={b.id} value={b.id}>Solo {b.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="bg-cat">Categoría (opcional)</label>
          <select id="bg-cat" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">Todas</option>
            {categories.filter((c) => c.kind === 'expense' && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <p className="field-hint">Solo cuentan los gastos confirmados. Te avisamos al llegar al 80 % y al pasarte, y te decimos cuánto margen te queda.</p>
      <div className="row modal-actions">
        <Button type="submit" loading={busy}>{budget ? 'Guardar cambios' : 'Crear límite'}</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  )
}

const LEVEL_COLOR = { ok: 'var(--accent)', near: 'var(--warn)', over: 'var(--neg)' } as const

function BudgetRow({ s, scopeName, onEdit, onToggle }: { s: BudgetStatus; scopeName: string; onEdit: () => void; onToggle: () => void }) {
  const { budget } = s
  return (
    <li className={`budget-row level-${s.level} ${budget.active ? '' : 'is-void'}`}>
      <div className="share-head">
        <span>
          <strong>{budget.name}</strong> <span className="tiny muted">{BUDGET_PERIOD_LABELS[budget.period]} · {scopeName}{!budget.active ? ' · desactivado' : ''}</span>
        </span>
        <span><Money minor={s.spentMinor} /> / <b>{formatMinor(budget.limitMinor)}</b> <span className="muted small">{Math.round(s.pct)} %</span></span>
      </div>
      <div className="share-track" role="progressbar" aria-label={budget.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(s.pct))}>
        <div className="share-fill" style={{ width: `${Math.min(100, s.pct)}%`, background: LEVEL_COLOR[s.level] }} />
      </div>
      <div className="row between">
        <span className={s.level === 'over' ? 'neg' : s.level === 'near' ? 'warn-text' : 'muted small'}>
          {s.level === 'over' ? <>Te pasaste por <b>{formatMinor(-s.remainingMinor)}</b></> : <>Te quedan <b>{formatMinor(s.remainingMinor)}</b> de margen</>}
          <span className="tiny muted"> · {formatDateEs(s.window.from)}{s.window.to !== s.window.from ? ` – ${formatDateEs(s.window.to)}` : ''}</span>
        </span>
        <span className="row">
          <button type="button" className="icon-btn" aria-label={`Editar ${budget.name}`} onClick={onEdit}><Pencil size={14} aria-hidden /></button>
          <button type="button" className="icon-btn" aria-label={budget.active ? `Desactivar ${budget.name}` : `Activar ${budget.name}`} title={budget.active ? 'Desactivar' : 'Activar'} onClick={onToggle}><Power size={14} aria-hidden /></button>
        </span>
      </div>
      {s.projectedMinor !== null && s.level !== 'over' && s.projectedMinor > budget.limitMinor ? <p className="tiny warn-text">A este ritmo cerrarías el periodo en {formatMinor(s.projectedMinor)}, por encima de tu límite.</p> : null}
    </li>
  )
}

export function BudgetsPanel() {
  const { user } = useAuth()
  const { budgets, businesses, accounts, transactions, today } = useLedger()
  const { notify } = useToast()
  const [editing, setEditing] = useState<Budget | 'new' | null>(null)

  const rows = useMemo(() => budgets.map((b) => budgetStatus(b, accounts, transactions, today)), [budgets, accounts, transactions, today])
  const scopeName = (scope: string) => (scope === 'all' ? 'todos los gastos' : scope === 'personal' ? 'personales' : (businesses.find((b) => b.id === scope)?.name ?? 'negocio'))

  async function toggle(b: Budget) {
    try {
      await updateBudget(user!.uid, b.id, { name: b.name, period: b.period, scope: b.scope, categoryId: b.categoryId, limitMinor: b.limitMinor, active: !b.active })
    } catch (e) {
      notify('error', humanizeFirebaseError(e))
    }
  }

  const active = rows.filter((r) => r.budget.active)
  const inactive = rows.filter((r) => !r.budget.active)

  return (
    <section className="panel" aria-labelledby="budgets-title">
      <div className="row between">
        <h2 id="budgets-title">Límites de gasto</h2>
        <Button size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => setEditing('new')}>Nuevo límite</Button>
      </div>
      <p className="muted small">Fija cuánto quieres gastar como máximo por día, semana o mes. Te avisamos al acercarte y cuando te pases, y siempre ves cuánto margen te queda.</p>
      {rows.length === 0 ? (
        <p className="muted">Aún no tienes límites. Ejemplos: “$30 al día en gastos personales”, “$400 al mes en publicidad”.</p>
      ) : (
        <ul className="budget-list">
          {active.map((s) => <BudgetRow key={s.budget.id} s={s} scopeName={scopeName(s.budget.scope)} onEdit={() => setEditing(s.budget)} onToggle={() => toggle(s.budget)} />)}
        </ul>
      )}
      {inactive.length ? (
        <details>
          <summary className="muted small">Desactivados ({inactive.length})</summary>
          <ul className="budget-list">
            {inactive.map((s) => <BudgetRow key={s.budget.id} s={s} scopeName={scopeName(s.budget.scope)} onEdit={() => setEditing(s.budget)} onToggle={() => toggle(s.budget)} />)}
          </ul>
        </details>
      ) : null}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nuevo límite de gasto' : 'Editar límite'}>
        {editing !== null ? <BudgetForm budget={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
    </section>
  )
}
