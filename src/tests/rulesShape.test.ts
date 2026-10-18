import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

// userProfile importa Firebase; aquí solo necesitamos la función pura.
vi.mock('../lib/firebase', () => ({ requireDb: () => ({}) }))
vi.mock('firebase/firestore', () => ({ doc: () => ({}), getDoc: () => ({}), serverTimestamp: () => 'TS', setDoc: () => ({}), updateDoc: () => ({}) }))

import { freshProfile } from '../lib/userProfile'
import { accountFormToDoc, businessFormToDoc, categoryFormToDoc, buildTransactionDocs } from '../domain/validation/ledger'
import { productFormToDoc, buildSale, saleMoveId } from '../domain/validation/sales'
import { buildInventory } from '../domain/validation/inventory'
import { recurringFormToDoc, taskFormToDoc } from '../domain/validation/phase3'
import type { Account, Business, ClosingDoc, GoalDoc, Product, Category } from '../domain/types/ledger'

/**
 * Esta prueba protege contra un fallo silencioso: que las reglas de Firestore rechacen lo que la app realmente envía
 * (un campo de más o de menos). Lee las listas hasOnly/hasAll de firestore.rules y las compara con los documentos reales.
 */
const rules = readFileSync('firebase/firestore.rules', 'utf8').replace(/\/\/[^\n]*/g, '')

function block(fn: string): string {
  const start = rules.indexOf(`function ${fn}(`)
  if (start < 0) throw new Error(`Falta la función ${fn} en las reglas`)
  const next = rules.indexOf('function ', start + 10)
  const m = rules.indexOf('match /', start)
  const end = Math.min(...[next, m].filter((x) => x > 0))
  return rules.slice(start, end > start ? end : undefined)
}

function lists(fn: string): Record<string, { only?: string[]; all?: string[] }> {
  const b = block(fn)
  const out: Record<string, { only?: string[]; all?: string[] }> = {}
  for (const m of b.matchAll(/(\w+(?:\.\w+)*)\.keys\(\)\.(hasOnly|hasAll)\(\[([^\]]*)\]\)/g)) {
    const path = m[1]!.replace(/^[a-z]+\.?/, '') // quita "d." y deja "payout", "tax"…
    const arr = [...m[3]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!)
    out[path] ??= {}
    out[path]![m[2] === 'hasOnly' ? 'only' : 'all'] = arr
  }
  return out
}

function check(fn: string, doc: Record<string, unknown>, nested: string[] = []) {
  const l = lists(fn)
  const top = l[''] ?? {}
  const keys = Object.keys(doc)
  const extra = keys.filter((k) => top.only && !top.only.includes(k))
  const missing = (top.all ?? []).filter((k) => !keys.includes(k))
  expect({ fn, extra, missing }).toEqual({ fn, extra: [], missing: [] })
  for (const n of nested) {
    const sub = doc[n] as Record<string, unknown> | null
    if (!sub) continue
    const nl = l[n] ?? {}
    const k = Object.keys(sub)
    expect({ fn, nested: n, extra: k.filter((x) => nl.only && !nl.only.includes(x)) }).toEqual({ fn, nested: n, extra: [] })
  }
}

const stamps = { createdAt: 'TS', updatedAt: 'TS' }
const biz = (): Business => ({ id: 'b1', name: 'NYXAR', tax: { enabled: false, label: '', rateBps: 0, pricesIncludeTax: true } } as Business)
const account: Account = { id: 'a1', name: 'Banco', scope: 'business', businessId: 'b1', accountType: 'bank', currency: 'USD', openingBalanceMinor: 0, openingBalanceDate: '2026-01-01', status: 'active' }

