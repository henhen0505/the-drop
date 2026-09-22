import { describe, expect, it } from 'vitest';
import { findCandidates } from '../../../src/dedup/candidate-finder';
import type { NormalizedEvent } from '../../../src/dedup/types';
import { createFakeTx } from '../../helpers/fake-db';

const incoming: NormalizedEvent = {
  title: 'Knock2',
  startsAt: '2024-10-17T02:00:00Z',
  endsAt: null,
  venueName: 'Brooklyn Mirage',
  venueCity: 'Brooklyn',
  venueState: 'NY',
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
};

describe('findCandidates', () => {
  it('returns an empty list without further queries when no events fall in the window', async () => {
    const { tx, ops } = createFakeTx([[]]);

    await expect(findCandidates(tx, incoming)).resolves.toEqual([]);
    expect(ops).toHaveLength(1);
  });

  it('attaches artist names and existing source providers to each candidate', async () => {
    const row = {
      eventId: 'evt-1',
      title: 'Knock2 at Brooklyn Mirage',
      startsAt: new Date('2024-10-17T02:00:00Z'),
      venueId: 'v-1',
      venueName: 'Brooklyn Mirage',
      venueTicketmasterId: 'tm-9',
      venueSeatgeekId: null,
    };
    const { tx, ops } = createFakeTx([
      [row, { ...row, eventId: 'evt-2', title: 'Other' }],
      [
        { eventId: 'evt-1', name: 'Knock2' },
        { eventId: 'evt-1', name: 'Fred again..' },
      ],
      [
        { eventId: 'evt-1', sourceType: 'TICKETMASTER' },
        { eventId: 'evt-2', sourceType: 'SEATGEEK' },
      ],
    ]);

    const result = await findCandidates(tx, incoming);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      eventId: 'evt-1',
      venueTicketmasterId: 'tm-9',
      artistNames: ['Knock2', 'Fred again..'],
      sourceTypes: ['TICKETMASTER'],
    });
    expect(result[1]).toMatchObject({ eventId: 'evt-2', artistNames: [], sourceTypes: ['SEATGEEK'] });
    expect(ops).toHaveLength(3);
  });
});
