import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
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

export interface DeleteObjectsResult {
  deleted: string[];
  errors: string[];
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

  async deleteObject(storageUrlOrKey: string): Promise<boolean> {
    const bucket = env.AWS.AWS_S3_BUCKET_NAME;
    let key: string;
    try {
      key =
        storageUrlOrKey.startsWith('http://') ||
        storageUrlOrKey.startsWith('https://')
          ? extractS3KeyFromUrl(storageUrlOrKey)
          : storageUrlOrKey;
    } catch {
      return false;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      await s3Client.send(command);
      return true;
    } catch (error) {
      console.error(`Failed to delete S3 object ${key}:`, error);
      return false;
    }
  }

  async deleteObjects(
    storageUrlsOrKeys: string[],
  ): Promise<DeleteObjectsResult> {
    const bucket = env.AWS.AWS_S3_BUCKET_NAME;
    const keysToProcess = new Set<string>();

    for (const item of storageUrlsOrKeys) {
      if (!item) continue;
      try {
        const key =
          item.startsWith('http://') || item.startsWith('https://')
            ? extractS3KeyFromUrl(item)
            : item;
        if (key) keysToProcess.add(key);
      } catch (err) {
        console.warn(`Could not extract key from ${item}:`, err);
      }
    }

    const allKeys = Array.from(keysToProcess);
    const deleted: string[] = [];
    const errors: string[] = [];

    if (allKeys.length === 0) {
      return { deleted, errors };
    }

    const CHUNK_SIZE = 1000;
    for (let i = 0; i < allKeys.length; i += CHUNK_SIZE) {
      const chunk = allKeys.slice(i, i + CHUNK_SIZE);
      try {
        const command = new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: chunk.map((Key) => ({ Key })),
            Quiet: false,
          },
        });
        const res = await s3Client.send(command);
        if (res.Deleted) {
          deleted.push(...res.Deleted.map((d) => d.Key ?? '').filter(Boolean));
        }
        if (res.Errors) {
          errors.push(...res.Errors.map((e) => `${e.Key}: ${e.Message}`));
        }
      } catch (err) {
        console.error(
          'Batch DeleteObjects failed on chunk, trying individual deletion:',
          err,
        );
        for (const key of chunk) {
          const ok = await this.deleteObject(key);
          if (ok) deleted.push(key);
          else errors.push(key);
        }
      }
    }

    return { deleted, errors };
  }

  async deletePrefix(prefix: string): Promise<{ deletedCount: number }> {
    const bucket = env.AWS.AWS_S3_BUCKET_NAME;
    let continuationToken: string | undefined;
    let deletedCount = 0;

    const normalizedPrefix = prefix.replace(/^\/+/, '');
    if (!normalizedPrefix) {
      throw new Error('Refusing to delete with empty prefix');
    }

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: normalizedPrefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await s3Client.send(listCommand);
      const objects = (listResponse.Contents ?? [])
        .map((obj) => obj.Key)
        .filter((k): k is string => Boolean(k));

      if (objects.length > 0) {
        const { deleted } = await this.deleteObjects(objects);
        deletedCount += deleted.length;
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    return { deletedCount };
  }
}

export const s3Service = new S3Service();
