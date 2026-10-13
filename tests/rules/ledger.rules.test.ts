import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc, updateDoc, deleteDoc, getDoc, serverTimestamp, writeBatch, Timestamp } from 'firebase/firestore'

let env: RulesTestEnvironment
const ts = serverTimestamp()

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-capital-os-ledger',
    firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  })
})
afterAll(async () => env.cleanup())

const A = () => env.authenticatedContext('userA', { email: 'a@correo.com' }).firestore()
const B = () => env.authenticatedContext('userB', { email: 'b@correo.com' }).firestore()
const anon = () => env.unauthenticatedContext().firestore()

const business = () => ({
  name: 'NYXAR', description: '', type: 'physical', currency: 'USD', startDate: '2026-01-01', status: 'active',
  payout: { method: 'owner_draw', frequency: 'monthly', customDays: null },
  reserve: { minReserveMinor: 0 }, tax: { enabled: false, label: '', rateBps: 0, pricesIncludeTax: true },
  inventoryMethod: 'weighted_average', notes: '', createdAt: ts, updatedAt: ts,
})
const account = (over: object = {}) => ({
  name: 'Banco', scope: 'business', businessId: 'b1', accountType: 'bank', currency: 'USD', openingBalanceMinor: 100000,
  openingBalanceDate: '2026-01-01', status: 'active', createdAt: ts, updatedAt: ts, ...over,
})
const tx = (over: object = {}) => ({
  type: 'income', scope: 'business', businessId: 'b1', accountId: 'acc1', counterpartAccountId: null, transferId: null, transferPurpose: null,
  direction: null, date: '2026-10-05', amountMinor: 2500, currency: 'USD', categoryId: null, status: 'confirmed', description: '', counterparty: '',
  voidedAt: null, voidReason: null, createdAt: ts, updatedAt: ts, ...over,
})

async function seed() {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const stamp = Timestamp.now()
    await setDoc(doc(db, 'users/userA/businesses/b1'), { ...business(), createdAt: stamp, updatedAt: stamp })
    await setDoc(doc(db, 'users/userA/accounts/acc1'), { ...account(), createdAt: stamp, updatedAt: stamp })
    await setDoc(doc(db, 'users/userA/accounts/acc2'), { ...account({ name: 'Efectivo', accountType: 'cash' }), createdAt: stamp, updatedAt: stamp })
    await setDoc(doc(db, 'users/userA/accounts/pers'), { ...account({ name: 'Personal', scope: 'personal', businessId: null }), createdAt: stamp, updatedAt: stamp })
    await setDoc(doc(db, 'users/userA/transactions/confirmed1'), { ...tx(), createdAt: stamp, updatedAt: stamp })
    await setDoc(doc(db, 'users/userA/transactions/planned1'), { ...tx({ status: 'planned' }), createdAt: stamp, updatedAt: stamp })
  })
}
beforeEach(seed)

describe('negocios y cuentas', () => {
  it('el dueño crea un negocio válido; otro usuario no puede leerlo ni escribirlo', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/businesses/b2'), business()))
    await assertFails(getDoc(doc(B(), 'users/userA/businesses/b1')))
    await assertFails(setDoc(doc(B(), 'users/userA/businesses/b9'), business()))
    await assertFails(getDoc(doc(anon(), 'users/userA/businesses/b1')))
  })
  it('rechaza moneda distinta de USD, tipos inválidos y campos extra', async () => {
    await assertFails(setDoc(doc(A(), 'users/userA/businesses/b3'), { ...business(), currency: 'EUR' }))
    await assertFails(setDoc(doc(A(), 'users/userA/businesses/b3'), { ...business(), type: 'casino' }))
    await assertFails(setDoc(doc(A(), 'users/userA/businesses/b3'), { ...business(), vip: true }))
  })
  it('no se borra un negocio ni una cuenta', async () => {
    await assertFails(deleteDoc(doc(A(), 'users/userA/businesses/b1')))
    await assertFails(deleteDoc(doc(A(), 'users/userA/accounts/acc1')))
  })
  it('una cuenta de negocio exige que el negocio exista; una personal no lleva negocio', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/accounts/new1'), account()))
    await assertFails(setDoc(doc(A(), 'users/userA/accounts/new2'), account({ businessId: 'no-existe' })))
    await assertFails(setDoc(doc(A(), 'users/userA/accounts/new3'), account({ scope: 'personal', businessId: 'b1' })))
    await assertSucceeds(setDoc(doc(A(), 'users/userA/accounts/new4'), account({ scope: 'personal', businessId: null })))
  })
  it('no se puede cambiar el ámbito o el negocio de una cuenta existente', async () => {
    await assertFails(updateDoc(doc(A(), 'users/userA/accounts/acc1'), { scope: 'personal', businessId: null, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(A(), 'users/userA/accounts/acc1'), { status: 'archived', updatedAt: serverTimestamp() }))
  })
})

