import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

vi.mock('../../../../src/db/client', () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
}));
vi.mock('../../../../src/modules/submissions/submission-conversion', () => ({
  convertSubmission: vi.fn(),
  mergeSubmissionIntoEvent: vi.fn(),
}));

import { config } from '../../../../src/config/index';
import { db } from '../../../../src/db/client';
import { communitySubmissions } from '../../../../src/db/schema/submissions';
import { convertSubmission } from '../../../../src/modules/submissions/submission-conversion';
import {
  AUTO_PUBLISH_NOTE,
  MAX_PENDING_SUBMISSIONS_PER_USER,
  createSubmission,
  listMySubmissions,
} from '../../../../src/modules/submissions/submission.service';
import type { CreateSubmissionInput } from '../../../../src/modules/submissions/submission.validation';
import { ConflictError, ValidationError } from '../../../../src/utils/errors';
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
const USER = { id: 'user-1', role: 'USER' as const };
const PROMOTER = { id: 'promoter-1', role: 'PROMOTER' as const };
const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111';
const VENUE_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = new Date('2026-09-20T12:00:00Z');

const settings = config.submissions as { promoterAutoPublishAfter: number };
const ORIGINAL_THRESHOLD = settings.promoterAutoPublishAfter;

function input(overrides: Partial<CreateSubmissionInput> = {}): CreateSubmissionInput {
  return {
    eventTitle: 'Underground Warehouse Rave',
    eventStartsAt: new Date('2030-11-16T03:00:00Z'),
    venueNameRaw: 'The Lot',
    artistNames: ['DJ Shadow'],
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SUBMISSION_ID,
    submitterId: USER.id,
    eventTitle: 'Underground Warehouse Rave',
    eventStartsAt: new Date('2030-11-16T03:00:00Z'),
    venueId: null,
    venueNameRaw: 'The Lot',
    venueAddressRaw: null,
    artistNames: ['DJ Shadow'],
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
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

let ops: RecordedOp[] = [];

function useDb(results: unknown[]): void {
  ops = installFakeDb(db as never, results).ops;
}

// Call order for a free-text-venue USER submission: pending-count select, then the insert.
describe('createSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settings.promoterAutoPublishAfter = ORIGINAL_THRESHOLD;
  });

  it('stores a submission as PENDING and returns the contract shape', async () => {
    useDb([[{ total: 0 }], [row()]]);

    const result = await createSubmission(USER, input({ description: 'All night.', ageRestriction: '21+' }));

    expect(result).toEqual({ id: SUBMISSION_ID, status: 'PENDING', createdAt: CREATED_AT });
    const [insert] = insertsInto(ops, communitySubmissions);
    expect(stepArg(insert!, 'values')).toEqual({
      submitterId: 'user-1',
      eventTitle: 'Underground Warehouse Rave',
      eventStartsAt: new Date('2030-11-16T03:00:00Z'),
      venueId: null,
      venueNameRaw: 'The Lot',
      venueAddressRaw: null,
      artistNames: ['DJ Shadow'],
      description: 'All night.',
      posterImageUrl: null,
      ticketUrl: null,
      sourceUrl: null,
      ageRestriction: '21+',
    });
    expect(convertSubmission).not.toHaveBeenCalled();
  });

  it('rejects a venueId that does not exist without writing anything', async () => {
    useDb([[]]);

    await expect(createSubmission(USER, input({ venueId: VENUE_ID, venueNameRaw: undefined }))).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(insertsInto(ops, communitySubmissions)).toHaveLength(0);
  });

  it('accepts an existing venue', async () => {
    useDb([[{ id: VENUE_ID }], [{ total: 0 }], [row({ venueId: VENUE_ID, venueNameRaw: null })]]);

    await expect(
      createSubmission(USER, input({ venueId: VENUE_ID, venueNameRaw: undefined })),
    ).resolves.toMatchObject({ status: 'PENDING' });
  });

  it('refuses a new submission once the user has too many awaiting review', async () => {
    useDb([[{ total: MAX_PENDING_SUBMISSIONS_PER_USER }]]);

    await expect(createSubmission(USER, input())).rejects.toBeInstanceOf(ConflictError);
    expect(insertsInto(ops, communitySubmissions)).toHaveLength(0);
    expect(whereOf(ops[0], dialect).params).toEqual(['user-1', 'PENDING']);
  });

  it('allows a submission when one below the pending cap', async () => {
    useDb([[{ total: MAX_PENDING_SUBMISSIONS_PER_USER - 1 }], [row()]]);

    await expect(createSubmission(USER, input())).resolves.toMatchObject({ status: 'PENDING' });
  });

  describe('promoter auto-publish', () => {
    it('never auto-publishes a regular user, and does not even check vetting', async () => {
      useDb([[{ total: 0 }], [row()]]);

      await createSubmission(USER, input());

      expect(ops.filter((op) => op.root === 'select')).toHaveLength(1);
      expect(convertSubmission).not.toHaveBeenCalled();
    });

    it('leaves a promoter\'s submission PENDING until enough of their earlier ones were admin-approved', async () => {
      useDb([[{ total: 0 }], [row({ submitterId: PROMOTER.id })], [{ reviewed: 2 }]]);

      const result = await createSubmission(PROMOTER, input());

      expect(result.status).toBe('PENDING');
      expect(convertSubmission).not.toHaveBeenCalled();
    });

    it('counts only submissions an admin actually reviewed as approved or merged', async () => {
      useDb([[{ total: 0 }], [row({ submitterId: PROMOTER.id })], [{ reviewed: 0 }]]);

      await createSubmission(PROMOTER, input());

      const vetting = whereOf(ops[2], dialect);
      expect(vetting.sql).toContain('"community_submissions"."reviewed_by" is not null');
      expect(vetting.params).toEqual(expect.arrayContaining([PROMOTER.id, 'APPROVED', 'MERGED']));
    });

    it('publishes a vetted promoter\'s submission at once through the dedup pipeline', async () => {
      vi.mocked(convertSubmission).mockResolvedValue({} as never);
      useDb([[{ total: 0 }], [row({ submitterId: PROMOTER.id })], [{ reviewed: 3 }], []]);

      const result = await createSubmission(PROMOTER, input());

      expect(result).toEqual({ id: SUBMISSION_ID, status: 'APPROVED', createdAt: CREATED_AT });
      expect(convertSubmission).toHaveBeenCalledOnce();
      const [update] = updatesOf(ops, communitySubmissions);
      expect(stepArg(update!, 'set')).toMatchObject({ status: 'APPROVED', reviewNotes: AUTO_PUBLISH_NOTE });
      expect((stepArg(update!, 'set') as { reviewedBy?: unknown }).reviewedBy).toBeUndefined();
    });

    it('falls back to PENDING for an admin instead of failing the request when publishing throws', async () => {
      vi.mocked(convertSubmission).mockRejectedValue(new Error('dedup exploded'));
      useDb([[{ total: 0 }], [row({ submitterId: PROMOTER.id })], [{ reviewed: 5 }]]);

      const result = await createSubmission(PROMOTER, input());

      expect(result).toEqual({ id: SUBMISSION_ID, status: 'PENDING', createdAt: CREATED_AT });
      expect(updatesOf(ops, communitySubmissions)).toHaveLength(0);
    });

    it('with a threshold of 0 publishes every promoter submission without a vetting query', async () => {
      settings.promoterAutoPublishAfter = 0;
      vi.mocked(convertSubmission).mockResolvedValue({} as never);
      useDb([[{ total: 0 }], [row({ submitterId: PROMOTER.id })], []]);

      const result = await createSubmission(PROMOTER, input());

      expect(result.status).toBe('APPROVED');
      expect(ops.filter((op) => op.root === 'select')).toHaveLength(1);
    });
  });
});

