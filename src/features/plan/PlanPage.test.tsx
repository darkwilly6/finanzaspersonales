import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { aggregatePlan, defaultPlan } from "../../domain/calculations/plan"

const openTransaction = vi.fn()
const plan = defaultPlan("physical")
const business = (over: object = {}) => ({
  id: "b1", name: "NYXAR", type: "physical", status: "active", reserve: { minReserveMinor: 10000 }, payout: { method: "owner_draw", frequency: "monthly", customDays: null },
  plan, allocation: aggregatePlan(plan), ...over,
})
const tx = (id: string, type: string, amountMinor: number, date: string) => ({ id, type, amountMinor, date, accountId: "a1", status: "confirmed", direction: null, transferPurpose: null, transferId: null, counterpartAccountId: null, recurringId: null, saleId: null, categoryId: null })
const ledger = {
  businesses: [business()] as unknown[],
  accounts: [{ id: "a1", name: "Banco", scope: "business", businessId: "b1", accountType: "bank", status: "active", openingBalanceMinor: 0, openingBalanceDate: "2026-01-01" }],
  transactions: [tx("i", "income", 100000, "2026-10-05"), tx("e", "expense", 20000, "2026-10-06")] as unknown[],
  sales: [], cancelledSaleIds: new Set<string>(), recurring: [], budgets: [],
  balances: new Map([["a1", { accountId: "a1", balanceMinor: 200000, ignoredBeforeOpening: 0 }]]),
  today: "2026-10-14",
}
vi.mock("../ledger/LedgerData", () => ({ useLedger: () => ledger }))
vi.mock("../ledger/RegisterContext", () => ({ useRegister: () => ({ openTransaction }) }))
vi.mock("../ledger/LedgerGate", () => ({ LedgerGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("../ledger/useInsights", () => ({ useAlerts: () => [] }))

import { PlanPage } from "./PlanPage"
const open = () => render(<MemoryRouter><PlanPage /></MemoryRouter>)
const rowOf = (name: string) => screen.getByText(name).closest("li")!

beforeEach(() => { openTransaction.mockReset(); ledger.businesses = [business()] })

describe("PlanPage", () => {
  it("reparte lo que se puede repartir según el plan, sin perder centavos", () => {
    open()
    // base 800 (1000 − 200); excedente 2000 − 100 de reserva = 1900; se reparte 800
    expect(screen.getByText(/se puede repartir ahora/i).closest("div")).toHaveTextContent("$800.00")
    expect(rowOf("Para mí")).toHaveTextContent("$240.00")
    expect(rowOf("Reserva")).toHaveTextContent("$120.00")
    expect(rowOf("Inventario (mercancía)")).toHaveTextContent("$240.00")
    expect(rowOf("Publicidad")).toHaveTextContent("$160.00")
    expect(rowOf("Operación y herramientas")).toHaveTextContent("$40.00")
  })

  it("cada parte lleva a la acción correcta, ya rellenada, sin crear nada sola", async () => {
    open()
    await userEvent.click(within(rowOf("Para mí")).getByRole("button", { name: /registrar mi pago/i }))
    expect(openTransaction.mock.calls[0]![0].prefill).toMatchObject({ type: "transfer", transferPurpose: "owner_withdrawal", accountId: "a1", amount: "240.00" })
    await userEvent.click(within(rowOf("Publicidad")).getByRole("button", { name: /registrar gasto/i }))
    expect(openTransaction.mock.calls[1]![0].prefill).toMatchObject({ type: "expense", amount: "160.00", description: "Publicidad" })
    expect(within(rowOf("Inventario (mercancía)")).getByRole("link", { name: /comprar mercancía/i })).toHaveAttribute("href", "/stock")
    expect(within(rowOf("Reserva")).getByText("Se queda en el negocio")).toBeInTheDocument()
  })

  it("un negocio digital sin inventario reparte en sus propios usos", () => {
    const digital = defaultPlan("digital")
    ledger.businesses = [business({ type: "digital", plan: digital, allocation: aggregatePlan(digital) })]
    open()
    expect(screen.queryByText("Inventario (mercancía)")).not.toBeInTheDocument()
    expect(rowOf("Publicidad")).toHaveTextContent("$240.00")
    expect(rowOf("Herramientas y software")).toHaveTextContent("$80.00")
  })

  it("sin plan no inventa un reparto y pide definirlo", () => {
    ledger.businesses = [business({ plan: null, allocation: null })]
    open()
    expect(screen.getByRole("link", { name: /definir plan/i })).toHaveAttribute("href", "/negocios/b1")
    expect(screen.queryByRole("button", { name: /registrar mi pago/i })).not.toBeInTheDocument()
  })

  it("si el efectivo no cubre la reserva, no reparte nada y lo explica", () => {
    ledger.balances = new Map([["a1", { accountId: "a1", balanceMinor: 5000, ignoredBeforeOpening: 0 }]])
    open()
    expect(screen.getByText(/primero se protege el negocio/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /registrar mi pago/i })).not.toBeInTheDocument()
    ledger.balances = new Map([["a1", { accountId: "a1", balanceMinor: 200000, ignoredBeforeOpening: 0 }]])
  })
})