describe('movimientos', () => {
  it('crea un ingreso válido en su cuenta', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/transactions/n1'), tx()))
  })
  it('otro usuario no puede crear ni leer movimientos ajenos', async () => {
    await assertFails(setDoc(doc(B(), 'users/userA/transactions/n2'), tx()))
    await assertFails(getDoc(doc(B(), 'users/userA/transactions/confirmed1')))
  })
  it('rechaza importes cero, negativos o decimales', async () => {
    for (const v of [0, -5, 10.5]) await assertFails(setDoc(doc(A(), 'users/userA/transactions/bad'), tx({ amountMinor: v })))
  })
  it('rechaza una cuenta inexistente o con ámbito distinto al del movimiento', async () => {
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/n3'), tx({ accountId: 'fantasma' })))
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/n4'), tx({ accountId: 'pers' })))
  })
  it('aporte de capital, retiro y sueldo solo en cuentas de negocio', async () => {
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/n5'), tx({ type: 'owner_withdrawal', scope: 'personal', businessId: null, accountId: 'pers' })))
    await assertSucceeds(setDoc(doc(A(), 'users/userA/transactions/n6'), tx({ type: 'owner_withdrawal' })))
  })
  it('un ajuste exige dirección; los demás tipos no la llevan', async () => {
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/n7'), tx({ type: 'adjustment' })))
    await assertSucceeds(setDoc(doc(A(), 'users/userA/transactions/n8'), tx({ type: 'adjustment', direction: 'out' })))
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/n9'), tx({ direction: 'in' })))
  })
  it('crea una transferencia con dos lados vinculados en un solo lote', async () => {
    const db = A()
    const b = writeBatch(db)
    const base = { type: 'transfer', transferId: 't1', transferPurpose: 'internal' }
    b.set(doc(db, 'users/userA/transactions/t1_out'), tx({ ...base, accountId: 'acc1', counterpartAccountId: 'acc2', direction: 'out' }))
    b.set(doc(db, 'users/userA/transactions/t1_in'), tx({ ...base, accountId: 'acc2', counterpartAccountId: 'acc1', direction: 'in' }))
    await assertSucceeds(b.commit())
  })
  it('una transferencia no puede tener la misma cuenta como origen y destino', async () => {
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/t2'), tx({ type: 'transfer', transferId: 't2', transferPurpose: 'internal', accountId: 'acc1', counterpartAccountId: 'acc1', direction: 'out' })))
  })
  it('no se puede crear directamente como anulado', async () => {
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/n10'), tx({ status: 'cancelled', voidedAt: serverTimestamp(), voidReason: 'prueba' })))
  })
})

