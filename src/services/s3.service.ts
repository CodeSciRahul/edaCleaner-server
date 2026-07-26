import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env.js';
import {
  s3Client,
  S3_DOWNLOAD_URL_EXPIRES_IN,
  S3_UPLOAD_PREFIX,
  S3_UPLOAD_URL_EXPIRES_IN,
  buildS3ObjectUrl,
  extractS3KeyFromUrl,
} from '../config/s3.js';
import { ApiError } from '../utils/ApiError.js';

export interface CreatePresignedUploadInput {
  fileName: string;
  contentType: string;
  prefix?: string;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  bucket: string;
  contentType: string;
  expiresIn: number;
  storageUrl: string;
}

export interface CreatePresignedDownloadInput {
  storageUrl: string;
  fileName: string;
  expiresIn?: number;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  key: string;
  bucket: string;
  fileName: string;
  expiresIn: number;
}

function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName).trim();
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, '_').replace(/\s+/g, '_');

  if (!cleaned || cleaned === '.' || cleaned === '..') {
    throw ApiError.badRequest('Invalid file name');
  }

  return cleaned.slice(0, 200);
}

function buildObjectKey(fileName: string, prefix?: string): string {
  const safeName = sanitizeFileName(fileName);
  const segments = [S3_UPLOAD_PREFIX];

  if (prefix?.trim()) {
    const safePrefix = prefix
      .trim()
      .replace(/\\/g, '/')
      .split('/')
      .map((part) => part.replace(/[^\w.\-]+/g, '_'))
      .filter((part) => part && part !== '.' && part !== '..')
      .join('/');

    if (safePrefix) {
      segments.push(safePrefix);
    }
  }

  segments.push(randomUUID(), safeName);
  return segments.join('/');
}

function escapeContentDispositionFileName(fileName: string): string {
  return fileName.replace(/["\\\r\n]/g, '_');
}

export class S3Service {
  async createPresignedUpload(
    input: CreatePresignedUploadInput,
  ): Promise<PresignedUploadResult> {
    const bucket = env.AWS.AWS_S3_BUCKET_NAME;
    const key = buildObjectKey(input.fileName, input.prefix);
    const contentType = input.contentType.trim();

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: S3_UPLOAD_URL_EXPIRES_IN,
    });

    return {
      uploadUrl,
      key,
      bucket,
      contentType,
      expiresIn: S3_UPLOAD_URL_EXPIRES_IN,
      storageUrl: buildS3ObjectUrl(key),
    };
  }

  async createPresignedDownload(
    input: CreatePresignedDownloadInput,
  ): Promise<PresignedDownloadResult> {
    const bucket = env.AWS.AWS_S3_BUCKET_NAME;
    let key: string;

    try {
      key = extractS3KeyFromUrl(input.storageUrl);
    } catch {
      throw ApiError.badRequest('Invalid storage URL for download');
    }

    const expiresIn = input.expiresIn ?? S3_DOWNLOAD_URL_EXPIRES_IN;
    const safeName = escapeContentDispositionFileName(
      sanitizeFileName(input.fileName),
    );

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safeName}"`,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return {
      downloadUrl,
      key,
      bucket,
      fileName: safeName,
      expiresIn,
    };
  }
}

export const s3Service = new S3Service();
