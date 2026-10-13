import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Building2, ChevronDown, Plus, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { useRegister } from './RegisterContext'
import type { TransactionType } from '../../domain/types/ledger'

/** Botón global "+ Registrar": cada opción abre un formulario real. */
export function RegisterMenu({ collapsed = false, floating = false }: { collapsed?: boolean; floating?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const { openTransaction } = useRegister()

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const tx = (type: TransactionType) => () => { setOpen(false); openTransaction({ type }) }
  const go = (path: string) => () => { setOpen(false); nav(path, { state: { openNew: Date.now() } }) }

  return (
    <div className={`register ${floating ? 'register-floating' : ''}`} ref={ref}>
      <button type="button" className={`btn btn-primary ${floating ? 'fab' : 'btn-block'}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus size={16} aria-hidden />{floating ? <span className="sr-only">Registrar</span> : <><span>Registrar</span>{collapsed ? null : <ChevronDown size={14} aria-hidden />}</>}
      </button>
      {open ? (
        <ul className="menu" role="menu">
          <li role="none"><button role="menuitem" type="button" onClick={tx('income')}><TrendingUp size={16} aria-hidden /> Ingreso</button></li>
          <li role="none"><button role="menuitem" type="button" onClick={tx('expense')}><TrendingDown size={16} aria-hidden /> Gasto</button></li>
          <li role="none"><button role="menuitem" type="button" onClick={tx('transfer')}><ArrowLeftRight size={16} aria-hidden /> Transferencia</button></li>
          <li role="none"><button role="menuitem" type="button" onClick={tx('investment')}><Receipt size={16} aria-hidden /> Inversión u otro tipo…</button></li>
          <li className="menu-sep" role="separator" />
          <li role="none"><button role="menuitem" type="button" onClick={go('/cuentas')}><Wallet size={16} aria-hidden /> Cuenta nueva</button></li>
          <li role="none"><button role="menuitem" type="button" onClick={go('/negocios')}><Building2 size={16} aria-hidden /> Negocio nuevo</button></li>
        </ul>
      ) : null}
    </div>
  )
}
