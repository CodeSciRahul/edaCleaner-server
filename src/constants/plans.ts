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
 * Catalog prices are in cents.
 * Annual Pro $29 = 2900, Annual Premium $59 = 5900.
 * Monthly Pro $3 = 300, Monthly Premium $6 = 600.
 */
export const PLAN_CATALOG = [
  {
    name: 'Free',
    slug: 'free' as const,
    monthlyPrice: 0,
    currency: 'usd',
    billingInterval: 'month' as const,
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
    currency: 'usd',
    billingInterval: 'month' as const,
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
    name: 'Pro',
    slug: 'pro' as const,
    monthlyPrice: 2900,
    currency: 'usd',
    billingInterval: 'year' as const,
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
    monthlyPrice: 600,
    currency: 'usd',
    billingInterval: 'month' as const,
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
  {
    name: 'Premium',
    slug: 'premium' as const,
    monthlyPrice: 5900,
    currency: 'usd',
    billingInterval: 'year' as const,
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

/** Monthly catalog price in cents for a paid slug (used for annual savings). */
export function monthlyCatalogPriceCents(slug: PlanSlug): number {
  const monthly = PLAN_CATALOG.find(
    (p) => p.slug === slug && p.billingInterval === 'month',
  );
  return monthly?.monthlyPrice ?? 0;
}

export function annualCompareAtCents(slug: PlanSlug): number {
  return monthlyCatalogPriceCents(slug) * 12;
}

export function annualDiscountPercent(slug: PlanSlug, annualPriceCents: number): number {
  const compareAt = annualCompareAtCents(slug);
  if (compareAt <= 0 || annualPriceCents >= compareAt) return 0;
  return Math.round(((compareAt - annualPriceCents) / compareAt) * 100);
}
