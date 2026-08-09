import 'express-serve-static-core';
import type { AuthUser } from '../interfaces/auth.interface.js';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
    user?: AuthUser;
  }
}

export {};
