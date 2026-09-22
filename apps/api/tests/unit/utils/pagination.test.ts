import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  decodeCursor,
  encodeCursor,
  parseLimit,
} from '../../../src/utils/pagination';
import { ValidationError } from '../../../src/utils/errors';

describe('pagination cursor encode/decode', () => {
  it('round-trips an arbitrary sort key', () => {
    const sortKey = { id: '123', startsAt: '2026-10-01T00:00:00Z' };
    const cursor = encodeCursor(sortKey);
    expect(decodeCursor(cursor)).toEqual(sortKey);
  });

  it('rejects a malformed cursor', () => {
    expect(() => decodeCursor('not-valid-base64-json')).toThrow(ValidationError);
  });

  it('rejects a cursor that decodes to a non-object', () => {
    const cursor = Buffer.from('"just a string"', 'utf8').toString('base64url');
    expect(() => decodeCursor(cursor)).toThrow(ValidationError);
  });
});

describe('parseLimit', () => {
  it('defaults when absent', () => {
    expect(parseLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT);
  });

  it('clamps to the maximum', () => {
    expect(parseLimit('500')).toBe(MAX_PAGE_LIMIT);
  });

  it('rejects non-positive values', () => {
    expect(() => parseLimit('0')).toThrow(ValidationError);
    expect(() => parseLimit('-5')).toThrow(ValidationError);
    expect(() => parseLimit('abc')).toThrow(ValidationError);
  });
});
