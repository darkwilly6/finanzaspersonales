import { z } from 'zod'
import {
  ACCOUNT_TYPES, BUSINESS_TYPES, PAYOUT_FREQUENCIES, PAYOUT_METHODS, TRANSACTION_STATUSES, TRANSACTION_TYPES, TRANSFER_PURPOSES,
  type Account, type AccountDoc, type BusinessDoc, type Category, type CategoryDoc, type Direction, type Scope,
  type TransactionDoc, type TransactionStatus, type TransactionType, type TransferPurpose,
} from '../types/ledger'
import { isValidDateString } from '../calculations/dates'
import { parseMoneyToMinor } from '../calculations/money'
import { parsePercentToBps, parseSignedMoneyToMinor } from '../calculations/percent'
import { TYPE_RULES } from '../calculations/transactionRules'

const dateStr = z.string().refine(isValidDateString, 'Elige una fecha válida.')
const MAX_MINOR = 100_000_000_000 // 1 000 millones de USD

/* ───────────── Negocio ───────────── */

export const businessFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Escribe el nombre del negocio.').max(80, 'Máximo 80 caracteres.'),
    description: z.string().trim().max(300, 'Máximo 300 caracteres.'),
    type: z.enum(BUSINESS_TYPES),
    startDate: dateStr,
    payoutMethod: z.enum(PAYOUT_METHODS),
    payoutFrequency: z.enum(PAYOUT_FREQUENCIES),
    payoutCustomDays: z.string().trim(),
    minReserve: z.string().trim(),
    taxEnabled: z.boolean(),
    taxLabel: z.string().trim().max(30, 'Máximo 30 caracteres.'),
    taxRate: z.string().trim(),
    taxPricesInclude: z.enum(['included', 'separate']),
    allocReserve: z.string().trim(),
    allocReinvest: z.string().trim(),
    allocOwner: z.string().trim(),
    notes: z.string().trim().max(1000, 'Máximo 1000 caracteres.'),
  })
  .superRefine((v, ctx) => {
    if (v.payoutFrequency === 'custom') {
      const n = Number(v.payoutCustomDays)
      if (!Number.isInteger(n) || n < 1 || n > 365) ctx.addIssue({ code: 'custom', path: ['payoutCustomDays'], message: 'Indica cada cuántos días (1 a 365).' })
    }
    if (v.minReserve !== '' && parseMoneyToMinor(v.minReserve) === null) ctx.addIssue({ code: 'custom', path: ['minReserve'], message: 'Escribe un importe válido, por ejemplo 500 o 500.00.' })
    if (v.taxEnabled) {
      if (v.taxLabel.length < 1) ctx.addIssue({ code: 'custom', path: ['taxLabel'], message: 'Indica el nombre del impuesto (por ejemplo IVA).' })
      const bps = parsePercentToBps(v.taxRate)
      if (bps === null || bps <= 0 || bps > 10000) ctx.addIssue({ code: 'custom', path: ['taxRate'], message: 'Escribe una tasa entre 0.01 y 100, por ejemplo 13.' })
    }
    // Reparto: o está vacío (sin configurar) o los tres porcentajes están completos y suman exactamente 100.
    const alloc = [v.allocReserve, v.allocReinvest, v.allocOwner]
    if (alloc.some((x) => x !== '')) {
      const parsed = alloc.map((x) => (x === '' ? null : parsePercentToBps(x)))
      const paths = ['allocReserve', 'allocReinvest', 'allocOwner'] as const
      parsed.forEach((b, i) => {
        if (b === null || b > 10000) ctx.addIssue({ code: 'custom', path: [paths[i]!], message: 'Escribe un porcentaje entre 0 y 100 (usa 0 si no aplica).' })
      })
      if (parsed.every((b) => b !== null && b <= 10000) && (parsed as number[]).reduce((a, b) => a + b, 0) !== 10000) {
        ctx.addIssue({ code: 'custom', path: ['allocOwner'], message: 'Los tres porcentajes deben sumar exactamente 100.' })
      }
    }
  })
