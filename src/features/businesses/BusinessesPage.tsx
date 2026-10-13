import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import { useLedger } from '../ledger/LedgerData'
import { LedgerGate } from '../ledger/LedgerGate'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { BusinessForm } from './BusinessForm'
import { BUSINESS_TYPE_LABELS, PAYOUT_METHOD_LABELS } from '../../domain/types/ledger'
import { totalsByKind } from '../../domain/calculations/transactionRules'

export function BusinessesPage() {
  const { businesses, accounts, balances } = useLedger()
  const [creating, setCreating] = useState(false)
  const loc = useLocation()
  const nav = useNavigate()

  useEffect(() => {
    if ((loc.state as { openNew?: number } | null)?.openNew) { setCreating(true); nav(loc.pathname, { replace: true, state: null }) }
  }, [loc, nav])

  const active = businesses.filter((b) => b.status === 'active')
  const archived = businesses.filter((b) => b.status === 'archived')

  const card = (b: (typeof businesses)[number]) => {
    const accs = accounts.filter((a) => a.businessId === b.id)
    const t = totalsByKind(accs, balances)
    return (
      <li key={b.id} className="card">
        <Link to={`/negocios/${b.id}`} className="card-link">
          <div className="card-head"><Building2 size={18} aria-hidden /><strong>{b.name}</strong>{b.status === 'archived' ? <span className="tag">Archivado</span> : null}</div>
          <p className="muted small">{BUSINESS_TYPE_LABELS[b.type]} · {PAYOUT_METHOD_LABELS[b.payout.method]}</p>
          <dl className="kv compact">
            <div><dt>Efectivo</dt><dd><Money minor={t.cashMinor} /></dd></div>
            {t.investedMinor !== 0 || accs.some((a) => a.accountType === 'investment') ? <div><dt>En inversión</dt><dd><Money minor={t.investedMinor} /></dd></div> : null}
            <div><dt>Cuentas</dt><dd>{accs.filter((a) => a.status === 'active').length}</dd></div>
          </dl>
        </Link>
      </li>
    )
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Negocios y marcas</h1><p className="muted">Cada negocio tiene sus cuentas, su forma de pago y su configuración. Los creas tú, con tus datos reales.</p></div>
        <Button icon={<Plus size={16} aria-hidden />} onClick={() => setCreating(true)}>Nuevo negocio</Button>
      </header>
      <LedgerGate>
        {active.length === 0 ? (
          <div className="empty">
            <h2>Aún no tienes negocios</h2>
            <p>Crea el primero para asignarle cuentas y empezar a registrar movimientos. También puedes registrar solo finanzas personales desde Cuentas.</p>
            <Button onClick={() => setCreating(true)}>Crear mi primer negocio</Button>
          </div>
        ) : <ul className="cards">{active.map(card)}</ul>}
        {archived.length ? <details className="panel"><summary>Archivados ({archived.length})</summary><ul className="cards">{archived.map(card)}</ul></details> : null}
      </LedgerGate>
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo negocio" size="lg">
        {creating ? <BusinessForm onDone={() => setCreating(false)} /> : null}
      </Modal>
    </div>
  )
}