describe('inmutabilidad y anulación', () => {
  it('un movimiento confirmado no puede cambiar su importe ni su cuenta', async () => {
    await assertFails(updateDoc(doc(A(), 'users/userA/transactions/confirmed1'), { amountMinor: 999999, updatedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(A(), 'users/userA/transactions/confirmed1'), { accountId: 'acc2', updatedAt: serverTimestamp() }))
  })
  it('un movimiento confirmado puede anularse con motivo, y no sin él', async () => {
    await assertFails(updateDoc(doc(A(), 'users/userA/transactions/confirmed1'), { status: 'cancelled', voidedAt: serverTimestamp(), voidReason: '', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(A(), 'users/userA/transactions/confirmed1'), { status: 'cancelled', voidedAt: serverTimestamp(), voidReason: 'Error de captura', updatedAt: serverTimestamp() }))
  })
  it('un anulado no vuelve a cambiar', async () => {
    await updateDoc(doc(A(), 'users/userA/transactions/confirmed1'), { status: 'cancelled', voidedAt: serverTimestamp(), voidReason: 'Error de captura', updatedAt: serverTimestamp() })
    await assertFails(updateDoc(doc(A(), 'users/userA/transactions/confirmed1'), { status: 'confirmed', voidedAt: null, voidReason: null, updatedAt: serverTimestamp() }))
  })
  it('un planificado se puede editar y confirmar', async () => {
    await assertSucceeds(updateDoc(doc(A(), 'users/userA/transactions/planned1'), { amountMinor: 3000, updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(A(), 'users/userA/transactions/planned1'), { status: 'confirmed', updatedAt: serverTimestamp() }))
  })
  it('no se borra ningún movimiento', async () => {
    await assertFails(deleteDoc(doc(A(), 'users/userA/transactions/planned1')))
    await assertFails(deleteDoc(doc(A(), 'users/userA/transactions/confirmed1')))
  })
  it('no se puede cambiar createdAt', async () => {
    await assertFails(updateDoc(doc(A(), 'users/userA/transactions/planned1'), { createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
  })
})

describe('categorías y auditoría', () => {
  const category = (over: object = {}) => ({ name: 'Ventas', kind: 'income', scope: 'shared', businessId: null, color: '#52d99a', active: true, createdAt: ts, updatedAt: ts, ...over })
  it('crea categorías válidas y rechaza colores o ámbitos inconsistentes', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/categories/c1'), category()))
    await assertFails(setDoc(doc(A(), 'users/userA/categories/c2'), category({ color: 'rojo' })))
    await assertFails(setDoc(doc(A(), 'users/userA/categories/c3'), category({ scope: 'business', businessId: null })))
  })
  it('el registro de auditoría se crea pero no se edita ni se borra', async () => {
    const entry = { action: 'create', entityType: 'transactions', entityId: 'x', summary: 'Movimiento creado', createdAt: serverTimestamp() }
    await assertSucceeds(setDoc(doc(A(), 'users/userA/auditLogs/a1'), entry))
    await assertFails(updateDoc(doc(A(), 'users/userA/auditLogs/a1'), { summary: 'cambiado' }))
    await assertFails(deleteDoc(doc(A(), 'users/userA/auditLogs/a1')))
    await assertFails(setDoc(doc(B(), 'users/userA/auditLogs/a2'), entry))
  })
})

describe('pagos fijos y tareas', () => {
  const recurring = (over: object = {}) => ({
    name: 'Alquiler', type: 'expense', accountId: 'acc1', scope: 'business', businessId: 'b1', amountMinor: 30000, frequency: 'monthly',
    startDate: '2026-11-01', endDate: null, categoryId: null, description: '', active: true, createdAt: ts, updatedAt: ts, ...over,
  })
  it('crea un pago fijo válido y rechaza importe cero, cuenta ajena al ámbito o fin anterior al inicio', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/recurring/r1'), recurring()))
    await assertFails(setDoc(doc(A(), 'users/userA/recurring/r2'), recurring({ amountMinor: 0 })))
    await assertFails(setDoc(doc(A(), 'users/userA/recurring/r3'), recurring({ accountId: 'pers' })))
    await assertFails(setDoc(doc(A(), 'users/userA/recurring/r4'), recurring({ endDate: '2026-10-01' })))
    await assertFails(setDoc(doc(A(), 'users/userA/recurring/r5'), recurring({ frequency: 'daily' })))
  })
  it('otro usuario no accede y un pago fijo no se borra', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/recurring/r1'), recurring()))
    await assertFails(getDoc(doc(B(), 'users/userA/recurring/r1')))
    await assertFails(deleteDoc(doc(A(), 'users/userA/recurring/r1')))
    await assertSucceeds(updateDoc(doc(A(), 'users/userA/recurring/r1'), { active: false, updatedAt: serverTimestamp() }))
  })
  it('un movimiento planificado puede nacer de un pago fijo (recurringId opcional)', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/transactions/rec_r1_2026-11-01'), tx({ type: 'expense', status: 'planned', date: '2026-11-01', recurringId: 'r1' })))
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/rec_r1_2026-12-01'), tx({ type: 'expense', status: 'planned', date: '2026-12-01', recurringId: 123 })))
  })
  it('las tareas se crean y se pueden eliminar solo por su dueño', async () => {
    const task = { title: 'Pagar impuestos', dueDate: '2026-11-15', businessId: null, notes: '', done: false, createdAt: ts, updatedAt: ts }
    await assertSucceeds(setDoc(doc(A(), 'users/userA/tasks/k1'), task))
    await assertFails(setDoc(doc(B(), 'users/userA/tasks/k2'), task))
    await assertFails(setDoc(doc(A(), 'users/userA/tasks/k3'), { ...task, title: 'x' }))
    await assertFails(deleteDoc(doc(B(), 'users/userA/tasks/k1')))
    await assertSucceeds(deleteDoc(doc(A(), 'users/userA/tasks/k1')))
  })
})

describe('trading y reparto', () => {
  it('acepta un retiro de trading en una cuenta y rechaza importes inválidos', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/transactions/tw1'), tx({ type: 'trading_withdrawal', amountMinor: 80000 })))
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/tw2'), tx({ type: 'trading_withdrawal', amountMinor: 0 })))
  })
  it('el reparto de un negocio es opcional, pero si existe debe sumar 100 %', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/businesses/b5'), { ...business(), allocation: { reserveBps: 2000, reinvestBps: 3000, ownerBps: 5000 } }))
    await assertSucceeds(setDoc(doc(A(), 'users/userA/businesses/b6'), { ...business(), allocation: null }))
    await assertFails(setDoc(doc(A(), 'users/userA/businesses/b7'), { ...business(), allocation: { reserveBps: 2000, reinvestBps: 3000, ownerBps: 4000 } }))
    await assertFails(setDoc(doc(A(), 'users/userA/businesses/b8'), { ...business(), allocation: { reserveBps: -1000, reinvestBps: 6000, ownerBps: 5000 } }))
  })
})

