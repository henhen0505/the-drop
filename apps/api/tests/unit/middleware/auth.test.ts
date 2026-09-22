import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../../src/modules/auth/auth.service', () => ({
  verifyAccessToken: vi.fn(),
}));

import { requireAuth } from '../../../src/middleware/auth';
import * as authService from '../../../src/modules/auth/auth.service';
import { UnauthorizedError } from '../../../src/utils/errors';

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as Request;
}

describe('requireAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws UnauthorizedError when Authorization header is missing', () => {
    expect(() => requireAuth(makeReq(), {} as Response, vi.fn())).toThrow(UnauthorizedError);
  });

  it('throws UnauthorizedError when Authorization header does not start with Bearer', () => {
    expect(() =>
      requireAuth(makeReq({ authorization: 'Basic abc' }), {} as Response, vi.fn()),
    ).toThrow(UnauthorizedError);
  });

  it('populates req.user and calls next on valid token', () => {
    vi.mocked(authService.verifyAccessToken).mockReturnValue({
      sub: 'user-1',
      email: 'a@b.com',
      role: 'USER',
    });

    const req = makeReq({ authorization: 'Bearer valid-token' });
    const next = vi.fn();

    requireAuth(req, {} as Response, next);

    expect(req.user).toEqual({ id: 'user-1', email: 'a@b.com', role: 'USER' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws UnauthorizedError when token verification fails', () => {
    vi.mocked(authService.verifyAccessToken).mockImplementation(() => {
      throw new Error('Invalid token');
    });

    expect(() =>
      requireAuth(makeReq({ authorization: 'Bearer bad-token' }), {} as Response, vi.fn()),
    ).toThrow(UnauthorizedError);
  });
});
