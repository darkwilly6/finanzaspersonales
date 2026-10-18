import type { ReactNode } from 'react'

export type KpiTone = 'green' | 'red' | 'orange' | 'teal' | 'purple' | 'blue'

/** Tarjeta de indicador del panel: icono en círculo de color, cifra grande y variación contra el periodo anterior. */
export function KpiCard({ tone, icon, label, value, negative = false, delta }: { tone: KpiTone; icon: ReactNode; label: string; value: string; negative?: boolean; delta?: ReactNode }) {
  return (
    <article className={`kpi-card tone-${tone}`}>
      <span className="kpi-card-icon" aria-hidden>{icon}</span>
      <div className="kpi-card-body">
        <span className="kpi-card-label">{label}</span>
        <strong className={`kpi-card-value ${negative ? 'neg' : ''}`}>{value}</strong>
        {delta ? <span className="kpi-card-delta">{delta}</span> : null}
      </div>
    </article>
  )
}
