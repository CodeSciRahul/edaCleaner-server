import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';

export function notFoundMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  next(ApiError.notFound(`${MESSAGES.ROUTE_NOT_FOUND}: ${req.method} ${req.originalUrl}`));
}
