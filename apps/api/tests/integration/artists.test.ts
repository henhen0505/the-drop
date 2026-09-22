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
import * as eventService from '../../src/modules/events/event.service';
import { ConflictError, NotFoundError } from '../../src/utils/errors';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';

describe('GET /api/v1/artists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with paginated artist list', async () => {
    vi.mocked(artistService.listArtists).mockResolvedValue({
      data: [
        {
          id: 'a1',
          name: 'Skrillex',
          slug: 'skrillex',
          imageUrl: 'https://example.com/skrillex.jpg',
          genres: [{ id: 'g1', name: 'Dubstep' }],
          followerCount: 100,
          spotifyUrl: 'https://open.spotify.com/artist/abc',
          isFollowed: false,
        },
      ],
      cursor: null,
    });

    const res = await supertest(app).get('/api/v1/artists');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Skrillex');
    expect(res.body.cursor).toBeNull();
  });

  it('passes query params to service', async () => {
    vi.mocked(artistService.listArtists).mockResolvedValue({ data: [], cursor: null });

    await supertest(app).get('/api/v1/artists?q=bass&genre=dubstep&limit=10');

    expect(artistService.listArtists).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'bass', genre: 'dubstep', limit: 10 }),
    );
  });

  it('works without auth (anonymous)', async () => {
    vi.mocked(artistService.listArtists).mockResolvedValue({ data: [], cursor: null });

    const res = await supertest(app).get('/api/v1/artists');

    expect(res.status).toBe(200);
    expect(artistService.listArtists).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined }),
    );
  });

  it('passes userId when authenticated', async () => {
    vi.mocked(artistService.listArtists).mockResolvedValue({ data: [], cursor: null });

    await supertest(app).get('/api/v1/artists').set('Authorization', AUTH_HEADER);

    expect(artistService.listArtists).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('returns 400 for invalid limit', async () => {
    const res = await supertest(app).get('/api/v1/artists?limit=999');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/artists/:idOrSlug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with artist detail by slug', async () => {
    vi.mocked(artistService.getArtist).mockResolvedValue({
      id: 'a1',
      name: 'Skrillex',
      slug: 'skrillex',
      imageUrl: null,
      bio: 'LA-based producer',
      genres: [{ id: 'g1', name: 'Dubstep', slug: 'dubstep' }],
      spotifyUrl: null,
      soundcloudUrl: null,
      appleMusicUrl: null,
      followerCount: 100,
      isFollowed: false,
      confidence: 'UNVERIFIED',
      primarySource: 'SPOTIFY',
      upcomingEventCount: 3,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });

    const res = await supertest(app).get('/api/v1/artists/skrillex');

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Skrillex');
    expect(res.body.data.bio).toBe('LA-based producer');
    expect(res.body.data.upcomingEventCount).toBe(3);
  });

  it('returns 404 when artist not found', async () => {
    vi.mocked(artistService.getArtist).mockRejectedValue(new NotFoundError('Artist not found'));

    const res = await supertest(app).get('/api/v1/artists/nonexistent');

    expect(res.status).toBe(404);
  });

  it('works without auth', async () => {
    vi.mocked(artistService.getArtist).mockResolvedValue({
      id: 'a1',
      name: 'Skrillex',
      slug: 'skrillex',
      imageUrl: null,
      bio: null,
      genres: [],
      spotifyUrl: null,
      soundcloudUrl: null,
      appleMusicUrl: null,
      followerCount: 0,
      isFollowed: false,
      confidence: 'UNVERIFIED',
      primarySource: 'SPOTIFY',
      upcomingEventCount: 0,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    });

    const res = await supertest(app).get('/api/v1/artists/skrillex');

    expect(res.status).toBe(200);
    expect(artistService.getArtist).toHaveBeenCalledWith('skrillex', undefined);
  });
});

describe('GET /api/v1/artists/:idOrSlug/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with empty events stub', async () => {
    vi.mocked(eventService.getEventsByArtist).mockResolvedValue({ data: [], cursor: null });

    const res = await supertest(app).get('/api/v1/artists/skrillex/events');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.cursor).toBeNull();
  });
});

describe('POST /api/v1/artists/:id/follow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 on successful follow', async () => {
    const followedAt = new Date('2024-06-15');
    vi.mocked(artistService.followArtist).mockResolvedValue({
      artistId: '550e8400-e29b-41d4-a716-446655440000',
      followedAt,
    });

    const res = await supertest(app)
      .post('/api/v1/artists/550e8400-e29b-41d4-a716-446655440000/follow')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(201);
    expect(res.body.data.artistId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app).post(
      '/api/v1/artists/550e8400-e29b-41d4-a716-446655440000/follow',
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-UUID artist id', async () => {
    const res = await supertest(app)
      .post('/api/v1/artists/not-a-uuid/follow')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(400);
  });

  it('returns 409 when already following', async () => {
    vi.mocked(artistService.followArtist).mockRejectedValue(
      new ConflictError('Already following this artist'),
    );

    const res = await supertest(app)
      .post('/api/v1/artists/550e8400-e29b-41d4-a716-446655440000/follow')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/v1/artists/:id/follow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 204 on successful unfollow', async () => {
    vi.mocked(artistService.unfollowArtist).mockResolvedValue();

    const res = await supertest(app)
      .delete('/api/v1/artists/550e8400-e29b-41d4-a716-446655440000/follow')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(204);
  });

  it('returns 401 without auth', async () => {
    const res = await supertest(app).delete(
      '/api/v1/artists/550e8400-e29b-41d4-a716-446655440000/follow',
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for non-UUID artist id', async () => {
    const res = await supertest(app)
      .delete('/api/v1/artists/not-a-uuid/follow')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(400);
  });

  it('returns 404 when not following', async () => {
    vi.mocked(artistService.unfollowArtist).mockRejectedValue(
      new NotFoundError('Not following this artist'),
    );

    const res = await supertest(app)
      .delete('/api/v1/artists/550e8400-e29b-41d4-a716-446655440000/follow')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});
