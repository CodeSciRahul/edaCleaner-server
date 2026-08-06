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
      });

      ApiResponse.created(res, data, MESSAGES.REGISTERED);
    },
  );

  public login = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const data = await authService.login({
        email: String(req.body.email),
        password: String(req.body.password),
      });

      ApiResponse.success({
        res,
        data,
        message: MESSAGES.LOGIN_SUCCESS,
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
