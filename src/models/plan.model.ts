import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import type { PlanSlug } from '../constants/plans.js';

export interface IPlan {
  name: string;
  slug: PlanSlug;
  /** Stripe Price ID for monthly billing */
  stripePriceId: string | null;
  /** Stripe Price ID for yearly billing */
  stripeYearlyPriceId: string | null;
  stripeProductId: string | null;
  /** Monthly amount in cents */
  monthlyPrice: number;
  /** Yearly amount in cents (0 for Free) */
  yearlyPrice: number;
  currency: string;
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
      unique: true,
      enum: ['free', 'pro', 'premium'],
      index: true,
    },
    stripePriceId: { type: String, default: null, index: true, sparse: true },
    stripeYearlyPriceId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    stripeProductId: { type: String, default: null },
    monthlyPrice: { type: Number, required: true, min: 0 },
    yearlyPrice: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, required: true, default: 'usd', lowercase: true },
    features: { type: [String], default: [] },
    isTrialAvailable: { type: Boolean, default: false },
    trialDays: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const PlanModel: Model<IPlan> =
  mongoose.models.Plan ?? mongoose.model<IPlan>('Plan', PlanSchema);

export default PlanModel;
