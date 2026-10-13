import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronLeft, ChevronRight, ListChecks } from 'lucide-react'
import { FilterBar } from '../ledger/FilterBar'
import { LedgerGate } from '../ledger/LedgerGate'
import { useFilters } from '../ledger/FilterContext'
import { useLedger } from '../ledger/LedgerData'
import { useAuth } from '../auth/AuthContext'
import { Money } from '../../components/ui/Money'
import { useToast } from '../../components/feedback/Toast'
import { addDays, addMonths, endOfMonth, formatDateEs, startOfMonth, startOfWeek } from '../../domain/calculations/dates'
import { occurrencesBetween } from '../../domain/calculations/recurrence'
import { TYPE_RULES, cashDelta } from '../../domain/calculations/transactionRules'
import { setTransactionsStatus } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'
import type { Transaction } from '../../domain/types/ledger'

interface DayItem {
  key: string
  date: string
  label: string
  deltaMinor: number | null
  state: 'confirmed' | 'planned' | 'pending' | 'virtual' | 'task'
  tx?: Transaction
  note?: string
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const STATE_LABEL: Record<DayItem['state'], string> = { confirmed: 'Confirmado', planned: 'Planificado', pending: 'Pendiente', virtual: 'Pago fijo (sin crear)', task: 'Tarea' }

export function CalendarPage() {
  const { user } = useAuth()
  const { accounts, recurring, tasks, transactions, today } = useLedger()
  const { scoped, scopeAccounts, filter } = useFilters()
  const { notify } = useToast()
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [selected, setSelected] = useState(today)
  const [busy, setBusy] = useState(false)
  const accName = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])

  const { byDate, gridStart } = useMemo(() => {
    const from = startOfMonth(month)
    const to = endOfMonth(month)
    const ids = new Set(scopeAccounts.map((a) => a.id))
    const map = new Map<string, DayItem[]>()
    const push = (it: DayItem) => map.set(it.date, [...(map.get(it.date) ?? []), it])

    for (const t of scoped) {
      if (t.date < from || t.date > to) continue
      // Transferencia entre cuentas del ámbito: se muestra una sola vez (el lado de salida).
      if (t.type === 'transfer' && t.direction === 'in' && t.counterpartAccountId && ids.has(t.counterpartAccountId)) continue
      const delta = cashDelta({ ...t, status: 'confirmed' })
      const internal = t.type === 'transfer' && t.counterpartAccountId && ids.has(t.counterpartAccountId)
      push({
        key: t.id, date: t.date, tx: t, state: t.status === 'planned' ? 'planned' : t.status === 'pending' ? 'pending' : 'confirmed',
        label: `${TYPE_RULES[t.type].label}${t.description ? ` · ${t.description}` : ''}`, deltaMinor: internal ? null : delta,
        note: `${accName.get(t.accountId) ?? ''}${internal ? ` → ${accName.get(t.counterpartAccountId ?? '') ?? ''}` : ''}`,
      })
    }
    const covered = new Set(transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date}`))
    for (const r of recurring) {
      if (!r.active || !ids.has(r.accountId)) continue
      for (const d of occurrencesBetween(r, from, to)) {
        if (covered.has(`${r.id}|${d}`)) continue
        push({ key: `v-${r.id}-${d}`, date: d, state: 'virtual', label: r.name, deltaMinor: (r.type === 'income' ? 1 : -1) * r.amountMinor, note: accName.get(r.accountId) })
      }
    }
    for (const k of tasks) {
      if (k.done || !k.dueDate || k.dueDate < from || k.dueDate > to) continue
      if (filter.scopes.length > 0 && !(k.businessId ? filter.scopes.includes(k.businessId) : filter.scopes.includes('personal'))) continue
      push({ key: `k-${k.id}`, date: k.dueDate, state: 'task', label: k.title, deltaMinor: null })
    }
    return { byDate: map, gridStart: startOfWeek(from) }
  }, [month, scoped, scopeAccounts, recurring, tasks, transactions, accName, filter.scopes])

  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const dayItems = byDate.get(selected) ?? []
  const monthTitle = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}T00:00:00Z`))

  const dayNet = (items: DayItem[]) => items.reduce((s, i) => s + (i.deltaMinor ?? 0), 0)

  async function confirm(t: Transaction) {
    if (t.date > today) { notify('error', 'Este movimiento es de una fecha futura. Edítalo en Movimientos con la fecha real antes de confirmarlo.'); return }
    setBusy(true)
    try {
      await setTransactionsStatus(user!.uid, t.transferId ? transactions.filter((x) => x.transferId === t.transferId) : [t], 'confirmed')
      notify('success', 'Movimiento confirmado.')
    } catch (e) { notify('error', humanizeFirebaseError(e)) } finally { setBusy(false) }
  }

  return (
    <div className="page wide">
      <header className="page-head"><div><h1>Calendario financiero</h1><p className="muted">Lo que ya pasó, lo planificado y tus pagos fijos, día por día.</p></div></header>
      <FilterBar scopeOnly />
      <LedgerGate>
        <div className="cal-head">
          <button type="button" className="icon-btn" aria-label="Mes anterior" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={18} aria-hidden /></button>
          <h2 className="cal-title">{monthTitle}</h2>
          <button type="button" className="icon-btn" aria-label="Mes siguiente" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18} aria-hidden /></button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setMonth(startOfMonth(today)); setSelected(today) }}>Hoy</button>
        </div>

        <div className="cal" role="grid" aria-label={`Calendario de ${monthTitle}`}>
          {WEEKDAYS.map((d) => <div key={d} className="cal-dow" role="columnheader">{d}</div>)}
          {cells.map((d) => {
            const items = byDate.get(d) ?? []
            const inMonth = d.slice(0, 7) === month.slice(0, 7)
            const net = dayNet(items)
            return (
              <button key={d} type="button" role="gridcell" aria-selected={d === selected} aria-label={`${formatDateEs(d)}${items.length ? `, ${items.length} elemento(s)` : ''}`}
                className={`cal-cell ${inMonth ? '' : 'is-out'} ${d === today ? 'is-today' : ''} ${d === selected ? 'is-selected' : ''}`} onClick={() => setSelected(d)}>
                <span className="cal-num">{Number(d.slice(8))}</span>
                {items.length ? (
                  <>
                    <span className="cal-dots" aria-hidden>
                      {items.slice(0, 4).map((i) => <i key={i.key} className={`cdot cdot-${i.state} ${i.deltaMinor !== null && i.deltaMinor < 0 ? 'out' : ''}`} />)}
                    </span>
                    {net !== 0 ? <Money minor={net} tone className="cal-net" /> : null}
                  </>
                ) : null}
              </button>
            )
          })}
        </div>
        <p className="tiny muted legend-row"><span><i className="cdot cdot-confirmed" aria-hidden /> Confirmado</span><span><i className="cdot cdot-planned" aria-hidden /> Planificado o pendiente</span><span><i className="cdot cdot-virtual" aria-hidden /> Pago fijo sin crear</span><span><i className="cdot cdot-task" aria-hidden /> Tarea</span></p>

        <section className="panel" aria-labelledby="day-title" aria-live="polite">
          <h2 id="day-title">{formatDateEs(selected)}{selected === today ? ' · hoy' : ''}</h2>
          {dayItems.length === 0 ? <p className="muted">Nada este día.</p> : (
            <ul className="rows">
              {dayItems.map((i) => (
                <li key={i.key}>
                  <div>
                    <strong>{i.label}</strong> <span className={`tag tag-${i.state === 'virtual' || i.state === 'task' ? 'planned' : i.state}`}>{STATE_LABEL[i.state]}</span>
                    {i.note ? <p className="tiny muted">{i.note}</p> : null}
                  </div>
                  {i.deltaMinor !== null ? <Money minor={i.deltaMinor} tone={i.state === 'confirmed'} className="row-amount" /> : <span className="muted small">{i.state === 'task' ? '' : 'Interna'}</span>}
                  <div className="actions">
                    {i.tx && (i.state === 'planned' || i.state === 'pending') ? <button type="button" className="icon-btn" title="Confirmar" aria-label={`Confirmar ${i.label}`} disabled={busy} onClick={() => confirm(i.tx!)}><CheckCircle2 size={16} aria-hidden /></button> : null}
                    {i.state === 'virtual' ? <Link className="btn btn-ghost btn-sm" to="/pagos-fijos">Generar</Link> : null}
                    {i.state === 'task' ? <Link className="icon-btn" to="/alertas" aria-label="Ver tareas" title="Ver tareas"><ListChecks size={16} aria-hidden /></Link> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </LedgerGate>
    </div>
  )
}
