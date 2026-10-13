import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Archive, ArchiveRestore, Plus } from 'lucide-react'
import { useLedger } from '../ledger/LedgerData'
import { LedgerGate } from '../ledger/LedgerGate'
import { FilterBar } from '../ledger/FilterBar'
import { useFilters } from '../ledger/FilterContext'
import { SummaryStrip } from '../ledger/SummaryStrip'
import { TransactionList } from '../ledger/TransactionList'
import { useAuth } from '../auth/AuthContext'
import { Money } from '../../components/ui/Money'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../components/feedback/Toast'
import { BusinessForm } from './BusinessForm'
import { AccountForm } from '../accounts/AccountForm'
import { ACCOUNT_TYPE_LABELS, BUSINESS_TYPE_LABELS, PAYOUT_FREQUENCY_LABELS, PAYOUT_METHOD_LABELS } from '../../domain/types/ledger'
import { applyFilter } from '../../domain/calculations/filters'
import { summarize } from '../../domain/calculations/summary'
import { cogsFor, withCogs } from '../../domain/calculations/cogs'
import { totalsByKind } from '../../domain/calculations/transactionRules'
import { formatBps } from '../../domain/calculations/percent'
import { setBusinessStatus } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

type Tab = 'resumen' | 'movimientos' | 'configuracion'

export function BusinessDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const { businesses, accounts, transactions, balances, sales, cancelledSaleIds, today } = useLedger()
  const { filter, range } = useFilters()
  const { notify } = useToast()
  const [tab, setTab] = useState<Tab>('resumen')
  const [addingAccount, setAddingAccount] = useState(false)
  const business = businesses.find((b) => b.id === id)
  const accs = useMemo(() => accounts.filter((a) => a.businessId === id), [accounts, id])

  const { rows, summary } = useMemo(() => {
    const f = { ...filter, scopes: [id], accountId: '', categoryId: filter.categoryId }
    const rows = applyFilter(transactions, accounts, f, today)
    const ids = new Set(accs.map((a) => a.id))
    return { rows, summary: withCogs(summarize(rows, ids), cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: ids, from: range?.from, to: range?.to })) }
  }, [filter, id, transactions, accounts, accs, today, sales, cancelledSaleIds, range])

  if (!business) {
    return (
      <div className="page"><LedgerGate>
        <div className="empty"><h2>No encontramos este negocio</h2><p>Puede que se haya eliminado o que el enlace sea incorrecto.</p><Link className="btn btn-secondary" to="/negocios">Volver a negocios</Link></div>
      </LedgerGate></div>
    )
  }

  const totals = totalsByKind(accs, balances)

  async function toggleArchive() {
    if (!business) return
    if (business.status === 'active' && accs.some((a) => a.status === 'active')) { notify('error', 'Archiva primero las cuentas de este negocio (deben estar en saldo cero).'); return }
    try { await setBusinessStatus(user!.uid, business.id, business.name, business.status === 'active' ? 'archived' : 'active'); notify('success', business.status === 'active' ? 'Negocio archivado.' : 'Negocio reactivado.') }
    catch (e) { notify('error', humanizeFirebaseError(e)) }
  }

  return (
    <div className="page wide">
      <Link to="/negocios" className="back"><ArrowLeft size={14} aria-hidden /> Negocios</Link>
      <header className="page-head">
        <div><h1>{business.name}</h1><p className="muted">{BUSINESS_TYPE_LABELS[business.type]}{business.status === 'archived' ? ' · Archivado' : ''}</p></div>
      </header>
      <div className="tabs" role="tablist" aria-label="Secciones del negocio">
        {(['resumen', 'movimientos', 'configuracion'] as Tab[]).map((t) => (
          <button key={t} role="tab" type="button" aria-selected={tab === t} className={`tab ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>
            {t === 'resumen' ? 'Resumen' : t === 'movimientos' ? 'Movimientos' : 'Configuración'}
          </button>
        ))}
      </div>

      <LedgerGate>
        {tab !== 'configuracion' ? <FilterBar hideScope compact={tab === 'resumen'} /> : null}

        {tab === 'resumen' ? (
          <>
            <section className="kpis two" aria-label="Efectivo del negocio">
              <div className="kpi"><span className="kpi-label">Efectivo disponible</span><Money minor={totals.cashMinor} className="kpi-value" /><span className="tiny muted">Reserva mínima: <Money minor={business.reserve.minReserveMinor} /></span></div>
              <div className="kpi"><span className="kpi-label">En cuentas de inversión</span><Money minor={totals.investedMinor} className="kpi-value" /></div>
            </section>
            <SummaryStrip summary={summary} />
            <section className="panel" aria-label="Cuentas del negocio">
              <div className="row between"><h2>Cuentas</h2><Button variant="secondary" icon={<Plus size={16} aria-hidden />} onClick={() => setAddingAccount(true)}>Añadir cuenta</Button></div>
              {accs.length === 0 ? <p className="muted">Este negocio aún no tiene cuentas.</p> : (
                <ul className="rows">{accs.map((a) => (
                  <li key={a.id} className={a.status === 'archived' ? 'is-void' : ''}><div><strong>{a.name}</strong> <span className="tag">{ACCOUNT_TYPE_LABELS[a.accountType]}</span></div><Money minor={balances.get(a.id)?.balanceMinor ?? 0} className="row-amount" /><span /></li>
                ))}</ul>
              )}
            </section>
          </>
        ) : null}

        {tab === 'movimientos' ? <TransactionList rows={rows} emptyText="Este negocio no tiene movimientos en el periodo elegido." /> : null}

        {tab === 'configuracion' ? (
          <>
            <section className="panel">
              <h2>Resumen de configuración</h2>
              <dl className="kv">
                <div><dt>Cómo te pagas</dt><dd>{PAYOUT_METHOD_LABELS[business.payout.method]} · {business.payout.frequency === 'custom' ? `cada ${business.payout.customDays} días` : PAYOUT_FREQUENCY_LABELS[business.payout.frequency]}</dd></div>
                <div><dt>Reserva mínima</dt><dd><Money minor={business.reserve.minReserveMinor} /></dd></div>
                <div><dt>Impuestos indirectos</dt><dd>{business.tax.enabled ? `${business.tax.label} ${formatBps(business.tax.rateBps)} · precio ${business.tax.pricesIncludeTax ? 'con impuesto incluido' : 'sin impuesto (se añade aparte)'}` : 'No configurados'}</dd></div>
                {business.type === 'physical' ? <div><dt>Valoración de inventario</dt><dd>Costo promedio ponderado</dd></div> : null}
              </dl>
            </section>
            <section className="panel"><h2>Editar negocio</h2><BusinessForm business={business} onDone={() => setTab('resumen')} /></section>
            <section className="panel">
              <h2>{business.status === 'active' ? 'Archivar negocio' : 'Reactivar negocio'}</h2>
              <p className="muted small">Los negocios no se borran: al archivarlos conservas todo su historial.</p>
              <div className="row"><Button variant="secondary" icon={business.status === 'active' ? <Archive size={16} aria-hidden /> : <ArchiveRestore size={16} aria-hidden />} onClick={toggleArchive}>{business.status === 'active' ? 'Archivar' : 'Reactivar'}</Button></div>
            </section>
          </>
        ) : null}
      </LedgerGate>

      <Modal open={addingAccount} onClose={() => setAddingAccount(false)} title="Nueva cuenta del negocio" size="lg">
        {addingAccount ? <AccountForm defaultBusinessId={business.id} onDone={() => setAddingAccount(false)} /> : null}
      </Modal>
    </div>
  )
}
