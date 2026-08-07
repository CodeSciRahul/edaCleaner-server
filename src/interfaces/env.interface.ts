export type NodeEnvironment = 'development' | 'production' | 'test';

export interface AwsEnvConfig {
  AWS_S3_BUCKET_NAME: string;
  AWS_S3_ACCESS_KEY_ID: string;
  AWS_S3_SECRET_ACCESS_KEY: string;
  AWS_S3_REGION: string;
}

export interface StripeEnvConfig {
  STRIPE_SECRET_KEY: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRO_PRICE_ID: string;
  STRIPE_PREMIUM_PRICE_ID: string;
  STRIPE_PRO_PRODUCT_ID: string;
  STRIPE_PREMIUM_PRODUCT_ID: string;
  STRIPE_SUCCESS_URL: string;
  STRIPE_CANCEL_URL: string;
}

export interface EnvConfig {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  APP_NAME: string;
  API_PREFIX: string;
  MONGODB_URI: string;
  CORS_ORIGIN: string[];
  BODY_LIMIT: string;
  LOG_LEVEL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  JWT_REFRESH_EXPIRES_IN: string;
  AWS: AwsEnvConfig;
  STRIPE: StripeEnvConfig;
}
