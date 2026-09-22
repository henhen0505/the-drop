import { describe, expect, it, vi, beforeEach } from 'vitest';
import supertest from 'supertest';

// The real rate limiters are shared, in-memory, per-IP state. supertest
// requests in this file all originate from the same loopback address, so
// without a bypass the unauthenticated limiter (20 req/min) could trip
// before the suite finishes -- this isn't a rate-limit test, so stub it out.
vi.mock('../../src/middleware/rate-limit', () => ({
  unauthenticatedRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  authenticatedRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../src/modules/users/user.service', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  getGenrePreferences: vi.fn(),
  setGenrePreferences: vi.fn(),
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
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
  signAccessToken: vi.fn(),
  verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user-1', email: 'test@test.com', role: 'USER' }),
  generateCsrfToken: vi.fn(),
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
import * as userService from '../../src/modules/users/user.service';

const app = createApp();

const AUTH_HEADER = 'Bearer valid-token';

describe('GET /api/v1/users/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with user profile', async () => {
    vi.mocked(userService.getProfile).mockResolvedValue({
      id: 'u1',
      email: 'test@test.com',
      displayName: 'Test',
      avatarUrl: null,
      role: 'USER',
      preferredCity: null,
      preferredState: null,
      travelRadiusKm: 80,
      priceMin: null,
      priceMax: null,
      emailVerified: false,
      createdAt: new Date('2024-01-01'),
    });

    const res = await supertest(app).get('/api/v1/users/me').set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('test@test.com');
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app).get('/api/v1/users/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/users/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with updated profile', async () => {
    vi.mocked(userService.updateProfile).mockResolvedValue({
      id: 'u1',
      email: 'test@test.com',
      displayName: 'New Name',
      avatarUrl: null,
      role: 'USER',
      preferredCity: 'NYC',
      preferredState: 'NY',
      travelRadiusKm: 80,
      priceMin: null,
      priceMax: null,
      emailVerified: false,
      createdAt: new Date('2024-01-01'),
    });

    const res = await supertest(app)
      .patch('/api/v1/users/me')
      .set('Authorization', AUTH_HEADER)
      .send({ displayName: 'New Name', preferredCity: 'NYC' });

    expect(res.status).toBe(200);
    expect(res.body.data.displayName).toBe('New Name');
  });

  it('returns 400 for invalid travelRadiusKm', async () => {
    const res = await supertest(app)
      .patch('/api/v1/users/me')
      .set('Authorization', AUTH_HEADER)
      .send({ travelRadiusKm: 999 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when priceMin > priceMax', async () => {
    const res = await supertest(app)
      .patch('/api/v1/users/me')
      .set('Authorization', AUTH_HEADER)
      .send({ priceMin: 5000, priceMax: 2000 });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app).patch('/api/v1/users/me').send({ displayName: 'New Name' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/users/me/genre-preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with genre list', async () => {
    vi.mocked(userService.getGenrePreferences).mockResolvedValue([
      { id: 'g1', name: 'House', slug: 'house' },
      { id: 'g2', name: 'Techno', slug: 'techno' },
    ]);

    const res = await supertest(app)
      .get('/api/v1/users/me/genre-preferences')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app).get('/api/v1/users/me/genre-preferences');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/v1/users/me/genre-preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with updated genre list', async () => {
    vi.mocked(userService.setGenrePreferences).mockResolvedValue([
      { id: 'g1', name: 'House', slug: 'house' },
    ]);

    const res = await supertest(app)
      .put('/api/v1/users/me/genre-preferences')
      .set('Authorization', AUTH_HEADER)
      .send({ genreIds: ['550e8400-e29b-41d4-a716-446655440000'] });

    expect(res.status).toBe(200);
  });

  it('returns 400 for non-UUID genre IDs', async () => {
    const res = await supertest(app)
      .put('/api/v1/users/me/genre-preferences')
      .set('Authorization', AUTH_HEADER)
      .send({ genreIds: ['not-a-uuid'] });

    expect(res.status).toBe(400);
  });

  it('returns 400 for more than 20 genre IDs', async () => {
    const ids = Array.from(
      { length: 21 },
      (_, i) => `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
    );

    const res = await supertest(app)
      .put('/api/v1/users/me/genre-preferences')
      .set('Authorization', AUTH_HEADER)
      .send({ genreIds: ids });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/users/me/notification-preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with notification prefs', async () => {
    vi.mocked(userService.getNotificationPreferences).mockResolvedValue({
      eventTomorrow: true,
      eventCancelled: true,
      eventRescheduled: true,
      artistNewEvent: true,
      submissionUpdates: true,
    });

    const res = await supertest(app)
      .get('/api/v1/users/me/notification-preferences')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.eventTomorrow).toBe(true);
  });
});

describe('PATCH /api/v1/users/me/notification-preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with updated prefs', async () => {
    vi.mocked(userService.updateNotificationPreferences).mockResolvedValue({
      eventTomorrow: false,
      eventCancelled: true,
      eventRescheduled: true,
      artistNewEvent: true,
      submissionUpdates: true,
    });

    const res = await supertest(app)
      .patch('/api/v1/users/me/notification-preferences')
      .set('Authorization', AUTH_HEADER)
      .send({ eventTomorrow: false });

    expect(res.status).toBe(200);
    expect(res.body.data.eventTomorrow).toBe(false);
  });

  it('returns 400 for non-boolean values', async () => {
    const res = await supertest(app)
      .patch('/api/v1/users/me/notification-preferences')
      .set('Authorization', AUTH_HEADER)
      .send({ eventTomorrow: 'yes' });

    expect(res.status).toBe(400);
  });
});
