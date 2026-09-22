import { describe, expect, it } from 'vitest';
import {
  confidenceForSource,
  planFieldMerge,
  sourceRank,
} from '../../../src/dedup/merge-rules';
import type { ExistingEventFields, IncomingFields } from '../../../src/dedup/merge-rules';

function existingEvent(overrides: Partial<ExistingEventFields> = {}): ExistingEventFields {
  return {
    title: 'Knock2 at Brooklyn Mirage',
    description: null,
    imageUrl: null,
    startsAt: new Date('2024-10-17T02:00:00Z'),
    endsAt: null,
    venueId: 'v-1',
    confidence: 'TRUSTED_SOURCE',
    primarySource: 'TICKETMASTER',
    fieldProvenance: { title: 'TICKETMASTER', startsAt: 'TICKETMASTER', venueId: 'TICKETMASTER' },
    status: 'PUBLISHED',
    ...overrides,
  };
}

function incomingFields(overrides: Partial<IncomingFields> = {}): IncomingFields {
  return {
    title: 'Knock2 at Brooklyn Mirage',
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
    resolvedVenueId: 'v-1',
    ...overrides,
  };
}

describe('source ranking (spec Step 6)', () => {
  it('orders ADMIN > TICKETMASTER > SEATGEEK > COMMUNITY > everything else', () => {
    expect(sourceRank('ADMIN')).toBeGreaterThan(sourceRank('TICKETMASTER'));
    expect(sourceRank('TICKETMASTER')).toBeGreaterThan(sourceRank('SEATGEEK'));
    expect(sourceRank('SEATGEEK')).toBeGreaterThan(sourceRank('COMMUNITY'));
    expect(sourceRank('COMMUNITY')).toBeGreaterThan(sourceRank('SPOTIFY'));
  });

  it('maps sources to confidence levels', () => {
    expect(confidenceForSource('TICKETMASTER')).toBe('TRUSTED_SOURCE');
    expect(confidenceForSource('SEATGEEK')).toBe('TRUSTED_SOURCE');
    expect(confidenceForSource('COMMUNITY')).toBe('COMMUNITY');
    expect(confidenceForSource('SPOTIFY')).toBe('UNVERIFIED');
  });
});

