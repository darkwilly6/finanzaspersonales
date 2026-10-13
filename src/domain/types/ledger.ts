/** Tipos del libro contable interno (Fase 2). Importes siempre en unidades menores (centavos). */

export const BUSINESS_TYPES = ['physical', 'digital', 'service', 'training', 'mentoring', 'trading', 'other'] as const
export type BusinessType = (typeof BUSINESS_TYPES)[number]
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  physical: 'Producto físico',
  digital: 'Producto digital',
  service: 'Servicio',
  training: 'Formación',
  mentoring: 'Mentoría',
  trading: 'Trading o inversiones',
  other: 'Otro',
}

export const PAYOUT_METHODS = ['owner_draw', 'salary', 'compensation', 'distribution'] as const
export type PayoutMethod = (typeof PAYOUT_METHODS)[number]
export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  owner_draw: 'Retiro del propietario',
  salary: 'Sueldo',
  compensation: 'Remuneración',
  distribution: 'Distribución',
}

export const PAYOUT_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'custom'] as const
export type PayoutFrequency = (typeof PAYOUT_FREQUENCIES)[number]
export const PAYOUT_FREQUENCY_LABELS: Record<PayoutFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Cada 15 días',
  monthly: 'Mensual',
  custom: 'Personalizada',
}

export interface BusinessDoc {
  name: string
  description: string
  type: BusinessType
  currency: 'USD'
  startDate: string // YYYY-MM-DD
  status: 'active' | 'archived'
  payout: { method: PayoutMethod; frequency: PayoutFrequency; customDays: number | null }
  reserve: { minReserveMinor: number }
  tax: { enabled: boolean; label: string; rateBps: number; pricesIncludeTax: boolean }
  inventoryMethod: 'weighted_average'
  /** Reparto de lo que genera el negocio (en puntos base, suma 10 000). null = sin configurar. */
  allocation?: { reserveBps: number; reinvestBps: number; ownerBps: number } | null
  notes: string
}
export type Business = BusinessDoc & { id: string }

export const ACCOUNT_TYPES = ['cash', 'bank', 'wallet', 'processor', 'investment', 'other'] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Efectivo',
  bank: 'Cuenta bancaria',
  wallet: 'Billetera digital',
  processor: 'Procesador de pagos',
  investment: 'Cuenta de inversión o trading',
  other: 'Otra',
}

export type Scope = 'personal' | 'business'

export interface AccountDoc {
  name: string
  scope: Scope
  businessId: string | null
  accountType: AccountType
  currency: 'USD'
  openingBalanceMinor: number
  openingBalanceDate: string
  status: 'active' | 'archived'
}
export type Account = AccountDoc & { id: string }

export type CategoryKind = 'income' | 'expense'
export type CategoryScope = 'shared' | 'personal' | 'business'
export interface CategoryDoc {
  name: string
  kind: CategoryKind
  scope: CategoryScope
  businessId: string | null
  color: string
  active: boolean
}
export type Category = CategoryDoc & { id: string }

export const TRANSACTION_TYPES = [
  'income',
  'expense',
  'transfer',
  'capital_contribution',
  'owner_withdrawal',
  'salary_payment',
  'investment',
  'trading_withdrawal',
  'tax_collected',
  'inventory_purchase',
  'refund',
  'loan_received',
  'loan_payment',
  'tax_payment',
  'adjustment',
] as const
export type TransactionType = (typeof TRANSACTION_TYPES)[number]

export const TRANSACTION_STATUSES = ['planned', 'pending', 'confirmed', 'cancelled', 'reconciled'] as const
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]
export const STATUS_LABELS: Record<TransactionStatus, string> = {
  planned: 'Planificado',
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Anulado',
  reconciled: 'Conciliado',
}

export const TRANSFER_PURPOSES = ['internal', 'owner_withdrawal', 'salary', 'capital_contribution', 'investment_deposit'] as const
export type TransferPurpose = (typeof TRANSFER_PURPOSES)[number]
export const TRANSFER_PURPOSE_LABELS: Record<TransferPurpose, string> = {
  internal: 'Mover dinero entre mis cuentas',
  owner_withdrawal: 'Retiro del propietario (negocio a personal)',
  salary: 'Sueldo o remuneración (negocio a personal)',
  capital_contribution: 'Aporte de capital (personal a negocio)',
  investment_deposit: 'Depósito a cuenta de inversión',
}

export type Direction = 'in' | 'out'

export interface TransactionDoc {
  type: TransactionType
  scope: Scope
  businessId: string | null
  accountId: string
  counterpartAccountId: string | null
  transferId: string | null
  transferPurpose: TransferPurpose | null
  direction: Direction | null
  date: string
  amountMinor: number
  currency: 'USD'
  categoryId: string | null
  status: TransactionStatus
  description: string
  counterparty: string
  voidedAt: Date | null
  voidReason: string | null
  /** Pago fijo del que nació este movimiento planificado (opcional). */
  recurringId?: string | null
  /** Venta de la que nació este movimiento (opcional). */
  saleId?: string | null
}
export type Transaction = TransactionDoc & { id: string; createdAt: Date | null; updatedAt: Date | null }

