import type { CorsOptions } from 'cors';
import { env, isProduction } from './env.js';

export const corsOptions: CorsOptions = {
  origin(
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ): void {
    // Allow non-browser clients (desktop app, curl, Postman) with no Origin
    if (!origin) {
      callback(null, true);
      return;
    }

    if (env.CORS_ORIGIN.includes(origin) || !isProduction) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Request-Id',
    'X-Device-Id',
    'X-App-Version',
  ],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86_400,
};
