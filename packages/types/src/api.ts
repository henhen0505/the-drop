import type { AuthUser, NotificationItem } from './entities';

export interface ApiResponse<T> {
  data: T;
}

export interface CursorResponse<T> {
  data: T[];
  cursor: string | null;
}

/**
 * Mirrors the error envelope built by apps/api/src/middleware/error-handler.ts.
 * `details` is `unknown` because it can be a ZodIssue[] (validation errors),
 * a plain string (non-production internal errors), or omitted entirely.
 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface AuthResponse {
  data: {
    user: AuthUser;
    accessToken: string;
    csrfToken: string;
  };
}

export interface GoogleAuthResponse {
  data: {
    user: AuthUser;
    accessToken: string;
    csrfToken: string;
    isNewUser: boolean;
  };
}

export interface RefreshResponse {
  data: {
    accessToken: string;
    csrfToken: string;
  };
}

/**
 * GET /notifications -- unlike the other cursor endpoints, this one adds a
 * top-level `unreadCount` alongside `data`/`cursor`
 * (apps/api/src/modules/notifications/notification.service.ts ListNotificationsResult).
 */
export interface NotificationListResponse extends CursorResponse<NotificationItem> {
  unreadCount: number;
}
