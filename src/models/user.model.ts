import mongoose, { type HydratedDocument, type Model } from 'mongoose';

export interface IUser {
  email: string;
  passwordHash: string | null;
  name: string;
  stripeCustomerId: string | null;
  trialUsed: boolean;
  isActive: boolean;
  /** True when the user was created from Stripe checkout and has not chosen a password yet. */
  mustSetPassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const UserSchema = new mongoose.Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: false,
      default: null,
      select: false,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    stripeCustomerId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    trialUsed: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    mustSetPassword: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const UserModel: Model<IUser> =
  mongoose.models.User ?? mongoose.model<IUser>('User', UserSchema);

export default UserModel;
