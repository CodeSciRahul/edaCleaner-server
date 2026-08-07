export const PLAN_SLUGS = ['free', 'pro', 'premium'] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

export const BILLING_INTERVALS = ['month', 'year'] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'past_due',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PLAN_RANK: Record<PlanSlug, number> = {
  free: 0,
  pro: 1,
  premium: 2,
};

/**
 * Catalog amounts are in cents.
 * Pro: $3/mo or $39/yr · Premium: $5/mo or $59/yr (matches marketing site).
 */
export const PLAN_CATALOG = [
  {
    name: 'Free',
    slug: 'free' as const,
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'usd',
    isTrialAvailable: false,
    trialDays: 0,
    features: [
      'Smart Scan',
      'One-click Cleanup',
      'Junk File Removal',
      'Browser Cache Cleaning',
      'System Cache Cleaning',
    ],
  },
  {
    name: 'Pro',
    slug: 'pro' as const,
    monthlyPrice: 300,
    yearlyPrice: 3900,
    currency: 'usd',
    isTrialAvailable: true,
    trialDays: 7,
    features: [
      'Everything in Free',
      'Storage Overview Dashboard',
      'Large File Finder',
      'Duplicate File Cleaner',
      'Temporary File Removal',
    ],
  },
  {
    name: 'Premium',
    slug: 'premium' as const,
    monthlyPrice: 500,
    yearlyPrice: 5900,
    currency: 'usd',
    isTrialAvailable: true,
    trialDays: 7,
    features: [
      'Everything in Pro',
      'Performance Boost',
      'Startup App Manager',
      'Background App Control',
      'Cleanup Reports',
      'Live System Monitor',
    ],
  },
] as const;

export function isPlanSlug(value: string): value is PlanSlug {
  return (PLAN_SLUGS as readonly string[]).includes(value);
}

export function isBillingInterval(value: string): value is BillingInterval {
  return (BILLING_INTERVALS as readonly string[]).includes(value);
}

export function isPaidPlan(slug: PlanSlug): boolean {
  return slug === 'pro' || slug === 'premium';
}

export function parseBillingInterval(
  value: unknown,
  fallback: BillingInterval = 'month',
): BillingInterval {
  if (typeof value === 'string' && isBillingInterval(value)) {
    return value;
  }
  return fallback;
}
