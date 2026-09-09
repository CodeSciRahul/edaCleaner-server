import { body } from 'express-validator';
import { normalizeEmailForStorage } from '../utils/email.js';

function emailBodyRule() {
  return body('email')
    .trim()
    .customSanitizer((value) => normalizeEmailForStorage(String(value ?? '')))
    .isEmail()
    .withMessage('Valid email is required');
}

export const registerRules = [
  emailBodyRule(),
  body('password')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8–128 characters'),
  body('name')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 120 })
    .withMessage('Name must be at most 120 characters'),
];

export const loginRules = [
  emailBodyRule(),
  body('password')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Password must be a string'),
];

export const otpRequestRules = [emailBodyRule()];

export const otpVerifyRules = [
  emailBodyRule(),
  body('code')
    .isString()
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('Enter the 6-digit code from your email'),
];

export const setPasswordRules = [
  body('password')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8–128 characters'),
];

export const refreshRules = [
  body('refreshToken')
    .isString()
    .notEmpty()
    .withMessage('refreshToken is required'),
];

export const logoutRules = [
  body('refreshToken')
    .optional({ nullable: true })
    .isString()
    .withMessage('refreshToken must be a string'),
];

export const forgotPasswordRules = [emailBodyRule()];

export const resetPasswordRules = [
  emailBodyRule(),
  body('code')
    .isString()
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('Enter the 6-digit code from your email'),
  body('password')
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8–128 characters'),
];
