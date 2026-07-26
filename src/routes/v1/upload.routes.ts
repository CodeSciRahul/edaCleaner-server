import { Router } from 'express';
import { uploadController } from '../../controllers/upload.controller.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import { presignUploadRules } from '../../validators/upload.validator.js';

const uploadRouter = Router();

uploadRouter.post(
  '/presign',
  presignUploadRules,
  validateRequest,
  uploadController.createPresignedUrl,
);

export default uploadRouter;
