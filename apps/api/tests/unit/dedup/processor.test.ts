import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/db/client', () => ({
  db: { transaction: vi.fn(), update: vi.fn(), select: vi.fn() },
}));
vi.mock('../../../src/dedup/lock', () => ({ acquireDedupLock: vi.fn() }));
vi.mock('../../../src/dedup/candidate-finder', () => ({ findCandidates: vi.fn() }));
vi.mock('../../../src/dedup/merger', () => ({
  mergeIntoEvent: vi.fn(),
  createCanonicalEvent: vi.fn(),
}));
vi.mock('../../../src/dedup/venue-matcher', () => ({ resolveVenue: vi.fn() }));

import { db } from '../../../src/db/client';
import { eventMatchCandidates } from '../../../src/db/schema/dedup';
import { incomingEvents } from '../../../src/db/schema/event-sources';
import { findCandidates } from '../../../src/dedup/candidate-finder';
import { DEFAULT_DEDUP_SETTINGS } from '../../../src/dedup/config';
import { createCanonicalEvent, mergeIntoEvent } from '../../../src/dedup/merger';
import { processIncomingEvent, processPendingBatch } from '../../../src/dedup/processor';
import type { CandidateEvent, DedupSettings } from '../../../src/dedup/types';
import { resolveVenue } from '../../../src/dedup/venue-matcher';
import {
  createFakeTx,
  fakeChain,
  insertsInto,
  stepArg,
  updatesOf,
} from '../../helpers/fake-db';
import type { RecordedStep } from '../../helpers/fake-db';

const AUTO_ON: DedupSettings = { ...DEFAULT_DEDUP_SETTINGS, autoMergeEnabled: true };

const TM_RAW = {
  id: 'tm-1',
  name: 'Knock2 Live at Brooklyn Mirage',
  url: 'https://www.ticketmaster.com/event/1',
  dates: { start: { dateTime: '2024-10-17T02:00:00Z' } },
  _embedded: {
    venues: [{ id: 'tm-venue', name: 'Brooklyn Mirage', city: { name: 'Brooklyn' }, state: { stateCode: 'NY' } }],
    attractions: [{ name: 'Knock2' }],
  },
};

function stagedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inc-1',
    sourceType: 'TICKETMASTER',
    externalId: 'tm-1',
    rawData: TM_RAW,
    status: 'PENDING',
    ...overrides,
  };
}

function candidate(overrides: Partial<CandidateEvent> = {}): CandidateEvent {
  return {
    eventId: 'evt-9',
    title: 'Knock2 Live at Brooklyn Mirage',
    startsAt: new Date('2024-10-17T02:00:00Z'),
    venueId: 'v-1',
    venueName: 'Brooklyn Mirage',
    venueTicketmasterId: null,
    venueSeatgeekId: null,
    artistNames: ['Knock2'],
    sourceTypes: ['SEATGEEK'],
    ...overrides,
  };
}

function runInTransaction(results: unknown[]) {
  const fake = createFakeTx(results);
  vi.mocked(db.transaction).mockImplementation(((cb: (tx: never) => Promise<unknown>) =>
    cb(fake.tx)) as never);
  return fake;
}

