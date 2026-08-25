import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import type Stripe from 'stripe';
import UserModel, { type UserDocument } from '../models/user.model.js';
import LoginOtpModel from '../models/loginOtp.model.js';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';
import { env } from '../config/env.js';
import {
  getAccessTokenExpiresAt,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from './token.service.js';
import { subscriptionService } from './subscription.service.js';
import { mailService } from './mail.service.js';
import { logger } from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  userAgent?: string | null | undefined;
}

export interface LoginInput {
  email: string;
  password?: string;
  userAgent?: string | null | undefined;
}

type AuthUser = { id: string; email: string; name: string; trialUsed: boolean; mustSetPassword: boolean };

export class AuthService {
  async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    const existing = await UserModel.findOne({ email }).select('+passwordHash');
    if (existing) {
      if (existing.mustSetPassword && existing.isActive) {
        existing.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
        existing.mustSetPassword = false;
        if (input.name?.trim()) existing.name = input.name.trim();
        await existing.save();
        logger.info('Guest checkout account claimed', { userId: existing.id });
        return this.buildAuthResponse(
          {
            id: existing.id,
            email: existing.email,
            name: existing.name,
            trialUsed: existing.trialUsed,
            mustSetPassword: false,
          },
          input.userAgent,
        );
      }
      throw ApiError.conflict('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const user = await UserModel.create({
      email,
      passwordHash,
      name: input.name?.trim() ?? '',
      trialUsed: false,
      isActive: true,
      mustSetPassword: false,
    });

    await subscriptionService.assignFreePlan(user.id);
    logger.info('User registered with Free plan', { userId: user.id });

