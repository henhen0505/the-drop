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
import * as submissionService from '../../src/modules/submissions/submission.service';
import { ConflictError, ValidationError } from '../../src/utils/errors';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';
const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111';
const VENUE_ID = '22222222-2222-4222-8222-222222222222';
const IN_A_MONTH = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

function actingAs(role: 'USER' | 'PROMOTER' | 'ADMIN'): void {
  vi.mocked(authService.verifyAccessToken).mockReturnValue({ sub: 'user-1', email: 'u@test.com', role });
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { eventTitle: 'Underground Warehouse Rave', eventStartsAt: IN_A_MONTH, venueNameRaw: 'The Lot', ...overrides };
}

describe('POST /api/v1/submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs('USER');
    vi.mocked(submissionService.createSubmission).mockResolvedValue({
      id: SUBMISSION_ID,
      status: 'PENDING',
      createdAt: new Date('2026-09-20T12:00:00Z'),
    });
  });

  it('creates a submission and returns the contract shape with a 201', async () => {
    const res = await supertest(app).post('/api/v1/submissions').set('Authorization', AUTH_HEADER).send(body());

    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: SUBMISSION_ID,
      status: 'PENDING',
      createdAt: '2026-09-20T12:00:00.000Z',
    });
  });

  it('passes the submitter\'s id and role, and the validated body with a real Date, to the service', async () => {
    await supertest(app)
      .post('/api/v1/submissions')
      .set('Authorization', AUTH_HEADER)
      .send(body({ venueId: VENUE_ID, artistNames: ['DJ Shadow'], ageRestriction: '21+' }));

    expect(submissionService.createSubmission).toHaveBeenCalledWith(
      { id: 'user-1', role: 'USER' },
      expect.objectContaining({
        eventTitle: 'Underground Warehouse Rave',
        eventStartsAt: expect.any(Date),
        venueId: VENUE_ID,
        artistNames: ['DJ Shadow'],
        ageRestriction: '21+',
      }),
    );
  });

  it('lets a promoter submit and tells the service they are a promoter', async () => {
    actingAs('PROMOTER');
    vi.mocked(submissionService.createSubmission).mockResolvedValue({
      id: SUBMISSION_ID,
      status: 'APPROVED',
      createdAt: new Date('2026-09-20T12:00:00Z'),
    });

    const res = await supertest(app).post('/api/v1/submissions').set('Authorization', AUTH_HEADER).send(body());

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('APPROVED');
    expect(vi.mocked(submissionService.createSubmission).mock.calls[0]?.[0]).toEqual({
      id: 'user-1',
      role: 'PROMOTER',
    });
  });

  it('refuses an admin, per the contract (USER or PROMOTER only)', async () => {
    actingAs('ADMIN');

    const res = await supertest(app).post('/api/v1/submissions').set('Authorization', AUTH_HEADER).send(body());

    expect(res.status).toBe(403);
    expect(submissionService.createSubmission).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const res = await supertest(app).post('/api/v1/submissions').send(body());

    expect(res.status).toBe(401);
  });

  it('400s on an invalid body without reaching the service', async () => {
    const send = (payload: Record<string, unknown>) =>
      supertest(app).post('/api/v1/submissions').set('Authorization', AUTH_HEADER).send(payload);

    const responses = await Promise.all([
      send(body({ eventTitle: '' })),
      send(body({ eventStartsAt: '2020-01-01T22:00:00Z' })),
      send(body({ eventStartsAt: 'next friday' })),
      send({ eventTitle: 'Rave', eventStartsAt: IN_A_MONTH }),
      send(body({ ticketUrl: 'javascript:alert(1)' })),
      send(body({ posterImageUrl: 'data:text/html,<script>1</script>' })),
      send(body({ venueId: 'not-a-uuid' })),
      send(body({ artistNames: 'DJ Shadow' })),
    ]);

    for (const res of responses) expect(res.status).toBe(400);
    expect(submissionService.createSubmission).not.toHaveBeenCalled();
  });

  it('maps a missing venue to a 400 and the pending cap to a 409', async () => {
    vi.mocked(submissionService.createSubmission).mockRejectedValueOnce(new ValidationError('Venue not found'));
    const missingVenue = await supertest(app)
      .post('/api/v1/submissions')
      .set('Authorization', AUTH_HEADER)
      .send(body({ venueId: VENUE_ID }));
    expect(missingVenue.status).toBe(400);

    vi.mocked(submissionService.createSubmission).mockRejectedValueOnce(new ConflictError('Too many pending'));
    const tooMany = await supertest(app).post('/api/v1/submissions').set('Authorization', AUTH_HEADER).send(body());
    expect(tooMany.status).toBe(409);
  });
});

describe('GET /api/v1/users/me/submissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs('USER');
  });

  const SAMPLE = {
    data: [
      {
        id: SUBMISSION_ID,
        eventTitle: 'Underground Warehouse Rave',
        eventStartsAt: new Date('2030-11-16T03:00:00Z'),
        venueId: null,
        venueNameRaw: 'The Lot',
        venueAddressRaw: null,
        artistNames: ['DJ Shadow'],
        description: null,
        posterImageUrl: null,
        ticketUrl: null,
        sourceUrl: null,
        ageRestriction: '21+',
        status: 'REJECTED' as const,
        reviewNotes: 'Duplicate of an existing listing',
        reviewedAt: new Date('2026-09-21T00:00:00Z'),
        mergedEventId: null,
        createdAt: new Date('2026-09-20T12:00:00Z'),
        updatedAt: new Date('2026-09-21T00:00:00Z'),
      },
    ],
    cursor: null,
  };

  it('returns the user\'s own submissions with the reviewer\'s notes', async () => {
    vi.mocked(submissionService.listMySubmissions).mockResolvedValue(SAMPLE);

    const res = await supertest(app).get('/api/v1/users/me/submissions').set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ id: SUBMISSION_ID, status: 'REJECTED', reviewNotes: 'Duplicate of an existing listing' });
    expect(res.body.data[0]).not.toHaveProperty('reviewedBy');
    expect(res.body.cursor).toBeNull();
    expect(submissionService.listMySubmissions).toHaveBeenCalledWith('user-1', {
      status: undefined,
      limit: undefined,
      cursor: undefined,
    });
  });

  it('passes the status filter, limit and cursor through', async () => {
    vi.mocked(submissionService.listMySubmissions).mockResolvedValue({ data: [], cursor: null });

    await supertest(app)
      .get('/api/v1/users/me/submissions?status=PENDING&limit=5&cursor=abc')
      .set('Authorization', AUTH_HEADER);

    expect(submissionService.listMySubmissions).toHaveBeenCalledWith('user-1', {
      status: 'PENDING',
      limit: 5,
      cursor: 'abc',
    });
  });

  it('400s on an unknown status or an out-of-range limit', async () => {
    const status = await supertest(app).get('/api/v1/users/me/submissions?status=DONE').set('Authorization', AUTH_HEADER);
    const limit = await supertest(app).get('/api/v1/users/me/submissions?limit=500').set('Authorization', AUTH_HEADER);

    expect(status.status).toBe(400);
    expect(limit.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await supertest(app).get('/api/v1/users/me/submissions');

    expect(res.status).toBe(401);
  });
});
