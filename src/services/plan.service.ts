import { env } from '../config/env.js';
import {
  PLAN_CATALOG,
  annualCompareAtCents,
  annualDiscountPercent,
  isBillingInterval,
  isPlanSlug,
  type BillingInterval,
} from '../constants/plans.js';
import PlanModel from '../models/plan.model.js';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';
import { logger } from '../utils/logger.js';

function stripeIdsForPlan(slug: string, billingInterval: BillingInterval): {
  stripePriceId: string | null;
  stripeProductId: string | null;
} {
  if (slug === 'pro' && billingInterval === 'month') {
    return {
      stripePriceId: env.STRIPE.STRIPE_PRO_PRICE_ID,
      stripeProductId: env.STRIPE.STRIPE_PRO_PRODUCT_ID || null,
    };
  }
  if (slug === 'pro' && billingInterval === 'year') {
    return {
      stripePriceId: env.STRIPE.STRIPE_PRO_YEARLY_PRICE_ID || null,
      stripeProductId: env.STRIPE.STRIPE_PRO_PRODUCT_ID || null,
    };
  }
  if (slug === 'premium' && billingInterval === 'month') {
    return {
      stripePriceId: env.STRIPE.STRIPE_PREMIUM_PRICE_ID,
      stripeProductId: env.STRIPE.STRIPE_PREMIUM_PRODUCT_ID || null,
    };
  }
  if (slug === 'premium' && billingInterval === 'year') {
    return {
      stripePriceId: env.STRIPE.STRIPE_PREMIUM_YEARLY_PRICE_ID || null,
      stripeProductId: env.STRIPE.STRIPE_PREMIUM_PRODUCT_ID || null,
    };
  }
  return { stripePriceId: null, stripeProductId: null };
}

export class PlanService {
  /** Upsert Free / Pro / Premium (monthly + yearly) from catalog + env price IDs. */
  async seedPlans(): Promise<void> {
    // Legacy unique index on slug alone blocks monthly+yearly pairs.
    try {
      await PlanModel.collection.dropIndex('slug_1');
      logger.info('Dropped legacy Plan.slug unique index');
    } catch {
      // Index may already be absent — ignore.
    }

    for (const plan of PLAN_CATALOG) {
      const ids = stripeIdsForPlan(plan.slug, plan.billingInterval);
      await PlanModel.findOneAndUpdate(
        { slug: plan.slug, billingInterval: plan.billingInterval },
        {
          $set: {
            name: plan.name,
            slug: plan.slug,
            monthlyPrice: plan.monthlyPrice,
            currency: plan.currency,
            billingInterval: plan.billingInterval,
            features: [...plan.features],
            isTrialAvailable: plan.isTrialAvailable,
            trialDays: plan.trialDays,
            isActive: true,
            stripePriceId: ids.stripePriceId,
            stripeProductId: ids.stripeProductId,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }

    logger.info('Subscription plans seeded', {
      plans: PLAN_CATALOG.map((p) => `${p.slug}:${p.billingInterval}`),
    });
  }

  async listActive() {
    return PlanModel.find({ isActive: true })
      .sort({ monthlyPrice: 1, billingInterval: 1 })
      .lean();
  }

  async getById(id: string) {
    const plan = await PlanModel.findById(id).lean();
    if (!plan || !plan.isActive) {
      throw ApiError.notFound(MESSAGES.PLAN_NOT_FOUND);
    }
    return plan;
  }

  async getBySlug(slug: string, billingInterval: BillingInterval = 'month') {
    if (!isPlanSlug(slug)) {
      throw ApiError.notFound(MESSAGES.PLAN_NOT_FOUND);
    }

    const plan = await PlanModel.findOne({
      slug,
      billingInterval,
      isActive: true,
    }).lean();

    if (!plan) {
      // Fallback: any interval for feature lookup
      const anyPlan = await PlanModel.findOne({ slug, isActive: true }).lean();
      if (!anyPlan) {
        throw ApiError.notFound(MESSAGES.PLAN_NOT_FOUND);
      }
      return anyPlan;
    }
    return plan;
  }

  async getByStripePriceId(priceId: string) {
    return PlanModel.findOne({ stripePriceId: priceId, isActive: true }).lean();
  }

  toPublic(plan: {
    _id: { toString(): string };
    name: string;
    slug: string;
    monthlyPrice: number;
    currency: string;
    billingInterval: string;
    features: string[];
    isTrialAvailable: boolean;
    trialDays: number;
  }) {
    const interval = isBillingInterval(plan.billingInterval)
      ? plan.billingInterval
      : 'month';
    const priceDisplay = plan.monthlyPrice / 100;

    let compareAtPriceDisplay: number | null = null;
    let discountPercent = 0;
    let savingsDisplay: number | null = null;

    if (interval === 'year' && isPlanSlug(plan.slug) && plan.slug !== 'free') {
      const compareAtCents = annualCompareAtCents(plan.slug);
      compareAtPriceDisplay = compareAtCents / 100;
      discountPercent = annualDiscountPercent(plan.slug, plan.monthlyPrice);
      savingsDisplay =
        compareAtCents > plan.monthlyPrice
          ? (compareAtCents - plan.monthlyPrice) / 100
          : null;
    }

    return {
      id: plan._id.toString(),
      name: plan.name,
      slug: plan.slug,
      monthlyPrice: plan.monthlyPrice,
      currency: plan.currency,
      billingInterval: interval,
      features: plan.features,
      isTrialAvailable: plan.isTrialAvailable,
      trialDays: plan.trialDays,
      priceDisplay,
      compareAtPriceDisplay,
      discountPercent,
      savingsDisplay,
    };
  }
}

export const planService = new PlanService();
