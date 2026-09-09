import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import type Stripe from 'stripe';
import UserModel, { type UserDocument } from '../models/user.model.js';
import LoginOtpModel, { type OtpPurpose } from '../models/loginOtp.model.js';
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
import {
  normalizeEmailForStorage,
  findUserByEmail,
} from '../utils/email.js';

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

type AuthUser = {
  id: string;
  email: string;
  name: string;
  trialUsed: boolean;
  mustSetPassword: boolean;
  emailVerified: boolean;
};

export class AuthService {
  async register(input: RegisterInput) {
    const email = normalizeEmailForStorage(input.email);
    const existing = await findUserByEmail(email, { select: '+passwordHash' });
    if (existing) {
      if (existing.mustSetPassword && existing.isActive) {
        existing.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
        existing.mustSetPassword = false;
        existing.emailVerified = true;
        if (input.name?.trim()) existing.name = input.name.trim();
        await existing.save();
        logger.info('Guest checkout account claimed', { userId: existing.id });
        // Welcome may already have been sent at Stripe user creation; sendSafe is fine to retry.
        await mailService.sendWelcomeEmail(email, { name: existing.name });
        return this.buildAuthResponse(
          {
            id: existing.id,
            email: existing.email,
            name: existing.name,
            trialUsed: existing.trialUsed,
            mustSetPassword: false,
            emailVerified: true,
          },
          input.userAgent,
        );
      }

      if (existing.emailVerified === false && existing.isActive) {
        if (existing.passwordHash) {
          const valid = await bcrypt.compare(input.password, existing.passwordHash);
          if (!valid) {
            throw ApiError.conflict('An account with this email already exists');
          }
        } else {
          existing.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
          if (input.name?.trim()) existing.name = input.name.trim();
          await existing.save();
        }
        await this.issueOtp(email, 'register');
        return { requiresOtp: true as const, purpose: 'register' as const };
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
      emailVerified: false,
    });

    await subscriptionService.assignFreePlan(user.id);
    logger.info('User registered pending email verification', { userId: user.id });

    // Welcome is sent after OTP verification so it does not compete with the
    // verification email (same-second bursts often drop the first message).
    await this.issueOtp(email, 'register');
    return { requiresOtp: true as const, purpose: 'register' as const };
  }

