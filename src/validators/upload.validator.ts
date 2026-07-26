import { body } from 'express-validator';

export const presignUploadRules = [
  body('fileName')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('fileName is required')
    .isLength({ max: 255 })
    .withMessage('fileName must be at most 255 characters'),
  body('contentType')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('contentType is required')
    .matches(/^[\w.+-]+\/[\w.+-]+$/)
    .withMessage('contentType must be a valid MIME type'),
  body('prefix')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 120 })
    .withMessage('prefix must be at most 120 characters'),
];
