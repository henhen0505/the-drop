import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../../src/modules/auth/auth.service', () => ({
  verifyAccessToken: vi.fn(),
}));

import { optionalAuth } from '../../../src/middleware/auth';
import * as authService from '../../../src/modules/auth/auth.service';

function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as Request;
}

describe('optionalAuth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates req.user when valid Bearer token is present', () => {
    vi.mocked(authService.verifyAccessToken).mockReturnValue({
      sub: 'u1',
      email: 'a@b.com',
      role: 'USER',
    });
    const req = makeReq({ authorization: 'Bearer valid' });
    const next = vi.fn();

    optionalAuth(req, {} as Response, next);

    expect(req.user).toEqual({ id: 'u1', email: 'a@b.com', role: 'USER' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('proceeds without user when no Authorization header', () => {
    const req = makeReq();
    const next = vi.fn();

    optionalAuth(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('proceeds without user when token is invalid', () => {
    vi.mocked(authService.verifyAccessToken).mockImplementation(() => {
      throw new Error('bad token');
    });
    const req = makeReq({ authorization: 'Bearer bad' });
    const next = vi.fn();

    optionalAuth(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('proceeds without user when header is not Bearer scheme', () => {
    const req = makeReq({ authorization: 'Basic abc' });
    const next = vi.fn();

    optionalAuth(req, {} as Response, next);

    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});
