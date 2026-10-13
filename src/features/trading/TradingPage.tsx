import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownToLine, ArrowUpFromLine, Receipt, Wallet } from 'lucide-react'
import { FilterBar } from '../ledger/FilterBar'
import { LedgerGate } from '../ledger/LedgerGate'
import { TransactionList } from '../ledger/TransactionList'
import { useFilters } from '../ledger/FilterContext'
import { useLedger } from '../ledger/LedgerData'
import { useRegister } from '../ledger/RegisterContext'
import { Money } from '../../components/ui/Money'
import { Button } from '../../components/ui/Button'
import { computeAllocation, policyIsValid } from '../../domain/calculations/allocation'
import { forecastCash } from '../../domain/calculations/forecast'
import { summarize } from '../../domain/calculations/summary'
import { formatBps } from '../../domain/calculations/percent'
import { formatMinor } from '../../domain/calculations/money'
import { formatDateEs } from '../../domain/calculations/dates'
import type { Business } from '../../domain/types/ledger'

const TRADING_TYPES = ['investment', 'trading_withdrawal', 'expense']
const fixed = (minor: number) => (minor / 100).toFixed(2)

function TradingBusiness({ business }: { business: Business }) {
  const { accounts, transactions, recurring, balances, today } = useLedger()
  const { range } = useFilters()
  const { openTransaction } = useRegister()

  const d = useMemo(() => {
    const accs = accounts.filter((a) => a.businessId === business.id)
    const ids = new Set(accs.map((a) => a.id))
    const cashAccs = accs.filter((a) => a.status === 'active' && a.accountType !== 'investment')
    const mine = transactions.filter((t) => t.status !== 'cancelled' && ids.has(t.accountId))
    const inPeriod = range ? mine.filter((t) => t.date >= range.from && t.date <= range.to) : mine
    const period = summarize(inPeriod, ids)
    const all = summarize(mine, ids)
    const cashNow = cashAccs.reduce((s, a) => s + (balances.get(a.id)?.balanceMinor ?? 0), 0)
    const forecast = forecastCash({ accounts: cashAccs, balanceOf: (id) => balances.get(id)?.balanceMinor ?? 0, transactions, recurring, today, days: 30 })
    const base = period.tradingWithdrawals - period.expenses
    const policy = policyIsValid(business.allocation) ? business.allocation : null
    const allocation = computeAllocation({ baseMinor: base, policy, cashNowMinor: cashNow, minReserveMinor: business.reserve.minReserveMinor, upcomingOutflowsMinor: forecast.obligationsMinor })
    const allNet = all.tradingWithdrawals - all.investments - all.expenses
    const mainAccount = [...cashAccs].sort((a, b) => (balances.get(b.id)?.balanceMinor ?? 0) - (balances.get(a.id)?.balanceMinor ?? 0))[0]
    return {
      accs, cashAccs, period, all, cashNow, forecast, base, policy, allocation, allNet, mainAccountId: mainAccount?.id ?? '',
      unrecovered: Math.max(0, all.investments + all.expenses - all.tradingWithdrawals),
      rows: inPeriod.filter((t) => TRADING_TYPES.includes(t.type)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15),
    }
  }, [business, accounts, transactions, recurring, balances, range, today])

  const a = d.allocation
  const net = d.period.tradingWithdrawals - d.period.investments - d.period.expenses
  const reasonText: Record<typeof a.reason, string> = {
    ok: '',
    no_policy: 'Define tus porcentajes de reparto en la configuración del negocio para ver cuánto te corresponde. Capital OS no los inventa.',
    no_profit: 'En este periodo no hay excedente: los retiros no superan los gastos de fondeo, así que no hay nada que repartir.',
    no_surplus: 'Tu efectivo actual no supera la reserva mínima más los pagos que vienen. Primero se protege el negocio; no se reparte nada todavía.',
  }

  return (
    <section className="panel" aria-labelledby={`t-${business.id}`}>
      <div className="row between">
        <h2 id={`t-${business.id}`}><Link to={`/negocios/${business.id}`}>{business.name}</Link></h2>
        <div className="row">
          <Button size="sm" variant="secondary" icon={<ArrowUpFromLine size={14} aria-hidden />} onClick={() => openTransaction({ type: 'investment', prefill: { type: 'investment', accountId: d.mainAccountId, description: 'Depósito a broker' } })}>Registrar inversión</Button>
          <Button size="sm" variant="secondary" icon={<ArrowDownToLine size={14} aria-hidden />} onClick={() => openTransaction({ type: 'trading_withdrawal', prefill: { type: 'trading_withdrawal', accountId: d.mainAccountId, description: 'Retiro' } })}>Registrar retiro</Button>
          <Button size="sm" variant="secondary" icon={<Receipt size={14} aria-hidden />} onClick={() => openTransaction({ type: 'expense', prefill: { type: 'expense', accountId: d.mainAccountId, description: 'Cuenta de fondeo' } })}>Gasto de fondeo</Button>
        </div>
      </div>

      {d.accs.length === 0 ? <p className="muted">Este negocio aún no tiene cuentas. Crea una en <Link to="/cuentas">Cuentas</Link> para registrar movimientos.</p> : null}

      <div className="kpis" role="group" aria-label="Resultado del periodo">
        <div className="kpi"><span className="kpi-label">Retirado</span><Money minor={d.period.tradingWithdrawals} className="kpi-value" /><span className="tiny muted">Lo que recibiste de brokers o fondeo</span></div>
        <div className="kpi"><span className="kpi-label">Invertido</span><Money minor={d.period.investments} className="kpi-value" /><span className="tiny muted">Depósitos a brokers (capital)</span></div>
        <div className="kpi"><span className="kpi-label">Gastos de fondeo</span><Money minor={d.period.expenses} className="kpi-value" /><span className="tiny muted">Evaluaciones, cuentas y comisiones</span></div>
        <div className="kpi"><span className="kpi-label">Neto de caja</span><Money minor={net} tone className="kpi-value" /><span className="tiny muted">Retirado − invertido − gastos</span></div>
      </div>

      <p className="small muted">
        Desde el inicio: retiraste <b>{formatMinor(d.all.tradingWithdrawals)}</b> y pusiste <b>{formatMinor(d.all.investments + d.all.expenses)}</b> entre inversión y gastos →{' '}
        <b className={d.allNet < 0 ? 'neg' : 'pos'}>{formatMinor(d.allNet)}</b>.
        {d.unrecovered > 0 ? ` Te faltan ${formatMinor(d.unrecovered)} para recuperar lo puesto.` : d.all.tradingWithdrawals > 0 ? ' Ya recuperaste lo puesto.' : ''}
      </p>

      <div className="subpanel" aria-labelledby={`a-${business.id}`}>
        <h3 id={`a-${business.id}`}>Cuánto te corresponde</h3>
        <dl className="kv compact">
          <div><dt>Base del periodo (retiros − gastos de fondeo)</dt><dd><Money minor={d.base} tone /></dd></div>
          <div><dt>Efectivo disponible hoy</dt><dd><Money minor={d.cashNow} /></dd></div>
          <div><dt>Reserva mínima del negocio</dt><dd><Money minor={business.reserve.minReserveMinor} /></dd></div>
          <div><dt>Pagos que vienen (próximos 30 días)</dt><dd><Money minor={d.forecast.obligationsMinor} /></dd></div>
          <div><dt>Excedente (efectivo − reserva − pagos)</dt><dd><Money minor={a.surplusMinor} /></dd></div>
          <div><dt>Se puede repartir ahora</dt><dd><b><Money minor={a.allocatableMinor} /></b></dd></div>
        </dl>

        {a.reason === 'ok' && d.policy ? (
          <>
            <ul className="alloc">
              <li className="alloc-owner"><span>Para ti <span className="tiny muted">({formatBps(d.policy.ownerBps)})</span></span><Money minor={a.ownerMinor} className="kpi-value" /></li>
              <li><span>Reinvertir <span className="tiny muted">({formatBps(d.policy.reinvestBps)})</span></span><Money minor={a.reinvestMinor} className="kpi-value" /></li>
              <li><span>Reserva <span className="tiny muted">({formatBps(d.policy.reserveBps)})</span></span><Money minor={a.reserveMinor} className="kpi-value" /></li>
            </ul>
            <div className="row">
              <Button size="sm" disabled={a.ownerMinor <= 0} icon={<Wallet size={14} aria-hidden />} onClick={() => openTransaction({ type: 'transfer', prefill: { type: 'transfer', transferPurpose: 'owner_withdrawal', accountId: d.mainAccountId, amount: fixed(a.ownerMinor), description: `Retiro del propietario · ${business.name}` } })}>Pagarme {formatMinor(a.ownerMinor)}</Button>
              <Button size="sm" variant="secondary" disabled={a.reinvestMinor <= 0} onClick={() => openTransaction({ type: 'investment', prefill: { type: 'investment', accountId: d.mainAccountId, amount: fixed(a.reinvestMinor), description: 'Reinversión' } })}>Reinvertir {formatMinor(a.reinvestMinor)}</Button>
            </div>
            {a.heldBackMinor > 0 ? <p className="small muted">Quedan {formatMinor(a.heldBackMinor)} sin repartir hasta que el efectivo supere la reserva y los pagos que vienen.</p> : null}
          </>
        ) : (
          <p className="notice notice-warn" role="status">{reasonText[a.reason]}{a.reason === 'no_policy' ? <> <Link to={`/negocios/${business.id}`}>Configurar reparto</Link></> : null}</p>
        )}
        <p className="tiny muted">Es una guía de organización, no asesoría financiera ni fiscal. Un retiro puede incluir capital que tú depositaste: mira el neto desde el inicio para saber si ya recuperaste lo puesto. Ningún movimiento se crea sin que lo confirmes tú.</p>
      </div>

      <div><h3>Últimos movimientos de trading</h3><TransactionList rows={d.rows} emptyText="Aún no hay inversiones, retiros ni gastos de fondeo en este periodo." /></div>
      {d.rows.length ? <p className="tiny muted">Periodo: {range ? `${formatDateEs(range.from)} – ${formatDateEs(range.to)}` : 'todo el historial'}</p> : null}
    </section>
  )
}

