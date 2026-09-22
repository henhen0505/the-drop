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
import * as eventService from '../../src/modules/events/event.service';
import { NotFoundError, NotImplementedError } from '../../src/utils/errors';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';
const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID_2 = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

const SAMPLE_EVENT = {
  id: 'e1',
  title: 'Skrillex at Brooklyn Mirage',
  slug: 'skrillex-at-brooklyn-mirage-2024',
  imageUrl: 'https://example.com/event.jpg',
  startsAt: new Date('2024-08-15T22:00:00Z'),
  endsAt: new Date('2024-08-16T04:00:00Z'),
  timezone: 'America/New_York',
  ageRestriction: '21+',
  artistCount: 1,
  userState: null,
  recommendationScore: null,
  venue: {
    id: 'v1',
    name: 'Brooklyn Mirage',
    slug: 'brooklyn-mirage',
    city: 'Brooklyn',
    state: 'NY',
  },
  artists: [
    {
      id: 'a1',
      name: 'Skrillex',
      slug: 'skrillex',
      imageUrl: null,
      isHeadliner: true,
    },
  ],
  genres: [{ id: 'g1', name: 'Dubstep' }],
  minPriceCents: 5000,
  status: 'PUBLISHED',
};

const SAMPLE_DETAIL = {
  id: SAMPLE_EVENT.id,
  title: SAMPLE_EVENT.title,
  slug: SAMPLE_EVENT.slug,
  imageUrl: SAMPLE_EVENT.imageUrl,
  startsAt: SAMPLE_EVENT.startsAt,
  endsAt: SAMPLE_EVENT.endsAt,
  timezone: SAMPLE_EVENT.timezone,
  minPriceCents: SAMPLE_EVENT.minPriceCents,
  status: SAMPLE_EVENT.status,
  ageRestriction: SAMPLE_EVENT.ageRestriction,
  artistCount: SAMPLE_EVENT.artistCount,
  userState: null,
  description: 'An incredible night of bass music',
  venue: {
    ...SAMPLE_EVENT.venue,
    address: '140 Stewart Ave',
    latitude: 40.7128,
    longitude: -73.9352,
    capacity: 5000,
    typicalAgeRestriction: '21+',
  },
  artists: [
    {
      ...SAMPLE_EVENT.artists[0]!,
      genres: [{ id: 'g1', name: 'Dubstep', slug: 'dubstep' }],
    },
  ],
  genres: [{ id: 'g1', name: 'Dubstep', slug: 'dubstep' }],
  ticketLinks: [
    {
      id: 'tl1',
      vendorName: 'Ticketmaster',
      vendorClassification: 'OFFICIAL' as const,
      url: 'https://ticketmaster.com/event/123',
      affiliateUrl: 'https://affiliate.example.com/123',
      priceMinCents: 5000,
      priceMaxCents: 15000,
      currency: 'USD',
      ticketType: 'GA',
      feesKnown: true,
      lastCheckedAt: new Date('2024-08-01T00:00:00Z'),
      ftcDisclosure: 'This is an affiliate link. We may earn a commission.',
    },
  ],
  sources: [
    {
      sourceType: 'TICKETMASTER' as const,
      sourceUrl: 'https://ticketmaster.com/event/123',
      lastSyncedAt: new Date('2024-08-01T00:00:00Z'),
      confidence: 'TRUSTED_SOURCE' as const,
    },
  ],
  doorTime: '21:00',
  reentryPolicy: 'No re-entry',
  bagPolicy: 'Clear bags only',
  prohibitedItems: 'Weapons',
  dressCode: null,
  confidence: 'TRUSTED_SOURCE' as const,
  primarySource: 'TICKETMASTER' as const,
  lastVerifiedAt: new Date('2024-08-01T00:00:00Z'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

describe('GET /api/v1/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with event list', async () => {
    vi.mocked(eventService.listEvents).mockResolvedValue({
      data: [SAMPLE_EVENT],
      cursor: null,
    });

    const res = await supertest(app).get('/api/v1/events');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Skrillex at Brooklyn Mirage');
  });

  it('returns the contract list-item fields', async () => {
    vi.mocked(eventService.listEvents).mockResolvedValue({ data: [SAMPLE_EVENT], cursor: null });

    const res = await supertest(app).get('/api/v1/events');

    expect(res.body.data[0]).toMatchObject({
      timezone: 'America/New_York',
      ageRestriction: '21+',
      artistCount: 1,
      userState: null,
      recommendationScore: null,
    });
    expect(res.body.data[0].artists[0]).toMatchObject({ slug: 'skrillex', isHeadliner: true });
  });

  it('passes filter params to service', async () => {
    vi.mocked(eventService.listEvents).mockResolvedValue({ data: [], cursor: null });

    await supertest(app).get(
      `/api/v1/events?q=rave&city=Brooklyn&state=NY&genreId=${UUID}&venueId=${UUID_2}` +
        '&startsAfter=2026-10-01T00:00:00Z&startsBefore=2026-10-31T23:59:59Z' +
        '&priceMin=5000&priceMax=15000&status=PUBLISHED&sort=price&limit=5&cursor=abc',
    );

    expect(eventService.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'rave',
        city: 'Brooklyn',
        state: 'NY',
        genreId: UUID,
        venueId: UUID_2,
        startsAfter: new Date('2026-10-01T00:00:00Z'),
        startsBefore: new Date('2026-10-31T23:59:59Z'),
        priceMin: 5000,
        priceMax: 15000,
        status: 'PUBLISHED',
        sort: 'price',
        limit: 5,
        cursor: 'abc',
      }),
    );
  });

  it('defaults sort to date', async () => {
    vi.mocked(eventService.listEvents).mockResolvedValue({ data: [], cursor: null });

    await supertest(app).get('/api/v1/events');

    expect(eventService.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'date' }),
    );
  });

  it('normalizes a raw + in ageRestriction ("21 " becomes "21+")', async () => {
    vi.mocked(eventService.listEvents).mockResolvedValue({ data: [], cursor: null });

    await supertest(app).get('/api/v1/events?ageRestriction=21+');

    expect(eventService.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ ageRestriction: '21+' }),
    );
  });

  it('passes an encoded %2B ageRestriction through unchanged', async () => {
    vi.mocked(eventService.listEvents).mockResolvedValue({ data: [], cursor: null });

    await supertest(app).get('/api/v1/events?ageRestriction=18%2B');

    expect(eventService.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ ageRestriction: '18+' }),
    );
  });

  it('works without auth (anonymous)', async () => {
    vi.mocked(eventService.listEvents).mockResolvedValue({ data: [], cursor: null });

    const res = await supertest(app).get('/api/v1/events');

    expect(res.status).toBe(200);
    expect(eventService.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined }),
    );
  });

  it('passes userId when authenticated', async () => {
    vi.mocked(eventService.listEvents).mockResolvedValue({ data: [], cursor: null });

    await supertest(app).get('/api/v1/events').set('Authorization', AUTH_HEADER);

    expect(eventService.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('returns 400 for invalid limit', async () => {
    const res = await supertest(app).get('/api/v1/events?limit=999');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid genreId', async () => {
    const res = await supertest(app).get('/api/v1/events?genreId=techno');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid venueId', async () => {
    const res = await supertest(app).get('/api/v1/events?venueId=not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('returns 400 for a non-integer priceMin', async () => {
    const res = await supertest(app).get('/api/v1/events?priceMin=12.5');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid startsAfter', async () => {
    const res = await supertest(app).get('/api/v1/events?startsAfter=not-a-date');
    expect(res.status).toBe(400);
  });

  it('returns 400 for status=DRAFT', async () => {
    const res = await supertest(app).get('/api/v1/events?status=DRAFT');

    expect(res.status).toBe(400);
    expect(eventService.listEvents).not.toHaveBeenCalled();
  });

  it('returns 400 for an unknown sort', async () => {
    const res = await supertest(app).get('/api/v1/events?sort=popularity');
    expect(res.status).toBe(400);
  });

  it('returns 501 for sort=relevance', async () => {
    vi.mocked(eventService.listEvents).mockRejectedValue(
      new NotImplementedError('Relevance sorting arrives with search'),
    );

    const res = await supertest(app).get('/api/v1/events?sort=relevance');

    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
  });

  it('ignores the removed public artistId param', async () => {
    vi.mocked(eventService.listEvents).mockResolvedValue({ data: [], cursor: null });

    const res = await supertest(app).get(`/api/v1/events?artistId=${UUID}`);

    expect(res.status).toBe(200);
    expect(eventService.listEvents).toHaveBeenCalledWith(
      expect.not.objectContaining({ artistId: expect.anything() }),
    );
  });
});

describe('GET /api/v1/events/:idOrSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with event detail', async () => {
    vi.mocked(eventService.getEvent).mockResolvedValue(SAMPLE_DETAIL);

    const res = await supertest(app).get('/api/v1/events/skrillex-at-brooklyn-mirage-2024');

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Skrillex at Brooklyn Mirage');
    expect(res.body.data.ticketLinks).toHaveLength(1);
    expect(res.body.data.venue.name).toBe('Brooklyn Mirage');
  });

  it('returns the contract detail fields', async () => {
    vi.mocked(eventService.getEvent).mockResolvedValue(SAMPLE_DETAIL);

    const res = await supertest(app).get('/api/v1/events/skrillex-at-brooklyn-mirage-2024');
    const data = res.body.data;

    expect(data).toMatchObject({
      reentryPolicy: 'No re-entry',
      bagPolicy: 'Clear bags only',
      prohibitedItems: 'Weapons',
      dressCode: null,
      lastVerifiedAt: '2024-08-01T00:00:00.000Z',
    });
    expect(data.venue).toMatchObject({ address: '140 Stewart Ave', capacity: 5000 });
    expect(data.artists[0].genres).toEqual([{ id: 'g1', name: 'Dubstep', slug: 'dubstep' }]);
    expect(data.genres[0].slug).toBe('dubstep');
    expect(data.ticketLinks[0]).toMatchObject({
      vendorClassification: 'OFFICIAL',
      feesKnown: true,
      ftcDisclosure: 'This is an affiliate link. We may earn a commission.',
    });
    expect(data.sources[0]).toMatchObject({
      sourceType: 'TICKETMASTER',
      confidence: 'TRUSTED_SOURCE',
    });
    expect(data.sources[0]).not.toHaveProperty('rawData');
  });

  it('returns 404 when event not found', async () => {
    vi.mocked(eventService.getEvent).mockRejectedValue(new NotFoundError('Event not found'));

    const res = await supertest(app).get('/api/v1/events/nonexistent');

    expect(res.status).toBe(404);
  });

  it('works without auth', async () => {
    vi.mocked(eventService.getEvent).mockResolvedValue(SAMPLE_DETAIL);

    const res = await supertest(app).get('/api/v1/events/some-event');

    expect(res.status).toBe(200);
    expect(eventService.getEvent).toHaveBeenCalledWith('some-event', undefined);
  });
});