describe('productos y ventas', () => {
  const product = (over: object = {}) => ({ name: 'Camisa', sku: 'C1', businessId: 'b1', unitPriceMinor: 2500, unitCostMinor: 1000, active: true, createdAt: ts, updatedAt: ts, ...over })
  const sale = (over: object = {}) => ({
    businessId: 'b1', accountId: 'acc1', date: '2026-10-05', customer: '', lines: [{ productId: null, name: 'Camisa', quantity: 2, unitPriceMinor: 2500, unitCostMinor: 1000 }],
    discountMinor: 0, taxEnabled: false, taxLabel: '', taxRateBps: 0, pricesIncludeTax: false, netMinor: 5000, taxMinor: 0, totalMinor: 5000, costMinor: 2000, units: 2,
    categoryId: null, notes: '', createdAt: ts, ...over,
  })
  it('crea productos válidos; el costo puede ser desconocido; otro usuario no accede', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/products/p1'), product()))
    await assertSucceeds(setDoc(doc(A(), 'users/userA/products/p2'), product({ unitCostMinor: null })))
    await assertFails(setDoc(doc(A(), 'users/userA/products/p3'), product({ unitPriceMinor: -1 })))
    await assertFails(setDoc(doc(A(), 'users/userA/products/p4'), product({ businessId: 'no-existe' })))
    await assertFails(getDoc(doc(B(), 'users/userA/products/p1')))
    await assertFails(deleteDoc(doc(A(), 'users/userA/products/p1')))
  })
  it('un producto no cambia de negocio', async () => {
    await setDoc(doc(A(), 'users/userA/products/p1'), product())
    await assertFails(updateDoc(doc(A(), 'users/userA/products/p1'), { businessId: 'otro', updatedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(doc(A(), 'users/userA/products/p1'), { active: false, updatedAt: serverTimestamp() }))
  })
  it('crea una venta con sus movimientos en un solo lote', async () => {
    const db = A()
    const b = writeBatch(db)
    b.set(doc(db, 'users/userA/sales/S1'), sale({ taxEnabled: true, taxLabel: 'IVA', taxRateBps: 1300, netMinor: 5000, taxMinor: 650, totalMinor: 5650 }))
    b.set(doc(db, 'users/userA/transactions/sale_S1_income'), tx({ type: 'income', amountMinor: 5000, saleId: 'S1' }))
    b.set(doc(db, 'users/userA/transactions/sale_S1_tax'), tx({ type: 'tax_collected', amountMinor: 650, saleId: 'S1' }))
    await assertSucceeds(b.commit())
  })
  it('rechaza ventas cuyo total no cuadra, sin productos o con cuenta de otro negocio', async () => {
    await assertFails(setDoc(doc(A(), 'users/userA/sales/S2'), sale({ totalMinor: 9999 })))
    await assertFails(setDoc(doc(A(), 'users/userA/sales/S3'), sale({ lines: [] })))
    await assertFails(setDoc(doc(A(), 'users/userA/sales/S4'), sale({ businessId: 'otro' })))
    await assertFails(setDoc(doc(B(), 'users/userA/sales/S5'), sale()))
  })
  it('una venta no se edita ni se borra', async () => {
    await setDoc(doc(A(), 'users/userA/sales/S6'), sale())
    await assertFails(updateDoc(doc(A(), 'users/userA/sales/S6'), { netMinor: 1 }))
    await assertFails(deleteDoc(doc(A(), 'users/userA/sales/S6')))
  })
  it('el impuesto cobrado solo existe en cuentas de negocio', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/transactions/tc1'), tx({ type: 'tax_collected', amountMinor: 650 })))
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/tc2'), tx({ type: 'tax_collected', scope: 'personal', businessId: null, accountId: 'pers' })))
  })
})

