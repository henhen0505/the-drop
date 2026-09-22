import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/dedup/artist-linker', () => ({ linkArtistsToEvent: vi.fn() }));

import { eventExternalIds, eventSources } from '../../../src/db/schema/event-sources';
import { events } from '../../../src/db/schema/events';
import { ticketLinks } from '../../../src/db/schema/ticket-links';
import { linkArtistsToEvent } from '../../../src/dedup/artist-linker';
import { createCanonicalEvent, mergeIntoEvent } from '../../../src/dedup/merger';
import type { NormalizedEvent } from '../../../src/dedup/types';
import { createFakeTx, insertsInto, stepArg, updatesOf } from '../../helpers/fake-db';
import type { RecordedOp } from '../../helpers/fake-db';

function incomingEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    title: 'Knock2 Live at Brooklyn Mirage',
    startsAt: '2024-10-17T02:00:00Z',
    endsAt: null,
    venueName: 'Brooklyn Mirage',
    venueCity: 'Brooklyn',
    venueState: 'NY',
    venueTicketmasterId: null,
    venueSeatgeekId: null,
    artistNames: ['Knock2'],
    description: 'Bass all night.',
    imageUrl: 'https://img/x.jpg',
    ticketUrl: 'https://www.ticketmaster.com/event/1',
    priceMinCents: 4500,
    priceMaxCents: 9000,
    sourceUrl: 'https://www.ticketmaster.com/event/1',
    externalId: 'tm-1',
    ...overrides,
  };
}

const TM_SOURCE = { sourceType: 'TICKETMASTER' as const, externalId: 'tm-1', rawData: { id: 'tm-1' } };

function hasStep(op: RecordedOp, name: string): boolean {
  return op.steps.some((step) => step.name === name);
}

describe('createCanonicalEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the event, its source records, external ID and ticket link, then links artists', async () => {
    const { tx, ops } = createFakeTx([[], [{ id: 'evt-new' }]]);

    const id = await createCanonicalEvent(tx, incomingEvent(), TM_SOURCE, 'v-1');

    expect(id).toBe('evt-new');

    const [created] = insertsInto(ops, events);
    expect(stepArg(created!, 'values')).toMatchObject({
      title: 'Knock2 Live at Brooklyn Mirage',
      slug: 'knock2-live-at-brooklyn-mirage-2024-10-17',
      venueId: 'v-1',
      primarySource: 'TICKETMASTER',
      confidence: 'TRUSTED_SOURCE',
      fieldProvenance: expect.objectContaining({ title: 'TICKETMASTER', venueId: 'TICKETMASTER' }),
    });

    const [source] = insertsInto(ops, eventSources);
    expect(hasStep(source!, 'onConflictDoUpdate')).toBe(true);
    expect(insertsInto(ops, eventExternalIds)).toHaveLength(1);

    const [link] = insertsInto(ops, ticketLinks);
    expect(stepArg(link!, 'values')).toMatchObject({
      eventId: 'evt-new',
      vendorName: 'Ticketmaster',
      vendorClassification: 'OFFICIAL',
      priceMinCents: 4500,
      sourceType: 'TICKETMASTER',
    });
    expect(ops.some((op) => op.root === 'delete' && op.steps[0]?.args[0] === ticketLinks)).toBe(true);
    expect(updatesOf(ops, events)).toHaveLength(1);

    expect(vi.mocked(linkArtistsToEvent).mock.calls[0]?.[0]).toBe(tx);
    expect(linkArtistsToEvent).toHaveBeenCalledWith(
      expect.anything(),
      'evt-new',
      ['Knock2'],
      'TICKETMASTER',
    );
  });

  it('appends a random suffix when the slug is already taken', async () => {
    const { tx, ops } = createFakeTx([[{ id: 'other' }], [{ id: 'evt-new' }]]);

    await createCanonicalEvent(tx, incomingEvent(), TM_SOURCE, null);

    const [created] = insertsInto(ops, events);
    const { slug } = stepArg(created!, 'values') as { slug: string };
    expect(slug).not.toBe('knock2-live-at-brooklyn-mirage-2024-10-17');
    expect(slug.startsWith('knock2-live-at-brooklyn-mirage-2024-10-17-')).toBe(true);
  });

  it('classifies SeatGeek links as verified resale', async () => {
    const { tx, ops } = createFakeTx([[], [{ id: 'evt-new' }]]);

    await createCanonicalEvent(
      tx,
      incomingEvent({ externalId: 'sg-1' }),
      { sourceType: 'SEATGEEK', externalId: 'sg-1', rawData: {} },
      null,
    );

    const [link] = insertsInto(ops, ticketLinks);
    expect(stepArg(link!, 'values')).toMatchObject({
      vendorName: 'SeatGeek',
      vendorClassification: 'VERIFIED_RESALE',
    });
  });

  it('skips external-ID and ticket-link writes for a community event with neither', async () => {
    const { tx, ops } = createFakeTx([[], [{ id: 'evt-new' }]]);

    await createCanonicalEvent(
      tx,
      incomingEvent({ ticketUrl: null, externalId: null }),
      { sourceType: 'COMMUNITY', externalId: null, rawData: {} },
      null,
    );

    const [source] = insertsInto(ops, eventSources);
    expect(hasStep(source!, 'onConflictDoUpdate')).toBe(false);
    expect(insertsInto(ops, eventExternalIds)).toHaveLength(0);
    expect(insertsInto(ops, ticketLinks)).toHaveLength(0);
    const [created] = insertsInto(ops, events);
    expect(stepArg(created!, 'values')).toMatchObject({ confidence: 'COMMUNITY' });
  });
});

