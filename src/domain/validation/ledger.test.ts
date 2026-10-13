import { describe, expect, it } from 'vitest'
import type { Account, Category } from '../types/ledger'
import { accountFormSchema, accountFormToDoc, buildTransactionDocs, businessFormSchema, businessFormToDoc, validateTransaction, type TransactionInput } from './ledger'

const mk = (id: string, scope: 'personal' | 'business', businessId: string | null, type: Account['accountType'] = 'bank'): Account => ({
  id, name: id, scope, businessId, accountType: type, currency: 'USD', openingBalanceMinor: 0, openingBalanceDate: '2026-01-01', status: 'active',
})
const accounts = [mk('biz', 'business', 'b1'), mk('biz2', 'business', 'b1', 'cash'), mk('pers', 'personal', null), mk('trade', 'business', 'b1', 'investment'), mk('other', 'business', 'b2')]
const cats: Category[] = [
  { id: 'inc', name: 'Ventas', kind: 'income', scope: 'shared', businessId: null, color: '#52d99a', active: true },
  { id: 'exp', name: 'Publicidad', kind: 'expense', scope: 'shared', businessId: null, color: '#f5c451', active: true },
  { id: 'expB2', name: 'Solo B2', kind: 'expense', scope: 'business', businessId: 'b2', color: '#f5c451', active: true },
  { id: 'expP', name: 'Ocio', kind: 'expense', scope: 'personal', businessId: null, color: '#f5c451', active: true },
]
const ctx = { accounts, categories: cats, today: '2026-10-10' }
const base: TransactionInput = {
  type: 'expense', status: 'confirmed', date: '2026-10-05', amount: '125.50', accountId: 'biz', destinationAccountId: '',
  transferPurpose: 'internal', direction: 'in', categoryId: '', description: '', counterparty: '',
}

describe('validateTransaction', () => {
  it('acepta un gasto válido y convierte a centavos', () => {
    const r = validateTransaction(base, ctx)
    expect(r.errors).toEqual({})
    expect(r.amountMinor).toBe(12550)
  })
  it.each(['0', '-5', 'abc', '', '0.00'])('rechaza importe %j', (amount) => {
    expect(validateTransaction({ ...base, amount }, ctx).errors.amount).toBeTruthy()
  })
  it('rechaza confirmar con fecha futura pero permite planificar', () => {
    expect(validateTransaction({ ...base, date: '2026-10-20' }, ctx).errors.date).toMatch(/futura/)
    expect(validateTransaction({ ...base, date: '2026-10-20', status: 'planned' }, ctx).errors).toEqual({})
  })
  it('rechaza fecha anterior al saldo inicial', () => {
    expect(validateTransaction({ ...base, date: '2025-12-31' }, ctx).errors.date).toMatch(/saldo inicial/)
  })
  it('tipos solo de negocio no se aceptan en cuentas personales', () => {
    expect(validateTransaction({ ...base, type: 'owner_withdrawal', accountId: 'pers' }, ctx).errors.accountId).toMatch(/negocio/)
    expect(validateTransaction({ ...base, type: 'capital_contribution', accountId: 'pers' }, ctx).errors.accountId).toBeTruthy()
  })
  it('valida la categoría según tipo, negocio y ámbito', () => {
    expect(validateTransaction({ ...base, categoryId: 'exp' }, ctx).errors).toEqual({})
    expect(validateTransaction({ ...base, categoryId: 'inc' }, ctx).errors.categoryId).toMatch(/no corresponde/)
    expect(validateTransaction({ ...base, categoryId: 'expB2' }, ctx).errors.categoryId).toMatch(/otro negocio/)
    expect(validateTransaction({ ...base, categoryId: 'expP' }, ctx).errors.categoryId).toMatch(/personal/)
    expect(validateTransaction({ ...base, type: 'investment', categoryId: 'exp' }, ctx).errors.categoryId).toMatch(/no usa categoría/)
  })
  it('el ajuste exige dirección y descripción', () => {
    expect(validateTransaction({ ...base, type: 'adjustment', description: '' }, ctx).errors.description).toBeTruthy()
    expect(validateTransaction({ ...base, type: 'adjustment', description: 'Diferencia de conteo de caja' }, ctx).errors).toEqual({})
  })
  it('no permite cuenta archivada', () => {
    const archived = [{ ...accounts[0]!, status: 'archived' as const }, ...accounts.slice(1)]
    expect(validateTransaction(base, { ...ctx, accounts: archived }).errors.accountId).toMatch(/archivada/)
  })
})

