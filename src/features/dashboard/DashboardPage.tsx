import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, CircleDot } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useLedger } from '../ledger/LedgerData'
import { useFilters } from '../ledger/FilterContext'
import { FilterBar } from '../ledger/FilterBar'
import { SummaryStrip } from '../ledger/SummaryStrip'
import { LedgerGate } from '../ledger/LedgerGate'
import { Money } from '../../components/ui/Money'
import { PHASES, CURRENT_PHASE } from '../../app/navigation'
import { Skeleton } from '../../components/feedback/Skeleton'
import { LineChart } from '../../components/charts/Charts'
import { useAlerts, useScopedForecast } from '../ledger/useInsights'
import { formatDateEs } from '../../domain/calculations/dates'
import { totalsByKind } from '../../domain/calculations/transactionRules'

const addDaysStr = (s: string, n: number) => (s ? new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10) : s)

export function DashboardPage() {
  const { user, profile, profileError, reloadProfile } = useAuth()
  const { businesses, accounts, transactions, balances } = useLedger()
  const { scopeAccounts, summary } = useFilters()
  const name = profile?.profile.displayName || user?.displayName || ''
  const first = name.split(' ')[0]
  const totals = totalsByKind(scopeAccounts, balances)
  const forecast = useScopedForecast(60)
  const alerts = useAlerts()
  const upcoming = forecast.items.filter((i) => i.date <= addDaysStr(forecast.points[0]?.date ?? '', 14)).slice(0, 6)
  const steps = [
    { done: true, text: 'Cuenta creada y sesión protegida.' },
    { done: !!user?.emailVerified, text: user?.emailVerified ? 'Correo verificado.' : 'Verifica tu correo (usa el aviso superior).' },
    { done: businesses.length > 0, text: <>Crea tu primer negocio en <Link to="/negocios">Negocios y marcas</Link> (opcional si solo quieres finanzas personales).</> },
    { done: accounts.length > 0, text: <>Crea tus cuentas con su saldo inicial real en <Link to="/cuentas">Cuentas</Link>.</> },
    { done: transactions.length > 0, text: <>Registra tu primer movimiento con el botón <b>Registrar</b>.</> },
  ]

  return (
    <div className="page wide">
      <header className="page-head">
        <div>
          <h1>{first ? `Hola, ${first}` : 'Inicio'}</h1>
          <p className="muted">Tu efectivo y tus resultados reales, sin cifras inventadas. Para el detalle por mes, categoría y negocio, abre Analítica.</p>
        </div>
      </header>

      {profileError ? (
        <div className="notice notice-warn" role="alert">
          <p>No pudimos cargar tu perfil desde Firestore. Revisa tu conexión y que las reglas estén desplegadas.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={reloadProfile}>Reintentar</button>
        </div>
      ) : null}

      <FilterBar compact />
      <LedgerGate>
        {accounts.length > 0 ? (
          <>
            <section className="kpis two" aria-label="Efectivo">
              <div className="kpi"><span className="kpi-label">Efectivo disponible</span><Money minor={totals.cashMinor} className="kpi-value" /><span className="tiny muted">En el ámbito elegido, sin cuentas de inversión</span></div>
              <div className="kpi"><span className="kpi-label">En cuentas de inversión</span><Money minor={totals.investedMinor} className="kpi-value" /><span className="tiny muted">Capital invertido, aparte del efectivo</span></div>
            </section>
            <SummaryStrip summary={summary} />
            <section className="panel" aria-labelledby="fc-title">
              <h2 id="fc-title">Proyección de efectivo · próximos 60 días</h2>
              <LineChart title="Saldo de efectivo proyectado" data={forecast.points.map((p) => ({ date: p.date, value: p.balanceMinor }))} />
              <p className="tiny muted">Parte de tu efectivo actual y suma lo planificado, lo pendiente y tus pagos fijos aún sin crear. No incluye ventas futuras que no hayas registrado.</p>
            </section>
            <div className="grid-2 top">
              <section className="panel" aria-labelledby="up-title">
                <h2 id="up-title">Próximos 14 días</h2>
                {upcoming.length === 0 ? <p className="muted small">No hay movimientos ni pagos fijos en los próximos 14 días.</p> : (
                  <ul className="rows">{upcoming.map((i, k) => (
                    <li key={`${i.date}-${k}`}><div><strong>{i.label}</strong><p className="tiny muted">{i.overdue ? 'Vencido, sin confirmar' : formatDateEs(i.date)}</p></div><Money minor={i.deltaMinor} tone className="row-amount" /><span /></li>
                  ))}</ul>
                )}
              </section>
              <section className="panel" aria-labelledby="al-title">
                <h2 id="al-title">Alertas ({alerts.length})</h2>
                {alerts.length === 0 ? <p className="muted small">Todo en orden.</p> : (
                  <ul className="rows">{alerts.slice(0, 3).map((a) => (<li key={a.id}><div><strong>{a.title}</strong><p className="tiny muted">{a.detail}</p></div><span /><span /></li>))}</ul>
                )}
                <Link to="/alertas" className="small">Ver alertas y tareas</Link>
              </section>
            </div>
          </>
        ) : null}
      </LedgerGate>

      <section className="panel" aria-labelledby="start-title">
        <h2 id="start-title">Primeros pasos</h2>
        {!profile && !profileError ? (
          <div className="stack"><Skeleton height={20} width="60%" /><Skeleton height={20} width="45%" /></div>
        ) : (
          <ul className="checklist">
            {steps.map((s, i) => (
              <li key={i} className={s.done ? 'done' : ''}>
                {s.done ? <CheckCircle2 size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="roadmap-title">
        <h2 id="roadmap-title">Estado de Capital OS</h2>
        <p className="muted small">Lo que ves aquí es lo que realmente funciona. Nada se simula.</p>
        <ol className="phases">
          {PHASES.map((p) => {
            const state = p.n <= CURRENT_PHASE ? 'done' : p.n === CURRENT_PHASE + 1 ? 'next' : 'later'
            return (
              <li key={p.n} className={`phase phase-${state}`}>
                {state === 'done' ? <CheckCircle2 size={18} aria-hidden /> : state === 'next' ? <CircleDot size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
                <div><strong>Fase {p.n}. {p.title}</strong><span className="muted small">{p.detail}</span></div>
                <span className="tag">{state === 'done' ? 'Disponible' : state === 'next' ? 'En curso' : 'Pendiente'}</span>
              </li>
            )
          })}
        </ol>
      </section>
    </div>
  )
}
