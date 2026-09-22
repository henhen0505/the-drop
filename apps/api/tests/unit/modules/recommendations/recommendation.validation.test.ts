import { describe, expect, it } from 'vitest';
import { recommendationsSchema } from '../../../../src/modules/recommendations/recommendation.validation';

describe('recommendationsSchema.query', () => {
  it('accepts no parameters', () => {
    expect(recommendationsSchema.query.parse({})).toEqual({});
  });

  it('coerces the limit and passes the cursor through', () => {
    expect(recommendationsSchema.query.parse({ limit: '20', cursor: 'abc' })).toEqual({
      limit: 20,
      cursor: 'abc',
    });
  });

  it('bounds the limit to 1-100 and requires an integer', () => {
    expect(recommendationsSchema.query.safeParse({ limit: '1' }).success).toBe(true);
    expect(recommendationsSchema.query.safeParse({ limit: '100' }).success).toBe(true);
    expect(recommendationsSchema.query.safeParse({ limit: '0' }).success).toBe(false);
    expect(recommendationsSchema.query.safeParse({ limit: '101' }).success).toBe(false);
    expect(recommendationsSchema.query.safeParse({ limit: '2.5' }).success).toBe(false);
  });
});
