import { PLAN_RANK, type PlanSlug } from './plans.js';

/**
 * Stable feature IDs mirrored from the desktop entitlement matrix.
 * Server APIs can authorize using these when protecting premium operations.
 */
export const FEATURE_IDS = [
  'smart_scan',
  'cleanup_basic',
  'cleanup_temp',
  'storage_overview',
  'large_files',
  'duplicates',
  'performance_boost',
  'startup_apps',
  'background_apps',
  'cleanup_reports',
  'live_monitor',
] as const;

export type FeatureId = (typeof FEATURE_IDS)[number];

export const FEATURE_MIN_PLAN: Record<FeatureId, PlanSlug> = {
  smart_scan: 'free',
  cleanup_basic: 'free',
  cleanup_temp: 'pro',
  storage_overview: 'pro',
  large_files: 'pro',
  duplicates: 'pro',
  performance_boost: 'premium',
  startup_apps: 'premium',
  background_apps: 'premium',
  cleanup_reports: 'premium',
  live_monitor: 'premium',
};

export function getEffectivePlan(
  currentPlan: PlanSlug,
  hasActiveAccess: boolean,
): PlanSlug {
  if (currentPlan === 'free') return 'free';
  if (!hasActiveAccess) return 'free';
  return currentPlan;
}

export function canAccessFeature(
  currentPlan: PlanSlug,
  feature: FeatureId,
  hasActiveAccess: boolean,
): boolean {
  const effective = getEffectivePlan(currentPlan, hasActiveAccess);
  return PLAN_RANK[effective] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}

export function listAccessibleFeatures(
  currentPlan: PlanSlug,
  hasActiveAccess: boolean,
): FeatureId[] {
  return FEATURE_IDS.filter((id) =>
    canAccessFeature(currentPlan, id, hasActiveAccess),
  );
}
