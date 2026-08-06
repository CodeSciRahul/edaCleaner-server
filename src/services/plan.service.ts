import { env } from '../config/env.js';
import { PLAN_CATALOG, isPlanSlug } from '../constants/plans.js';
import PlanModel from '../models/plan.model.js';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';
import { logger } from '../utils/logger.js';

function stripeIdsForSlug(slug: string): {
  stripePriceId: string | null;
  stripeProductId: string | null;
} {
  if (slug === 'pro') {
    return {
      stripePriceId: env.STRIPE.STRIPE_PRO_PRICE_ID,
      stripeProductId: env.STRIPE.STRIPE_PRO_PRODUCT_ID || null,
    };
  }
  if (slug === 'premium') {
    return {
      stripePriceId: env.STRIPE.STRIPE_PREMIUM_PRICE_ID,
      stripeProductId: env.STRIPE.STRIPE_PREMIUM_PRODUCT_ID || null,
    };
  }
  return { stripePriceId: null, stripeProductId: null };
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
    return {
      id: plan._id.toString(),
      name: plan.name,
      slug: plan.slug,
      monthlyPrice: plan.monthlyPrice,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      features: plan.features,
      isTrialAvailable: plan.isTrialAvailable,
      trialDays: plan.trialDays,
      // cents → display dollars helper for clients
      priceDisplay: plan.monthlyPrice / 100,
    };
  }
}

export const planService = new PlanService();
