import type { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/index.js';
import type { ApiErrorDetail } from '../interfaces/api-response.interface.js';

/**
 * Express-validator result guard for route chains.
 * Usage: router.post('/', rules, validateRequest, controller)
 */
export function validateRequest(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const result = validationResult(req);

  if (result.isEmpty()) {
    next();
    return;
  }

  const errors: ApiErrorDetail[] = result.array().map((item) => {
    const field = 'path' in item ? String(item.path) : undefined;
    return {
      ...(field ? { field } : {}),
      message: item.msg,
      ...('value' in item ? { value: item.value } : {}),
    };
  });

  next(ApiError.validation(MESSAGES.VALIDATION_ERROR, errors));
}
