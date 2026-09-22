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
import * as searchService from '../../src/modules/search/search.service';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';

const SAMPLE_RESULT = {
  events: [
    {
      id: 'e1',
      title: 'Knock2 at Brooklyn Mirage',
      slug: 'knock2-mirage',
      startsAt: new Date('2026-10-17T22:00:00Z'),
      venue: { name: 'Brooklyn Mirage', city: 'Brooklyn' },
      rank: 0.95,
    },
  ],
  artists: [{ id: 'a1', name: 'Knock2', slug: 'knock2', imageUrl: null, rank: 0.88 }],
  venues: [{ id: 'v1', name: 'Knockdown Center', slug: 'knockdown-center', city: 'Queens', rank: 0.72 }],
};

const SAMPLE_AUTOCOMPLETE = [
  {
    type: 'artist' as const,
    id: 'a1',
    name: 'Knock2',
    slug: 'knock2',
    subtitle: 'Bass / Trap',
    similarity: 0.91,
  },
  {
    type: 'event' as const,
    id: 'e1',
    name: 'Knock2 at Brooklyn Mirage',
    slug: 'knock2-mirage',
    subtitle: 'Oct 17, 2026 – Brooklyn, NY',
    similarity: 0.85,
  },
];

describe('GET /api/v1/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with the three-key shape', async () => {
    vi.mocked(searchService.search).mockResolvedValue(SAMPLE_RESULT);

    const res = await supertest(app).get('/api/v1/search?q=knock2');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      ...SAMPLE_RESULT,
      events: [{ ...SAMPLE_RESULT.events[0], startsAt: SAMPLE_RESULT.events[0]!.startsAt.toISOString() }],
    });
    expect(res.body.data).toHaveProperty('events');
    expect(res.body.data).toHaveProperty('artists');
    expect(res.body.data).toHaveProperty('venues');
  });

  it('defaults type to all three entity types', async () => {
    vi.mocked(searchService.search).mockResolvedValue(SAMPLE_RESULT);

    await supertest(app).get('/api/v1/search?q=knock2');

    expect(searchService.search).toHaveBeenCalledWith({
      q: 'knock2',
      types: ['event', 'artist', 'venue'],
      limit: 20,
    });
  });

  it('narrows to only the requested type', async () => {
    vi.mocked(searchService.search).mockResolvedValue(SAMPLE_RESULT);

    await supertest(app).get('/api/v1/search?q=knock2&type=artist');

    expect(searchService.search).toHaveBeenCalledWith({
      q: 'knock2',
      types: ['artist'],
      limit: 20,
    });
  });

  it('passes limit through to the service', async () => {
    vi.mocked(searchService.search).mockResolvedValue(SAMPLE_RESULT);

    await supertest(app).get('/api/v1/search?q=knock2&limit=5');

    expect(searchService.search).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
    );
  });

  it('returns 400 for a 1-character q', async () => {
    const res = await supertest(app).get('/api/v1/search?q=k');

    expect(res.status).toBe(400);
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('returns 400 when q is missing', async () => {
    const res = await supertest(app).get('/api/v1/search');

    expect(res.status).toBe(400);
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid type', async () => {
    const res = await supertest(app).get('/api/v1/search?q=knock2&type=invalid');

    expect(res.status).toBe(400);
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('works anonymously', async () => {
    vi.mocked(searchService.search).mockResolvedValue(SAMPLE_RESULT);

    const res = await supertest(app).get('/api/v1/search?q=knock2');

    expect(res.status).toBe(200);
  });

  it('works with a valid auth token present', async () => {
    vi.mocked(searchService.search).mockResolvedValue(SAMPLE_RESULT);

    const res = await supertest(app).get('/api/v1/search?q=knock2').set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/v1/search/autocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with a flat array', async () => {
    vi.mocked(searchService.autocomplete).mockResolvedValue(SAMPLE_AUTOCOMPLETE);

    const res = await supertest(app).get('/api/v1/search/autocomplete?q=kno');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toEqual(SAMPLE_AUTOCOMPLETE);
  });

  it('defaults limit to 10', async () => {
    vi.mocked(searchService.autocomplete).mockResolvedValue(SAMPLE_AUTOCOMPLETE);

    await supertest(app).get('/api/v1/search/autocomplete?q=kno');

    expect(searchService.autocomplete).toHaveBeenCalledWith({ q: 'kno', limit: 10 });
  });

  it('returns 400 for a 1-character q', async () => {
    const res = await supertest(app).get('/api/v1/search/autocomplete?q=k');

    expect(res.status).toBe(400);
    expect(searchService.autocomplete).not.toHaveBeenCalled();
  });

  it('works anonymously', async () => {
    vi.mocked(searchService.autocomplete).mockResolvedValue(SAMPLE_AUTOCOMPLETE);

    const res = await supertest(app).get('/api/v1/search/autocomplete?q=kno');

    expect(res.status).toBe(200);
  });

  it('works with a valid auth token present', async () => {
    vi.mocked(searchService.autocomplete).mockResolvedValue(SAMPLE_AUTOCOMPLETE);

    const res = await supertest(app)
      .get('/api/v1/search/autocomplete?q=kno')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
  });
});
