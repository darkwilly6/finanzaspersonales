import { z } from 'zod'
import { RECURRING_FREQUENCIES, RECURRING_TYPES, type Account, type Category, type RecurringDoc, type TaskDoc } from '../types/ledger'
import { isValidDateString } from '../calculations/dates'
import { parseMoneyToMinor } from '../calculations/money'

const dateStr = z.string().refine(isValidDateString, 'Elige una fecha válida.')

export const recurringFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Escribe el nombre del pago.').max(80, 'Máximo 80 caracteres.'),
    type: z.enum(RECURRING_TYPES),
    accountId: z.string().min(1, 'Elige la cuenta.'),
    amount: z.string().trim().min(1, 'Escribe el importe.'),
    frequency: z.enum(RECURRING_FREQUENCIES),
    startDate: dateStr,
    endDate: z.string(),
    categoryId: z.string(),
    description: z.string().trim().max(200, 'Máximo 200 caracteres.'),
  })
  .superRefine((v, ctx) => {
    const m = parseMoneyToMinor(v.amount)
    if (m === null || m <= 0) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Escribe un importe mayor que cero, por ejemplo 29.99.' })
    if (v.endDate !== '') {
      if (!isValidDateString(v.endDate)) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Fecha de fin no válida.' })
      else if (isValidDateString(v.startDate) && v.endDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'La fecha de fin no puede ser anterior al inicio.' })
    }
  })
export type RecurringFormValues = z.infer<typeof recurringFormSchema>

/** Devuelve el documento o un mensaje de error (relaciones entre campos que dependen de las cuentas y categorías). */
export function recurringFormToDoc(v: RecurringFormValues, accounts: readonly Account[], categories: readonly Category[], active = true): { doc: RecurringDoc } | { error: string; field: keyof RecurringFormValues } {
  const acc = accounts.find((a) => a.id === v.accountId)
  if (!acc) return { error: 'La cuenta no existe.', field: 'accountId' }
  if (acc.status !== 'active') return { error: 'Esta cuenta está archivada.', field: 'accountId' }
  if (v.startDate < acc.openingBalanceDate) return { error: 'El inicio es anterior al saldo inicial de la cuenta.', field: 'startDate' }
  if (v.categoryId) {
    const cat = categories.find((c) => c.id === v.categoryId)
    const kind = v.type === 'income' ? 'income' : v.type === 'expense' ? 'expense' : null
    if (!cat) return { error: 'La categoría no existe.', field: 'categoryId' }
    if (kind === null) return { error: 'Este tipo de pago no usa categoría.', field: 'categoryId' }
    if (cat.kind !== kind) return { error: 'La categoría no corresponde al tipo.', field: 'categoryId' }
    if (cat.scope === 'personal' && acc.scope !== 'personal') return { error: 'Esta categoría es solo personal.', field: 'categoryId' }
    if (cat.scope === 'business' && cat.businessId !== acc.businessId) return { error: 'Esta categoría pertenece a otro negocio.', field: 'categoryId' }
  }
  return {
    doc: {
      name: v.name.trim(), type: v.type, accountId: acc.id, scope: acc.scope, businessId: acc.businessId, amountMinor: parseMoneyToMinor(v.amount) ?? 0,
      frequency: v.frequency, startDate: v.startDate, endDate: v.endDate === '' ? null : v.endDate, categoryId: v.categoryId || null,
      description: v.description.trim(), active,
    },
  }
}

export const taskFormSchema = z.object({
  title: z.string().trim().min(2, 'Escribe la tarea.').max(120, 'Máximo 120 caracteres.'),
  dueDate: z.string().refine((s) => s === '' || isValidDateString(s), 'Fecha no válida.'),
  businessId: z.string(),
  notes: z.string().trim().max(500, 'Máximo 500 caracteres.'),
})
export type TaskFormValues = z.infer<typeof taskFormSchema>
export const taskFormToDoc = (v: TaskFormValues, done = false): TaskDoc => ({ title: v.title.trim(), dueDate: v.dueDate === '' ? null : v.dueDate, businessId: v.businessId || null, notes: v.notes.trim(), done })
