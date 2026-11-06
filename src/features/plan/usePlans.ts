import { useMemo } from 'react'
import { useLedger } from '../ledger/LedgerData'
import { computeAllocation, type AllocationResult } from '../../domain/calculations/allocation'
import { cogsFor, withCogs } from '../../domain/calculations/cogs'
import { monthKey } from '../../domain/calculations/dates'
import { forecastCash } from '../../domain/calculations/forecast'
import { nextPayout } from '../../domain/calculations/payout'
import { aggregatePlan, resolvePlan, splitPlan } from '../../domain/calculations/plan'
import { summarize, type LedgerSummary } from '../../domain/calculations/summary'
import type { Business, PlanBucket } from '../../domain/types/ledger'

export interface BusinessPlan {
  business: Business
  plan: PlanBucket[] | null
  summary: LedgerSummary
  cashNowMinor: number
  obligationsMinor: number
  allocation: AllocationResult
  parts: { bucket: PlanBucket; amountMinor: number }[]
  payout: ReturnType<typeof nextPayout>
  lastPayout: string | null
  mainAccountId: string
}

/** Plan de uso del dinero de cada negocio activo, con el mes en curso y el efectivo real. */
export function useBusinessPlans(): BusinessPlan[] {
  const { businesses, accounts, transactions, sales, cancelledSaleIds, recurring, balances, today } = useLedger()
  return useMemo(() => {
    const from = `${monthKey(today)}-01`
    return businesses
      .filter((b) => b.status === 'active')
      .map((business) => {
        const accs = accounts.filter((a) => a.businessId === business.id)
        const ids = new Set(accs.map((a) => a.id))
        const cashAccs = accs.filter((a) => a.status === 'active' && a.accountType !== 'investment')
        const mine = transactions.filter((t) => t.status !== 'cancelled' && ids.has(t.accountId))
        const summary = withCogs(
          summarize(mine.filter((t) => t.date >= from && t.date <= today), ids),
          cogsFor(sales, { cancelled: cancelledSaleIds, scopeAccountIds: ids, from, to: today }),
        )
        const cashNowMinor = cashAccs.reduce((s, a) => s + (balances.get(a.id)?.balanceMinor ?? 0), 0)
        const forecast = forecastCash({ accounts: cashAccs, balanceOf: (id) => balances.get(id)?.balanceMinor ?? 0, transactions, recurring, today, days: 30 })
        const plan = resolvePlan(business)
        const allocation = computeAllocation({
          baseMinor: summary.operatingResult,
          policy: plan ? aggregatePlan(plan) : null,
          cashNowMinor,
          minReserveMinor: business.reserve.minReserveMinor,
          upcomingOutflowsMinor: forecast.obligationsMinor,
        })
        const payouts = mine.filter((t) => t.status === 'confirmed' && (t.type === 'owner_withdrawal' || t.type === 'salary_payment' || (t.type === 'transfer' && t.direction === 'out' && (t.transferPurpose === 'owner_withdrawal' || t.transferPurpose === 'salary'))))
        const lastPayout = payouts.reduce<string | null>((m, t) => (m === null || t.date > m ? t.date : m), null)
        const mainAccountId = [...cashAccs].sort((a, b) => (balances.get(b.id)?.balanceMinor ?? 0) - (balances.get(a.id)?.balanceMinor ?? 0))[0]?.id ?? ''
        return {
          business,
          plan,
          summary,
          cashNowMinor,
          obligationsMinor: forecast.obligationsMinor,
          allocation,
          parts: plan ? splitPlan(allocation.reason === 'ok' ? allocation.allocatableMinor : 0, plan) : [],
          payout: nextPayout({ lastPayoutDate: lastPayout, frequency: business.payout.frequency, customDays: business.payout.customDays, today }),
          lastPayout,
          mainAccountId,
        }
      })
  }, [businesses, accounts, transactions, sales, cancelledSaleIds, recurring, balances, today])
}
