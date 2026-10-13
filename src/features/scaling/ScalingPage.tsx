import { useMemo, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { LedgerGate } from '../ledger/LedgerGate'
import { useLedger } from '../ledger/LedgerData'
import { useAuth } from '../auth/AuthContext'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { useToast } from '../../components/feedback/Toast'
import { businessComparison, monthlySeries, percentChange } from '../../domain/calculations/analytics'
import { cogsFor } from '../../domain/calculations/cogs'
import { addMonths, endOfMonth, isValidDateString, startOfMonth } from '../../domain/calculations/dates'
import { goalProgress } from '../../domain/calculations/goals'
import { parseMoneyToMinor, formatMinor } from '../../domain/calculations/money'
import { averageMonthly, projectScenario } from '../../domain/calculations/scenario'
import { summarize } from '../../domain/calculations/summary'
import { totalsByKind } from '../../domain/calculations/transactionRules'
import { withCogs } from '../../domain/calculations/cogs'
import { GOAL_KINDS, GOAL_KIND_LABELS, type Goal, type GoalKind } from '../../domain/types/ledger'
import { createGoal, newId, updateGoal } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

const WINDOWS = [1, 3, 6, 12]

function Comparator() {
  const { businesses, accounts, transactions, sales, cancelledSaleIds, balances, today } = useLedger()
  const [n, setN] = useState(3)
  const active = businesses.filter((b) => b.status === 'active')

  const { rows, notes } = useMemo(() => {
    const from = startOfMonth(addMonths(today, -(n - 1)))
    const pFrom = startOfMonth(addMonths(today, -(2 * n - 1)))
    const pTo = endOfMonth(addMonths(today, -n))
    const live = transactions.filter((t) => t.status !== 'cancelled')
    const cogsOf = (f: string, t: string) => (ids: ReadonlySet<string>) => cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: ids, from: f, to: t })
    const cur = businessComparison(active, accounts, live.filter((t) => t.date >= from && t.date <= today), cogsOf(from, today))
    const prev = businessComparison(active, accounts, live.filter((t) => t.date >= pFrom && t.date <= pTo), cogsOf(pFrom, pTo))
    const out = cur.map((r) => {
      const ids = new Set(accounts.filter((a) => a.businessId === r.businessId).map((a) => a.id))
      const cash = totalsByKind(accounts.filter((a) => ids.has(a.id)), balances).cashMinor
      const p = prev.find((x) => x.businessId === r.businessId)
      const monthlyOut = (r.summary.expenses + r.summary.cogs) / n
      return { ...r, growth: p ? percentChange(r.summary.netIncome, p.summary.netIncome) : null, cash, cushion: monthlyOut > 0 ? cash / monthlyOut : null }
    })
    const best = <K extends 'marginPct' | 'growth' | 'cushion'>(k: K, dir: 'max' | 'min') => {
      const list = out.filter((r) => r[k] !== null)
      if (list.length < 2) return null
      return list.reduce((m, r) => (dir === 'max' ? (r[k]! > m[k]! ? r : m) : (r[k]! < m[k]! ? r : m)))
    }
    const msgs: string[] = []
    const m = best('marginPct', 'max'); if (m) msgs.push(`Mayor margen: ${m.name} (${m.marginPct!.toFixed(1)} %).`)
    const g = best('growth', 'max'); if (g) msgs.push(`Mayor crecimiento de ingresos: ${g.name} (${g.growth! > 0 ? '+' : ''}${g.growth!.toFixed(1)} %).`)
    const c = best('cushion', 'min'); if (c) msgs.push(`Menor colchón de efectivo: ${c.name} (${c.cushion!.toFixed(1)} meses de gastos).`)
    return { rows: out, notes: msgs }
  }, [active, accounts, transactions, sales, cancelledSaleIds, balances, today, n])

  return (
    <section className="panel" aria-labelledby="cmp-title">
      <div className="row between">
        <h2 id="cmp-title">Comparador de negocios</h2>
        <label className="inline-field"><span className="sr-only">Ventana</span>
          <select value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Ventana de comparación">{WINDOWS.map((w) => <option key={w} value={w}>Últimos {w} {w === 1 ? 'mes' : 'meses'}</option>)}</select>
        </label>
      </div>
      {rows.length === 0 ? <p className="muted">Aún no hay negocios activos.</p> : (
        <>
          <div className="table-wrap flat">
            <table className="table">
              <thead><tr><th>Negocio</th><th className="num">Ingresos netos</th><th className="num">Resultado</th><th className="num">Margen</th><th className="num">Crecimiento</th><th className="num">Efectivo</th><th className="num">Colchón</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.businessId}>
                    <td data-label="Negocio"><strong>{r.name}</strong></td>
                    <td data-label="Ingresos netos" className="num"><Money minor={r.summary.netIncome} /></td>
                    <td data-label="Resultado" className="num"><Money minor={r.summary.operatingResult} tone /></td>
                    <td data-label="Margen" className="num">{r.marginPct === null ? <span className="muted" title="Sin ingresos en el periodo">—</span> : `${r.marginPct.toFixed(1)} %`}</td>
                    <td data-label="Crecimiento" className="num">{r.growth === null ? <span className="muted" title="Sin base de comparación">—</span> : <span className={r.growth >= 0 ? 'pos' : 'neg'}>{r.growth > 0 ? '+' : ''}{r.growth.toFixed(1)} %</span>}</td>
                    <td data-label="Efectivo" className="num"><Money minor={r.cash} /></td>
                    <td data-label="Colchón" className="num">{r.cushion === null ? <span className="muted">—</span> : `${r.cushion.toFixed(1)} m`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {notes.length ? <ul className="plain">{notes.map((x) => <li key={x}>{x}</li>)}</ul> : null}
          <p className="tiny muted">Crecimiento: ingresos netos contra la ventana anterior de igual duración. Colchón: meses que cubre tu efectivo con el gasto mensual promedio (gastos + costo de lo vendido). Son datos para decidir, no una recomendación: ningún negocio “merece” más inversión solo por un indicador.</p>
        </>
      )}
    </section>
  )
}

