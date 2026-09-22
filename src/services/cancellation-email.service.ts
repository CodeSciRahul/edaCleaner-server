import type Stripe from 'stripe';
import UserModel from '../models/user.model.js';
import WebhookEventModel from '../models/webhookEvent.model.js';
import { isPlanSlug } from '../constants/plans.js';
import { logger } from '../utils/logger.js';
import { normalizeEmailForStorage } from '../utils/email.js';
import { mailService } from './mail.service.js';
import { planService } from './plan.service.js';
import {
  getSubscriptionPeriod,
  stripeService,
} from './stripe.service.js';

export type CancellationEmailKind = 'scheduled' | 'ended';

function cancellationIdempotencyKey(
  kind: CancellationEmailKind,
  subscriptionId: string,
  periodEndIso?: string | null,
): string {
  if (kind === 'scheduled') {
    return `cancel-email:scheduled:${subscriptionId}:${periodEndIso ?? 'unknown'}`;
  }
  return `cancel-email:ended:${subscriptionId}`;
}

/**
 * Sends cancellation emails (scheduled end-of-period or fully ended)
 * with idempotency so API cancel + Stripe portal webhooks do not double-send.
 */
export class CancellationEmailService {
  async sendForSubscription(params: {
    subscription: Stripe.Subscription;
    kind: CancellationEmailKind;
    userId?: string | null;
    source: string;
  }): Promise<{ sent: boolean; skippedReason?: string }> {
    const { subscription, kind, userId = null, source } = params;
    const period = getSubscriptionPeriod(subscription);
    const periodEndIso = period.currentPeriodEnd?.toISOString() ?? null;
    const idempotencyKey = cancellationIdempotencyKey(
      kind,
      subscription.id,
      periodEndIso,
    );

    const already = await WebhookEventModel.findOne({
      eventId: idempotencyKey,
    }).lean();
    if (already) {
      logger.info('Cancellation email skipped — already sent', {
        source,
        kind,
        subscriptionId: subscription.id,
      });
      return { sent: false, skippedReason: 'already_sent' };
    }

    let recipientEmail: string | null = null;
    let customerName: string | null = null;

    if (userId) {
      const user = await UserModel.findById(userId).lean();
      if (user?.email) {
        recipientEmail = normalizeEmailForStorage(user.email);
        if (user.name) customerName = user.name;
      }
    }

    if (!recipientEmail) {
      const customerId =
        typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id ?? null;
      if (customerId) {
        try {
          const customer = await stripeService.retrieveCustomer(customerId);
          if (customer && !('deleted' in customer && customer.deleted)) {
            if (customer.email) {
              recipientEmail = normalizeEmailForStorage(customer.email);
            }
            if (!customerName && customer.name) customerName = customer.name;
          }
        } catch (error) {
          logger.warn('Could not load Stripe customer for cancellation email', {
            customerId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (!recipientEmail) {
      logger.warn('Cancellation email skipped — no recipient email', {
        source,
        kind,
        userId,
        subscriptionId: subscription.id,
      });
      return { sent: false, skippedReason: 'no_recipient' };
    }

    const planSlugRaw = subscription.metadata?.planSlug ?? null;
    const planSlug =
      planSlugRaw && isPlanSlug(planSlugRaw) ? planSlugRaw : null;

    let planName = planSlug
      ? planSlug.charAt(0).toUpperCase() + planSlug.slice(1)
      : 'Paid';
    let billingInterval: string | null = null;

    const priceId =
      typeof subscription.items.data[0]?.price === 'string'
        ? subscription.items.data[0]?.price
        : subscription.items.data[0]?.price?.id ?? null;

    if (priceId) {
      const planByPrice = await planService.getByStripePriceId(priceId);
      if (planByPrice) {
        planName = planByPrice.name;
        billingInterval = planByPrice.billingInterval;
      }
    } else if (planSlug) {
      try {
        const plan = await planService.getBySlug(planSlug);
        planName = plan.name;
        billingInterval = plan.billingInterval;
      } catch {
        // Keep slug-derived label.
      }
    }

    const accessUntil =
      kind === 'scheduled'
        ? periodEndIso
        : subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : periodEndIso;

    await mailService.sendSubscriptionCanceledEmail(recipientEmail, {
      planName,
      billingInterval,
      customerName,
      accessUntil,
      kind,
    });

    try {
      await WebhookEventModel.create({
        eventId: idempotencyKey,
        type:
          kind === 'scheduled'
            ? 'subscription.cancel.email.scheduled'
            : 'subscription.cancel.email.ended',
        processedAt: new Date(),
      });
    } catch (error) {
      logger.warn('Cancellation email idempotency mark failed', {
        subscriptionId: subscription.id,
        kind,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logger.info('Cancellation email sent', {
      source,
      kind,
      userId,
      email: recipientEmail,
      planName,
      subscriptionId: subscription.id,
    });

    return { sent: true };
  }
}

export const cancellationEmailService = new CancellationEmailService();
