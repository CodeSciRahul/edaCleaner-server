import type Stripe from 'stripe';
import WebhookEventModel from '../models/webhookEvent.model.js';
import UserModel from '../models/user.model.js';
import { stripeService } from './stripe.service.js';
import { subscriptionService } from './subscription.service.js';
import { authService } from './auth.service.js';
import { mailService } from './mail.service.js';
import { planService } from './plan.service.js';
import { logger } from '../utils/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { normalizeEmailForStorage } from '../utils/email.js';
import { isPlanSlug } from '../constants/plans.js';

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
      case 'customer.created':
      case 'customer.updated':
        await this.onStripeCustomer(event.data.object as Stripe.Customer);
        break;

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

  private async onStripeCustomer(customer: Stripe.Customer): Promise<void> {
    if ('deleted' in customer && customer.deleted) {
      return;
    }

    const { user, created } = await authService.ensureUserFromStripeCustomer(
      customer,
    );
    logger.info("user", {user})
    logger.info('Stripe customer synced to account', {
      customerId: customer.id,
      userId: user?.id ?? null,
      created,
      hasEmail: Boolean(customer.email),
    });
  }

  private async onCheckoutCompleted(
    session: Stripe.Checkout.Session,
    eventId: string,
  ): Promise<void> {
    let userId =
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

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id ?? null;

    const checkoutEmailRaw =
      session.customer_details?.email ?? session.customer_email ?? null;
    const checkoutEmail = checkoutEmailRaw
      ? normalizeEmailForStorage(checkoutEmailRaw)
      : null;

    if (!userId && checkoutEmail && customerId) {
      const { user } = await authService.ensureUserFromCheckoutEmail(
        checkoutEmail,
        customerId,
      );
      userId = user.id;
      const planSlug = session.metadata?.planSlug ?? 'pro';
      await stripeService.attachUserToStripeObjects({
        userId,
        planSlug,
        customerId,
        subscriptionId,
      });
    } else if (!userId) {
      logger.warn('Checkout completed without user or email', {
        sessionId: session.id,
        guest: session.metadata?.guest === 'true',
      });
    }

    const subscription = await stripeService.retrieveSubscription(subscriptionId);

    if (userId && !subscription.metadata.userId) {
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

    // Subscription Checkout always produces a latest_invoice on Stripe.
    const latestInvoiceId =
      typeof subscription.latest_invoice === 'string'
        ? subscription.latest_invoice
        : subscription.latest_invoice?.id ?? null;

    let invoice: Stripe.Invoice | null = null;
    if (latestInvoiceId) {
      try {
        invoice = await stripeService.retrieveInvoice(latestInvoiceId);
        logger.info('Checkout invoice ready', {
          userId,
          sessionId: session.id,
          invoiceId: invoice.id,
          status: invoice.status,
          amountPaid: invoice.amount_paid,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
        });
      } catch (error) {
        logger.warn('Could not retrieve checkout invoice', {
          latestInvoiceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      logger.warn('Checkout completed without latest_invoice', {
        userId,
        sessionId: session.id,
        subscriptionId,
      });
    }

    await this.sendPurchaseReceipt({
      session,
      subscription,
      invoice,
      userId,
      checkoutEmail,
    });

    logger.info('Checkout completed', {
      userId,
      sessionId: session.id,
      subscriptionId,
      invoiceId: latestInvoiceId,
    });
  }

  private async sendPurchaseReceipt(params: {
    session: Stripe.Checkout.Session;
    subscription: Stripe.Subscription;
    invoice: Stripe.Invoice | null;
    userId: string | null;
    checkoutEmail: string | null;
  }): Promise<void> {
    const { session, subscription, invoice, userId, checkoutEmail } = params;

    let recipientEmail = checkoutEmail;
    let customerName =
      session.customer_details?.name ??
      subscription.metadata?.customerName ??
      null;

    if (!recipientEmail && userId) {
      const user = await UserModel.findById(userId).lean();
      if (user?.email) {
        recipientEmail = normalizeEmailForStorage(user.email);
        if (!customerName && user.name) customerName = user.name;
      }
    }

    if (!recipientEmail) {
      logger.warn('Purchase receipt skipped — no recipient email', {
        sessionId: session.id,
        userId,
      });
      return;
    }

    const planSlugRaw =
      session.metadata?.planSlug ?? subscription.metadata?.planSlug ?? null;
    const planSlug = planSlugRaw && isPlanSlug(planSlugRaw) ? planSlugRaw : null;

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
        // Fall back to slug-derived label above.
      }
    }

    const amountPaidCents =
      typeof invoice?.amount_paid === 'number'
        ? invoice.amount_paid
        : typeof session.amount_total === 'number'
          ? session.amount_total
          : 0;
    const currency =
      invoice?.currency ?? session.currency ?? subscription.currency ?? 'usd';
    const isTrial =
      subscription.status === 'trialing' ||
      (typeof amountPaidCents === 'number' && amountPaidCents === 0);

    await mailService.sendPurchaseReceiptEmail(recipientEmail, {
      planName,
      billingInterval,
      amountPaidCents,
      currency,
      invoiceNumber: invoice?.number ?? null,
      hostedInvoiceUrl: invoice?.hosted_invoice_url ?? null,
      customerName,
      isTrial,
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

    if (!subscriptionRef) {
      logger.info('Non-subscription invoice paid', {
        invoiceId: invoice.id,
        amountPaid: invoice.amount_paid,
      });
      return;
    }

    const subscriptionId =
      typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;

    const subscription =
      await stripeService.retrieveSubscription(subscriptionId);

    const amountLabel =
      typeof invoice.amount_paid === 'number'
        ? `${(invoice.amount_paid / 100).toFixed(2)} ${(invoice.currency ?? 'usd').toUpperCase()}`
        : 'payment';

    await subscriptionService.syncFromStripeSubscription(subscription, {
      eventType: 'invoice.payment_succeeded',
      message: `Invoice paid (${invoice.number ?? invoice.id}) — ${amountLabel}`,
      stripeEventId: eventId,
    });

    logger.info('Payment success', {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      subscriptionId,
      amountPaid: invoice.amount_paid,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
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
