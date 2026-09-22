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
import * as similarService from '../../src/modules/events/similar-events.service';
import { NotFoundError } from '../../src/utils/errors';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

const SIMILAR = [
  {
    id: 'e2',
    title: 'Fisher at Echostage',
    slug: 'fisher-echostage',
    imageUrl: null,
    startsAt: new Date('2026-11-01T22:00:00Z'),
    endsAt: null,
    timezone: 'America/New_York',
    venue: { id: 'v1', name: 'Echostage', slug: 'echostage', city: 'Washington', state: 'DC' },
    artists: [],
    genres: [],
    minPriceCents: 4500,
    status: 'PUBLISHED',
    ageRestriction: '21+',
    artistCount: 1,
    userState: null,
    recommendationScore: null,
  },
];

describe('GET /api/v1/events/:id/similar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns similar events, defaulting to 10 and working anonymously', async () => {
    vi.mocked(similarService.getSimilarEvents).mockResolvedValue(SIMILAR);

    const res = await supertest(app).get(`/api/v1/events/${EVENT_ID}/similar`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Fisher at Echostage');
    expect(similarService.getSimilarEvents).toHaveBeenCalledWith(EVENT_ID, {
      limit: 10,
      userId: undefined,
    });
  });

  it('passes the signed-in user through so each event can carry their state', async () => {
    vi.mocked(similarService.getSimilarEvents).mockResolvedValue([]);

    await supertest(app).get(`/api/v1/events/${EVENT_ID}/similar`).set('Authorization', AUTH_HEADER);

    expect(similarService.getSimilarEvents).toHaveBeenCalledWith(EVENT_ID, {
      limit: 10,
      userId: 'user-1',
    });
  });

  it('passes a custom limit through', async () => {
    vi.mocked(similarService.getSimilarEvents).mockResolvedValue([]);

    await supertest(app).get(`/api/v1/events/${EVENT_ID}/similar?limit=3`);

    expect(similarService.getSimilarEvents).toHaveBeenCalledWith(EVENT_ID, {
      limit: 3,
      userId: undefined,
    });
  });

  it('400s on a limit above 50 or a non-UUID id', async () => {
    const tooMany = await supertest(app).get(`/api/v1/events/${EVENT_ID}/similar?limit=51`);
    const badId = await supertest(app).get('/api/v1/events/some-slug/similar');

    expect(tooMany.status).toBe(400);
    expect(badId.status).toBe(400);
    expect(similarService.getSimilarEvents).not.toHaveBeenCalled();
  });

  it('404s when the event does not exist', async () => {
    vi.mocked(similarService.getSimilarEvents).mockRejectedValue(new NotFoundError('Event not found'));

    const res = await supertest(app).get(`/api/v1/events/${EVENT_ID}/similar`);

    expect(res.status).toBe(404);
  });
});
