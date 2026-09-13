import type Stripe from 'stripe';
import UserModel from '../models/user.model.js';
import WebhookEventModel from '../models/webhookEvent.model.js';
import { isPlanSlug } from '../constants/plans.js';
import { logger } from '../utils/logger.js';
import { normalizeEmailForStorage } from '../utils/email.js';
import { mailService } from './mail.service.js';
import { planService } from './plan.service.js';
import { stripeService } from './stripe.service.js';

function receiptIdempotencyKey(invoiceId: string): string {
  return `purchase-receipt:${invoiceId}`;
}

/**
 * Sends the same purchase confirmation / invoice email used after Checkout,
 * with invoice-level idempotency so upgrade API + webhook never double-send.
 */
export class PurchaseReceiptService {
  async sendForSubscriptionPayment(params: {
    subscription: Stripe.Subscription;
    invoice: Stripe.Invoice | null;
    userId?: string | null;
    checkoutEmail?: string | null;
    customerName?: string | null;
    sessionAmountTotal?: number | null;
    sessionCurrency?: string | null;
    sessionPlanSlug?: string | null;
    source: string;
  }): Promise<{ sent: boolean; skippedReason?: string }> {
    const {
      subscription,
      invoice,
      userId = null,
      checkoutEmail = null,
      source,
    } = params;

    const invoiceId = invoice?.id ?? null;
    if (invoiceId) {
      const already = await WebhookEventModel.findOne({
        eventId: receiptIdempotencyKey(invoiceId),
      }).lean();
      if (already) {
        logger.info('Purchase receipt skipped — already sent for invoice', {
          source,
          invoiceId,
        });
        return { sent: false, skippedReason: 'already_sent' };
      }
    }

    let recipientEmail = checkoutEmail
      ? normalizeEmailForStorage(checkoutEmail)
      : null;
    let customerName = params.customerName ?? null;

    if (!recipientEmail && userId) {
      const user = await UserModel.findById(userId).lean();
      if (user?.email) {
        recipientEmail = normalizeEmailForStorage(user.email);
        if (!customerName && user.name) customerName = user.name;
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
          logger.warn('Could not load Stripe customer for receipt email', {
            customerId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (!recipientEmail) {
      logger.warn('Purchase receipt skipped — no recipient email', {
        source,
        userId,
        subscriptionId: subscription.id,
        invoiceId,
      });
      return { sent: false, skippedReason: 'no_recipient' };
    }

    const planSlugRaw =
      params.sessionPlanSlug ?? subscription.metadata?.planSlug ?? null;
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
        : typeof params.sessionAmountTotal === 'number'
          ? params.sessionAmountTotal
          : 0;
    const currency =
      invoice?.currency ??
      params.sessionCurrency ??
      subscription.currency ??
      'usd';
    // Proration upgrades can bill $0 after credit — that is not a trial.
    const billingReason = invoice?.billing_reason ?? null;
    const isTrial =
      subscription.status === 'trialing' ||
      (amountPaidCents === 0 && billingReason !== 'subscription_update');

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

    if (invoiceId) {
      try {
        await WebhookEventModel.create({
          eventId: receiptIdempotencyKey(invoiceId),
          type: 'purchase.receipt.sent',
          processedAt: new Date(),
        });
      } catch (error) {
        // Unique race: another sender won — email may have been sent twice rarely.
        logger.warn('Purchase receipt idempotency mark failed', {
          invoiceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('Purchase receipt email sent', {
      source,
      userId,
      email: recipientEmail,
      planName,
      invoiceId,
      amountPaidCents,
    });

    return { sent: true };
  }
}

export const purchaseReceiptService = new PurchaseReceiptService();
