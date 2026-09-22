import { describe, expect, it } from 'vitest';
import {
  myRavesSchema,
  removeEventStateSchema,
  setEventStateSchema,
} from '../../../../src/modules/events/user-event-state.validation';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('setEventStateSchema', () => {
  it('accepts a UUID id and every valid state', () => {
    for (const state of ['DISCOVERED', 'INTERESTED', 'GOING', 'HAVE_TICKET', 'ATTENDED', 'CANCELLED']) {
      expect(setEventStateSchema.params.safeParse({ id: UUID }).success).toBe(true);
      expect(setEventStateSchema.body.safeParse({ state }).success).toBe(true);
    }
  });

  it('rejects an unknown or missing state and a non-UUID id', () => {
    expect(setEventStateSchema.body.safeParse({ state: 'MAYBE' }).success).toBe(false);
    expect(setEventStateSchema.body.safeParse({ state: 'going' }).success).toBe(false);
    expect(setEventStateSchema.body.safeParse({}).success).toBe(false);
    expect(setEventStateSchema.params.safeParse({ id: 'nope' }).success).toBe(false);
  });
});

describe('removeEventStateSchema', () => {
  it('requires a UUID id', () => {
    expect(removeEventStateSchema.params.safeParse({ id: UUID }).success).toBe(true);
    expect(removeEventStateSchema.params.safeParse({ id: 'nope' }).success).toBe(false);
  });
});

describe('myRavesSchema.query', () => {
  it('defaults to upcoming with no state filter', () => {
    expect(myRavesSchema.query.parse({})).toEqual({ upcoming: true });
  });

  it('splits a comma-separated state filter and validates each entry', () => {
    expect(myRavesSchema.query.parse({ state: 'INTERESTED,GOING,HAVE_TICKET' }).state).toEqual([
      'INTERESTED',
      'GOING',
      'HAVE_TICKET',
    ]);
    expect(myRavesSchema.query.parse({ state: 'GOING' }).state).toEqual(['GOING']);
    expect(myRavesSchema.query.parse({ state: 'GOING, ATTENDED' }).state).toEqual(['GOING', 'ATTENDED']);
  });

  it('rejects an invalid state anywhere in the list, and an empty entry', () => {
    expect(myRavesSchema.query.safeParse({ state: 'GOING,MAYBE' }).success).toBe(false);
    expect(myRavesSchema.query.safeParse({ state: 'GOING,' }).success).toBe(false);
    expect(myRavesSchema.query.safeParse({ state: ',' }).success).toBe(false);
  });

  it('parses upcoming as a boolean', () => {
    expect(myRavesSchema.query.parse({ upcoming: 'false' }).upcoming).toBe(false);
    expect(myRavesSchema.query.parse({ upcoming: 'true' }).upcoming).toBe(true);
    expect(myRavesSchema.query.safeParse({ upcoming: 'maybe' }).success).toBe(false);
  });

  it('coerces and bounds limit and passes the cursor through', () => {
    expect(myRavesSchema.query.parse({ limit: '25', cursor: 'abc' })).toMatchObject({
      limit: 25,
      cursor: 'abc',
    });
    expect(myRavesSchema.query.safeParse({ limit: '0' }).success).toBe(false);
    expect(myRavesSchema.query.safeParse({ limit: '101' }).success).toBe(false);
    expect(myRavesSchema.query.safeParse({ limit: '2.5' }).success).toBe(false);
  });
});
