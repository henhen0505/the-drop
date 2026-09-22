import { describe, expect, it } from 'vitest';
import {
  listArtistsSchema,
  getArtistSchema,
  artistIdParamSchema,
  followedArtistsQuerySchema,
} from '../../../../src/modules/artists/artist.validation';

describe('listArtistsSchema', () => {
  it('accepts empty query (defaults)', () => {
    expect(listArtistsSchema.query.safeParse({}).success).toBe(true);
  });

  it('accepts valid search query', () => {
    expect(listArtistsSchema.query.safeParse({ q: 'skrillex' }).success).toBe(true);
  });

  it('accepts genre filter', () => {
    expect(listArtistsSchema.query.safeParse({ genre: 'house' }).success).toBe(true);
  });

  it('accepts combined filters', () => {
    const result = listArtistsSchema.query.safeParse({
      q: 'bass',
      genre: 'dubstep',
      limit: '25',
      cursor: 'abc123',
    });
    expect(result.success).toBe(true);
  });

  it('coerces limit from string to number', () => {
    const result = listArtistsSchema.query.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects limit < 1', () => {
    expect(listArtistsSchema.query.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects limit > 100', () => {
    expect(listArtistsSchema.query.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('rejects non-integer limit', () => {
    expect(listArtistsSchema.query.safeParse({ limit: '12.5' }).success).toBe(false);
  });
});

describe('getArtistSchema', () => {
  it('accepts a UUID', () => {
    expect(
      getArtistSchema.params.safeParse({ idOrSlug: '550e8400-e29b-41d4-a716-446655440000' }).success,
    ).toBe(true);
  });

  it('accepts a slug', () => {
    expect(getArtistSchema.params.safeParse({ idOrSlug: 'skrillex' }).success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(getArtistSchema.params.safeParse({ idOrSlug: '' }).success).toBe(false);
  });
});

describe('artistIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    expect(
      artistIdParamSchema.params.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' }).success,
    ).toBe(true);
  });

  it('rejects a non-UUID string', () => {
    expect(artistIdParamSchema.params.safeParse({ id: 'skrillex' }).success).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(artistIdParamSchema.params.safeParse({ id: '' }).success).toBe(false);
  });
});

describe('followedArtistsQuerySchema', () => {
  it('accepts empty query (defaults)', () => {
    expect(followedArtistsQuerySchema.query.safeParse({}).success).toBe(true);
  });

  it('accepts valid limit and cursor', () => {
    const result = followedArtistsQuerySchema.query.safeParse({ limit: '10', cursor: 'xyz' });
    expect(result.success).toBe(true);
  });

  it('coerces limit from string to number', () => {
    const result = followedArtistsQuerySchema.query.safeParse({ limit: '25' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
    }
  });

  it('rejects limit < 1', () => {
    expect(followedArtistsQuerySchema.query.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects limit > 100', () => {
    expect(followedArtistsQuerySchema.query.safeParse({ limit: '101' }).success).toBe(false);
  });
});
