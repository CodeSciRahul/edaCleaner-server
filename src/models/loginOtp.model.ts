import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import { normalizeEmailForStorage } from '../utils/email.js';

export type OtpPurpose = 'login' | 'register' | 'reset';

export interface ILoginOtp {
  email: string;
  codeHash: string;
  purpose: OtpPurpose;
  expiresAt: Date;
  attempts: number;
  sentAt: Date;
}

export type LoginOtpDocument = HydratedDocument<ILoginOtp>;

const LoginOtpSchema = new mongoose.Schema<ILoginOtp>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ['login', 'register', 'reset'],
      required: true,
      default: 'login',
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
    attempts: {
      type: Number,
      default: 0,
    },
    sentAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

LoginOtpSchema.pre('save', function () {
  if (this.isModified('email') && this.email) {
    this.email = normalizeEmailForStorage(this.email);
  }
});

const LoginOtpModel: Model<ILoginOtp> =
  mongoose.models.LoginOtp ?? mongoose.model<ILoginOtp>('LoginOtp', LoginOtpSchema);

export default LoginOtpModel;
