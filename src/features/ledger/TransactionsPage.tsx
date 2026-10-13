import { Plus } from 'lucide-react'
import { FilterBar } from './FilterBar'
import { SummaryStrip } from './SummaryStrip'
import { TransactionList } from './TransactionList'
import { LedgerGate } from './LedgerGate'
import { useFilters } from './FilterContext'
import { useLedger } from './LedgerData'
import { useRegister } from './RegisterContext'
import { Button } from '../../components/ui/Button'

export function TransactionsPage() {
  const { filtered, summary } = useFilters()
  const { accounts, transactions } = useLedger()
  const { openTransaction } = useRegister()
  return (
    <div className="page wide">
      <header className="page-head">
        <div><h1>Movimientos</h1><p className="muted">Todo lo que entra y sale, en un solo lugar. Los anulados se conservan y las transferencias entre tus cuentas no se cuentan dos veces.</p></div>
        <Button icon={<Plus size={16} aria-hidden />} onClick={() => openTransaction()}>Nuevo movimiento</Button>
      </header>
      <FilterBar />
      <LedgerGate>
        <SummaryStrip summary={summary} />
        <TransactionList rows={filtered} emptyText={accounts.length === 0 ? 'Aún no hay cuentas. Crea una cuenta y registra tu primer movimiento.' : transactions.length === 0 ? 'Aún no has registrado movimientos.' : 'No hay movimientos con estos filtros.'} />
      </LedgerGate>
    </div>
  )
}
