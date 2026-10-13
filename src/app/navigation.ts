import { Home, Building2, ArrowLeftRight, Wallet, CalendarDays, LineChart, TrendingUp, Rocket, ClipboardCheck, Bell, FileSpreadsheet, Settings, ShoppingBag, Package, Tags, Repeat, Boxes, type LucideIcon } from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  path: string
  icon: LucideIcon
  /** Fase del plan en que se habilita. 1 = disponible ahora. */
  phase: number
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'inicio', label: 'Inicio', path: '/', icon: Home, phase: 1 },
  { id: 'negocios', label: 'Negocios y marcas', path: '/negocios', icon: Building2, phase: 2 },
  { id: 'movimientos', label: 'Movimientos', path: '/movimientos', icon: ArrowLeftRight, phase: 2 },
  { id: 'cuentas', label: 'Cuentas y saldos', path: '/cuentas', icon: Wallet, phase: 2 },
  { id: 'categorias', label: 'Categorías', path: '/categorias', icon: Tags, phase: 2 },
  { id: 'calendario', label: 'Calendario financiero', path: '/calendario', icon: CalendarDays, phase: 3 },
  { id: 'pagos-fijos', label: 'Pagos fijos', path: '/pagos-fijos', icon: Repeat, phase: 3 },
  { id: 'analitica', label: 'Analítica', path: '/analitica', icon: LineChart, phase: 3 },
  { id: 'ventas', label: 'Ventas', path: '/ventas', icon: ShoppingBag, phase: 4 },
  { id: 'inventario', label: 'Productos', path: '/inventario', icon: Package, phase: 4 },
  { id: 'stock', label: 'Stock e inventario', path: '/stock', icon: Boxes, phase: 4 },
  { id: 'inversiones', label: 'Inversiones y trading', path: '/inversiones', icon: TrendingUp, phase: 4 },
  { id: 'cierre', label: 'Cierre financiero', path: '/cierre', icon: ClipboardCheck, phase: 5 },
  { id: 'escalado', label: 'Escalado y escenarios', path: '/escalado', icon: Rocket, phase: 6 },
  { id: 'alertas', label: 'Alertas y tareas', path: '/alertas', icon: Bell, phase: 3 },
  { id: 'importar', label: 'Exportar y respaldo', path: '/exportar', icon: FileSpreadsheet, phase: 7 },
  { id: 'configuracion', label: 'Configuración', path: '/configuracion', icon: Settings, phase: 1 },
]

/** Fase más avanzada ya construida. Súbela al terminar cada fase. */
export const CURRENT_PHASE = 7

export const PHASES = [
  { n: 1, title: 'Base segura', detail: 'Acceso con correo, reglas de Firestore, perfil, temas y publicación.' },
  { n: 2, title: 'Núcleo financiero', detail: 'Negocios, cuentas, categorías, movimientos y transferencias.' },
  { n: 3, title: 'Panel, calendario y alertas', detail: 'Indicadores, gráficos, calendario, pagos fijos, alertas y tareas.' },
  { n: 4, title: 'Ventas, productos, stock y trading', detail: 'Ventas con impuestos, catálogo, stock con costo promedio, trading y reparto.' },
  { n: 5, title: 'Cierre financiero', detail: 'Cierre mensual por negocio: reserva, reinversión y lo que te corresponde.' },
  { n: 6, title: 'Escalado', detail: 'Comparador de negocios, metas y simulador de escenarios.' },
  { n: 7, title: 'Exportación y respaldo', detail: 'Respaldo JSON y CSV de movimientos y ventas.' },
]

export const isAvailable = (item: NavItem) => item.phase <= CURRENT_PHASE
