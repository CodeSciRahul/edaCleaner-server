import { Router } from 'express';
import healthRouter from './health.routes.js';
import uploadRouter from './upload.routes.js';
import versionRouter from './version.routes.js';
import authRouter from './auth.routes.js';
import planRouter from './plan.routes.js';
import subscriptionRouter from './subscription.routes.js';

const v1Router = Router();

v1Router.use('/health', healthRouter);
v1Router.use('/auth', authRouter);
v1Router.use('/uploads', uploadRouter);
v1Router.use('/versions', versionRouter);
v1Router.use('/plans', planRouter);
v1Router.use('/subscription', subscriptionRouter);

export default v1Router;
