import type Stripe from 'stripe';
import WebhookEventModel from '../models/webhookEvent.model.js';
import UserModel from '../models/user.model.js';
import { stripeService } from './stripe.service.js';
import { subscriptionService } from './subscription.service.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';

export class WebhookService {
  async handleRawEvent(payload: Buffer, signature: string | undefined) {
    if (!signature) {
      throw ApiError.unauthorized('Missing Stripe-Signature header');
    }

    const event = stripeService.constructWebhookEvent(payload, signature);
    logger.info('Webhook received', { type: event.type, id: event.id });

    const already = await WebhookEventModel.findOne({ eventId: event.id }).lean();
    if (already) {
      logger.info('Webhook already processed (idempotent skip)', {
        id: event.id,
        type: event.type,
      });
      return { received: true, duplicate: true };
    }

    try {
      await this.dispatch(event);
      await WebhookEventModel.create({
        eventId: event.id,
        type: event.type,
        processedAt: new Date(),
      });
    } catch (error) {
      logger.error('Webhook processing failed', {
        id: event.id,
        type: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return { received: true, duplicate: false };
  }

  private async dispatch(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(
          event.data.object as Stripe.Checkout.Session,
          event.id,
        );
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await subscriptionService.syncFromStripeSubscription(
          event.data.object as Stripe.Subscription,
          {
            eventType: event.type,
            message: `Stripe ${event.type}`,
            stripeEventId: event.id,
          },
        );
        break;

      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
          event.id,
        );
        break;

      case 'invoice.payment_succeeded':
        await this.onInvoicePaymentSucceeded(
          event.data.object as Stripe.Invoice,
          event.id,
        );
        break;

      case 'invoice.payment_failed':
        await this.onInvoicePaymentFailed(
          event.data.object as Stripe.Invoice,
          event.id,
        );
        break;

      case 'invoice.finalized':
      case 'invoice.upcoming':
        logger.info('Invoice lifecycle event', {
          type: event.type,
          invoiceId: (event.data.object as Stripe.Invoice).id,
        });
        break;

      case 'payment_intent.succeeded':
        logger.info('Payment succeeded', {
          paymentIntentId: (event.data.object as Stripe.PaymentIntent).id,
        });
        break;

      case 'payment_intent.payment_failed':
        logger.warn('Payment failed', {
          paymentIntentId: (event.data.object as Stripe.PaymentIntent).id,
        });
        break;

      case 'charge.refunded':
        logger.info('Charge refunded', {
          chargeId: (event.data.object as Stripe.Charge).id,
        });
        break;

      default:
        logger.debug('Unhandled Stripe webhook type', { type: event.type });
    }
  }

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
    eventId: string,
  ): Promise<void> {
    const userId =
      session.metadata?.userId ??
      session.client_reference_id ??
      null;

    if (session.mode !== 'subscription' || !session.subscription) {
      return;
    }

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;

    const subscription = await stripeService.retrieveSubscription(subscriptionId);

    if (userId && !subscription.metadata.userId) {
      // Ensure metadata is present for future syncs
      subscription.metadata.userId = userId;
      if (session.metadata?.planSlug) {
        subscription.metadata.planSlug = session.metadata.planSlug;
      }
    }

    if (subscription.status === 'trialing' && userId) {
      await UserModel.findByIdAndUpdate(userId, { $set: { trialUsed: true } });
    }

    await subscriptionService.syncFromStripeSubscription(subscription, {
      eventType: 'checkout.session.completed',
      message: 'Checkout completed — subscription activated',
      stripeEventId: eventId,
      toPlan:
        (session.metadata?.planSlug as 'pro' | 'premium' | undefined) ?? null,
    });

    logger.info('Checkout completed', {
      userId,
      sessionId: session.id,
      subscriptionId,
    });
  }

  private async onSubscriptionDeleted(
    subscription: Stripe.Subscription,
    eventId: string,
  ): Promise<void> {
    await subscriptionService.syncFromStripeSubscription(subscription, {
      eventType: 'customer.subscription.deleted',
      message: 'Subscription deleted — reverted to Free',
      stripeEventId: eventId,
      toPlan: 'free',
    });
  }

  private async onInvoicePaymentSucceeded(
    invoice: Stripe.Invoice,
    eventId: string,
  ): Promise<void> {
    const subscriptionRef = (
      invoice as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      }
    ).subscription;

    if (!subscriptionRef) return;

    const subscriptionId =
      typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;

    const subscription =
      await stripeService.retrieveSubscription(subscriptionId);

    await subscriptionService.syncFromStripeSubscription(subscription, {
      eventType: 'invoice.payment_succeeded',
      message: 'Invoice payment succeeded',
      stripeEventId: eventId,
    });

    logger.info('Payment success', {
      invoiceId: invoice.id,
      subscriptionId,
    });
  }

  private async onInvoicePaymentFailed(
    invoice: Stripe.Invoice,
    eventId: string,
  ): Promise<void> {
    const subscriptionRef = (
      invoice as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      }
    ).subscription;

    if (!subscriptionRef) {
      logger.warn('Payment failure without subscription', {
        invoiceId: invoice.id,
        eventId,
      });
      return;
    }

    const subscriptionId =
      typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;

    const subscription =
      await stripeService.retrieveSubscription(subscriptionId);

    await subscriptionService.syncFromStripeSubscription(subscription, {
      eventType: 'invoice.payment_failed',
      message: 'Invoice payment failed',
      stripeEventId: eventId,
    });

    logger.warn('Payment failure', {
      invoiceId: invoice.id,
      subscriptionId,
    });
  }
}

export const webhookService = new WebhookService();
