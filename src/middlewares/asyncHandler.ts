import type { NextFunction, Request, Response } from 'express';
import type { AsyncRequestHandler } from '../interfaces/express.interface.js';

/**
 * Wraps async route handlers so rejected promises are forwarded to the
 * global error middleware instead of crashing the process.
 */
export const asyncHandler = (
  handler: AsyncRequestHandler,
): ((req: Request, res: Response, next: NextFunction) => void) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};
