import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { MESSAGES } from '../constants/index.js';
import { env } from '../config/env.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

export class HealthController {
  public check = asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const dbState = mongoose.connection.readyState;
    const isDbConnected = dbState === 1;

    const payload = {
      service: env.APP_NAME,
      status: isDbConnected ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
      database: {
        status: isDbConnected ? 'connected' : 'disconnected',
        readyState: dbState,
      },
    };

    ApiResponse.success({
      res,
      data: payload,
      message: MESSAGES.HEALTH_OK,
      statusCode: isDbConnected
        ? HTTP_STATUS.OK
        : HTTP_STATUS.SERVICE_UNAVAILABLE,
    });
  });
}

export const healthController = new HealthController();
