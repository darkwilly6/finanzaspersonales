import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useLedger } from '../../features/ledger/LedgerData'
import { NAV_ITEMS, isAvailable } from '../../app/navigation'
import { searchApp, type SearchData } from '../../domain/search'

/** Búsqueda global: páginas y tus datos reales (negocios, cuentas, productos, movimientos…). */
export function GlobalSearch() {
  const nav = useNavigate()
  const ledger = useLedger()
  const listId = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [mobile, setMobile] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const data = useMemo<SearchData>(() => ({
    pages: NAV_ITEMS.filter(isAvailable).map((i) => ({ id: i.id, label: i.label, path: i.path })),
    businesses: ledger.businesses.map((b) => ({ id: b.id, name: b.name })),
    accounts: ledger.accounts.map((a) => ({ id: a.id, name: a.name })),
    products: ledger.products.map((p) => ({ id: p.id, name: p.name, sku: p.sku })),
    categories: ledger.categories.map((c) => ({ id: c.id, name: c.name })),
    transactions: ledger.transactions.map((t) => ({ id: t.id, description: t.description, counterparty: t.counterparty, date: t.date })),
    sales: ledger.sales.map((s) => ({ id: s.id, customer: s.customer, date: s.date })),
    tasks: ledger.tasks.map((t) => ({ id: t.id, title: t.title })),
    goals: ledger.goals.map((g) => ({ id: g.id, name: g.name })),
  }), [ledger.businesses, ledger.accounts, ledger.products, ledger.categories, ledger.transactions, ledger.sales, ledger.tasks, ledger.goals])

  const results = useMemo(() => searchApp(q, data), [q, data])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const go = (to: string) => { setOpen(false); setMobile(false); setQ(''); nav(to) }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(results.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]!.to) }
    else if (e.key === 'Escape') { setOpen(false); setMobile(false) }
  }

  return (
    <div className={`search ${mobile ? 'is-open' : ''}`} ref={box}>
      <button type="button" className="icon-btn search-toggle" aria-label="Buscar" onClick={() => setMobile((m) => !m)}><Search size={20} aria-hidden /></button>
      <div className="search-field">
        <Search size={16} aria-hidden className="search-icon" />
        <input
          type="search"
          role="combobox"
          aria-label="Buscar en la app"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
          placeholder="Buscar en la app…"
          value={q}
          autoComplete="off"
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {q ? <button type="button" className="icon-btn search-clear" aria-label="Borrar búsqueda" onClick={() => { setQ(''); setOpen(false) }}><X size={14} aria-hidden /></button> : null}
      </div>
      {open && q.trim() ? (
        <ul className="search-results" role="listbox" id={listId} aria-label="Resultados">
          {results.length === 0 ? <li className="search-empty" role="presentation">Sin resultados para “{q}”.</li> : results.map((r, i) => (
            <li key={r.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); go(r.to) }}>
              <span className="search-label">{r.label}</span>
              <span className="search-hint">{r.hint}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
