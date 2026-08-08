import { randomUUID } from 'crypto';
import { env } from '../config/env.js';
import UserModel from '../models/user.model.js';
import UserSubscriptionModel from '../models/userSubscription.model.js';
import SubscriptionHistoryModel from '../models/subscriptionHistory.model.js';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES, PLAN_RANK, isPaidPlan, isPlanSlug } from '../constants/index.js';
import type { PlanSlug, SubscriptionStatus } from '../constants/plans.js';
import { planService } from './plan.service.js';
import {
  getSubscriptionPeriod,
  getSubscriptionPriceIds,
  stripeService,
} from './stripe.service.js';
import { logger } from '../utils/logger.js';
import type Stripe from 'stripe';

const ACTIVE_PAID_STATUSES: SubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
];

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  const allowed: SubscriptionStatus[] = [
    'active',
    'trialing',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'unpaid',
    'past_due',
  ];
  if ((allowed as string[]).includes(status)) {
    return status as SubscriptionStatus;
  }
  return 'canceled';
}

function extractPaymentIntentId(
  invoice: Stripe.Invoice | string | null | undefined,
): string | null {
  if (!invoice || typeof invoice === 'string') return null;
  const pi = (
    invoice as Stripe.Invoice & {
      payment_intent?: string | Stripe.PaymentIntent | null;
    }
  ).payment_intent;
  if (!pi) return null;
  return typeof pi === 'string' ? pi : pi.id;
}

export class SubscriptionService {
  async assignFreePlan(userId: string) {
    const existing = await UserSubscriptionModel.findOne({ userId });
    if (existing) return existing;

    const sub = await UserSubscriptionModel.create({
      userId,
      currentPlan: 'free',
      status: 'active',
      cancelAtPeriodEnd: false,
    });

    await this.recordHistory({
      userId,
      eventType: 'plan.assigned',
      fromPlan: null,
      toPlan: 'free',
      message: 'Free plan assigned on registration',
    });

    return sub;
  }

  async getOrCreateForUser(userId: string) {
    let sub = await UserSubscriptionModel.findOne({ userId });
    if (!sub) {
      sub = await this.assignFreePlan(userId);
    }
    return sub;
  }

  async getStatus(userId: string) {
    const sub = await this.getOrCreateForUser(userId);
    const plan = await planService.getBySlug(sub.currentPlan);

    return {
      currentPlan: sub.currentPlan,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      pendingPlan: sub.pendingPlan,
      trialStart: sub.trialStart,
      trialEnd: sub.trialEnd,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      features: plan.features,
      isPaid: isPaidPlan(sub.currentPlan),
      hasActiveAccess: this.hasActiveAccess(sub.status, sub.currentPlan),
    };
  }

  hasActiveAccess(status: SubscriptionStatus, plan: PlanSlug): boolean {
    if (plan === 'free') return true;
    return (
      status === 'active' ||
      status === 'trialing' ||
      status === 'past_due'
    );
  }

