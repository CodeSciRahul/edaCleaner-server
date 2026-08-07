import type { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { MESSAGES, parseBillingInterval } from '../constants/index.js';
import { ApiError } from '../utils/ApiError.js';
import { subscriptionService } from '../services/subscription.service.js';

function requireUserId(req: Request): string {
  if (!req.user?.id) {
    throw ApiError.unauthorized(MESSAGES.UNAUTHORIZED);
  }
  return req.user.id;
}

export class SubscriptionController {
  public getSubscription = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = requireUserId(req);
      const sub = await subscriptionService.getOrCreateForUser(userId);
      ApiResponse.success({
        res,
        data: subscriptionService.toPublic(sub),
        message: MESSAGES.SUCCESS,
      });
    },
  );

  public getStatus = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = requireUserId(req);
      const data = await subscriptionService.getStatus(userId);
      ApiResponse.success({ res, data, message: MESSAGES.SUCCESS });
    },
  );

  public checkout = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = requireUserId(req);
      const billingInterval = parseBillingInterval(req.body.billingInterval, 'month');
      const data = await subscriptionService.createCheckout(
        userId,
        String(req.body.planId),
        billingInterval,
      );

      ApiResponse.success({
        res,
        data,
        message: MESSAGES.CHECKOUT_CREATED,
      });
    },
  );

  public cancel = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = requireUserId(req);
      const immediate = Boolean(req.body.immediate);
      const data = await subscriptionService.cancel(userId, { immediate });

      ApiResponse.success({
        res,
        data,
        message: immediate
          ? MESSAGES.SUBSCRIPTION_CANCELED_IMMEDIATE
          : MESSAGES.SUBSCRIPTION_CANCELED,
      });
    },
  );

  public reactivate = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = requireUserId(req);
      const data = await subscriptionService.reactivate(userId);

      ApiResponse.success({
        res,
        data,
        message: MESSAGES.SUBSCRIPTION_REACTIVATED,
      });
    },
  );

  public changePlan = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = requireUserId(req);
      const billingInterval = parseBillingInterval(req.body.billingInterval, 'month');
      const data = await subscriptionService.changePlan(
        userId,
        String(req.body.planId),
        billingInterval,
      );

      ApiResponse.success({
        res,
        data,
        message: MESSAGES.PLAN_CHANGED,
      });
    },
  );

  public history = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = requireUserId(req);
      const data = await subscriptionService.getHistory(userId);

      ApiResponse.success({ res, data, message: MESSAGES.SUCCESS });
    },
  );

  public invoices = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = requireUserId(req);
      const data = await subscriptionService.getInvoices(userId);

      ApiResponse.success({ res, data, message: MESSAGES.SUCCESS });
    },
  );

  public billingPortal = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const userId = requireUserId(req);
      const data = await subscriptionService.createBillingPortal(userId);

      ApiResponse.success({
        res,
        data,
        message: MESSAGES.BILLING_PORTAL_CREATED,
      });
    },
  );
}

export const subscriptionController = new SubscriptionController();
