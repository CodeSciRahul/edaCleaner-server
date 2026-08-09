import mongoose, { type HydratedDocument, type Model, type Types } from 'mongoose';
import type { PlanSlug } from '../constants/plans.js';

export interface ISubscriptionHistory {
  userId: Types.ObjectId;
  eventType: string;
  fromPlan: PlanSlug | null;
  toPlan: PlanSlug | null;
  stripeEventId: string | null;
  stripeSubscriptionId: string | null;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export type SubscriptionHistoryDocument = HydratedDocument<ISubscriptionHistory>;

const SubscriptionHistorySchema = new mongoose.Schema<ISubscriptionHistory>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    eventType: { type: String, required: true, index: true },
    fromPlan: {
      type: String,
      enum: ['free', 'pro', 'premium'],
      default: null,
    },
    toPlan: {
      type: String,
      enum: ['free', 'pro', 'premium'],
      default: null,
    },
    stripeEventId: { type: String, default: null, index: true, sparse: true },
    stripeSubscriptionId: { type: String, default: null },
    message: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const SubscriptionHistoryModel: Model<ISubscriptionHistory> =
  mongoose.models.SubscriptionHistory ??
  mongoose.model<ISubscriptionHistory>(
    'SubscriptionHistory',
    SubscriptionHistorySchema,
  );

export default SubscriptionHistoryModel;
