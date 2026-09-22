import { describe, expect, it } from 'vitest';
import { similarEventsSchema } from '../../../../src/modules/events/similar-events.validation';

describe('similarEventsSchema', () => {
  it('requires a UUID id', () => {
    expect(similarEventsSchema.params.safeParse({ id: '550e8400-e29b-41d4-a716-446655440000' }).success).toBe(true);
    expect(similarEventsSchema.params.safeParse({ id: 'some-slug' }).success).toBe(false);
  });

  it('defaults the limit to 10', () => {
    expect(similarEventsSchema.query.parse({}).limit).toBe(10);
  });

  it('coerces the limit and caps it at 50', () => {
    expect(similarEventsSchema.query.parse({ limit: '25' }).limit).toBe(25);
    expect(similarEventsSchema.query.parse({ limit: '50' }).limit).toBe(50);
    expect(similarEventsSchema.query.safeParse({ limit: '51' }).success).toBe(false);
  });

  it('rejects a non-positive or non-integer limit', () => {
    expect(similarEventsSchema.query.safeParse({ limit: '0' }).success).toBe(false);
    expect(similarEventsSchema.query.safeParse({ limit: '-1' }).success).toBe(false);
    expect(similarEventsSchema.query.safeParse({ limit: '1.5' }).success).toBe(false);
  });
});
