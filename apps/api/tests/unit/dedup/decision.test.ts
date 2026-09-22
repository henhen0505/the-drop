import { describe, expect, it } from 'vitest';
import { config } from '../../../src/config/index';
import { DEFAULT_DEDUP_SETTINGS, getDedupSettings } from '../../../src/dedup/config';
import { adjacentDateGuardTriggered, decide } from '../../../src/dedup/decision';
import type { DedupSettings, ScoredCandidate } from '../../../src/dedup/types';

function scored(
  composite: number,
  overrides: Partial<ScoredCandidate['scores']> = {},
  sourceTypes: ScoredCandidate['candidate']['sourceTypes'] = ['TICKETMASTER'],
): ScoredCandidate {
  return {
    candidate: {
      eventId: 'evt-1',
      title: 'Event',
      startsAt: new Date('2024-10-17T02:00:00Z'),
      venueId: 'v-1',
      venueName: 'Venue',
      venueTicketmasterId: null,
      venueSeatgeekId: null,
      artistNames: [],
      sourceTypes,
    },
    scores: { venueScore: 1, dateScore: 1, artistScore: 1, titleScore: 1, composite, ...overrides },
  };
}

const AUTO_ON: DedupSettings = { ...DEFAULT_DEDUP_SETTINGS, autoMergeEnabled: true };

describe('settings', () => {
  it('default to review-only mode with the documented 0.85 / 0.55 thresholds', () => {
    expect(DEFAULT_DEDUP_SETTINGS).toEqual({
      autoMergeEnabled: false,
      autoMergeThreshold: 0.85,
      reviewThreshold: 0.55,
    });
    expect(config.dedup.autoMergeEnabled).toBe(false);
    expect(getDedupSettings()).toEqual(DEFAULT_DEDUP_SETTINGS);
  });
});

describe('decide — REVIEW_ONLY launch mode (default)', () => {
  it('never auto-merges, even at a perfect score', () => {
    expect(decide(scored(1), 'SEATGEEK', DEFAULT_DEDUP_SETTINGS)).toEqual({
      decision: 'REVIEW',
      reason: 'REVIEW_ONLY_MODE',
    });
  });

  it('sends everything at or above 0.55 to review', () => {
    expect(decide(scored(0.55), 'SEATGEEK', DEFAULT_DEDUP_SETTINGS).decision).toBe('REVIEW');
    expect(decide(scored(0.7), 'SEATGEEK', DEFAULT_DEDUP_SETTINGS).decision).toBe('REVIEW');
  });

  it('creates a new event below 0.55', () => {
    expect(decide(scored(0.5499), 'SEATGEEK', DEFAULT_DEDUP_SETTINGS)).toEqual({
      decision: 'NO_MATCH',
      reason: 'BELOW_REVIEW_THRESHOLD',
    });
  });

  it('creates a new event when there are no candidates', () => {
    expect(decide(undefined, 'SEATGEEK', DEFAULT_DEDUP_SETTINGS)).toEqual({
      decision: 'NO_MATCH',
      reason: 'NO_CANDIDATES',
    });
  });
});

describe('decide — auto-merge enabled', () => {
  it('auto-merges at 0.85 and above', () => {
    expect(decide(scored(0.85), 'SEATGEEK', AUTO_ON)).toEqual({ decision: 'AUTO_MERGE', reason: 'SCORE' });
    expect(decide(scored(0.97), 'SEATGEEK', AUTO_ON).decision).toBe('AUTO_MERGE');
  });

  it('reviews 0.55 to just under 0.85', () => {
    expect(decide(scored(0.8499), 'SEATGEEK', AUTO_ON)).toEqual({ decision: 'REVIEW', reason: 'SCORE' });
    expect(decide(scored(0.55), 'SEATGEEK', AUTO_ON).decision).toBe('REVIEW');
  });

  it('creates a new event below 0.55', () => {
    expect(decide(scored(0.54), 'SEATGEEK', AUTO_ON).decision).toBe('NO_MATCH');
  });

  it('honors custom thresholds', () => {
    const strict: DedupSettings = { autoMergeEnabled: true, autoMergeThreshold: 0.95, reviewThreshold: 0.6 };
    expect(decide(scored(0.9), 'SEATGEEK', strict).decision).toBe('REVIEW');
    expect(decide(scored(0.59), 'SEATGEEK', strict).decision).toBe('NO_MATCH');
  });
});

describe('same-venue-adjacent-date guard', () => {
  const adjacentNight = { venueScore: 1, dateScore: 0.8 };

  it('forces review when the candidate already has a listing from the same provider', () => {
    const top = scored(0.95, adjacentNight, ['TICKETMASTER']);
    expect(adjacentDateGuardTriggered(top, 'TICKETMASTER')).toBe(true);
    expect(decide(top, 'TICKETMASTER', AUTO_ON)).toEqual({
      decision: 'REVIEW',
      reason: 'ADJACENT_DATE_GUARD',
    });
  });

  it('does not apply when the candidate only has listings from other providers', () => {
    const top = scored(0.95, adjacentNight, ['TICKETMASTER']);
    expect(adjacentDateGuardTriggered(top, 'SEATGEEK')).toBe(false);
    expect(decide(top, 'SEATGEEK', AUTO_ON).decision).toBe('AUTO_MERGE');
  });

  it('does not apply to same-day matches or weak venue matches', () => {
    expect(adjacentDateGuardTriggered(scored(0.95, { dateScore: 1 }), 'TICKETMASTER')).toBe(false);
    expect(
      adjacentDateGuardTriggered(scored(0.95, { venueScore: 0.85, dateScore: 0.8 }), 'TICKETMASTER'),
    ).toBe(false);
  });
});
