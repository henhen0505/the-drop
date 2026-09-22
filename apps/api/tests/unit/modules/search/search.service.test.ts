import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

vi.mock('../../../../src/db/client', () => ({
  db: {
    select: vi.fn(),
  },
}));

import { autocomplete, search } from '../../../../src/modules/search/search.service';
import { db } from '../../../../src/db/client';
import { events } from '../../../../src/db/schema/events';
import { venues } from '../../../../src/db/schema/venues';
import { artists } from '../../../../src/db/schema/artists';
import { fakeChain, type RecordedStep } from '../../../helpers/fake-db';

const dialect = new PgDialect();

let calls: RecordedStep[][] = [];

/**
 * search() and autocomplete() fire their per-entity-type db.select() calls
 * inside Promise.all. Promise.all's array argument is evaluated left to
 * right, synchronously, up to each element's first `await` -- so the
 * db.select() calls land on this queue in exactly the order each service
 * function is written in its Promise.all array: search() is
 * event, artist, venue; autocomplete() is artist, event, venue, followed
 * (sequentially, after Promise.all resolves) by the artist genre-name
 * batch fetch.
 */
function queueSelects(results: unknown[]): void {
  calls = [];
  const queue = [...results];
  vi.mocked(db.select).mockImplementation((() => {
    const steps: RecordedStep[] = [{ name: 'select', args: [] }];
    calls.push(steps);
    return fakeChain(() => (queue.length > 0 ? queue.shift() : []), steps);
  }) as never);
}

function fromTable(call: number): unknown {
  return calls[call]?.find((s) => s.name === 'from')?.args[0];
}

function renderStep(call: number, step: string): { sql: string; params: unknown[] } {
  const args = calls[call]?.find((s) => s.name === step)?.args ?? [];
  const parts = args.map((arg) => dialect.sqlToQuery(arg as SQL));
  return { sql: parts.map((p) => p.sql).join(', '), params: parts.flatMap((p) => p.params) };
}

describe('search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns per-type results ranked by rank', async () => {
    queueSelects([
      [
        {
          id: 'e1',
          title: 'Knock2 at Brooklyn Mirage',
          slug: 'knock2-mirage',
          startsAt: new Date('2026-10-17T22:00:00Z'),
          venueName: 'Brooklyn Mirage',
          venueCity: 'Brooklyn',
          rank: 0.95,
        },
      ],
      [{ id: 'a1', name: 'Knock2', slug: 'knock2', imageUrl: null, rank: 0.88 }],
      [{ id: 'v1', name: 'Knockdown Center', slug: 'knockdown-center', city: 'Queens', rank: 0.72 }],
    ]);

    const result = await search({ q: 'knock2', types: ['event', 'artist', 'venue'], limit: 20 });

    expect(result.events).toEqual([
      {
        id: 'e1',
        title: 'Knock2 at Brooklyn Mirage',
        slug: 'knock2-mirage',
        startsAt: new Date('2026-10-17T22:00:00Z'),
        venue: { name: 'Brooklyn Mirage', city: 'Brooklyn' },
        rank: 0.95,
      },
    ]);
    expect(result.artists).toEqual([
      { id: 'a1', name: 'Knock2', slug: 'knock2', imageUrl: null, rank: 0.88 },
    ]);
    expect(result.venues).toEqual([
      { id: 'v1', name: 'Knockdown Center', slug: 'knockdown-center', city: 'Queens', rank: 0.72 },
    ]);
  });

  it('does not query a type that was not requested', async () => {
    queueSelects([[{ id: 'a1', name: 'Knock2', slug: 'knock2', imageUrl: null, rank: 0.88 }]]);

    const result = await search({ q: 'knock2', types: ['artist'], limit: 20 });

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(fromTable(0)).toBe(artists);
    expect(result.events).toEqual([]);
    expect(result.venues).toEqual([]);
  });

  it('returns empty arrays for a query that matches nothing', async () => {
    queueSelects([[], [], []]);

    const result = await search({ q: 'zzz', types: ['event', 'artist', 'venue'], limit: 20 });

    expect(result).toEqual({ events: [], artists: [], venues: [] });
  });

  it('gives an event with no venue a null venue field', async () => {
    queueSelects([
      [
        {
          id: 'e1',
          title: 'Warehouse Rave',
          slug: 'warehouse-rave',
          startsAt: new Date('2026-10-17T22:00:00Z'),
          venueName: null,
          venueCity: null,
          rank: 0.6,
        },
      ],
    ]);

    const result = await search({ q: 'warehouse', types: ['event'], limit: 20 });

    expect(result.events[0]?.venue).toBeNull();
  });

  it('filters events to PUBLISHED status only, with no date filtering', async () => {
    queueSelects([[]]);

    await search({ q: 'rave', types: ['event'], limit: 20 });

    expect(fromTable(0)).toBe(events);
    const where = renderStep(0, 'where');
    expect(where.sql).toContain('"events"."status" =');
    expect(where.params).toContain('PUBLISHED');
    expect(where.sql).not.toContain('starts_at');
  });

  it('uses websearch_to_tsquery and ts_rank against the venue search_vector', async () => {
    queueSelects([[]]);

    await search({ q: 'mirage', types: ['venue'], limit: 20 });

    expect(fromTable(0)).toBe(venues);
    const where = renderStep(0, 'where');
    expect(where.sql).toContain('"venues"."search_vector" @@ websearch_to_tsquery(');
    expect(where.params).toContain('mirage');
  });
});

