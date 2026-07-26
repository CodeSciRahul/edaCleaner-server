export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data: T | null;
  meta?: Record<string, unknown>;
  requestId?: string;
  timestamp: string;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  value?: unknown;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: ApiErrorDetail[];
  stack?: string;
  requestId?: string;
  timestamp: string;
}

export type ApiResponsePayload<T = unknown> =
  | ApiSuccessResponse<T>
  | ApiErrorResponse;
