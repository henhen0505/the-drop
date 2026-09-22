import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

vi.mock('../../../../src/db/client', () => ({
  db: {
    select: vi.fn(),
  },
}));

import {
  FTC_DISCLOSURE,
  getEventsByVenue,
  listEvents,
  toTicketLinkSummary,
  type TicketLinkRow,
} from '../../../../src/modules/events/event.service';
import { db } from '../../../../src/db/client';
import { decodeCursor, encodeCursor } from '../../../../src/utils/pagination';
import { NotFoundError, NotImplementedError, ValidationError } from '../../../../src/utils/errors';
import { fakeChain, type RecordedStep } from '../../../helpers/fake-db';

const dialect = new PgDialect();
const UUID = '550e8400-e29b-41d4-a716-446655440000';
const UUID_2 = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';
const MAX_INT = 2147483647;

let calls: RecordedStep[][] = [];

function queueSelects(results: unknown[]): void {
  calls = [];
  const queue = [...results];
  vi.mocked(db.select).mockImplementation((() => {
    const steps: RecordedStep[] = [{ name: 'select', args: [] }];
    calls.push(steps);
    return fakeChain(() => (queue.length > 0 ? queue.shift() : []), steps);
  }) as never);
}

function renderStep(call: number, step: string): { sql: string; params: unknown[] } {
  const args = calls[call]?.find((s) => s.name === step)?.args ?? [];
  const parts = args.map((arg) => dialect.sqlToQuery(arg as SQL));
  return { sql: parts.map((p) => p.sql).join(', '), params: parts.flatMap((p) => p.params) };
}

function eventRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: UUID,
    title: 'Rave',
    slug: 'rave',
    imageUrl: null,
    startsAt: new Date('2026-10-01T22:00:00Z'),
    endsAt: null,
    timezone: 'America/New_York',
    ageRestriction: '21+',
    artistCount: 2,
    minPriceCents: 5000,
    status: 'PUBLISHED',
    venueId: UUID_2,
    venueName: 'Mirage',
    venueSlug: 'mirage',
    venueCity: 'Brooklyn',
    venueState: 'NY',
    ...overrides,
  };
}

const LINK: TicketLinkRow = {
  id: 'tl1',
  vendorName: 'Ticketmaster',
  vendorClassification: 'OFFICIAL',
  url: 'https://tm.example.com/1',
  affiliateUrl: null,
  priceMinCents: 5000,
  priceMaxCents: 15000,
  currency: 'USD',
  ticketType: 'GA',
  feesKnown: false,
  lastCheckedAt: null,
};

describe('toTicketLinkSummary', () => {
  it('sets the exact FTC disclosure when an affiliateUrl is present', () => {
    const result = toTicketLinkSummary({ ...LINK, affiliateUrl: 'https://aff.example.com/1' });

    expect(result.ftcDisclosure).toBe('This is an affiliate link. We may earn a commission.');
    expect(result.ftcDisclosure).toBe(FTC_DISCLOSURE);
  });

  it('sets ftcDisclosure to null when there is no affiliateUrl', () => {
    expect(toTicketLinkSummary(LINK).ftcDisclosure).toBeNull();
  });

  it('keeps every source column alongside the disclosure', () => {
    const result = toTicketLinkSummary({ ...LINK, feesKnown: true });

    expect(result).toMatchObject({
      id: 'tl1',
      vendorClassification: 'OFFICIAL',
      url: 'https://tm.example.com/1',
      affiliateUrl: null,
      priceMinCents: 5000,
      feesKnown: true,
      lastCheckedAt: null,
    });
  });
});

