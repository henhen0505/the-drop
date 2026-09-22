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
  verifyAccessToken: vi.fn().mockReturnValue({ sub: 'user-1', email: 'test@test.com', role: 'USER' }),
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
import * as genreService from '../../src/modules/genres/genre.service';

const app = createApp();

describe('GET /api/v1/genres', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with the nested genre tree wrapped in data', async () => {
    vi.mocked(genreService.listGenreTree).mockResolvedValue([
      {
        id: 'g1',
        name: 'House',
        slug: 'house',
        children: [{ id: 'g2', name: 'Deep House', slug: 'deep-house', children: [] }],
      },
    ]);

    const res = await supertest(app).get('/api/v1/genres');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [
        {
          id: 'g1',
          name: 'House',
          slug: 'house',
          children: [{ id: 'g2', name: 'Deep House', slug: 'deep-house', children: [] }],
        },
      ],
    });
  });

  it('returns an empty list when there are no genres', async () => {
    vi.mocked(genreService.listGenreTree).mockResolvedValue([]);

    const res = await supertest(app).get('/api/v1/genres');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('requires no auth', async () => {
    vi.mocked(genreService.listGenreTree).mockResolvedValue([]);

    const res = await supertest(app).get('/api/v1/genres');

    expect(res.status).toBe(200);
  });
});
