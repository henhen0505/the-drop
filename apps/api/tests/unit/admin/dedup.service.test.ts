import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db/client', () => ({ db: { transaction: vi.fn(), select: vi.fn() } }));
vi.mock('../../../src/dedup/lock', () => ({ acquireDedupLock: vi.fn() }));
vi.mock('../../../src/dedup/merger', () => ({
  mergeIntoEvent: vi.fn(),
  createCanonicalEvent: vi.fn(),
}));
vi.mock('../../../src/dedup/venue-matcher', () => ({ resolveVenue: vi.fn() }));

import { db } from '../../../src/db/client';
import { adminAuditLog } from '../../../src/db/schema/admin';
import { eventMatchCandidates } from '../../../src/db/schema/dedup';
import { incomingEvents } from '../../../src/db/schema/event-sources';
import { createCanonicalEvent, mergeIntoEvent } from '../../../src/dedup/merger';
import { resolveVenue } from '../../../src/dedup/venue-matcher';
import { listCandidates, resolveCandidate } from '../../../src/modules/admin/dedup.service';
import { ConflictError, NotFoundError } from '../../../src/utils/errors';
import { decodeCursor } from '../../../src/utils/pagination';
import { createFakeTx, fakeChain, insertsInto, stepArg, updatesOf } from '../../helpers/fake-db';

const CANDIDATE_ID = '550e8400-e29b-41d4-a716-446655440000';

const NORMALIZED = {
  title: 'Knock2 -- NYC',
  startsAt: '2024-10-17T02:00:00Z',
  externalId: 'sg-1',
  artistNames: ['Knock2'],
};

function pendingCandidate(overrides: Record<string, unknown> = {}) {
  return {
    id: CANDIDATE_ID,
    status: 'PENDING_REVIEW',
    incomingEventId: 'inc-1',
    candidateEventId: 'evt-cand',
    score: 0.82,
    ...overrides,
  };
}

function stagedIncoming(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    sourceType: 'SEATGEEK',
    externalId: 'sg-1',
    rawData: { id: 1 },
    normalizedData: NORMALIZED,
    ...overrides,
  };
}

function runInTransaction(results: unknown[]) {
  const fake = createFakeTx(results);
  vi.mocked(db.transaction).mockImplementation(((cb: (tx: never) => Promise<unknown>) =>
    cb(fake.tx)) as never);
  return fake;
}

describe('resolveCandidate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveVenue).mockResolvedValue('v-1');
    vi.mocked(createCanonicalEvent).mockResolvedValue('evt-new');
  });

  it('merge: folds the incoming record into the candidate event and marks it MANUAL_MERGED', async () => {
    const { ops } = runInTransaction([[pendingCandidate()], [stagedIncoming()]]);

    const result = await resolveCandidate(CANDIDATE_ID, 'merge', 'admin-1');

    expect(mergeIntoEvent).toHaveBeenCalledWith(
      expect.anything(),
      'evt-cand',
      NORMALIZED,
      { sourceType: 'SEATGEEK', externalId: 'sg-1', rawData: { id: 1 } },
      'v-1',
    );
    expect(createCanonicalEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: CANDIDATE_ID,
      status: 'MANUAL_MERGED',
      resultEventId: 'evt-cand',
      reviewedBy: 'admin-1',
    });

    expect(stepArg(updatesOf(ops, incomingEvents)[0]!, 'set')).toEqual({ matchedEventId: 'evt-cand' });
    expect(stepArg(updatesOf(ops, eventMatchCandidates)[0]!, 'set')).toMatchObject({
      status: 'MANUAL_MERGED',
      reviewedBy: 'admin-1',
    });
    expect(stepArg(insertsInto(ops, adminAuditLog)[0]!, 'values')).toMatchObject({
      adminId: 'admin-1',
      action: 'dedup_merge',
      targetType: 'event_match_candidate',
      targetId: CANDIDATE_ID,
      details: expect.objectContaining({ resultEventId: 'evt-cand', score: 0.82 }),
    });
  });

  it('reject: creates a new canonical event from the incoming record and marks it REJECTED', async () => {
    const { ops } = runInTransaction([[pendingCandidate()], [stagedIncoming()]]);

    const result = await resolveCandidate(CANDIDATE_ID, 'reject', 'admin-1');

    expect(createCanonicalEvent).toHaveBeenCalledOnce();
    expect(mergeIntoEvent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'REJECTED', resultEventId: 'evt-new' });
    expect(stepArg(updatesOf(ops, incomingEvents)[0]!, 'set')).toEqual({ matchedEventId: 'evt-new' });
    expect(stepArg(insertsInto(ops, adminAuditLog)[0]!, 'values')).toMatchObject({
      action: 'dedup_reject',
    });
  });

  it('404s for an unknown candidate', async () => {
    runInTransaction([[]]);
    await expect(resolveCandidate(CANDIDATE_ID, 'merge', 'admin-1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('409s when the candidate was already resolved, without writing anything', async () => {
    const { ops } = runInTransaction([[pendingCandidate({ status: 'MANUAL_MERGED' })]]);

    await expect(resolveCandidate(CANDIDATE_ID, 'merge', 'admin-1')).rejects.toBeInstanceOf(ConflictError);
    expect(mergeIntoEvent).not.toHaveBeenCalled();
    expect(ops.filter((op) => op.root !== 'select')).toHaveLength(0);
  });

  it('409s when the incoming record is gone or was never normalized', async () => {
    runInTransaction([[pendingCandidate({ incomingEventId: null })]]);
    await expect(resolveCandidate(CANDIDATE_ID, 'merge', 'admin-1')).rejects.toBeInstanceOf(ConflictError);

    runInTransaction([[pendingCandidate()], [stagedIncoming({ normalizedData: null })]]);
    await expect(resolveCandidate(CANDIDATE_ID, 'reject', 'admin-1')).rejects.toBeInstanceOf(ConflictError);
    expect(createCanonicalEvent).not.toHaveBeenCalled();
  });
});

