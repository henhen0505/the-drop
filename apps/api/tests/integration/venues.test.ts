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
import * as venueService from '../../src/modules/venues/venue.service';
import { NotFoundError } from '../../src/utils/errors';

const app = createApp();

describe('GET /api/v1/venues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with venue list', async () => {
    vi.mocked(venueService.listVenues).mockResolvedValue({
      data: [
        {
          id: 'v1',
          name: 'Brooklyn Mirage',
          slug: 'brooklyn-mirage',
          city: 'Brooklyn',
          state: 'NY',
          country: 'US',
          imageUrl: null,
          venueType: 'outdoor',
          capacity: 5000,
        },
      ],
      cursor: null,
    });

    const res = await supertest(app).get('/api/v1/venues');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Brooklyn Mirage');
  });

  it('passes query params to service', async () => {
    vi.mocked(venueService.listVenues).mockResolvedValue({ data: [], cursor: null });

    await supertest(app).get('/api/v1/venues?q=warehouse&city=Brooklyn&state=NY');

    expect(venueService.listVenues).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'warehouse', city: 'Brooklyn', state: 'NY' }),
    );
  });

  it('accepts an Authorization header (auth is optional)', async () => {
    vi.mocked(venueService.listVenues).mockResolvedValue({ data: [], cursor: null });

    const res = await supertest(app).get('/api/v1/venues').set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
  });

  it('returns 400 for invalid state', async () => {
    const res = await supertest(app).get('/api/v1/venues?state=NYC');
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid limit', async () => {
    const res = await supertest(app).get('/api/v1/venues?limit=999');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/venues/:idOrSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with venue detail', async () => {
    vi.mocked(venueService.getVenue).mockResolvedValue({
      id: 'v1',
      name: 'Brooklyn Mirage',
      slug: 'brooklyn-mirage',
      address: '140 Stewart Ave',
      city: 'Brooklyn',
      state: 'NY',
      country: 'US',
      postalCode: '11237',
      latitude: 40.7128,
      longitude: -73.9352,
      timezone: 'America/New_York',
      capacity: 5000,
      venueType: 'outdoor',
      imageUrl: null,
      typicalAgeRestriction: '21+',
      typicalBagPolicy: 'Small bags only',
      confidence: 'TRUSTED_SOURCE',
      primarySource: 'TICKETMASTER',
      upcomingEventCount: 5,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });

    const res = await supertest(app).get('/api/v1/venues/brooklyn-mirage');

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Brooklyn Mirage');
    expect(res.body.data.capacity).toBe(5000);
    expect(res.body.data).toMatchObject({
      confidence: 'TRUSTED_SOURCE',
      primarySource: 'TICKETMASTER',
      upcomingEventCount: 5,
    });
  });

  it('returns 404 when venue not found', async () => {
    vi.mocked(venueService.getVenue).mockRejectedValue(new NotFoundError('Venue not found'));

    const res = await supertest(app).get('/api/v1/venues/nonexistent');

    expect(res.status).toBe(404);
  });
});
