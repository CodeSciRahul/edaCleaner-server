import type { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { MESSAGES } from '../constants/index.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import {
  versionService,
  type Architecture,
  type CreateVersionInput,
  type AddVersionFilesInput,
  type Platform,
} from '../services/version.service.js';
import { s3Service } from '../services/s3.service.js';

export class VersionController {
  public getNextBuildNumber = asyncHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const buildNumber = await versionService.getNextBuildNumber();

      ApiResponse.success({
        res,
        data: { buildNumber },
        message: MESSAGES.SUCCESS,
      });
    },
  );

  public getLatest = asyncHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const data = await versionService.getLatestPublished();

      ApiResponse.success({
        res,
        data,
        message: MESSAGES.SUCCESS,
      });
    },
  );

  public downloadLatest = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const platform = String(req.query.platform) as Platform;
      const architecture =
        typeof req.query.architecture === 'string'
          ? (req.query.architecture as Architecture)
          : undefined;

      const target = await versionService.resolveDownloadTarget({
        platform,
        ...(architecture ? { architecture } : {}),
      });

      const signed = await s3Service.createPresignedDownload({
        storageUrl: target.file.storageUrl,
        fileName: target.file.fileName,
      });

      ApiResponse.success({
        res,
        data: {
          version: target.version,
          releaseType: target.releaseType,
          platform: target.file.platform,
          architecture: target.file.architecture,
          installerType: target.file.installerType,
          fileName: target.file.fileName,
          fileSize: target.file.fileSize,
          checksum: target.file.checksum,
          downloadUrl: signed.downloadUrl,
          expiresIn: signed.expiresIn,
        },
        message: MESSAGES.DOWNLOAD_URL_CREATED,
      });
    },
  );

  public create = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const data = await versionService.create(req.body as CreateVersionInput);

      ApiResponse.created(res, data, MESSAGES.VERSION_CREATED);
    },
  );

  public addFiles = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const { version } = req.params;
      const data = await versionService.addFiles(
        String(version),
        req.body as AddVersionFilesInput,
      );

      ApiResponse.success({
        res,
        data,
        message: MESSAGES.VERSION_FILES_ADDED,
        statusCode: HTTP_STATUS.OK,
      });
    },
  );

  public getByVersion = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const data = await versionService.getByVersion(String(req.params.version));

      ApiResponse.success({
        res,
        data,
        message: MESSAGES.SUCCESS,
      });
    },
  );

  public remove = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      await versionService.remove(String(req.params.version));

      ApiResponse.success({
        res,
        data: null,
        message: MESSAGES.VERSION_DELETED,
        statusCode: HTTP_STATUS.OK,
      });
    },
  );
}

export const versionController = new VersionController();
