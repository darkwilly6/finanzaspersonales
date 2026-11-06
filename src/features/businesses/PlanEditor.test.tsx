import { describe, expect, it } from "vitest"
import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PlanEditor, parseRows, type PlanRow } from "./PlanEditor"
import type { BusinessType } from "../../domain/types/ledger"

function Harness({ type, initial = [] }: { type: BusinessType; initial?: PlanRow[] }) {
  const [rows, setRows] = useState<PlanRow[]>(initial)
  return <PlanEditor rows={rows} onChange={setRows} businessType={type} />
}

describe("PlanEditor", () => {
  it("la plantilla de un negocio físico incluye inventario y suma 100 %", async () => {
    render(<Harness type="physical" />)
    await userEvent.click(screen.getByRole("button", { name: /usar plantilla de ejemplo: producto físico/i }))
    expect(screen.getByDisplayValue("Inventario (mercancía)")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Publicidad")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Suma: 100 % ✓")
  })

  it("la plantilla de un negocio digital NO incluye inventario", async () => {
    render(<Harness type="digital" />)
    await userEvent.click(screen.getByRole("button", { name: /usar plantilla de ejemplo/i }))
    expect(screen.queryByDisplayValue("Inventario (mercancía)")).not.toBeInTheDocument()
    expect(screen.getByDisplayValue("Herramientas y software")).toBeInTheDocument()
  })

  it("avisa cuando no suma 100 y se corrige al ajustar", async () => {
    render(<Harness type="other" initial={[{ id: "a", name: "Para mí", kind: "owner", pct: "60" }, { id: "b", name: "Reserva", kind: "reserve", pct: "30" }]} />)
    expect(screen.getByRole("status")).toHaveTextContent("Suma: 90 % (debe ser 100)")
    expect(screen.getByText(/deben sumar exactamente 100/i)).toBeInTheDocument()
    const pct = screen.getAllByLabelText("%")[1]!
    await userEvent.clear(pct)
    await userEvent.type(pct, "40")
    expect(screen.getByRole("status")).toHaveTextContent("Suma: 100 % ✓")
  })

  it("permite agregar y quitar partes y quitar el plan completo", async () => {
    render(<Harness type="other" initial={[{ id: "a", name: "Para mí", kind: "owner", pct: "100" }]} />)
    await userEvent.click(screen.getByRole("button", { name: /agregar parte/i }))
    expect(screen.getAllByLabelText("Nombre")).toHaveLength(2)
    await userEvent.click(screen.getByRole("button", { name: /quitar plan/i }))
    expect(screen.getByText(/sin plan/i)).toBeInTheDocument()
  })
})

describe("parseRows", () => {
  it("convierte porcentajes a puntos base y detecta errores", () => {
    expect(parseRows([{ id: "a", name: "Para mí", kind: "owner", pct: "12,5" }, { id: "b", name: "Ads", kind: "use", pct: "87.5" }])).toMatchObject({ problem: null, buckets: [{ bps: 1250 }, { bps: 8750 }] })
    expect(parseRows([{ id: "a", name: "Para mí", kind: "owner", pct: "x" }]).problem).toBe("pct")
    expect(parseRows([{ id: "a", name: "Para mí", kind: "owner", pct: "50" }]).problem).toBe("sum")
  })
})
