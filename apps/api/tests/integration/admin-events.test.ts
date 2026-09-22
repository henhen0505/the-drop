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
import * as adminEventService from '../../src/modules/admin/admin-event.service';
import * as eventMergeService from '../../src/modules/admin/event-merge.service';
import { NotFoundError, ValidationError } from '../../src/utils/errors';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ID = '44444444-4444-4444-8444-444444444444';
const VENUE_ID = '22222222-2222-4222-8222-222222222222';

function actingAs(role: 'USER' | 'PROMOTER' | 'ADMIN'): void {
  vi.mocked(authService.verifyAccessToken).mockReturnValue({ sub: 'admin-1', email: 'a@test.com', role });
}

const DETAIL = {
  id: EVENT_ID,
  title: 'Knock2 at Brooklyn Mirage',
  slug: 'knock2-mirage',
  description: null,
  imageUrl: null,
  startsAt: new Date('2026-10-17T22:00:00Z'),
  endsAt: null,
  timezone: 'America/New_York',
  status: 'PUBLISHED' as const,
  venue: null,
  artists: [],
  genres: [],
  ageRestriction: null,
  doorTime: null,
  reentryPolicy: null,
  bagPolicy: null,
  prohibitedItems: null,
  dressCode: null,
  primarySource: 'ADMIN' as const,
  confidence: 'ADMIN_VERIFIED' as const,
  fieldProvenance: { title: 'ADMIN' },
  lastVerifiedAt: null,
  createdAt: new Date('2026-09-20T12:00:00Z'),
  updatedAt: new Date('2026-09-20T12:00:00Z'),
  sources: [],
};

describe('GET /api/v1/admin/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs('ADMIN');
  });

  it('lists events and passes the filters through', async () => {
    vi.mocked(adminEventService.listAdminEvents).mockResolvedValue({ data: [], cursor: null });

    const res = await supertest(app)
      .get('/api/v1/admin/events?q=knock2&status=DRAFT&limit=5&cursor=abc')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [], cursor: null });
    expect(adminEventService.listAdminEvents).toHaveBeenCalledWith({
      q: 'knock2',
      status: 'DRAFT',
      limit: 5,
      cursor: 'abc',
    });
  });

  it('400s on an unknown status', async () => {
    const res = await supertest(app).get('/api/v1/admin/events?status=GONE').set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(400);
  });

  it('401s without a token and 403s for a non-admin', async () => {
    expect((await supertest(app).get('/api/v1/admin/events')).status).toBe(401);

    actingAs('USER');
    expect((await supertest(app).get('/api/v1/admin/events').set('Authorization', AUTH_HEADER)).status).toBe(403);
    expect(adminEventService.listAdminEvents).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs('ADMIN');
    vi.mocked(adminEventService.createAdminEvent).mockResolvedValue(DETAIL);
  });

  const send = (payload: Record<string, unknown>) =>
    supertest(app).post('/api/v1/admin/events').set('Authorization', AUTH_HEADER).send(payload);

  it('creates an event with a 201, passing the acting admin and the validated input', async () => {
    const res = await send({
      title: 'Knock2 at Brooklyn Mirage',
      startsAt: '2026-10-17T22:00:00-04:00',
      venueId: VENUE_ID,
      artistIds: [OTHER_ID],
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: EVENT_ID, primarySource: 'ADMIN' });
    expect(adminEventService.createAdminEvent).toHaveBeenCalledWith(
      'admin-1',
      expect.objectContaining({
        title: 'Knock2 at Brooklyn Mirage',
        startsAt: new Date('2026-10-18T02:00:00Z'),
        venueId: VENUE_ID,
        artistIds: [OTHER_ID],
        genreIds: [],
        status: 'PUBLISHED',
      }),
    );
  });

  it('400s on an invalid body without reaching the service', async () => {
    const responses = await Promise.all([
      send({ startsAt: '2026-10-17T22:00:00Z' }),
      send({ title: 'x' }),
      send({ title: 'x', startsAt: 'soon' }),
      send({ title: 'x', startsAt: '2026-10-17T22:00:00Z', venueId: 'nope' }),
      send({ title: 'x', startsAt: '2026-10-17T22:00:00Z', imageUrl: 'javascript:alert(1)' }),
      send({ title: 'x', startsAt: '2026-10-17T22:00:00Z', status: 'CANCELLED' }),
      send({ title: 'x', startsAt: '2026-10-17T22:00:00Z', endsAt: '2026-10-17T21:00:00Z' }),
    ]);

    for (const res of responses) expect(res.status).toBe(400);
    expect(adminEventService.createAdminEvent).not.toHaveBeenCalled();
  });

  it('surfaces a reference the service could not find as a 400', async () => {
    vi.mocked(adminEventService.createAdminEvent).mockRejectedValueOnce(new ValidationError('Unknown artist IDs'));

    const res = await send({ title: 'x', startsAt: '2026-10-17T22:00:00Z', artistIds: [OTHER_ID] });

    expect(res.status).toBe(400);
  });

  it('403s a non-admin', async () => {
    actingAs('USER');

    expect((await send({ title: 'x', startsAt: '2026-10-17T22:00:00Z' })).status).toBe(403);
    expect(adminEventService.createAdminEvent).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/admin/events/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs('ADMIN');
    vi.mocked(adminEventService.updateAdminEvent).mockResolvedValue(DETAIL);
  });

  const patch = (payload: Record<string, unknown>, id = EVENT_ID) =>
    supertest(app).patch(`/api/v1/admin/events/${id}`).set('Authorization', AUTH_HEADER).send(payload);

  it('updates the event and returns the new detail', async () => {
    const res = await patch({ title: 'New title', description: null, status: 'CANCELLED' });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(EVENT_ID);
    expect(adminEventService.updateAdminEvent).toHaveBeenCalledWith('admin-1', EVENT_ID, {
      title: 'New title',
      description: null,
      status: 'CANCELLED',
    });
  });

  it('400s on an empty body, a bad status, a null title, or a non-UUID id', async () => {
    const responses = await Promise.all([
      patch({}),
      patch({ status: 'DELETED' }),
      patch({ title: null }),
      patch({ title: 'x' }, 'not-a-uuid'),
    ]);

    for (const res of responses) expect(res.status).toBe(400);
    expect(adminEventService.updateAdminEvent).not.toHaveBeenCalled();
  });

  it('404s for an unknown event', async () => {
    vi.mocked(adminEventService.updateAdminEvent).mockRejectedValueOnce(new NotFoundError('Event not found'));

    expect((await patch({ title: 'x' })).status).toBe(404);
  });

  it('403s a non-admin', async () => {
    actingAs('USER');

    expect((await patch({ title: 'x' })).status).toBe(403);
  });
});

