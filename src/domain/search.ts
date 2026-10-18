export interface SearchItem { id: string; label: string; hint: string; to: string; group: string }

export interface SearchData {
  pages: { id: string; label: string; path: string }[]
  businesses: { id: string; name: string }[]
  accounts: { id: string; name: string }[]
  products: { id: string; name: string; sku: string }[]
  categories: { id: string; name: string }[]
  transactions: { id: string; description: string; counterparty: string; date: string }[]
  sales: { id: string; customer: string; date: string }[]
  tasks: { id: string; title: string }[]
  goals: { id: string; name: string }[]
}

/** Minúsculas y sin acentos, para que "categoria" encuentre "Categorías". */
export const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function score(text: string, q: string): number | null {
  const t = normalize(text)
  if (!t) return null
  if (t.startsWith(q)) return 0
  if (t.split(/[\s·\-_/]+/).some((w) => w.startsWith(q))) return 1
  return t.includes(q) ? 2 : null
}

const GROUP_ORDER = ['Páginas', 'Negocios', 'Cuentas', 'Productos', 'Categorías', 'Metas', 'Tareas', 'Ventas', 'Movimientos']

/** Búsqueda global de la app: páginas y datos reales. Máximo `limit` resultados, mejores primero. */
export function searchApp(query: string, d: SearchData, limit = 8): SearchItem[] {
  const q = normalize(query)
  if (q.length < 1) return []
  const found: (SearchItem & { s: number })[] = []
  const add = (group: string, id: string, label: string, hint: string, to: string, extra: string[] = []) => {
    const scores = [score(label, q), ...extra.map((e) => score(e, q))].filter((x): x is number => x !== null)
    if (scores.length) found.push({ id: `${group}-${id}`, label, hint, to, group, s: Math.min(...scores) })
  }
  d.pages.forEach((p) => add('Páginas', p.id, p.label, 'Ir a la página', p.path))
  d.businesses.forEach((b) => add('Negocios', b.id, b.name, 'Negocio', `/negocios/${b.id}`))
  d.accounts.forEach((a) => add('Cuentas', a.id, a.name, 'Cuenta', '/cuentas'))
  d.products.forEach((p) => add('Productos', p.id, p.name, p.sku ? `Producto · ${p.sku}` : 'Producto', '/inventario', [p.sku]))
  d.categories.forEach((c) => add('Categorías', c.id, c.name, 'Categoría', '/categorias'))
  d.goals.forEach((g) => add('Metas', g.id, g.name, 'Meta', '/escalado'))
  d.tasks.forEach((t) => add('Tareas', t.id, t.title, 'Tarea', '/alertas'))
  d.sales.forEach((s) => s.customer && add('Ventas', s.id, s.customer, `Venta · ${s.date}`, '/ventas'))
  d.transactions.forEach((t) => (t.description || t.counterparty) && add('Movimientos', t.id, t.description || t.counterparty, `Movimiento · ${t.date}`, '/movimientos', [t.counterparty]))
  return found
    .sort((a, b) => a.s - b.s || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.label.localeCompare(b.label, 'es'))
    .slice(0, limit)
    .map(({ s: _s, ...rest }) => rest)
}
