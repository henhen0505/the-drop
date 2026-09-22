import { describe, expect, it, vi, beforeEach } from 'vitest';
import supertest from 'supertest';

// The real rate limiters are shared, in-memory, per-IP state. supertest
// requests in this file all originate from the same loopback address, so
// without a bypass the unauthenticated limiter (20 req/min) trips well
// before the suite finishes -- this isn't a rate-limit test, so stub it out.
vi.mock('../../src/middleware/rate-limit', () => ({
  unauthenticatedRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  authenticatedRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../src/modules/auth/auth.service', () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllUserTokens: vi.fn(),
  loginOrRegisterWithGoogle: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  signAccessToken: vi.fn().mockReturnValue('mock-access-token'),
  verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user-1', email: 'test@test.com', role: 'USER' }),
  generateCsrfToken: vi.fn().mockReturnValue('mock-csrf-token'),
}));

vi.mock('../../src/modules/venues/venue.service', () => ({
  listVenues: vi.fn(),
  getVenue: vi.fn(),
}));

vi.mock('../../src/modules/events/event.service', () => ({
  listEvents: vi.fn(),
  getEvent: vi.fn(),
  getEventsByArtist: vi.fn(),
  getEventsByVenue: vi.fn(),
}));

vi.mock('../../src/modules/admin/dedup.service', () => ({
  listCandidates: vi.fn(),
  resolveCandidate: vi.fn(),
}));

vi.mock('../../src/modules/admin/sync.service', () => ({
  syncTicketmaster: vi.fn(),
  getSyncStatus: vi.fn(),
}));

vi.mock('../../src/modules/genres/genre.service', () => ({ listGenreTree: vi.fn() }));

vi.mock('../../src/modules/search/search.service', () => ({
  search: vi.fn(),
  autocomplete: vi.fn(),
}));

vi.mock('../../src/modules/events/user-event-state.service', () => ({
  setEventState: vi.fn(),
  removeEventState: vi.fn(),
  listMyRaves: vi.fn(),
}));

vi.mock('../../src/modules/events/similar-events.service', () => ({
  getSimilarEvents: vi.fn(),
}));

vi.mock('../../src/modules/recommendations/recommendation.service', () => ({
  getRecommendations: vi.fn(),
}));

vi.mock('../../src/modules/submissions/submission.service', () => ({
  createSubmission: vi.fn(),
  listMySubmissions: vi.fn(),
}));

vi.mock('../../src/modules/admin/submission-review.service', () => ({
  listSubmissions: vi.fn(),
  reviewSubmission: vi.fn(),
}));

vi.mock('../../src/modules/admin/admin-event.service', () => ({
  listAdminEvents: vi.fn(),
  getAdminEvent: vi.fn(),
  createAdminEvent: vi.fn(),
  updateAdminEvent: vi.fn(),
  deleteAdminEvent: vi.fn(),
}));

vi.mock('../../src/modules/admin/event-merge.service', () => ({
  mergeEvents: vi.fn(),
}));

vi.mock('../../src/modules/notifications/notification.service', () => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
}));

import { createApp } from '../../src/app';
import * as authService from '../../src/modules/auth/auth.service';
import { UnauthorizedError } from '../../src/utils/errors';

const app = createApp();

