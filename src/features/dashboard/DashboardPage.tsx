import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowDownRight, ArrowLeftRight, ArrowUpRight, Bell, CalendarDays, CheckCircle2, Circle, Eye, EyeOff, Landmark, LineChart as LineIcon, Minus, OctagonAlert, Plus, Info, TrendingDown, TrendingUp, User, Wallet, Wallet2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { useFilters } from '../ledger/FilterContext'
import { FilterBar } from '../ledger/FilterBar'
import { LedgerGate } from '../ledger/LedgerGate'
import { useRegister } from '../ledger/RegisterContext'
import { useAlerts, useScopedForecast } from '../ledger/useInsights'
import { KpiCard } from '../../components/ui/KpiCard'
import { LineChart, Sparkline } from '../../components/charts/Charts'
import { Skeleton } from '../../components/feedback/Skeleton'
import { balancesAsOf, totalBalanceSeries } from '../../domain/calculations/balanceSeries'
import { computeAllocation, policyIsValid } from '../../domain/calculations/allocation'
import { percentChange, previousPeriod } from '../../domain/calculations/analytics'
import { cogsFor, withCogs } from '../../domain/calculations/cogs'
import { addDays, addMonths, endOfMonth, monthKey } from '../../domain/calculations/dates'
import { forecastCash } from '../../domain/calculations/forecast'
import { formatMinor } from '../../domain/calculations/money'
import { pickSuggestion } from '../../domain/calculations/suggestion'
import { summarize } from '../../domain/calculations/summary'
import { TYPE_RULES, cashDelta } from '../../domain/calculations/transactionRules'
import type { Transaction, TransactionType } from '../../domain/types/ledger'

