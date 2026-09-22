import { describe, expect, it } from 'vitest';
import {
  createAdminEventSchema,
  deleteAdminEventSchema,
  listAdminEventsSchema,
  mergeEventsSchema,
  updateAdminEventSchema,
} from '../../../../src/modules/admin/admin-event.validation';

const ID = '550e8400-e29b-41d4-a716-446655440000';
const ID_2 = '6ba7b810-9dad-41d1-80b4-00c04fd430c8';

function create(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: 'Knock2 at Brooklyn Mirage', startsAt: '2026-10-17T22:00:00-04:00', ...overrides };
}

describe('createAdminEventSchema', () => {
  it('accepts a minimal event, defaulting to PUBLISHED with no artists or genres', () => {
    const parsed = createAdminEventSchema.body.parse(create());

    expect(parsed.status).toBe('PUBLISHED');
    expect(parsed.artistIds).toEqual([]);
    expect(parsed.genreIds).toEqual([]);
    expect(parsed.startsAt).toBeInstanceOf(Date);
  });

  it('accepts the full set of curated fields', () => {
    const parsed = createAdminEventSchema.body.parse(
      create({
        endsAt: '2026-10-18T04:00:00-04:00',
        timezone: 'America/New_York',
        venueId: ID,
        artistIds: [ID, ID_2],
        genreIds: [ID],
        description: 'All night.',
        imageUrl: 'https://example.com/poster.jpg',
        ageRestriction: '21+',
        doorTime: '21:00',
        reentryPolicy: 'No re-entry',
        bagPolicy: 'Clear bags only',
        prohibitedItems: 'Weapons',
        dressCode: 'None',
        status: 'DRAFT',
      }),
    );

    expect(parsed.status).toBe('DRAFT');
    expect(parsed.artistIds).toEqual([ID, ID_2]);
  });

  it('requires a title and an ISO start time with an offset', () => {
    expect(createAdminEventSchema.body.safeParse({ startsAt: '2026-10-17T22:00:00Z' }).success).toBe(false);
    expect(createAdminEventSchema.body.safeParse({ title: 'x' }).success).toBe(false);
    expect(createAdminEventSchema.body.safeParse(create({ startsAt: '2026-10-17T22:00:00' })).success).toBe(false);
    expect(createAdminEventSchema.body.safeParse(create({ title: '   ' })).success).toBe(false);
  });

  it('allows a past start (an admin may backfill) but not an end at or before the start', () => {
    expect(createAdminEventSchema.body.safeParse(create({ startsAt: '2020-01-01T00:00:00Z' })).success).toBe(true);
    expect(
      createAdminEventSchema.body.safeParse(create({ endsAt: '2026-10-17T22:00:00-04:00' })).success,
    ).toBe(false);
    expect(
      createAdminEventSchema.body.safeParse(create({ endsAt: '2026-10-17T21:00:00-04:00' })).success,
    ).toBe(false);
  });

  it('removes duplicate artist and genre ids, keeping first-seen order', () => {
    const parsed = createAdminEventSchema.body.parse(create({ artistIds: [ID, ID_2, ID], genreIds: [ID, ID] }));

    expect(parsed.artistIds).toEqual([ID, ID_2]);
    expect(parsed.genreIds).toEqual([ID]);
  });

  it('bounds the lists and requires UUIDs', () => {
    expect(createAdminEventSchema.body.safeParse(create({ artistIds: ['nope'] })).success).toBe(false);
    expect(createAdminEventSchema.body.safeParse(create({ venueId: 'nope' })).success).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(createAdminEventSchema.body.safeParse(create({ artistIds: many })).success).toBe(false);
  });

  it('only creates PUBLISHED or DRAFT events', () => {
    expect(createAdminEventSchema.body.safeParse(create({ status: 'CANCELLED' })).success).toBe(false);
    expect(createAdminEventSchema.body.safeParse(create({ status: 'DRAFT' })).success).toBe(true);
  });

  it('validates door time, time zone and the image URL', () => {
    expect(createAdminEventSchema.body.safeParse(create({ doorTime: '21:00' })).success).toBe(true);
    expect(createAdminEventSchema.body.safeParse(create({ doorTime: '21:00:30' })).success).toBe(true);
    expect(createAdminEventSchema.body.safeParse(create({ doorTime: '9pm' })).success).toBe(false);
    expect(createAdminEventSchema.body.safeParse(create({ doorTime: '25:00' })).success).toBe(false);
    expect(createAdminEventSchema.body.safeParse(create({ timezone: 'America/Chicago' })).success).toBe(true);
    expect(createAdminEventSchema.body.safeParse(create({ timezone: 'Mars/Olympus' })).success).toBe(false);
    expect(createAdminEventSchema.body.safeParse(create({ imageUrl: 'javascript:alert(1)' })).success).toBe(false);
  });
});

