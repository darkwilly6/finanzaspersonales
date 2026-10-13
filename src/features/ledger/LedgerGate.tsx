import type { ReactNode } from 'react'
import { useLedger, TX_LIMIT } from './LedgerData'
import { Skeleton } from '../../components/feedback/Skeleton'

/** Estados globales de carga/error/límite para las páginas que dependen de los datos del libro. */
export function LedgerGate({ children }: { children: ReactNode }) {
  const { loading, error, truncated } = useLedger()
  if (error) {
    return (
      <div className="notice notice-warn" role="alert">
        <p>No pudimos cargar tus datos: {error} Si es la primera vez, confirma que desplegaste las reglas de Firestore (README, paso 3).</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>Reintentar</button>
      </div>
    )
  }
  if (loading) return <div className="panel stack"><Skeleton height={22} width="40%" /><Skeleton height={44} /><Skeleton height={44} /><Skeleton height={44} /></div>
  return (
    <>
      {truncated ? (
        <div className="notice notice-warn" role="status">
          <p>Hay más de {TX_LIMIT.toLocaleString('es')} movimientos: solo se cargaron los más recientes y los saldos pueden quedar incompletos. Esto se resolverá con cierres mensuales en una fase posterior.</p>
        </div>
      ) : null}
      {children}
    </>
  )
}
