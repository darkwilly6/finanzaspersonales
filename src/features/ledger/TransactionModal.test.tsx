import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const createMock = vi.fn()
const ledger = {
  accounts: [] as unknown[],
  categories: [] as unknown[],
  businesses: [{ id: 'b1', name: 'NYXAR' }],
  today: '2026-10-10',
}

vi.mock('../auth/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }))
vi.mock('./LedgerData', () => ({ useLedger: () => ledger }))
vi.mock('../../components/feedback/Toast', () => ({ useToast: () => ({ notify: vi.fn() }) }))
vi.mock('../../lib/ledgerRepo', () => ({
  newId: () => 'fixedId',
  createTransactions: (...a: unknown[]) => createMock(...a),
  updateTransactions: vi.fn(),
}))

import { TransactionModal } from './TransactionModal'

const acc = (id: string, name: string, scope: 'personal' | 'business', businessId: string | null, accountType = 'bank') => ({
  id, name, scope, businessId, accountType, currency: 'USD', openingBalanceMinor: 0, openingBalanceDate: '2026-01-01', status: 'active',
})

function setup(type: 'income' | 'transfer' = 'income') {
  const onClose = vi.fn()
  render(<MemoryRouter><TransactionModal open onClose={onClose} options={{ type }} /></MemoryRouter>)
  return { onClose }
}

beforeEach(() => {
  createMock.mockReset()
  createMock.mockResolvedValue('created')
  ledger.accounts = [acc('acc1', 'Banco NYXAR', 'business', 'b1'), acc('acc2', 'Caja NYXAR', 'business', 'b1', 'cash'), acc('pers', 'Cuenta personal', 'personal', null)]
})

describe('TransactionModal', () => {
  it('sin cuentas guía a crear la primera en lugar de mostrar un formulario inútil', () => {
    ledger.accounts = []
    setup()
    expect(screen.getByText(/necesitas al menos una cuenta/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /crear mi primera cuenta/i })).toBeInTheDocument()
  })

  it('no guarda y muestra errores si faltan datos', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /guardar movimiento/i }))
    expect(await screen.findAllByText(/importe válido/i)).not.toHaveLength(0)
    expect(screen.getByText(/elige la cuenta/i)).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })

  it('registra un ingreso en centavos con el id fijado al abrir', async () => {
    const { onClose } = setup()
    await userEvent.selectOptions(screen.getByLabelText('Cuenta'), 'acc1')
    await userEvent.type(screen.getByLabelText(/importe/i), '125.50')
    await userEvent.click(screen.getByRole('button', { name: /guardar movimiento/i }))
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const [uid, built] = createMock.mock.calls[0] as [string, { id: string; data: Record<string, unknown> }[]]
    expect(uid).toBe('u1')
    expect(built).toHaveLength(1)
    expect(built[0]!.id).toBe('fixedId')
    expect(built[0]!.data).toMatchObject({ type: 'income', amountMinor: 12550, accountId: 'acc1', businessId: 'b1', scope: 'business', status: 'confirmed' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('el doble clic no crea dos movimientos', async () => {
    createMock.mockImplementation(() => new Promise((r) => setTimeout(() => r('created'), 60)))
    setup()
    await userEvent.selectOptions(screen.getByLabelText('Cuenta'), 'acc1')
    await userEvent.type(screen.getByLabelText(/importe/i), '10')
    const btn = screen.getByRole('button', { name: /guardar movimiento/i })
    await userEvent.dblClick(btn)
    await waitFor(() => expect(createMock).toHaveBeenCalled())
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('una transferencia muestra vista previa y crea dos lados vinculados', async () => {
    setup('transfer')
    await userEvent.selectOptions(screen.getByLabelText('Desde la cuenta'), 'acc1')
    await userEvent.selectOptions(screen.getByLabelText('Hacia la cuenta'), 'acc2')
    await userEvent.type(screen.getByLabelText(/importe/i), '300')
    expect(await screen.findByRole('note', { name: /vista previa/i })).toHaveTextContent(/dos registros vinculados/i)
    expect(screen.getByRole('note', { name: /vista previa/i })).toHaveTextContent(/no cuenta como ingreso ni gasto/i)
    await userEvent.click(screen.getByRole('button', { name: /confirmar transferencia/i }))
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1))
    const built = createMock.mock.calls[0]![1] as { id: string; data: { direction: string; accountId: string; transferId: string } }[]
    expect(built.map((b) => b.id)).toEqual(['fixedId_out', 'fixedId_in'])
    expect(built.map((b) => b.data.direction)).toEqual(['out', 'in'])
    expect(built.map((b) => b.data.accountId)).toEqual(['acc1', 'acc2'])
    expect(new Set(built.map((b) => b.data.transferId))).toEqual(new Set(['fixedId']))
  })

  it('rechaza un retiro del propietario en una cuenta personal', async () => {
    setup()
    await userEvent.selectOptions(screen.getByLabelText('Tipo de movimiento'), 'owner_withdrawal')
    const personal = screen.getByRole('option', { name: 'Cuenta personal' })
    expect(personal).toBeDisabled()
  })

  it('un movimiento confirmado con fecha futura se rechaza', async () => {
    setup()
    await userEvent.selectOptions(screen.getByLabelText('Cuenta'), 'acc1')
    await userEvent.type(screen.getByLabelText(/importe/i), '10')
    const date = screen.getByLabelText('Fecha')
    await userEvent.clear(date)
    await userEvent.type(date, '2026-12-01')
    await userEvent.click(screen.getByRole('button', { name: /guardar movimiento/i }))
    expect(await screen.findByText(/no puede tener fecha futura/i)).toBeInTheDocument()
    expect(createMock).not.toHaveBeenCalled()
  })
})
