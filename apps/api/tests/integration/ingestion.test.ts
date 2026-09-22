import { describe, expect, it, vi, beforeEach } from 'vitest';
import supertest from 'supertest';

vi.mock('../../src/middleware/rate-limit', () => ({
  unauthenticatedRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  authenticatedRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../../src/modules/artists/ingestion.service', () => ({
  ingestBySpotifyId: vi.fn(),
  searchAndIngest: vi.fn(),
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
  verifyAccessToken: vi.fn(),
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
import * as ingestionService from '../../src/modules/artists/ingestion.service';
import * as authService from '../../src/modules/auth/auth.service';
import { NotImplementedError } from '../../src/utils/errors';

const app = createApp();

function mockAdmin() {
  vi.mocked(authService.verifyAccessToken).mockReturnValue({
    sub: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
    iat: 0,
    exp: 0,
  });
}

function mockUser() {
  vi.mocked(authService.verifyAccessToken).mockReturnValue({
    sub: 'user-1',
    email: 'user@test.com',
    role: 'USER',
    iat: 0,
    exp: 0,
  });
}

const AUTH_HEADER = 'Bearer valid-token';

describe('POST /api/v1/artists/ingest/spotify/:spotifyId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 for newly ingested artist', async () => {
    mockAdmin();
    vi.mocked(ingestionService.ingestBySpotifyId).mockResolvedValue({
      artistId: 'a1',
      name: 'Skrillex',
      slug: 'skrillex',
      isNew: true,
      sources: ['SPOTIFY', 'LASTFM'],
      genresLinked: 2,
    });

    const res = await supertest(app)
      .post('/api/v1/artists/ingest/spotify/sp-123')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Skrillex');
    expect(res.body.data.isNew).toBe(true);
    expect(res.body.data.sources).toContain('SPOTIFY');
  });

  it('returns 200 for existing artist update', async () => {
    mockAdmin();
    vi.mocked(ingestionService.ingestBySpotifyId).mockResolvedValue({
      artistId: 'a1',
      name: 'Skrillex',
      slug: 'skrillex',
      isNew: false,
      sources: ['SPOTIFY'],
      genresLinked: 1,
    });

    const res = await supertest(app)
      .post('/api/v1/artists/ingest/spotify/sp-123')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data.isNew).toBe(false);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app).post('/api/v1/artists/ingest/spotify/sp-123');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockUser();

    const res = await supertest(app)
      .post('/api/v1/artists/ingest/spotify/sp-123')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(403);
  });

  it('returns 501 when Spotify is not configured', async () => {
    mockAdmin();
    vi.mocked(ingestionService.ingestBySpotifyId).mockRejectedValue(
      new NotImplementedError('Spotify is not configured'),
    );

    const res = await supertest(app)
      .post('/api/v1/artists/ingest/spotify/sp-123')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(501);
  });
});

describe('POST /api/v1/artists/ingest/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with ingested results', async () => {
    mockAdmin();
    vi.mocked(ingestionService.searchAndIngest).mockResolvedValue([
      {
        artistId: 'a1',
        name: 'Skrillex',
        slug: 'skrillex',
        isNew: true,
        sources: ['SPOTIFY'],
        genresLinked: 2,
      },
      {
        artistId: 'a2',
        name: 'Skrill',
        slug: 'skrill',
        isNew: true,
        sources: ['SPOTIFY'],
        genresLinked: 0,
      },
    ]);

    const res = await supertest(app)
      .post('/api/v1/artists/ingest/search')
      .set('Authorization', AUTH_HEADER)
      .send({ query: 'skrillex' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('returns 200 with empty array when no matches', async () => {
    mockAdmin();
    vi.mocked(ingestionService.searchAndIngest).mockResolvedValue([]);

    const res = await supertest(app)
      .post('/api/v1/artists/ingest/search')
      .set('Authorization', AUTH_HEADER)
      .send({ query: 'nonexistent' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns 400 for empty query', async () => {
    mockAdmin();

    const res = await supertest(app)
      .post('/api/v1/artists/ingest/search')
      .set('Authorization', AUTH_HEADER)
      .send({ query: '' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for missing query', async () => {
    mockAdmin();

    const res = await supertest(app)
      .post('/api/v1/artists/ingest/search')
      .set('Authorization', AUTH_HEADER)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app)
      .post('/api/v1/artists/ingest/search')
      .send({ query: 'skrillex' });

    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    mockUser();

    const res = await supertest(app)
      .post('/api/v1/artists/ingest/search')
      .set('Authorization', AUTH_HEADER)
      .send({ query: 'skrillex' });

    expect(res.status).toBe(403);
  });
});