describe('listMySubmissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists only the user\'s own submissions, newest first, without the reviewer identity', async () => {
    useDb([[row({ reviewedBy: 'admin-9', reviewNotes: 'Looks good' })]]);

    const result = await listMySubmissions('user-1', {});

    const where = whereOf(ops[0], dialect);
    expect(where.sql).toContain('"community_submissions"."submitter_id" =');
    expect(where.params).toEqual(['user-1']);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ id: SUBMISSION_ID, status: 'PENDING', reviewNotes: 'Looks good' });
    expect(result.data[0]).not.toHaveProperty('reviewedBy');
    expect(result.data[0]).not.toHaveProperty('submitterId');
    expect(result.cursor).toBeNull();
  });

  it('filters by status when asked', async () => {
    useDb([[]]);

    await listMySubmissions('user-1', { status: 'REJECTED' });

    expect(whereOf(ops[0], dialect).params).toEqual(['user-1', 'REJECTED']);
  });

  it('pages with a (createdAt, id) cursor, descending', async () => {
    useDb([
      [
        row({ id: SUBMISSION_ID, createdAt: new Date('2026-09-20T12:00:00Z') }),
        row({ id: '99999999-9999-4999-8999-999999999999', createdAt: new Date('2026-09-19T12:00:00Z') }),
      ],
    ]);

    const result = await listMySubmissions('user-1', { limit: 1 });

    expect(result.data).toHaveLength(1);
    expect(decodeCursor(result.cursor!)).toEqual({ createdAt: '2026-09-20T12:00:00.000Z', id: SUBMISSION_ID });
    expect(stepArg(ops[0]!, 'limit')).toBe(2);
  });

  it('resumes strictly before the cursor', async () => {
    useDb([[]]);

    await listMySubmissions('user-1', {
      cursor: encodeCursor({ createdAt: '2026-09-20T12:00:00.000Z', id: SUBMISSION_ID }),
    });

    const where = whereOf(ops[0], dialect);
    expect(where.sql).toContain('("community_submissions"."created_at", "community_submissions"."id") < (');
    expect(where.params).toEqual(expect.arrayContaining(['2026-09-20T12:00:00.000Z', SUBMISSION_ID]));
  });

  it('rejects a malformed cursor before querying', async () => {
    useDb([[]]);

    await expect(listMySubmissions('user-1', { cursor: 'bogus' })).rejects.toBeInstanceOf(ValidationError);
    expect(db.select).not.toHaveBeenCalled();
  });
});