export type BusinessFormValues = z.infer<typeof businessFormSchema>

export function businessFormToDoc(v: BusinessFormValues, status: BusinessDoc['status'] = 'active'): BusinessDoc {
  return {
    name: v.name.trim(),
    description: v.description.trim(),
    type: v.type,
    currency: 'USD',
    startDate: v.startDate,
    status,
    payout: { method: v.payoutMethod, frequency: v.payoutFrequency, customDays: v.payoutFrequency === 'custom' ? Number(v.payoutCustomDays) : null },
    reserve: { minReserveMinor: v.minReserve === '' ? 0 : (parseMoneyToMinor(v.minReserve) ?? 0) },
    tax: {
      enabled: v.taxEnabled,
      label: v.taxEnabled ? v.taxLabel.trim() : '',
      rateBps: v.taxEnabled ? (parsePercentToBps(v.taxRate) ?? 0) : 0,
      pricesIncludeTax: v.taxPricesInclude === 'included',
    },
    inventoryMethod: 'weighted_average',
    allocation: [v.allocReserve, v.allocReinvest, v.allocOwner].every((x) => x === '')
      ? null
      : { reserveBps: parsePercentToBps(v.allocReserve) ?? 0, reinvestBps: parsePercentToBps(v.allocReinvest) ?? 0, ownerBps: parsePercentToBps(v.allocOwner) ?? 0 },
    notes: v.notes.trim(),
  }
}

/* ───────────── Cuenta ───────────── */

export const accountFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Escribe el nombre de la cuenta.').max(80, 'Máximo 80 caracteres.'),
    scope: z.enum(['personal', 'business']),
    businessId: z.string(),
    accountType: z.enum(ACCOUNT_TYPES),
    openingBalance: z.string().trim().min(1, 'Escribe el saldo inicial real (puede ser 0).'),
    openingBalanceDate: dateStr,
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'business' && !v.businessId) ctx.addIssue({ code: 'custom', path: ['businessId'], message: 'Elige a qué negocio pertenece.' })
    const m = parseSignedMoneyToMinor(v.openingBalance)
    if (m === null || Math.abs(m) > MAX_MINOR) ctx.addIssue({ code: 'custom', path: ['openingBalance'], message: 'Escribe un importe válido, por ejemplo 1250.75.' })
  })
export type AccountFormValues = z.infer<typeof accountFormSchema>

export function accountFormToDoc(v: AccountFormValues, status: AccountDoc['status'] = 'active'): AccountDoc {
  return {
    name: v.name.trim(),
    scope: v.scope,
    businessId: v.scope === 'business' ? v.businessId : null,
    accountType: v.accountType,
    currency: 'USD',
    openingBalanceMinor: parseSignedMoneyToMinor(v.openingBalance) ?? 0,
    openingBalanceDate: v.openingBalanceDate,
    status,
  }
}

/* ───────────── Categoría ───────────── */

export const categoryFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Escribe el nombre.').max(60, 'Máximo 60 caracteres.'),
    kind: z.enum(['income', 'expense']),
    scope: z.enum(['shared', 'personal', 'business']),
    businessId: z.string(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido.'),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'business' && !v.businessId) ctx.addIssue({ code: 'custom', path: ['businessId'], message: 'Elige el negocio.' })
  })
export type CategoryFormValues = z.infer<typeof categoryFormSchema>
export function categoryFormToDoc(v: CategoryFormValues, active = true): CategoryDoc {
  return { name: v.name.trim(), kind: v.kind, scope: v.scope, businessId: v.scope === 'business' ? v.businessId : null, color: v.color, active }
}