describe('mergeIntoEvent', () => {
  const existingRow = {
    id: 'evt-1',
    title: 'Knock2 at Brooklyn Mirage',
    description: null,
    imageUrl: null,
    startsAt: new Date('2024-10-17T02:00:00Z'),
    endsAt: null,
    venueId: 'v-1',
    confidence: 'TRUSTED_SOURCE',
    primarySource: 'TICKETMASTER',
    fieldProvenance: { title: 'TICKETMASTER' },
    status: 'PUBLISHED',
  };
  const SG_SOURCE = { sourceType: 'SEATGEEK' as const, externalId: 'sg-1', rawData: { id: 1 } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies field priority: fills gaps, leaves higher-ranked fields, records provenance', async () => {
    const { tx, ops } = createFakeTx([[existingRow]]);

    await mergeIntoEvent(
      tx,
      'evt-1',
      incomingEvent({ title: 'KNOCK2 -- NYC', externalId: 'sg-1', ticketUrl: 'https://seatgeek.com/x' }),
      SG_SOURCE,
      'v-1',
    );

    const [update] = updatesOf(ops, events);
    const set = stepArg(update!, 'set') as Record<string, unknown>;
    expect(set.title).toBeUndefined();
    expect(set).toMatchObject({
      description: 'Bass all night.',
      imageUrl: 'https://img/x.jpg',
      fieldProvenance: { title: 'TICKETMASTER', description: 'SEATGEEK', imageUrl: 'SEATGEEK' },
    });
    expect(set.lastVerifiedAt).toBeInstanceOf(Date);
  });

  it('upserts the source record and external ID, adds artists, and replaces only this source\'s links', async () => {
    const { tx, ops } = createFakeTx([[existingRow]]);

    await mergeIntoEvent(
      tx,
      'evt-1',
      incomingEvent({ externalId: 'sg-1', ticketUrl: 'https://seatgeek.com/x' }),
      SG_SOURCE,
      'v-1',
    );

    const [source] = insertsInto(ops, eventSources);
    expect(hasStep(source!, 'onConflictDoUpdate')).toBe(true);
    expect(insertsInto(ops, eventExternalIds)).toHaveLength(1);
    expect(linkArtistsToEvent).toHaveBeenCalledWith(
      expect.anything(),
      'evt-1',
      ['Knock2'],
      'SEATGEEK',
    );

    const deleteIndex = ops.findIndex((op) => op.root === 'delete');
    const insertIndex = ops.findIndex(
      (op) => op.root === 'insert' && op.steps[0]?.args[0] === ticketLinks,
    );
    expect(deleteIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeLessThan(insertIndex);
  });

  it('rejects when the target event does not exist', async () => {
    const { tx } = createFakeTx([[]]);

    await expect(mergeIntoEvent(tx, 'missing', incomingEvent(), TM_SOURCE, null)).rejects.toThrow(
      /missing event missing/,
    );
  });
});

describe('age restriction (a curated field only community submissions provide)', () => {
  const baseRow = {
    id: 'evt-1',
    title: 'Knock2 at Brooklyn Mirage',
    description: null,
    imageUrl: null,
    startsAt: new Date('2024-10-17T02:00:00Z'),
    endsAt: null,
    venueId: 'v-1',
    confidence: 'TRUSTED_SOURCE',
    primarySource: 'TICKETMASTER',
    fieldProvenance: {},
    status: 'PUBLISHED',
    ageRestriction: null,
  };
  const COMMUNITY_SOURCE = { sourceType: 'COMMUNITY' as const, externalId: 'sub-1', rawData: {} };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is stored on a newly created event', async () => {
    const { tx, ops } = createFakeTx([[], [{ id: 'evt-new' }]]);

    await createCanonicalEvent(tx, incomingEvent({ ageRestriction: '21+' }), COMMUNITY_SOURCE, null);

    expect(stepArg(insertsInto(ops, events)[0]!, 'values')).toMatchObject({ ageRestriction: '21+' });
  });

  it('is null on a new event when the source gave none', async () => {
    const { tx, ops } = createFakeTx([[], [{ id: 'evt-new' }]]);

    await createCanonicalEvent(tx, incomingEvent(), TM_SOURCE, null);

    expect(stepArg(insertsInto(ops, events)[0]!, 'values')).toMatchObject({ ageRestriction: null });
  });

  it('fills an existing event that has none', async () => {
    const { tx, ops } = createFakeTx([[baseRow]]);

    await mergeIntoEvent(tx, 'evt-1', incomingEvent({ ageRestriction: '21+' }), COMMUNITY_SOURCE, null);

    expect(stepArg(updatesOf(ops, events)[0]!, 'set')).toMatchObject({ ageRestriction: '21+' });
  });

  it('never overwrites one an event already has', async () => {
    const { tx, ops } = createFakeTx([[{ ...baseRow, ageRestriction: '18+' }]]);

    await mergeIntoEvent(tx, 'evt-1', incomingEvent({ ageRestriction: '21+' }), COMMUNITY_SOURCE, null);

    expect(stepArg(updatesOf(ops, events)[0]!, 'set')).not.toHaveProperty('ageRestriction');
  });

  it('leaves it alone when the merging source has none', async () => {
    const { tx, ops } = createFakeTx([[baseRow]]);

    await mergeIntoEvent(tx, 'evt-1', incomingEvent(), TM_SOURCE, null);

    expect(stepArg(updatesOf(ops, events)[0]!, 'set')).not.toHaveProperty('ageRestriction');
  });
});
