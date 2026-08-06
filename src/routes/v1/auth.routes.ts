import { Router } from 'express';
import { authController } from '../../controllers/auth.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import { loginRules, registerRules } from '../../validators/auth.validator.js';

const authRouter = Router();

authRouter.post(
  '/register',
  registerRules,
  validateRequest,
  authController.register,
);

authRouter.post('/login', loginRules, validateRequest, authController.login);

authRouter.get('/me', authenticate, authController.me);

export default authRouter;
