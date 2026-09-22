import { describe, expect, it } from 'vitest';
import {
  listSubmissionsSchema,
  reviewSubmissionSchema,
} from '../../../../src/modules/admin/submission-review.validation';

const ID = '550e8400-e29b-41d4-a716-446655440000';

describe('listSubmissionsSchema.query', () => {
  it('defaults to the PENDING queue', () => {
    expect(listSubmissionsSchema.query.parse({}).status).toBe('PENDING');
  });

  it('accepts any real status, a limit and a cursor', () => {
    expect(listSubmissionsSchema.query.parse({ status: 'MERGED', limit: '10', cursor: 'abc' })).toEqual({
      status: 'MERGED',
      limit: 10,
      cursor: 'abc',
    });
  });

  it('rejects an unknown status and an out-of-range limit', () => {
    expect(listSubmissionsSchema.query.safeParse({ status: 'DONE' }).success).toBe(false);
    expect(listSubmissionsSchema.query.safeParse({ limit: '0' }).success).toBe(false);
    expect(listSubmissionsSchema.query.safeParse({ limit: '101' }).success).toBe(false);
  });
});

describe('reviewSubmissionSchema', () => {
  it('requires a UUID id', () => {
    expect(reviewSubmissionSchema.params.safeParse({ id: ID }).success).toBe(true);
    expect(reviewSubmissionSchema.params.safeParse({ id: 'nope' }).success).toBe(false);
  });

  it('accepts approve and reject with optional notes', () => {
    expect(reviewSubmissionSchema.body.safeParse({ status: 'APPROVED' }).success).toBe(true);
    expect(reviewSubmissionSchema.body.safeParse({ status: 'REJECTED', reviewNotes: 'Spam' }).success).toBe(true);
  });

  it('only allows the three decisions, not PENDING', () => {
    expect(reviewSubmissionSchema.body.safeParse({ status: 'PENDING' }).success).toBe(false);
    expect(reviewSubmissionSchema.body.safeParse({ status: 'DONE' }).success).toBe(false);
    expect(reviewSubmissionSchema.body.safeParse({}).success).toBe(false);
  });

  it('requires mergedEventId, as a UUID, for MERGED', () => {
    expect(reviewSubmissionSchema.body.safeParse({ status: 'MERGED' }).success).toBe(false);
    expect(reviewSubmissionSchema.body.safeParse({ status: 'MERGED', mergedEventId: 'nope' }).success).toBe(false);
    expect(reviewSubmissionSchema.body.safeParse({ status: 'MERGED', mergedEventId: ID }).success).toBe(true);
  });

  it('rejects a mergedEventId on any other decision', () => {
    expect(reviewSubmissionSchema.body.safeParse({ status: 'APPROVED', mergedEventId: ID }).success).toBe(false);
    expect(reviewSubmissionSchema.body.safeParse({ status: 'REJECTED', mergedEventId: ID }).success).toBe(false);
  });

  it('bounds the review notes', () => {
    expect(reviewSubmissionSchema.body.safeParse({ status: 'REJECTED', reviewNotes: 'x'.repeat(2000) }).success).toBe(true);
    expect(reviewSubmissionSchema.body.safeParse({ status: 'REJECTED', reviewNotes: 'x'.repeat(2001) }).success).toBe(false);
  });
});