  async ensureUserFromStripeCustomer(customer: Stripe.Customer) {
    const email = normalizeEmailForStorage(customer.email ?? '');
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
    const normalized = normalizeEmailForStorage(email);
    let user = await UserModel.findOne({ stripeCustomerId });
    logger.info('User found from Stripe customer ID', { userId: user?.id });
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

    user = await findUserByEmail(normalized);
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
        emailVerified: false,
      });
      await subscriptionService.assignFreePlan(user.id);
      logger.info('Passwordless user created from Stripe', {
        userId: user.id,
        email: normalized,
      });
      await mailService.sendWelcomeEmail(normalized, { name: user.name });
      return { user, created: true };
    } catch {
      user = await findUserByEmail(normalized);
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
    const email = normalizeEmailForStorage(input.email);
    const user = await findUserByEmail(email, { select: '+passwordHash' });

    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    if (user.emailVerified === false) {
      await this.issueOtp(email, 'register');
      return { requiresOtp: true as const, purpose: 'register' as const };
    }

    if (user.mustSetPassword || !user.passwordHash) {
      await this.issueOtp(email, 'login');
      return { requiresOtp: true as const, purpose: 'login' as const };
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

  /** Resend OTP for login / unverified register flows. */
  async sendLoginOtp(email: string) {
    const user = await findUserByEmail(email, { select: '+passwordHash' });
    const storedEmail = user
      ? normalizeEmailForStorage(user.email)
      : normalizeEmailForStorage(email);

    if (!user || !user.isActive) {
      logger.info('OTP request ignored', { email: storedEmail });
      return { requiresOtp: true as const };
    }

    if (user.emailVerified === false) {
      await this.issueOtp(storedEmail, 'register');
      return { requiresOtp: true as const };
    }

    if (user.mustSetPassword || !user.passwordHash) {
      await this.issueOtp(storedEmail, 'login');
      return { requiresOtp: true as const };
    }

    logger.info('OTP request ignored', { email: storedEmail });
    return { requiresOtp: true as const };
  }

  async verifyLoginOtp(input: {
    email: string;
    code: string;
    userAgent?: string | null | undefined;
  }) {
    const user = await findUserByEmail(input.email, { select: '+passwordHash' });
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Invalid or expired verification code');
    }

    const email = normalizeEmailForStorage(user.email);
    await this.consumeOtp(email, input.code, ['login', 'register']);

    const newlyVerified = user.emailVerified === false;
    if (newlyVerified) {
      user.emailVerified = true;
      await user.save();
      // Manual signup only — Stripe passwordless users already got welcome at create.
      if (user.passwordHash) {
        await mailService.sendWelcomeEmail(email, { name: user.name });
      }
    }

    logger.info('Login OTP verified', { userId: user.id, newlyVerified });
    return this.buildAuthResponse(this.toAuthUser(user), input.userAgent);
  }

  async forgotPassword(emailInput: string) {
    const email = normalizeEmailForStorage(emailInput);
    const user = await findUserByEmail(email, { select: '+passwordHash' });

    // Always succeed to avoid account enumeration.
    if (!user || !user.isActive || (!user.passwordHash && !user.mustSetPassword)) {
      logger.info('Password reset OTP ignored', { email });
      return { requiresOtp: true as const };
    }

    await this.issueOtp(normalizeEmailForStorage(user.email), 'reset');
    return { requiresOtp: true as const };
  }

  async resetPassword(input: {
    email: string;
    code: string;
    password: string;
    userAgent?: string | null | undefined;
  }) {
    const user = await findUserByEmail(input.email, { select: '+passwordHash' });
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('Invalid or expired verification code');
    }

    const email = normalizeEmailForStorage(user.email);
    await this.consumeOtp(email, input.code, ['reset']);

    user.passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    user.mustSetPassword = false;
    user.emailVerified = true;
    await user.save();

    logger.info('Password reset via OTP', { userId: user.id });
    return this.buildAuthResponse(this.toAuthUser(user), input.userAgent);
  }

  async setPassword(userId: string, password: string) {
    const user = await UserModel.findById(userId).select('+passwordHash');
    if (!user || !user.isActive) {
      throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);
    }

    user.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.mustSetPassword = false;
    user.emailVerified = true;
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

  private async issueOtp(email: string, purpose: OtpPurpose) {
    const storedEmail = normalizeEmailForStorage(email);
    const existing = await LoginOtpModel.findOne({ email: storedEmail });
    if (existing && Date.now() - existing.sentAt.getTime() < OTP_RESEND_MS) {
      throw ApiError.tooManyRequests('Wait a moment before requesting another code');
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = this.hashOtp(storedEmail, code);
    const now = new Date();

    await LoginOtpModel.findOneAndUpdate(
      { email: storedEmail },
      {
        email: storedEmail,
        codeHash,
        purpose,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        attempts: 0,
        sentAt: now,
      },
      { upsert: true, new: true },
    );

    if (purpose === 'register') {
      await mailService.sendRegisterOtp(storedEmail, code);
    } else if (purpose === 'reset') {
      await mailService.sendResetOtp(storedEmail, code);
    } else {
      await mailService.sendLoginOtp(storedEmail, code);
    }

    logger.info('OTP sent', { email: storedEmail, purpose });
  }

  private async consumeOtp(
    email: string,
    rawCode: string,
    allowedPurposes: OtpPurpose[],
  ): Promise<OtpPurpose> {
    const code = rawCode.trim();
    const record = await LoginOtpModel.findOne({ email });
    if (!record) {
      throw ApiError.unauthorized('Invalid or expired verification code');
    }

    if (!allowedPurposes.includes(record.purpose)) {
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

    const purpose = record.purpose;
    await record.deleteOne();
    return purpose;
  }

  private toAuthUser(user: UserDocument): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      trialUsed: user.trialUsed,
      mustSetPassword: Boolean(user.mustSetPassword),
      emailVerified: user.emailVerified !== false,
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
