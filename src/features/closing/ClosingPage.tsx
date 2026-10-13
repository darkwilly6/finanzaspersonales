import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ClipboardCheck, Wallet } from 'lucide-react'
import { LedgerGate } from '../ledger/LedgerGate'
import { useLedger } from '../ledger/LedgerData'
import { useRegister } from '../ledger/RegisterContext'
import { useAuth } from '../auth/AuthContext'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { useToast } from '../../components/feedback/Toast'
import { computeAllocation, policyIsValid } from '../../domain/calculations/allocation'
import { closingId } from '../../domain/calculations/closing'
import { cogsFor, withCogs } from '../../domain/calculations/cogs'
import { addMonths, endOfMonth, formatDateEs, monthKey } from '../../domain/calculations/dates'
import { forecastCash } from '../../domain/calculations/forecast'
import { formatMinor } from '../../domain/calculations/money'
import { formatBps } from '../../domain/calculations/percent'
import { nextPayout } from '../../domain/calculations/payout'
import { summarize } from '../../domain/calculations/summary'
import { PAYOUT_FREQUENCY_LABELS, PAYOUT_METHOD_LABELS, type Business, type ClosingDoc } from '../../domain/types/ledger'
import { createClosing } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

const fixed = (minor: number) => (minor / 100).toFixed(2)
const monthName = (m: string) => new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`))

function BusinessClosing({ business, month }: { business: Business; month: string }) {
  const { user } = useAuth()
  const { accounts, transactions, sales, cancelledSaleIds, balances, recurring, closings, today } = useLedger()
  const { openTransaction } = useRegister()
  const { notify } = useToast()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const from = `${month}-01`
  const to = endOfMonth(from)

  const d = useMemo(() => {
    const accs = accounts.filter((a) => a.businessId === business.id)
    const ids = new Set(accs.map((a) => a.id))
    const cashAccs = accs.filter((a) => a.status === 'active' && a.accountType !== 'investment')
    const mine = transactions.filter((t) => t.status !== 'cancelled' && ids.has(t.accountId))
    const inMonth = mine.filter((t) => t.date >= from && t.date <= to)
    const s = withCogs(summarize(inMonth, ids), cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: ids, from, to }))
    const cashNow = cashAccs.reduce((sum, a) => sum + (balances.get(a.id)?.balanceMinor ?? 0), 0)
    const forecast = forecastCash({ accounts: cashAccs, balanceOf: (id) => balances.get(id)?.balanceMinor ?? 0, transactions, recurring, today, days: 30 })
    const policy = policyIsValid(business.allocation) ? business.allocation : null
    const allocation = computeAllocation({ baseMinor: s.operatingResult, policy, cashNowMinor: cashNow, minReserveMinor: business.reserve.minReserveMinor, upcomingOutflowsMinor: forecast.obligationsMinor })
    const payouts = mine.filter((t) => t.status === 'confirmed' && (t.type === 'owner_withdrawal' || t.type === 'salary_payment' || (t.type === 'transfer' && t.direction === 'out' && (t.transferPurpose === 'owner_withdrawal' || t.transferPurpose === 'salary'))))
    const lastPayout = payouts.reduce<string | null>((m, t) => (m === null || t.date > m ? t.date : m), null)
    const open = inMonth.filter((t) => t.status === 'pending' || t.status === 'planned').length
    const mainAccount = [...cashAccs].sort((a, b) => (balances.get(b.id)?.balanceMinor ?? 0) - (balances.get(a.id)?.balanceMinor ?? 0))[0]?.id ?? ''
    return { s, cashNow, forecast, policy, allocation, lastPayout, open, mainAccount }
  }, [business, accounts, transactions, sales, cancelledSaleIds, balances, recurring, today, from, to])

  const saved = closings.find((c) => c.id === closingId(business.id, month))
  const a = d.allocation
  const payout = nextPayout({ lastPayoutDate: d.lastPayout, frequency: business.payout.frequency, customDays: business.payout.customDays, today })
  const purpose = business.payout.method === 'salary' || business.payout.method === 'compensation' ? 'salary' : 'owner_withdrawal'
  const reasonText = { ok: '', no_policy: 'Define tus porcentajes de reparto en la configuración del negocio.', no_profit: 'Este mes no hubo excedente: el resultado operativo no es positivo.', no_surplus: 'Tu efectivo no supera la reserva mínima más los pagos que vienen: primero se protege el negocio.' }

  async function save() {
    if (!d.policy || a.reason !== 'ok') return
    setBusy(true)
    try {
      const doc: ClosingDoc = {
        businessId: business.id, month, from, to, netIncomeMinor: d.s.netIncome, expensesMinor: d.s.expenses, cogsMinor: d.s.cogs, baseMinor: a.baseMinor,
        cashNowMinor: d.cashNow, minReserveMinor: business.reserve.minReserveMinor, upcomingMinor: d.forecast.obligationsMinor, surplusMinor: a.surplusMinor,
        allocatableMinor: a.allocatableMinor, ownerMinor: a.ownerMinor, reinvestMinor: a.reinvestMinor, reserveMinor: a.reserveMinor, heldBackMinor: a.heldBackMinor, policy: d.policy, note: note.trim(),
      }
      const r = await createClosing(user!.uid, closingId(business.id, month), doc)
      notify(r === 'duplicate' ? 'info' : 'success', r === 'duplicate' ? 'Este mes ya tenía un cierre guardado.' : 'Cierre guardado. Registra el pago cuando lo hagas.')
    } catch (e) { notify('error', humanizeFirebaseError(e)) } finally { setBusy(false) }
  }

  const show = saved ?? null
  const owner = show ? show.ownerMinor : a.ownerMinor
  const reinvest = show ? show.reinvestMinor : a.reinvestMinor
  const reserve = show ? show.reserveMinor : a.reserveMinor

  return (
    <section className="panel" aria-labelledby={`c-${business.id}`}>
      <div className="row between">
        <h2 id={`c-${business.id}`}><Link to={`/negocios/${business.id}`}>{business.name}</Link></h2>
        {show ? <span className="tag tag-confirmed">Cierre guardado el {show.createdAt ? formatDateEs(show.createdAt.toISOString().slice(0, 10)) : ''}</span> : null}
      </div>

      {d.open > 0 ? <p className="notice notice-warn small" role="status">Hay {d.open} movimiento(s) de {monthName(month)} pendientes o planificados. Confírmalos o anúlalos antes de cerrar para que los números sean reales.</p> : null}
      {d.s.cogsUnknownSales > 0 ? <p className="notice notice-warn small" role="status">{d.s.cogsUnknownSales} venta(s) sin costo conocido no se descontaron: el resultado puede estar sobrestimado.</p> : null}
      {month === monthKey(today) ? <p className="small muted">Mes en curso: estos números cambian hasta que termine.</p> : null}

      <dl className="kv compact">
        <div><dt>Ingresos netos</dt><dd><Money minor={d.s.netIncome} /></dd></div>
        <div><dt>Gastos operativos</dt><dd><Money minor={d.s.expenses} /></dd></div>
        <div><dt>Costo de lo vendido</dt><dd><Money minor={d.s.cogs} /></dd></div>
        <div><dt>Resultado operativo del mes (base)</dt><dd><b><Money minor={d.s.operatingResult} tone /></b></dd></div>
        <div><dt>Efectivo disponible hoy</dt><dd><Money minor={d.cashNow} /></dd></div>
        <div><dt>Reserva mínima + pagos que vienen (30 días)</dt><dd><Money minor={business.reserve.minReserveMinor + d.forecast.obligationsMinor} /></dd></div>
        <div><dt>Excedente</dt><dd><Money minor={a.surplusMinor} /></dd></div>
        <div><dt>Se puede repartir</dt><dd><b><Money minor={show ? show.allocatableMinor : a.allocatableMinor} /></b></dd></div>
      </dl>

      {(show || a.reason === 'ok') ? (
        <ul className="alloc">
          <li className="alloc-owner"><span>Para ti <span className="tiny muted">({formatBps((show?.policy ?? d.policy)!.ownerBps)}) · {PAYOUT_METHOD_LABELS[business.payout.method]}</span></span><Money minor={owner} className="kpi-value" /></li>
          <li><span>Reinvertir <span className="tiny muted">({formatBps((show?.policy ?? d.policy)!.reinvestBps)})</span></span><Money minor={reinvest} className="kpi-value" /></li>
          <li><span>Reserva <span className="tiny muted">({formatBps((show?.policy ?? d.policy)!.reserveBps)})</span></span><Money minor={reserve} className="kpi-value" /></li>
        </ul>
      ) : (
        <p className="notice notice-warn" role="status">{reasonText[a.reason]}{a.reason === 'no_policy' ? <> <Link to={`/negocios/${business.id}`}>Configurar reparto</Link></> : null}</p>
      )}
      {(show ? show.heldBackMinor : a.heldBackMinor) > 0 && (show || a.reason === 'ok') ? <p className="small muted">Quedan {formatMinor(show ? show.heldBackMinor : a.heldBackMinor)} sin repartir porque el efectivo no alcanza todavía.</p> : null}

      <p className="small">
        <CalendarClock size={14} aria-hidden /> Tu pago: {PAYOUT_METHOD_LABELS[business.payout.method].toLowerCase()} · {business.payout.frequency === 'custom' ? `cada ${business.payout.customDays} días` : PAYOUT_FREQUENCY_LABELS[business.payout.frequency].toLowerCase()}.{' '}
        {payout.neverPaid ? 'Aún no registras ningún pago: te toca cuando tengas excedente.' : payout.due ? <b>Ya te toca pagarte (último pago: {formatDateEs(d.lastPayout!)}).</b> : <>Próximo pago: {formatDateEs(payout.date)}.</>}
      </p>

      {!show && a.reason === 'ok' ? (
        <div className="field"><label htmlFor={`note-${business.id}`}>Nota del cierre (opcional)</label><input id={`note-${business.id}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></div>
      ) : null}
      {show?.note ? <p className="small muted">Nota: {show.note}</p> : null}

      <div className="row">
        {!show && a.reason === 'ok' ? <Button icon={<ClipboardCheck size={14} aria-hidden />} loading={busy} onClick={save}>Guardar cierre de {monthName(month)}</Button> : null}
        <Button variant="secondary" disabled={owner <= 0} icon={<Wallet size={14} aria-hidden />} onClick={() => openTransaction({ type: 'transfer', prefill: { type: 'transfer', transferPurpose: purpose, accountId: d.mainAccount, amount: fixed(owner), description: `${PAYOUT_METHOD_LABELS[business.payout.method]} · ${business.name} · ${month}` } })}>Registrar mi pago {owner > 0 ? formatMinor(owner) : ''}</Button>
        {business.type === 'trading' ? <Button variant="ghost" disabled={reinvest <= 0} onClick={() => openTransaction({ type: 'investment', prefill: { type: 'investment', accountId: d.mainAccount, amount: fixed(reinvest), description: 'Reinversión' } })}>Registrar reinversión {reinvest > 0 ? formatMinor(reinvest) : ''}</Button> : null}
      </div>
      <p className="tiny muted">Guardar el cierre solo deja constancia (no mueve dinero y no se puede editar ni repetir para el mismo mes). Tú registras el pago cuando lo hagas. Es una guía de organización, no asesoría financiera ni fiscal.</p>
    </section>
  )
}

export function ClosingPage() {
  const { businesses, today } = useLedger()
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => monthKey(addMonths(today, -i))), [today])
  const [month, setMonth] = useState(() => monthKey(addMonths(today, -1)))
  const active = businesses.filter((b) => b.status === 'active')
  return (
    <div className="page wide">
      <header className="page-head"><div><h1>Cierre financiero</h1><p className="muted">Al terminar el mes: cuánto ganó cada negocio, cuánto queda para reserva, reinversión y para ti, sin comprometer lo que ya debes pagar.</p></div></header>
      <label className="inline-field"><span className="sr-only">Mes</span>
        <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mes del cierre">{months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>
      </label>
      <LedgerGate>
        {active.length === 0 ? <div className="empty"><h2>Aún no tienes negocios</h2><p>Crea un negocio, registra sus movimientos y vuelve aquí a final de mes.</p></div> : active.map((b) => <BusinessClosing key={b.id} business={b} month={month} />)}
      </LedgerGate>
    </div>
  )
}
