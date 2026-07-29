export type Plan = 'free' | 'leads' | 'pro';

const PLAN_RANK: Record<Plan, number> = { free: 0, leads: 1, pro: 2 };

export function hasAccess(
  currentPlan: Plan | string | null | undefined,
  requiredPlan: Plan,
  subscriptionStatus?: string | null,
): boolean {
  if (subscriptionStatus && !['active', 'trialing'].includes(subscriptionStatus)) {
    return requiredPlan === 'free';
  }
  const rank = PLAN_RANK[(currentPlan ?? 'free') as Plan] ?? 0;
  return rank >= PLAN_RANK[requiredPlan];
}
