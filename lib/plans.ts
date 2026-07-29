export const PLANS = {
  free: {
    name:         'Free',
    price:        '$0',
    priceMonthly: 0,
    color:        'rgba(255,255,255,0.4)',
    features:     ['Basic profile', 'Browse job board', 'Limited visibility'],
  },
  leads: {
    name:         'Just Leads',
    price:        '$5/mo',
    priceMonthly: 5,
    badge:        'LEADS',
    badgeColor:   '#3B82F6',
    features:     ['Receive job leads', 'Quote on jobs', 'Full profile in search'],
  },
  pro: {
    name:         'Pro',
    price:        '$19/mo',
    priceMonthly: 19,
    badge:        'PRO',
    badgeColor:   '#FF6B2B',
    features:     ['Everything in Leads', 'Priority placement', 'Full analytics', 'Instant payouts'],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