describe('planFieldMerge', () => {
  it('keeps the existing title when a lower-ranked source disagrees', () => {
    const plan = planFieldMerge(existingEvent(), incomingFields({ title: 'KNOCK2 -- NYC' }), 'SEATGEEK');
    expect(plan.updates.title).toBeUndefined();
  });

  it('lets a higher-ranked source replace the title and records provenance', () => {
    const existing = existingEvent({
      primarySource: 'COMMUNITY',
      confidence: 'COMMUNITY',
      fieldProvenance: { title: 'COMMUNITY' },
    });
    const plan = planFieldMerge(existing, incomingFields({ title: 'Knock2 Live' }), 'TICKETMASTER');
    expect(plan.updates.title).toBe('Knock2 Live');
    expect(plan.provenance.title).toBe('TICKETMASTER');
  });

  it('refreshes fields the same source supplied earlier', () => {
    const plan = planFieldMerge(existingEvent(), incomingFields({ title: 'Knock2 — Late Show' }), 'TICKETMASTER');
    expect(plan.updates.title).toBe('Knock2 — Late Show');
  });

  it('fills an empty description and image from any source', () => {
    const plan = planFieldMerge(
      existingEvent(),
      incomingFields({ description: 'A night of bass.', imageUrl: 'https://img/x.jpg' }),
      'SEATGEEK',
    );
    expect(plan.updates.description).toBe('A night of bass.');
    expect(plan.updates.imageUrl).toBe('https://img/x.jpg');
    expect(plan.provenance.description).toBe('SEATGEEK');
  });

  it('keeps an existing image and description from a higher-ranked source', () => {
    const existing = existingEvent({
      description: 'Short.',
      imageUrl: 'https://img/tm.jpg',
      fieldProvenance: { description: 'TICKETMASTER', imageUrl: 'TICKETMASTER' },
    });
    const plan = planFieldMerge(
      existing,
      incomingFields({ description: 'A much longer description from SeatGeek.', imageUrl: 'https://img/sg.jpg' }),
      'SEATGEEK',
    );
    expect(plan.updates.description).toBeUndefined();
    expect(plan.updates.imageUrl).toBeUndefined();
  });

  it('prefers TICKETMASTER for start times but never overrides an admin-set time', () => {
    const later = incomingFields({ startsAt: '2024-10-17T03:00:00Z' });

    const fromSg = existingEvent({
      primarySource: 'SEATGEEK',
      fieldProvenance: { startsAt: 'SEATGEEK' },
    });
    expect(planFieldMerge(fromSg, later, 'TICKETMASTER').updates.startsAt).toEqual(
      new Date('2024-10-17T03:00:00Z'),
    );

    expect(planFieldMerge(existingEvent(), later, 'SEATGEEK').updates.startsAt).toBeUndefined();

    const adminSet = existingEvent({ fieldProvenance: { startsAt: 'ADMIN' } });
    expect(planFieldMerge(adminSet, later, 'TICKETMASTER').updates.startsAt).toBeUndefined();
  });

  it('does not report a time change when the instant is identical', () => {
    const plan = planFieldMerge(existingEvent(), incomingFields(), 'TICKETMASTER');
    expect(plan.updates.startsAt).toBeUndefined();
  });

  it('fills a missing end time', () => {
    const plan = planFieldMerge(existingEvent(), incomingFields({ endsAt: '2024-10-17T08:00:00Z' }), 'SEATGEEK');
    expect(plan.updates.endsAt).toEqual(new Date('2024-10-17T08:00:00Z'));
  });

  it('fills a missing venue but keeps an existing one from a higher-ranked source', () => {
    const noVenue = existingEvent({ venueId: null, fieldProvenance: {} });
    expect(planFieldMerge(noVenue, incomingFields({ resolvedVenueId: 'v-2' }), 'SEATGEEK').updates.venueId).toBe('v-2');
    expect(planFieldMerge(existingEvent(), incomingFields({ resolvedVenueId: 'v-2' }), 'SEATGEEK').updates.venueId).toBeUndefined();
  });

  it('upgrades confidence but never downgrades it', () => {
    const community = existingEvent({ confidence: 'COMMUNITY', primarySource: 'COMMUNITY', fieldProvenance: {} });
    expect(planFieldMerge(community, incomingFields(), 'TICKETMASTER').updates.confidence).toBe('TRUSTED_SOURCE');

    const verified = existingEvent({ confidence: 'ADMIN_VERIFIED' });
    expect(planFieldMerge(verified, incomingFields(), 'SEATGEEK').updates.confidence).toBeUndefined();
  });

  it('leaves an admin-verified event untouched by API sources', () => {
    const verified = existingEvent({
      confidence: 'ADMIN_VERIFIED',
      fieldProvenance: { title: 'ADMIN' },
    });
    const plan = planFieldMerge(
      verified,
      incomingFields({ title: 'Different', startsAt: '2024-10-18T02:00:00Z', description: 'x', imageUrl: 'y' }),
      'TICKETMASTER',
    );
    expect(plan.updates.title).toBeUndefined();
    expect(plan.updates.startsAt).toBeUndefined();
  });

  it('lets a status change bypass rank -- a low-rank source can cancel a high-rank PUBLISHED event', () => {
    const existing = existingEvent({ status: 'PUBLISHED', primarySource: 'TICKETMASTER' });
    const plan = planFieldMerge(existing, incomingFields({ status: 'CANCELLED' }), 'COMMUNITY');
    expect(plan.updates.status).toBe('CANCELLED');
    expect(plan.provenance.status).toBe('COMMUNITY');
  });

  it('never overwrites status when the incoming status is undefined', () => {
    const plan = planFieldMerge(existingEvent({ status: 'PUBLISHED' }), incomingFields(), 'TICKETMASTER');
    expect(plan.updates.status).toBeUndefined();
    expect(plan.provenance.status).toBeUndefined();
  });

  it('does not report a status update when the incoming status matches the existing one', () => {
    const plan = planFieldMerge(
      existingEvent({ status: 'CANCELLED' }),
      incomingFields({ status: 'CANCELLED' }),
      'TICKETMASTER',
    );
    expect(plan.updates.status).toBeUndefined();
    expect(plan.provenance.status).toBeUndefined();
  });
});