describe('listEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotImplementedError for sort=relevance without touching the database', async () => {
    queueSelects([]);

    await expect(listEvents({ sort: 'relevance' })).rejects.toBeInstanceOf(NotImplementedError);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('defaults to PUBLISHED events starting from now', async () => {
    queueSelects([[]]);

    await listEvents({});

    const where = renderStep(0, 'where');
    expect(where.params).toContain('PUBLISHED');
    expect(where.sql).toContain('"events"."starts_at" >= now()');
  });

  it('replaces the now() window with an explicit startsAfter', async () => {
    const startsAfter = new Date('2026-11-01T00:00:00Z');
    queueSelects([[]]);

    await listEvents({ startsAfter });

    const where = renderStep(0, 'where');
    expect(where.sql).not.toContain('now()');
    expect(where.params).toContain(startsAfter.toISOString());
  });

  it('does not apply the now() window to non-PUBLISHED statuses', async () => {
    queueSelects([[]]);

    await listEvents({ status: 'COMPLETED' });

    const where = renderStep(0, 'where');
    expect(where.params).toContain('COMPLETED');
    expect(where.sql).not.toContain('now()');
  });

  it('applies every contract filter', async () => {
    queueSelects([[]]);
    const startsBefore = new Date('2026-12-01T00:00:00Z');

    await listEvents({
      q: 'rave',
      city: 'Brooklyn',
      state: 'ny',
      startsBefore,
      genreId: UUID,
      venueId: UUID_2,
      ageRestriction: '21+',
      priceMin: 5000,
      priceMax: 15000,
    });

    const where = renderStep(0, 'where');
    expect(where.sql).toContain('"events"."title" ilike');
    expect(where.sql).toContain('"venues"."city" ilike');
    expect(where.sql).toContain('"venues"."state" =');
    expect(where.sql).toContain('"event_genres"."genre_id" =');
    expect(where.sql).toContain('"events"."venue_id" =');
    expect(where.sql).toContain('"events"."age_restriction" =');
    expect(where.sql).toContain('"events"."min_price_cents" >=');
    expect(where.sql).toContain('"events"."min_price_cents" <=');
    expect(where.sql).toContain('"events"."starts_at" <=');
    expect(where.params).toEqual(
      expect.arrayContaining([
        '%rave%',
        'Brooklyn',
        'NY',
        UUID,
        UUID_2,
        '21+',
        5000,
        15000,
        startsBefore.toISOString(),
      ]),
    );
  });

  it('orders by (starts_at, id) for the default date sort', async () => {
    queueSelects([[]]);

    await listEvents({});

    const order = renderStep(0, 'orderBy');
    expect(order.sql).toBe('"events"."starts_at" asc, "events"."id" asc');
  });

  it('orders by coalesced price, starts_at, id for sort=price', async () => {
    queueSelects([[]]);

    await listEvents({ sort: 'price' });

    const order = renderStep(0, 'orderBy');
    expect(order.sql).toBe(
      `coalesce("events"."min_price_cents", ${MAX_INT}) asc, "events"."starts_at" asc, "events"."id" asc`,
    );
  });

  it('adds a three-key row comparison for a price cursor', async () => {
    const cursor = encodeCursor({ price: 7500, startsAt: '2026-10-01T22:00:00.000Z', id: UUID });
    queueSelects([[]]);

    await listEvents({ sort: 'price', cursor });

    const where = renderStep(0, 'where');
    expect(where.sql).toContain(
      `(coalesce("events"."min_price_cents", ${MAX_INT}), "events"."starts_at", "events"."id") > (`,
    );
    expect(where.params).toEqual(expect.arrayContaining([7500, '2026-10-01T22:00:00.000Z', UUID]));
  });

  it('adds a two-key row comparison for a date cursor', async () => {
    const cursor = encodeCursor({ startsAt: '2026-10-01T22:00:00.000Z', id: UUID });
    queueSelects([[]]);

    await listEvents({ cursor });

    const where = renderStep(0, 'where');
    expect(where.sql).toContain('("events"."starts_at", "events"."id") > (');
  });

  it('rejects a date cursor when sorting by price', async () => {
    const cursor = encodeCursor({ startsAt: '2026-10-01T22:00:00.000Z', id: UUID });
    queueSelects([[]]);

    await expect(listEvents({ sort: 'price', cursor })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a cursor whose id is not a uuid', async () => {
    const cursor = encodeCursor({ startsAt: '2026-10-01T22:00:00.000Z', id: 'not-a-uuid' });
    queueSelects([[]]);

    await expect(listEvents({ cursor })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a cursor whose startsAt is not a date', async () => {
    const cursor = encodeCursor({ startsAt: 'garbage', id: UUID });
    queueSelects([[]]);

    await expect(listEvents({ cursor })).rejects.toBeInstanceOf(ValidationError);
  });

  it('emits a date cursor with no price key when sorting by date', async () => {
    queueSelects([[eventRow(), eventRow({ id: UUID_2 })], [], [], []]);

    const result = await listEvents({ limit: 1 });

    expect(result.data).toHaveLength(1);
    expect(decodeCursor(result.cursor!)).toEqual({
      startsAt: '2026-10-01T22:00:00.000Z',
      id: UUID,
    });
  });

  it('emits a price cursor carrying the sentinel for a NULL price', async () => {
    queueSelects([
      [eventRow({ minPriceCents: null }), eventRow({ id: UUID_2 })],
      [],
      [],
      [],
    ]);

    const result = await listEvents({ sort: 'price', limit: 1 });

    expect(decodeCursor(result.cursor!)).toEqual({
      price: MAX_INT,
      startsAt: '2026-10-01T22:00:00.000Z',
      id: UUID,
    });
  });

  it('returns a null cursor on the last page', async () => {
    queueSelects([[eventRow()], [], [], []]);

    const result = await listEvents({ limit: 5 });

    expect(result.cursor).toBeNull();
  });

  it('maps the contract list-item fields with a null userState for anonymous requests', async () => {
    queueSelects([[eventRow()], [], []]);

    const result = await listEvents({});

    expect(result.data[0]).toMatchObject({
      timezone: 'America/New_York',
      ageRestriction: '21+',
      artistCount: 2,
      userState: null,
      recommendationScore: null,
      venue: { id: UUID_2, name: 'Mirage', slug: 'mirage', city: 'Brooklyn', state: 'NY' },
    });
    expect(db.select).toHaveBeenCalledTimes(3);
  });

  it('batch-fetches user states for the page when a userId is present', async () => {
    queueSelects([
      [eventRow(), eventRow({ id: UUID_2 })],
      [],
      [],
      [{ eventId: UUID, state: 'GOING' }],
    ]);

    const result = await listEvents({ userId: 'user-1' });

    expect(db.select).toHaveBeenCalledTimes(4);
    expect(result.data.map((e) => e.userState)).toEqual(['GOING', null]);
  });
});

describe('getEventsByVenue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotFoundError when the venue does not exist', async () => {
    queueSelects([[]]);

    await expect(getEventsByVenue('nope', {})).rejects.toEqual(
      new NotFoundError('Venue not found'),
    );
  });

  it('resolves a slug, filters by venue id and keeps the upcoming window by default', async () => {
    queueSelects([[{ id: UUID_2 }], []]);

    await getEventsByVenue('mirage', {});

    const lookup = renderStep(0, 'where');
    expect(lookup.sql).toContain('"venues"."slug" =');
    expect(lookup.params).toContain('mirage');

    const where = renderStep(1, 'where');
    expect(where.sql).toContain('"events"."venue_id" =');
    expect(where.params).toContain(UUID_2);
    expect(where.sql).toContain('"events"."starts_at" >= now()');
  });

  it('resolves a uuid by id', async () => {
    queueSelects([[{ id: UUID_2 }], []]);

    await getEventsByVenue(UUID_2, {});

    expect(renderStep(0, 'where').sql).toContain('"venues"."id" =');
  });

  it('upcoming=false swaps the now() window for an epoch startsAfter', async () => {
    queueSelects([[{ id: UUID_2 }], []]);

    await getEventsByVenue('mirage', { upcoming: false });

    const where = renderStep(1, 'where');
    expect(where.sql).not.toContain('now()');
    expect(where.params).toContain(new Date(0).toISOString());
  });
});