  async ensureStripeCustomer(userId: string): Promise<string> {
    const user = await UserModel.findById(userId);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);
    }

    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customer = await stripeService.createCustomer({
      email: user.email,
      ...(user.name ? { name: user.name } : {}),
      userId: user.id,
    });

    user.stripeCustomerId = customer.id;
    await user.save();

    await UserSubscriptionModel.findOneAndUpdate(
      { userId },
      { $set: { stripeCustomerId: customer.id } },
      { upsert: true },
    );

    return customer.id;
  }

  async createCheckout(userId: string, planId: string) {
    const plan = await planService.getById(planId);
    if (!isPlanSlug(plan.slug) || !isPaidPlan(plan.slug)) {
      throw ApiError.badRequest('Checkout is only available for Pro and Premium');
    }
    if (!plan.stripePriceId) {
      throw ApiError.badRequest('Plan is missing a Stripe price configuration');
    }

    const sub = await this.getOrCreateForUser(userId);
    if (
      isPaidPlan(sub.currentPlan) &&
      ACTIVE_PAID_STATUSES.includes(sub.status) &&
      sub.stripeSubscriptionId &&
      !sub.cancelAtPeriodEnd
    ) {
      throw ApiError.conflict(MESSAGES.ALREADY_SUBSCRIBED);
    }

    const user = await UserModel.findById(userId);
    if (!user) throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);

    const customerId = await this.ensureStripeCustomer(userId);

    const trialEligible =
      plan.isTrialAvailable && plan.trialDays > 0 && !user.trialUsed;

    // Unique per attempt. A static key breaks when success_url / trial / integration
    // params change (Stripe requires identical bodies for the same idempotency key).
    const idempotencyKey = `checkout:${userId}:${plan.slug}:${plan.stripePriceId}:${randomUUID()}`;

    const session = await stripeService.createCheckoutSession({
      customerId,
      priceId: plan.stripePriceId,
      userId,
      planSlug: plan.slug,
      ...(trialEligible ? { trialDays: plan.trialDays } : {}),
      idempotencyKey,
    });

    logger.info('Checkout session created', {
      userId,
      plan: plan.slug,
      sessionId: session.id,
      trial: trialEligible,
    });

    await this.recordHistory({
      userId,
      eventType: 'checkout.created',
      fromPlan: sub.currentPlan,
      toPlan: plan.slug,
      message: `Checkout session created for ${plan.name}`,
      metadata: { sessionId: session.id, trialEligible },
    });

    return {
      sessionId: session.id,
      url: session.url,
      publishableKey: env.STRIPE.STRIPE_PUBLISHABLE_KEY,
    };
  }

  async cancel(
    userId: string,
    options: { immediate?: boolean } = {},
  ) {
    const sub = await this.getOrCreateForUser(userId);
    if (!sub.stripeSubscriptionId || !isPaidPlan(sub.currentPlan)) {
      throw ApiError.badRequest('No active paid subscription to cancel');
    }

    if (options.immediate) {
      const updated = await stripeService.cancelImmediately(
        sub.stripeSubscriptionId,
      );
      await this.syncFromStripeSubscription(updated, {
        eventType: 'subscription.canceled_immediate',
        message: 'Subscription canceled immediately',
      });
      logger.info('Subscription canceled immediately', { userId });
      return this.getStatus(userId);
    }

    const updated = await stripeService.cancelAtPeriodEnd(
      sub.stripeSubscriptionId,
    );
    await this.syncFromStripeSubscription(updated, {
      eventType: 'subscription.cancel_at_period_end',
      message: 'Subscription set to cancel at period end',
    });
    logger.info('Subscription cancel at period end', { userId });
    return this.getStatus(userId);
  }

  async reactivate(userId: string) {
    const sub = await this.getOrCreateForUser(userId);
    if (!sub.stripeSubscriptionId) {
      throw ApiError.badRequest('No Stripe subscription to reactivate');
    }
    if (!sub.cancelAtPeriodEnd) {
      throw ApiError.badRequest('Subscription is not scheduled for cancellation');
    }

    const updated = await stripeService.reactivate(sub.stripeSubscriptionId);
    await this.syncFromStripeSubscription(updated, {
      eventType: 'subscription.reactivated',
      message: 'Subscription reactivated before period end',
    });
    logger.info('Subscription reactivated', { userId });
    return this.getStatus(userId);
  }

  async changePlan(userId: string, planId: string) {
    const targetPlan = await planService.getById(planId);
    if (!isPlanSlug(targetPlan.slug)) {
      throw ApiError.badRequest('Invalid plan');
    }

    const sub = await this.getOrCreateForUser(userId);
    const from = sub.currentPlan;
    const to = targetPlan.slug;

    if (from === to && !sub.cancelAtPeriodEnd && !sub.pendingPlan) {
      throw ApiError.badRequest('Already on the selected plan');
    }

    // Free → Paid: checkout
    if (!isPaidPlan(from) && isPaidPlan(to)) {
      return {
        mode: 'checkout' as const,
        ...(await this.createCheckout(userId, planId)),
      };
    }

    // Paid → Free: cancel at period end
    if (isPaidPlan(from) && to === 'free') {
      await this.cancel(userId, { immediate: false });
      sub.pendingPlan = 'free';
      await sub.save();
      return {
        mode: 'scheduled' as const,
        ...(await this.getStatus(userId)),
      };
    }

    if (!sub.stripeSubscriptionId) {
      throw ApiError.badRequest('No active Stripe subscription to change');
    }

    const stripeSub = await stripeService.retrieveSubscription(
      sub.stripeSubscriptionId,
    );
    const { priceId: currentPriceId, itemId } = getSubscriptionPriceIds(stripeSub);
    if (!currentPriceId || !itemId || !targetPlan.stripePriceId) {
      throw ApiError.badRequest('Unable to resolve Stripe price items');
    }

    const isUpgrade = PLAN_RANK[to] > PLAN_RANK[from];

    if (isUpgrade) {
      const updated = await stripeService.upgradeSubscriptionImmediate({
        subscriptionId: sub.stripeSubscriptionId,
        itemId,
        newPriceId: targetPlan.stripePriceId,
        planSlug: to,
        userId,
      });

      await this.syncFromStripeSubscription(updated, {
        eventType: 'subscription.upgraded',
        message: `Upgraded from ${from} to ${to}`,
        fromPlan: from,
        toPlan: to,
      });

      logger.info('Subscription upgraded', { userId, from, to });
      return {
        mode: 'immediate' as const,
        ...(await this.getStatus(userId)),
      };
    }

    // Paid → lower paid: schedule at period end
    const schedule = await stripeService.scheduleDowngradeAtPeriodEnd({
      subscriptionId: sub.stripeSubscriptionId,
      currentPriceId,
      newPriceId: targetPlan.stripePriceId,
      userId,
      planSlug: to,
    });

    sub.pendingPlan = to;
    sub.stripeScheduleId = schedule.id;
    await sub.save();

    await this.recordHistory({
      userId,
      eventType: 'subscription.downgrade_scheduled',
      fromPlan: from,
      toPlan: to,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      message: `Downgrade to ${to} scheduled at period end`,
      metadata: { scheduleId: schedule.id },
    });

    logger.info('Subscription downgrade scheduled', { userId, from, to });
    return {
      mode: 'scheduled' as const,
      ...(await this.getStatus(userId)),
    };
  }

  async getHistory(userId: string, limit = 50) {
    return SubscriptionHistoryModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async getInvoices(userId: string) {
    const sub = await this.getOrCreateForUser(userId);
    const customerId =
      sub.stripeCustomerId ?? (await this.ensureStripeCustomer(userId));

    if (!customerId) {
      return [];
    }

    const invoices = await stripeService.listInvoices({ customerId });
    return invoices.map((invoice) => ({
      id: invoice.id,
      status: invoice.status,
      amountDue: invoice.amount_due,
      amountPaid: invoice.amount_paid,
      currency: invoice.currency,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdf: invoice.invoice_pdf,
      created: invoice.created
        ? new Date(invoice.created * 1000).toISOString()
        : null,
      periodStart: invoice.period_start
        ? new Date(invoice.period_start * 1000).toISOString()
        : null,
      periodEnd: invoice.period_end
        ? new Date(invoice.period_end * 1000).toISOString()
        : null,
    }));
  }

  async createBillingPortal(userId: string) {
    const customerId = await this.ensureStripeCustomer(userId);
    const session = await stripeService.createBillingPortalSession({
      customerId,
    });

    logger.info('Billing portal session created', { userId });
    return { url: session.url };
  }

  async syncFromStripeSubscription(
    subscription: Stripe.Subscription,
    audit?: {
      eventType: string;
      message: string;
      fromPlan?: PlanSlug | null;
      toPlan?: PlanSlug | null;
      stripeEventId?: string;
    },
  ) {
    const userId =
      subscription.metadata.userId ??
      (await this.resolveUserIdFromCustomer(
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
      ));

    if (!userId) {
      logger.warn('Subscription sync skipped — no userId', {
        subscriptionId: subscription.id,
      });
      return null;
    }

    const { priceId, productId } = getSubscriptionPriceIds(subscription);
    const period = getSubscriptionPeriod(subscription);

    let planSlug: PlanSlug = 'free';
    if (priceId) {
      const plan = await planService.getByStripePriceId(priceId);
      if (plan && isPlanSlug(plan.slug)) {
        planSlug = plan.slug;
      } else if (
        subscription.metadata.planSlug &&
        isPlanSlug(subscription.metadata.planSlug)
      ) {
        planSlug = subscription.metadata.planSlug;
      }
    }

    const status = mapStripeStatus(subscription.status);
    const effectivePlan: PlanSlug =
      status === 'canceled' || status === 'incomplete_expired'
        ? 'free'
        : planSlug;

    const latestInvoiceId =
      typeof subscription.latest_invoice === 'string'
        ? subscription.latest_invoice
        : subscription.latest_invoice?.id ?? null;

    const latestPaymentIntentId = extractPaymentIntentId(
      subscription.latest_invoice,
    );

    const previous = await UserSubscriptionModel.findOne({ userId }).lean();

    const updated = await UserSubscriptionModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          stripeCustomerId:
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer.id,
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId,
          stripeProductId: productId,
          currentPlan: effectivePlan,
          status: effectivePlan === 'free' ? 'active' : status,
          trialStart: subscription.trial_start
            ? new Date(subscription.trial_start * 1000)
            : null,
          trialEnd: subscription.trial_end
            ? new Date(subscription.trial_end * 1000)
            : null,
          currentPeriodStart: period.currentPeriodStart,
          currentPeriodEnd: period.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at
            ? new Date(subscription.canceled_at * 1000)
            : null,
          latestInvoiceId,
          latestPaymentIntentId,
          ...(status === 'canceled' || effectivePlan === 'free'
            ? { pendingPlan: null, stripeScheduleId: null }
            : {}),
        },
      },
      { upsert: true, new: true },
    );

    if (subscription.trial_start || subscription.status === 'trialing') {
      await UserModel.findByIdAndUpdate(userId, { $set: { trialUsed: true } });
    }

    if (audit) {
      await this.recordHistory({
        userId,
        eventType: audit.eventType,
        fromPlan: audit.fromPlan ?? previous?.currentPlan ?? null,
        toPlan: audit.toPlan ?? effectivePlan,
        stripeEventId: audit.stripeEventId ?? null,
        stripeSubscriptionId: subscription.id,
        message: audit.message,
      });
    }

    logger.info('Subscription synced from Stripe', {
      userId,
      plan: effectivePlan,
      status: updated?.status,
      subscriptionId: subscription.id,
    });

    return updated;
  }

  async resolveUserIdFromCustomer(customerId: string): Promise<string | null> {
    const user = await UserModel.findOne({ stripeCustomerId: customerId })
      .select({ _id: 1 })
      .lean();
    return user ? user._id.toString() : null;
  }

  async recordHistory(input: {
    userId: string;
    eventType: string;
    fromPlan: PlanSlug | null;
    toPlan: PlanSlug | null;
    message: string;
    stripeEventId?: string | null;
    stripeSubscriptionId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    await SubscriptionHistoryModel.create({
      userId: input.userId,
      eventType: input.eventType,
      fromPlan: input.fromPlan,
      toPlan: input.toPlan,
      message: input.message,
      stripeEventId: input.stripeEventId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      metadata: input.metadata ?? {},
    });
  }

  toPublic(sub: {
    currentPlan: PlanSlug;
    status: SubscriptionStatus;
    cancelAtPeriodEnd: boolean;
    pendingPlan: PlanSlug | null;
    trialStart: Date | null;
    trialEnd: Date | null;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    canceledAt: Date | null;
    stripeSubscriptionId: string | null;
  }) {
    return {
      currentPlan: sub.currentPlan,
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      pendingPlan: sub.pendingPlan,
      trialStart: sub.trialStart,
      trialEnd: sub.trialEnd,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      canceledAt: sub.canceledAt,
      hasStripeSubscription: Boolean(sub.stripeSubscriptionId),
    };
  }
}

export const subscriptionService = new SubscriptionService();
