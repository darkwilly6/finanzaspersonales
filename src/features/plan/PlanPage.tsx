import { Link } from 'react-router-dom'
import { Boxes, CalendarClock, Landmark, Megaphone, PiggyBank, Wallet } from 'lucide-react'
import { LedgerGate } from '../ledger/LedgerGate'
import { useLedger } from '../ledger/LedgerData'
import { useRegister } from '../ledger/RegisterContext'
import { useAlerts } from '../ledger/useInsights'
import { useBusinessPlans, type BusinessPlan } from './usePlans'
import { Money } from '../../components/ui/Money'
import { Button } from '../../components/ui/Button'
import { formatDateEs } from '../../domain/calculations/dates'
import { formatMinor } from '../../domain/calculations/money'
import { formatBps } from '../../domain/calculations/percent'
import { actionForBucket } from '../../domain/calculations/plan'
import { PAYOUT_FREQUENCY_LABELS, PAYOUT_METHOD_LABELS, PLAN_KIND_LABELS } from '../../domain/types/ledger'

const fixed = (minor: number) => (minor / 100).toFixed(2)

const REASON: Record<string, string> = {
  no_profit: 'Este mes aún no hay excedente: el resultado operativo no es positivo, así que no hay nada que repartir.',
  no_surplus: 'Tu efectivo no supera la reserva mínima más los pagos que vienen: primero se protege el negocio.',
}

function Bucket({ p, part }: { p: BusinessPlan; part: BusinessPlan['parts'][number] }) {
  const { openTransaction } = useRegister()
  const { business, mainAccountId } = p
  const { bucket, amountMinor } = part
  const purpose = business.payout.method === 'salary' || business.payout.method === 'compensation' ? 'salary' : 'owner_withdrawal'
  const action = bucket.kind === 'use' ? actionForBucket(bucket, business.type) : null
  const Icon = bucket.kind === 'owner' ? Wallet : bucket.kind === 'reserve' ? PiggyBank : action === 'stock' ? Boxes : /public|ads|anunc|marketing/i.test(bucket.name) ? Megaphone : Landmark

  return (
    <li className="plan-bucket">
      <span className={`plan-icon plan-${bucket.kind}`} aria-hidden><Icon size={18} /></span>
      <div className="plan-bucket-text">
        <strong>{bucket.name}</strong>
        <span className="tiny muted">{PLAN_KIND_LABELS[bucket.kind]} · {formatBps(bucket.bps)}</span>
      </div>
      <Money minor={amountMinor} className="plan-amount" />
      <div className="plan-action">
        {bucket.kind === 'owner' ? (
          <Button size="sm" variant="secondary" disabled={amountMinor <= 0} onClick={() => openTransaction({ type: 'transfer', prefill: { type: 'transfer', transferPurpose: purpose, accountId: mainAccountId, amount: fixed(amountMinor), description: `${PAYOUT_METHOD_LABELS[business.payout.method]} · ${business.name}` } })}>Registrar mi pago</Button>
        ) : bucket.kind === 'reserve' ? (
          <span className="tiny muted">Se queda en el negocio</span>
        ) : action === 'stock' ? (
          <Link className="btn btn-secondary btn-sm" to="/stock">Comprar mercancía</Link>
        ) : action === 'investment' ? (
          <Button size="sm" variant="secondary" disabled={amountMinor <= 0} onClick={() => openTransaction({ type: 'investment', prefill: { type: 'investment', accountId: mainAccountId, amount: fixed(amountMinor), description: bucket.name } })}>Registrar inversión</Button>
        ) : (
          <Button size="sm" variant="secondary" disabled={amountMinor <= 0} onClick={() => openTransaction({ type: 'expense', prefill: { type: 'expense', accountId: mainAccountId, amount: fixed(amountMinor), description: bucket.name } })}>Registrar gasto</Button>
        )}
      </div>
    </li>
  )
}

