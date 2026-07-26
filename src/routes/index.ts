import { Router } from 'express';
import v1Router from './v1/index.js';
import { env } from '../config/env.js';

/**
 * Central route aggregator.
 * Mount additional API versions here (e.g. /v2) as the product evolves.
 */
const apiRouter = Router();

apiRouter.use('/v1', v1Router);

export function getApiMountPath(): string {
  // Strip trailing /v1 from API_PREFIX so /api hosts all versions
  return env.API_PREFIX.replace(/\/v\d+$/, '') || '/api';
}

export default apiRouter;
