import type { Request, Response } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { webhookService } from '../services/webhook.service.js';
import { ApiError } from '../utils/ApiError.js';

export class WebhookController {
  public handle = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {
      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        throw ApiError.unauthorized('Missing Stripe-Signature header');
      }

      if (!Buffer.isBuffer(req.body)) {
        throw ApiError.badRequest(
          'Webhook body must be raw Buffer for signature verification',
        );
      }

      const data = await webhookService.handleRawEvent(req.body, signature);

      ApiResponse.success({
        res,
        data,
        message: 'Webhook processed',
      });
    },
  );
}

export const webhookController = new WebhookController();
