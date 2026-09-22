import { describe, expect, it } from 'vitest';
import {
  generateCsrfToken,
  loginOrRegisterWithGoogle,
  signAccessToken,
  verifyAccessToken,
} from '../../../../src/modules/auth/auth.service';
import { NotImplementedError } from '../../../../src/utils/errors';

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips the payload through a signed JWT', () => {
    const token = signAccessToken({ sub: 'user-1', email: 'a@b.com', role: 'USER' });
    const decoded = verifyAccessToken(token);

    expect(decoded).toEqual({ sub: 'user-1', email: 'a@b.com', role: 'USER' });
  });

  it('rejects a malformed token', () => {
    expect(() => verifyAccessToken('not-a-real-token')).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    // A syntactically valid JWT (three base64url segments) but signed
    // under a key this service never issued.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiJ4IiwiZW1haWwiOiJ4QHkuY29tIiwicm9sZSI6IlVTRVIifQ.' +
      'invalidsignature';
    expect(() => verifyAccessToken(forged)).toThrow();
  });
});

describe('generateCsrfToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateCsrfToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens across calls', () => {
    expect(generateCsrfToken()).not.toBe(generateCsrfToken());
  });
});

describe('loginOrRegisterWithGoogle', () => {
  it('throws NotImplementedError when GOOGLE_CLIENT_ID is not configured', async () => {
    await expect(loginOrRegisterWithGoogle('some-id-token')).rejects.toThrow(NotImplementedError);
  });
});

describe('NotImplementedError', () => {
  it('maps to statusCode 501, matching the soft-gate loginOrRegisterWithGoogle relies on', () => {
    expect(new NotImplementedError()).toMatchObject({
      statusCode: 501,
      code: 'NOT_IMPLEMENTED',
    });
  });
});
