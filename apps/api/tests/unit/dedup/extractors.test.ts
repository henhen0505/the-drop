import { describe, expect, it } from 'vitest';
import { extractEvent, toIsoUtc, validateNormalized } from '../../../src/dedup/extractors';

describe('toIsoUtc', () => {
  it('leaves timestamps that carry an offset alone', () => {
    expect(toIsoUtc('2024-08-15T22:00:00Z')).toBe('2024-08-15T22:00:00Z');
    expect(toIsoUtc('2024-08-15T18:00:00-04:00')).toBe('2024-08-15T18:00:00-04:00');
  });

  it('treats offset-less timestamps as UTC instead of server-local time', () => {
    expect(toIsoUtc('2024-09-20T23:00:00')).toBe('2024-09-20T23:00:00Z');
  });

  it('expands date-only values and blanks out missing ones', () => {
    expect(toIsoUtc('2024-09-20')).toBe('2024-09-20T12:00:00Z');
    expect(toIsoUtc(undefined)).toBe('');
    expect(toIsoUtc(null)).toBe('');
  });
});

describe('extractEvent — TICKETMASTER', () => {
  const raw = {
    id: 'vvG1fZ9JxkSd3k',
    name: 'Skrillex at Brooklyn Mirage',
    url: 'https://www.ticketmaster.com/event/123',
    info: 'An epic night of bass music.',
    dates: { start: { dateTime: '2024-08-15T22:00:00Z' }, end: { dateTime: '2024-08-16T04:00:00Z' } },
    _embedded: {
      venues: [
        { id: 'KovZpZAFnIEA', name: 'Brooklyn Mirage', city: { name: 'Brooklyn' }, state: { stateCode: 'NY' } },
      ],
      attractions: [{ name: 'Skrillex' }, { name: ' Fred Again.. ' }, {}],
    },
    images: [
      { url: 'https://img/small.jpg', width: 200 },
      { url: 'https://img/large.jpg', width: 1024 },
    ],
    priceRanges: [{ min: 45, max: 150.5 }],
  };

  it('maps every field', () => {
    expect(extractEvent('TICKETMASTER', raw)).toEqual({
      title: 'Skrillex at Brooklyn Mirage',
      startsAt: '2024-08-15T22:00:00Z',
      endsAt: '2024-08-16T04:00:00Z',
      venueName: 'Brooklyn Mirage',
      venueCity: 'Brooklyn',
      venueState: 'NY',
      venueTicketmasterId: 'KovZpZAFnIEA',
      venueSeatgeekId: null,
      artistNames: ['Skrillex', 'Fred Again..'],
      description: 'An epic night of bass music.',
      imageUrl: 'https://img/large.jpg',
      ticketUrl: 'https://www.ticketmaster.com/event/123',
      priceMinCents: 4500,
      priceMaxCents: 15050,
      sourceUrl: 'https://www.ticketmaster.com/event/123',
      externalId: 'vvG1fZ9JxkSd3k',
    });
  });

  it('tolerates a sparse payload', () => {
    const event = extractEvent('TICKETMASTER', { id: 'tm1', name: 'Bare' });
    expect(event.venueName).toBeNull();
    expect(event.artistNames).toEqual([]);
    expect(event.priceMinCents).toBeNull();
    expect(event.startsAt).toBe('');
  });
});

describe('extractEvent — TICKETMASTER status mapping', () => {
  function rawWithStatus(code: string | undefined) {
    return {
      id: 'tm-status',
      name: 'Status Test',
      dates: {
        start: { dateTime: '2024-08-15T22:00:00Z' },
        ...(code !== undefined ? { status: { code } } : {}),
      },
    };
  }

  it('maps cancelled to CANCELLED', () => {
    expect(extractEvent('TICKETMASTER', rawWithStatus('cancelled')).status).toBe('CANCELLED');
  });

  it('maps postponed and rescheduled to POSTPONED', () => {
    expect(extractEvent('TICKETMASTER', rawWithStatus('postponed')).status).toBe('POSTPONED');
    expect(extractEvent('TICKETMASTER', rawWithStatus('rescheduled')).status).toBe('POSTPONED');
  });

  it('leaves status undefined for onsale, offsale, and missing status', () => {
    expect(extractEvent('TICKETMASTER', rawWithStatus('onsale')).status).toBeUndefined();
    expect(extractEvent('TICKETMASTER', rawWithStatus('offsale')).status).toBeUndefined();
    expect(extractEvent('TICKETMASTER', rawWithStatus(undefined)).status).toBeUndefined();
  });
});

