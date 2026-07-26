import type { Response } from 'express';
import type {
  ApiErrorDetail,
  ApiErrorResponse,
  ApiSuccessResponse,
} from '../interfaces/api-response.interface.js';
import { HTTP_STATUS, type HttpStatusCode } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/index.js';

interface SuccessOptions<T> {
  res: Response;
  data?: T | null;
  message?: string;
  statusCode?: HttpStatusCode;
  meta?: Record<string, unknown>;
}

interface ErrorOptions {
  res: Response;
  message?: string;
  statusCode?: HttpStatusCode;
  errors?: ApiErrorDetail[];
  stack?: string;
}

export class ApiResponse {
  static success<T>({
    res,
    data = null,
    message = MESSAGES.SUCCESS,
    statusCode = HTTP_STATUS.OK,
    meta,
  }: SuccessOptions<T>): Response {
    const payload: ApiSuccessResponse<T> = {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    };

    if (meta) {
      payload.meta = meta;
    }

    if (res.req.requestId) {
      payload.requestId = res.req.requestId;
    }

    return res.status(statusCode).json(payload);
  }

  static created<T>(
    res: Response,
    data: T,
    message: string = MESSAGES.CREATED,
  ): Response {
    return ApiResponse.success({
      res,
      data,
      message,
      statusCode: HTTP_STATUS.CREATED,
    });
  }

  static noContent(res: Response): Response {
    return res.status(HTTP_STATUS.NO_CONTENT).send();
  }

  static error({
    res,
    message = MESSAGES.INTERNAL_ERROR,
    statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    errors,
    stack,
  }: ErrorOptions): Response {
    const payload: ApiErrorResponse = {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    };

    if (errors && errors.length > 0) {
      payload.errors = errors;
    }

    if (stack) {
      payload.stack = stack;
    }

    if (res.req.requestId) {
      payload.requestId = res.req.requestId;
    }

    return res.status(statusCode).json(payload);
  }
}
