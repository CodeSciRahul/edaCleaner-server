import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { MESSAGES } from '../constants/index.js';
import { ApiError } from '../utils/ApiError.js';
import type { AuthUser } from '../interfaces/auth.interface.js';

interface JwtPayload {
  sub: string;
  email: string;
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

/**
 * Requires a valid Bearer JWT. Attaches `req.user` — never trust userId from body.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      next(ApiError.unauthorized(MESSAGES.UNAUTHORIZED));
      return;
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    if (!decoded.sub || !decoded.email) {
      next(ApiError.unauthorized('Invalid authentication token'));
      return;
    }

    const user: AuthUser = { id: decoded.sub, email: decoded.email };
    req.user = user;
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired authentication token'));
  }
}

export function signAccessToken(user: AuthUser): string {
  const options: jwt.SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] & string,
  };

  return jwt.sign({ email: user.email }, env.JWT_SECRET, options);
}
