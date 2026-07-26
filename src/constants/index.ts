export { HTTP_STATUS } from './httpStatus.js';
export type { HttpStatusCode } from './httpStatus.js';

export const MESSAGES = {
  SUCCESS: 'Request completed successfully',
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation failed',
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'You do not have permission to perform this action',
  INTERNAL_ERROR: 'An unexpected error occurred',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  ROUTE_NOT_FOUND: 'The requested endpoint does not exist',
  DATABASE_CONNECTED: 'MongoDB connected successfully',
  DATABASE_DISCONNECTED: 'MongoDB disconnected',
  SERVER_STARTED: 'Server started successfully',
  SERVER_SHUTDOWN: 'Server shutting down gracefully',
  HEALTH_OK: 'Service is healthy',
  PRESIGNED_URL_CREATED: 'Presigned upload URL created successfully',
  VERSION_CREATED: 'Version created successfully',
  VERSION_FILES_ADDED: 'Version files updated successfully',
  VERSION_NOT_FOUND: 'Version not found',
  VERSION_DELETED: 'Version deleted successfully',
  DOWNLOAD_URL_CREATED: 'Download URL created successfully',
} as const;
