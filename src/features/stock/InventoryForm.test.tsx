import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const createMock = vi.fn()
const ledger = {
  products: [{ id: 'p1', name: 'Camisa negra', sku: '', businessId: 'b1', unitPriceMinor: 2500, unitCostMinor: null, active: true, trackStock: true, reorderPoint: 5 }],
  accounts: [{ id: 'a1', name: 'Banco NYXAR', scope: 'business', businessId: 'b1', accountType: 'bank', currency: 'USD', openingBalanceMinor: 0, openingBalanceDate: '2026-01-01', status: 'active' }],
  stock: new Map([['p1', { units: 10, valueMinor: 8000 }]]),
  today: '2026-10-10',
}
vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }))
vi.mock('../ledger/LedgerData', () => ({ useLedger: () => ledger }))
vi.mock('../../components/feedback/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }))
vi.mock('../../lib/ledgerRepo', () => ({ newId: () => 'M1', createInventoryMove: (...a: unknown[]) => createMock(...a) }))

import { InventoryForm } from './InventoryForm'

beforeEach(() => { createMock.mockReset(); createMock.mockResolvedValue('created') })

describe('InventoryForm', () => {
  it('una compra crea stock y un pago que NO es gasto, con la cuenta única elegida sola', async () => {
    render(<InventoryForm kind="purchase" productId="p1" onDone={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Unidades'), '50')
    await userEvent.type(screen.getByLabelText(/costo por unidad/i), '8')
    expect(screen.getByRole('note', { name: /resumen del movimiento/i })).toHaveTextContent(/no es gasto/i)
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const built = createMock.mock.calls[0]![1]
    expect(built.move).toMatchObject({ id: 'M1', data: { kind: 'purchase', quantity: 50, totalCostMinor: 40000, productId: 'p1' } })
    expect(built.tx.data).toMatchObject({ type: 'inventory_purchase', amountMinor: 40000, accountId: 'a1', status: 'confirmed' })
  })

  it('no guarda con datos incompletos', async () => {
    render(<InventoryForm kind="purchase" productId="p1" onDone={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('un ajuste que resta más de lo que hay se rechaza, y uno válido usa el costo promedio', async () => {
    render(<InventoryForm kind="adjustment" productId="p1" onDone={vi.fn()} />)
    await userEvent.selectOptions(screen.getByLabelText(/el ajuste/i), 'out')
    await userEvent.type(screen.getByLabelText('Unidades'), '11')
    await userEvent.type(screen.getByLabelText(/motivo/i), 'Mercancía dañada')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText(/no hay suficiente stock/i)).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
    await userEvent.clear(screen.getByLabelText('Unidades'))
    await userEvent.type(screen.getByLabelText('Unidades'), '4')
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(createMock).toHaveBeenCalled())
    expect(createMock.mock.calls[0]![1].move.data).toMatchObject({ quantity: -4, totalCostMinor: 3200 })
    expect(createMock.mock.calls[0]![1].tx).toBeNull()
  })

  it('el doble clic no registra dos veces', async () => {
    createMock.mockImplementation(() => new Promise((r) => setTimeout(() => r('created'), 60)))
    render(<InventoryForm kind="opening" productId="p1" onDone={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('Unidades'), '5')
    await userEvent.type(screen.getByLabelText(/costo por unidad/i), '8')
    await userEvent.dblClick(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(createMock).toHaveBeenCalled())
    expect(createMock).toHaveBeenCalledTimes(1)
  })
})
