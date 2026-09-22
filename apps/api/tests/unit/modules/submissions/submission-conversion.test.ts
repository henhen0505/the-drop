import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../src/dedup/processor', () => ({ processInTransaction: vi.fn() }));
vi.mock('../../../../src/dedup/merger', () => ({ mergeIntoEvent: vi.fn() }));

import { incomingEvents } from '../../../../src/db/schema/event-sources';
import { mergeIntoEvent } from '../../../../src/dedup/merger';
import { processInTransaction } from '../../../../src/dedup/processor';
import {
  convertSubmission,
  mergeSubmissionIntoEvent,
} from '../../../../src/modules/submissions/submission-conversion';
import type { SubmissionRow } from '../../../../src/modules/submissions/submission-view';
import { createFakeTx, insertsInto, stepArg } from '../../../helpers/fake-db';

const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111';
const VENUE_ID = '22222222-2222-4222-8222-222222222222';
const EVENT_ID = '33333333-3333-4333-8333-333333333333';

function submission(overrides: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    id: SUBMISSION_ID,
    submitterId: 'user-1',
    eventTitle: 'Underground Warehouse Rave',
    eventStartsAt: new Date('2026-11-16T03:00:00.000Z'),
    venueId: null,
    venueNameRaw: 'The Lot',
    venueAddressRaw: '12 Some St',
    artistNames: ['DJ Shadow', 'Bonobo'],
    description: 'All night.',
    posterImageUrl: 'https://example.com/poster.jpg',
    ticketUrl: 'https://example.com/tickets',
    sourceUrl: 'https://instagram.com/p/abc',
    ageRestriction: '21+',
    status: 'PENDING',
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    mergedEventId: null,
    createdAt: new Date('2026-09-20T00:00:00Z'),
    updatedAt: new Date('2026-09-20T00:00:00Z'),
    ...overrides,
  };
}

const PROCESSED = {
  incomingId: 'inc-1',
  status: 'PROCESSED' as const,
  decision: 'NO_MATCH' as const,
  reason: 'NO_CANDIDATES' as const,
  matchedEventId: EVENT_ID,
  score: null,
};

describe('convertSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(processInTransaction).mockResolvedValue(PROCESSED);
  });

  it('stages the submission as a COMMUNITY record keyed by the submission id', async () => {
    const { tx, ops } = createFakeTx([[{ id: 'inc-1' }]]);

    await convertSubmission(tx, submission());

    const [insert] = insertsInto(ops, incomingEvents);
    expect(stepArg(insert!, 'values')).toEqual({
      sourceType: 'COMMUNITY',
      externalId: SUBMISSION_ID,
      status: 'PENDING',
      rawData: {
        title: 'Underground Warehouse Rave',
        startsAt: '2026-11-16T03:00:00.000Z',
        venueName: 'The Lot',
        venueCity: null,
        venueState: null,
        artistNames: ['DJ Shadow', 'Bonobo'],
        description: 'All night.',
        imageUrl: 'https://example.com/poster.jpg',
        ticketUrl: 'https://example.com/tickets',
        sourceUrl: 'https://instagram.com/p/abc',
        ageRestriction: '21+',
      },
    });
  });

  it('uses the chosen venue\'s name, city and state instead of the free-text fields', async () => {
    const { tx, ops } = createFakeTx([
      [{ name: 'Brooklyn Mirage', city: 'Brooklyn', state: 'NY' }],
      [{ id: 'inc-1' }],
    ]);

    await convertSubmission(tx, submission({ venueId: VENUE_ID, venueNameRaw: null }));

    const [insert] = insertsInto(ops, incomingEvents);
    expect(stepArg(insert!, 'values')).toMatchObject({
      rawData: { venueName: 'Brooklyn Mirage', venueCity: 'Brooklyn', venueState: 'NY' },
    });
  });

  it('does not look up a venue when the submitter gave only free text', async () => {
    const { tx, ops } = createFakeTx([[{ id: 'inc-1' }]]);

    await convertSubmission(tx, submission());

    expect(ops.filter((op) => op.root === 'select')).toHaveLength(0);
  });

  it('runs the staged row through the real dedup processor in the same transaction and returns its result', async () => {
    const { tx } = createFakeTx([[{ id: 'inc-1' }]]);

    const result = await convertSubmission(tx, submission());

    expect(vi.mocked(processInTransaction).mock.calls[0]?.[0]).toBe(tx);
    expect(processInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'inc-1',
      expect.objectContaining({ autoMergeEnabled: false }),
    );
    expect(result).toEqual(PROCESSED);
  });

  it('passes a review-band outcome straight through (no event yet, queued for an admin)', async () => {
    const queued = { ...PROCESSED, decision: 'REVIEW' as const, reason: 'REVIEW_ONLY_MODE' as const, matchedEventId: null };
    vi.mocked(processInTransaction).mockResolvedValue(queued);
    const { tx } = createFakeTx([[{ id: 'inc-1' }]]);

    await expect(convertSubmission(tx, submission())).resolves.toEqual(queued);
  });

  it('throws when the pipeline did not process the row, so the caller rolls back', async () => {
    vi.mocked(processInTransaction).mockResolvedValue({ ...PROCESSED, status: 'SKIPPED', decision: null, matchedEventId: null });
    const { tx } = createFakeTx([[{ id: 'inc-1' }]]);

    await expect(convertSubmission(tx, submission())).rejects.toThrow(/was not processed/);
  });

  it('throws when the staging insert returns nothing', async () => {
    const { tx } = createFakeTx([[]]);

    await expect(convertSubmission(tx, submission())).rejects.toThrow(/Failed to stage/);
    expect(processInTransaction).not.toHaveBeenCalled();
  });
});

describe('mergeSubmissionIntoEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges a normalized COMMUNITY record into the chosen event, tagged with the submission id', async () => {
    const { tx } = createFakeTx();

    await mergeSubmissionIntoEvent(tx, submission({ venueId: null }), EVENT_ID);

    const call = vi.mocked(mergeIntoEvent).mock.calls[0];
    expect(call?.[0]).toBe(tx);
    expect(call?.[1]).toBe(EVENT_ID);
    expect(call?.[2]).toMatchObject({
      title: 'Underground Warehouse Rave',
      startsAt: '2026-11-16T03:00:00.000Z',
      artistNames: ['DJ Shadow', 'Bonobo'],
      ticketUrl: 'https://example.com/tickets',
      sourceUrl: 'https://instagram.com/p/abc',
      ageRestriction: '21+',
      externalId: null,
    });
    expect(call?.[3]).toMatchObject({ sourceType: 'COMMUNITY', externalId: SUBMISSION_ID });
    expect(call?.[4]).toBeNull();
  });

  it('passes the chosen venue through as the resolved venue', async () => {
    const { tx } = createFakeTx([[{ name: 'Brooklyn Mirage', city: 'Brooklyn', state: 'NY' }]]);

    await mergeSubmissionIntoEvent(tx, submission({ venueId: VENUE_ID, venueNameRaw: null }), EVENT_ID);

    expect(vi.mocked(mergeIntoEvent).mock.calls[0]?.[4]).toBe(VENUE_ID);
  });
});