const HIDE_KEY = 'capitalos.hideBalances'
const shortDate = (s: string) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${s}T00:00:00Z`)).replace('.', '')

function Delta({ cur, prev, invert = false }: { cur: number; prev: number | null; invert?: boolean }) {
  if (prev === null) return <span className="delta-none">sin comparación</span>
  const pct = percentChange(cur, prev)
  if (pct === null) return <span className="delta-none">sin base de comparación</span>
  const flat = Math.abs(pct) < 0.05
  const good = invert ? pct < 0 : pct > 0
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight
  return <span className={`delta ${flat ? '' : good ? 'delta-good' : 'delta-bad'}`}><Icon size={13} aria-hidden /> {pct > 0 ? '+' : ''}{pct.toFixed(1)} %</span>
}

const MOVE_ICON: Partial<Record<TransactionType, { icon: typeof TrendingUp; tone: string }>> = {
  income: { icon: TrendingUp, tone: 'green' }, trading_withdrawal: { icon: TrendingUp, tone: 'green' }, tax_collected: { icon: TrendingUp, tone: 'teal' },
  transfer: { icon: ArrowLeftRight, tone: 'blue' }, investment: { icon: LineIcon, tone: 'purple' },
}
const SEVERITY_ICON = { critical: OctagonAlert, warning: AlertTriangle, info: Info }

export function DashboardPage() {
  const { user, profile, profileError, reloadProfile } = useAuth()
  const { businesses, accounts, transactions, sales, cancelledSaleIds, recurring, balances, today } = useLedger()
  const allBiz = businesses
  const { scopeAccounts, scopeIds, scoped, range } = useFilters()
  const { openTransaction } = useRegister()
  const [days, setDays] = useState(60)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDE_KEY) === '1' } catch { return false } })
  const forecast = useScopedForecast(days)
  const alerts = useAlerts()
  const first = (profile?.profile.displayName || user?.displayName || '').split(' ')[0] ?? ''

  const toggleHidden = () => setHidden((h) => { try { localStorage.setItem(HIDE_KEY, h ? '0' : '1') } catch { /* sin almacenamiento */ } return !h })
  const money = (m: number) => formatMinor(m, 'USD')
  const mask = (m: number) => (hidden ? '••••••' : money(m))

  const d = useMemo(() => {
    const inRange = (f: string, t: string) => scoped.filter((x) => x.date >= f && x.date <= t)
    const build = (txs: Transaction[], from?: string, to?: string) => {
      const s = summarize(txs, scopeIds)
      const cogs = cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: scopeIds, from, to }).cogsMinor
      // Resultado operativo del panel: ingresos netos − gastos de negocio − costo de lo vendido (no incluye gastos personales).
      return { ...s, cogsMinor: cogs, result: s.netIncome - s.expensesBusiness - cogs }
    }
    const cur = build(range ? inRange(range.from, range.to) : scoped, range?.from, range?.to)
    const pr = range ? previousPeriod(range.from, range.to) : null
    const prev = pr ? build(inRange(pr.from, pr.to), pr.from, pr.to) : null
    const now = balancesAsOf(scopeAccounts, transactions, today)
    const before = balancesAsOf(scopeAccounts, transactions, endOfMonth(addMonths(today, -1)))
    const series = totalBalanceSeries(scopeAccounts, transactions, today, 30).map((p) => p.totalMinor)
    return { cur, prev, now, before, series }
  }, [scoped, scopeIds, range, sales, cancelledSaleIds, scopeAccounts, transactions, today])

  const latest = useMemo(() => {
    const ids = new Set(scopeAccounts.map((a) => a.id))
    return [...scoped]
      .filter((t) => !(t.type === 'transfer' && t.direction === 'in' && t.counterpartAccountId && ids.has(t.counterpartAccountId)))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)))
      .slice(0, 5)
  }, [scoped, scopeAccounts])

  const upcoming = useMemo(() => forecast.items.filter((i) => i.date <= addDays(today, 14)).slice(0, 5), [forecast.items, today])
  const vals = forecast.points.map((p) => p.balanceMinor)
  const maxV = vals.length ? Math.max(...vals) : 0

  const suggestion = useMemo(() => {
    const from = `${monthKey(today)}-01`
    const cands = businesses.filter((b) => b.status === 'active').map((b) => {
      const accs = accounts.filter((a) => a.businessId === b.id)
      const ids = new Set(accs.map((a) => a.id))
      const cashAccs = accs.filter((a) => a.status === 'active' && a.accountType !== 'investment')
      const s = withCogs(summarize(transactions.filter((t) => t.status !== 'cancelled' && ids.has(t.accountId) && t.date >= from && t.date <= today), ids), cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: ids, from, to: today }))
      const fc = forecastCash({ accounts: cashAccs, balanceOf: (id) => balances.get(id)?.balanceMinor ?? 0, transactions, recurring, today, days: 30 })
      const cash = cashAccs.reduce((sum, a) => sum + (balances.get(a.id)?.balanceMinor ?? 0), 0)
      const policy = policyIsValid(b.allocation) ? b.allocation : null
      const a = computeAllocation({ baseMinor: s.operatingResult, policy, cashNowMinor: cash, minReserveMinor: b.reserve.minReserveMinor, upcomingOutflowsMinor: fc.obligationsMinor })
      return { businessId: b.id, name: b.name, reinvestMinor: a.reason === 'ok' ? a.reinvestMinor : 0 }
    })
    return { pick: pickSuggestion(cands), hasPolicy: businesses.some((b) => policyIsValid(b.allocation)) }
  }, [businesses, accounts, transactions, sales, cancelledSaleIds, recurring, balances, today])

  const personalAccount = accounts.find((a) => a.scope === 'personal' && a.status === 'active')
  const steps = [
    { done: !!user?.emailVerified, text: user?.emailVerified ? 'Correo verificado.' : 'Verifica tu correo (usa el aviso superior).' },
    { done: allBiz.length > 0, text: <>Crea tu primer negocio en <Link to="/negocios">Negocios y marcas</Link> (opcional si solo quieres finanzas personales).</> },
    { done: accounts.length > 0, text: <>Crea tus cuentas con su saldo inicial real en <Link to="/cuentas">Cuentas</Link>.</> },
    { done: transactions.length > 0, text: <>Registra tu primer movimiento con el botón <b>Registrar</b>.</> },
  ]

  return (
    <div className="page wide dash">
      <header className="dash-head">
        <div className="dash-hero">
          <span className="dash-hero-icon" aria-hidden><TrendingUp size={26} /></span>
          <div>
            <h1>{first ? `Hola, ${first}` : 'Inicio'}</h1>
            <p className="muted">Tu dinero, tus negocios y tu crecimiento, en un solo lugar.</p>
            <p className="dash-tagline">Disciplina hoy, libertad mañana.</p>
          </div>
        </div>
        <FilterBar compact />
      </header>

      {profileError ? (
        <div className="notice notice-warn" role="alert">
          <p>No pudimos cargar tu perfil desde Firestore. Revisa tu conexión y que las reglas estén desplegadas.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reloadProfile}>Reintentar</button>
        </div>
      ) : null}

      <LedgerGate>
        {accounts.length > 0 ? (
          <>
            <section className="dash-balances" aria-label="Balance">
              <article className="balance-card">
                <div className="balance-top">
                  <span className="kpi-card-label">Balance total</span>
                  <button type="button" className="icon-btn" onClick={toggleHidden} aria-pressed={hidden} aria-label={hidden ? 'Mostrar saldos' : 'Ocultar saldos'}>{hidden ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}</button>
                </div>
                <strong className="balance-value">{mask(d.now.totalMinor)}</strong>
                <span className="kpi-card-delta"><Delta cur={d.now.totalMinor} prev={d.before.totalMinor} /> <span className="muted tiny">vs. mes anterior</span></span>
                {!hidden ? <div className="balance-spark"><Sparkline values={d.series} label="Evolución del balance en los últimos 30 días" /></div> : null}
              </article>
              <article className="mini-card">
                <span className="mini-card-icon" aria-hidden><LineIcon size={20} /></span>
                <span className="kpi-card-label">En cuentas de inversión</span>
                <strong className="mini-card-value">{mask(d.now.investedMinor)}</strong>
                <span className="kpi-card-delta"><Delta cur={d.now.investedMinor} prev={d.before.investedMinor} /></span>
              </article>
              <article className="mini-card">
                <span className="mini-card-icon" aria-hidden><Wallet2 size={20} /></span>
                <span className="kpi-card-label">Disponible</span>
                <strong className="mini-card-value">{mask(d.now.cashMinor)}</strong>
                <span className="kpi-card-delta"><Delta cur={d.now.cashMinor} prev={d.before.cashMinor} /></span>
              </article>
            </section>

            <section className="quick-actions" aria-label="Acciones rápidas">
              <button type="button" onClick={() => openTransaction({ type: 'income' })}><span className="qa-icon qa-green"><Plus size={20} aria-hidden /></span>Ingresos</button>
              <button type="button" onClick={() => openTransaction({ type: 'expense' })}><span className="qa-icon qa-red"><Minus size={20} aria-hidden /></span>Gastos op.</button>
              <button type="button" onClick={() => openTransaction({ type: 'expense', prefill: personalAccount ? { type: 'expense', accountId: personalAccount.id } : undefined })}><span className="qa-icon qa-orange"><User size={20} aria-hidden /></span>Personales</button>
              <Link to="/cuentas"><span className="qa-icon qa-teal"><Landmark size={20} aria-hidden /></span>Caja</Link>
            </section>

            <section className="dash-kpis" aria-label="Resultados del periodo">
              <KpiCard tone="green" icon={<Plus size={18} />} label="Ingresos netos" value={money(d.cur.netIncome)} delta={<Delta cur={d.cur.netIncome} prev={d.prev?.netIncome ?? null} />} />
              <KpiCard tone="red" icon={<Minus size={18} />} label="Gastos operativos" value={money(d.cur.expensesBusiness)} delta={<Delta cur={d.cur.expensesBusiness} prev={d.prev?.expensesBusiness ?? null} invert />} />
              <KpiCard tone="orange" icon={<User size={18} />} label="Gastos personales" value={money(d.cur.expensesPersonal)} delta={<Delta cur={d.cur.expensesPersonal} prev={d.prev?.expensesPersonal ?? null} invert />} />
              <KpiCard tone="teal" icon={<LineIcon size={18} />} label="Resultado operativo" value={money(d.cur.result)} negative={d.cur.result < 0} delta={<Delta cur={d.cur.result} prev={d.prev?.result ?? null} />} />
              <KpiCard tone="purple" icon={<Wallet size={18} />} label="Flujo neto de caja" value={money(d.cur.netCashFlow)} negative={d.cur.netCashFlow < 0} delta={<Delta cur={d.cur.netCashFlow} prev={d.prev?.netCashFlow ?? null} />} />
            </section>
            {d.cur.cogsUnknownSales > 0 ? <p className="notice notice-warn small" role="status">{d.cur.cogsUnknownSales} venta(s) sin costo conocido no se descontaron: el resultado operativo puede estar sobrestimado.</p> : null}

            <section className="panel glow" aria-labelledby="fc-title">
              <div className="panel-head">
                <h2 id="fc-title"><CalendarDays size={18} aria-hidden /> Proyección de efectivo · próximos {days} días</h2>
                <div className="seg" role="group" aria-label="Horizonte de la proyección">
                  {[60, 90, 180].map((n) => <button key={n} type="button" className={days === n ? 'is-on' : ''} aria-pressed={days === n} onClick={() => setDays(n)}>{n} días</button>)}
                </div>
              </div>
              <LineChart title="Saldo de efectivo proyectado" area finalLabel={money(vals.at(-1) ?? 0)} data={forecast.points.map((p) => ({ date: p.date, value: p.balanceMinor }))} />
              <p className="tiny muted">Mínimo: <b>{money(forecast.minMinor)}</b> · Máximo: <b>{money(maxV)}</b>. Se basa en tu efectivo actual, lo planificado, lo pendiente y tus pagos fijos; no incluye ventas futuras que no hayas registrado.</p>
            </section>

            <div className="dash-trio">
              <section className="panel" aria-labelledby="up-title">
                <h2 id="up-title"><CalendarDays size={18} aria-hidden /> Próximos 14 días</h2>
                {upcoming.length === 0 ? <p className="muted small">No hay movimientos ni pagos fijos en los próximos 14 días.</p> : (
                  <ul className="mini-list">
                    {upcoming.map((i, k) => (
                      <li key={`${i.date}-${k}`}><span className="mini-date">{shortDate(i.date).toUpperCase()}</span><span className="mini-label">{i.label}{i.overdue ? <em> · vencido</em> : null}</span><span className={i.deltaMinor < 0 ? 'neg' : 'pos'}>{i.deltaMinor < 0 ? '−' : '+'}{money(Math.abs(i.deltaMinor))}</span></li>
                    ))}
                  </ul>
                )}
                <Link to="/calendario" className="panel-link">Ver calendario →</Link>
              </section>

              <section className="panel" aria-labelledby="al-title">
                <h2 id="al-title"><Bell size={18} aria-hidden /> Alertas <span className="count">({alerts.length})</span></h2>
                {alerts.length === 0 ? <p className="muted small">Todo en orden: nada requiere tu atención.</p> : (
                  <ul className="alert-mini">
                    {alerts.slice(0, 3).map((a) => {
                      const Icon = SEVERITY_ICON[a.severity]
                      return (
                        <li key={a.id} className={`sev-${a.severity}`}>
                          <span className="sev-icon" aria-hidden><Icon size={16} /></span>
                          <div><strong>{a.title}</strong><p className="tiny muted">{a.detail}</p></div>
                          {a.href ? <Link to={a.href} className="panel-link">Ver detalle →</Link> : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {alerts.length > 3 ? <Link to="/alertas" className="panel-link">Ver las {alerts.length} alertas →</Link> : null}
              </section>

              <section className="panel" aria-labelledby="mv-title">
                <div className="panel-head"><h2 id="mv-title"><ArrowLeftRight size={18} aria-hidden /> Últimos movimientos</h2><Link to="/movimientos" className="panel-link">Ver todos →</Link></div>
                {latest.length === 0 ? <p className="muted small">Aún no hay movimientos en este ámbito.</p> : (
                  <ul className="mv-list">
                    {latest.map((t) => {
                      const delta = cashDelta({ ...t, status: 'confirmed' })
                      const internal = t.type === 'transfer'
                      const meta = MOVE_ICON[t.type] ?? (delta < 0 ? { icon: TrendingDown, tone: 'red' } : { icon: Circle, tone: 'teal' })
                      const Icon = meta.icon
                      const real = t.status === 'confirmed' || t.status === 'reconciled'
                      return (
                        <li key={t.id}>
                          <span className={`mv-icon mv-${meta.tone}`} aria-hidden><Icon size={16} /></span>
                          <div className="mv-text"><strong>{t.description || TYPE_RULES[t.type].label}</strong><span className="tiny muted">{TYPE_RULES[t.type].label}{real ? '' : ' · pendiente'}</span></div>
                          <div className="mv-amount"><span className={internal ? 'muted' : delta < 0 ? 'neg' : 'pos'}>{internal ? '' : delta < 0 ? '−' : '+'}{money(Math.abs(delta))}</span><span className="tiny muted">{shortDate(t.date)}</span></div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            </div>

            <section className="suggest" aria-labelledby="sg-title">
              <span className="suggest-icon" aria-hidden><TrendingUp size={22} /></span>
              <div>
                <h2 id="sg-title">Sugerencia según tu reparto</h2>
                {suggestion.pick ? (
                  <p>Según tus porcentajes, <b>{suggestion.pick.name}</b> puede reinvertir <b>{money(suggestion.pick.reinvestMinor)}</b> este mes sin tocar su reserva mínima ni los pagos que vienen en 30 días.</p>
                ) : suggestion.hasPolicy ? (
                  <p>Por ahora ningún negocio tiene excedente para reinvertir este mes: primero se protegen la reserva y los pagos que vienen.</p>
                ) : (
                  <p>Define el reparto (reserva, reinversión y lo que te corresponde) en la configuración de tus negocios para recibir sugerencias.</p>
                )}
                <p className="tiny muted">Es una regla basada en tus propios números, no una predicción ni asesoría financiera.</p>
              </div>
              <Link to={suggestion.hasPolicy ? '/cierre' : '/negocios'} className="btn btn-secondary btn-sm">{suggestion.hasPolicy ? 'Ver cierre' : 'Configurar reparto'}</Link>
            </section>
          </>
        ) : null}
      </LedgerGate>

      {!user?.emailVerified || allBiz.length === 0 || accounts.length === 0 || transactions.length === 0 ? (
        <section className="panel" aria-labelledby="start-title">
          <h2 id="start-title">Primeros pasos</h2>
          {!profile && !profileError ? (
            <div className="stack"><Skeleton height={20} width="60%" /><Skeleton height={20} width="45%" /></div>
          ) : (
            <ul className="checklist">
              {steps.map((s, i) => (
                <li key={i} className={s.done ? 'done' : ''}>{s.done ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={18} aria-hidden />}<span>{s.text}</span></li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  )
}
