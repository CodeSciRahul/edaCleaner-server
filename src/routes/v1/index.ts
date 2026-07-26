import { Router } from 'express';
import healthRouter from './health.routes.js';
import uploadRouter from './upload.routes.js';
import versionRouter from './version.routes.js';

const v1Router = Router();

v1Router.use('/health', healthRouter);
v1Router.use('/uploads', uploadRouter);
v1Router.use('/versions', versionRouter);

export default v1Router;
