import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const openTransaction = vi.fn()
const acc = (id: string, name: string, scope: 'personal' | 'business', accountType: string, opening: number) => ({ id, name, scope, businessId: scope === 'business' ? 'b1' : null, accountType, status: 'active', openingBalanceMinor: opening, openingBalanceDate: '2026-01-01' })
const tx = (id: string, type: string, amountMinor: number, date: string, accountId: string, scope: 'personal' | 'business' = 'business') => ({
  id, type, amountMinor, date, accountId, scope, businessId: scope === 'business' ? 'b1' : null, status: 'confirmed', direction: null, transferId: null, counterpartAccountId: null,
  transferPurpose: null, categoryId: null, description: '', counterparty: '', recurringId: null, saleId: null, createdAt: null,
})

const accounts = [acc('a1', 'Banco', 'business', 'bank', 100000), acc('i1', 'Broker', 'business', 'investment', 50000), acc('p1', 'Mi cuenta', 'personal', 'bank', 10000)]
const transactions = [tx('t1', 'income', 100000, '2026-10-05', 'a1'), tx('t2', 'expense', 20000, '2026-10-06', 'a1'), tx('t3', 'expense', 5000, '2026-10-07', 'p1', 'personal')]
const ledger = {
  businesses: [{ id: 'b1', name: 'NYXAR', status: 'active', allocation: null, reserve: { minReserveMinor: 0 } }] as unknown[],
  accounts, transactions, sales: [], cancelledSaleIds: new Set<string>(), recurring: [],
  balances: new Map(), today: '2026-10-14',
}

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { emailVerified: true, displayName: 'Williams Ramos' }, profile: { profile: { displayName: 'Williams Ramos' } }, profileError: false, reloadProfile: vi.fn() }) }))
vi.mock('../ledger/LedgerData', () => ({ useLedger: () => ledger }))
vi.mock('../ledger/FilterContext', () => ({ useFilters: () => ({ scopeAccounts: accounts, scopeIds: null, scoped: transactions, range: { from: '2026-10-01', to: '2026-10-31' } }) }))
vi.mock('../ledger/FilterBar', () => ({ FilterBar: () => null }))
vi.mock('../ledger/LedgerGate', () => ({ LedgerGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../ledger/RegisterContext', () => ({ useRegister: () => ({ openTransaction }) }))
vi.mock('../ledger/useInsights', () => ({
  useAlerts: () => [{ id: 'x', severity: 'warning', title: 'Reponer Camisa', detail: 'Quedan 2 unidad(es).', href: '/stock' }],
  useScopedForecast: (days: number) => ({
    startMinor: 185000, minMinor: 150000, minDate: '2026-11-01', firstNegativeDate: null, expectedInMinor: 0, expectedOutMinor: 0, obligationsMinor: 0,
    points: Array.from({ length: days + 1 }, (_, i) => ({ date: `2026-10-${String(14 + (i % 15)).padStart(2, '0')}`, balanceMinor: 185000 - i * 100 })),
    items: [{ date: '2026-10-16', label: 'Pago de internet', deltaMinor: -2500, source: 'recurring', accountId: 'a1' }],
  }),
}))

import { DashboardPage } from './DashboardPage'
const open = () => render(<MemoryRouter><DashboardPage /></MemoryRouter>)

beforeEach(() => { openTransaction.mockReset(); try { localStorage.clear() } catch { /* noop */ } })

describe('DashboardPage', () => {
  it('saluda por el nombre y muestra el lema', () => {
    open()
    expect(screen.getByRole('heading', { name: 'Hola, Williams' })).toBeInTheDocument()
    expect(screen.getByText(/disciplina hoy, libertad mañana/i)).toBeInTheDocument()
  })

  it('el balance suma efectivo e inversión, separados en sus tarjetas', () => {
    open()
    const bal = screen.getByLabelText('Balance')
    expect(within(bal).getByText('$2,350.00')).toBeInTheDocument() // 1,800 banco + 500 broker + 50 personal
    expect(within(bal).getByText('$500.00')).toBeInTheDocument() // en inversión
    expect(within(bal).getByText('$1,850.00')).toBeInTheDocument() // disponible
  })

  it('las cinco tarjetas separan gastos de negocio y personales y no mezclan los personales en el resultado', () => {
    open()
    const k = screen.getByLabelText('Resultados del periodo')
    expect(within(k).getByText('Ingresos netos').closest('article')).toHaveTextContent('$1,000.00')
    expect(within(k).getByText('Gastos operativos').closest('article')).toHaveTextContent('$200.00')
    expect(within(k).getByText('Gastos personales').closest('article')).toHaveTextContent('$50.00')
    expect(within(k).getByText('Resultado operativo').closest('article')).toHaveTextContent('$800.00')
    expect(within(k).getByText('Flujo neto de caja').closest('article')).toHaveTextContent('$750.00')
  })

  it('sin periodo anterior con datos no inventa porcentajes', () => {
    open()
    expect(screen.getAllByText(/sin base de comparación|sin comparación/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
  })

  it('ocultar saldos enmascara las cifras y recuerda la elección', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: /ocultar saldos/i }))
    expect(screen.queryByText('$2,350.00')).not.toBeInTheDocument()
    expect(screen.getAllByText('••••••').length).toBe(3)
    expect(localStorage.getItem('capitalos.hideBalances')).toBe('1')
  })

  it('el selector de horizonte cambia la proyección', async () => {
    open()
    expect(screen.getByRole('heading', { name: /próximos 60 días/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '180 días' }))
    expect(screen.getByRole('heading', { name: /próximos 180 días/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '180 días' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('muestra próximos pagos, alertas y últimos movimientos reales', () => {
    open()
    expect(screen.getByText('Pago de internet')).toBeInTheDocument()
    expect(screen.getByText('Reponer Camisa')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /últimos movimientos/i })).toBeInTheDocument()
  })

  it('las acciones rápidas abren el formulario correcto', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: /^ingresos$/i }))
    expect(openTransaction).toHaveBeenLastCalledWith({ type: 'income' })
    await userEvent.click(screen.getByRole('button', { name: /personales/i }))
    expect(openTransaction).toHaveBeenLastCalledWith({ type: 'expense', prefill: { type: 'expense', accountId: 'p1' } })
  })

  it('sin reparto definido, la sugerencia lo pide en lugar de inventar una', () => {
    open()
    expect(screen.getByText(/define el reparto/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /configurar reparto/i })).toHaveAttribute('href', '/negocios')
  })
})