export function TradingPage() {
  const { businesses, transactions, accounts } = useLedger()
  const trading = businesses.filter((b) => b.type === 'trading' && b.status === 'active')
  const personalIds = new Set(accounts.filter((a) => a.scope === 'personal').map((a) => a.id))
  const orphan = transactions.filter((t) => t.type === 'trading_withdrawal' && t.status !== 'cancelled' && personalIds.has(t.accountId)).length

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Inversiones y trading</h1><p className="muted">Registra solo lo que mueve tu dinero: lo que inviertes, lo que retiras y lo que pagas por cuentas de fondeo. Tus operaciones las llevas donde ya las tienes.</p></div>
      </header>
      <FilterBar hideScope compact />
      <LedgerGate>
        {trading.length === 0 ? (
          <div className="empty">
            <h2>Aún no tienes un negocio de trading</h2>
            <p>Crea un negocio de tipo “Trading o inversiones”, con su cuenta, para registrar depósitos a brokers, gastos de fondeo y retiros, y ver cuánto te corresponde.</p>
            <Link className="btn btn-primary" to="/negocios" state={{ openNew: Date.now() }}>Crear negocio de trading</Link>
          </div>
        ) : trading.map((b) => <TradingBusiness key={b.id} business={b} />)}
        {orphan > 0 ? (
          <div className="notice notice-warn" role="status">
            <p>Tienes {orphan} retiro(s) de trading registrados en cuentas personales: no se atribuyen a ningún negocio. Para analizarlos aquí, registra el retiro en una cuenta de tu negocio de trading y luego muévelo a tu cuenta personal como “Retiro del propietario”.</p>
          </div>
        ) : null}
        <div className="notice" role="note"><p className="small">Cómo usarlo: <b>1)</b> Registra los depósitos a brokers como “Inversión”. <b>2)</b> Registra las cuentas de fondeo que pagas como “Gasto”. <b>3)</b> Registra cada retiro como “Retiro de trading” en la cuenta donde llega. <b>4)</b> Aquí ves cuánto te corresponde y puedes pagarte con un clic.</p></div>
      </LedgerGate>
    </div>
  )
}
