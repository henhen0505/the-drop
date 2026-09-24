import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { ApiError, ApiResponse, CursorResponse, RefreshResponse } from '@the-drop/types';
import { clearTokens, getTokens, setTokens } from './token-store';

const CSRF_HEADER = 'X-CSRF-Token';

/** Thrown by the `api.*` helpers when the server responds with the
 * `{ error: { code, message, details } }` envelope. */
export class ApiRequestError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(body: ApiError, status?: number) {
    super(body.error.message);
    this.name = 'ApiRequestError';
    this.code = body.error.code;
    this.details = body.error.details;
    this.status = status;
  }
}

function isApiErrorBody(data: unknown): data is ApiError {
  return typeof data === 'object' && data !== null && 'error' in data;
}

function toApiRequestError(error: unknown): unknown {
  if (axios.isAxiosError(error) && isApiErrorBody(error.response?.data)) {
    return new ApiRequestError(error.response!.data as ApiError, error.response!.status);
  }
  return error;
}

export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

// Separate instance for the raw refresh call: must NOT carry the response
// interceptor below, or a failed refresh (e.g. expired/missing cookie)
// would recursively try to refresh itself. Exported so tests can attach
// their own mock adapter to it.
export const refreshClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const { accessToken } = getTokens();
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return config;
});

/**
 * Calls POST /auth/refresh directly (bypassing apiClient's interceptors)
 * and updates the in-memory token store on success. Shared by the 401
 * retry-once flow below and by the auth store's explicit silent refresh
 * on mount, so there is exactly one code path that talks to this endpoint.
 */
export async function refreshAccessToken(): Promise<void> {
  const { csrfToken } = getTokens();
  const response = await refreshClient.post<RefreshResponse>('/auth/refresh', undefined, {
    headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : undefined,
  });
  setTokens({
    accessToken: response.data.data.accessToken,
    csrfToken: response.data.data.csrfToken,
  });
}

function redirectToLogin(): void {
  clearTokens();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

let pendingRefresh: Promise<void> | null = null;

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retried?: boolean };

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retried) {
      return Promise.reject(error);
    }
    originalRequest._retried = true;

    if (!pendingRefresh) {
      pendingRefresh = refreshAccessToken().finally(() => {
        pendingRefresh = null;
      });
    }

    try {
      await pendingRefresh;
    } catch (refreshError) {
      redirectToLogin();
      return Promise.reject(refreshError);
    }

    const { accessToken } = getTokens();
    if (accessToken) {
      originalRequest.headers.set('Authorization', `Bearer ${accessToken}`);
    }
    return apiClient(originalRequest);
  },
);

function unwrap<T>(request: Promise<{ data: ApiResponse<T> }>): Promise<T> {
  return request
    .then((response) => response.data.data)
    .catch((error: unknown) => {
      throw toApiRequestError(error);
    });
}

// Some endpoints (GET /events, GET /recommendations) return the cursor
// envelope `{ data: T[], cursor }` directly as the HTTP body, not
// double-wrapped in `{ data: ... }` -- unwrap one level less than `unwrap`.
function unwrapRaw<T>(request: Promise<{ data: T }>): Promise<T> {
  return request
    .then((response) => response.data)
    .catch((error: unknown) => {
      throw toApiRequestError(error);
    });
}

/** Typed request helpers that unwrap the `{ data: T }` success envelope and
 * throw `ApiRequestError` on the `{ error: {...} }` failure envelope. */
export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    unwrap<T>(apiClient.get<ApiResponse<T>>(url, config)),
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(apiClient.post<ApiResponse<T>>(url, body, config)),
  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(apiClient.patch<ApiResponse<T>>(url, body, config)),
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    unwrap<T>(apiClient.put<ApiResponse<T>>(url, body, config)),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    unwrap<T>(apiClient.delete<ApiResponse<T>>(url, config)),
  /** For endpoints returning `{ data: T[], cursor }` directly (GET /events,
   * GET /recommendations) -- using `api.get` on these would silently strip
   * the cursor. */
  cursor: <T>(url: string, config?: AxiosRequestConfig) =>
    unwrapRaw<CursorResponse<T>>(apiClient.get<CursorResponse<T>>(url, config)),
};

export { CSRF_HEADER };
