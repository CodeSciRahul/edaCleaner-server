import type { NextFunction, Request, Response } from 'express';
import { PLAN_RANK, type PlanSlug, isPlanSlug } from '../constants/plans.js';
import { MESSAGES } from '../constants/index.js';
import { ApiError } from '../utils/ApiError.js';
import { subscriptionService } from '../services/subscription.service.js';

/**
 * Requires the authenticated user to have an active subscription at or above `minimumPlan`.
 * Uses the same Free / Pro / Premium ranking as the desktop entitlement matrix.
 */
export function requireMinPlan(minimumPlan: PlanSlug) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user?.id) {
        next(ApiError.unauthorized(MESSAGES.UNAUTHORIZED));
        return;
      }

      const status = await subscriptionService.getStatus(req.user.id);
      const plan = isPlanSlug(status.currentPlan) ? status.currentPlan : 'free';
      const effective: PlanSlug =
        plan !== 'free' && status.hasActiveAccess === false ? 'free' : plan;

      if (PLAN_RANK[effective] < PLAN_RANK[minimumPlan]) {
        next(
          ApiError.forbidden(
            `This action requires the ${minimumPlan} plan or higher.`,
          ),
        );
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