/* ───────────── Pagos fijos (recurrentes) ───────────── */

export const RECURRING_TYPES = ['expense', 'income', 'tax_payment', 'loan_payment'] as const
export type RecurringType = (typeof RECURRING_TYPES)[number]

export const RECURRING_FREQUENCIES = ['weekly', 'every15', 'monthly', 'yearly'] as const
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number]
export const RECURRING_FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Cada semana',
  every15: 'Cada 15 días',
  monthly: 'Cada mes',
  yearly: 'Cada año',
}

export interface RecurringDoc {
  name: string
  type: RecurringType
  accountId: string
  scope: Scope
  businessId: string | null
  amountMinor: number
  frequency: RecurringFrequency
  startDate: string
  endDate: string | null
  categoryId: string | null
  description: string
  active: boolean
}
export type Recurring = RecurringDoc & { id: string }

/* ───────────── Tareas financieras ───────────── */

export interface TaskDoc {
  title: string
  dueDate: string | null
  businessId: string | null
  notes: string
  done: boolean
}
export type Task = TaskDoc & { id: string }

/* ───────────── Productos y ventas ───────────── */

export interface ProductDoc {
  name: string
  sku: string
  businessId: string
  unitPriceMinor: number
  /** Costo unitario conocido (null = aún no lo sabes: la ganancia queda sin calcular, no en cero). */
  unitCostMinor: number | null
  active: boolean
  /** Controla unidades en stock con costo promedio ponderado (opcional; antes no existía). */
  trackStock?: boolean
  /** Avisar cuando las unidades bajen a este número o menos. */
  reorderPoint?: number | null
}
export type Product = ProductDoc & { id: string }

export interface SaleLine {
  productId: string | null
  name: string
  quantity: number
  unitPriceMinor: number
  /** Foto del costo al vender: si luego cambia el costo del producto, el historial no se altera. */
  unitCostMinor: number | null
  /** Costo total exacto de la línea cuando el producto controla stock (evita diferencias de centavos). */
  costMinor?: number | null
}

export interface SaleDoc {
  businessId: string
  accountId: string
  date: string
  customer: string
  lines: SaleLine[]
  discountMinor: number
  taxEnabled: boolean
  taxLabel: string
  taxRateBps: number
  pricesIncludeTax: boolean
  /** Ingreso propio del negocio (sin impuesto). */
  netMinor: number
  /** Impuesto cobrado: no es ingreso, es dinero a reservar. */
  taxMinor: number
  /** Lo que paga el cliente. */
  totalMinor: number
  /** Costo de lo vendido; null si algún producto no tiene costo conocido. */
  costMinor: number | null
  units: number
  categoryId: string | null
  notes: string
}
export type Sale = SaleDoc & { id: string; createdAt: Date | null }

/* ───────────── Stock ───────────── */

export const INVENTORY_KINDS = ['opening', 'purchase', 'sale', 'return', 'adjustment'] as const
export type InventoryKind = (typeof INVENTORY_KINDS)[number]
export const INVENTORY_KIND_LABELS: Record<InventoryKind, string> = {
  opening: 'Stock inicial',
  purchase: 'Compra',
  sale: 'Venta',
  return: 'Devolución de cliente',
  adjustment: 'Ajuste',
}

/** Movimiento de unidades. Inmutable; el stock y el costo promedio se calculan sumando los movimientos. */
export interface InventoryMoveDoc {
  productId: string
  businessId: string
  date: string
  kind: InventoryKind
  /** Con signo: positivo entra, negativo sale. */
  quantity: number
  /** Valor del movimiento (siempre positivo). En ventas es el costo exacto de lo vendido. */
  totalCostMinor: number
  saleId: string | null
  /** Movimiento de dinero ligado (compra o devolución). Si ese movimiento se anula, este deja de contar. */
  txId: string | null
  supplier: string
  note: string
}
export type InventoryMove = InventoryMoveDoc & { id: string; createdAt: Date | null }

/* ───────────── Cierres, metas ───────────── */

export interface ClosingDoc {
  businessId: string
  month: string // YYYY-MM
  from: string
  to: string
  netIncomeMinor: number
  expensesMinor: number
  cogsMinor: number
  baseMinor: number
  cashNowMinor: number
  minReserveMinor: number
  upcomingMinor: number
  surplusMinor: number
  allocatableMinor: number
  ownerMinor: number
  reinvestMinor: number
  reserveMinor: number
  heldBackMinor: number
  policy: { reserveBps: number; reinvestBps: number; ownerBps: number }
  note: string
}
export type Closing = ClosingDoc & { id: string; createdAt: Date | null }

export const GOAL_KINDS = ['cash', 'monthly_result', 'monthly_revenue'] as const
export type GoalKind = (typeof GOAL_KINDS)[number]
export const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  cash: 'Tener este efectivo disponible',
  monthly_result: 'Lograr este resultado operativo al mes',
  monthly_revenue: 'Lograr estos ingresos netos al mes',
}
export interface GoalDoc {
  name: string
  kind: GoalKind
  businessId: string | null
  targetMinor: number
  targetDate: string | null
  active: boolean
}
export type Goal = GoalDoc & { id: string }
