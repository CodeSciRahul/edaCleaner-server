import dotenv from 'dotenv';
import type { EnvConfig, NodeEnvironment } from '../interfaces/env.interface.js';

dotenv.config();

const REQUIRED_ENV_KEYS = [
  'NODE_ENV',
  'PORT',
  'MONGODB_URI',
  'JWT_SECRET',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRO_PRICE_ID',
  'STRIPE_PREMIUM_PRICE_ID',
] as const;

function getEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;

  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value.trim();
}

function parsePort(value: string): number {
  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}

function parseNodeEnv(value: string): NodeEnvironment {
  const allowed: NodeEnvironment[] = ['development', 'production', 'test'];

  if (!allowed.includes(value as NodeEnvironment)) {
    throw new Error(
      `Invalid NODE_ENV: ${value}. Expected one of: ${allowed.join(', ')}`,
    );
  }

  return value as NodeEnvironment;
}

function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function assertRequiredEnv(): void {
  for (const key of REQUIRED_ENV_KEYS) {
    if (!process.env[key] || process.env[key]?.trim() === '') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

assertRequiredEnv();

export const env: EnvConfig = Object.freeze({
  NODE_ENV: parseNodeEnv(getEnv('NODE_ENV', 'development')),
  PORT: parsePort(getEnv('PORT', '5000')),
  APP_NAME: getEnv('APP_NAME', 'edaCleaner-server'),
  API_PREFIX: getEnv('API_PREFIX', '/api/v1'),
  MONGODB_URI: getEnv('MONGODB_URI'),
  CORS_ORIGIN: parseCorsOrigins(
    getEnv('CORS_ORIGIN', 'http://localhost:5173,http://localhost:3000'),
  ),
  BODY_LIMIT: getEnv('BODY_LIMIT', '10mb'),
  LOG_LEVEL: getEnv('LOG_LEVEL', 'dev'),
  JWT_SECRET: getEnv('JWT_SECRET'),
  JWT_EXPIRES_IN: getEnv('JWT_EXPIRES_IN', '1h'),
  JWT_REFRESH_EXPIRES_IN: getEnv('JWT_REFRESH_EXPIRES_IN', '30d'),
  AWS: {
    AWS_S3_BUCKET_NAME: getEnv('AWS_S3_BUCKET_NAME'),
    AWS_S3_ACCESS_KEY_ID: getEnv('AWS_S3_ACCESS_KEY_ID'),
    AWS_S3_SECRET_ACCESS_KEY: getEnv('AWS_S3_SECRET_ACCESS_KEY'),
    AWS_S3_REGION: getEnv('AWS_S3_REGION'),
  },
  STRIPE: {
    STRIPE_SECRET_KEY: getEnv('STRIPE_SECRET_KEY'),
    STRIPE_PUBLISHABLE_KEY: getEnv('STRIPE_PUBLISHABLE_KEY', ''),
    STRIPE_WEBHOOK_SECRET: getEnv('STRIPE_WEBHOOK_SECRET'),
    STRIPE_PRO_PRICE_ID: getEnv('STRIPE_PRO_PRICE_ID'),
    STRIPE_PREMIUM_PRICE_ID: getEnv('STRIPE_PREMIUM_PRICE_ID'),
    STRIPE_PRO_PRODUCT_ID: getEnv('STRIPE_PRO_PRODUCT_ID', ''),
    STRIPE_PREMIUM_PRODUCT_ID: getEnv('STRIPE_PREMIUM_PRODUCT_ID', ''),
    STRIPE_SUCCESS_URL: getEnv(
      'STRIPE_SUCCESS_URL',
      'http://localhost:3000/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}',
    ),
    STRIPE_CANCEL_URL: getEnv(
      'STRIPE_CANCEL_URL',
      'http://localhost:3000/pricing?checkout=cancel',
    ),
  },
});

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
