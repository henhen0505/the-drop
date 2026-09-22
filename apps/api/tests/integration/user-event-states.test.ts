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
import * as stateService from '../../src/modules/events/user-event-state.service';
import { NotFoundError } from '../../src/utils/errors';

const app = createApp();
const AUTH_HEADER = 'Bearer valid-token';
const EVENT_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('PUT /api/v1/events/:id/state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets the state and returns it', async () => {
    const updatedAt = new Date('2026-09-20T12:00:00Z');
    vi.mocked(stateService.setEventState).mockResolvedValue({
      eventId: EVENT_ID,
      state: 'GOING',
      updatedAt,
    });

    const res = await supertest(app)
      .put(`/api/v1/events/${EVENT_ID}/state`)
      .set('Authorization', AUTH_HEADER)
      .send({ state: 'GOING' });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      eventId: EVENT_ID,
      state: 'GOING',
      updatedAt: updatedAt.toISOString(),
    });
    expect(stateService.setEventState).toHaveBeenCalledWith('user-1', EVENT_ID, 'GOING');
  });

  it('requires authentication', async () => {
    const res = await supertest(app).put(`/api/v1/events/${EVENT_ID}/state`).send({ state: 'GOING' });

    expect(res.status).toBe(401);
    expect(stateService.setEventState).not.toHaveBeenCalled();
  });

  it('400s on an unknown state, a missing body, or a non-UUID id', async () => {
    const unknown = await supertest(app)
      .put(`/api/v1/events/${EVENT_ID}/state`)
      .set('Authorization', AUTH_HEADER)
      .send({ state: 'MAYBE' });
    const missing = await supertest(app)
      .put(`/api/v1/events/${EVENT_ID}/state`)
      .set('Authorization', AUTH_HEADER)
      .send({});
    const badId = await supertest(app)
      .put('/api/v1/events/some-slug/state')
      .set('Authorization', AUTH_HEADER)
      .send({ state: 'GOING' });

    expect(unknown.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(badId.status).toBe(400);
    expect(stateService.setEventState).not.toHaveBeenCalled();
  });

  it('404s when the event does not exist', async () => {
    vi.mocked(stateService.setEventState).mockRejectedValue(new NotFoundError('Event not found'));

    const res = await supertest(app)
      .put(`/api/v1/events/${EVENT_ID}/state`)
      .set('Authorization', AUTH_HEADER)
      .send({ state: 'INTERESTED' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/events/:id/state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the state with a 204', async () => {
    vi.mocked(stateService.removeEventState).mockResolvedValue();

    const res = await supertest(app)
      .delete(`/api/v1/events/${EVENT_ID}/state`)
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(stateService.removeEventState).toHaveBeenCalledWith('user-1', EVENT_ID);
  });

  it('requires authentication', async () => {
    const res = await supertest(app).delete(`/api/v1/events/${EVENT_ID}/state`);

    expect(res.status).toBe(401);
  });

  it('400s on a non-UUID id', async () => {
    const res = await supertest(app)
      .delete('/api/v1/events/some-slug/state')
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(400);
  });

  it('404s when there is no state to remove', async () => {
    vi.mocked(stateService.removeEventState).mockRejectedValue(
      new NotFoundError('No state set for this event'),
    );

    const res = await supertest(app)
      .delete(`/api/v1/events/${EVENT_ID}/state`)
      .set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/users/me/raves', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const SAMPLE = {
    data: [
      {
        event: {
          id: EVENT_ID,
          title: 'Knock2 at Brooklyn Mirage',
          slug: 'knock2-mirage',
          startsAt: new Date('2026-10-17T22:00:00Z'),
          timezone: 'America/New_York',
          imageUrl: null,
          venue: { name: 'Brooklyn Mirage', city: 'Brooklyn' },
          artists: [],
        },
        state: 'HAVE_TICKET' as const,
        updatedAt: new Date('2026-09-20T12:00:00Z'),
      },
    ],
    cursor: null,
  };

  it('returns the dashboard, defaulting to upcoming events with no state filter', async () => {
    vi.mocked(stateService.listMyRaves).mockResolvedValue(SAMPLE);

    const res = await supertest(app).get('/api/v1/users/me/raves').set('Authorization', AUTH_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].state).toBe('HAVE_TICKET');
    expect(res.body.data[0].event.venue.city).toBe('Brooklyn');
    expect(res.body.cursor).toBeNull();
    expect(stateService.listMyRaves).toHaveBeenCalledWith('user-1', {
      states: undefined,
      upcoming: true,
      limit: undefined,
      cursor: undefined,
    });
  });

  it('parses the comma-separated state filter, upcoming flag, limit and cursor', async () => {
    vi.mocked(stateService.listMyRaves).mockResolvedValue({ data: [], cursor: null });

    await supertest(app)
      .get('/api/v1/users/me/raves?state=GOING,HAVE_TICKET&upcoming=false&limit=5&cursor=abc')
      .set('Authorization', AUTH_HEADER);

    expect(stateService.listMyRaves).toHaveBeenCalledWith('user-1', {
      states: ['GOING', 'HAVE_TICKET'],
      upcoming: false,
      limit: 5,
      cursor: 'abc',
    });
  });

  it('400s on an invalid state, upcoming value, or limit', async () => {
    const state = await supertest(app)
      .get('/api/v1/users/me/raves?state=GOING,MAYBE')
      .set('Authorization', AUTH_HEADER);
    const upcoming = await supertest(app)
      .get('/api/v1/users/me/raves?upcoming=soon')
      .set('Authorization', AUTH_HEADER);
    const limit = await supertest(app)
      .get('/api/v1/users/me/raves?limit=500')
      .set('Authorization', AUTH_HEADER);

    expect(state.status).toBe(400);
    expect(upcoming.status).toBe(400);
    expect(limit.status).toBe(400);
    expect(stateService.listMyRaves).not.toHaveBeenCalled();
  });

  it('requires authentication', async () => {
    const res = await supertest(app).get('/api/v1/users/me/raves');

    expect(res.status).toBe(401);
  });
});
