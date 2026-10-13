import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { FullScreenLoader } from '../../components/feedback/Skeleton'

export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenLoader label="Verificando tu sesión…" />
  if (status === 'signedOut') return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
