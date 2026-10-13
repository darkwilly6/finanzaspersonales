import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { collection, limit, onSnapshot, orderBy, query, type DocumentData, type Timestamp } from 'firebase/firestore'
import { requireDb } from '../../lib/firebase'
import { useAuth } from '../auth/AuthContext'
import type { Account, Business, Category, Closing, Goal, InventoryMove, Product, Recurring, Sale, Task, Transaction } from '../../domain/types/ledger'
import { computeBalances, type AccountBalance } from '../../domain/calculations/transactionRules'
import { stockByProduct, type StockState } from '../../domain/calculations/inventory'
import { saleStatus } from '../../domain/calculations/sales'
import { todayIn } from '../../domain/calculations/dates'
import { humanizeFirebaseError } from '../../lib/errors'

/** Máximo de movimientos cargados. Si se supera, se avisa: los saldos podrían quedar incompletos. */
export const TX_LIMIT = 5000
export const SALES_LIMIT = 3000

interface LedgerState {
  loading: boolean
  error: string | null
  businesses: Business[]
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  recurring: Recurring[]
  tasks: Task[]
  products: Product[]
  sales: Sale[]
  inventoryMoves: InventoryMove[]
  closings: Closing[]
  goals: Goal[]
  /** Stock actual por producto (movimientos anulados no cuentan). */
  stock: Map<string, StockState>
  /** Ventas anuladas: su ingreso, costo y stock dejan de contar. */
  cancelledSaleIds: Set<string>
  truncated: boolean
  balances: Map<string, AccountBalance>
  today: string
  timezone: string
}

const Ctx = createContext<LedgerState | null>(null)

const toDate = (v: unknown): Date | null => (v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate() : null)

export function LedgerData({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const uid = user?.uid
  const timezone = profile?.preferences.timezone ?? 'America/El_Salvador'
  const [businesses, setBusinesses] = useState<Business[] | null>(null)
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [recurring, setRecurring] = useState<Recurring[] | null>(null)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [products, setProducts] = useState<Product[] | null>(null)
  const [sales, setSales] = useState<Sale[] | null>(null)
  const [moves, setMoves] = useState<InventoryMove[] | null>(null)
  const [closings, setClosings] = useState<Closing[] | null>(null)
  const [goals, setGoals] = useState<Goal[] | null>(null)
  const [salesTruncated, setSalesTruncated] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [today, setToday] = useState(() => todayIn(timezone))

  useEffect(() => {
    setToday(todayIn(timezone))
    const id = window.setInterval(() => setToday(todayIn(timezone)), 60_000)
    return () => window.clearInterval(id)
  }, [timezone])

  useEffect(() => {
    if (!uid) return
    const db = requireDb()
    const onErr = (e: unknown) => setError(humanizeFirebaseError(e))
    const base = (name: string) => collection(db, 'users', uid, name)
    const withId = <T,>(d: { id: string; data: () => DocumentData }) => ({ id: d.id, ...d.data() }) as T

    const unsubs = [
      onSnapshot(query(base('businesses'), orderBy('name')), (s) => setBusinesses(s.docs.map((d) => withId<Business>(d))), onErr),
      onSnapshot(query(base('accounts'), orderBy('name')), (s) => setAccounts(s.docs.map((d) => withId<Account>(d))), onErr),
      onSnapshot(query(base('categories'), orderBy('name')), (s) => setCategories(s.docs.map((d) => withId<Category>(d))), onErr),
      onSnapshot(query(base('recurring'), orderBy('name')), (s) => setRecurring(s.docs.map((d) => withId<Recurring>(d))), onErr),
      onSnapshot(query(base('tasks'), orderBy('createdAt', 'desc')), (s) => setTasks(s.docs.map((d) => withId<Task>(d))), onErr),
      onSnapshot(query(base('inventoryMoves'), orderBy('date', 'desc'), limit(SALES_LIMIT)), (s) => setMoves(s.docs.map((d) => { const data = d.data(); return { id: d.id, ...data, createdAt: toDate(data.createdAt) } as InventoryMove })), onErr),
      onSnapshot(query(base('closings'), orderBy('month', 'desc')), (s) => setClosings(s.docs.map((d) => { const data = d.data(); return { id: d.id, ...data, createdAt: toDate(data.createdAt) } as Closing })), onErr),
      onSnapshot(query(base('goals'), orderBy('name')), (s) => setGoals(s.docs.map((d) => withId<Goal>(d))), onErr),
      onSnapshot(query(base('products'), orderBy('name')), (s) => setProducts(s.docs.map((d) => withId<Product>(d))), onErr),
      onSnapshot(
        query(base('sales'), orderBy('date', 'desc'), limit(SALES_LIMIT + 1)),
        (s) => {
          setSalesTruncated(s.size > SALES_LIMIT)
          setSales(s.docs.slice(0, SALES_LIMIT).map((d) => { const data = d.data(); return { id: d.id, ...data, createdAt: toDate(data.createdAt) } as Sale }))
        },
        onErr,
      ),
      onSnapshot(
        query(base('transactions'), orderBy('date', 'desc'), limit(TX_LIMIT + 1)),
        (s) => {
          setTruncated(s.size > TX_LIMIT)
          setTransactions(
            s.docs.slice(0, TX_LIMIT).map((d) => {
              const data = d.data()
              return { id: d.id, ...data, createdAt: toDate(data.createdAt), updatedAt: toDate(data.updatedAt), voidedAt: toDate(data.voidedAt) } as Transaction
            }),
          )
        },
        onErr,
      ),
    ]
    return () => unsubs.forEach((u) => u())
  }, [uid])

  const value = useMemo<LedgerState>(() => {
    const acc = accounts ?? []
    const txs = transactions ?? []
    const bySale = new Map<string, Transaction[]>()
    const cancelledTx = new Set<string>()
    for (const t of txs) {
      if (t.status === 'cancelled') cancelledTx.add(t.id)
      if (t.saleId) bySale.set(t.saleId, [...(bySale.get(t.saleId) ?? []), t])
    }
    const cancelledSaleIds = new Set([...bySale.entries()].filter(([, list]) => saleStatus(list) === 'cancelled').map(([id]) => id))
    const stock = stockByProduct(moves ?? [], (m) => (m.saleId !== null && cancelledSaleIds.has(m.saleId)) || (m.txId !== null && cancelledTx.has(m.txId)))
    return {
      loading: !error && (businesses === null || accounts === null || categories === null || transactions === null || recurring === null || tasks === null || products === null || sales === null || moves === null || closings === null || goals === null),
      error,
      businesses: businesses ?? [],
      accounts: acc,
      categories: categories ?? [],
      transactions: txs,
      recurring: recurring ?? [],
      tasks: tasks ?? [],
      products: products ?? [],
      sales: sales ?? [],
      inventoryMoves: moves ?? [],
      closings: closings ?? [],
      goals: goals ?? [],
      stock,
      cancelledSaleIds,
      truncated: truncated || salesTruncated,
      balances: computeBalances(acc, txs),
      today,
      timezone,
    }
  }, [businesses, accounts, categories, transactions, recurring, tasks, products, sales, moves, closings, goals, truncated, salesTruncated, error, today, timezone])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLedger(): LedgerState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLedger debe usarse dentro de LedgerData')
  return v
}