describe('updateAdminEventSchema', () => {
  it('requires a UUID id and at least one field', () => {
    expect(updateAdminEventSchema.params.safeParse({ id: 'nope' }).success).toBe(false);
    expect(updateAdminEventSchema.body.safeParse({}).success).toBe(false);
    expect(updateAdminEventSchema.body.safeParse({ title: 'New' }).success).toBe(true);
  });

  it('lets clearable fields be set to null', () => {
    const parsed = updateAdminEventSchema.body.parse({
      endsAt: null,
      venueId: null,
      description: null,
      imageUrl: null,
      ageRestriction: null,
      doorTime: null,
      reentryPolicy: null,
      bagPolicy: null,
      prohibitedItems: null,
      dressCode: null,
    });

    expect(parsed.venueId).toBeNull();
    expect(parsed.endsAt).toBeNull();
  });

  it('does not let required fields be nulled', () => {
    expect(updateAdminEventSchema.body.safeParse({ title: null }).success).toBe(false);
    expect(updateAdminEventSchema.body.safeParse({ startsAt: null }).success).toBe(false);
    expect(updateAdminEventSchema.body.safeParse({ status: null }).success).toBe(false);
  });

  it('accepts any real status, including CANCELLED and COMPLETED', () => {
    for (const status of ['DRAFT', 'PUBLISHED', 'CANCELLED', 'POSTPONED', 'COMPLETED']) {
      expect(updateAdminEventSchema.body.safeParse({ status }).success).toBe(true);
    }
    expect(updateAdminEventSchema.body.safeParse({ status: 'DELETED' }).success).toBe(false);
  });

  it('rejects an end at or before the start when both are sent', () => {
    expect(
      updateAdminEventSchema.body.safeParse({
        startsAt: '2026-10-17T22:00:00Z',
        endsAt: '2026-10-17T21:00:00Z',
      }).success,
    ).toBe(false);
    expect(
      updateAdminEventSchema.body.safeParse({
        startsAt: '2026-10-17T22:00:00Z',
        endsAt: '2026-10-18T02:00:00Z',
      }).success,
    ).toBe(true);
  });

  it('accepts an artist list, including an empty one to clear the lineup', () => {
    expect(updateAdminEventSchema.body.parse({ artistIds: [] }).artistIds).toEqual([]);
    expect(updateAdminEventSchema.body.parse({ artistIds: [ID, ID, ID_2] }).artistIds).toEqual([ID, ID_2]);
  });
});

describe('deleteAdminEventSchema / listAdminEventsSchema', () => {
  it('delete requires a UUID id', () => {
    expect(deleteAdminEventSchema.params.safeParse({ id: ID }).success).toBe(true);
    expect(deleteAdminEventSchema.params.safeParse({ id: 'nope' }).success).toBe(false);
  });

  it('list accepts a search, any status, a limit and a cursor', () => {
    expect(
      listAdminEventsSchema.query.parse({ q: 'knock2', status: 'DRAFT', limit: '10', cursor: 'abc' }),
    ).toEqual({ q: 'knock2', status: 'DRAFT', limit: 10, cursor: 'abc' });
    expect(listAdminEventsSchema.query.parse({})).toEqual({});
  });

  it('list rejects an unknown status, a blank search and an out-of-range limit', () => {
    expect(listAdminEventsSchema.query.safeParse({ status: 'GONE' }).success).toBe(false);
    expect(listAdminEventsSchema.query.safeParse({ q: '  ' }).success).toBe(false);
    expect(listAdminEventsSchema.query.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('mergeEventsSchema', () => {
  it('accepts two different events with no overrides', () => {
    expect(mergeEventsSchema.body.safeParse({ keepEventId: ID, mergeEventId: ID_2 }).success).toBe(true);
  });

  it('rejects merging an event into itself and non-UUID ids', () => {
    expect(mergeEventsSchema.body.safeParse({ keepEventId: ID, mergeEventId: ID }).success).toBe(false);
    expect(mergeEventsSchema.body.safeParse({ keepEventId: 'nope', mergeEventId: ID_2 }).success).toBe(false);
    expect(mergeEventsSchema.body.safeParse({ keepEventId: ID }).success).toBe(false);
  });

  it('accepts per-field keep/merge choices for known fields', () => {
    const parsed = mergeEventsSchema.body.parse({
      keepEventId: ID,
      mergeEventId: ID_2,
      fieldOverrides: { description: 'merge', title: 'keep' },
    });

    expect(parsed.fieldOverrides).toEqual({ description: 'merge', title: 'keep' });
  });

  it('rejects an unknown field name or choice', () => {
    expect(
      mergeEventsSchema.body.safeParse({ keepEventId: ID, mergeEventId: ID_2, fieldOverrides: { slug: 'merge' } })
        .success,
    ).toBe(false);
    expect(
      mergeEventsSchema.body.safeParse({ keepEventId: ID, mergeEventId: ID_2, fieldOverrides: { title: 'both' } })
        .success,
    ).toBe(false);
  });
});
