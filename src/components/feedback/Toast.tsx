import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

type Kind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: Kind
  message: string
}

const ToastContext = createContext<{ notify: (kind: Kind, message: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const notify = useCallback(
    (kind: Kind, message: string) => {
      const id = nextId.current++
      setItems((l) => [...l.slice(-3), { id, kind, message }])
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500)
    },
    [dismiss],
  )
  const value = useMemo(() => ({ notify }), [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="region" aria-label="Notificaciones" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            {t.kind === 'success' ? <CheckCircle2 size={18} aria-hidden /> : t.kind === 'error' ? <AlertTriangle size={18} aria-hidden /> : <Info size={18} aria-hidden />}
            <span>{t.message}</span>
            <button type="button" className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Cerrar notificación">
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider')
  return ctx
}