function BusinessCard({ p }: { p: BusinessPlan }) {
  const { business, allocation: a } = p
  return (
    <section className="panel" aria-labelledby={`pl-${business.id}`}>
      <div className="row between">
        <h2 id={`pl-${business.id}`}><Link to={`/negocios/${business.id}`}>{business.name}</Link></h2>
        {p.plan ? <Link className="panel-link" to={`/negocios/${business.id}`}>Editar plan →</Link> : null}
      </div>

      <dl className="kv compact">
        <div><dt>Resultado operativo del mes (base)</dt><dd><Money minor={p.summary.operatingResult} tone /></dd></div>
        <div><dt>Efectivo disponible hoy</dt><dd><Money minor={p.cashNowMinor} /></dd></div>
        <div><dt>Reserva mínima + pagos que vienen (30 días)</dt><dd><Money minor={business.reserve.minReserveMinor + p.obligationsMinor} /></dd></div>
        <div><dt>Excedente</dt><dd><Money minor={a.surplusMinor} /></dd></div>
        <div><dt><b>Se puede repartir ahora</b></dt><dd><b><Money minor={a.reason === 'ok' ? a.allocatableMinor : 0} /></b></dd></div>
      </dl>

      {!p.plan ? (
        <div className="notice notice-warn" role="status">
          <p>Aún no defines cómo repartir lo que gana {business.name}. Crea tu plan: cuánto para ti, cuánto para la reserva y a qué usos va el resto (publicidad, inventario, herramientas…).</p>
          <Link className="btn btn-primary btn-sm" to={`/negocios/${business.id}`}>Definir plan</Link>
        </div>
      ) : a.reason === 'ok' ? (
        <>
          <ul className="plan-list">{p.parts.map((part) => <Bucket key={part.bucket.id} p={p} part={part} />)}</ul>
          {a.heldBackMinor > 0 ? <p className="small muted">Quedan {formatMinor(a.heldBackMinor)} sin repartir porque el efectivo no alcanza todavía: se reparten cuando haya excedente.</p> : null}
        </>
      ) : (
        <p className="notice notice-warn" role="status">{REASON[a.reason] ?? 'No hay nada que repartir por ahora.'}</p>
      )}

      <p className="small">
        <CalendarClock size={14} aria-hidden /> Tu pago: {PAYOUT_METHOD_LABELS[business.payout.method].toLowerCase()} · {business.payout.frequency === 'custom' ? `cada ${business.payout.customDays} días` : PAYOUT_FREQUENCY_LABELS[business.payout.frequency].toLowerCase()}.{' '}
        {p.payout.neverPaid ? 'Aún no registras ningún pago.' : p.payout.due ? <b>Ya te toca pagarte (último pago: {formatDateEs(p.lastPayout!)}).</b> : <>Próximo pago: {formatDateEs(p.payout.date)}.</>}
      </p>
    </section>
  )
}

export function PlanPage() {
  const plans = useBusinessPlans()
  const { budgets } = useLedger()
  const alerts = useAlerts().filter((x) => x.id.startsWith('budget-'))
  const total = plans.reduce((s, p) => s + (p.allocation.reason === 'ok' ? p.allocation.allocatableMinor : 0), 0)
  const due = plans.filter((p) => !p.payout.neverPaid && p.payout.due)

  return (
    <div className="page wide">
      <header className="page-head">
        <div>
          <h1>¿Qué hago con mi dinero?</h1>
          <p className="muted">Lo que cada negocio puede repartir hoy según TU plan, sin tocar su reserva ni los pagos que vienen: cuánto para ti, cuánto a reserva y a qué usos va el resto.</p>
        </div>
      </header>
      <LedgerGate>
        <section className="panel glow" aria-labelledby="today-title">
          <h2 id="today-title">Hoy</h2>
          <ul className="today-list">
            <li>{total > 0 ? <>Tienes <b>{formatMinor(total)}</b> para repartir entre tus negocios según su plan.</> : 'Por ahora no hay excedente para repartir: primero se protegen las reservas y los pagos que vienen.'}</li>
            {due.map((p) => <li key={p.business.id}><b>Te toca pagarte de {p.business.name}</b> (último pago: {formatDateEs(p.lastPayout!)}).</li>)}
            {alerts.length > 0 ? <li><Link to="/alertas">Tienes {alerts.length} aviso(s) de tus límites de gasto</Link>.</li> : budgets.some((b) => b.active) ? <li>Tus límites de gasto están en orden.</li> : <li><Link to="/alertas">Fija límites de gasto</Link> para que la app te avise cuando gastes de más.</li>}
          </ul>
        </section>

        {plans.length === 0 ? (
          <div className="empty"><h2>Aún no tienes negocios</h2><p>Crea un negocio, registra sus movimientos y define su plan de uso del dinero.</p><Link className="btn btn-primary" to="/negocios" state={{ openNew: Date.now() }}>Crear negocio</Link></div>
        ) : plans.map((p) => <BusinessCard key={p.business.id} p={p} />)}

        <p className="tiny muted">Es una guía basada en tus propias reglas y números, no asesoría financiera ni fiscal. Nada se registra solo: cada botón abre el formulario ya rellenado para que tú confirmes. Las plantillas del plan son ejemplos editables.</p>
      </LedgerGate>
    </div>
  )
}
