import Stripe from 'stripe';
import { env } from './env.js';

/**
 * Shared Stripe client — latest SDK API version from the package default.
 * Never expose STRIPE_SECRET_KEY to clients.
 */
export const stripe = new Stripe(env.STRIPE.STRIPE_SECRET_KEY, {
  typescript: true,
  maxNetworkRetries: 2,
  appInfo: {
    name: env.APP_NAME,
    version: '1.0.0',
  },
});
