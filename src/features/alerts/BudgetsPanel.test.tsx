import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const createBudget = vi.fn()
const tx = (id: string, amountMinor: number, date: string) => ({ id, type: "expense", amountMinor, date, accountId: "a1", status: "confirmed", categoryId: null })
const ledger = {
  budgets: [] as unknown[],
  businesses: [{ id: "b1", name: "NYXAR", status: "active" }],
  categories: [{ id: "c1", name: "Publicidad", kind: "expense", active: true }],
  accounts: [{ id: "a1", name: "Banco", scope: "business", businessId: "b1", accountType: "bank", status: "active" }],
  transactions: [tx("t1", 30000, "2026-10-05")] as unknown[],
  today: "2026-10-14",
}
vi.mock("../auth/AuthContext", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }))
vi.mock("../ledger/LedgerData", () => ({ useLedger: () => ledger }))
vi.mock("../../components/feedback/Toast", () => ({ useToast: () => ({ notify: vi.fn() }) }))
vi.mock("../../lib/ledgerRepo", () => ({ newId: () => "G1", createBudget: (...a: unknown[]) => createBudget(...a), updateBudget: vi.fn() }))

import { BudgetsPanel } from "./BudgetsPanel"
const budget = { id: "g1", name: "Gastos del mes", period: "month", scope: "all", categoryId: null, limitMinor: 100000, active: true }

beforeEach(() => { createBudget.mockReset(); createBudget.mockResolvedValue("created"); ledger.budgets = [budget]; ledger.transactions = [tx("t1", 30000, "2026-10-05")] })

describe("BudgetsPanel", () => {
  it("muestra lo gastado, el límite y el margen que queda", () => {
    render(<BudgetsPanel />)
    const row = screen.getByText("Gastos del mes").closest("li")!
    expect(row).toHaveTextContent("$300.00")
    expect(row).toHaveTextContent("$1,000.00")
    expect(row).toHaveTextContent("Te quedan $700.00 de margen")
    expect(within(row).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "30")
  })

  it("si te pasas, lo dice con claridad y cuánto", () => {
    ledger.transactions = [tx("t1", 130000, "2026-10-05")]
    render(<BudgetsPanel />)
    expect(screen.getByText(/te pasaste por/i).closest("li")).toHaveTextContent("$300.00")
  })

  it("sin límites explica para qué sirven", () => {
    ledger.budgets = []
    render(<BudgetsPanel />)
    expect(screen.getByText(/aún no tienes límites/i)).toBeInTheDocument()
  })

  it("crea un límite con el importe en centavos y no guarda si falta algo", async () => {
    ledger.budgets = []
    render(<BudgetsPanel />)
    await userEvent.click(screen.getByRole("button", { name: /nuevo límite/i }))
    await userEvent.click(screen.getByRole("button", { name: /crear límite/i }))
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0)
    expect(createBudget).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText("Nombre"), "Personales del día")
    await userEvent.selectOptions(screen.getByLabelText("Periodo"), "day")
    await userEvent.selectOptions(screen.getByLabelText("Qué gastos cuenta"), "personal")
    await userEvent.type(screen.getByLabelText("Límite (USD)"), "30")
    await userEvent.click(screen.getByRole("button", { name: /crear límite/i }))
    await waitFor(() => expect(createBudget).toHaveBeenCalledTimes(1))
    expect(createBudget.mock.calls[0]![1]).toBe("G1")
    expect(createBudget.mock.calls[0]![2]).toEqual({ name: "Personales del día", period: "day", scope: "personal", categoryId: null, limitMinor: 3000, active: true })
  })
})
