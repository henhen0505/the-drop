import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../../src/utils/errors';
import { decodeTimestampIdCursor, encodeCursor } from '../../../src/utils/pagination';

const ID = '550e8400-e29b-41d4-a716-446655440000';

describe('decodeTimestampIdCursor', () => {
  it('round-trips a timestamp and id under the named field', () => {
    const cursor = encodeCursor({ createdAt: '2026-10-01T00:00:00.000Z', id: ID });

    expect(decodeTimestampIdCursor(cursor, 'createdAt')).toEqual({
      at: '2026-10-01T00:00:00.000Z',
      id: ID,
    });
  });

  it('reads whichever field name it is told to', () => {
    const cursor = encodeCursor({ startsAt: '2026-10-01T00:00:00.000Z', id: ID });

    expect(decodeTimestampIdCursor(cursor, 'startsAt').at).toBe('2026-10-01T00:00:00.000Z');
    expect(() => decodeTimestampIdCursor(cursor, 'createdAt')).toThrow(ValidationError);
  });

  it('rejects garbage, a bad timestamp, a bad id, and missing parts', () => {
    expect(() => decodeTimestampIdCursor('not-a-cursor', 'createdAt')).toThrow(ValidationError);
    expect(() =>
      decodeTimestampIdCursor(encodeCursor({ createdAt: 'nope', id: ID }), 'createdAt'),
    ).toThrow(ValidationError);
    expect(() =>
      decodeTimestampIdCursor(encodeCursor({ createdAt: '2026-10-01T00:00:00.000Z', id: 'x' }), 'createdAt'),
    ).toThrow(ValidationError);
    expect(() =>
      decodeTimestampIdCursor(encodeCursor({ createdAt: '2026-10-01T00:00:00.000Z' }), 'createdAt'),
    ).toThrow(ValidationError);
    expect(() => decodeTimestampIdCursor(encodeCursor({ id: ID }), 'createdAt')).toThrow(ValidationError);
  });

  it('rejects a number where a timestamp string is expected', () => {
    expect(() => decodeTimestampIdCursor(encodeCursor({ createdAt: 12345, id: ID }), 'createdAt')).toThrow(
      ValidationError,
    );
  });
});
