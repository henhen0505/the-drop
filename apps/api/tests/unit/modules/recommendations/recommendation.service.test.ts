import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

vi.mock('../../../../src/db/client', () => ({
  db: { select: vi.fn() },
}));

import { db } from '../../../../src/db/client';
import { MAX_CANDIDATE_EVENTS } from '../../../../src/recommendations/config';
import { getRecommendations } from '../../../../src/modules/recommendations/recommendation.service';
import { NotFoundError, ValidationError } from '../../../../src/utils/errors';
import { decodeCursor, encodeCursor } from '../../../../src/utils/pagination';
import { createFakeTx, stepArg, type RecordedOp } from '../../../helpers/fake-db';

const dialect = new PgDialect();
const USER_ID = '11111111-1111-4111-8111-111111111111';
const E1 = '00000000-0000-4000-8000-000000000001';
const E2 = '00000000-0000-4000-8000-000000000002';
const E3 = '00000000-0000-4000-8000-000000000003';

const NYC = { latitude: 40.7128, longitude: -74.006 };
const LA = { latitude: 34.0522, longitude: -118.2437 };

let ops: RecordedOp[] = [];

function useFakeDb(results: unknown[]): void {
  const fake = createFakeTx(results);
  ops = fake.ops;
  const target = fake.tx as unknown as Record<string, (...args: unknown[]) => unknown>;
  vi.mocked(db.select).mockImplementation(((...args: unknown[]) => target.select?.(...args)) as never);
}

function render(op: RecordedOp | undefined, step: string): { sql: string; params: unknown[] } {
  const args = op?.steps.find((s) => s.name === step)?.args ?? [];
  const parts = args.map((arg) => dialect.sqlToQuery(arg as SQL));
  return { sql: parts.map((p) => p.sql).join(', '), params: parts.flatMap((p) => p.params) };
}

function userRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    latitude: null,
    longitude: null,
    travelRadiusKm: 80,
    priceMinCents: null,
    priceMaxCents: null,
    ...overrides,
  };
}

function candidate(id: string, day: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: `Event ${id.slice(-1)}`,
    slug: `event-${id.slice(-1)}`,
    imageUrl: null,
    startsAt: new Date(Date.UTC(2026, 9, day, 22)),
    endsAt: null,
    timezone: 'America/New_York',
    ageRestriction: null,
    artistCount: 0,
    minPriceCents: null,
    status: 'PUBLISHED',
    venueId: null,
    venueName: null,
    venueSlug: null,
    venueCity: null,
    venueState: null,
    venueLatitude: null,
    venueLongitude: null,
    ...overrides,
  };
}

function artistRow(eventId: string, id: string, name: string): Record<string, unknown> {
  return { eventId, id, name, slug: name.toLowerCase(), imageUrl: null, isHeadliner: true, sortOrder: 0 };
}

