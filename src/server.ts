import http from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { MESSAGES } from './constants/index.js';
import { planService } from './services/plan.service.js';
import { logger } from './utils/logger.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap(): Promise<void> {
  await connectDatabase();
  await planService.seedPlans();

  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, () => {
    logger.info(MESSAGES.SERVER_STARTED, {
      name: env.APP_NAME,
      port: env.PORT,
      env: env.NODE_ENV,
      apiPrefix: env.API_PREFIX,
    });
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(MESSAGES.SERVER_SHUTDOWN, { signal });

    const forceExitTimer = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    forceExitTimer.unref();

    server.close(async (closeError) => {
      if (closeError) {
        logger.error('Error while closing HTTP server', {
          error: closeError.message,
        });
      }

      try {
        await disconnectDatabase();
        process.exit(closeError ? 1 : 0);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown shutdown error';
        logger.error('Error during graceful shutdown', { error: message });
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
    });
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    void shutdown('uncaughtException');
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Bootstrap failed';
  logger.error(message);
  process.exit(1);
});
