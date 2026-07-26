import { Router } from 'express';
import { versionController } from '../../controllers/version.controller.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import {
  addVersionFilesRules,
  createVersionRules,
} from '../../validators/version.validator.js';
import { downloadLatestRules } from '../../validators/download.validator.js';

const versionRouter = Router();

versionRouter.get('/next-build-number', versionController.getNextBuildNumber);
versionRouter.get('/latest', versionController.getLatest);
versionRouter.get(
  '/latest/download',
  downloadLatestRules,
  validateRequest,
  versionController.downloadLatest,
);

versionRouter.post(
  '/',
  createVersionRules,
  validateRequest,
  versionController.create,
);

versionRouter.get('/:version', versionController.getByVersion);

versionRouter.post(
  '/:version/files',
  addVersionFilesRules,
  validateRequest,
  versionController.addFiles,
);

versionRouter.delete('/:version', versionController.remove);

export default versionRouter;
