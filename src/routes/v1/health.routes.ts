import { Router } from 'express';
import { healthController } from '../../controllers/health.controller.js';

const healthRouter = Router();

healthRouter.get('/', healthController.check);

export default healthRouter;
