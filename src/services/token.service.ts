import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthUser } from '../interfaces/auth.interface.js';
import RefreshTokenModel from '../models/refreshToken.model.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

interface AccessPayload {
  sub: string;
  email: string;
  typ: 'access';
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function parseDurationToMs(value: string): number {
  const match = /^(\d+)([smhd])$/i.exec(value.trim());
  if (!match) {
    // Fallback 30 days
    return 30 * 24 * 60 * 60 * 1000;
  }
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * (multipliers[unit] ?? 86_400_000);
}

export function signAccessToken(user: AuthUser): string {
  const options: jwt.SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] & string,
  };

  return jwt.sign(
    { email: user.email, typ: 'access' } satisfies Omit<AccessPayload, 'sub'>,
    env.JWT_SECRET,
    options,
  );
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_SECRET) as AccessPayload & {
    sub: string;
  };
  if (!decoded.sub || !decoded.email) {
    throw ApiError.unauthorized('Invalid authentication token');
  }
  // Older tokens may omit typ; reject only explicit non-access types.
  if (decoded.typ != null && decoded.typ !== 'access') {
    throw ApiError.unauthorized('Invalid token type');
  }
  return { id: decoded.sub, email: decoded.email };
}

export async function issueRefreshToken(
  userId: string,
  userAgent?: string | null,
): Promise<{ refreshToken: string; expiresAt: Date }> {
  const refreshToken = randomBytes(48).toString('base64url');
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(
    Date.now() + parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN),
  );

  await RefreshTokenModel.create({
    userId,
    tokenHash,
    expiresAt,
    revokedAt: null,
    replacedByHash: null,
    userAgent: userAgent ?? null,
  });

  return { refreshToken, expiresAt };
}

export async function rotateRefreshToken(
  presentedToken: string,
  userAgent?: string | null,
): Promise<{ userId: string; refreshToken: string; expiresAt: Date }> {
  const presentedHash = hashToken(presentedToken);
  const existing = await RefreshTokenModel.findOne({ tokenHash: presentedHash });

  if (!existing || existing.revokedAt) {
    logger.warn('Refresh token reuse or unknown token');
    throw ApiError.unauthorized('Invalid refresh token');
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw ApiError.unauthorized('Refresh token expired');
  }

  const next = await issueRefreshToken(
    existing.userId.toString(),
    userAgent ?? existing.userAgent,
  );

  existing.revokedAt = new Date();
  existing.replacedByHash = hashToken(next.refreshToken);
  await existing.save();

  return {
    userId: existing.userId.toString(),
    refreshToken: next.refreshToken,
    expiresAt: next.expiresAt,
  };
}

export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  const presentedHash = hashToken(presentedToken);
  await RefreshTokenModel.updateOne(
    { tokenHash: presentedHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await RefreshTokenModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export function getAccessTokenExpiresAt(): Date {
  return new Date(Date.now() + parseDurationToMs(env.JWT_EXPIRES_IN));
}
