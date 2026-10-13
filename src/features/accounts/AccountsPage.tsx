import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Pencil, Plus } from 'lucide-react'
import { useLedger } from '../ledger/LedgerData'
import { LedgerGate } from '../ledger/LedgerGate'
import { FilterBar } from '../ledger/FilterBar'
import { useFilters } from '../ledger/FilterContext'
import { useAuth } from '../auth/AuthContext'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { Money } from '../../components/ui/Money'
import { useToast } from '../../components/feedback/Toast'
import { AccountForm } from './AccountForm'
import { ACCOUNT_TYPE_LABELS, type Account } from '../../domain/types/ledger'
import { totalsByKind } from '../../domain/calculations/transactionRules'
import { setAccountStatus } from '../../lib/ledgerRepo'
import { humanizeFirebaseError } from '../../lib/errors'

export function AccountsPage() {
  const { user } = useAuth()
  const { businesses, balances, transactions } = useLedger()
  const { scopeAccounts } = useFilters()
  const { notify } = useToast()
  const [editing, setEditing] = useState<Account | 'new' | null>(null)
  const loc = useLocation()
  const nav = useNavigate()

  useEffect(() => {
    if ((loc.state as { openNew?: number } | null)?.openNew) { setEditing('new'); nav(loc.pathname, { replace: true, state: null }) }
  }, [loc, nav])

  const totals = totalsByKind(scopeAccounts, balances)
  const groups: { key: string; title: string; list: Account[] }[] = [
    { key: 'personal', title: 'Personal', list: scopeAccounts.filter((a) => a.scope === 'personal') },
    ...businesses.map((b) => ({ key: b.id, title: b.name, list: scopeAccounts.filter((a) => a.businessId === b.id) })),
  ].filter((g) => g.list.length > 0)

  async function toggle(a: Account) {
    if (a.status === 'active') {
      const bal = balances.get(a.id)?.balanceMinor ?? 0
      if (bal !== 0) { notify('error', 'No puedes archivar una cuenta con saldo distinto de cero. Transfiere el dinero o registra un ajuste primero.'); return }
      if (transactions.some((t) => t.accountId === a.id && (t.status === 'pending' || t.status === 'planned'))) { notify('error', 'La cuenta tiene movimientos pendientes o planificados. Confírmalos o anúlalos primero.'); return }
    }
    try { await setAccountStatus(user!.uid, a.id, a.name, a.status === 'active' ? 'archived' : 'active'); notify('success', a.status === 'active' ? 'Cuenta archivada.' : 'Cuenta reactivada.') }
    catch (e) { notify('error', humanizeFirebaseError(e)) }
  }

  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Cuentas y saldos</h1><p className="muted">El saldo de cada cuenta es su saldo inicial más los movimientos confirmados. Nunca se escribe a mano.</p></div>
        <Button icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>Nueva cuenta</Button>
      </header>
      <FilterBar scopeOnly />
      <LedgerGate>
        <section className="kpis two" aria-label="Totales">
          <div className="kpi"><span className="kpi-label">Efectivo disponible</span><Money minor={totals.cashMinor} className="kpi-value" /><span className="tiny muted">Cuentas activas que no son de inversión</span></div>
          <div className="kpi"><span className="kpi-label">En cuentas de inversión</span><Money minor={totals.investedMinor} className="kpi-value" /><span className="tiny muted">Capital invertido, aparte del efectivo</span></div>
        </section>
        {groups.length === 0 ? (
          <div className="empty"><h2>Aún no hay cuentas</h2><p>Crea tus cuentas con su saldo inicial real: banco, efectivo, procesadores de pago, billeteras o cuentas de inversión.</p><Button onClick={() => setEditing('new')}>Crear mi primera cuenta</Button></div>
        ) : groups.map((g) => (
          <section key={g.key} className="panel" aria-label={g.title}>
            <h2>{g.title}</h2>
            <ul className="rows">
              {g.list.map((a) => (
                <li key={a.id} className={a.status === 'archived' ? 'is-void' : ''}>
                  <div><strong>{a.name}</strong> <span className="tag">{ACCOUNT_TYPE_LABELS[a.accountType]}</span>{a.status === 'archived' ? <span className="tag">Archivada</span> : null}
                    {(balances.get(a.id)?.ignoredBeforeOpening ?? 0) > 0 ? <p className="tiny muted">{balances.get(a.id)!.ignoredBeforeOpening} movimiento(s) anteriores al saldo inicial no se cuentan.</p> : null}
                  </div>
                  <Money minor={balances.get(a.id)?.balanceMinor ?? 0} className="row-amount" />
                  <div className="actions">
                    <button type="button" className="icon-btn" aria-label={`Editar ${a.name}`} title="Editar" onClick={() => setEditing(a)}><Pencil size={16} aria-hidden /></button>
                    <button type="button" className="icon-btn" aria-label={a.status === 'active' ? `Archivar ${a.name}` : `Reactivar ${a.name}`} title={a.status === 'active' ? 'Archivar' : 'Reactivar'} onClick={() => toggle(a)}>{a.status === 'active' ? <Archive size={16} aria-hidden /> : <ArchiveRestore size={16} aria-hidden />}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </LedgerGate>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva cuenta' : 'Editar cuenta'} size="lg">
        {editing !== null ? <AccountForm account={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      </Modal>
    </div>
  )
}