export const SUGGESTED_CATEGORIES: { name: string; kind: 'income' | 'expense'; color: string }[] = [
  { name: 'Ventas', kind: 'income', color: '#52d99a' },
  { name: 'Servicios y mentorías', kind: 'income', color: '#60a5fa' },
  { name: 'Otros ingresos', kind: 'income', color: '#b18cff' },
  { name: 'Publicidad', kind: 'expense', color: '#f5c451' },
  { name: 'Herramientas y software', kind: 'expense', color: '#60a5fa' },
  { name: 'Comisiones y tarifas', kind: 'expense', color: '#ff6868' },
  { name: 'Cuentas de fondeo y evaluaciones', kind: 'expense', color: '#b18cff' },
  { name: 'Proveedores y mercancía', kind: 'expense', color: '#b18cff' },
  { name: 'Envíos y logística', kind: 'expense', color: '#52d99a' },
  { name: 'Alquiler y servicios', kind: 'expense', color: '#f5c451' },
  { name: 'Alimentación', kind: 'expense', color: '#ff9f68' },
  { name: 'Transporte', kind: 'expense', color: '#60a5fa' },
  { name: 'Ocio', kind: 'expense', color: '#b18cff' },
  { name: 'Otros gastos', kind: 'expense', color: '#a0a5ad' },
]

/* ───────────── Movimiento ───────────── */

export interface TransactionInput {
  type: TransactionType
  status: TransactionStatus
  date: string
  amount: string
  accountId: string
  destinationAccountId: string
  transferPurpose: TransferPurpose
  direction: Direction
  categoryId: string
  description: string
  counterparty: string
}

export interface TxContext {
  accounts: readonly Account[]
  categories: readonly Category[]
  today: string
}

export interface TxValidation {
  errors: Partial<Record<keyof TransactionInput | 'form', string>>
  amountMinor: number | null
}

const EDITABLE_STATUS: TransactionStatus[] = ['planned', 'pending', 'confirmed']

/** Validación completa de un movimiento, incluidas las reglas entre campos. Pura y testeable. */
export function validateTransaction(input: TransactionInput, ctx: TxContext): TxValidation {
  const errors: TxValidation['errors'] = {}
  const rule = TYPE_RULES[input.type]
  if (!(TRANSACTION_TYPES as readonly string[]).includes(input.type)) errors.type = 'Tipo no válido.'
  if (!EDITABLE_STATUS.includes(input.status) || !(TRANSACTION_STATUSES as readonly string[]).includes(input.status)) errors.status = 'Estado no válido.'

  const amountMinor = parseMoneyToMinor(input.amount)
  if (amountMinor === null) errors.amount = 'Escribe un importe válido, por ejemplo 125.50.'
  else if (amountMinor <= 0) errors.amount = 'El importe debe ser mayor que cero.'
  else if (amountMinor > MAX_MINOR) errors.amount = 'El importe es demasiado grande.'

  if (!isValidDateString(input.date)) errors.date = 'Elige una fecha válida.'
  else if (input.status === 'confirmed' && input.date > ctx.today) errors.date = 'Un movimiento confirmado no puede tener fecha futura. Márcalo como planificado.'

  const acc = ctx.accounts.find((a) => a.id === input.accountId)
  if (!acc) errors.accountId = input.type === 'transfer' ? 'Elige la cuenta de origen.' : 'Elige la cuenta.'
  else if (acc.status !== 'active') errors.accountId = 'Esta cuenta está archivada.'
  else if (rule.businessOnly && acc.scope !== 'business') errors.accountId = `"${rule.label}" solo aplica a cuentas de un negocio.`
  else if (!errors.date && input.date < acc.openingBalanceDate) errors.date = 'La fecha es anterior al saldo inicial de la cuenta; ya está incluida en ese saldo.'

  if (input.type === 'transfer') {
    const dest = ctx.accounts.find((a) => a.id === input.destinationAccountId)
    if (!dest) errors.destinationAccountId = 'Elige la cuenta de destino.'
    else if (dest.id === input.accountId) errors.destinationAccountId = 'El origen y el destino no pueden ser la misma cuenta.'
    else if (dest.status !== 'active') errors.destinationAccountId = 'Esta cuenta está archivada.'
    else if (acc) {
      const p = input.transferPurpose
      if (!(TRANSFER_PURPOSES as readonly string[]).includes(p)) errors.transferPurpose = 'Elige el motivo.'
      else if ((p === 'owner_withdrawal' || p === 'salary') && !(acc.scope === 'business' && dest.scope === 'personal')) errors.transferPurpose = 'Este motivo va de una cuenta de negocio a una cuenta personal.'
      else if (p === 'capital_contribution' && !(acc.scope === 'personal' && dest.scope === 'business')) errors.transferPurpose = 'Un aporte de capital va de una cuenta personal a una de negocio.'
      else if (p === 'investment_deposit' && dest.accountType !== 'investment') errors.transferPurpose = 'El destino debe ser una cuenta de inversión o trading.'
      if (!errors.date && input.date < dest.openingBalanceDate) errors.date = 'La fecha es anterior al saldo inicial de la cuenta de destino.'
    }
  }

  if (input.type === 'adjustment') {
    if (input.direction !== 'in' && input.direction !== 'out') errors.direction = 'Indica si el ajuste suma o resta.'
    if (input.description.trim().length < 5) errors.description = 'Explica el motivo del ajuste (mínimo 5 caracteres).'
  }
  if (input.description.length > 200) errors.description = 'Máximo 200 caracteres.'
  if (input.counterparty.length > 80) errors.counterparty = 'Máximo 80 caracteres.'

  if (input.categoryId) {
    const cat = ctx.categories.find((c) => c.id === input.categoryId)
    if (rule.categoryKind === null) errors.categoryId = 'Este tipo de movimiento no usa categoría.'
    else if (!cat) errors.categoryId = 'La categoría no existe.'
    else if (cat.kind !== rule.categoryKind) errors.categoryId = 'La categoría no corresponde al tipo de movimiento.'
    else if (acc && cat.scope === 'personal' && acc.scope !== 'personal') errors.categoryId = 'Esta categoría es solo personal.'
    else if (acc && cat.scope === 'business' && cat.businessId !== acc.businessId) errors.categoryId = 'Esta categoría pertenece a otro negocio.'
  }
  return { errors, amountMinor: errors.amount ? null : amountMinor }
}

