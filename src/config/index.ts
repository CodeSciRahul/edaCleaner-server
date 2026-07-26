import type { Options as MorganOptions } from 'morgan';
import type { Request, Response } from 'express';
import { env, isProduction } from './env.js';

export const morganFormat = isProduction ? 'combined' : env.LOG_LEVEL;

export const morganOptions: MorganOptions<Request, Response> = {
  skip: (req: Request): boolean => req.url === '/health' || req.url === '/api/v1/health',
};
