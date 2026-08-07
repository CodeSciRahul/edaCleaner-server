import bcrypt from 'bcryptjs';
import UserModel from '../models/user.model.js';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';
import {
  getAccessTokenExpiresAt,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from './token.service.js';
import { subscriptionService } from './subscription.service.js';
import { logger } from '../utils/logger.js';

const BCRYPT_ROUNDS = 12;

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  userAgent?: string | null | undefined;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string | null | undefined;
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

    await subscriptionService.assignFreePlan(user.id);
    logger.info('User registered with Free plan', { userId: user.id });

    return this.buildAuthResponse(
      { id: user.id, email: user.email, name: user.name, trialUsed: user.trialUsed },
      input.userAgent,
    );
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

    return this.buildAuthResponse(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        trialUsed: user.trialUsed,
      },
      input.userAgent,
    );
  }

  async refresh(refreshToken: string, userAgent?: string | null) {
    const rotated = await rotateRefreshToken(refreshToken, userAgent);
    const user = await UserModel.findById(rotated.userId).lean();
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
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        trialUsed: user.trialUsed,
      },
    };
  }

  async logout(refreshToken?: string | null) {
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    return { loggedOut: true };
  }

  async me(userId: string) {
    const user = await UserModel.findById(userId).lean();
    if (!user || !user.isActive) {
      throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);
    }

    const subscription = await subscriptionService.getStatus(userId);

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      trialUsed: user.trialUsed,
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

  private async buildAuthResponse(
    user: { id: string; email: string; name: string; trialUsed: boolean },
    userAgent?: string | null,
  ) {
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
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        trialUsed: user.trialUsed,
      },
      subscription,
      permissions,
    };
  }
}

export const authService = new AuthService();