describe('autocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges all three tables into one array sorted by similarity descending, truncated to limit', async () => {
    queueSelects([
      [{ id: 'a1', name: 'Knock2', slug: 'knock2', similarity: 0.5 }],
      [
        {
          id: 'e1',
          name: 'Knock2 at Brooklyn Mirage',
          slug: 'knock2-mirage',
          startsAt: new Date('2026-10-17T22:00:00Z'),
          timezone: 'America/New_York',
          venueCity: 'Brooklyn',
          venueState: 'NY',
          similarity: 0.85,
        },
      ],
      [
        {
          id: 'v1',
          name: 'Knockdown Center',
          slug: 'knockdown-center',
          city: 'Queens',
          state: 'NY',
          similarity: 0.72,
        },
      ],
      [], // artist genre-name batch fetch: Knock2 has no genres in this fixture
    ]);

    const result = await autocomplete({ q: 'kno', limit: 2 });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.type)).toEqual(['event', 'venue']);
    expect(result.map((item) => item.similarity)).toEqual([0.85, 0.72]);
  });

  it('formats an artist subtitle by joining genre names with " / "', async () => {
    queueSelects([
      [{ id: 'a1', name: 'Knock2', slug: 'knock2', similarity: 0.91 }],
      [],
      [],
      [
        { artistId: 'a1', name: 'Bass' },
        { artistId: 'a1', name: 'Trap' },
      ],
    ]);

    const result = await autocomplete({ q: 'kno', limit: 10 });

    expect(result).toEqual([
      {
        type: 'artist',
        id: 'a1',
        name: 'Knock2',
        slug: 'knock2',
        subtitle: 'Bass / Trap',
        similarity: 0.91,
      },
    ]);
  });

  it('formats an event subtitle as "<Mon> <Day>, <Year> – <City>, <State>" using the event timezone', async () => {
    queueSelects([
      [],
      [
        {
          id: 'e1',
          name: 'Knock2 at Brooklyn Mirage',
          slug: 'knock2-mirage',
          startsAt: new Date('2026-10-17T22:00:00Z'),
          timezone: 'America/New_York',
          venueCity: 'Brooklyn',
          venueState: 'NY',
          similarity: 0.85,
        },
      ],
      [],
    ]);

    const result = await autocomplete({ q: 'kno', limit: 10 });

    expect(result[0]?.subtitle).toBe('Oct 17, 2026 – Brooklyn, NY');
  });

  it('omits the state from an event subtitle when the venue has none', async () => {
    queueSelects([
      [],
      [
        {
          id: 'e1',
          name: 'Field Party',
          slug: 'field-party',
          startsAt: new Date('2026-10-17T22:00:00Z'),
          timezone: 'America/New_York',
          venueCity: 'Somewhere',
          venueState: null,
          similarity: 0.6,
        },
      ],
      [],
    ]);

    const result = await autocomplete({ q: 'field', limit: 10 });

    expect(result[0]?.subtitle).toBe('Oct 17, 2026 – Somewhere');
  });

  it('drops the venue segment entirely for an event with no venue at all', async () => {
    queueSelects([
      [],
      [
        {
          id: 'e1',
          name: 'Unlinked Submission',
          slug: 'unlinked-submission',
          startsAt: new Date('2026-10-17T22:00:00Z'),
          timezone: 'America/New_York',
          venueCity: null,
          venueState: null,
          similarity: 0.6,
        },
      ],
      [],
    ]);

    const result = await autocomplete({ q: 'unlinked', limit: 10 });

    expect(result[0]?.subtitle).toBe('Oct 17, 2026');
  });

  it('formats a venue subtitle as "<City>, <State>" or just "<City>" when state is null', async () => {
    queueSelects([
      [],
      [],
      [
        { id: 'v1', name: 'Knockdown Center', slug: 'knockdown-center', city: 'Queens', state: 'NY', similarity: 0.72 },
        { id: 'v2', name: 'Warehouse X', slug: 'warehouse-x', city: 'Detroit', state: null, similarity: 0.4 },
      ],
    ]);

    const result = await autocomplete({ q: 'wa', limit: 10 });

    expect(result.find((item) => item.id === 'v1')?.subtitle).toBe('Queens, NY');
    expect(result.find((item) => item.id === 'v2')?.subtitle).toBe('Detroit');
  });

  it('returns an empty array when all three tables return nothing', async () => {
    queueSelects([[], [], []]);

    const result = await autocomplete({ q: 'zzz', limit: 10 });

    expect(result).toEqual([]);
    expect(db.select).toHaveBeenCalledTimes(3);
  });
});
