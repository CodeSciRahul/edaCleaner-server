import { Router } from 'express';
import { planController } from '../../controllers/plan.controller.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import { planIdParamRules } from '../../validators/subscription.validator.js';

const planRouter = Router();

planRouter.get('/', planController.list);
planRouter.get('/:id', planIdParamRules, validateRequest, planController.getById);

export default planRouter;
