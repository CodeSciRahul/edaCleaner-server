import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import { env } from './config/env.js';
import { corsOptions } from './config/cors.js';
import { morganFormat, morganOptions } from './config/index.js';
import { requestIdMiddleware } from './middlewares/requestId.middleware.js';
import { notFoundMiddleware } from './middlewares/notFound.middleware.js';
import { globalErrorHandler } from './middlewares/error.middleware.js';
import { webhookController } from './controllers/webhook.controller.js';
import v1Router from './routes/v1/index.js';
import { healthController } from './controllers/health.controller.js';

export function createApp(): Application {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(compression());
  app.use(morgan(morganFormat, morganOptions));

  /**
   * Stripe webhooks require the raw body for signature verification.
   * Must be registered before express.json().
   */
  app.post(
    `${env.API_PREFIX}/stripe/webhook`,
    express.raw({ type: 'application/json' }),
    webhookController.handle,
  );

  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT }));

  // Unversioned liveness probe for load balancers / orchestrators
  app.get('/health', healthController.check);

  // Versioned API surface — currently /api/v1
  app.use(env.API_PREFIX, v1Router);

  app.use(notFoundMiddleware);
  app.use(globalErrorHandler);

  return app;
}
