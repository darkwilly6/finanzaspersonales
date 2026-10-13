import {
  collection, doc, runTransaction, serverTimestamp, writeBatch, type DocumentReference,
} from 'firebase/firestore'
import { requireDb } from './firebase'
import type { ClosingDoc, GoalDoc, ProductDoc, AccountDoc, BusinessDoc, CategoryDoc, Recurring, RecurringDoc, TaskDoc, Transaction, TransactionDoc, TransactionStatus } from '../domain/types/ledger'
import { plannedId } from '../domain/calculations/recurrence'
import type { BuiltSale } from '../domain/validation/sales'
import type { BuiltInventory } from '../domain/validation/inventory'
import type { BuiltTx } from '../domain/validation/ledger'

/** Toda la información vive bajo users/{uid}/…; el uid sale de la sesión, nunca de un campo editable. */
const col = (uid: string, name: 'businesses' | 'accounts' | 'categories' | 'transactions' | 'recurring' | 'tasks' | 'products' | 'sales' | 'inventoryMoves' | 'closings' | 'goals' | 'auditLogs') =>
  collection(requireDb(), 'users', uid, name)

export const newId = (uid: string, name: 'businesses' | 'accounts' | 'categories' | 'transactions' | 'recurring' | 'tasks' | 'products' | 'sales' | 'inventoryMoves' | 'goals') => doc(col(uid, name)).id

type Writer = { set: (ref: DocumentReference, data: Record<string, unknown>) => unknown }

function audit(w: Writer, uid: string, action: string, entityType: string, entityId: string, summary: string) {
  w.set(doc(col(uid, 'auditLogs')), { action, entityType, entityId, summary: summary.slice(0, 200), createdAt: serverTimestamp() })
}

