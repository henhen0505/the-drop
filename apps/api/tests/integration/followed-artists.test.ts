import { describe, expect, it, vi, beforeEach } from 'vitest';
import supertest from 'supertest';

vi.mock('../../src/middleware/rate-limit', () => ({
  unauthenticatedRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  authenticatedRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../src/modules/artists/artist.service', () => ({
  listArtists: vi.fn(),
  getArtist: vi.fn(),
  followArtist: vi.fn(),
  unfollowArtist: vi.fn(),
  getFollowedArtists: vi.fn(),
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
import * as artistService from '../../src/modules/artists/artist.service';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';

describe('GET /api/v1/users/me/followed-artists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with followed artists list', async () => {
    vi.mocked(artistService.getFollowedArtists).mockResolvedValue({
      data: [
        {
          id: 'a1',
          name: 'Skrillex',
          slug: 'skrillex',
          imageUrl: null,
          genres: [{ id: 'g1', name: 'Dubstep' }],
          followerCount: 100,
          spotifyUrl: null,
          followedAt: new Date('2024-05-01T12:00:00Z'),
        },
      ],
      cursor: null,
    });

    const res = await supertest(app)
      .get('/api/v1/users/me/followed-artists')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Skrillex');
    expect(res.body.data[0].followedAt).toBe('2024-05-01T12:00:00.000Z');
    expect(res.body.cursor).toBeNull();
  });

  it('returns 200 with empty list when following no one', async () => {
    vi.mocked(artistService.getFollowedArtists).mockResolvedValue({ data: [], cursor: null });

    const res = await supertest(app)
      .get('/api/v1/users/me/followed-artists')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('passes pagination params to service', async () => {
    vi.mocked(artistService.getFollowedArtists).mockResolvedValue({ data: [], cursor: null });

    await supertest(app)
      .get('/api/v1/users/me/followed-artists?limit=5&cursor=abc')
      .set('Authorization', AUTH_HEADER);

    expect(artistService.getFollowedArtists).toHaveBeenCalledWith('user-1', {
      limit: 5,
      cursor: 'abc',
    });
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app).get('/api/v1/users/me/followed-artists');
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid limit', async () => {
    const res = await supertest(app)
      .get('/api/v1/users/me/followed-artists?limit=999')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(400);
  });

  it('returns cursor when more pages exist', async () => {
    vi.mocked(artistService.getFollowedArtists).mockResolvedValue({
      data: [
        {
          id: 'a1',
          name: 'Skrillex',
          slug: 'skrillex',
          imageUrl: null,
          genres: [],
          followerCount: 0,
          spotifyUrl: null,
          followedAt: new Date('2024-05-01T12:00:00Z'),
        },
      ],
      cursor: 'next-page-cursor',
    });

    const res = await supertest(app)
      .get('/api/v1/users/me/followed-artists')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.cursor).toBe('next-page-cursor');
  });
});
