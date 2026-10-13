import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const createSaleMock = vi.fn()
const noTax = { enabled: false, label: '', rateBps: 0, pricesIncludeTax: true }
const ledger = {
  businesses: [] as unknown[],
  accounts: [{ id: 'a1', name: 'Banco NYXAR', scope: 'business', businessId: 'b1', accountType: 'bank', currency: 'USD', openingBalanceMinor: 0, openingBalanceDate: '2026-01-01', status: 'active' }],
  products: [
    { id: 'p1', name: 'Camisa negra', sku: 'CN-1', businessId: 'b1', unitPriceMinor: 2500, unitCostMinor: 1000, active: true },
    { id: 'p2', name: 'Gorra', sku: '', businessId: 'b1', unitPriceMinor: 1500, unitCostMinor: null, active: true },
  ],
  categories: [],
  today: '2026-10-10',
}

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }))
vi.mock('../ledger/LedgerData', () => ({ useLedger: () => ledger }))
vi.mock('../../components/feedback/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }))
vi.mock('../../lib/ledgerRepo', () => ({ newId: () => 'S1', createSale: (...a: unknown[]) => createSaleMock(...a) }))

import { SaleForm } from './SaleForm'

const open = () => render(<MemoryRouter><SaleForm onDone={vi.fn()} /></MemoryRouter>)

beforeEach(() => {
  createSaleMock.mockReset()
  createSaleMock.mockResolvedValue('created')
  ledger.businesses = [{ id: 'b1', name: 'NYXAR', status: 'active', tax: noTax }]
})

describe('SaleForm', () => {
  it('sin negocios guía a crear uno', () => {
    ledger.businesses = []
    open()
    expect(screen.getByText(/primero crea un negocio/i)).toBeInTheDocument()
  })

  it('al elegir un producto del catálogo rellena el precio y muestra la ganancia', async () => {
    open()
    await userEvent.selectOptions(screen.getByLabelText('Producto'), 'p1')
    expect(screen.getByLabelText('Precio unitario')).toHaveValue('25.00')
    await userEvent.clear(screen.getByLabelText('Unidades'))
    await userEvent.type(screen.getByLabelText('Unidades'), '3')
    const summary = screen.getByRole('note', { name: /resumen de la venta/i })
    expect(summary).toHaveTextContent('$75.00') // total
    expect(summary).toHaveTextContent('$30.00') // costo 3 × 10
    expect(summary).toHaveTextContent('$45.00') // ganancia
  })

  it('registra la venta con productos y unidades, con el id fijado al abrir', async () => {
    open()
    await userEvent.selectOptions(screen.getByLabelText('Producto'), 'p1')
    await userEvent.clear(screen.getByLabelText('Unidades'))
    await userEvent.type(screen.getByLabelText('Unidades'), '2')
    await userEvent.click(screen.getByRole('button', { name: /agregar producto/i }))
    const prods = screen.getAllByLabelText('Producto')
    await userEvent.selectOptions(prods[1]!, '')
    await userEvent.type(screen.getByLabelText('Nombre'), 'Sudadera')
    await userEvent.type(screen.getAllByLabelText('Precio unitario')[1]!, '40')
    await userEvent.click(screen.getByRole('button', { name: /registrar venta/i }))
    await waitFor(() => expect(createSaleMock).toHaveBeenCalledTimes(1))
    const built = createSaleMock.mock.calls[0]![1]
    expect(createSaleMock.mock.calls[0]![0]).toBe('u1')
    expect(built.saleId).toBe('S1')
    expect(built.sale.lines).toEqual([
      { productId: 'p1', name: 'Camisa negra', quantity: 2, unitPriceMinor: 2500, unitCostMinor: 1000 },
      { productId: null, name: 'Sudadera', quantity: 1, unitPriceMinor: 4000, unitCostMinor: null },
    ])
    expect(built.sale).toMatchObject({ netMinor: 9000, taxMinor: 0, totalMinor: 9000, units: 3, costMinor: null, accountId: 'a1' })
    expect(built.txs).toHaveLength(1)
  })

  it('si falta el costo de un producto no inventa una ganancia', async () => {
    open()
    await userEvent.selectOptions(screen.getByLabelText('Producto'), 'p2') // Gorra sin costo
    expect(screen.getByRole('note', { name: /resumen de la venta/i })).toHaveTextContent(/no se calcula: falta el costo/i)
  })

  it('con impuestos aparte separa el impuesto cobrado y crea dos movimientos', async () => {
    ledger.businesses = [{ id: 'b1', name: 'NYXAR', status: 'active', tax: { enabled: true, label: 'IVA', rateBps: 1300, pricesIncludeTax: true } }]
    open()
    await userEvent.selectOptions(screen.getByLabelText('Producto'), '')
    await userEvent.type(screen.getByLabelText('Nombre'), 'Pack')
    await userEvent.type(screen.getByLabelText('Precio unitario'), '100')
    await userEvent.selectOptions(screen.getByLabelText(/precios que escribí/i), 'out')
    const summary = screen.getByRole('note', { name: /resumen de la venta/i })
    expect(summary).toHaveTextContent('$13.00') // IVA
    expect(summary).toHaveTextContent('$113.00') // total al cliente
    await userEvent.click(screen.getByRole('button', { name: /registrar venta/i }))
    await waitFor(() => expect(createSaleMock).toHaveBeenCalled())
    const built = createSaleMock.mock.calls[0]![1]
    expect(built.txs.map((t: { data: { type: string; amountMinor: number } }) => [t.data.type, t.data.amountMinor])).toEqual([['income', 10000], ['tax_collected', 1300]])
  })

  it('no guarda y marca errores si falta el nombre o el precio', async () => {
    open()
    await userEvent.click(screen.getByRole('button', { name: /registrar venta/i }))
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0)
    expect(createSaleMock).not.toHaveBeenCalled()
  })

  it('el doble clic no registra dos ventas', async () => {
    createSaleMock.mockImplementation(() => new Promise((r) => setTimeout(() => r('created'), 60)))
    open()
    await userEvent.selectOptions(screen.getByLabelText('Producto'), 'p1')
    await userEvent.dblClick(screen.getByRole('button', { name: /registrar venta/i }))
    await waitFor(() => expect(createSaleMock).toHaveBeenCalled())
    expect(createSaleMock).toHaveBeenCalledTimes(1)
  })

  it('una venta pendiente avisa que no cambia el saldo todavía', async () => {
    open()
    await userEvent.selectOptions(screen.getByLabelText('Cobro'), 'pending')
    expect(within(screen.getByRole('note', { name: /resumen de la venta/i })).getByText(/no cambia tu saldo hasta que marques el cobro/i)).toBeInTheDocument()
  })
})
