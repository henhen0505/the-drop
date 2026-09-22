import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

vi.mock('../../../../src/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}));
vi.mock('../../../../src/dedup/lock', () => ({ acquireDedupLock: vi.fn() }));
vi.mock('../../../../src/modules/submissions/submission-conversion', () => ({
  convertSubmission: vi.fn(),
  mergeSubmissionIntoEvent: vi.fn(),
}));

import { db } from '../../../../src/db/client';
import { adminAuditLog } from '../../../../src/db/schema/admin';
import { communitySubmissions } from '../../../../src/db/schema/submissions';
import { acquireDedupLock } from '../../../../src/dedup/lock';
import {
  listSubmissions,
  reviewSubmission,
} from '../../../../src/modules/admin/submission-review.service';
import {
  convertSubmission,
  mergeSubmissionIntoEvent,
} from '../../../../src/modules/submissions/submission-conversion';
import { ConflictError, NotFoundError, ValidationError } from '../../../../src/utils/errors';
import { decodeCursor, encodeCursor } from '../../../../src/utils/pagination';
import {
  insertsInto,
  installFakeDb,
  stepArg,
  updatesOf,
  whereOf,
  type RecordedOp,
} from '../../../helpers/fake-db';

const dialect = new PgDialect();
const ADMIN = 'admin-1';
const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

function submission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SUBMISSION_ID,
    submitterId: 'user-1',
    eventTitle: 'Underground Warehouse Rave',
    eventStartsAt: new Date('2030-11-16T03:00:00Z'),
    venueId: null,
    venueNameRaw: 'The Lot',
    venueAddressRaw: null,
    artistNames: [],
    description: null,
    posterImageUrl: null,
    ticketUrl: null,
    sourceUrl: null,
    ageRestriction: null,
    status: 'PENDING',
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    mergedEventId: null,
    createdAt: new Date('2026-09-20T12:00:00Z'),
    updatedAt: new Date('2026-09-20T12:00:00Z'),
    ...overrides,
  };
}

let ops: RecordedOp[] = [];

function useDb(results: unknown[]): void {
  ops = installFakeDb(db as never, results).ops;
}

function auditValues(): Record<string, unknown> {
  return stepArg(insertsInto(ops, adminAuditLog)[0]!, 'values') as Record<string, unknown>;
}

function setValues(): Record<string, unknown> {
  return stepArg(updatesOf(ops, communitySubmissions)[0]!, 'set') as Record<string, unknown>;
}

const DEDUP_NEW_EVENT = {
  incomingId: 'inc-1',
  status: 'PROCESSED' as const,
  decision: 'NO_MATCH' as const,
  reason: 'NO_CANDIDATES' as const,
  matchedEventId: EVENT_ID,
  score: null,
};

