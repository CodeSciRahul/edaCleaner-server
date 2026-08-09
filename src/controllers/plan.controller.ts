import type { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { MESSAGES } from '../constants/index.js';
import { planService } from '../services/plan.service.js';

export class PlanController {
  public list = asyncHandler(
    async (_req: Request, res: Response): Promise<void> => {
      const plans = await planService.listActive();
      ApiResponse.success({
        res,
        data: plans.map((plan) => planService.toPublic(plan)),
        message: MESSAGES.SUCCESS,
      });
    },
  );

  public getById = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const plan = await planService.getById(String(req.params.id));
      ApiResponse.success({
        res,
        data: planService.toPublic(plan),
        message: MESSAGES.SUCCESS,
      });
    },
  );
}

export const planController = new PlanController();
