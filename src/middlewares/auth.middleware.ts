import type { NextFunction, Request, Response } from 'express';
import { MESSAGES } from '../constants/index.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../services/token.service.js';
import type { AuthUser } from '../interfaces/auth.interface.js';

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

    const user: AuthUser = verifyAccessToken(token);
    req.user = user;
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired authentication token'));
  }
}

/** @deprecated Prefer token.service.signAccessToken — kept for import compatibility. */
export { signAccessToken } from '../services/token.service.js';
