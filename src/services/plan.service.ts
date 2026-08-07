import { env } from '../config/env.js';
import {
  PLAN_CATALOG,
  isBillingInterval,
  isPlanSlug,
  type BillingInterval,
} from '../constants/plans.js';
import PlanModel, { type IPlan } from '../models/plan.model.js';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';
import { logger } from '../utils/logger.js';

function stripeIdsForSlug(slug: string): {
  stripePriceId: string | null;
  stripeYearlyPriceId: string | null;
  stripeProductId: string | null;
} {
  if (slug === 'pro') {
    return {
      stripePriceId: env.STRIPE.STRIPE_PRO_PRICE_ID,
      stripeYearlyPriceId: env.STRIPE.STRIPE_PRO_YEARLY_PRICE_ID,
      stripeProductId: env.STRIPE.STRIPE_PRO_PRODUCT_ID || null,
    };
  }
  if (slug === 'premium') {
    return {
      stripePriceId: env.STRIPE.STRIPE_PREMIUM_PRICE_ID,
      stripeYearlyPriceId: env.STRIPE.STRIPE_PREMIUM_YEARLY_PRICE_ID,
      stripeProductId: env.STRIPE.STRIPE_PREMIUM_PRODUCT_ID || null,
    };
  }
  return {
    stripePriceId: null,
    stripeYearlyPriceId: null,
    stripeProductId: null,
  };
}

export class PlanService {
  /** Upsert Free / Pro / Premium from catalog + env price IDs. */
  async seedPlans(): Promise<void> {
    for (const plan of PLAN_CATALOG) {
      const ids = stripeIdsForSlug(plan.slug);
      await PlanModel.findOneAndUpdate(
        { slug: plan.slug },
        {
          $set: {
            name: plan.name,
            slug: plan.slug,
            monthlyPrice: plan.monthlyPrice,
            yearlyPrice: plan.yearlyPrice,
            currency: plan.currency,
            features: [...plan.features],
            isTrialAvailable: plan.isTrialAvailable,
            trialDays: plan.trialDays,
            isActive: true,
            stripePriceId: ids.stripePriceId,
            stripeYearlyPriceId: ids.stripeYearlyPriceId,
            stripeProductId: ids.stripeProductId,
          },
          $unset: { billingInterval: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }

    logger.info('Subscription plans seeded', {
      plans: PLAN_CATALOG.map((p) => p.slug),
    });
  }

  async listActive() {
    return PlanModel.find({ isActive: true }).sort({ monthlyPrice: 1 }).lean();
  }

  async getById(id: string) {
    const plan = await PlanModel.findById(id).lean();
    if (!plan || !plan.isActive) {
      throw ApiError.notFound(MESSAGES.PLAN_NOT_FOUND);
    }
    return plan;
  }

  async getBySlug(slug: string) {
    if (!isPlanSlug(slug)) {
      throw ApiError.notFound(MESSAGES.PLAN_NOT_FOUND);
    }

    const plan = await PlanModel.findOne({ slug, isActive: true }).lean();
    if (!plan) {
      throw ApiError.notFound(MESSAGES.PLAN_NOT_FOUND);
    }
    return plan;
  }

  async getByStripePriceId(priceId: string) {
    return PlanModel.findOne({
      isActive: true,
      $or: [{ stripePriceId: priceId }, { stripeYearlyPriceId: priceId }],
    }).lean();
  }

  resolvePriceId(
    plan: Pick<IPlan, 'slug' | 'stripePriceId' | 'stripeYearlyPriceId'>,
    interval: BillingInterval,
  ): string {
    if (plan.slug === 'free') {
      throw ApiError.badRequest('Free plan has no Stripe price');
    }

    const priceId =
      interval === 'year' ? plan.stripeYearlyPriceId : plan.stripePriceId;

    if (!priceId) {
      throw ApiError.badRequest(
        `Plan is missing a Stripe ${interval}ly price configuration`,
      );
    }

    return priceId;
  }

  intervalForPriceId(
    plan: Pick<IPlan, 'stripePriceId' | 'stripeYearlyPriceId'>,
    priceId: string | null,
  ): BillingInterval | null {
    if (!priceId) return null;
    if (plan.stripeYearlyPriceId && plan.stripeYearlyPriceId === priceId) {
      return 'year';
    }
    if (plan.stripePriceId && plan.stripePriceId === priceId) {
      return 'month';
    }
    return null;
  }

  toPublic(plan: {
    _id: { toString(): string };
    name: string;
    slug: string;
    monthlyPrice: number;
    yearlyPrice: number;
    currency: string;
    features: string[];
    isTrialAvailable: boolean;
    trialDays: number;
    stripePriceId?: string | null;
    stripeYearlyPriceId?: string | null;
  }) {
    const intervals: BillingInterval[] = [];
    if (plan.slug === 'free') {
      // Free has no billing cycle
    } else {
      if (plan.stripePriceId) intervals.push('month');
      if (plan.stripeYearlyPriceId) intervals.push('year');
      if (intervals.length === 0) {
        intervals.push('month', 'year');
      }
    }

    return {
      id: plan._id.toString(),
      name: plan.name,
      slug: plan.slug,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      currency: plan.currency,
      features: plan.features,
      isTrialAvailable: plan.isTrialAvailable,
      trialDays: plan.trialDays,
      availableIntervals: intervals,
      // cents → display dollars
      monthlyPriceDisplay: plan.monthlyPrice / 100,
      yearlyPriceDisplay: plan.yearlyPrice / 100,
      // backward-compatible alias
      priceDisplay: plan.monthlyPrice / 100,
      billingInterval: intervals.includes('month') ? 'month' : intervals[0] ?? 'month',
    };
  }
}

export const planService = new PlanService();

/** @deprecated use isBillingInterval from constants */
export { isBillingInterval };