describe('DELETE /api/v1/admin/events/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs('ADMIN');
  });

  const remove = (id = EVENT_ID) => supertest(app).delete(`/api/v1/admin/events/${id}`).set('Authorization', AUTH_HEADER);

  it('returns 204 with no body', async () => {
    vi.mocked(adminEventService.deleteAdminEvent).mockResolvedValue();

    const res = await remove();

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(adminEventService.deleteAdminEvent).toHaveBeenCalledWith('admin-1', EVENT_ID);
  });

  it('404s for an unknown event and 400s for a non-UUID id', async () => {
    vi.mocked(adminEventService.deleteAdminEvent).mockRejectedValueOnce(new NotFoundError('Event not found'));

    expect((await remove()).status).toBe(404);
    expect((await remove('not-a-uuid')).status).toBe(400);
  });

  it('401s without a token and 403s for a non-admin', async () => {
    expect((await supertest(app).delete(`/api/v1/admin/events/${EVENT_ID}`)).status).toBe(401);

    actingAs('PROMOTER');
    expect((await remove()).status).toBe(403);
    expect(adminEventService.deleteAdminEvent).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/events/merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actingAs('ADMIN');
    vi.mocked(eventMergeService.mergeEvents).mockResolvedValue(DETAIL);
  });

  const merge = (payload: Record<string, unknown>) =>
    supertest(app).post('/api/v1/admin/events/merge').set('Authorization', AUTH_HEADER).send(payload);

  it('merges two events and returns the kept event, without being mistaken for event creation', async () => {
    const res = await merge({
      keepEventId: EVENT_ID,
      mergeEventId: OTHER_ID,
      fieldOverrides: { description: 'merge' },
    });

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(EVENT_ID);
    expect(eventMergeService.mergeEvents).toHaveBeenCalledWith('admin-1', {
      keepEventId: EVENT_ID,
      mergeEventId: OTHER_ID,
      fieldOverrides: { description: 'merge' },
    });
    expect(adminEventService.createAdminEvent).not.toHaveBeenCalled();
  });

  it('400s when merging an event into itself, on a bad id, or on an unknown override', async () => {
    const responses = await Promise.all([
      merge({ keepEventId: EVENT_ID, mergeEventId: EVENT_ID }),
      merge({ keepEventId: 'nope', mergeEventId: OTHER_ID }),
      merge({ keepEventId: EVENT_ID }),
      merge({ keepEventId: EVENT_ID, mergeEventId: OTHER_ID, fieldOverrides: { slug: 'merge' } }),
      merge({ keepEventId: EVENT_ID, mergeEventId: OTHER_ID, fieldOverrides: { title: 'both' } }),
    ]);

    for (const res of responses) expect(res.status).toBe(400);
    expect(eventMergeService.mergeEvents).not.toHaveBeenCalled();
  });

  it('404s when an event does not exist', async () => {
    vi.mocked(eventMergeService.mergeEvents).mockRejectedValueOnce(new NotFoundError('Event to merge was not found'));

    expect((await merge({ keepEventId: EVENT_ID, mergeEventId: OTHER_ID })).status).toBe(404);
  });

  it('401s without a token and 403s for a non-admin', async () => {
    const anonymous = await supertest(app)
      .post('/api/v1/admin/events/merge')
      .send({ keepEventId: EVENT_ID, mergeEventId: OTHER_ID });
    expect(anonymous.status).toBe(401);

    actingAs('USER');
    expect((await merge({ keepEventId: EVENT_ID, mergeEventId: OTHER_ID })).status).toBe(403);
    expect(eventMergeService.mergeEvents).not.toHaveBeenCalled();
  });
});