describe('las reglas de Firestore aceptan exactamente los campos que la app envía', () => {
  it('perfil de usuario (al crear la cuenta)', () => {
    check('validUserDoc', { ...freshProfile('a@b.co', 'Ana'), ...stamps }, ['profile', 'preferences'])
  })
  it('negocio (con y sin reparto)', () => {
    const form = { name: 'NYXAR', description: '', type: 'physical' as const, startDate: '2026-01-01', payoutMethod: 'owner_draw' as const, payoutFrequency: 'monthly' as const, payoutCustomDays: '', minReserve: '', taxEnabled: false, taxLabel: '', taxRate: '', taxPricesInclude: 'included' as const, allocReserve: '', allocReinvest: '', allocOwner: '', notes: '' }
    check('validBusiness', { ...businessFormToDoc(form), ...stamps }, ['payout', 'reserve', 'tax'])
    check('validBusiness', { ...businessFormToDoc({ ...form, allocReserve: '20', allocReinvest: '30', allocOwner: '50' }), ...stamps }, ['payout', 'reserve', 'tax'])
  })
  it('cuenta', () => {
    check('validAccount', { ...accountFormToDoc({ name: 'Banco', scope: 'business', businessId: 'b1', accountType: 'bank', openingBalance: '10', openingBalanceDate: '2026-01-01' }), ...stamps })
    check('validAccount', { ...accountFormToDoc({ name: 'Efectivo', scope: 'personal', businessId: '', accountType: 'cash', openingBalance: '0', openingBalanceDate: '2026-01-01' }), ...stamps })
  })
  it('categoría', () => {
    check('validCategory', { ...categoryFormToDoc({ name: 'Ventas', kind: 'income', scope: 'shared', businessId: '', color: '#52d99a' }), ...stamps })
  })
  it('movimientos simples y transferencias', () => {
    const ctx = { accounts: [account, { ...account, id: 'a2', name: 'Caja' }], categories: [] as Category[], today: '2026-10-10' }
    const base = { type: 'income' as const, status: 'confirmed' as const, date: '2026-10-05', amount: '10', accountId: 'a1', destinationAccountId: '', transferPurpose: 'internal' as const, direction: 'in' as const, categoryId: '', description: '', counterparty: '' }
    for (const d of buildTransactionDocs(base, ctx, 'T1')) check('validTx', { ...d.data, ...stamps })
    for (const d of buildTransactionDocs({ ...base, type: 'transfer', destinationAccountId: 'a2' }, ctx, 'T2')) check('validTx', { ...d.data, ...stamps })
    for (const d of buildTransactionDocs({ ...base, type: 'adjustment', description: 'Conteo de caja' }, ctx, 'T3')) check('validTx', { ...d.data, ...stamps })
  })
  it('producto', () => {
    check('validProduct', { ...productFormToDoc({ name: 'Camisa', sku: '', businessId: 'b1', price: '25', cost: '', trackStock: true, reorderPoint: '5' }), ...stamps })
    check('validProduct', { ...productFormToDoc({ name: 'Camisa', sku: '', businessId: 'b1', price: '25', cost: '', trackStock: false, reorderPoint: '' }), ...stamps })
  })
  it('venta, sus movimientos y sus salidas de stock', () => {
    const product: Product = { id: 'p1', name: 'Camisa', sku: '', businessId: 'b1', unitPriceMinor: 2500, unitCostMinor: null, active: true, trackStock: true, reorderPoint: 5 }
    const tax = { enabled: true, label: 'IVA', rateBps: 1300, pricesIncludeTax: true }
    const built = buildSale(
      { accountId: 'a1', date: '2026-10-05', customer: '', status: 'paid', discount: '', pricesIncludeTax: true, categoryId: '', notes: '', lines: [{ productId: 'p1', name: '', quantity: '2', unitPrice: '25', unitCost: '' }] },
      { business: { ...biz(), tax } as Business, accounts: [account], products: [product], categories: [], today: '2026-10-10', stock: new Map([['p1', { units: 10, valueMinor: 8000 }]]) },
      'S1',
    )
    check('validSale', { ...built.sale, createdAt: 'TS' })
    for (const t of built.txs) check('validTx', { ...t.data, ...stamps })
    expect(built.moves[0]!.id).toBe(saleMoveId('S1', 0))
    for (const m of built.moves) check('validMove', { ...m.data, createdAt: 'TS' })
  })
  it('compra, devolución y ajuste de stock', () => {
    const product: Product = { id: 'p1', name: 'Camisa', sku: '', businessId: 'b1', unitPriceMinor: 2500, unitCostMinor: null, active: true, trackStock: true, reorderPoint: null }
    const ctx = { products: [product], accounts: [account], stock: new Map([['p1', { units: 10, valueMinor: 8000 }]]), today: '2026-10-10' }
    const base = { kind: 'purchase' as const, productId: 'p1', date: '2026-10-05', quantity: '5', unitCost: '8', direction: 'in' as const, accountId: 'a1', payStatus: 'paid' as const, supplier: '', note: '', refundAmount: '' }
    const purchase = buildInventory(base, ctx, 'M1')
    check('validMove', { ...purchase.move.data, createdAt: 'TS' })
    check('validTx', { ...purchase.tx!.data, ...stamps })
    const ret = buildInventory({ ...base, kind: 'return', refundAmount: '20' }, ctx, 'M2')
    check('validMove', { ...ret.move.data, createdAt: 'TS' })
    check('validTx', { ...ret.tx!.data, ...stamps })
    check('validMove', { ...buildInventory({ ...base, kind: 'adjustment', direction: 'out', note: 'Mercancía dañada' }, ctx, 'M3').move.data, createdAt: 'TS' })
  })
  it('pago fijo, tarea, meta y cierre', () => {
    const r = recurringFormToDoc({ name: 'Alquiler', type: 'expense', accountId: 'a1', amount: '300', frequency: 'monthly', startDate: '2026-11-01', endDate: '', categoryId: '', description: '' }, [account], [])
    check('validRecurring', { ...('doc' in r ? r.doc : {}), ...stamps })
    check('validTask', { ...taskFormToDoc({ title: 'Pagar impuestos', dueDate: '', businessId: '', notes: '' }), ...stamps })
    const goal: GoalDoc = { name: 'Colchón', kind: 'cash', businessId: null, targetMinor: 100000, targetDate: null, active: true }
    check('validGoal', { ...goal, ...stamps })
    const closing: ClosingDoc = { businessId: 'b1', month: '2026-09', from: '2026-09-01', to: '2026-09-30', netIncomeMinor: 0, expensesMinor: 0, cogsMinor: 0, baseMinor: 0, cashNowMinor: 0, minReserveMinor: 0, upcomingMinor: 0, surplusMinor: 0, allocatableMinor: 0, ownerMinor: 0, reinvestMinor: 0, reserveMinor: 0, heldBackMinor: 0, policy: { reserveBps: 2000, reinvestBps: 3000, ownerBps: 5000 }, note: '' }
    check('validClosing', { ...closing, createdAt: 'TS' }, ['policy'])
  })
  it('auditoría', () => {
    check('validAudit', { action: 'create', entityType: 'businesses', entityId: 'x', summary: 'y', createdAt: 'TS' })
  })
})
