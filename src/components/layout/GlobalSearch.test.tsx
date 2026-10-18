import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'

const ledger = {
  businesses: [{ id: 'b1', name: 'NYXAR' }], accounts: [{ id: 'a1', name: 'Banco Cuscatlán' }], products: [{ id: 'p1', name: 'Camisa negra', sku: 'CN-1' }],
  categories: [{ id: 'c1', name: 'Publicidad' }], transactions: [{ id: 't1', description: 'Pago de internet', counterparty: 'Tigo', date: '2026-10-10' }],
  sales: [], tasks: [], goals: [],
}
vi.mock('../../features/ledger/LedgerData', () => ({ useLedger: () => ledger }))

import { GlobalSearch } from './GlobalSearch'
const Where = () => <p data-testid="where">{useLocation().pathname}</p>
const open = () => render(<MemoryRouter><GlobalSearch /><Where /></MemoryRouter>)

describe('GlobalSearch', () => {
  it('encuentra páginas sin importar acentos y navega con Enter', async () => {
    open()
    await userEvent.type(screen.getByRole('combobox', { name: /buscar en la app/i }), 'categoria')
    expect(await screen.findByRole('option', { name: /categorías/i })).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('where')).toHaveTextContent('/categorias')
  })

  it('encuentra tus datos reales y navega al hacer clic', async () => {
    open()
    await userEvent.type(screen.getByRole('combobox'), 'nyx')
    await userEvent.click(await screen.findByRole('option', { name: /nyxar/i }))
    expect(screen.getByTestId('where')).toHaveTextContent('/negocios/b1')
  })

  it('con las flechas se elige otro resultado', async () => {
    open()
    await userEvent.type(screen.getByRole('combobox'), 'c')
    const first = await screen.findAllByRole('option')
    expect(first.length).toBeGreaterThan(1)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('sin coincidencias lo dice, y Escape cierra la lista', async () => {
    open()
    await userEvent.type(screen.getByRole('combobox'), 'zzzz')
    expect(await screen.findByText(/sin resultados/i)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByText(/sin resultados/i)).not.toBeInTheDocument()
  })
})
