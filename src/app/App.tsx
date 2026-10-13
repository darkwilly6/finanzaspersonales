import { Suspense, lazy } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthContext'
import { ToastProvider } from '../components/feedback/Toast'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage'
import { SetupRequired } from '../features/auth/SetupRequired'
import { LedgerLayout } from '../features/ledger/LedgerLayout'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { isFirebaseConfigured } from '../lib/firebase'
import { FullScreenLoader } from '../components/feedback/Skeleton'

// Cada pantalla se descarga solo cuando se abre: la primera carga es mucho más liviana.
const TransactionsPage = lazy(() => import('../features/ledger/TransactionsPage').then((m) => ({ default: m.TransactionsPage })))
const BusinessesPage = lazy(() => import('../features/businesses/BusinessesPage').then((m) => ({ default: m.BusinessesPage })))
const BusinessDetailPage = lazy(() => import('../features/businesses/BusinessDetailPage').then((m) => ({ default: m.BusinessDetailPage })))
const AccountsPage = lazy(() => import('../features/accounts/AccountsPage').then((m) => ({ default: m.AccountsPage })))
const CategoriesPage = lazy(() => import('../features/categories/CategoriesPage').then((m) => ({ default: m.CategoriesPage })))
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })))
const RecurringPage = lazy(() => import('../features/recurring/RecurringPage').then((m) => ({ default: m.RecurringPage })))
const TradingPage = lazy(() => import('../features/trading/TradingPage').then((m) => ({ default: m.TradingPage })))
const SalesPage = lazy(() => import('../features/sales/SalesPage').then((m) => ({ default: m.SalesPage })))
const ProductsPage = lazy(() => import('../features/products/ProductsPage').then((m) => ({ default: m.ProductsPage })))
const StockPage = lazy(() => import('../features/stock/StockPage').then((m) => ({ default: m.StockPage })))
const ClosingPage = lazy(() => import('../features/closing/ClosingPage').then((m) => ({ default: m.ClosingPage })))
const ScalingPage = lazy(() => import('../features/scaling/ScalingPage').then((m) => ({ default: m.ScalingPage })))
const ExportPage = lazy(() => import('../features/export/ExportPage').then((m) => ({ default: m.ExportPage })))
const AlertsPage = lazy(() => import('../features/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))

/**
 * HashRouter: GitHub Pages no reescribe rutas a index.html, así que con BrowserRouter
 * un refresh en /configuracion daría 404. Con hash (#/configuracion) siempre carga.
 */
export function App() {
  if (!isFirebaseConfigured) return <SetupRequired />

  return (
    <ToastProvider>
      <AuthProvider>
        <HashRouter>
          <Suspense fallback={<FullScreenLoader label="Cargando…" />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<RegisterPage />} />
            <Route path="/recuperar" element={<ForgotPasswordPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<LedgerLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="negocios" element={<BusinessesPage />} />
                <Route path="negocios/:id" element={<BusinessDetailPage />} />
                <Route path="cuentas" element={<AccountsPage />} />
                <Route path="categorias" element={<CategoriesPage />} />
                <Route path="movimientos" element={<TransactionsPage />} />
                <Route path="analitica" element={<AnalyticsPage />} />
                <Route path="calendario" element={<CalendarPage />} />
                <Route path="pagos-fijos" element={<RecurringPage />} />
                <Route path="alertas" element={<AlertsPage />} />
                <Route path="inversiones" element={<TradingPage />} />
                <Route path="ventas" element={<SalesPage />} />
                <Route path="inventario" element={<ProductsPage />} />
                <Route path="stock" element={<StockPage />} />
                <Route path="cierre" element={<ClosingPage />} />
                <Route path="escalado" element={<ScalingPage />} />
                <Route path="exportar" element={<ExportPage />} />
                <Route path="configuracion" element={<SettingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </HashRouter>
      </AuthProvider>
    </ToastProvider>
  )
}