describe('listCandidates', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function row(id: string, createdAt: string) {
    return {
      id,
      status: 'PENDING_REVIEW',
      incomingTitle: 'Knock2 -- NYC',
      incomingDate: new Date('2024-10-17T02:00:00Z'),
      incomingVenueName: 'The Brooklyn Mirage',
      incomingArtists: ['Knock2'],
      incomingSource: 'SEATGEEK',
      candidateId: 'evt-cand',
      candidateTitle: 'Knock2 at Brooklyn Mirage',
      candidateStartsAt: new Date('2024-10-17T02:00:00Z'),
      candidateVenueId: 'v-1',
      candidateVenueName: 'Brooklyn Mirage',
      candidateVenueCity: 'Brooklyn',
      score: 0.82,
      venueScore: 1,
      dateScore: 1,
      titleScore: 0.6,
      artistScore: 1,
      matchDetails: { reason: 'REVIEW_ONLY_MODE' },
      createdAt: new Date(createdAt),
    };
  }

  it('shapes rows per the API contract and pages with a cursor', async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(
        fakeChain([row('mc-1', '2024-10-01T00:00:00Z'), row('mc-2', '2024-10-02T00:00:00Z')]) as never,
      )
      .mockReturnValueOnce(fakeChain([{ eventId: 'evt-cand', name: 'Knock2' }]) as never);

    const result = await listCandidates({ limit: 1 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'mc-1',
      status: 'PENDING_REVIEW',
      incoming: {
        title: 'Knock2 -- NYC',
        venueName: 'The Brooklyn Mirage',
        artists: ['Knock2'],
        sourceType: 'SEATGEEK',
      },
      candidate: {
        id: 'evt-cand',
        title: 'Knock2 at Brooklyn Mirage',
        venue: { id: 'v-1', name: 'Brooklyn Mirage', city: 'Brooklyn' },
        artists: ['Knock2'],
      },
      score: 0.82,
      venueScore: 1,
      matchDetails: { reason: 'REVIEW_ONLY_MODE' },
    });
    expect(decodeCursor(result.cursor!)).toEqual({ createdAt: '2024-10-01T00:00:00.000Z', id: 'mc-1' });
  });

  it('returns a null cursor on the last page and skips the artist query when empty', async () => {
    vi.mocked(db.select).mockReturnValueOnce(fakeChain([]) as never);

    await expect(listCandidates({})).resolves.toEqual({ data: [], cursor: null });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed cursor', async () => {
    await expect(listCandidates({ cursor: 'not-a-cursor' })).rejects.toMatchObject({ statusCode: 400 });
  });
});
