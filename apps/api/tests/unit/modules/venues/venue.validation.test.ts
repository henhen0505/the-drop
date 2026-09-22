import { describe, expect, it } from 'vitest';
import {
  listVenuesSchema,
  getVenueSchema,
  eventsByVenueSchema,
} from '../../../../src/modules/venues/venue.validation';

describe('listVenuesSchema', () => {
  it('accepts empty query (defaults)', () => {
    expect(listVenuesSchema.query.safeParse({}).success).toBe(true);
  });

  it('accepts search query', () => {
    expect(listVenuesSchema.query.safeParse({ q: 'warehouse' }).success).toBe(true);
  });

  it('accepts city and state filters', () => {
    expect(listVenuesSchema.query.safeParse({ city: 'Brooklyn', state: 'NY' }).success).toBe(true);
  });

  it('rejects state longer than 2 characters', () => {
    expect(listVenuesSchema.query.safeParse({ state: 'NYC' }).success).toBe(false);
  });

  it('coerces limit from string to number', () => {
    const result = listVenuesSchema.query.safeParse({ limit: '25' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
    }
  });

  it('rejects limit < 1', () => {
    expect(listVenuesSchema.query.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects limit > 100', () => {
    expect(listVenuesSchema.query.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('getVenueSchema', () => {
  it('accepts a UUID', () => {
    expect(
      getVenueSchema.params.safeParse({ idOrSlug: '550e8400-e29b-41d4-a716-446655440000' }).success,
    ).toBe(true);
  });

  it('accepts a slug', () => {
    expect(getVenueSchema.params.safeParse({ idOrSlug: 'brooklyn-mirage' }).success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(getVenueSchema.params.safeParse({ idOrSlug: '' }).success).toBe(false);
  });
});

describe('eventsByVenueSchema', () => {
  it('defaults upcoming to true', () => {
    const result = eventsByVenueSchema.query.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.upcoming).toBe(true);
    }
  });

  it('parses the strings "true" and "false" into booleans', () => {
    const yes = eventsByVenueSchema.query.safeParse({ upcoming: 'true' });
    const no = eventsByVenueSchema.query.safeParse({ upcoming: 'false' });
    expect(yes.success && yes.data.upcoming).toBe(true);
    expect(no.success && no.data.upcoming).toBe(false);
  });

  it('rejects any other upcoming value', () => {
    expect(eventsByVenueSchema.query.safeParse({ upcoming: 'maybe' }).success).toBe(false);
    expect(eventsByVenueSchema.query.safeParse({ upcoming: '1' }).success).toBe(false);
  });

  it('accepts limit and cursor', () => {
    const result = eventsByVenueSchema.query.safeParse({ limit: '10', cursor: 'abc' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  it('rejects limit > 100', () => {
    expect(eventsByVenueSchema.query.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('rejects an empty idOrSlug', () => {
    expect(eventsByVenueSchema.params.safeParse({ idOrSlug: '' }).success).toBe(false);
  });
});