export interface BuiltTx { id: string; data: TransactionDoc }

/** Construye 1 documento (movimiento simple) o 2 (transferencia con lados vinculados). */
export function buildTransactionDocs(input: TransactionInput, ctx: TxContext, baseId: string): BuiltTx[] {
  const v = validateTransaction(input, ctx)
  if (Object.keys(v.errors).length || v.amountMinor === null) throw new Error('El movimiento no es válido.')
  const amountMinor = v.amountMinor
  const acc = ctx.accounts.find((a) => a.id === input.accountId)!
  const common = {
    currency: 'USD' as const, date: input.date, amountMinor, status: input.status,
    description: input.description.trim(), counterparty: input.counterparty.trim(), voidedAt: null, voidReason: null,
  }
  const side = (a: Account, dir: Direction, counterpart: Account): TransactionDoc => ({
    ...common, type: 'transfer', scope: a.scope as Scope, businessId: a.businessId, accountId: a.id,
    counterpartAccountId: counterpart.id, transferId: baseId, transferPurpose: input.transferPurpose, direction: dir, categoryId: null,
  })

  if (input.type === 'transfer') {
    const dest = ctx.accounts.find((a) => a.id === input.destinationAccountId)!
    return [
      { id: `${baseId}_out`, data: side(acc, 'out', dest) },
      { id: `${baseId}_in`, data: side(dest, 'in', acc) },
    ]
  }
  return [{
    id: baseId,
    data: {
      ...common, type: input.type, scope: acc.scope, businessId: acc.businessId, accountId: acc.id,
      counterpartAccountId: null, transferId: null, transferPurpose: null,
      direction: input.type === 'adjustment' ? input.direction : null,
      categoryId: input.categoryId || null,
    },
  }]
}
