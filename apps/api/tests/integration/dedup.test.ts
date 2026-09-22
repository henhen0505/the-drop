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
import * as dedupService from '../../src/modules/admin/dedup.service';
import { ConflictError, NotFoundError } from '../../src/utils/errors';

const app = createApp();
const AUTH = 'Bearer token';
const CANDIDATE_ID = '550e8400-e29b-41d4-a716-446655440000';

function actingAs(role: 'ADMIN' | 'USER'): void {
  vi.mocked(authService.verifyAccessToken).mockReturnValue({
    sub: 'admin-1',
    email: 'admin@test.com',
    role,
  });
}

describe('GET /api/v1/admin/dedup/candidates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actingAs('ADMIN');
  });

  it('returns the review queue, defaulting to PENDING_REVIEW', async () => {
    vi.mocked(dedupService.listCandidates).mockResolvedValue({
      data: [
        {
          id: 'mc-1',
          status: 'PENDING_REVIEW',
          incoming: {
            title: 'Knock2 -- NYC',
            startsAt: new Date('2024-10-17T02:00:00Z'),
            venueName: 'The Brooklyn Mirage',
            artists: ['Knock2'],
            sourceType: 'SEATGEEK',
          },
          candidate: {
            id: 'evt-1',
            title: 'Knock2 at Brooklyn Mirage',
            startsAt: new Date('2024-10-17T02:00:00Z'),
            venue: { id: 'v-1', name: 'Brooklyn Mirage', city: 'Brooklyn' },
            artists: ['Knock2'],
          },
          score: 0.82,
          venueScore: 1,
          dateScore: 1,
          titleScore: 0.6,
          artistScore: 1,
          matchDetails: {},
          createdAt: new Date('2024-10-01T00:00:00Z'),
        },
      ],
      cursor: null,
    });

    const res = await supertest(app).get('/api/v1/admin/dedup/candidates').set('Authorization', AUTH);

    expect(res.status).toBe(200);
    expect(res.body.data[0].incoming.title).toBe('Knock2 -- NYC');
    expect(res.body.data[0].candidate.venue.name).toBe('Brooklyn Mirage');
    expect(res.body.cursor).toBeNull();
    expect(dedupService.listCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PENDING_REVIEW' }),
    );
  });

  it('passes status, limit and cursor through', async () => {
    vi.mocked(dedupService.listCandidates).mockResolvedValue({ data: [], cursor: null });

    await supertest(app)
      .get('/api/v1/admin/dedup/candidates?status=REJECTED&limit=5&cursor=abc')
      .set('Authorization', AUTH);

    expect(dedupService.listCandidates).toHaveBeenCalledWith({
      status: 'REJECTED',
      limit: 5,
      cursor: 'abc',
    });
  });

  it('400s on an unknown status or an out-of-range limit', async () => {
    const bad = await supertest(app)
      .get('/api/v1/admin/dedup/candidates?status=BOGUS')
      .set('Authorization', AUTH);
    const tooMany = await supertest(app)
      .get('/api/v1/admin/dedup/candidates?limit=500')
      .set('Authorization', AUTH);

    expect(bad.status).toBe(400);
    expect(tooMany.status).toBe(400);
  });

  it('401s without a token and 403s for a non-admin', async () => {
    const anonymous = await supertest(app).get('/api/v1/admin/dedup/candidates');
    expect(anonymous.status).toBe(401);

    actingAs('USER');
    const user = await supertest(app).get('/api/v1/admin/dedup/candidates').set('Authorization', AUTH);
    expect(user.status).toBe(403);
    expect(dedupService.listCandidates).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/admin/dedup/candidates/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actingAs('ADMIN');
  });

  it('resolves a candidate with the chosen action, recording the acting admin', async () => {
    vi.mocked(dedupService.resolveCandidate).mockResolvedValue({
      id: CANDIDATE_ID,
      status: 'MANUAL_MERGED',
      resultEventId: 'evt-1',
      reviewedBy: 'admin-1',
      reviewedAt: new Date('2024-10-02T00:00:00Z'),
    });

    const res = await supertest(app)
      .patch(`/api/v1/admin/dedup/candidates/${CANDIDATE_ID}`)
      .set('Authorization', AUTH)
      .send({ action: 'merge' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: CANDIDATE_ID, status: 'MANUAL_MERGED' });
    expect(dedupService.resolveCandidate).toHaveBeenCalledWith(CANDIDATE_ID, 'merge', 'admin-1');
  });

  it('supports reject', async () => {
    vi.mocked(dedupService.resolveCandidate).mockResolvedValue({
      id: CANDIDATE_ID,
      status: 'REJECTED',
      resultEventId: 'evt-2',
      reviewedBy: 'admin-1',
      reviewedAt: new Date(),
    });

    const res = await supertest(app)
      .patch(`/api/v1/admin/dedup/candidates/${CANDIDATE_ID}`)
      .set('Authorization', AUTH)
      .send({ action: 'reject' });

    expect(res.status).toBe(200);
    expect(dedupService.resolveCandidate).toHaveBeenCalledWith(CANDIDATE_ID, 'reject', 'admin-1');
  });

  it('400s on a non-UUID id, a missing body, or an unknown action', async () => {
    const badId = await supertest(app)
      .patch('/api/v1/admin/dedup/candidates/nope')
      .set('Authorization', AUTH)
      .send({ action: 'merge' });
    const noBody = await supertest(app)
      .patch(`/api/v1/admin/dedup/candidates/${CANDIDATE_ID}`)
      .set('Authorization', AUTH)
      .send({});
    const badAction = await supertest(app)
      .patch(`/api/v1/admin/dedup/candidates/${CANDIDATE_ID}`)
      .set('Authorization', AUTH)
      .send({ action: 'skip' });

    expect(badId.status).toBe(400);
    expect(noBody.status).toBe(400);
    expect(badAction.status).toBe(400);
    expect(dedupService.resolveCandidate).not.toHaveBeenCalled();
  });

  it('maps service errors: 404 for an unknown candidate, 409 when already resolved', async () => {
    vi.mocked(dedupService.resolveCandidate).mockRejectedValueOnce(new NotFoundError('gone'));
    const missing = await supertest(app)
      .patch(`/api/v1/admin/dedup/candidates/${CANDIDATE_ID}`)
      .set('Authorization', AUTH)
      .send({ action: 'merge' });
    expect(missing.status).toBe(404);

    vi.mocked(dedupService.resolveCandidate).mockRejectedValueOnce(new ConflictError('done'));
    const resolved = await supertest(app)
      .patch(`/api/v1/admin/dedup/candidates/${CANDIDATE_ID}`)
      .set('Authorization', AUTH)
      .send({ action: 'merge' });
    expect(resolved.status).toBe(409);
  });

  it('401s without a token and 403s for a non-admin', async () => {
    const anonymous = await supertest(app)
      .patch(`/api/v1/admin/dedup/candidates/${CANDIDATE_ID}`)
      .send({ action: 'merge' });
    expect(anonymous.status).toBe(401);

    actingAs('USER');
    const user = await supertest(app)
      .patch(`/api/v1/admin/dedup/candidates/${CANDIDATE_ID}`)
      .set('Authorization', AUTH)
      .send({ action: 'merge' });
    expect(user.status).toBe(403);
    expect(dedupService.resolveCandidate).not.toHaveBeenCalled();
  });
});