    return this.buildAuthResponse(this.toAuthUser(user), input.userAgent);
  }

  async ensureUserFromStripeCustomer(customer: Stripe.Customer) {
    const email = customer.email?.trim().toLowerCase() ?? '';
    if (!email) {
      logger.info('Stripe customer has no email yet', { customerId: customer.id });
      return { user: null, created: false as const };
    }
    return this.ensureUserFromCheckoutEmail(email, customer.id, customer.name ?? '');
  }

  /**
   * Finds or creates a passwordless user from Stripe checkout / customer email.
   */
  async ensureUserFromCheckoutEmail(
    email: string,
    stripeCustomerId: string,
    name = '',
  ) {
    const normalized = email.trim().toLowerCase();
    let user = await UserModel.findOne({ stripeCustomerId });
    if (user) {
      if (user.email !== normalized) {
        const clash = await UserModel.findOne({ email: normalized });
        if (!clash) {
          user.email = normalized;
          await user.save();
        }
      }
      return { user, created: false };
    }

    user = await UserModel.findOne({ email: normalized });
    if (user) {
      if (!user.stripeCustomerId) {
        user.stripeCustomerId = stripeCustomerId;
        await user.save();
      }
      return { user, created: false };
    }

    try {
      user = await UserModel.create({
        email: normalized,
        passwordHash: null,
        name: name.trim(),
        stripeCustomerId,
        trialUsed: false,
        isActive: true,
        mustSetPassword: true,
      });
      await subscriptionService.assignFreePlan(user.id);
      logger.info('Passwordless user created from Stripe', {
        userId: user.id,
        email: normalized,
      });
      return { user, created: true };
    } catch {
      user = await UserModel.findOne({ email: normalized });
      if (!user) {
        throw ApiError.internal('Failed to create account from checkout email');
      }
      if (!user.stripeCustomerId) {
        user.stripeCustomerId = stripeCustomerId;
        await user.save();
      }
      return { user, created: false };
    }
  }

  async login(input: LoginInput) {
    const email = input.email.trim().toLowerCase();
    const user = await UserModel.findOne({ email }).select('+passwordHash');

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    if (user.mustSetPassword || !user.passwordHash) {
      await this.sendLoginOtp(email);
      return { requiresOtp: true as const };
    }

    const password = input.password ?? '';
    if (!password) {
      return { requiresPassword: true as const };
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    return this.buildAuthResponse(this.toAuthUser(user), input.userAgent);
  }

  async sendLoginOtp(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await UserModel.findOne({ email: normalized }).select('+passwordHash');
    if (!user || !user.isActive || (!user.mustSetPassword && user.passwordHash)) {
      logger.info('OTP request ignored', { email: normalized });
      return { requiresOtp: true as const };
    }

    const existing = await LoginOtpModel.findOne({ email: normalized });
    if (existing && Date.now() - existing.sentAt.getTime() < OTP_RESEND_MS) {
      throw ApiError.tooManyRequests('Wait a moment before requesting another code');
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = this.hashOtp(normalized, code);
    const now = new Date();

    await LoginOtpModel.findOneAndUpdate(
      { email: normalized },
      {
        email: normalized,
        codeHash,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        attempts: 0,
        sentAt: now,
      },
      { upsert: true, new: true },
    );

    await mailService.sendLoginOtp(normalized, code);
    logger.info('Login OTP sent', { userId: user.id });
    return { requiresOtp: true as const };
  }

  async verifyLoginOtp(input: {
    email: string;
    code: string;
    userAgent?: string | null | undefined;
  }) {
    const email = input.email.trim().toLowerCase();
    const code = input.code.trim();
    const record = await LoginOtpModel.findOne({ email });
    if (!record) {
      throw ApiError.unauthorized('Invalid or expired verification code');
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      await record.deleteOne();
      throw ApiError.unauthorized('Verification code expired. Request a new one');
    }

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await record.deleteOne();
      throw ApiError.tooManyRequests('Too many attempts. Request a new code');
    }

    const expected = Buffer.from(record.codeHash);
    const actual = Buffer.from(this.hashOtp(email, code));
    const matches =
      expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!matches) {
      record.attempts += 1;
      await record.save();
      throw ApiError.unauthorized('Invalid verification code');
    }

    await record.deleteOne();

    const user = await UserModel.findOne({ email });
    if (!user || !user.isActive) {
      throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);
    }

    logger.info('Login OTP verified', { userId: user.id });
    return this.buildAuthResponse(this.toAuthUser(user), input.userAgent);
  }

  async setPassword(userId: string, password: string) {
    const user = await UserModel.findById(userId).select('+passwordHash');
    if (!user || !user.isActive) {
      throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);
    }

    user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.mustSetPassword = false;
    await user.save();
    logger.info('Password set after OTP login', { userId: user.id });

    return {
      mustSetPassword: false,
      user: this.toAuthUser(user),
    };
  }

  async refresh(refreshToken: string, userAgent?: string | null) {
    const rotated = await rotateRefreshToken(refreshToken, userAgent);
    const user = await UserModel.findById(rotated.userId);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);
    }

    const accessToken = signAccessToken({ id: user._id.toString(), email: user.email });
    const accessExpiresAt = getAccessTokenExpiresAt();

    logger.info('Access token refreshed', { userId: user._id.toString() });

    return {
      token: accessToken,
      accessToken,
      refreshToken: rotated.refreshToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: rotated.expiresAt.toISOString(),
      user: this.toAuthUser(user),
    };
  }

  async logout(refreshToken?: string | null) {
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    return { loggedOut: true };
  }

  async me(userId: string) {
    const user = await UserModel.findById(userId);
    if (!user || !user.isActive) {
      throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);
    }

    const subscription = await subscriptionService.getStatus(userId);

    return {
      ...this.toAuthUser(user),
      subscription,
      permissions: this.permissionsFromFeatures(subscription.features),
    };
  }

  permissionsFromFeatures(features: string[]): string[] {
    const permissions = new Set<string>(['app:use', 'scan:smart', 'cleanup:basic']);
    for (const feature of features) {
      const key = feature
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      if (key) permissions.add(`feature:${key}`);
    }
    return [...permissions];
  }

  private toAuthUser(user: UserDocument): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      trialUsed: user.trialUsed,
      mustSetPassword: Boolean(user.mustSetPassword),
    };
  }

  private hashOtp(email: string, code: string): string {
    return createHmac('sha256', env.JWT_SECRET)
      .update(`${email}:${code}`)
      .digest('hex');
  }

  private async buildAuthResponse(user: AuthUser, userAgent?: string | null) {
    const accessToken = signAccessToken({ id: user.id, email: user.email });
    const accessExpiresAt = getAccessTokenExpiresAt();
    const refresh = await issueRefreshToken(user.id, userAgent);
    const subscription = await subscriptionService.getStatus(user.id);
    const permissions = this.permissionsFromFeatures(subscription.features);

    return {
      token: accessToken,
      accessToken,
      refreshToken: refresh.refreshToken,
      accessExpiresAt: accessExpiresAt.toISOString(),
      refreshExpiresAt: refresh.expiresAt.toISOString(),
      user,
      subscription,
      permissions,
    };
  }
}

export const authService = new AuthService();
