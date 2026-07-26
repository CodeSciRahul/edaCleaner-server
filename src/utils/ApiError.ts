import { HTTP_STATUS, type HttpStatusCode } from '../constants/httpStatus.js';
import type { ApiErrorDetail } from '../interfaces/api-response.interface.js';

export class ApiError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly isOperational: boolean;
  public readonly errors: ApiErrorDetail[];

  constructor(
    message: string,
    statusCode: HttpStatusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    errors: ApiErrorDetail[] = [],
    isOperational = true,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.errors = errors;
    this.name = this.constructor.name;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(
    message: string,
    errors: ApiErrorDetail[] = [],
  ): ApiError {
    return new ApiError(message, HTTP_STATUS.BAD_REQUEST, errors);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(message, HTTP_STATUS.UNAUTHORIZED);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(message, HTTP_STATUS.FORBIDDEN);
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(message, HTTP_STATUS.NOT_FOUND);
  }

  static conflict(message: string): ApiError {
    return new ApiError(message, HTTP_STATUS.CONFLICT);
  }

  static validation(
    message: string,
    errors: ApiErrorDetail[] = [],
  ): ApiError {
    return new ApiError(message, HTTP_STATUS.UNPROCESSABLE_ENTITY, errors);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, [], false);
  }
}
