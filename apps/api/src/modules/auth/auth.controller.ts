import { createHash } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../../config/index';
import { UnauthorizedError } from '../../utils/errors';
import * as authService from './auth.service';

const REFRESH_COOKIE_NAME = 'refreshToken';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.env === 'production', // false in dev for localhost
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: config.jwt.refreshDays * 24 * 60 * 60 * 1000, // 7 days in ms
};

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Wraps an async handler so rejected promises reach the error middleware. */
function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

function requireCsrfHeader(req: Request): void {
  const header = req.headers['x-csrf-token'];
  if (!header || (Array.isArray(header) && header.length === 0)) {
    throw new UnauthorizedError('Missing CSRF token');
  }
}

function requireRefreshCookie(req: Request): string {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof token !== 'string' || token.length === 0) {
    throw new UnauthorizedError('Missing refresh token');
  }
  return token;
}

export const register = asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body);
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
  res.status(201).json({
    data: { user: result.user, accessToken: result.accessToken, csrfToken: result.csrfToken },
  });
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.loginUser(req.body);
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
  res.status(200).json({
    data: { user: result.user, accessToken: result.accessToken, csrfToken: result.csrfToken },
  });
});

export const refresh = asyncHandler(async (req, res) => {
  requireCsrfHeader(req);
  const rawToken = requireRefreshCookie(req);

  const result = await authService.rotateRefreshToken(rawToken);
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
  res.status(200).json({
    data: { accessToken: result.accessToken, csrfToken: result.csrfToken },
  });
});

export const logout = asyncHandler(async (req, res) => {
  requireCsrfHeader(req);
  const rawToken = requireRefreshCookie(req);

  const tokenHash = createSha256(rawToken);
  await authService.revokeRefreshToken(tokenHash);

  res.clearCookie(REFRESH_COOKIE_NAME, { ...COOKIE_OPTIONS, maxAge: 0 });
  res.status(204).send();
});

export const google = asyncHandler(async (req, res) => {
  const result = await authService.loginOrRegisterWithGoogle(req.body.idToken);
  res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, COOKIE_OPTIONS);
  res.status(200).json({
    data: {
      user: result.user,
      accessToken: result.accessToken,
      csrfToken: result.csrfToken,
      isNewUser: result.isNewUser,
    },
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.requestPasswordReset(req.body.email);
  res.status(200).json({
    data: { message: 'If the email exists, a reset link was sent.' },
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.newPassword);
  res.status(200).json({
    data: { message: 'Password reset successfully.' },
  });
});

// Only the controller needs the raw refresh cookie's hash, to revoke it on
// logout -- auth.service.ts keeps token hashing internal otherwise.
function createSha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
