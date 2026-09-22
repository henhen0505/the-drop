import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

vi.mock('../../../../src/db/client', () => ({
  db: { select: vi.fn() },
}));

import { db } from '../../../../src/db/client';
import { getSimilarEvents } from '../../../../src/modules/events/similar-events.service';
import { NotFoundError } from '../../../../src/utils/errors';
import { createFakeTx, stepArg, type RecordedOp } from '../../../helpers/fake-db';

const dialect = new PgDialect();
const TARGET_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_ID = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const USER_ID = '11111111-1111-4111-8111-111111111111';

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

function eventRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: OTHER_ID,
    title: 'Fisher at Echostage',
    slug: 'fisher-echostage',
    imageUrl: null,
    startsAt: new Date('2026-11-01T22:00:00Z'),
    endsAt: null,
    timezone: 'America/New_York',
    ageRestriction: '21+',
    artistCount: 1,
    minPriceCents: 4500,
    status: 'PUBLISHED',
    venueId: 'v1',
    venueName: 'Echostage',
    venueSlug: 'echostage',
    venueCity: 'Washington',
    venueState: 'DC',
    overlap: 3,
    ...overrides,
  };
}

// Call order when the ranking query runs: target lookup, target artists, target genres,
// ranking query, then the page's artists, genres and (when signed in) user states.
describe('getSimilarEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('404s when the target event does not exist', async () => {
    useFakeDb([[]]);

    await expect(getSimilarEvents(TARGET_ID, {})).rejects.toBeInstanceOf(NotFoundError);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('does not look up a draft target', async () => {
    useFakeDb([[]]);

    await expect(getSimilarEvents(TARGET_ID, {})).rejects.toBeInstanceOf(NotFoundError);
    const where = render(ops[0], 'where');
    expect(where.sql).toContain('"events"."status" <>');
    expect(where.params).toContain('DRAFT');
  });

  it('returns nothing, without a ranking query, when the target has no artists or genres', async () => {
    useFakeDb([[{ id: TARGET_ID }], [], []]);

    await expect(getSimilarEvents(TARGET_ID, {})).resolves.toEqual([]);
    expect(db.select).toHaveBeenCalledTimes(3);
  });

  it('ranks by shared artists (weight 2) plus shared genres (weight 1) and excludes the target', async () => {
    useFakeDb([
      [{ id: TARGET_ID }],
      [{ artistId: 'a1' }, { artistId: 'a2' }],
      [{ genreId: 'g1' }],
      [eventRow()],
      [],
      [],
    ]);

    await getSimilarEvents(TARGET_ID, {});

    const ranking = ops[3];
    const where = render(ranking, 'where');
    expect(where.sql).toContain('"events"."status" =');
    expect(where.params).toContain('PUBLISHED');
    expect(where.sql).toContain('"events"."starts_at" >= now()');
    expect(where.sql).toContain('"events"."id" <>');
    expect(where.params).toContain(TARGET_ID);
    expect(where.sql).toContain('> 0');

    // The target's own artist and genre IDs feed the correlated overlap counts.
    expect(where.sql).toContain('"event_artists"."artist_id" in (');
    expect(where.sql).toContain('"event_genres"."genre_id" in (');
    expect(where.params).toEqual(expect.arrayContaining(['a1', 'a2', 'g1']));

    const orderBy = render(ranking, 'orderBy');
    expect(orderBy.sql).toContain('desc');
    expect(orderBy.params).toEqual(expect.arrayContaining([2, 1]));
    expect(orderBy.sql).toContain('"events"."starts_at" asc');
  });

  it('drops the genre subquery when the target has no genres', async () => {
    useFakeDb([[{ id: TARGET_ID }], [{ artistId: 'a1' }], [], [], []]);

    await getSimilarEvents(TARGET_ID, {});

    const where = render(ops[3], 'where');
    expect(where.sql).toContain('"event_artists"."artist_id" in (');
    expect(where.sql).not.toContain('event_genres');
  });

  it('drops the artist subquery when the target has no artists', async () => {
    useFakeDb([[{ id: TARGET_ID }], [], [{ genreId: 'g1' }], [], []]);

    await getSimilarEvents(TARGET_ID, {});

    const where = render(ops[3], 'where');
    expect(where.sql).toContain('"event_genres"."genre_id" in (');
    expect(where.sql).not.toContain('event_artists');
  });

  it('defaults the limit to 10 and honors a custom one', async () => {
    useFakeDb([[{ id: TARGET_ID }], [{ artistId: 'a1' }], [], [], []]);
    await getSimilarEvents(TARGET_ID, {});
    expect(stepArg(ops[3]!, 'limit')).toBe(10);

    useFakeDb([[{ id: TARGET_ID }], [{ artistId: 'a1' }], [], [], []]);
    await getSimilarEvents(TARGET_ID, { limit: 3 });
    expect(stepArg(ops[3]!, 'limit')).toBe(3);
  });

  it('returns event summaries with lineup and genres attached, and no user state when anonymous', async () => {
    useFakeDb([
      [{ id: TARGET_ID }],
      [{ artistId: 'a1' }],
      [{ genreId: 'g1' }],
      [eventRow()],
      [
        {
          eventId: OTHER_ID,
          id: 'a1',
          name: 'Fisher',
          slug: 'fisher',
          imageUrl: null,
          isHeadliner: true,
          sortOrder: 0,
        },
      ],
      [{ eventId: OTHER_ID, id: 'g1', name: 'Tech House', slug: 'tech-house' }],
    ]);

    const result = await getSimilarEvents(TARGET_ID, {});

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: OTHER_ID,
      title: 'Fisher at Echostage',
      venue: { id: 'v1', name: 'Echostage', slug: 'echostage', city: 'Washington', state: 'DC' },
      artists: [{ id: 'a1', name: 'Fisher', slug: 'fisher', imageUrl: null, isHeadliner: true }],
      genres: [{ id: 'g1', name: 'Tech House', slug: 'tech-house' }],
      minPriceCents: 4500,
      userState: null,
      recommendationScore: null,
    });
    // The ranking helper column is not part of the public summary.
    expect(result[0]).not.toHaveProperty('overlap');
    expect(db.select).toHaveBeenCalledTimes(6);
  });

  it('includes the signed-in user\'s own state for each event', async () => {
    useFakeDb([
      [{ id: TARGET_ID }],
      [{ artistId: 'a1' }],
      [],
      [eventRow()],
      [],
      [],
      [{ eventId: OTHER_ID, state: 'INTERESTED' }],
    ]);

    const result = await getSimilarEvents(TARGET_ID, { userId: USER_ID });

    expect(result[0]?.userState).toBe('INTERESTED');
  });
});