// Call order: user, followed artists, preferred genres, venue visits, candidates, then the
// candidates' artists and genres, then (only when the page is non-empty) the page's user states.
describe('getRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('404s when the user does not exist', async () => {
    useFakeDb([[], [], [], [], []]);

    await expect(getRecommendations(USER_ID, {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns an empty page, with no lineup queries, when there are no upcoming events', async () => {
    useFakeDb([[userRow()], [], [], [], []]);

    await expect(getRecommendations(USER_ID, {})).resolves.toEqual({ data: [], cursor: null });
    expect(db.select).toHaveBeenCalledTimes(5);
  });

  it('gives a cold-start user every event at exactly 0.2, soonest first, with the plain fallback', async () => {
    useFakeDb([
      [userRow()],
      [],
      [],
      [],
      // Fed out of date order on purpose: the service, not the query, owns the final ordering.
      [candidate(E3, 30), candidate(E1, 10), candidate(E2, 20)],
      [],
      [],
      [],
    ]);

    const result = await getRecommendations(USER_ID, {});

    expect(result.data.map((item) => item.event.id)).toEqual([E1, E2, E3]);
    for (const item of result.data) {
      expect(item.score).toBe(0.2);
      expect(item.explanation).toBe('Upcoming event');
      expect(item.factors).toEqual({
        artistAffinity: 0,
        genreAffinity: 0,
        distanceScore: 0.5,
        priceFit: 1,
        venueAffinity: 0,
      });
      expect(item.event.recommendationScore).toBe(0.2);
    }
    expect(result.cursor).toBeNull();
  });

  it('ranks a followed-artist, preferred-genre, nearby event first and explains it', async () => {
    useFakeDb([
      [userRow(NYC)],
      [{ artistId: 'a1' }],
      [{ genreId: 'g1' }],
      [],
      [
        candidate(E2, 10, { venueId: 'v2', venueName: 'Hollywood Palladium', ...{ venueLatitude: LA.latitude, venueLongitude: LA.longitude } }),
        candidate(E1, 20, {
          venueId: 'v1',
          venueName: 'Brooklyn Mirage',
          venueSlug: 'brooklyn-mirage',
          venueCity: 'Brooklyn',
          venueState: 'NY',
          venueLatitude: NYC.latitude,
          venueLongitude: NYC.longitude,
        }),
      ],
      [artistRow(E1, 'a1', 'Skrillex')],
      [{ eventId: E1, id: 'g1', name: 'Dubstep', slug: 'dubstep' }],
      [{ eventId: E1, state: 'GOING' }],
    ]);

    const result = await getRecommendations(USER_ID, {});

    // E1: 0.35*1 + 0.25*1 + 0.20*1 (0 km away) + 0.10*1 (no price constraint) + 0.10*0 = 0.9
    // E2: 0 + 0 + 0.20*0 (LA is far beyond an 80 km radius) + 0.10*1 + 0 = 0.1, but still recommended.
    expect(result.data.map((item) => item.event.id)).toEqual([E1, E2]);

    const [first, second] = result.data;
    expect(first?.score).toBe(0.9);
    expect(first?.factors).toEqual({
      artistAffinity: 1,
      genreAffinity: 1,
      distanceScore: 1,
      priceFit: 1,
      venueAffinity: 0,
    });
    expect(first?.explanation).toBe('You follow Skrillex, and this matches your Dubstep preferences');
    expect(first?.event.userState).toBe('GOING');
    expect(first?.event.recommendationScore).toBe(0.9);
    expect(first?.event.venue?.name).toBe('Brooklyn Mirage');
    expect(first?.event.artists.map((artist) => artist.name)).toEqual(['Skrillex']);

    expect(second?.score).toBe(0.1);
    expect(second?.factors.distanceScore).toBe(0);
    expect(second?.explanation).toBe('Upcoming event');
    expect(second?.event.userState).toBeNull();
  });

  it('counts past ATTENDED/GOING/HAVE_TICKET events at a venue toward venue affinity', async () => {
    useFakeDb([
      [userRow()],
      [],
      [],
      [{ venueId: 'v1', visits: 2 }],
      [candidate(E1, 10, { venueId: 'v1', venueName: 'Brooklyn Mirage' })],
      [],
      [],
      [],
    ]);

    const result = await getRecommendations(USER_ID, {});

    expect(result.data[0]?.factors.venueAffinity).toBe(0.75);
    expect(result.data[0]?.explanation).toBe("You've been to Brooklyn Mirage before");
    // 0 + 0 + 0.20*0.5 + 0.10*1 + 0.10*0.75
    expect(result.data[0]?.score).toBe(0.275);

    const visits = render(ops[3], 'where');
    expect(visits.params).toEqual(expect.arrayContaining([USER_ID, 'ATTENDED', 'GOING', 'HAVE_TICKET']));
    expect(visits.sql).toContain('"events"."venue_id" is not null');
  });

  it('scores price fit against the user budget and mentions it only when it was evaluated', async () => {
    useFakeDb([
      [userRow({ priceMaxCents: 5000 })],
      [],
      [],
      [],
      [candidate(E1, 10, { minPriceCents: 3000 }), candidate(E2, 11, { minPriceCents: 9000 }), candidate(E3, 12)],
      [],
      [],
      [],
    ]);

    const result = await getRecommendations(USER_ID, {});
    const byId = new Map(result.data.map((item) => [item.event.id, item]));

    expect(byId.get(E1)?.factors.priceFit).toBe(1);
    expect(byId.get(E1)?.explanation).toBe('This is within your budget');
    expect(byId.get(E2)?.factors.priceFit).toBe(0);
    expect(byId.get(E2)?.explanation).toBe('Upcoming event');
    // No known price: not penalized, but nothing to claim either.
    expect(byId.get(E3)?.factors.priceFit).toBe(1);
    expect(byId.get(E3)?.explanation).toBe('Upcoming event');
    expect(result.data[2]?.event.id).toBe(E2);
  });

  it('falls back to the default travel radius when the user has none stored', async () => {
    useFakeDb([
      [userRow({ ...NYC, travelRadiusKm: null })],
      [],
      [],
      [],
      // ~40 km from NYC: half of the 80 km default radius.
      [candidate(E1, 10, { venueId: 'v1', venueLatitude: 41.0722, venueLongitude: -74.006 })],
      [],
      [],
      [],
    ]);

    const result = await getRecommendations(USER_ID, {});

    expect(result.data[0]?.factors.distanceScore).toBeGreaterThan(0.4);
    expect(result.data[0]?.factors.distanceScore).toBeLessThan(0.6);
  });

  it('fetches a capped pool of upcoming published events with no geographic filtering', async () => {
    useFakeDb([[userRow(NYC)], [], [], [], []]);

    await getRecommendations(USER_ID, {});

    const candidates = ops[4];
    const where = render(candidates, 'where');
    expect(where.sql).toContain('"events"."status" =');
    expect(where.params).toContain('PUBLISHED');
    expect(where.sql).toContain('"events"."starts_at" >= now()');
    expect(where.sql).not.toMatch(/latitude|longitude/);
    expect(stepArg(candidates!, 'limit')).toBe(MAX_CANDIDATE_EVENTS);
    expect(MAX_CANDIDATE_EVENTS).toBe(500);
  });

  describe('pagination', () => {
    // E1 follows an artist (0.55); E2 and E3 tie at 0.2, so E2 (sooner) precedes E3.
    function paginationDb(): void {
      useFakeDb([
        [userRow()],
        [{ artistId: 'a1' }],
        [],
        [],
        [candidate(E3, 30), candidate(E2, 20), candidate(E1, 10)],
        [artistRow(E1, 'a1', 'Skrillex')],
        [],
        [],
      ]);
    }

    it('returns a page, then a cursor that resumes strictly after the last item', async () => {
      paginationDb();
      const first = await getRecommendations(USER_ID, { limit: 2 });

      expect(first.data.map((item) => item.event.id)).toEqual([E1, E2]);
      expect(first.data[0]?.score).toBe(0.55);
      expect(decodeCursor(first.cursor!)).toEqual({
        score: 0.2,
        startsAt: '2026-10-20T22:00:00.000Z',
        id: E2,
      });

      paginationDb();
      const second = await getRecommendations(USER_ID, { limit: 2, cursor: first.cursor! });

      expect(second.data.map((item) => item.event.id)).toEqual([E3]);
      expect(second.cursor).toBeNull();
    });

    it('keeps the order total for tied scores: soonest first, then id', async () => {
      useFakeDb([
        [userRow()],
        [],
        [],
        [],
        [candidate(E3, 20), candidate(E2, 20), candidate(E1, 20)],
        [],
        [],
        [],
      ]);

      const result = await getRecommendations(USER_ID, {});

      expect(result.data.map((item) => item.event.id)).toEqual([E1, E2, E3]);
    });

    it('still resumes correctly when the event the cursor points at has since dropped out', async () => {
      useFakeDb([
        [userRow()],
        [],
        [],
        [],
        [candidate(E3, 30), candidate(E2, 20)],
        [],
        [],
        [],
      ]);

      const cursor = encodeCursor({ score: 0.2, startsAt: '2026-10-15T22:00:00.000Z', id: E1 });
      const result = await getRecommendations(USER_ID, { cursor });

      expect(result.data.map((item) => item.event.id)).toEqual([E2, E3]);
    });

    it('rejects a malformed cursor before touching the database', async () => {
      await expect(getRecommendations(USER_ID, { cursor: 'nope' })).rejects.toBeInstanceOf(ValidationError);
      await expect(
        getRecommendations(USER_ID, {
          cursor: encodeCursor({ score: 'high', startsAt: '2026-10-15T22:00:00.000Z', id: E1 }),
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        getRecommendations(USER_ID, { cursor: encodeCursor({ score: 0.5, startsAt: 'x', id: E1 }) }),
      ).rejects.toBeInstanceOf(ValidationError);
      await expect(
        getRecommendations(USER_ID, {
          cursor: encodeCursor({ score: 0.5, startsAt: '2026-10-15T22:00:00.000Z', id: 'not-a-uuid' }),
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(db.select).not.toHaveBeenCalled();
    });
  });
});
