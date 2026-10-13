import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/** Diálogo nativo <dialog>: foco atrapado, Escape y lectores de pantalla sin código extra. */
export function Modal({ open, onClose, title, children, size = 'md' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal()
      else d.setAttribute('open', '')
    }
    if (!open && d.open) {
      if (typeof d.close === 'function') d.close()
      else d.removeAttribute('open')
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size}`}
      aria-labelledby="modal-title"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
    >
      {open ? (
        <div className="modal-card">
          <header className="modal-head">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} aria-hidden /></button>
          </header>
          <div className="modal-body">{children}</div>
        </div>
      ) : null}
    </dialog>
  )
}