describe('transferencias', () => {
  const t = { ...base, type: 'transfer' as const, destinationAccountId: 'biz2' }
  it('origen y destino distintos', () => {
    expect(validateTransaction({ ...t, destinationAccountId: 'biz' }, ctx).errors.destinationAccountId).toMatch(/misma cuenta/)
    expect(validateTransaction({ ...t, destinationAccountId: '' }, ctx).errors.destinationAccountId).toBeTruthy()
  })
  it('valida el motivo contra los ámbitos de las cuentas', () => {
    expect(validateTransaction({ ...t, destinationAccountId: 'pers', transferPurpose: 'owner_withdrawal' }, ctx).errors).toEqual({})
    expect(validateTransaction({ ...t, destinationAccountId: 'biz2', transferPurpose: 'owner_withdrawal' }, ctx).errors.transferPurpose).toBeTruthy()
    expect(validateTransaction({ ...t, accountId: 'pers', destinationAccountId: 'biz', transferPurpose: 'capital_contribution' }, ctx).errors).toEqual({})
    expect(validateTransaction({ ...t, accountId: 'biz', destinationAccountId: 'pers', transferPurpose: 'capital_contribution' }, ctx).errors.transferPurpose).toBeTruthy()
    expect(validateTransaction({ ...t, destinationAccountId: 'trade', transferPurpose: 'investment_deposit' }, ctx).errors).toEqual({})
    expect(validateTransaction({ ...t, destinationAccountId: 'biz2', transferPurpose: 'investment_deposit' }, ctx).errors.transferPurpose).toMatch(/inversión/)
  })
  it('construye dos lados vinculados con ids deterministas y misma fecha/importe', () => {
    const docs = buildTransactionDocs({ ...t, destinationAccountId: 'pers', transferPurpose: 'salary' }, ctx, 'abc')
    expect(docs.map((d) => d.id)).toEqual(['abc_out', 'abc_in'])
    const [out, inn] = docs.map((d) => d.data)
    expect(out!.accountId).toBe('biz'); expect(out!.direction).toBe('out'); expect(out!.counterpartAccountId).toBe('pers')
    expect(inn!.accountId).toBe('pers'); expect(inn!.direction).toBe('in'); expect(inn!.counterpartAccountId).toBe('biz')
    expect(out!.transferId).toBe('abc'); expect(inn!.transferId).toBe('abc')
    expect(out!.amountMinor).toBe(inn!.amountMinor); expect(out!.date).toBe(inn!.date)
    expect(out!.scope).toBe('business'); expect(inn!.scope).toBe('personal'); expect(inn!.businessId).toBeNull()
  })
  it('un movimiento simple produce un documento con el ámbito de su cuenta', () => {
    const [d] = buildTransactionDocs({ ...base, categoryId: 'exp' }, ctx, 'x1')
    expect(d!.data).toMatchObject({ type: 'expense', scope: 'business', businessId: 'b1', accountId: 'biz', categoryId: 'exp', direction: null, transferId: null, amountMinor: 12550 })
  })
  it('se niega a construir un movimiento inválido', () => {
    expect(() => buildTransactionDocs({ ...base, amount: '0' }, ctx, 'x')).toThrow()
  })
})