/** Crea un documento solo si no existe: reintentos y doble clic no duplican. */
async function createOnce(uid: string, name: 'businesses' | 'accounts' | 'categories' | 'recurring' | 'tasks' | 'products' | 'goals', id: string, data: object, summary: string) {
  const ref = doc(col(uid, name), id)
  return runTransaction(requireDb(), async (t) => {
    const snap = await t.get(ref)
    if (snap.exists()) return 'duplicate' as const
    t.set(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    audit(t, uid, 'create', name, id, summary)
    return 'created' as const
  })
}

async function updateDocWithAudit(uid: string, name: 'businesses' | 'accounts' | 'categories' | 'recurring' | 'tasks' | 'products' | 'goals', id: string, patch: Record<string, unknown>, action: string, summary: string) {
  const batch = writeBatch(requireDb())
  batch.update(doc(col(uid, name), id), { ...patch, updatedAt: serverTimestamp() })
  audit(batch, uid, action, name, id, summary)
  await batch.commit()
}

/* Negocios */
export const createBusiness = (uid: string, id: string, d: BusinessDoc) => createOnce(uid, 'businesses', id, d, `Negocio creado: ${d.name}`)
export const updateBusiness = (uid: string, id: string, d: BusinessDoc) =>
  updateDocWithAudit(uid, 'businesses', id, { ...d }, 'update', `Negocio editado: ${d.name}`)
export const setBusinessStatus = (uid: string, id: string, name: string, status: 'active' | 'archived') =>
  updateDocWithAudit(uid, 'businesses', id, { status }, status === 'archived' ? 'archive' : 'restore', `Negocio ${status === 'archived' ? 'archivado' : 'reactivado'}: ${name}`)

/* Cuentas */
export const createAccount = (uid: string, id: string, d: AccountDoc) => createOnce(uid, 'accounts', id, d, `Cuenta creada: ${d.name}`)
export const updateAccount = (uid: string, id: string, d: AccountDoc) =>
  updateDocWithAudit(uid, 'accounts', id, { ...d }, 'update', `Cuenta editada: ${d.name}`)
export const setAccountStatus = (uid: string, id: string, name: string, status: 'active' | 'archived') =>
  updateDocWithAudit(uid, 'accounts', id, { status }, status === 'archived' ? 'archive' : 'restore', `Cuenta ${status === 'archived' ? 'archivada' : 'reactivada'}: ${name}`)

/* Categorías */
export const createCategory = (uid: string, id: string, d: CategoryDoc) => createOnce(uid, 'categories', id, d, `Categoría creada: ${d.name}`)
export const updateCategory = (uid: string, id: string, d: CategoryDoc) =>
  updateDocWithAudit(uid, 'categories', id, { ...d }, 'update', `Categoría editada: ${d.name}`)
export async function createCategoriesBatch(uid: string, items: CategoryDoc[]) {
  const batch = writeBatch(requireDb())
  for (const d of items) {
    const ref = doc(col(uid, 'categories'))
    batch.set(ref, { ...d, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  }
  audit(batch, uid, 'create', 'categories', 'batch', `Categorías sugeridas creadas: ${items.length}`)
  await batch.commit()
}

/* Movimientos */
export async function createTransactions(uid: string, built: BuiltTx[]) {
  const first = built[0]
  if (!first) throw new Error('Sin movimientos que crear.')
  const refs = built.map((b) => doc(col(uid, 'transactions'), b.id))
  return runTransaction(requireDb(), async (t) => {
    const snap = await t.get(refs[0]!)
    if (snap.exists()) return 'duplicate' as const
    built.forEach((b, i) => t.set(refs[i]!, { ...b.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    audit(t, uid, 'create', 'transactions', first.id, `Movimiento creado (${first.data.type}, ${first.data.amountMinor} centavos)`)
    return 'created' as const
  })
}

/** Edita movimientos no confirmados (planificados o pendientes). createdAt nunca cambia. */
export async function updateTransactions(uid: string, built: BuiltTx[]) {
  const batch = writeBatch(requireDb())
  for (const b of built) batch.update(doc(col(uid, 'transactions'), b.id), { ...b.data, updatedAt: serverTimestamp() })
  audit(batch, uid, 'update', 'transactions', built[0]!.id, `Movimiento editado (${built[0]!.data.type})`)
  await batch.commit()
}

export async function setTransactionsStatus(uid: string, txs: Pick<Transaction, 'id' | 'type'>[], status: Extract<TransactionStatus, 'confirmed'>) {
  const batch = writeBatch(requireDb())
  for (const t of txs) batch.update(doc(col(uid, 'transactions'), t.id), { status, updatedAt: serverTimestamp() })
  audit(batch, uid, 'confirm', 'transactions', txs[0]!.id, `Movimiento confirmado (${txs[0]!.type})`)
  await batch.commit()
}

/** Anula (no borra): el historial se conserva. Una transferencia se anula completa, ambos lados a la vez. */
export async function voidTransactions(uid: string, txs: Pick<Transaction, 'id' | 'type'>[], reason: string) {
  const batch = writeBatch(requireDb())
  for (const t of txs) batch.update(doc(col(uid, 'transactions'), t.id), { status: 'cancelled', voidedAt: serverTimestamp(), voidReason: reason.trim(), updatedAt: serverTimestamp() })
  audit(batch, uid, 'void', 'transactions', txs[0]!.id, `Movimiento anulado (${txs[0]!.type}): ${reason.trim()}`)
  await batch.commit()
}

/* Pagos fijos */
export const createRecurring = (uid: string, id: string, d: RecurringDoc) => createOnce(uid, 'recurring', id, d, `Pago fijo creado: ${d.name}`)
export const updateRecurring = (uid: string, id: string, d: RecurringDoc) =>
  updateDocWithAudit(uid, 'recurring', id, { ...d }, 'update', `Pago fijo editado: ${d.name}`)
export const setRecurringActive = (uid: string, id: string, name: string, active: boolean) =>
  updateDocWithAudit(uid, 'recurring', id, { active }, active ? 'restore' : 'archive', `Pago fijo ${active ? 'reactivado' : 'pausado'}: ${name}`)

/**
 * Crea los movimientos PLANIFICADOS de un pago fijo para las fechas dadas.
 * Id determinista (rec_{pago}_{fecha}) + "solo si no existe": regenerar nunca duplica ni pisa ediciones.
 */
export async function generatePlanned(uid: string, r: Recurring, dates: string[]): Promise<number> {
  let created = 0
  const CHUNK = 20
  for (let i = 0; i < dates.length; i += CHUNK) {
    const part = dates.slice(i, i + CHUNK)
    created += await runTransaction(requireDb(), async (t) => {
      const refs = part.map((d) => doc(col(uid, 'transactions'), plannedId(r.id, d)))
      const snaps = await Promise.all(refs.map((ref) => t.get(ref)))
      let n = 0
      snaps.forEach((snap, k) => {
        if (snap.exists()) return
        const data: TransactionDoc = {
          type: r.type, scope: r.scope, businessId: r.businessId, accountId: r.accountId, counterpartAccountId: null, transferId: null,
          transferPurpose: null, direction: null, date: part[k]!, amountMinor: r.amountMinor, currency: 'USD', categoryId: r.categoryId,
          status: 'planned', description: r.name, counterparty: '', voidedAt: null, voidReason: null, recurringId: r.id,
        }
        t.set(refs[k]!, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
        n++
      })
      if (n > 0) audit(t, uid, 'create', 'transactions', plannedId(r.id, part[0]!), `Planificados generados desde pago fijo: ${r.name} (${n})`)
      return n
    })
  }
  return created
}

/* Tareas */
export const createTask = (uid: string, id: string, d: TaskDoc) => createOnce(uid, 'tasks', id, d, `Tarea creada: ${d.title}`)
export const updateTask = (uid: string, id: string, d: TaskDoc) => updateDocWithAudit(uid, 'tasks', id, { ...d }, 'update', `Tarea editada: ${d.title}`)
export const setTaskDone = (uid: string, id: string, title: string, done: boolean) =>
  updateDocWithAudit(uid, 'tasks', id, { done }, 'update', `Tarea ${done ? 'completada' : 'reabierta'}: ${title}`)
export async function deleteTask(uid: string, id: string, title: string) {
  const batch = writeBatch(requireDb())
  batch.delete(doc(col(uid, 'tasks'), id))
  audit(batch, uid, 'delete', 'tasks', id, `Tarea eliminada: ${title}`)
  await batch.commit()
}

/* Productos */
export const createProduct = (uid: string, id: string, d: ProductDoc) => createOnce(uid, 'products', id, d, `Producto creado: ${d.name}`)
export const updateProduct = (uid: string, id: string, d: ProductDoc) => updateDocWithAudit(uid, 'products', id, { ...d }, 'update', `Producto editado: ${d.name}`)
export const setProductActive = (uid: string, id: string, name: string, active: boolean) =>
  updateDocWithAudit(uid, 'products', id, { active }, active ? 'restore' : 'archive', `Producto ${active ? 'reactivado' : 'desactivado'}: ${name}`)

/**
 * Registra una venta de forma atómica: el registro de la venta + su ingreso (+ el impuesto cobrado, si hay).
 * Ids deterministas y "solo si no existe": doble clic o reintento no duplican la venta.
 */
export async function createSale(uid: string, built: BuiltSale): Promise<'created' | 'duplicate'> {
  const saleRef = doc(col(uid, 'sales'), built.saleId)
  const txRefs = built.txs.map((t) => doc(col(uid, 'transactions'), t.id))
  return runTransaction(requireDb(), async (t) => {
    const snap = await t.get(saleRef)
    if (snap.exists()) return 'duplicate' as const
    t.set(saleRef, { ...built.sale, createdAt: serverTimestamp() })
    built.txs.forEach((b, i) => t.set(txRefs[i]!, { ...b.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }))
    for (const m of built.moves) t.set(doc(col(uid, 'inventoryMoves'), m.id), { ...m.data, createdAt: serverTimestamp() })
    audit(t, uid, 'create', 'sales', built.saleId, `Venta registrada (${built.sale.units} unidades, ${built.sale.totalMinor} centavos)`)
    return 'created' as const
  })
}

/** Movimiento de stock (+ su movimiento de dinero si es compra o reembolso), atómico e idempotente. */
export async function createInventoryMove(uid: string, built: BuiltInventory): Promise<'created' | 'duplicate'> {
  const moveRef = doc(col(uid, 'inventoryMoves'), built.move.id)
  const txRef = built.tx ? doc(col(uid, 'transactions'), built.tx.id) : null
  return runTransaction(requireDb(), async (t) => {
    const snap = await t.get(moveRef)
    if (snap.exists()) return 'duplicate' as const
    t.set(moveRef, { ...built.move.data, createdAt: serverTimestamp() })
    if (txRef && built.tx) t.set(txRef, { ...built.tx.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
    audit(t, uid, 'create', 'inventoryMoves', built.move.id, `Stock: ${built.move.data.kind} (${built.move.data.quantity} unidades)`)
    return 'created' as const
  })
}

/** Guarda el cierre de un mes. Un solo cierre por negocio y mes; es un registro inmutable. */
export async function createClosing(uid: string, id: string, d: ClosingDoc): Promise<'created' | 'duplicate'> {
  const ref = doc(col(uid, 'closings'), id)
  return runTransaction(requireDb(), async (t) => {
    const snap = await t.get(ref)
    if (snap.exists()) return 'duplicate' as const
    t.set(ref, { ...d, createdAt: serverTimestamp() })
    audit(t, uid, 'create', 'closings', id, `Cierre guardado: ${d.month}`)
    return 'created' as const
  })
}

/* Metas */
export const createGoal = (uid: string, id: string, d: GoalDoc) => createOnce(uid, 'goals', id, d, `Meta creada: ${d.name}`)
export const updateGoal = (uid: string, id: string, d: GoalDoc) => updateDocWithAudit(uid, 'goals', id, { ...d }, 'update', `Meta editada: ${d.name}`)
