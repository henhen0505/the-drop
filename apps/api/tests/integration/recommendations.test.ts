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
import * as recommendationService from '../../src/modules/recommendations/recommendation.service';
import { NotFoundError } from '../../src/utils/errors';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';

const SAMPLE = {
  data: [
    {
      event: {
        id: 'e1',
        title: 'Knock2 at Brooklyn Mirage',
        slug: 'knock2-mirage',
        imageUrl: null,
        startsAt: new Date('2026-10-17T22:00:00Z'),
        endsAt: null,
        timezone: 'America/New_York',
        venue: { id: 'v1', name: 'Brooklyn Mirage', slug: 'brooklyn-mirage', city: 'Brooklyn', state: 'NY' },
        artists: [],
        genres: [],
        minPriceCents: 5000,
        status: 'PUBLISHED',
        ageRestriction: '21+',
        artistCount: 1,
        userState: null,
        recommendationScore: 0.94,
      },
      score: 0.94,
      explanation: 'You follow ISOxo and RL Grime, and this is 12 miles from your location',
      factors: {
        artistAffinity: 0.85,
        genreAffinity: 0.7,
        distanceScore: 0.92,
        priceFit: 1,
        venueAffinity: 0.5,
      },
    },
  ],
  cursor: null,
};

describe('GET /api/v1/recommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns scored recommendations with an explanation and the factor breakdown', async () => {
    vi.mocked(recommendationService.getRecommendations).mockResolvedValue(SAMPLE);

    const res = await supertest(app).get('/api/v1/recommendations').set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data[0].score).toBe(0.94);
    expect(res.body.data[0].explanation).toContain('You follow ISOxo');
    expect(res.body.data[0].factors).toEqual(SAMPLE.data[0]?.factors);
    expect(res.body.data[0].event.title).toBe('Knock2 at Brooklyn Mirage');
    expect(res.body.cursor).toBeNull();
    expect(recommendationService.getRecommendations).toHaveBeenCalledWith('user-1', {
      limit: undefined,
      cursor: undefined,
    });
  });

  it('passes the limit and cursor through', async () => {
    vi.mocked(recommendationService.getRecommendations).mockResolvedValue({ data: [], cursor: null });

    await supertest(app)
      .get('/api/v1/recommendations?limit=5&cursor=abc')
      .set('Authorization', AUTH_HEADER);

    expect(recommendationService.getRecommendations).toHaveBeenCalledWith('user-1', {
      limit: 5,
      cursor: 'abc',
    });
  });

  it('requires authentication', async () => {
    const res = await supertest(app).get('/api/v1/recommendations');

    expect(res.status).toBe(401);
    expect(recommendationService.getRecommendations).not.toHaveBeenCalled();
  });

  it('400s on an out-of-range limit', async () => {
    const zero = await supertest(app).get('/api/v1/recommendations?limit=0').set('Authorization', AUTH_HEADER);
    const huge = await supertest(app).get('/api/v1/recommendations?limit=101').set('Authorization', AUTH_HEADER);

    expect(zero.status).toBe(400);
    expect(huge.status).toBe(400);
    expect(recommendationService.getRecommendations).not.toHaveBeenCalled();
  });

  it('maps a missing user to a 404', async () => {
    vi.mocked(recommendationService.getRecommendations).mockRejectedValue(new NotFoundError('User not found'));

    const res = await supertest(app).get('/api/v1/recommendations').set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});
