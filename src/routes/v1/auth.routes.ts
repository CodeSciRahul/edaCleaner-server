import { Router } from 'express';
import { authController } from '../../controllers/auth.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import {
  forgotPasswordRules,
  loginRules,
  logoutRules,
  otpRequestRules,
  otpVerifyRules,
  refreshRules,
  registerRules,
  resetPasswordRules,
  setPasswordRules,
} from '../../validators/auth.validator.js';

const authRouter = Router();

authRouter.post(
  '/register',
  registerRules,
  validateRequest,
  authController.register,
);

authRouter.post('/login', loginRules, validateRequest, authController.login);

authRouter.post(
  '/otp/request',
  otpRequestRules,
  validateRequest,
  authController.requestOtp,
);

authRouter.post(
  '/otp/verify',
  otpVerifyRules,
  validateRequest,
  authController.verifyOtp,
);

authRouter.post(
  '/password/forgot',
  forgotPasswordRules,
  validateRequest,
  authController.forgotPassword,
);

authRouter.post(
  '/password/reset',
  resetPasswordRules,
  validateRequest,
  authController.resetPassword,
);

authRouter.post(
  '/refresh',
  refreshRules,
  validateRequest,
  authController.refresh,
);

authRouter.post('/logout', logoutRules, validateRequest, authController.logout);

authRouter.get('/me', authenticate, authController.me);

authRouter.post(
  '/set-password',
  authenticate,
  setPasswordRules,
  validateRequest,
  authController.setPassword,
);

export default authRouter;
