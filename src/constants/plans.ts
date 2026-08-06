export const PLAN_SLUGS = ['free', 'pro', 'premium'] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

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
    name: 'Premium',
    slug: 'premium' as const,
    monthlyPrice: 500,
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
] as const;

export function isPlanSlug(value: string): value is PlanSlug {
  return (PLAN_SLUGS as readonly string[]).includes(value);
}

export function isPaidPlan(slug: PlanSlug): boolean {
  return slug === 'pro' || slug === 'premium';
}
