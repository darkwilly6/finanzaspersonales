import { Plus, Trash2, Wand2 } from 'lucide-react'
import { defaultPlan, planProblem, PLAN_PROBLEM_TEXT, type PlanProblem } from '../../domain/calculations/plan'
import { parsePercentToBps } from '../../domain/calculations/percent'
import { BUSINESS_TYPE_LABELS, PLAN_KINDS, PLAN_KIND_LABELS, type BusinessType, type PlanBucket, type PlanKind } from '../../domain/types/ledger'

export interface PlanRow { id: string; name: string; kind: PlanKind; pct: string }

const fmtPct = (bps: number) => String(bps / 100)
export const rowsFromPlan = (plan: readonly PlanBucket[] | null): PlanRow[] => (plan ?? []).map((b) => ({ id: b.id, name: b.name, kind: b.kind, pct: fmtPct(b.bps) }))

/** Convierte las filas escritas a partes del plan. Devuelve el problema si algo no está bien. */
export function parseRows(rows: readonly PlanRow[]): { buckets: PlanBucket[]; problem: PlanProblem | 'pct' | null } {
  const buckets: PlanBucket[] = []
  for (const r of rows) {
    const bps = parsePercentToBps(r.pct)
    if (bps === null) return { buckets: [], problem: 'pct' }
    buckets.push({ id: r.id, name: r.name.trim(), kind: r.kind, bps })
  }
  return { buckets, problem: planProblem(buckets) }
}

export const PCT_PROBLEM = 'Escribe cada porcentaje como número, por ejemplo 30 o 12.5.'

let counter = 0
const newRowId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`

export function PlanEditor({ rows, onChange, businessType, error }: { rows: PlanRow[]; onChange: (rows: PlanRow[]) => void; businessType: BusinessType; error?: string }) {
  const parsed = parseRows(rows)
  const total = rows.reduce((s, r) => s + (parsePercentToBps(r.pct) ?? 0), 0)
  const set = (i: number, patch: Partial<PlanRow>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const sumOk = rows.length > 0 && total === 10000
  const problem = rows.length === 0 ? null : parsed.problem === 'pct' ? PCT_PROBLEM : parsed.problem ? PLAN_PROBLEM_TEXT[parsed.problem] : null

  return (
    <fieldset className="fieldset plan-editor">
      <legend>Plan de uso del dinero</legend>
      <p className="field-hint">
        Cuando tu negocio gane más de lo que necesita para su reserva y sus pagos, ¿en qué se va ese excedente? Reparte el 100 % entre tu pago, la reserva y los usos del negocio (publicidad, inventario, herramientas…). Cada negocio es distinto: un producto físico gasta en mercancía; uno digital o de servicios, en publicidad, herramientas y contenido.
      </p>
      <div className="row">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(rowsFromPlan(defaultPlan(businessType)))}>
          <Wand2 size={14} aria-hidden /> <span>Usar plantilla de ejemplo: {BUSINESS_TYPE_LABELS[businessType].toLowerCase()}</span>
        </button>
        {rows.length ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])}>Quitar plan</button> : null}
      </div>
      {rows.length === 0 ? <p className="muted small">Sin plan: no se reparte nada todavía. La plantilla es solo un ejemplo para editar; los porcentajes son tuyos.</p> : null}
      {rows.map((r, i) => (
        <div className="plan-row" key={r.id}>
          <div className="field"><label htmlFor={`pn-${r.id}`}>Nombre</label><input id={`pn-${r.id}`} value={r.name} maxLength={40} onChange={(e) => set(i, { name: e.target.value })} /></div>
          <div className="field"><label htmlFor={`pk-${r.id}`}>Tipo</label>
            <select id={`pk-${r.id}`} value={r.kind} onChange={(e) => set(i, { kind: e.target.value as PlanKind })}>{PLAN_KINDS.map((k) => <option key={k} value={k}>{PLAN_KIND_LABELS[k]}</option>)}</select>
          </div>
          <div className="field"><label htmlFor={`pp-${r.id}`}>%</label><input id={`pp-${r.id}`} inputMode="decimal" value={r.pct} onChange={(e) => set(i, { pct: e.target.value })} /></div>
          <button type="button" className="icon-btn" aria-label={`Quitar ${r.name || 'parte'}`} onClick={() => onChange(rows.filter((_, k) => k !== i))}><Trash2 size={16} aria-hidden /></button>
        </div>
      ))}
      <div className="row between">
        <button type="button" className="btn btn-ghost btn-sm" disabled={rows.length >= 10} onClick={() => onChange([...rows, { id: newRowId(), name: '', kind: 'use', pct: '' }])}><Plus size={14} aria-hidden /> <span>Agregar parte</span></button>
        {rows.length ? <span className={`plan-sum ${sumOk ? 'ok' : 'bad'}`} role="status">Suma: {fmtPct(total)} % {sumOk ? '✓' : '(debe ser 100)'}</span> : null}
      </div>
      {error || problem ? <p className="field-error" role="alert">{error ?? problem}</p> : null}
    </fieldset>
  )
}
