import { describe, expect, it } from 'vitest';
import { autocompleteSchema, searchSchema } from '../../../../src/modules/search/search.validation';

describe('searchSchema', () => {
  it('rejects q under 2 characters', () => {
    expect(searchSchema.query.safeParse({ q: 'k' }).success).toBe(false);
  });

  it('accepts q at exactly 2 characters', () => {
    expect(searchSchema.query.safeParse({ q: 'kn' }).success).toBe(true);
  });

  it('defaults type to all three entity types when omitted', () => {
    const result = searchSchema.query.safeParse({ q: 'knock2' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toEqual(['event', 'artist', 'venue']);
    }
  });

  it('parses a comma-separated type list', () => {
    const result = searchSchema.query.safeParse({ q: 'knock2', type: 'event,artist' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toEqual(['event', 'artist']);
    }
  });

  it('parses a single type value', () => {
    const result = searchSchema.query.safeParse({ q: 'knock2', type: 'venue' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toEqual(['venue']);
    }
  });

  it('rejects an invalid type value anywhere in the list', () => {
    expect(searchSchema.query.safeParse({ q: 'knock2', type: 'event,bogus' }).success).toBe(false);
    expect(searchSchema.query.safeParse({ q: 'knock2', type: 'bogus' }).success).toBe(false);
  });

  it('defaults limit to 20', () => {
    const result = searchSchema.query.safeParse({ q: 'knock2' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it('clamps and coerces limit', () => {
    expect(searchSchema.query.safeParse({ q: 'knock2', limit: '50' }).success).toBe(true);
    expect(searchSchema.query.safeParse({ q: 'knock2', limit: '0' }).success).toBe(false);
    expect(searchSchema.query.safeParse({ q: 'knock2', limit: '101' }).success).toBe(false);
  });

  it('rejects a non-integer limit', () => {
    expect(searchSchema.query.safeParse({ q: 'knock2', limit: '10.5' }).success).toBe(false);
  });
});

describe('autocompleteSchema', () => {
  it('rejects q under 2 characters', () => {
    expect(autocompleteSchema.query.safeParse({ q: 'k' }).success).toBe(false);
  });

  it('accepts q at exactly 2 characters', () => {
    expect(autocompleteSchema.query.safeParse({ q: 'kn' }).success).toBe(true);
  });

  it('defaults limit to 10', () => {
    const result = autocompleteSchema.query.safeParse({ q: 'kno' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
    }
  });

  it('clamps and coerces limit', () => {
    expect(autocompleteSchema.query.safeParse({ q: 'kno', limit: '5' }).success).toBe(true);
    expect(autocompleteSchema.query.safeParse({ q: 'kno', limit: '0' }).success).toBe(false);
    expect(autocompleteSchema.query.safeParse({ q: 'kno', limit: '101' }).success).toBe(false);
  });

  it('rejects a non-integer limit', () => {
    expect(autocompleteSchema.query.safeParse({ q: 'kno', limit: '3.2' }).success).toBe(false);
  });
});
