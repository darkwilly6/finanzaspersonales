import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const createClosingMock = vi.fn()
const openTransaction = vi.fn()
const tx = (id: string, type: string, amountMinor: number, date: string, extra: object = {}) => ({ id, type, amountMinor, date, accountId: 'a1', status: 'confirmed', direction: null, transferPurpose: null, transferId: null, counterpartAccountId: null, recurringId: null, saleId: null, description: '', counterparty: '', ...extra })
const ledger = {
  businesses: [{ id: 'b1', name: 'NYXAR', type: 'physical', status: 'active', reserve: { minReserveMinor: 10000 }, allocation: { reserveBps: 2000, reinvestBps: 3000, ownerBps: 5000 }, payout: { method: 'owner_draw', frequency: 'monthly', customDays: null } }] as unknown[],
  accounts: [{ id: 'a1', name: 'Banco', scope: 'business', businessId: 'b1', accountType: 'bank', status: 'active', openingBalanceMinor: 0, openingBalanceDate: '2026-01-01' }],
  transactions: [tx('i', 'income', 100000, '2026-09-10'), tx('e', 'expense', 20000, '2026-09-12')] as unknown[],
  sales: [], cancelledSaleIds: new Set<string>(), recurring: [],
  balances: new Map([['a1', { accountId: 'a1', balanceMinor: 200000, ignoredBeforeOpening: 0 }]]),
  closings: [] as unknown[],
  today: '2026-10-10',
}
vi.mock('../ledger/LedgerData', () => ({ useLedger: () => ledger }))
vi.mock('../ledger/RegisterContext', () => ({ useRegister: () => ({ openTransaction }) }))
vi.mock('../ledger/LedgerGate', () => ({ LedgerGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }))
vi.mock('../../components/feedback/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }))
vi.mock('../../lib/ledgerRepo', () => ({ createClosing: (...a: unknown[]) => createClosingMock(...a) }))

import { ClosingPage } from './ClosingPage'
const open = () => render(<MemoryRouter><ClosingPage /></MemoryRouter>)

beforeEach(() => { createClosingMock.mockReset(); createClosingMock.mockResolvedValue('created'); openTransaction.mockReset(); ledger.closings = [] })

describe('ClosingPage', () => {
  it('muestra el mes anterior con su resultado y el reparto según tus porcentajes', () => {
    open()
    expect(screen.getByRole('combobox', { name: /mes del cierre/i })).toHaveValue('2026-09')
    expect(screen.getByText(/resultado operativo del mes/i).closest('div')).toHaveTextContent('$800.00')
    expect(screen.getByText(/se puede repartir/i).closest('div')).toHaveTextContent('$800.00')
    expect(screen.getByRole('button', { name: /registrar mi pago \$400\.00/i })).toBeEnabled()
    expect(screen.getByText('$240.00')).toBeInTheDocument()
    expect(screen.getByText('$160.00')).toBeInTheDocument()
  })

  it('guarda el cierre con todos los números y sin mover dinero', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: /guardar cierre de septiembre/i }))
    await waitFor(() => expect(createClosingMock).toHaveBeenCalledTimes(1))
    const [uid, id, doc] = createClosingMock.mock.calls[0]!
    expect(uid).toBe('u1')
    expect(id).toBe('b1_2026-09')
    expect(doc).toMatchObject({ businessId: 'b1', month: '2026-09', from: '2026-09-01', to: '2026-09-30', baseMinor: 80000, allocatableMinor: 80000, ownerMinor: 40000, reinvestMinor: 24000, reserveMinor: 16000, heldBackMinor: 0, cashNowMinor: 200000, minReserveMinor: 10000 })
    expect(doc.ownerMinor + doc.reinvestMinor + doc.reserveMinor).toBe(doc.allocatableMinor)
    expect(openTransaction).not.toHaveBeenCalled()
  })

  it('"Registrar mi pago" abre la transferencia ya rellenada con el motivo del método de pago', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: /registrar mi pago/i }))
    expect(openTransaction.mock.calls[0]![0].prefill).toMatchObject({ type: 'transfer', transferPurpose: 'owner_withdrawal', accountId: 'a1', amount: '400.00' })
  })

  it('un mes ya cerrado muestra el cierre guardado y no permite guardarlo otra vez', () => {
    ledger.closings = [{ id: 'b1_2026-09', businessId: 'b1', month: '2026-09', ownerMinor: 111, reinvestMinor: 222, reserveMinor: 333, allocatableMinor: 666, heldBackMinor: 0, policy: { reserveBps: 2000, reinvestBps: 3000, ownerBps: 5000 }, note: '', createdAt: new Date('2026-10-01T00:00:00Z') }]
    open()
    expect(screen.getByText(/cierre guardado el/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar cierre/i })).not.toBeInTheDocument()
    expect(screen.getByText('$1.11')).toBeInTheDocument()
  })

  it('sin porcentajes definidos no inventa un reparto', () => {
    ledger.businesses = [{ ...(ledger.businesses[0] as object), allocation: null }]
    open()
    expect(screen.getByText(/define tus porcentajes/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /guardar cierre/i })).not.toBeInTheDocument()
    ledger.businesses = [{ ...(ledger.businesses[0] as object), allocation: { reserveBps: 2000, reinvestBps: 3000, ownerBps: 5000 } }]
  })
})
