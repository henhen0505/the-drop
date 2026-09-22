import { describe, expect, it, vi, beforeEach } from 'vitest';
import supertest from 'supertest';

vi.mock('../../src/middleware/rate-limit', () => ({
  unauthenticatedRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  authenticatedRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
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

vi.mock('../../src/modules/artists/artist.service', () => ({
  listArtists: vi.fn(),
  getArtist: vi.fn(),
  followArtist: vi.fn(),
  unfollowArtist: vi.fn(),
  getFollowedArtists: vi.fn(),
}));

vi.mock('../../src/modules/artists/ingestion.service', () => ({
  ingestBySpotifyId: vi.fn(),
  searchAndIngest: vi.fn(),
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
  verifyAccessToken: vi.fn(),
  generateCsrfToken: vi.fn(),
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
import * as notificationService from '../../src/modules/notifications/notification.service';
import { NotFoundError } from '../../src/utils/errors';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';
const NOTIF_ID = '33333333-3333-4333-8333-333333333333';

function actingAs(): void {
  vi.mocked(authService.verifyAccessToken).mockReturnValue({
    sub: 'user-1',
    email: 'a@test.com',
    role: 'USER',
  });
}

describe('GET /api/v1/notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs();
  });

  it('returns 200 with the top-level unreadCount alongside data and cursor', async () => {
    vi.mocked(notificationService.listNotifications).mockResolvedValue({
      data: [
        {
          id: NOTIF_ID,
          type: 'EVENT_TOMORROW',
          title: 'Knock2 is tomorrow',
          body: null,
          data: { eventId: 'ev-1' },
          readAt: null,
          createdAt: new Date('2026-09-20T12:00:00Z'),
        },
      ],
      cursor: 'abc',
      unreadCount: 3,
    });

    const res = await supertest(app).get('/api/v1/notifications').set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(3);
    expect(res.body.cursor).toBe('abc');
    expect(res.body.data).toHaveLength(1);
  });

  it('passes query params through to the service', async () => {
    vi.mocked(notificationService.listNotifications).mockResolvedValue({
      data: [],
      cursor: null,
      unreadCount: 0,
    });

    await supertest(app)
      .get('/api/v1/notifications?unreadOnly=true&limit=5&cursor=xyz')
      .set('Authorization', AUTH_HEADER);

    expect(notificationService.listNotifications).toHaveBeenCalledWith('user-1', {
      unreadOnly: true,
      limit: 5,
      cursor: 'xyz',
    });
  });

  it('401s without a token', async () => {
    const res = await supertest(app).get('/api/v1/notifications');

    expect(res.status).toBe(401);
    expect(notificationService.listNotifications).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs();
  });

  it('marks a notification read', async () => {
    vi.mocked(notificationService.markRead).mockResolvedValue({
      id: NOTIF_ID,
      readAt: new Date('2026-09-21T00:00:00Z'),
    });

    const res = await supertest(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(NOTIF_ID);
    expect(notificationService.markRead).toHaveBeenCalledWith('user-1', NOTIF_ID);
  });

  it('400s on a non-UUID id', async () => {
    const res = await supertest(app)
      .patch('/api/v1/notifications/not-a-uuid/read')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(400);
    expect(notificationService.markRead).not.toHaveBeenCalled();
  });

  it('404s when the service reports not found', async () => {
    vi.mocked(notificationService.markRead).mockRejectedValueOnce(
      new NotFoundError('Notification not found'),
    );

    const res = await supertest(app)
      .patch(`/api/v1/notifications/${NOTIF_ID}/read`)
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/notifications/read-all', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs();
  });

  it('returns the marked count', async () => {
    vi.mocked(notificationService.markAllRead).mockResolvedValue({ markedCount: 5 });

    const res = await supertest(app)
      .post('/api/v1/notifications/read-all')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { markedCount: 5 } });
    expect(notificationService.markAllRead).toHaveBeenCalledWith('user-1');
  });

  it('401s without a token', async () => {
    const res = await supertest(app).post('/api/v1/notifications/read-all');

    expect(res.status).toBe(401);
    expect(notificationService.markAllRead).not.toHaveBeenCalled();
  });
});