describe('GET /api/v1/artists/:idOrSlug/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with events for artist', async () => {
    vi.mocked(eventService.getEventsByArtist).mockResolvedValue({
      data: [SAMPLE_EVENT],
      cursor: null,
    });

    const res = await supertest(app).get('/api/v1/artists/skrillex/events');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('passes pagination params and userId to service', async () => {
    vi.mocked(eventService.getEventsByArtist).mockResolvedValue({ data: [], cursor: null });

    await supertest(app)
      .get('/api/v1/artists/skrillex/events?limit=5&cursor=abc')
      .set('Authorization', AUTH_HEADER);

    expect(eventService.getEventsByArtist).toHaveBeenCalledWith('skrillex', {
      limit: 5,
      cursor: 'abc',
      userId: 'user-1',
    });
  });

  it('returns 404 when artist not found', async () => {
    vi.mocked(eventService.getEventsByArtist).mockRejectedValue(
      new NotFoundError('Artist not found'),
    );

    const res = await supertest(app).get('/api/v1/artists/nonexistent/events');

    expect(res.status).toBe(404);
  });

  it('returns 200 with empty list when artist has no events', async () => {
    vi.mocked(eventService.getEventsByArtist).mockResolvedValue({ data: [], cursor: null });

    const res = await supertest(app).get('/api/v1/artists/skrillex/events');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /api/v1/venues/:idOrSlug/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with events for venue', async () => {
    vi.mocked(eventService.getEventsByVenue).mockResolvedValue({
      data: [SAMPLE_EVENT],
      cursor: 'next',
    });

    const res = await supertest(app).get('/api/v1/venues/brooklyn-mirage/events');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.cursor).toBe('next');
  });

  it('defaults upcoming to true and passes pagination + userId', async () => {
    vi.mocked(eventService.getEventsByVenue).mockResolvedValue({ data: [], cursor: null });

    await supertest(app)
      .get('/api/v1/venues/brooklyn-mirage/events?limit=5&cursor=abc')
      .set('Authorization', AUTH_HEADER);

    expect(eventService.getEventsByVenue).toHaveBeenCalledWith('brooklyn-mirage', {
      upcoming: true,
      limit: 5,
      cursor: 'abc',
      userId: 'user-1',
    });
  });

  it('passes upcoming=false through to the service', async () => {
    vi.mocked(eventService.getEventsByVenue).mockResolvedValue({ data: [], cursor: null });

    await supertest(app).get('/api/v1/venues/brooklyn-mirage/events?upcoming=false');

    expect(eventService.getEventsByVenue).toHaveBeenCalledWith(
      'brooklyn-mirage',
      expect.objectContaining({ upcoming: false }),
    );
  });

  it('returns 400 for a non-boolean upcoming', async () => {
    const res = await supertest(app).get('/api/v1/venues/brooklyn-mirage/events?upcoming=maybe');

    expect(res.status).toBe(400);
    expect(eventService.getEventsByVenue).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid limit', async () => {
    const res = await supertest(app).get('/api/v1/venues/brooklyn-mirage/events?limit=999');
    expect(res.status).toBe(400);
  });

  it('returns 404 when venue not found', async () => {
    vi.mocked(eventService.getEventsByVenue).mockRejectedValue(
      new NotFoundError('Venue not found'),
    );

    const res = await supertest(app).get('/api/v1/venues/nonexistent/events');

    expect(res.status).toBe(404);
  });
});
