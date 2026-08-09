import mongoose, { type HydratedDocument, type Model, type Types } from 'mongoose';
import type { PlanSlug, SubscriptionStatus } from '../constants/plans.js';

export interface IUserSubscription {
  userId: Types.ObjectId;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  stripeProductId: string | null;
  stripeScheduleId: string | null;
  currentPlan: PlanSlug;
  pendingPlan: PlanSlug | null;
  status: SubscriptionStatus;
  trialStart: Date | null;
  trialEnd: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  latestInvoiceId: string | null;
  latestPaymentIntentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserSubscriptionDocument = HydratedDocument<IUserSubscription>;

const UserSubscriptionSchema = new mongoose.Schema<IUserSubscription>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    stripeCustomerId: { type: String, default: null, index: true, sparse: true },
    stripeSubscriptionId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    stripePriceId: { type: String, default: null },
    stripeProductId: { type: String, default: null },
    stripeScheduleId: { type: String, default: null },
    currentPlan: {
      type: String,
      enum: ['free', 'pro', 'premium'],
      required: true,
      default: 'free',
      index: true,
    },
    pendingPlan: {
      type: String,
      enum: ['free', 'pro', 'premium'],
      default: null,
    },
    status: {
      type: String,
      enum: [
        'active',
        'trialing',
        'canceled',
        'incomplete',
        'incomplete_expired',
        'unpaid',
        'past_due',
      ],
      required: true,
      default: 'active',
      index: true,
    },
    trialStart: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date, default: null },
    latestInvoiceId: { type: String, default: null },
    latestPaymentIntentId: { type: String, default: null },
  },
  { timestamps: true },
);

const UserSubscriptionModel: Model<IUserSubscription> =
  mongoose.models.UserSubscription ??
  mongoose.model<IUserSubscription>('UserSubscription', UserSubscriptionSchema);

export default UserSubscriptionModel;
