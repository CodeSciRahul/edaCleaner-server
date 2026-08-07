import { body, param } from 'express-validator';
import { BILLING_INTERVALS } from '../constants/plans.js';

export const planIdParamRules = [
  param('id').isMongoId().withMessage('Valid plan id is required'),
];

export const checkoutRules = [
  body('planId').isMongoId().withMessage('Valid planId is required'),
  body('billingInterval')
    .optional()
    .isIn([...BILLING_INTERVALS])
    .withMessage('billingInterval must be month or year'),
];

export const changePlanRules = [
  body('planId').isMongoId().withMessage('Valid planId is required'),
  body('billingInterval')
    .optional()
    .isIn([...BILLING_INTERVALS])
    .withMessage('billingInterval must be month or year'),
];

export const cancelRules = [
  body('immediate')
    .optional()
    .isBoolean()
    .withMessage('immediate must be a boolean')
    .toBoolean(),
];
