import { randomBytes } from 'node:crypto';
import type Stripe from 'stripe';
import { stripe } from '../config/stripe.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';
import { logger } from '../utils/logger.js';

function toStripeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    const type =
      'type' in error ? String((error as { type: unknown }).type) : undefined;
    const code =
      'code' in error ? String((error as { code: unknown }).code) : undefined;

    logger.error('Stripe API error', { type, code, message });
    return ApiError.badRequest(message || MESSAGES.STRIPE_ERROR);
  }

  logger.error('Unexpected Stripe failure', {
    error: error instanceof Error ? error.message : String(error),
  });
  return ApiError.internal(MESSAGES.STRIPE_ERROR);
}

/** Basil+ API: period fields live on subscription items. */
export function getSubscriptionPeriod(subscription: Stripe.Subscription): {
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
} {
  const item = subscription.items.data[0];
  const start =
    item && 'current_period_start' in item
      ? (item.current_period_start as number | undefined)
      : undefined;
  const end =
    item && 'current_period_end' in item
      ? (item.current_period_end as number | undefined)
      : undefined;

  return {
    currentPeriodStart: start ? new Date(start * 1000) : null,
    currentPeriodEnd: end ? new Date(end * 1000) : null,
  };
}

export function getSubscriptionPriceIds(subscription: Stripe.Subscription): {
  priceId: string | null;
  productId: string | null;
  itemId: string | null;
} {
  const item = subscription.items.data[0];
  if (!item) {
    return { priceId: null, productId: null, itemId: null };
  }

  const price = item.price;
  const product =
    typeof price.product === 'string' ? price.product : price.product?.id ?? null;

  return {
    priceId: price.id,
    productId: product,
    itemId: item.id,
  };
}

function randomIntegrationSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let out = '';
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[(bytes[i] ?? 0) % alphabet.length];
  }
  return out;
}