describe('processIncomingEvent', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveVenue).mockResolvedValue('v-1');
    vi.mocked(findCandidates).mockResolvedValue([]);
    vi.mocked(createCanonicalEvent).mockResolvedValue('evt-new');
  });

  it('skips rows that are no longer PENDING', async () => {
    runInTransaction([[stagedRow({ status: 'PROCESSED' })]]);

    const result = await processIncomingEvent('inc-1', DEFAULT_DEDUP_SETTINGS);

    expect(result.status).toBe('SKIPPED');
    expect(mergeIntoEvent).not.toHaveBeenCalled();
    expect(createCanonicalEvent).not.toHaveBeenCalled();
  });

  it('takes the external-ID fast path: refreshes the known event and skips scoring', async () => {
    const { tx, ops } = runInTransaction([[stagedRow()], [{ eventId: 'evt-1' }]]);

    const result = await processIncomingEvent('inc-1', DEFAULT_DEDUP_SETTINGS);

    expect(result).toMatchObject({
      status: 'PROCESSED',
      decision: 'AUTO_MERGE',
      reason: 'EXTERNAL_ID_MATCH',
      matchedEventId: 'evt-1',
      score: null,
    });
    expect(findCandidates).not.toHaveBeenCalled();
    expect(vi.mocked(mergeIntoEvent).mock.calls[0]?.[0]).toBe(tx);
    expect(mergeIntoEvent).toHaveBeenCalledWith(
      expect.anything(),
      'evt-1',
      expect.objectContaining({ title: 'Knock2 Live at Brooklyn Mirage' }),
      { sourceType: 'TICKETMASTER', externalId: 'tm-1', rawData: TM_RAW },
      'v-1',
    );
    const [update] = updatesOf(ops, incomingEvents);
    expect(stepArg(update!, 'set')).toMatchObject({ status: 'PROCESSED', matchedEventId: 'evt-1' });
  });

  it('does not queue a second candidate for a listing that is already awaiting review', async () => {
    const { ops } = runInTransaction([[stagedRow()], [], [{ score: 0.8 }]]);

    const result = await processIncomingEvent('inc-1', DEFAULT_DEDUP_SETTINGS);

    expect(result).toMatchObject({
      status: 'PROCESSED',
      decision: 'REVIEW',
      reason: 'ALREADY_QUEUED',
      matchedEventId: null,
      score: 0.8,
    });
    expect(findCandidates).not.toHaveBeenCalled();
    expect(insertsInto(ops, eventMatchCandidates)).toHaveLength(0);
  });

  it('creates a new canonical event when there are no candidates', async () => {
    runInTransaction([[stagedRow()], []]);

    const result = await processIncomingEvent('inc-1', DEFAULT_DEDUP_SETTINGS);

    expect(result).toMatchObject({
      status: 'PROCESSED',
      decision: 'NO_MATCH',
      reason: 'NO_CANDIDATES',
      matchedEventId: 'evt-new',
    });
    expect(createCanonicalEvent).toHaveBeenCalledOnce();
  });

  it('in the default REVIEW_ONLY mode queues even a perfect match for admin review', async () => {
    vi.mocked(findCandidates).mockResolvedValue([candidate()]);
    const { ops } = runInTransaction([[stagedRow()], []]);

    const result = await processIncomingEvent('inc-1', DEFAULT_DEDUP_SETTINGS);

    expect(result).toMatchObject({
      decision: 'REVIEW',
      reason: 'REVIEW_ONLY_MODE',
      matchedEventId: null,
    });
    expect(result.score).toBeGreaterThan(0.9);
    expect(mergeIntoEvent).not.toHaveBeenCalled();
    expect(createCanonicalEvent).not.toHaveBeenCalled();

    const [queued] = insertsInto(ops, eventMatchCandidates);
    expect(stepArg(queued!, 'values')).toMatchObject({
      incomingEventId: 'inc-1',
      candidateEventId: 'evt-9',
      incomingTitle: 'Knock2 Live at Brooklyn Mirage',
      venueScore: 1,
      matchDetails: expect.objectContaining({ reason: 'REVIEW_ONLY_MODE', incomingSource: 'TICKETMASTER' }),
    });
  });

  it('auto-merges a strong match once auto-merge is enabled', async () => {
    vi.mocked(findCandidates).mockResolvedValue([candidate()]);
    runInTransaction([[stagedRow()], []]);

    const result = await processIncomingEvent('inc-1', AUTO_ON);

    expect(result).toMatchObject({ decision: 'AUTO_MERGE', reason: 'SCORE', matchedEventId: 'evt-9' });
    expect(mergeIntoEvent).toHaveBeenCalledWith(
      expect.anything(),
      'evt-9',
      expect.anything(),
      expect.objectContaining({ sourceType: 'TICKETMASTER' }),
      'v-1',
    );
  });

  it('routes an adjacent-night listing from the same provider to review even with auto-merge on', async () => {
    vi.mocked(findCandidates).mockResolvedValue([
      candidate({ startsAt: new Date('2024-10-18T02:00:00Z'), sourceTypes: ['TICKETMASTER'] }),
    ]);
    runInTransaction([[stagedRow()], []]);

    const result = await processIncomingEvent('inc-1', AUTO_ON);

    expect(result).toMatchObject({ decision: 'REVIEW', reason: 'ADJACENT_DATE_GUARD' });
    expect(mergeIntoEvent).not.toHaveBeenCalled();
  });

  it('creates a new event when the best candidate is below the review threshold', async () => {
    vi.mocked(findCandidates).mockResolvedValue([
      candidate({
        title: 'Tiesto',
        venueName: 'Echostage',
        startsAt: new Date('2024-10-17T05:00:00Z'),
        artistNames: ['Tiesto'],
      }),
    ]);
    runInTransaction([[stagedRow()], []]);

    const result = await processIncomingEvent('inc-1', AUTO_ON);

    expect(result).toMatchObject({ decision: 'NO_MATCH', reason: 'BELOW_REVIEW_THRESHOLD' });
    expect(createCanonicalEvent).toHaveBeenCalledOnce();
  });

  it('marks the staging row FAILED (after rollback) when the event is invalid', async () => {
    runInTransaction([[stagedRow({ rawData: {}, externalId: null })]]);
    const steps: RecordedStep[] = [];
    vi.mocked(db.update).mockReturnValue(fakeChain([], steps) as never);

    const result = await processIncomingEvent('inc-1', DEFAULT_DEDUP_SETTINGS);

    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/Invalid incoming event: missing title/);
    expect(steps.find((s) => s.name === 'set')?.args[0]).toMatchObject({
      status: 'FAILED',
      error: expect.stringMatching(/missing title/),
    });
  });

  it('fails cleanly for a source type that has no extractor', async () => {
    runInTransaction([[stagedRow({ sourceType: 'SPOTIFY', externalId: null })]]);
    vi.mocked(db.update).mockReturnValue(fakeChain([]) as never);

    const result = await processIncomingEvent('inc-1', DEFAULT_DEDUP_SETTINGS);

    expect(result.status).toBe('FAILED');
    expect(result.error).toMatch(/No event extractor/);
  });

  it('still reports FAILED when recording the failure itself throws', async () => {
    runInTransaction([[stagedRow({ rawData: {}, externalId: null })]]);
    vi.mocked(db.update).mockImplementation(() => {
      throw new Error('db down');
    });

    const result = await processIncomingEvent('inc-1', DEFAULT_DEDUP_SETTINGS);

    expect(result.status).toBe('FAILED');
  });
});

describe('processPendingBatch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('processes pending rows one at a time and tallies the outcomes', async () => {
    vi.mocked(db.select).mockReturnValue(fakeChain([{ id: 'a' }, { id: 'b' }, { id: 'c' }]) as never);
    vi.mocked(db.update).mockReturnValue(fakeChain([]) as never);
    vi.mocked(db.transaction)
      .mockResolvedValueOnce({ incomingId: 'a', status: 'PROCESSED' } as never)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ incomingId: 'c', status: 'SKIPPED' } as never);

    await expect(processPendingBatch(10)).resolves.toEqual({ processed: 1, failed: 1, skipped: 1 });
    expect(db.transaction).toHaveBeenCalledTimes(3);
  });

  it('returns zeros when nothing is pending', async () => {
    vi.mocked(db.select).mockReturnValue(fakeChain([]) as never);

    await expect(processPendingBatch()).resolves.toEqual({ processed: 0, failed: 0, skipped: 0 });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