describe('reviewSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('404s for an unknown submission', async () => {
    useDb([[]]);

    await expect(reviewSubmission(SUBMISSION_ID, ADMIN, { status: 'REJECTED' })).rejects.toBeInstanceOf(NotFoundError);
  });

  it('409s when the submission was already reviewed, changing nothing', async () => {
    useDb([[submission({ status: 'APPROVED' })]]);

    await expect(reviewSubmission(SUBMISSION_ID, ADMIN, { status: 'REJECTED' })).rejects.toBeInstanceOf(ConflictError);
    expect(updatesOf(ops, communitySubmissions)).toHaveLength(0);
    expect(insertsInto(ops, adminAuditLog)).toHaveLength(0);
  });

  it('serializes on the dedup lock before deciding', async () => {
    useDb([[submission()], [submission({ status: 'REJECTED' })], []]);

    await reviewSubmission(SUBMISSION_ID, ADMIN, { status: 'REJECTED' });

    expect(acquireDedupLock).toHaveBeenCalledOnce();
  });

  describe('REJECTED', () => {
    it('records the decision and reviewer without creating anything', async () => {
      useDb([[submission()], [submission({ status: 'REJECTED', reviewNotes: 'Duplicate flyer' })], []]);

      const result = await reviewSubmission(SUBMISSION_ID, ADMIN, { status: 'REJECTED', reviewNotes: 'Duplicate flyer' });

      expect(convertSubmission).not.toHaveBeenCalled();
      expect(mergeSubmissionIntoEvent).not.toHaveBeenCalled();
      expect(setValues()).toMatchObject({
        status: 'REJECTED',
        reviewedBy: ADMIN,
        reviewNotes: 'Duplicate flyer',
        mergedEventId: null,
      });
      expect(setValues().reviewedAt).toBeInstanceOf(Date);
      expect(result).toMatchObject({ status: 'REJECTED', resultEventId: null, dedupDecision: null });
      expect(result).not.toHaveProperty('reviewedBy');
    });

    it('writes an audit entry in the same transaction', async () => {
      useDb([[submission()], [submission({ status: 'REJECTED' })], []]);

      await reviewSubmission(SUBMISSION_ID, ADMIN, { status: 'REJECTED', reviewNotes: 'Spam' });

      expect(auditValues()).toMatchObject({
        adminId: ADMIN,
        action: 'submission_rejected',
        targetType: 'submission',
        targetId: SUBMISSION_ID,
        details: expect.objectContaining({ submitterId: 'user-1', reviewNotes: 'Spam', resultEventId: null }),
      });
    });
  });

  describe('APPROVED', () => {
    it('runs the submission through the dedup pipeline and reports the event it became', async () => {
      vi.mocked(convertSubmission).mockResolvedValue(DEDUP_NEW_EVENT);
      useDb([[submission()], [submission({ status: 'APPROVED' })], []]);

      const result = await reviewSubmission(SUBMISSION_ID, ADMIN, { status: 'APPROVED' });

      expect(convertSubmission).toHaveBeenCalledOnce();
      expect(vi.mocked(convertSubmission).mock.calls[0]?.[1]).toMatchObject({ id: SUBMISSION_ID });
      expect(setValues()).toMatchObject({ status: 'APPROVED', reviewedBy: ADMIN, mergedEventId: null });
      expect(result).toMatchObject({ status: 'APPROVED', resultEventId: EVENT_ID, dedupDecision: 'NO_MATCH' });
      expect(auditValues()).toMatchObject({
        action: 'submission_approved',
        details: expect.objectContaining({
          resultEventId: EVENT_ID,
          dedupDecision: 'NO_MATCH',
          dedupReason: 'NO_CANDIDATES',
        }),
      });
    });

    it('reports no event yet when the dedup pipeline queued it for review', async () => {
      vi.mocked(convertSubmission).mockResolvedValue({
        ...DEDUP_NEW_EVENT,
        decision: 'REVIEW',
        reason: 'REVIEW_ONLY_MODE',
        matchedEventId: null,
        score: 0.8,
      });
      useDb([[submission()], [submission({ status: 'APPROVED' })], []]);

      const result = await reviewSubmission(SUBMISSION_ID, ADMIN, { status: 'APPROVED' });

      expect(result).toMatchObject({ status: 'APPROVED', resultEventId: null, dedupDecision: 'REVIEW' });
    });

    it('leaves the submission untouched when the pipeline fails (the whole transaction rolls back)', async () => {
      vi.mocked(convertSubmission).mockRejectedValue(new Error('pipeline failed'));
      useDb([[submission()]]);

      await expect(reviewSubmission(SUBMISSION_ID, ADMIN, { status: 'APPROVED' })).rejects.toThrow('pipeline failed');
      expect(updatesOf(ops, communitySubmissions)).toHaveLength(0);
      expect(insertsInto(ops, adminAuditLog)).toHaveLength(0);
    });
  });

  describe('MERGED', () => {
    it('folds the submission into the chosen event and records which one', async () => {
      useDb([[submission()], [{ id: EVENT_ID }], [submission({ status: 'MERGED', mergedEventId: EVENT_ID })], []]);

      const result = await reviewSubmission(SUBMISSION_ID, ADMIN, { status: 'MERGED', mergedEventId: EVENT_ID });

      expect(mergeSubmissionIntoEvent).toHaveBeenCalledOnce();
      const call = vi.mocked(mergeSubmissionIntoEvent).mock.calls[0];
      expect(call?.[1]).toMatchObject({ id: SUBMISSION_ID });
      expect(call?.[2]).toBe(EVENT_ID);
      expect(convertSubmission).not.toHaveBeenCalled();
      expect(setValues()).toMatchObject({ status: 'MERGED', mergedEventId: EVENT_ID });
      expect(result).toMatchObject({
        status: 'MERGED',
        mergedEventId: EVENT_ID,
        resultEventId: EVENT_ID,
        dedupDecision: null,
      });
      expect(auditValues()).toMatchObject({ action: 'submission_merged' });
    });

    it('404s, merging nothing, when the target event does not exist', async () => {
      useDb([[submission()], []]);

      await expect(
        reviewSubmission(SUBMISSION_ID, ADMIN, { status: 'MERGED', mergedEventId: EVENT_ID }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(mergeSubmissionIntoEvent).not.toHaveBeenCalled();
      expect(updatesOf(ops, communitySubmissions)).toHaveLength(0);
    });
  });
});

