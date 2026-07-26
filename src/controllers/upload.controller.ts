import type { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { MESSAGES } from '../constants/index.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { s3Service } from '../services/s3.service.js';

export class UploadController {
  public createPresignedUrl = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { fileName, contentType, prefix } = req.body as {
        fileName: string;
        contentType: string;
        prefix?: string;
      };

      const data = await s3Service.createPresignedUpload({
        fileName,
        contentType,
        ...(prefix !== undefined ? { prefix } : {}),
      });

      ApiResponse.success({
        res,
        data,
        message: MESSAGES.PRESIGNED_URL_CREATED,
        statusCode: HTTP_STATUS.OK,
      });
    },
  );
}

export const uploadController = new UploadController();
