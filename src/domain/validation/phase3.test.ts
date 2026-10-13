import { describe, expect, it } from 'vitest'
import type { Account, Category } from '../types/ledger'
import { recurringFormSchema, recurringFormToDoc, taskFormSchema, taskFormToDoc } from './phase3'

const acc: Account = { id: 'a1', name: 'Banco', scope: 'business', businessId: 'b1', accountType: 'bank', currency: 'USD', openingBalanceMinor: 0, openingBalanceDate: '2026-01-01', status: 'active' }
const cats: Category[] = [{ id: 'e', name: 'Software', kind: 'expense', scope: 'shared', businessId: null, color: '#60a5fa', active: true }, { id: 'i', name: 'Ventas', kind: 'income', scope: 'shared', businessId: null, color: '#52d99a', active: true }]
const form = { name: 'Alquiler', type: 'expense' as const, accountId: 'a1', amount: '350', frequency: 'monthly' as const, startDate: '2026-11-01', endDate: '', categoryId: '', description: '' }

describe('pagos fijos', () => {
  it('acepta un pago válido y lo convierte a centavos con el ámbito de su cuenta', () => {
    expect(recurringFormSchema.safeParse(form).success).toBe(true)
    const r = recurringFormToDoc(form, [acc], cats)
    expect('doc' in r && r.doc).toMatchObject({ amountMinor: 35000, scope: 'business', businessId: 'b1', endDate: null, active: true, categoryId: null })
  })
  it('rechaza importe cero, fin anterior al inicio y fechas inválidas', () => {
    expect(recurringFormSchema.safeParse({ ...form, amount: '0' }).success).toBe(false)
    expect(recurringFormSchema.safeParse({ ...form, endDate: '2026-10-01' }).success).toBe(false)
    expect(recurringFormSchema.safeParse({ ...form, startDate: '2026-02-30' }).success).toBe(false)
  })
  it('valida categoría contra el tipo y la cuenta', () => {
    expect(recurringFormToDoc({ ...form, categoryId: 'e' }, [acc], cats)).toHaveProperty('doc')
    expect(recurringFormToDoc({ ...form, categoryId: 'i' }, [acc], cats)).toMatchObject({ field: 'categoryId' })
    expect(recurringFormToDoc({ ...form, type: 'tax_payment', categoryId: 'e' }, [acc], cats)).toMatchObject({ field: 'categoryId' })
  })
  it('rechaza cuenta archivada o inicio anterior al saldo inicial', () => {
    expect(recurringFormToDoc(form, [{ ...acc, status: 'archived' }], cats)).toMatchObject({ field: 'accountId' })
    expect(recurringFormToDoc({ ...form, startDate: '2025-12-01' }, [acc], cats)).toMatchObject({ field: 'startDate' })
  })
})

describe('tareas', () => {
  it('valida título y fecha opcional', () => {
    expect(taskFormSchema.safeParse({ title: 'Pagar IVA', dueDate: '', businessId: '', notes: '' }).success).toBe(true)
    expect(taskFormSchema.safeParse({ title: 'x', dueDate: '', businessId: '', notes: '' }).success).toBe(false)
    expect(taskFormSchema.safeParse({ title: 'Revisar', dueDate: '2026-13-01', businessId: '', notes: '' }).success).toBe(false)
    expect(taskFormToDoc({ title: ' Revisar ', dueDate: '', businessId: '', notes: '' })).toEqual({ title: 'Revisar', dueDate: null, businessId: null, notes: '', done: false })
  })
})
