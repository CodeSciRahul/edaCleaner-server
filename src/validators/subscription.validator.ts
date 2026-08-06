import { body, param } from 'express-validator';

export const planIdParamRules = [
  param('id').isMongoId().withMessage('Valid plan id is required'),
];

export const checkoutRules = [
  body('planId').isMongoId().withMessage('Valid planId is required'),
];

export const changePlanRules = [
  body('planId').isMongoId().withMessage('Valid planId is required'),
];

export const cancelRules = [
  body('immediate')
    .optional()
    .isBoolean()
    .withMessage('immediate must be a boolean')
    .toBoolean(),
];
