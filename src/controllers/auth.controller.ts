import type { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { MESSAGES } from '../constants/index.js';
import { authService } from '../services/auth.service.js';
import { ApiError } from '../utils/ApiError.js';

export class AuthController {
  public register = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const data = await authService.register({
        email: String(req.body.email),
        password: String(req.body.password),
        ...(typeof req.body.name === 'string' ? { name: req.body.name } : {}),
        ...(req.get('user-agent') ? { userAgent: req.get('user-agent') } : {}),
      });

      ApiResponse.created(res, data, MESSAGES.REGISTERED);
    },
  );

  public login = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const data = await authService.login({
        email: String(req.body.email),
        password: String(req.body.password),
        ...(req.get('user-agent') ? { userAgent: req.get('user-agent') } : {}),
      });

      ApiResponse.success({
        res,
        data,
        message: MESSAGES.LOGIN_SUCCESS,
      });
    },
  );

  public refresh = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const refreshToken = String(req.body.refreshToken ?? '');
      if (!refreshToken) {
        throw ApiError.badRequest('refreshToken is required');
      }

      const data = await authService.refresh(
        refreshToken,
        req.get('user-agent') ?? null,
      );
      ApiResponse.success({
        res,
        data,
        message: MESSAGES.SUCCESS,
      });
    },
  );

  public logout = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const refreshToken =
        typeof req.body.refreshToken === 'string' ? req.body.refreshToken : null;
      const data = await authService.logout(refreshToken);
      ApiResponse.success({
        res,
        data,
        message: MESSAGES.SUCCESS,
      });
    },
  );

  public me = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      if (!req.user) {
        throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);
      }

      const data = await authService.me(req.user.id);
      ApiResponse.success({ res, data, message: MESSAGES.SUCCESS });
    },
  );
}

export const authController = new AuthController();
