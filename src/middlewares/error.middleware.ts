import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS, type HttpStatusCode } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/index.js';
import { isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';
import type { ApiErrorDetail } from '../interfaces/api-response.interface.js';

function normalizeError(error: unknown): {
  statusCode: HttpStatusCode;
  message: string;
  errors: ApiErrorDetail[];
  stack?: string;
  isOperational: boolean;
} {
  if (error instanceof ApiError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      errors: error.errors,
      ...(error.stack ? { stack: error.stack } : {}),
      isOperational: error.isOperational,
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const errors: ApiErrorDetail[] = Object.values(error.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));

    return {
      statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
      message: MESSAGES.VALIDATION_ERROR,
      errors,
      isOperational: true,
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: `Invalid ${error.path}: ${String(error.value)}`,
      errors: [],
      isOperational: true,
    };
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: number }).code === 11000
  ) {
    return {
      statusCode: HTTP_STATUS.CONFLICT,
      message: 'Duplicate key error',
      errors: [],
      isOperational: true,
    };
  }

  if (error instanceof SyntaxError && 'status' in error && 'body' in error) {
    return {
      statusCode: HTTP_STATUS.BAD_REQUEST,
      message: 'Invalid JSON payload',
      errors: [],
      isOperational: true,
    };
  }

  if (error instanceof Error) {
    return {
      statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
      message: isProduction ? MESSAGES.INTERNAL_ERROR : error.message,
      errors: [],
      ...(error.stack ? { stack: error.stack } : {}),
      isOperational: false,
    };
  }

  return {
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    message: MESSAGES.INTERNAL_ERROR,
    errors: [],
    isOperational: false,
  };
}

export function globalErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const normalized = normalizeError(error);

  if (!normalized.isOperational || normalized.statusCode >= 500) {
    logger.error(normalized.message, {
      statusCode: normalized.statusCode,
      stack: normalized.stack,
      errors: normalized.errors,
    });
  } else {
    logger.warn(normalized.message, {
      statusCode: normalized.statusCode,
      errors: normalized.errors,
    });
  }

  const errorOptions: Parameters<typeof ApiResponse.error>[0] = {
    res,
    message: normalized.message,
    statusCode: normalized.statusCode,
    errors: normalized.errors,
  };

  if (!isProduction && normalized.stack) {
    errorOptions.stack = normalized.stack;
  }

  ApiResponse.error(errorOptions);
}
