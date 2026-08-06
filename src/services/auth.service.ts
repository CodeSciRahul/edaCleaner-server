import bcrypt from 'bcryptjs';
import UserModel from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';
import { signAccessToken } from '../middlewares/auth.middleware.js';
import { subscriptionService } from './subscription.service.js';
import { logger } from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    const existing = await UserModel.findOne({ email }).lean();
    if (existing) {
      throw ApiError.conflict('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await UserModel.create({
      email,
      passwordHash,
      name: input.name?.trim() ?? '',
      trialUsed: false,
      isActive: true,
    });

    // Free plan is assigned locally — no Stripe subscription.
    await subscriptionService.assignFreePlan(user.id);

    logger.info('User registered with Free plan', { userId: user.id });

    const token = signAccessToken({ id: user.id, email: user.email });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async login(input: LoginInput) {
    const email = input.email.trim().toLowerCase();
    const user = await UserModel.findOne({ email }).select('+passwordHash');

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const token = signAccessToken({ id: user.id, email: user.email });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async me(userId: string) {
    const user = await UserModel.findById(userId).lean();
    if (!user || !user.isActive) {
      throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);
    }

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      trialUsed: user.trialUsed,
    };
  }
}

export const authService = new AuthService();
