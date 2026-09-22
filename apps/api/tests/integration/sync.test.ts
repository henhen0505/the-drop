import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('../../src/integrations/ticketmaster', () => ({
  isTicketmasterConfigured: vi.fn(),
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
import * as syncService from '../../src/modules/admin/sync.service';
import { isTicketmasterConfigured } from '../../src/integrations/ticketmaster';

const app = createApp();
const AUTH = 'Bearer token';

function actingAs(role: 'ADMIN' | 'USER'): void {
  vi.mocked(authService.verifyAccessToken).mockReturnValue({
    sub: 'admin-1',
    email: 'admin@test.com',
    role,
  });
}

describe('GET /api/v1/admin/sync-status', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actingAs('ADMIN');
  });

  it('returns whatever rows the service resolves, including an empty array', async () => {
    vi.mocked(syncService.getSyncStatus).mockResolvedValue([]);

    const empty = await supertest(app).get('/api/v1/admin/sync-status').set('Authorization', AUTH);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);

    vi.mocked(syncService.getSyncStatus).mockResolvedValue([
      {
        sourceType: 'TICKETMASTER',
        lastSuccessAt: new Date('2024-10-01T00:00:00Z'),
        lastFailureAt: null,
        lastError: null,
        eventsSynced: 42,
        createdAt: new Date('2024-09-01T00:00:00Z'),
        updatedAt: new Date('2024-10-01T00:00:00Z'),
      },
    ] as never);

    const populated = await supertest(app).get('/api/v1/admin/sync-status').set('Authorization', AUTH);
    expect(populated.status).toBe(200);
    expect(populated.body.data[0]).toMatchObject({ sourceType: 'TICKETMASTER', eventsSynced: 42 });
  });

  it('401s without a token and 403s for a non-admin', async () => {
    const anonymous = await supertest(app).get('/api/v1/admin/sync-status');
    expect(anonymous.status).toBe(401);

    actingAs('USER');
    const user = await supertest(app).get('/api/v1/admin/sync-status').set('Authorization', AUTH);
    expect(user.status).toBe(403);
    expect(syncService.getSyncStatus).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/sync/trigger', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actingAs('ADMIN');
    vi.mocked(isTicketmasterConfigured).mockReturnValue(true);
  });

  it('returns 202 and fires the sync without waiting for it', async () => {
    vi.mocked(syncService.syncTicketmaster).mockResolvedValue({
      eventsStaged: 0,
      eventsProcessed: 0,
      eventsFailed: 0,
      eventsSkipped: 0,
    });

    const res = await supertest(app)
      .post('/api/v1/admin/sync/trigger')
      .set('Authorization', AUTH)
      .send({ sourceType: 'TICKETMASTER' });

    expect(res.status).toBe(202);
    expect(res.body.data.message).toBeTruthy();
    expect(syncService.syncTicketmaster).toHaveBeenCalledOnce();
  });

  it('400s on a sourceType other than TICKETMASTER', async () => {
    const res = await supertest(app)
      .post('/api/v1/admin/sync/trigger')
      .set('Authorization', AUTH)
      .send({ sourceType: 'SEATGEEK' });

    expect(res.status).toBe(400);
    expect(syncService.syncTicketmaster).not.toHaveBeenCalled();
  });

  it('400s when Ticketmaster is not configured', async () => {
    vi.mocked(isTicketmasterConfigured).mockReturnValue(false);

    const res = await supertest(app)
      .post('/api/v1/admin/sync/trigger')
      .set('Authorization', AUTH)
      .send({ sourceType: 'TICKETMASTER' });

    expect(res.status).toBe(400);
    expect(syncService.syncTicketmaster).not.toHaveBeenCalled();
  });

  it('401s without a token and 403s for a non-admin', async () => {
    const anonymous = await supertest(app)
      .post('/api/v1/admin/sync/trigger')
      .send({ sourceType: 'TICKETMASTER' });
    expect(anonymous.status).toBe(401);

    actingAs('USER');
    const user = await supertest(app)
      .post('/api/v1/admin/sync/trigger')
      .set('Authorization', AUTH)
      .send({ sourceType: 'TICKETMASTER' });
    expect(user.status).toBe(403);
    expect(syncService.syncTicketmaster).not.toHaveBeenCalled();
  });
});
