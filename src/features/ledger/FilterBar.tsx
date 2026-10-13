import { SlidersHorizontal, X } from 'lucide-react'
import { useFilters } from './FilterContext'
import { useLedger } from './LedgerData'
import { PERIOD_LABELS, PERIOD_PRESETS, activeFilterCount, type PeriodPreset } from '../../domain/calculations/filters'
import { TRANSACTION_TYPES, STATUS_LABELS, type TransactionStatus, type TransactionType } from '../../domain/types/ledger'
import { TYPE_RULES } from '../../domain/calculations/transactionRules'

/** Filtros globales: ámbito (personal / uno o varios negocios / todo), periodo y, opcionalmente, cuenta, categoría, tipo y estado. */
export function FilterBar({ compact = false, scopeOnly = false, hideScope = false }: { compact?: boolean; scopeOnly?: boolean; hideScope?: boolean }) {
  const { filter, setFilter, reset } = useFilters()
  const { businesses, accounts, categories } = useLedger()
  const count = activeFilterCount(filter)

  const toggleScope = (id: string) => {
    const has = filter.scopes.includes(id)
    setFilter({ scopes: has ? filter.scopes.filter((s) => s !== id) : [...filter.scopes, id], accountId: '' })
  }
  const scopeLabel = filter.scopes.length === 0 ? 'Todo (consolidado)' : filter.scopes.length === 1 ? (filter.scopes[0] === 'personal' ? 'Personal' : (businesses.find((b) => b.id === filter.scopes[0])?.name ?? '1 ámbito')) : `${filter.scopes.length} ámbitos`

  return (
    <div className="filterbar" role="search" aria-label="Filtros">
      {hideScope ? null : <details className="dropdown">
        <summary className="btn btn-secondary btn-sm">Ámbito: {scopeLabel}</summary>
        <div className="dropdown-panel">
          <label className="check"><input type="checkbox" checked={filter.scopes.length === 0} onChange={() => setFilter({ scopes: [], accountId: '' })} /> Todo (consolidado)</label>
          <label className="check"><input type="checkbox" checked={filter.scopes.includes('personal')} onChange={() => toggleScope('personal')} /> Personal</label>
          {businesses.map((b) => (
            <label className="check" key={b.id}><input type="checkbox" checked={filter.scopes.includes(b.id)} onChange={() => toggleScope(b.id)} /> {b.name}{b.status === 'archived' ? ' (archivado)' : ''}</label>
          ))}
          {businesses.length === 0 ? <p className="tiny muted">Aún no tienes negocios.</p> : null}
        </div>
      </details>}

      {scopeOnly ? null : (
        <>
          <label className="inline-field">
            <span className="sr-only">Periodo</span>
            <select value={filter.period} onChange={(e) => setFilter({ period: e.target.value as PeriodPreset })} aria-label="Periodo">
              {PERIOD_PRESETS.map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
            </select>
          </label>
          {filter.period === 'custom' ? (
            <>
              <label className="inline-field"><span className="sr-only">Desde</span><input type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => setFilter({ from: e.target.value })} aria-label="Desde" /></label>
              <label className="inline-field"><span className="sr-only">Hasta</span><input type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => setFilter({ to: e.target.value })} aria-label="Hasta" /></label>
            </>
          ) : null}
          {compact ? null : (
            <details className="dropdown">
              <summary className="btn btn-secondary btn-sm"><SlidersHorizontal size={14} aria-hidden /> Más filtros</summary>
              <div className="dropdown-panel wide">
                <label className="field"><span>Cuenta</span>
                  <select value={filter.accountId} onChange={(e) => setFilter({ accountId: e.target.value })}>
                    <option value="">Todas</option>
                    {accounts.filter((a) => filter.scopes.length === 0 || (a.scope === 'personal' ? filter.scopes.includes('personal') : a.businessId !== null && filter.scopes.includes(a.businessId))).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label className="field"><span>Categoría</span>
                  <select value={filter.categoryId} onChange={(e) => setFilter({ categoryId: e.target.value })}>
                    <option value="">Todas</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="field"><span>Tipo</span>
                  <select value={filter.type} onChange={(e) => setFilter({ type: e.target.value as '' | TransactionType })}>
                    <option value="">Todos</option>
                    {TRANSACTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_RULES[t].label}</option>)}
                  </select>
                </label>
                <label className="field"><span>Estado</span>
                  <select value={filter.status} onChange={(e) => setFilter({ status: e.target.value as '' | TransactionStatus })}>
                    <option value="">Todos menos anulados</option>
                    {(Object.keys(STATUS_LABELS) as TransactionStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                  </select>
                </label>
              </div>
            </details>
          )}
        </>
      )}
      {count > 0 ? <button type="button" className="btn btn-ghost btn-sm" onClick={reset}><X size={14} aria-hidden /> Limpiar ({count})</button> : null}
    </div>
  )
}