describe('formularios de negocio y cuenta', () => {
  const biz = { name: 'NYXAR', description: '', type: 'physical' as const, startDate: '2026-01-01', payoutMethod: 'owner_draw' as const, payoutFrequency: 'monthly' as const, payoutCustomDays: '', minReserve: '', taxEnabled: false, taxLabel: '', taxRate: '', taxPricesInclude: 'included' as const, allocReserve: '', allocReinvest: '', allocOwner: '', notes: '' }
  it('acepta valores por defecto: retiro del propietario, sin impuestos, reserva 0', () => {
    const r = businessFormSchema.safeParse(biz)
    expect(r.success).toBe(true)
    const doc = businessFormToDoc(biz)
    expect(doc.payout.method).toBe('owner_draw')
    expect(doc.tax).toEqual({ enabled: false, label: '', rateBps: 0, pricesIncludeTax: true })
    expect(doc.reserve.minReserveMinor).toBe(0)
    expect(doc.inventoryMethod).toBe('weighted_average')
  })
  it('exige días en frecuencia personalizada', () => {
    expect(businessFormSchema.safeParse({ ...biz, payoutFrequency: 'custom', payoutCustomDays: '' }).success).toBe(false)
    expect(businessFormToDoc({ ...biz, payoutFrequency: 'custom', payoutCustomDays: '10' }).payout.customDays).toBe(10)
  })
  it('al activar impuestos exige nombre y tasa explícita (no asume 13 %)', () => {
    expect(businessFormSchema.safeParse({ ...biz, taxEnabled: true }).success).toBe(false)
    const ok = { ...biz, taxEnabled: true, taxLabel: 'IVA', taxRate: '13', taxPricesInclude: 'separate' as const }
    expect(businessFormSchema.safeParse(ok).success).toBe(true)
    expect(businessFormToDoc(ok).tax).toEqual({ enabled: true, label: 'IVA', rateBps: 1300, pricesIncludeTax: false })
  })
  it('reparto: vacío = sin configurar; completo debe sumar 100', () => {
    expect(businessFormToDoc(biz).allocation).toBeNull()
    expect(businessFormSchema.safeParse({ ...biz, allocReserve: '20', allocReinvest: '30', allocOwner: '50' }).success).toBe(true)
    expect(businessFormToDoc({ ...biz, allocReserve: '20', allocReinvest: '30', allocOwner: '50' }).allocation).toEqual({ reserveBps: 2000, reinvestBps: 3000, ownerBps: 5000 })
    expect(businessFormSchema.safeParse({ ...biz, allocReserve: '20', allocReinvest: '30', allocOwner: '40' }).success).toBe(false)
    expect(businessFormSchema.safeParse({ ...biz, allocReserve: '20', allocReinvest: '', allocOwner: '80' }).success).toBe(false)
    expect(businessFormSchema.safeParse({ ...biz, allocReserve: '0', allocReinvest: '0', allocOwner: '100' }).success).toBe(true)
  })
  it('reserva mínima en centavos', () => {
    expect(businessFormToDoc({ ...biz, minReserve: '1,500.50' }).reserve.minReserveMinor).toBe(150050)
  })
  it('cuenta: saldo inicial obligatorio, negocio obligatorio, permite deuda', () => {
    const acc = { name: 'Banco', scope: 'business' as const, businessId: '', accountType: 'bank' as const, openingBalance: '', openingBalanceDate: '2026-01-01' }
    expect(accountFormSchema.safeParse(acc).success).toBe(false)
    expect(accountFormSchema.safeParse({ ...acc, businessId: 'b1', openingBalance: '0' }).success).toBe(true)
    expect(accountFormToDoc({ ...acc, businessId: 'b1', openingBalance: '-200.5' }).openingBalanceMinor).toBe(-20050)
    expect(accountFormToDoc({ ...acc, scope: 'personal', openingBalance: '10' }).businessId).toBeNull()
  })
})
