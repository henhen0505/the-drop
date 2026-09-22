import { describe, expect, it } from 'vitest';
import {
  listEventsSchema,
  getEventSchema,
  eventsByArtistSchema,
  normalizeAgeRestriction,
} from '../../../../src/modules/events/event.validation';

describe('listEventsSchema', () => {
  const UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts empty query and defaults sort to date', () => {
    const result = listEventsSchema.query.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort).toBe('date');
    }
  });

  it('accepts search query', () => {
    expect(listEventsSchema.query.safeParse({ q: 'rave' }).success).toBe(true);
  });

  it('accepts genreId and venueId filters (UUID)', () => {
    expect(listEventsSchema.query.safeParse({ genreId: UUID, venueId: UUID }).success).toBe(true);
  });

  it('rejects non-UUID genreId', () => {
    expect(listEventsSchema.query.safeParse({ genreId: 'techno' }).success).toBe(false);
  });

  it('rejects non-UUID venueId', () => {
    expect(listEventsSchema.query.safeParse({ venueId: 'not-a-uuid' }).success).toBe(false);
  });

  it('drops the removed artistId, genre, from and to params', () => {
    const result = listEventsSchema.query.safeParse({
      artistId: 'not-a-uuid',
      genre: 'techno',
      from: '2024-06-01',
      to: '2024-12-31',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ sort: 'date' });
    }
  });

  it('accepts city and state filters', () => {
    expect(listEventsSchema.query.safeParse({ city: 'Brooklyn', state: 'NY' }).success).toBe(true);
  });

  it('rejects state longer than 2 characters', () => {
    expect(listEventsSchema.query.safeParse({ state: 'NYC' }).success).toBe(false);
  });

  it('coerces startsAfter and startsBefore to dates', () => {
    const result = listEventsSchema.query.safeParse({
      startsAfter: '2026-10-01T00:00:00Z',
      startsBefore: '2026-10-31T23:59:59Z',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.startsAfter).toBeInstanceOf(Date);
      expect(result.data.startsBefore).toBeInstanceOf(Date);
    }
  });

  it('rejects an invalid startsAfter', () => {
    expect(listEventsSchema.query.safeParse({ startsAfter: 'yesterday' }).success).toBe(false);
  });

  it('coerces priceMin and priceMax to integers', () => {
    const result = listEventsSchema.query.safeParse({ priceMin: '5000', priceMax: '15000' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priceMin).toBe(5000);
      expect(result.data.priceMax).toBe(15000);
    }
  });

  it('rejects fractional or negative prices', () => {
    expect(listEventsSchema.query.safeParse({ priceMin: '10.5' }).success).toBe(false);
    expect(listEventsSchema.query.safeParse({ priceMax: '-1' }).success).toBe(false);
  });

  it('accepts a public status', () => {
    expect(listEventsSchema.query.safeParse({ status: 'CANCELLED' }).success).toBe(true);
  });

  it('rejects DRAFT status', () => {
    expect(listEventsSchema.query.safeParse({ status: 'DRAFT' }).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(listEventsSchema.query.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
  });

  it('accepts date, relevance and price sorts', () => {
    for (const sort of ['date', 'relevance', 'price']) {
      expect(listEventsSchema.query.safeParse({ sort }).success).toBe(true);
    }
  });

  it('rejects an unknown sort', () => {
    expect(listEventsSchema.query.safeParse({ sort: 'popularity' }).success).toBe(false);
  });

  it('coerces limit from string to number', () => {
    const result = listEventsSchema.query.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects limit < 1', () => {
    expect(listEventsSchema.query.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects limit > 100', () => {
    expect(listEventsSchema.query.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('normalizeAgeRestriction', () => {
  it('restores the + that a query string decoded to a trailing space', () => {
    expect(normalizeAgeRestriction('21 ')).toBe('21+');
    expect(normalizeAgeRestriction('18 ')).toBe('18+');
  });

  it('leaves a literal + (from %2B) untouched', () => {
    expect(normalizeAgeRestriction('21+')).toBe('21+');
  });

  it('keeps inner spaces and does not add a + to values without a trailing space', () => {
    expect(normalizeAgeRestriction('all ages')).toBe('all ages');
  });

  it('trims a leading space without inventing a +', () => {
    expect(normalizeAgeRestriction(' 21')).toBe('21');
  });

  it('collapses whitespace-only input to an empty string', () => {
    expect(normalizeAgeRestriction('  ')).toBe('');
  });

  it('is applied by the query schema', () => {
    const result = listEventsSchema.query.safeParse({ ageRestriction: '21 ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ageRestriction).toBe('21+');
    }
  });

  it('rejects a blank ageRestriction', () => {
    expect(listEventsSchema.query.safeParse({ ageRestriction: '  ' }).success).toBe(false);
  });
});

describe('getEventSchema', () => {
  it('accepts a UUID', () => {
    expect(
      getEventSchema.params.safeParse({ idOrSlug: '550e8400-e29b-41d4-a716-446655440000' })
        .success,
    ).toBe(true);
  });

  it('accepts a slug', () => {
    expect(getEventSchema.params.safeParse({ idOrSlug: 'skrillex-at-mirage-2024' }).success).toBe(
      true,
    );
  });

  it('rejects an empty string', () => {
    expect(getEventSchema.params.safeParse({ idOrSlug: '' }).success).toBe(false);
  });
});

describe('eventsByArtistSchema', () => {
  it('accepts artist slug with empty query', () => {
    const params = eventsByArtistSchema.params.safeParse({ idOrSlug: 'skrillex' });
    const query = eventsByArtistSchema.query.safeParse({});
    expect(params.success).toBe(true);
    expect(query.success).toBe(true);
  });

  it('accepts limit and cursor', () => {
    const result = eventsByArtistSchema.query.safeParse({ limit: '10', cursor: 'abc' });
    expect(result.success).toBe(true);
  });

  it('rejects empty idOrSlug', () => {
    expect(eventsByArtistSchema.params.safeParse({ idOrSlug: '' }).success).toBe(false);
  });
});
