import { S3Client } from '@aws-sdk/client-s3';
import { env } from './env.js';

export const s3Client = new S3Client({
  region: env.AWS.AWS_S3_REGION,
  credentials: {
    accessKeyId: env.AWS.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: env.AWS.AWS_S3_SECRET_ACCESS_KEY,
  },
});

export const S3_UPLOAD_URL_EXPIRES_IN = 900; // 15 minutes
export const S3_DOWNLOAD_URL_EXPIRES_IN = 900; // 15 minutes
export const S3_UPLOAD_PREFIX = 'uploads';

export function buildS3ObjectUrl(key: string): string {
  const bucket = env.AWS.AWS_S3_BUCKET_NAME;
  const region = env.AWS.AWS_S3_REGION;
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

/** Extract object key from a virtual-hosted–style S3 HTTPS URL. */
export function extractS3KeyFromUrl(storageUrl: string): string {
  const url = new URL(storageUrl);
  const key = decodeURIComponent(url.pathname.replace(/^\//, ''));

  if (!key) {
    throw new Error('Invalid S3 storage URL');
  }

  return key;
}
