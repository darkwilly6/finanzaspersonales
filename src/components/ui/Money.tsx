import { formatMinor } from '../../domain/calculations/money'

/** Importe en USD. Los negativos se muestran en rojo con signo; nunca solo por color. */
export function Money({ minor, tone = false, className = '' }: { minor: number; tone?: boolean; className?: string }) {
  const cls = tone ? (minor < 0 ? 'neg' : minor > 0 ? 'pos' : '') : minor < 0 ? 'neg' : ''
  return <span className={`money ${cls} ${className}`.trim()}>{formatMinor(minor, 'USD')}</span>
}
