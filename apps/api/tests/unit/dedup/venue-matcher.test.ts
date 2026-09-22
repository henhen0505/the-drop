import { describe, expect, it } from 'vitest';
import { venues } from '../../../src/db/schema/venues';
import type { NormalizedEvent } from '../../../src/dedup/types';
import { resolveVenue } from '../../../src/dedup/venue-matcher';
import { createFakeTx, insertsInto, stepArg, updatesOf } from '../../helpers/fake-db';

function incomingEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    title: 'Show',
    startsAt: '2024-10-17T02:00:00Z',
    endsAt: null,
    venueName: 'Brooklyn Mirage',
    venueCity: 'Brooklyn',
    venueState: 'ny',
    venueTicketmasterId: null,
    venueSeatgeekId: null,
    artistNames: [],
    description: null,
    imageUrl: null,
    ticketUrl: null,
    priceMinCents: null,
    priceMaxCents: null,
    sourceUrl: null,
    externalId: null,
    ...overrides,
  };
}

describe('resolveVenue', () => {
  it('returns null without touching the database when the source gave no venue name or city', async () => {
    const { tx, ops } = createFakeTx();

    await expect(resolveVenue(tx, incomingEvent({ venueName: null }), 'TICKETMASTER')).resolves.toBeNull();
    await expect(resolveVenue(tx, incomingEvent({ venueCity: null }), 'TICKETMASTER')).resolves.toBeNull();
    expect(ops).toHaveLength(0);
  });

  it('matches on the Ticketmaster venue ID first', async () => {
    const { tx, ops } = createFakeTx([[{ id: 'v-tm' }]]);

    const id = await resolveVenue(tx, incomingEvent({ venueTicketmasterId: 'tm-9' }), 'TICKETMASTER');

    expect(id).toBe('v-tm');
    expect(ops).toHaveLength(1);
  });

  it('falls back to the SeatGeek venue ID', async () => {
    const { tx } = createFakeTx([[{ id: 'v-sg' }]]);

    await expect(
      resolveVenue(tx, incomingEvent({ venueSeatgeekId: 'sg-9' }), 'SEATGEEK'),
    ).resolves.toBe('v-sg');
  });

  it('reuses a same-city venue with a near-identical name and backfills the provider ID', async () => {
    const { tx, ops } = createFakeTx([
      [],
      [{ id: 'v-1', name: 'The Brooklyn Mirage', ticketmasterId: null, seatgeekId: null }],
    ]);

    const id = await resolveVenue(tx, incomingEvent({ venueSeatgeekId: 'sg-9' }), 'SEATGEEK');

    expect(id).toBe('v-1');
    const [backfill] = updatesOf(ops, venues);
    expect(stepArg(backfill!, 'set')).toMatchObject({ seatgeekId: 'sg-9' });
    expect(insertsInto(ops, venues)).toHaveLength(0);
  });

  it('does not reuse a venue whose name is only loosely similar', async () => {
    const { tx, ops } = createFakeTx([
      [{ id: 'v-x', name: 'Brooklyn Steel', ticketmasterId: null, seatgeekId: null }],
      [],
      [{ id: 'v-new' }],
    ]);

    const id = await resolveVenue(tx, incomingEvent(), 'TICKETMASTER');

    expect(id).toBe('v-new');
    expect(insertsInto(ops, venues)).toHaveLength(1);
  });

  it('creates a venue with provenance, uppercase state and provider IDs when nothing matches', async () => {
    const { tx, ops } = createFakeTx([
      [], // Ticketmaster ID lookup: miss
      [], // same-city venues: none
      [], // slug check: free
      [{ id: 'v-new' }],
    ]);

    const id = await resolveVenue(tx, incomingEvent({ venueTicketmasterId: 'tm-9' }), 'TICKETMASTER');

    expect(id).toBe('v-new');
    const [created] = insertsInto(ops, venues);
    expect(stepArg(created!, 'values')).toMatchObject({
      name: 'Brooklyn Mirage',
      slug: 'brooklyn-mirage',
      city: 'Brooklyn',
      state: 'NY',
      ticketmasterId: 'tm-9',
      primarySource: 'TICKETMASTER',
      confidence: 'TRUSTED_SOURCE',
    });
  });

  it('suffixes the slug when it is already taken', async () => {
    const { tx, ops } = createFakeTx([[], [{ id: 'other' }], [{ id: 'v-new' }]]);

    await resolveVenue(tx, incomingEvent(), 'COMMUNITY');

    const [created] = insertsInto(ops, venues);
    const { slug } = stepArg(created!, 'values') as { slug: string };
    expect(slug).not.toBe('brooklyn-mirage');
    expect(slug.startsWith('brooklyn-mirage-')).toBe(true);
  });
});