describe('stock, cierres y metas', () => {
  const move = (over: object = {}) => ({ productId: 'p1', businessId: 'b1', date: '2026-10-05', kind: 'purchase', quantity: 50, totalCostMinor: 40000, saleId: null, txId: 'inv_M1_pay', supplier: '', note: '', createdAt: ts, ...over })
  it('crea movimientos de stock válidos y rechaza cantidades inconsistentes', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/inventoryMoves/M1'), move()))
    await assertFails(setDoc(doc(A(), 'users/userA/inventoryMoves/M2'), move({ quantity: 0 })))
    await assertFails(setDoc(doc(A(), 'users/userA/inventoryMoves/M3'), move({ kind: 'purchase', quantity: -5 })))
    await assertFails(setDoc(doc(A(), 'users/userA/inventoryMoves/M4'), move({ kind: 'sale', quantity: -2, saleId: null })))
    await assertSucceeds(setDoc(doc(A(), 'users/userA/inventoryMoves/M5'), move({ kind: 'sale', quantity: -2, saleId: 'S1', txId: null })))
    await assertFails(setDoc(doc(A(), 'users/userA/inventoryMoves/M6'), move({ kind: 'invento' })))
    await assertFails(setDoc(doc(B(), 'users/userA/inventoryMoves/M7'), move()))
  })
  it('el stock es un historial: no se edita ni se borra', async () => {
    await setDoc(doc(A(), 'users/userA/inventoryMoves/M8'), move())
    await assertFails(updateDoc(doc(A(), 'users/userA/inventoryMoves/M8'), { quantity: 1 }))
    await assertFails(deleteDoc(doc(A(), 'users/userA/inventoryMoves/M8')))
  })
  it('una compra de mercancía es un movimiento de negocio y no de cuentas personales', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/transactions/inv_M1_pay'), tx({ type: 'inventory_purchase', amountMinor: 40000 })))
    await assertFails(setDoc(doc(A(), 'users/userA/transactions/inv_M2_pay'), tx({ type: 'inventory_purchase', scope: 'personal', businessId: null, accountId: 'pers' })))
  })
  const closing = (over: object = {}) => ({
    businessId: 'b1', month: '2026-09', from: '2026-09-01', to: '2026-09-30', netIncomeMinor: 100000, expensesMinor: 20000, cogsMinor: 0, baseMinor: 80000, cashNowMinor: 200000,
    minReserveMinor: 10000, upcomingMinor: 0, surplusMinor: 190000, allocatableMinor: 80000, ownerMinor: 40000, reinvestMinor: 24000, reserveMinor: 16000, heldBackMinor: 0,
    policy: { reserveBps: 2000, reinvestBps: 3000, ownerBps: 5000 }, note: '', createdAt: ts, ...over,
  })
  it('un cierre válido se guarda una sola vez por negocio y mes, y es inmutable', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/closings/b1_2026-09'), closing()))
    await assertFails(setDoc(doc(A(), 'users/userA/closings/otro_id'), closing()))
    await assertFails(updateDoc(doc(A(), 'users/userA/closings/b1_2026-09'), { ownerMinor: 1 }))
    await assertFails(deleteDoc(doc(A(), 'users/userA/closings/b1_2026-09')))
  })
  it('un cierre cuyo reparto no suma lo repartible se rechaza', async () => {
    await assertFails(setDoc(doc(A(), 'users/userA/closings/b1_2026-09'), closing({ ownerMinor: 50000 })))
    await assertFails(setDoc(doc(A(), 'users/userA/closings/b1_2026-09'), closing({ allocatableMinor: 90000, ownerMinor: 45000, reinvestMinor: 27000, reserveMinor: 18000 })))
    await assertFails(setDoc(doc(B(), 'users/userA/closings/b1_2026-09'), closing()))
  })
  const goal = (over: object = {}) => ({ name: 'Colchón', kind: 'cash', businessId: null, targetMinor: 500000, targetDate: null, active: true, createdAt: ts, updatedAt: ts, ...over })
  it('metas válidas; no se borran, se archivan', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/goals/g1'), goal()))
    await assertFails(setDoc(doc(A(), 'users/userA/goals/g2'), goal({ targetMinor: 0 })))
    await assertFails(setDoc(doc(A(), 'users/userA/goals/g3'), goal({ kind: 'sueños' })))
    await assertSucceeds(updateDoc(doc(A(), 'users/userA/goals/g1'), { active: false, updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(doc(A(), 'users/userA/goals/g1')))
  })
  it('un producto puede controlar stock con aviso de reposición', async () => {
    await assertSucceeds(setDoc(doc(A(), 'users/userA/products/ps1'), { name: 'Camisa', sku: '', businessId: 'b1', unitPriceMinor: 2500, unitCostMinor: null, active: true, trackStock: true, reorderPoint: 5, createdAt: ts, updatedAt: ts }))
    await assertFails(setDoc(doc(A(), 'users/userA/products/ps2'), { name: 'Camisa', sku: '', businessId: 'b1', unitPriceMinor: 2500, unitCostMinor: null, active: true, trackStock: 'si', reorderPoint: 5, createdAt: ts, updatedAt: ts }))
  })
})