export class StripeService {
  async createCustomer(params: {
    email: string;
    name?: string;
    userId: string;
  }): Promise<Stripe.Customer> {
    try {
      return await stripe.customers.create({
        email: params.email,
        ...(params.name ? { name: params.name } : {}),
        metadata: { userId: params.userId },
      });
    } catch (error) {
      throw toStripeError(error);
    }
  }

  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    userId: string;
    planSlug: string;
    trialDays?: number;
    idempotencyKey: string;
  }): Promise<Stripe.Checkout.Session> {
    try {
      const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData =
        {
          metadata: {
            userId: params.userId,
            planSlug: params.planSlug,
          },
        };

      if (params.trialDays && params.trialDays > 0) {
        subscriptionData.trial_period_days = params.trialDays;
      }

      return await stripe.checkout.sessions.create(
        {
          mode: 'subscription',
          customer: params.customerId,
          line_items: [{ price: params.priceId, quantity: 1 }],
          success_url: env.STRIPE.STRIPE_SUCCESS_URL,
          cancel_url: env.STRIPE.STRIPE_CANCEL_URL,
          client_reference_id: params.userId,
          metadata: {
            userId: params.userId,
            planSlug: params.planSlug,
          },
          subscription_data: subscriptionData,
          allow_promotion_codes: true,
          billing_address_collection: 'auto',
          integration_identifier: `edacleaner_checkout_${randomIntegrationSuffix()}`,
        },
        { idempotencyKey: params.idempotencyKey },
      );
    } catch (error) {
      throw toStripeError(error);
    }
  }

  async createBillingPortalSession(params: {
    customerId: string;
    returnUrl?: string;
  }): Promise<Stripe.BillingPortal.Session> {
    try {
      return await stripe.billingPortal.sessions.create({
        customer: params.customerId,
        return_url: params.returnUrl ?? env.STRIPE.STRIPE_CANCEL_URL,
      });
    } catch (error) {
      throw toStripeError(error);
    }
  }

  async retrieveSubscription(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    try {
      return await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price.product', 'latest_invoice.payment_intent'],
      });
    } catch (error) {
      throw toStripeError(error);
    }
  }

  async updateSubscriptionPrice(params: {
    subscriptionId: string;
    itemId: string;
    newPriceId: string;
    prorationBehavior: Stripe.SubscriptionUpdateParams.ProrationBehavior;
  }): Promise<Stripe.Subscription> {
    try {
      return await stripe.subscriptions.update(params.subscriptionId, {
        items: [{ id: params.itemId, price: params.newPriceId }],
        proration_behavior: params.prorationBehavior,
        cancel_at_period_end: false,
      });
    } catch (error) {
      throw toStripeError(error);
    }
  }

  async upgradeSubscriptionImmediate(params: {
    subscriptionId: string;
    itemId: string;
    newPriceId: string;
    planSlug: string;
    userId: string;
  }): Promise<Stripe.Subscription> {
    try {
      return await stripe.subscriptions.update(params.subscriptionId, {
        items: [{ id: params.itemId, price: params.newPriceId }],
        proration_behavior: 'create_prorations',
        cancel_at_period_end: false,
        metadata: {
          userId: params.userId,
          planSlug: params.planSlug,
        },
      });
    } catch (error) {
      throw toStripeError(error);
    }
  }

  /**
   * Schedule a paid→paid downgrade at the end of the current billing period.
   */
  async scheduleDowngradeAtPeriodEnd(params: {
    subscriptionId: string;
    currentPriceId: string;
    newPriceId: string;
    userId: string;
    planSlug: string;
  }): Promise<Stripe.SubscriptionSchedule> {
    try {
      const subscription = await stripe.subscriptions.retrieve(
        params.subscriptionId,
      );
      const period = getSubscriptionPeriod(subscription);
      if (!period.currentPeriodEnd) {
        throw ApiError.badRequest('Unable to resolve subscription period end');
      }

      let schedule: Stripe.SubscriptionSchedule;
      if (subscription.schedule) {
        const scheduleId =
          typeof subscription.schedule === 'string'
            ? subscription.schedule
            : subscription.schedule.id;
        schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
      } else {
        schedule = await stripe.subscriptionSchedules.create({
          from_subscription: params.subscriptionId,
        });
      }

      const currentPhase = schedule.phases[0];
      if (!currentPhase) {
        throw ApiError.badRequest('Subscription schedule has no current phase');
      }

      const updated = await stripe.subscriptionSchedules.update(schedule.id, {
        end_behavior: 'release',
        phases: [
          {
            start_date: currentPhase.start_date,
            end_date: Math.floor(period.currentPeriodEnd.getTime() / 1000),
            items: [{ price: params.currentPriceId, quantity: 1 }],
            metadata: {
              userId: params.userId,
              planSlug: subscription.metadata.planSlug ?? '',
            },
          },
          {
            items: [{ price: params.newPriceId, quantity: 1 }],
            metadata: {
              userId: params.userId,
              planSlug: params.planSlug,
            },
          },
        ],
      });

      return updated;
    } catch (error) {
      throw toStripeError(error);
    }
  }

  async cancelAtPeriodEnd(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    try {
      return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (error) {
      throw toStripeError(error);
    }
  }

  async cancelImmediately(
    subscriptionId: string,
  ): Promise<Stripe.Subscription> {
    try {
      return await stripe.subscriptions.cancel(subscriptionId, {
        prorate: true,
        invoice_now: true,
      });
    } catch (error) {
      throw toStripeError(error);
    }
  }

  async reactivate(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });
    } catch (error) {
      throw toStripeError(error);
    }
  }

  async listInvoices(params: {
    customerId: string;
    limit?: number;
  }): Promise<Stripe.Invoice[]> {
    try {
      const invoices = await stripe.invoices.list({
        customer: params.customerId,
        limit: params.limit ?? 20,
      });
      return invoices.data;
    } catch (error) {
      throw toStripeError(error);
    }
  }

  constructWebhookEvent(
    payload: Buffer,
    signature: string,
  ): Stripe.Event {
    try {
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        env.STRIPE.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      logger.warn('Webhook signature verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw ApiError.unauthorized(MESSAGES.INVALID_WEBHOOK);
    }
  }
}

export const stripeService = new StripeService();