describe('listSubmissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function listRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      submission: submission(),
      submitterId: 'user-1',
      submitterName: 'Raver',
      submitterRole: 'PROMOTER',
      venueId: null,
      venueName: null,
      venueCity: null,
      venueState: null,
      ...overrides,
    };
  }

  it('defaults to the PENDING queue, oldest first', async () => {
    useDb([[]]);

    await listSubmissions({});

    const where = whereOf(ops[0], dialect);
    expect(where.sql).toContain('"community_submissions"."status" =');
    expect(where.params).toEqual(['PENDING']);
    const orderBy = ops[0]?.steps.find((s) => s.name === 'orderBy');
    expect(orderBy).toBeDefined();
  });

  it('includes the submitter and the chosen venue', async () => {
    useDb([
      [
        listRow({
          venueId: 'v1',
          venueName: 'Brooklyn Mirage',
          venueCity: 'Brooklyn',
          venueState: 'NY',
          submission: submission({ venueId: 'v1' }),
        }),
      ],
    ]);

    const result = await listSubmissions({ status: 'PENDING' });

    expect(result.data[0]).toMatchObject({
      id: SUBMISSION_ID,
      eventTitle: 'Underground Warehouse Rave',
      submitter: { id: 'user-1', displayName: 'Raver', role: 'PROMOTER' },
      venue: { id: 'v1', name: 'Brooklyn Mirage', city: 'Brooklyn', state: 'NY' },
    });
  });

  it('gives a free-text-venue submission a null venue', async () => {
    useDb([[listRow()]]);

    const result = await listSubmissions({});

    expect(result.data[0]?.venue).toBeNull();
    expect(result.data[0]?.venueNameRaw).toBe('The Lot');
  });

  it('filters by any status', async () => {
    useDb([[]]);

    await listSubmissions({ status: 'MERGED' });

    expect(whereOf(ops[0], dialect).params).toEqual(['MERGED']);
  });

  it('pages with a (createdAt, id) cursor ascending', async () => {
    useDb([
      [
        listRow({ submission: submission({ id: SUBMISSION_ID, createdAt: new Date('2026-09-20T12:00:00Z') }) }),
        listRow({ submission: submission({ id: '99999999-9999-4999-8999-999999999999' }) }),
      ],
    ]);

    const result = await listSubmissions({ limit: 1 });

    expect(result.data).toHaveLength(1);
    expect(decodeCursor(result.cursor!)).toEqual({ createdAt: '2026-09-20T12:00:00.000Z', id: SUBMISSION_ID });
  });

  it('resumes strictly after the cursor and rejects a malformed one', async () => {
    useDb([[]]);
    await listSubmissions({ cursor: encodeCursor({ createdAt: '2026-09-20T12:00:00.000Z', id: SUBMISSION_ID }) });
    expect(whereOf(ops[0], dialect).sql).toContain(
      '("community_submissions"."created_at", "community_submissions"."id") > (',
    );

    await expect(listSubmissions({ cursor: 'bogus' })).rejects.toBeInstanceOf(ValidationError);
  });
});
