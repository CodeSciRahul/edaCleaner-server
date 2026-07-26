export type NodeEnvironment = 'development' | 'production' | 'test';

export interface AwsEnvConfig {
  AWS_S3_BUCKET_NAME: string;
  AWS_S3_ACCESS_KEY_ID: string;
  AWS_S3_SECRET_ACCESS_KEY: string;
  AWS_S3_REGION: string;
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
  AWS: AwsEnvConfig;
}
