import { useId } from 'react'
import { formatMinor } from '../../domain/calculations/money'
import type { CategorySlice } from '../../domain/calculations/analytics'

const compact = (minor: number) =>
  new Intl.NumberFormat('es', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(minor / 100)

/** Escala "bonita": 4 divisiones con valores redondos que incluyen el 0. */
export function niceScale(min: number, max: number, ticks = 4): { lo: number; hi: number; step: number } {
  const lo0 = Math.min(0, min)
  const hi0 = Math.max(0, max)
  if (hi0 === lo0) return { lo: 0, hi: 100, step: 25 }
  const raw = (hi0 - lo0) / ticks
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag
  return { lo: Math.floor(lo0 / step) * step, hi: Math.ceil(hi0 / step) * step, step }
}

const monthLabel = (m: string) => new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`)).replace('.', '')

export interface BarDatum { month: string; a: number; b: number }

/** Barras agrupadas (ingresos vs gastos por mes). Incluye tabla accesible para lectores de pantalla. */
export function BarsChart({ data, aLabel, bLabel, title }: { data: BarDatum[]; aLabel: string; bLabel: string; title: string }) {
  const W = 640, H = 240, L = 58, R = 8, T = 12, B = 28
  const pw = W - L - R, ph = H - T - B
  const { lo, hi, step } = niceScale(Math.min(0, ...data.flatMap((d) => [d.a, d.b])), Math.max(0, ...data.flatMap((d) => [d.a, d.b])))
  const y = (v: number) => T + ph - ((v - lo) / (hi - lo)) * ph
  const gw = pw / Math.max(1, data.length)
  const bw = Math.min(26, gw * 0.3)
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v)

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis-zero' : 'grid-line'} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="axis-text">{compact(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = L + gw * i + gw / 2
          const bar = (v: number, x: number, cls: string) => <rect x={x} y={Math.min(y(v), y(0))} width={bw} height={Math.max(1, Math.abs(y(v) - y(0)))} rx={3} className={cls} />
          return (
            <g key={d.month}>
              {bar(d.a, cx - bw - 2, 'bar-a')}
              {bar(d.b, cx + 2, 'bar-b')}
              <text x={cx} y={H - 8} textAnchor="middle" className="axis-text">{monthLabel(d.month)}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="legend"><span><i className="dot dot-a" aria-hidden />{aLabel}</span><span><i className="dot dot-b" aria-hidden />{bLabel}</span></figcaption>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th>Mes</th><th>{aLabel}</th><th>{bLabel}</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.month}><td>{d.month}</td><td>{formatMinor(d.a)}</td><td>{formatMinor(d.b)}</td></tr>)}</tbody>
      </table>
    </figure>
  )
}

export interface LineDatum { date: string; value: number }

/** Línea de saldo proyectado. Sombrea en rojo la zona bajo cero y marca el mínimo. */
export function LineChart({ data, title, area = false, finalLabel }: { data: LineDatum[]; title: string; area?: boolean; finalLabel?: string }) {
  const gid = useId().replace(/:/g, '')
  const W = 640, H = 220, L = 58, R = 12, T = 12, B = 26
  const pw = W - L - R, ph = H - T - B
  const vals = data.map((d) => d.value)
  const { lo, hi, step } = niceScale(Math.min(...vals), Math.max(...vals))
  const y = (v: number) => T + ph - ((v - lo) / (hi - lo)) * ph
  const x = (i: number) => L + (data.length <= 1 ? 0 : (i / (data.length - 1)) * pw)
  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ')
  const minIdx = vals.indexOf(Math.min(...vals))
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v)
  const fmtDay = (s: string) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${s}T00:00:00Z`))
  const labelIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1]

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
        {lo < 0 ? <rect x={L} y={y(0)} width={pw} height={Math.max(0, y(lo) - y(0))} className="neg-zone" /> : null}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={v === 0 ? 'axis-zero' : 'grid-line'} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" className="axis-text">{compact(v)}</text>
          </g>
        ))}
        {area && data.length > 1 ? (
          <>
            <defs>
              <linearGradient id={`area-${gid}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${path} L${x(data.length - 1).toFixed(1)},${y(lo).toFixed(1)} L${x(0).toFixed(1)},${y(lo).toFixed(1)} Z`} fill={`url(#area-${gid})`} stroke="none" />
          </>
        ) : null}
        <path d={path} className="line" fill="none" />
        {finalLabel && data.length > 1 ? (
          <g className="chart-tip" transform={`translate(${Math.max(L, x(data.length - 1) - 176)},${Math.max(T, Math.min(y(vals[vals.length - 1]!) - 46, H - B - 40))})`}>
            <rect width="170" height="38" rx="8" />
            <text x="10" y="15" className="tip-title">Proyección final</text>
            <text x="10" y="30" className="tip-value">{finalLabel}</text>
          </g>
        ) : null}
        {finalLabel && data.length > 1 ? <circle cx={x(data.length - 1)} cy={y(vals[vals.length - 1]!)} r={4.5} className="pt-final" /> : null}
        {data.length > 0 ? <circle cx={x(minIdx)} cy={y(vals[minIdx]!)} r={4} className={vals[minIdx]! < 0 ? 'pt-neg' : 'pt'} /> : null}
        {labelIdx.map((i, k) => data[i] ? <text key={k} x={x(i)} y={H - 6} textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'} className="axis-text">{fmtDay(data[i]!.date)}</text> : null)}
      </svg>
      <figcaption className="legend"><span>Mínimo: <b className={vals[minIdx]! < 0 ? 'neg' : ''}>{formatMinor(vals[minIdx] ?? 0)}</b> el {data[minIdx] ? fmtDay(data[minIdx]!.date) : '—'}</span></figcaption>
    </figure>
  )
}

/** Barras horizontales de participación por categoría. */
export function ShareBars({ slices, empty }: { slices: CategorySlice[]; empty: string }) {
  if (slices.length === 0) return <p className="muted small">{empty}</p>
  return (
    <ul className="share-list">
      {slices.slice(0, 8).map((s) => (
        <li key={s.categoryId ?? 'none'}>
          <div className="share-head"><span className="chip"><i style={{ background: s.color }} aria-hidden />{s.name}</span><span><b>{formatMinor(s.totalMinor)}</b> <span className="muted small">{(s.share * 100).toFixed(0)} %</span></span></div>
          <div className="share-track" role="presentation"><div className="share-fill" style={{ width: `${Math.max(2, s.share * 100)}%`, background: s.color }} /></div>
        </li>
      ))}
    </ul>
  )
}


/** Mini gráfica de tendencia (sin ejes) para las tarjetas del panel. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const gid = useId().replace(/:/g, '')
  if (values.length < 2) return null
  const W = 160, H = 56, P = 4
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const x = (i: number) => P + (i / (values.length - 1)) * (W - 2 * P)
  const y = (v: number) => (max === min ? H / 2 : H - P - ((v - min) / span) * (H - 2 * P))
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sp-${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${x(values.length - 1)},${H} L${x(0)},${H} Z`} fill={`url(#sp-${gid})`} />
      <path d={line} className="spark-line" fill="none" />
    </svg>
  )
}
