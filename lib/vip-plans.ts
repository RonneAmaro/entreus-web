export type VipPlanKey = 'vip_30d' | 'vip_90d' | 'vip_365d'

export type VipPurchasePlan = {
  planKey: VipPlanKey
  label: string
  days: number
  amountBrlCents: number
  featured?: boolean
}

// Placeholder prices for VIP Base 2. Keep these centralized so production pricing
// can be changed without hunting through UI and API code.
export const VIP_PRICE_VERSION = '2026-08-vip'

export const VIP_PURCHASE_PLANS: VipPurchasePlan[] = [
  {
    planKey: 'vip_30d',
    label: 'VIP 30 dias',
    days: 30,
    amountBrlCents: 1990,
  },
  {
    planKey: 'vip_90d',
    label: 'VIP 90 dias',
    days: 90,
    amountBrlCents: 4990,
    featured: true,
  },
  {
    planKey: 'vip_365d',
    label: 'VIP 1 ano',
    days: 365,
    amountBrlCents: 14990,
  },
]

export function getVipPurchasePlan(planKey: string | null | undefined) {
  return VIP_PURCHASE_PLANS.find((plan) => plan.planKey === planKey) || null
}

export function getVipPlanSavings(plan: VipPurchasePlan) {
  const monthly = VIP_PURCHASE_PLANS[0].amountBrlCents
  const proportionalBrlCents = Math.round(monthly * (plan.days / 30))
  const savingsBrlCents = Math.max(0, proportionalBrlCents - plan.amountBrlCents)
  return {
    proportionalBrlCents,
    savingsBrlCents,
    savingsPercent: proportionalBrlCents ? Math.round((savingsBrlCents / proportionalBrlCents) * 100) : 0,
    monthlyEquivalentBrlCents: Math.round(plan.amountBrlCents / (plan.days / 30)),
  }
}
