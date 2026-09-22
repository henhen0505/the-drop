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
import * as reviewService from '../../src/modules/admin/submission-review.service';
import { ConflictError, NotFoundError } from '../../src/utils/errors';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';
const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

function actingAs(role: 'USER' | 'PROMOTER' | 'ADMIN'): void {
  vi.mocked(authService.verifyAccessToken).mockReturnValue({ sub: 'admin-1', email: 'a@test.com', role });
}

const REVIEWED = {
  id: SUBMISSION_ID,
  eventTitle: 'Underground Warehouse Rave',
  eventStartsAt: new Date('2030-11-16T03:00:00Z'),
  venueId: null,
  venueNameRaw: 'The Lot',
  venueAddressRaw: null,
  artistNames: [],
  description: null,
  posterImageUrl: null,
  ticketUrl: null,
  sourceUrl: null,
  ageRestriction: null,
  status: 'APPROVED' as const,
  reviewNotes: null,
  reviewedAt: new Date('2026-09-21T00:00:00Z'),
  mergedEventId: null,
  createdAt: new Date('2026-09-20T12:00:00Z'),
  updatedAt: new Date('2026-09-21T00:00:00Z'),
  resultEventId: EVENT_ID,
  dedupDecision: 'NO_MATCH' as const,
};

describe('GET /api/v1/admin/submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs('ADMIN');
  });

  it('returns the review queue, defaulting to PENDING', async () => {
    vi.mocked(reviewService.listSubmissions).mockResolvedValue({
      data: [
        {
          ...REVIEWED,
          status: 'PENDING',
          reviewNotes: null,
          reviewedAt: null,
          resultEventId: undefined,
          dedupDecision: undefined,
          submitter: { id: 'user-1', displayName: 'Raver', role: 'PROMOTER' },
          venue: null,
        } as never,
      ],
      cursor: null,
    });

    const res = await supertest(app).get('/api/v1/admin/submissions').set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data[0].submitter).toEqual({ id: 'user-1', displayName: 'Raver', role: 'PROMOTER' });
    expect(reviewService.listSubmissions).toHaveBeenCalledWith({
      status: 'PENDING',
      limit: undefined,
      cursor: undefined,
    });
  });

  it('passes the status, limit and cursor through', async () => {
    vi.mocked(reviewService.listSubmissions).mockResolvedValue({ data: [], cursor: null });

    await supertest(app)
      .get('/api/v1/admin/submissions?status=REJECTED&limit=5&cursor=abc')
      .set('Authorization', AUTH_HEADER);

    expect(reviewService.listSubmissions).toHaveBeenCalledWith({ status: 'REJECTED', limit: 5, cursor: 'abc' });
  });

  it('400s on an unknown status or limit', async () => {
    const status = await supertest(app).get('/api/v1/admin/submissions?status=DONE').set('Authorization', AUTH_HEADER);
    const limit = await supertest(app).get('/api/v1/admin/submissions?limit=500').set('Authorization', AUTH_HEADER);

    expect(status.status).toBe(400);
    expect(limit.status).toBe(400);
  });

  it('401s without a token and 403s for a non-admin', async () => {
    expect((await supertest(app).get('/api/v1/admin/submissions')).status).toBe(401);

    actingAs('PROMOTER');
    const promoter = await supertest(app).get('/api/v1/admin/submissions').set('Authorization', AUTH_HEADER);
    actingAs('USER');
    const user = await supertest(app).get('/api/v1/admin/submissions').set('Authorization', AUTH_HEADER);

    expect(promoter.status).toBe(403);
    expect(user.status).toBe(403);
    expect(reviewService.listSubmissions).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/admin/submissions/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs('ADMIN');
    vi.mocked(reviewService.reviewSubmission).mockResolvedValue(REVIEWED);
  });

  function patch(payload: Record<string, unknown>, id = SUBMISSION_ID) {
    return supertest(app).patch(`/api/v1/admin/submissions/${id}`).set('Authorization', AUTH_HEADER).send(payload);
  }

  it('approves a submission, returning the result event and the dedup decision', async () => {
    const res = await patch({ status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: SUBMISSION_ID, status: 'APPROVED', resultEventId: EVENT_ID, dedupDecision: 'NO_MATCH' });
    expect(reviewService.reviewSubmission).toHaveBeenCalledWith(SUBMISSION_ID, 'admin-1', { status: 'APPROVED' });
  });

  it('rejects with notes, recording the acting admin', async () => {
    await patch({ status: 'REJECTED', reviewNotes: 'Duplicate flyer' });

    expect(reviewService.reviewSubmission).toHaveBeenCalledWith(SUBMISSION_ID, 'admin-1', {
      status: 'REJECTED',
      reviewNotes: 'Duplicate flyer',
    });
  });

  it('merges into an existing event when given its id', async () => {
    await patch({ status: 'MERGED', mergedEventId: EVENT_ID });

    expect(reviewService.reviewSubmission).toHaveBeenCalledWith(SUBMISSION_ID, 'admin-1', {
      status: 'MERGED',
      mergedEventId: EVENT_ID,
    });
  });

  it('400s on an invalid decision, a MERGED without a target, a target on any other decision, or a bad id', async () => {
    const responses = await Promise.all([
      patch({ status: 'PENDING' }),
      patch({ status: 'MERGED' }),
      patch({ status: 'APPROVED', mergedEventId: EVENT_ID }),
      patch({ status: 'MERGED', mergedEventId: 'nope' }),
      patch({}),
      patch({ status: 'APPROVED' }, 'not-a-uuid'),
    ]);

    for (const res of responses) expect(res.status).toBe(400);
    expect(reviewService.reviewSubmission).not.toHaveBeenCalled();
  });

  it('maps an unknown submission to 404 and an already-reviewed one to 409', async () => {
    vi.mocked(reviewService.reviewSubmission).mockRejectedValueOnce(new NotFoundError('Submission not found'));
    expect((await patch({ status: 'APPROVED' })).status).toBe(404);

    vi.mocked(reviewService.reviewSubmission).mockRejectedValueOnce(new ConflictError('Already reviewed'));
    expect((await patch({ status: 'APPROVED' })).status).toBe(409);
  });

  it('401s without a token and 403s for a non-admin', async () => {
    const anonymous = await supertest(app)
      .patch(`/api/v1/admin/submissions/${SUBMISSION_ID}`)
      .send({ status: 'APPROVED' });
    expect(anonymous.status).toBe(401);

    actingAs('USER');
    expect((await patch({ status: 'APPROVED' })).status).toBe(403);
    expect(reviewService.reviewSubmission).not.toHaveBeenCalled();
  });
});
