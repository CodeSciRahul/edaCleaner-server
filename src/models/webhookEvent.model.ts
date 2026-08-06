import mongoose, { type HydratedDocument, type Model } from 'mongoose';

export interface IWebhookEvent {
  eventId: string;
  type: string;
  processedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookEventDocument = HydratedDocument<IWebhookEvent>;

const WebhookEventSchema = new mongoose.Schema<IWebhookEvent>(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true },
    processedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

const WebhookEventModel: Model<IWebhookEvent> =
  mongoose.models.WebhookEvent ??
  mongoose.model<IWebhookEvent>('WebhookEvent', WebhookEventSchema);

export default WebhookEventModel;