describe('POST /api/v1/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 with user data and sets refresh cookie', async () => {
    vi.mocked(authService.registerUser).mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com', displayName: 'Test', role: 'USER', avatarUrl: null },
      accessToken: 'at-123',
      refreshToken: 'rt-123',
      csrfToken: 'csrf-123',
    });

    const res = await supertest(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@test.com', password: 'password123', displayName: 'Test' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('test@test.com');
    expect(res.body.data.accessToken).toBe('at-123');
    expect(res.body.data.csrfToken).toBe('csrf-123');

    const cookie = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie'].join('; ')
      : res.headers['set-cookie'];
    expect(cookie).toBeDefined();
    expect(cookie).toContain('refreshToken=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/api/v1/auth');
  });

  it('returns 400 for invalid email', async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/register')
      .send({ email: 'bad', password: 'password123', displayName: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for short password', async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@test.com', password: 'short', displayName: 'Test' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when the service reports a duplicate account', async () => {
    const { ConflictError } = await import('../../src/utils/errors');
    vi.mocked(authService.registerUser).mockRejectedValue(
      new ConflictError('An account with this email already exists'),
    );

    const res = await supertest(app)
      .post('/api/v1/auth/register')
      .send({ email: 'test@test.com', password: 'password123', displayName: 'Test' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with auth data on success', async () => {
    vi.mocked(authService.loginUser).mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com', displayName: 'Test', role: 'USER', avatarUrl: null },
      accessToken: 'at-456',
      refreshToken: 'rt-456',
      csrfToken: 'csrf-456',
    });

    const res = await supertest(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('at-456');
  });

  it('returns 401 for wrong credentials (service throws UnauthorizedError)', async () => {
    vi.mocked(authService.loginUser).mockRejectedValue(
      new UnauthorizedError('Invalid email or password'),
    );

    const res = await supertest(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.com', password: 'wrongpass' });

    expect(res.status).toBe(401);
  });

  it('returns 400 for an invalid email', async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/login')
      .send({ email: 'bad', password: 'password123' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with new tokens when cookie and CSRF header are present', async () => {
    vi.mocked(authService.rotateRefreshToken).mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com', displayName: 'Test', role: 'USER', avatarUrl: null },
      accessToken: 'at-new',
      refreshToken: 'rt-new',
      csrfToken: 'csrf-new',
    });

    const res = await supertest(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refreshToken=old-token')
      .set('X-CSRF-Token', 'some-csrf');

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('at-new');
    expect(res.body.data.csrfToken).toBe('csrf-new');
  });

  it('returns 401 when CSRF header is missing', async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refreshToken=old-token');

    expect(res.status).toBe(401);
  });

  it('returns 401 when refresh cookie is missing', async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/refresh')
      .set('X-CSRF-Token', 'some-csrf');

    expect(res.status).toBe(401);
  });

  it('returns 401 when the service rejects the token as invalid', async () => {
    vi.mocked(authService.rotateRefreshToken).mockRejectedValue(
      new UnauthorizedError('Invalid refresh token'),
    );

    const res = await supertest(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refreshToken=old-token')
      .set('X-CSRF-Token', 'some-csrf');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 and clears cookie', async () => {
    vi.mocked(authService.revokeRefreshToken).mockResolvedValue(undefined);

    const res = await supertest(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer mock-access-token')
      .set('Cookie', 'refreshToken=some-token')
      .set('X-CSRF-Token', 'csrf-val');

    expect(res.status).toBe(204);
  });

  it('returns 401 without auth header', async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', 'refreshToken=some-token')
      .set('X-CSRF-Token', 'csrf-val');

    expect(res.status).toBe(401);
  });

  it('returns 401 without CSRF header', async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer mock-access-token')
      .set('Cookie', 'refreshToken=some-token');

    expect(res.status).toBe(401);
  });

  it('returns 401 without refresh cookie', async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', 'Bearer mock-access-token')
      .set('X-CSRF-Token', 'csrf-val');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/auth/google', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with auth data and isNewUser flag', async () => {
    vi.mocked(authService.loginOrRegisterWithGoogle).mockResolvedValue({
      user: { id: 'u1', email: 'test@test.com', displayName: 'Test', role: 'USER', avatarUrl: null },
      accessToken: 'at-g',
      refreshToken: 'rt-g',
      csrfToken: 'csrf-g',
      isNewUser: true,
    });

    const res = await supertest(app)
      .post('/api/v1/auth/google')
      .send({ idToken: 'some-google-id-token' });

    expect(res.status).toBe(200);
    expect(res.body.data.isNewUser).toBe(true);
  });

  it('returns 400 for an empty idToken', async () => {
    const res = await supertest(app).post('/api/v1/auth/google').send({ idToken: '' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/forgot-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('always returns 200 regardless of email existence', async () => {
    vi.mocked(authService.requestPasswordReset).mockResolvedValue(undefined);

    const res = await supertest(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'anyone@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain('reset link');
  });

  it('returns 400 for an invalid email', async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 on successful reset', async () => {
    vi.mocked(authService.resetPassword).mockResolvedValue(undefined);

    const res = await supertest(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'valid-token', newPassword: 'newpass123' });

    expect(res.status).toBe(200);
  });

  it('returns 400 for short password', async () => {
    const res = await supertest(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'valid-token', newPassword: 'short' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when the service reports an invalid/expired token', async () => {
    const { ValidationError } = await import('../../src/utils/errors');
    vi.mocked(authService.resetPassword).mockRejectedValue(
      new ValidationError('Invalid or expired reset token'),
    );

    const res = await supertest(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'expired-token', newPassword: 'newpass123' });

    expect(res.status).toBe(400);
  });
});