function GoalForm({ goal, onDone }: { goal?: Goal; onDone: () => void }) {
  const { user } = useAuth()
  const { businesses } = useLedger()
  const { notify } = useToast()
  const [id] = useState(() => goal?.id ?? newId(user!.uid, 'goals'))
  const [f, setF] = useState({ name: goal?.name ?? '', kind: (goal?.kind ?? 'cash') as GoalKind, businessId: goal?.businessId ?? '', target: goal ? (goal.targetMinor / 100).toFixed(2) : '', targetDate: goal?.targetDate ?? '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const target = parseMoneyToMinor(f.target)
  const errors = {
    name: f.name.trim().length < 2 ? 'Escribe el nombre de la meta.' : '',
    target: target === null || target <= 0 ? 'Escribe un importe mayor que cero.' : '',
    targetDate: f.targetDate !== '' && !isValidDateString(f.targetDate) ? 'Fecha no válida.' : '',
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setShow(true)
    if (errors.name || errors.target || errors.targetDate || busy) return
    setBusy(true)
    try {
      const doc = { name: f.name.trim(), kind: f.kind, businessId: f.businessId || null, targetMinor: target!, targetDate: f.targetDate || null, active: goal?.active ?? true }
      if (goal) await updateGoal(user!.uid, goal.id, doc); else await createGoal(user!.uid, id, doc)
      notify('success', goal ? 'Meta actualizada.' : 'Meta creada.'); onDone()
    } catch (x) { notify('error', humanizeFirebaseError(x)); setBusy(false) }
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="g-name">Nombre</label><input id="g-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />{show && errors.name ? <p className="field-error" role="alert">{errors.name}</p> : null}</div>
      <div className="grid-2">
        <div className="field"><label htmlFor="g-kind">Qué quieres lograr</label><select id="g-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as GoalKind })}>{GOAL_KINDS.map((k) => <option key={k} value={k}>{GOAL_KIND_LABELS[k]}</option>)}</select></div>
        <div className="field"><label htmlFor="g-biz">Dónde</label><select id="g-biz" value={f.businessId} onChange={(e) => setF({ ...f, businessId: e.target.value })}><option value="">Todo (consolidado)</option>{businesses.filter((b) => b.status === 'active').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      </div>
      <div className="grid-2">
        <div className="field"><label htmlFor="g-target">Objetivo (USD)</label><input id="g-target" inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} />{show && errors.target ? <p className="field-error" role="alert">{errors.target}</p> : null}</div>
        <div className="field"><label htmlFor="g-date">Fecha objetivo (opcional)</label><input id="g-date" type="date" value={f.targetDate} onChange={(e) => setF({ ...f, targetDate: e.target.value })} />{show && errors.targetDate ? <p className="field-error" role="alert">{errors.targetDate}</p> : null}</div>
      </div>
      <div className="row modal-actions"><Button type="submit" loading={busy}>{goal ? 'Guardar cambios' : 'Crear meta'}</Button><Button type="button" variant="ghost" onClick={onDone}>Cancelar</Button></div>
    </form>
  )
}

function Goals() {
  const { user } = useAuth()
  const { goals, businesses, accounts, transactions, sales, cancelledSaleIds, balances, today } = useLedger()
  const { notify } = useToast()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const bizName = (id: string | null) => (id ? (businesses.find((b) => b.id === id)?.name ?? '—') : 'Todo')

  const rows = goals.filter((g) => g.active).map((g) => {
    const accs = g.businessId ? accounts.filter((a) => a.businessId === g.businessId) : accounts
    const ids = new Set(accs.map((a) => a.id))
    const from = startOfMonth(today)
    const s = withCogs(summarize(transactions.filter((t) => t.status !== 'cancelled' && ids.has(t.accountId) && t.date >= from && t.date <= today), g.businessId ? ids : null), cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: g.businessId ? ids : null, from, to: today }))
    const p = goalProgress(g, { cashMinor: totalsByKind(accs, balances).cashMinor, monthResultMinor: s.operatingResult, monthRevenueMinor: s.netIncome })
    return { g, p }
  })

  async function archive(g: Goal) {
    try { await updateGoal(user!.uid, g.id, { name: g.name, kind: g.kind, businessId: g.businessId, targetMinor: g.targetMinor, targetDate: g.targetDate, active: false }); notify('success', 'Meta archivada.') }
    catch (e) { notify('error', humanizeFirebaseError(e)) }
  }

  return (
    <section className="panel" aria-labelledby="goals-title">
      <div className="row between"><h2 id="goals-title">Metas</h2><Button size="sm" icon={<Plus size={14} aria-hidden />} onClick={() => setEditing('new')}>Nueva meta</Button></div>
      {rows.length === 0 ? <p className="muted">Aún no tienes metas. Por ejemplo: “Tener $5,000 de efectivo” o “Ingresos netos de $3,000 al mes”.</p> : (
        <ul className="share-list">
          {rows.map(({ g, p }) => (
            <li key={g.id}>
              <div className="share-head"><span><strong>{g.name}</strong> <span className="tiny muted">{GOAL_KIND_LABELS[g.kind]} · {bizName(g.businessId)}{g.targetDate ? ` · para el ${g.targetDate}` : ''}</span></span>
                <span><Money minor={p.currentMinor} /> / <b>{formatMinor(g.targetMinor)}</b> <span className="muted small">{p.pct === null ? '' : `${Math.min(999, p.pct).toFixed(0)} %`}</span></span></div>
              <div className="share-track" role="progressbar" aria-label={g.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(p.pct ?? 0))}><div className="share-fill" style={{ width: `${Math.min(100, p.pct ?? 0)}%`, background: p.reached ? 'var(--pos)' : 'var(--info)' }} /></div>
              <div className="row"><button type="button" className="icon-btn" aria-label={`Editar ${g.name}`} onClick={() => setEditing(g)}><Pencil size={14} aria-hidden /></button><button type="button" className="btn btn-ghost btn-sm" onClick={() => archive(g)}>Archivar</button>{p.reached ? <span className="tag tag-confirmed">Lograda</span> : null}</div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva meta' : 'Editar meta'}>{editing !== null ? <GoalForm goal={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} /> : null}</Modal>
    </section>
  )
}

const pct = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) && n >= -100 && n <= 1000 ? n : null }

function Scenario() {
  const { businesses, accounts, transactions, sales, cancelledSaleIds, today } = useLedger()
  const active = businesses.filter((b) => b.status === 'active')
  const [bizId, setBizId] = useState(active[0]?.id ?? '')
  const [f, setF] = useState({ income: '10', expenses: '0', cogs: '10', extra: '', invest: '' })

  const baseline = useMemo(() => {
    const ids = new Set(accounts.filter((a) => a.businessId === bizId).map((a) => a.id))
    const txs = transactions.filter((t) => t.status !== 'cancelled' && ids.has(t.accountId))
    const series = monthlySeries(txs, ids, today, 4, (from, to) => cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: ids, from, to }).cogsMinor).slice(0, 3)
    return averageMonthly(series.map((m) => ({ netIncomeMinor: m.netIncomeMinor, expensesMinor: m.expensesMinor, cogsMinor: m.cogsMinor })))
  }, [accounts, transactions, sales, cancelledSaleIds, bizId, today])

  const inc = pct(f.income), exp = pct(f.expenses), cg = pct(f.cogs)
  const extra = f.extra.trim() === '' ? 0 : parseMoneyToMinor(f.extra)
  const inv = f.invest.trim() === '' ? 0 : parseMoneyToMinor(f.invest)
  const valid = inc !== null && exp !== null && cg !== null && extra !== null && inv !== null
  const r = valid ? projectScenario(baseline, { incomePct: inc, expensesPct: exp, cogsPct: cg, extraMonthlyCostMinor: extra, oneTimeInvestmentMinor: inv }) : null

  return (
    <section className="panel" aria-labelledby="sc-title">
      <h2 id="sc-title">Simulador de escenarios</h2>
      <p className="muted small">¿Qué pasa cada mes si cambian tus ingresos, tus gastos o tu costo? Parte del promedio de los últimos 3 meses completos de ese negocio. No guarda nada.</p>
      {active.length === 0 ? <p className="muted">Primero crea un negocio.</p> : (
        <>
          <div className="grid-3">
            <div className="field"><label htmlFor="sc-biz">Negocio</label><select id="sc-biz" value={bizId} onChange={(e) => setBizId(e.target.value)}>{active.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <div className="field"><label htmlFor="sc-inc">Ingresos netos (%)</label><input id="sc-inc" inputMode="decimal" value={f.income} onChange={(e) => setF({ ...f, income: e.target.value })} /></div>
            <div className="field"><label htmlFor="sc-exp">Gastos (%)</label><input id="sc-exp" inputMode="decimal" value={f.expenses} onChange={(e) => setF({ ...f, expenses: e.target.value })} /></div>
            <div className="field"><label htmlFor="sc-cogs">Costo de lo vendido (%)</label><input id="sc-cogs" inputMode="decimal" value={f.cogs} onChange={(e) => setF({ ...f, cogs: e.target.value })} /></div>
            <div className="field"><label htmlFor="sc-extra">Costo mensual extra (USD)</label><input id="sc-extra" inputMode="decimal" value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} placeholder="0.00" /></div>
            <div className="field"><label htmlFor="sc-inv">Inversión única (USD)</label><input id="sc-inv" inputMode="decimal" value={f.invest} onChange={(e) => setF({ ...f, invest: e.target.value })} placeholder="0.00" /></div>
          </div>
          {!valid ? <p className="field-error" role="alert">Revisa los valores: porcentajes entre -100 y 1000, e importes válidos.</p> : null}
          {r ? (
            <dl className="kv" aria-label="Resultado del escenario">
              <div><dt>Resultado mensual actual (promedio)</dt><dd><Money minor={r.baselineResultMinor} tone /></dd></div>
              <div><dt>Resultado mensual del escenario</dt><dd><b><Money minor={r.projectedResultMinor} tone /></b></dd></div>
              <div><dt>Cambio por mes</dt><dd><Money minor={r.deltaMonthlyMinor} tone /></dd></div>
              <div><dt>Recuperas la inversión en</dt><dd>{r.paybackMonths === null ? <span className="muted">{(inv ?? 0) > 0 ? 'No se recupera con este escenario' : '—'}</span> : `${r.paybackMonths.toFixed(1)} meses`}</dd></div>
            </dl>
          ) : null}
          {baseline.netIncomeMinor === 0 && baseline.expensesMinor === 0 ? <p className="tiny muted">Este negocio aún no tiene meses completos con movimientos: el punto de partida es cero.</p> : null}
        </>
      )}
    </section>
  )
}

export function ScalingPage() {
  return (
    <div className="page wide">
      <header className="page-head"><div><h1>Escalado</h1><p className="muted">Compara tus negocios, fija metas y prueba qué pasaría si cambias tus números, antes de mover dinero.</p></div></header>
      <LedgerGate><Comparator /><Goals /><Scenario /></LedgerGate>
    </div>
  )
}
