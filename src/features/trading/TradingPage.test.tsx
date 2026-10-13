import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const openTransaction = vi.fn()
const biz = (over: object = {}) => ({
  id: 'b1', name: 'Trading Lab', type: 'trading', status: 'active', currency: 'USD',
  reserve: { minReserveMinor: 100000 }, allocation: { reserveBps: 2000, reinvestBps: 3000, ownerBps: 5000 }, ...over,
})
const tx = (id: string, type: string, amountMinor: number, extra: object = {}) => ({
  id, type, amountMinor, accountId: 'a1', status: 'confirmed', date: '2026-10-05', direction: null, transferId: null, counterpartAccountId: null, recurringId: null, description: '', counterparty: '', ...extra,
})
const ledger = {
  businesses: [] as unknown[],
  accounts: [{ id: 'a1', name: 'Banco trading', scope: 'business', businessId: 'b1', accountType: 'bank', status: 'active', openingBalanceMinor: 300000, openingBalanceDate: '2026-01-01' }],
  transactions: [] as unknown[],
  recurring: [],
  balances: new Map([['a1', { accountId: 'a1', balanceMinor: 330000, ignoredBeforeOpening: 0 }]]),
  today: '2026-10-10',
}

vi.mock('../ledger/LedgerData', () => ({ useLedger: () => ledger }))
vi.mock('../ledger/FilterContext', () => ({ useFilters: () => ({ range: { from: '2026-10-01', to: '2026-10-31' } }) }))
vi.mock('../ledger/RegisterContext', () => ({ useRegister: () => ({ openTransaction }) }))
vi.mock('../ledger/FilterBar', () => ({ FilterBar: () => null }))
vi.mock('../ledger/LedgerGate', () => ({ LedgerGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('../ledger/TransactionList', () => ({ TransactionList: () => null }))

import { TradingPage } from './TradingPage'

const render_ = () => render(<MemoryRouter><TradingPage /></MemoryRouter>)

beforeEach(() => {
  openTransaction.mockReset()
  ledger.businesses = [biz()]
  ledger.transactions = [tx('w', 'trading_withdrawal', 100000), tx('e', 'expense', 20000), tx('i', 'investment', 50000)]
})

describe('TradingPage', () => {
  it('sin negocio de trading guía a crearlo', () => {
    ledger.businesses = [biz({ type: 'physical' })]
    render_()
    expect(screen.getByText(/aún no tienes un negocio de trading/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /crear negocio de trading/i })).toBeInTheDocument()
  })

  it('calcula retirado, invertido, gastos, neto y lo que te corresponde con tus porcentajes', () => {
    render_()
    const kpis = screen.getByRole('group', { name: /resultado del periodo/i })
    expect(kpis).toHaveTextContent('$1,000.00') // retirado
    expect(kpis).toHaveTextContent('$500.00') // invertido
    expect(kpis).toHaveTextContent('$200.00') // gastos de fondeo
    expect(kpis).toHaveTextContent('$300.00') // neto = 1000 - 500 - 200
    // base 800; excedente 3300 - 1000 - 0 = 2300; se reparte 800: 50 % = 400, 30 % = 240, 20 % = 160
    expect(screen.getByRole('button', { name: /pagarme \$400\.00/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /reinvertir \$240\.00/i })).toBeEnabled()
    expect(screen.getByText('$160.00')).toBeInTheDocument()
  })

  it('"Pagarme" abre una transferencia de retiro del propietario ya rellenada, sin crear nada por sí solo', async () => {
    render_()
    await userEvent.click(screen.getByRole('button', { name: /pagarme/i }))
    expect(openTransaction).toHaveBeenCalledTimes(1)
    expect(openTransaction.mock.calls[0]![0].prefill).toMatchObject({ type: 'transfer', transferPurpose: 'owner_withdrawal', accountId: 'a1', amount: '400.00' })
  })

  it('sin porcentajes definidos no inventa un reparto y lo pide', () => {
    ledger.businesses = [biz({ allocation: null })]
    render_()
    expect(screen.getByText(/define tus porcentajes/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pagarme/i })).not.toBeInTheDocument()
  })

  it('si el efectivo no cubre la reserva y los pagos, no reparte nada', () => {
    ledger.balances = new Map([['a1', { accountId: 'a1', balanceMinor: 90000, ignoredBeforeOpening: 0 }]])
    render_()
    expect(screen.getByText(/primero se protege el negocio/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /pagarme/i })).not.toBeInTheDocument()
    ledger.balances = new Map([['a1', { accountId: 'a1', balanceMinor: 330000, ignoredBeforeOpening: 0 }]])
  })

  it('si no hay ganancia en el periodo, no hay nada que repartir', () => {
    ledger.transactions = [tx('w', 'trading_withdrawal', 10000), tx('e', 'expense', 30000)]
    render_()
    expect(screen.getByText(/no hay excedente/i)).toBeInTheDocument()
  })

  it('los botones de registro abren el formulario con el tipo correcto', async () => {
    render_()
    await userEvent.click(screen.getByRole('button', { name: /registrar retiro/i }))
    expect(openTransaction.mock.calls[0]![0].prefill).toMatchObject({ type: 'trading_withdrawal', accountId: 'a1' })
    await userEvent.click(screen.getByRole('button', { name: /gasto de fondeo/i }))
    expect(openTransaction.mock.calls[1]![0].prefill).toMatchObject({ type: 'expense' })
    await userEvent.click(screen.getByRole('button', { name: /registrar inversión/i }))
    expect(openTransaction.mock.calls[2]![0].prefill).toMatchObject({ type: 'investment' })
  })
})
