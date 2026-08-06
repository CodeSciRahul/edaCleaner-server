import { Router } from 'express';
import { subscriptionController } from '../../controllers/subscription.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import {
  cancelRules,
  changePlanRules,
  checkoutRules,
} from '../../validators/subscription.validator.js';

const subscriptionRouter = Router();

subscriptionRouter.use(authenticate);

subscriptionRouter.get('/', subscriptionController.getSubscription);
subscriptionRouter.get('/status', subscriptionController.getStatus);
subscriptionRouter.get('/history', subscriptionController.history);
subscriptionRouter.get('/invoices', subscriptionController.invoices);
subscriptionRouter.get('/billing-portal', subscriptionController.billingPortal);

subscriptionRouter.post(
  '/checkout',
  checkoutRules,
  validateRequest,
  subscriptionController.checkout,
);

subscriptionRouter.post(
  '/cancel',
  cancelRules,
  validateRequest,
  subscriptionController.cancel,
);

subscriptionRouter.post('/reactivate', subscriptionController.reactivate);

subscriptionRouter.post(
  '/change-plan',
  changePlanRules,
  validateRequest,
  subscriptionController.changePlan,
);

export default subscriptionRouter;