describe('extractEvent — SEATGEEK', () => {
  it('maps fields and converts the numeric IDs to strings', () => {
    const event = extractEvent('SEATGEEK', {
      id: 55555,
      title: 'Fisher at Echostage',
      url: 'https://seatgeek.com/fisher',
      datetime_utc: '2024-09-20T23:00:00',
      venue: { id: 7890, name: 'Echostage', city: 'Washington', state: 'DC' },
      performers: [{ name: 'Fisher' }],
      stats: { lowest_price: 35, highest_price: 85.5 },
    });
    expect(event.startsAt).toBe('2024-09-20T23:00:00Z');
    expect(event.venueSeatgeekId).toBe('7890');
    expect(event.externalId).toBe('55555');
    expect(event.priceMinCents).toBe(3500);
    expect(event.priceMaxCents).toBe(8550);
    expect(event.artistNames).toEqual(['Fisher']);
  });

  // Same invariant as the COMMUNITY test below: SeatGeek outranks COMMUNITY, so if this
  // ever started leaking a status it could override a legitimate Ticketmaster cancellation.
  it('never produces a status field, even if the raw payload injects one', () => {
    const event = extractEvent('SEATGEEK', {
      id: 1,
      title: 'Fisher at Echostage',
      status: 'CANCELLED',
    } as Record<string, unknown>);
    expect(event.status).toBeUndefined();
    expect('status' in event).toBe(false);
  });
});

describe('extractEvent — COMMUNITY / ADMIN', () => {
  it('passes community fields through and has no external ID', () => {
    const event = extractEvent('COMMUNITY', {
      title: ' Warehouse Rave ',
      startsAt: '2024-10-31T23:00:00Z',
      venueName: 'The Lot',
      venueCity: 'Brooklyn',
      artistNames: ['DJ Unknown', '  '],
    });
    expect(event.title).toBe('Warehouse Rave');
    expect(event.artistNames).toEqual(['DJ Unknown']);
    expect(event.externalId).toBeNull();
    expect(extractEvent('ADMIN', { title: 'Admin Event' }).title).toBe('Admin Event');
  });

  // Security-relevant invariant: in merge-rules.ts, an incoming status bypasses source-rank
  // comparison entirely (a cancellation is safety-critical), so a community submission must never
  // be able to inject a status value -- that could falsely cancel or postpone a real event.
  it('never produces a status field, even if the raw payload injects one', () => {
    const event = extractEvent('COMMUNITY', {
      title: 'Warehouse Rave',
      startsAt: '2024-10-31T23:00:00Z',
      status: 'CANCELLED',
    } as Record<string, unknown>);
    expect(event.status).toBeUndefined();
    expect('status' in event).toBe(false);
  });
});

describe('extractEvent — COMMUNITY source URL and age restriction', () => {
  it('carries the source URL and age restriction through to the normalized event', () => {
    const event = extractEvent('COMMUNITY', {
      title: 'Warehouse Rave',
      startsAt: '2030-10-31T23:00:00Z',
      sourceUrl: 'https://instagram.com/p/abc',
      ageRestriction: '21+',
    });

    expect(event.sourceUrl).toBe('https://instagram.com/p/abc');
    expect(event.ageRestriction).toBe('21+');
  });

  it('defaults both to null when the submission has neither', () => {
    const event = extractEvent('COMMUNITY', { title: 'Warehouse Rave', startsAt: '2030-10-31T23:00:00Z' });

    expect(event.sourceUrl).toBeNull();
    expect(event.ageRestriction).toBeNull();
  });

  it('does not read an age restriction from Ticketmaster or SeatGeek payloads', () => {
    expect(extractEvent('TICKETMASTER', { id: 'tm1', name: 'x', ageRestriction: '18+' } as Record<string, unknown>).ageRestriction).toBeUndefined();
    expect(extractEvent('SEATGEEK', { id: 1, title: 'x', ageRestriction: '18+' } as Record<string, unknown>).ageRestriction).toBeUndefined();
  });
});

describe('extractEvent — unsupported sources', () => {
  it('throws so the staging row is marked FAILED instead of guessing a shape', () => {
    expect(() => extractEvent('SPOTIFY', { title: 'x' })).toThrow(/No event extractor/);
  });
});

describe('validateNormalized', () => {
  const valid = extractEvent('COMMUNITY', { title: 'Show', startsAt: '2024-10-31T23:00:00Z' });

  it('accepts an event with a title and a real start time', () => {
    expect(validateNormalized(valid)).toBeNull();
  });

  it('rejects a missing title, a missing start, and unparseable times', () => {
    expect(validateNormalized({ ...valid, title: '' })).toMatch(/title/);
    expect(validateNormalized({ ...valid, startsAt: '' })).toMatch(/start/);
    expect(validateNormalized({ ...valid, startsAt: 'not a date' })).toMatch(/start/);
    expect(validateNormalized({ ...valid, endsAt: 'nope' })).toMatch(/end/);
  });
});
