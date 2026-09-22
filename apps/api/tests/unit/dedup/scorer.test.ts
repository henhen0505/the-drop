import { describe, expect, it } from 'vitest';
import { DEDUP_WEIGHTS } from '../../../src/dedup/config';
import {
  computeComposite,
  scoreArtists,
  scoreCandidate,
  scoreCandidates,
  scoreDate,
  scoreTitle,
  scoreVenue,
} from '../../../src/dedup/scorer';
import type { CandidateEvent, NormalizedEvent } from '../../../src/dedup/types';

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

function candidateEvent(overrides: Partial<CandidateEvent> = {}): CandidateEvent {
  return {
    eventId: 'evt-1',
    title: 'Knock2 Live at Brooklyn Mirage',
    startsAt: new Date('2024-10-17T02:00:00Z'),
    venueId: 'v-1',
    venueName: 'Brooklyn Mirage',
    venueTicketmasterId: null,
    venueSeatgeekId: null,
    artistNames: ['Knock2'],
    sourceTypes: ['TICKETMASTER'],
    ...overrides,
  };
}

describe('weights', () => {
  it('follow architecture/dedup-engine.md Step 4 and sum to 1', () => {
    expect(DEDUP_WEIGHTS).toEqual({ venue: 0.3, date: 0.25, artist: 0.25, title: 0.2 });
    const sum = Object.values(DEDUP_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe('scoreVenue', () => {
  it('is 1 when provider venue IDs match and 0 when they differ (even with identical names)', () => {
    const same = scoreVenue(
      incomingEvent({ venueTicketmasterId: 'tm-1' }),
      candidateEvent({ venueTicketmasterId: 'tm-1' }),
    );
    const differ = scoreVenue(
      incomingEvent({ venueTicketmasterId: 'tm-1' }),
      candidateEvent({ venueTicketmasterId: 'tm-2' }),
    );
    expect(same).toBe(1);
    expect(differ).toBe(0);
  });

  it('ignores IDs from different providers and falls back to name similarity', () => {
    const score = scoreVenue(
      incomingEvent({ venueTicketmasterId: 'tm-1' }),
      candidateEvent({ venueSeatgeekId: 'sg-9' }),
    );
    expect(score).toBe(1);
  });

  it('uses trigram similarity of normalized names when IDs are unavailable', () => {
    expect(scoreVenue(incomingEvent(), candidateEvent({ venueName: 'The Brooklyn Mirage' }))).toBe(1);
    expect(scoreVenue(incomingEvent(), candidateEvent({ venueName: 'Elsewhere' }))).toBeLessThan(0.3);
  });

  it('is 0 when either venue name is missing', () => {
    expect(scoreVenue(incomingEvent({ venueName: null }), candidateEvent())).toBe(0);
    expect(scoreVenue(incomingEvent(), candidateEvent({ venueName: null }))).toBe(0);
  });
});

describe('scoreDate', () => {
  it('is 1.0 for the same local calendar day (America/New_York)', () => {
    // 6pm and 10pm on Aug 15 in New York; the second is already Aug 16 in UTC.
    expect(scoreDate(new Date('2024-08-15T22:00:00Z'), new Date('2024-08-16T02:00:00Z'))).toBe(1.0);
  });

  it('is 0.8 for adjacent days, including a 1am listing of a late-night event', () => {
    expect(scoreDate(new Date('2024-08-15T22:00:00Z'), new Date('2024-08-16T22:00:00Z'))).toBe(0.8);
    expect(scoreDate(new Date('2024-08-16T03:30:00Z'), new Date('2024-08-16T05:00:00Z'))).toBe(0.8);
  });

  it('is 0.3 two days apart and 0 beyond that', () => {
    expect(scoreDate(new Date('2024-08-15T22:00:00Z'), new Date('2024-08-17T22:00:00Z'))).toBe(0.3);
    expect(scoreDate(new Date('2024-08-15T22:00:00Z'), new Date('2024-08-18T22:00:00Z'))).toBe(0);
  });
});

describe('scoreArtists', () => {
  it('is 0.5 when neither side has artists and 0.3 when only one does', () => {
    expect(scoreArtists([], [])).toBe(0.5);
    expect(scoreArtists([], ['Skrillex'])).toBe(0.3);
    expect(scoreArtists(['Skrillex'], [])).toBe(0.3);
  });

  it('is Jaccard similarity on normalized names', () => {
    expect(scoreArtists(['A One', 'B Two', 'C Three'], ['B Two', 'C Three', 'D Four'])).toBeCloseTo(0.5, 10);
    expect(scoreArtists(['A One', 'B Two'], ['B Two', 'C Three'])).toBeCloseTo(1 / 3, 10);
    expect(scoreArtists(['Skrillex'], ['Skrillex'])).toBe(1);
  });

  it('treats case, punctuation and a leading "DJ" as the same artist', () => {
    expect(scoreArtists(['DJ Snake'], ['snake'])).toBe(1);
    expect(scoreArtists(['REZZ'], ['Rezz.'])).toBe(1);
  });

  it('counts near-identical spellings (trigram > 0.7) as matches', () => {
    expect(scoreArtists(['Skrillex', 'Zeds Dead'], ['Skrillexx', 'Zeds Dead'])).toBe(1);
  });
});

describe('scoreTitle', () => {
  it('is 1 for the same title and rewards titles that reduce to the same headliner', () => {
    expect(scoreTitle(incomingEvent(), candidateEvent())).toBe(1);

    const spec = scoreTitle(
      incomingEvent({ title: 'KNOCK2 -- The Brooklyn Mirage -- NYC', venueName: 'The Brooklyn Mirage' }),
      candidateEvent(),
    );
    expect(spec).toBeCloseTo(7 / 11, 6);
  });

  it('is low for unrelated titles', () => {
    expect(scoreTitle(incomingEvent({ title: 'Halloween Rave' }), candidateEvent())).toBeLessThan(0.2);
  });
});

describe('composite scoring', () => {
  it('is 1 for a perfect match', () => {
    expect(scoreCandidate(incomingEvent(), candidateEvent()).scores.composite).toBeCloseTo(1, 10);
  });

  it('computes the weighted sum of the four signals', () => {
    expect(
      computeComposite({ venueScore: 1, dateScore: 0.8, artistScore: 0.5, titleScore: 0.2 }),
    ).toBeCloseTo(0.3 + 0.2 + 0.125 + 0.04, 10);
  });

  it('scores back-to-back residency nights ~0.95 (the case the adjacent-date guard exists for)', () => {
    const nextNight = candidateEvent({ startsAt: new Date('2024-10-18T02:00:00Z') });
    const { scores } = scoreCandidate(incomingEvent(), nextNight);
    expect(scores.venueScore).toBe(1);
    expect(scores.dateScore).toBe(0.8);
    expect(scores.composite).toBeCloseTo(0.95, 10);
  });

  it('title-only events rely on venue + date + title, with the neutral 0.5 artist score', () => {
    const { scores } = scoreCandidate(
      incomingEvent({ artistNames: [] }),
      candidateEvent({ artistNames: [] }),
    );
    expect(scores.artistScore).toBe(0.5);
    expect(scores.composite).toBeCloseTo(0.3 + 0.25 + 0.125 + 0.2, 10);
  });

  it('scores a different event at another venue and date well below the review threshold', () => {
    const other = candidateEvent({
      title: 'Tiesto',
      venueName: 'Echostage',
      startsAt: new Date('2024-12-01T02:00:00Z'),
      artistNames: ['Tiesto'],
    });
    expect(scoreCandidate(incomingEvent(), other).scores.composite).toBeLessThan(0.2);
  });
});

describe('scoreCandidates', () => {
  it('returns an empty list when there are no candidates', () => {
    expect(scoreCandidates(incomingEvent(), [])).toEqual([]);
  });

  it('sorts by composite descending with a deterministic tie-break', () => {
    const results = scoreCandidates(incomingEvent(), [
      candidateEvent({ eventId: 'b-poor', title: 'Other', venueName: 'Elsewhere', artistNames: ['Nobody'] }),
      candidateEvent({ eventId: 'z-good' }),
      candidateEvent({ eventId: 'a-good' }),
    ]);
    expect(results.map((r) => r.candidate.eventId)).toEqual(['a-good', 'z-good', 'b-poor']);
  });
});
