import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { BillingInterval, PlanSlug } from '../constants/plans.js';

export interface IPlan {
  name: string;
  slug: PlanSlug;
  stripePriceId: string | null;
  stripeProductId: string | null;
  /** Price in cents for this billing interval (monthly or yearly). */
  monthlyPrice: number;
  currency: string;
  billingInterval: BillingInterval;
  features: string[];
  isTrialAvailable: boolean;
  trialDays: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type PlanDocument = HydratedDocument<IPlan>;

const PlanSchema = new mongoose.Schema<IPlan>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      enum: ['free', 'pro', 'premium'],
      index: true,
    },
    stripePriceId: { type: String, default: null, index: true, sparse: true },
    stripeProductId: { type: String, default: null },
    monthlyPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'usd', lowercase: true },
    billingInterval: {
      type: String,
      required: true,
      enum: ['month', 'year'],
      default: 'month',
      index: true,
    },
    features: { type: [String], default: [] },
    isTrialAvailable: { type: Boolean, default: false },
    trialDays: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

PlanSchema.index({ slug: 1, billingInterval: 1 }, { unique: true });

const PlanModel: Model<IPlan> =
  mongoose.models.Plan ?? mongoose.model<IPlan>('Plan', PlanSchema);

export default PlanModel;
