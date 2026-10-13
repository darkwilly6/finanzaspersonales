import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  loading?: boolean
  icon?: ReactNode
  size?: 'md' | 'sm'
}

export function Button({ variant = 'primary', size = 'md', loading = false, icon, children, disabled, className = '', ...rest }: Props) {
  return (
    <button
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="spin" size={16} aria-hidden /> : icon}
      <span>{children}</span>
    </button>
  )
}
