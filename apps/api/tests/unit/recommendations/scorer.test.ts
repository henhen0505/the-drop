import { describe, expect, it } from 'vitest';
import {
  DISTANCE_NEUTRAL,
  EXPLANATION_FALLBACK,
  KM_PER_MILE,
  RECOMMENDATION_WEIGHTS,
} from '../../../src/recommendations/config';
import {
  buildExplanation,
  computeComposite,
  distanceKmOrNull,
  scoreArtistAffinity,
  scoreDistance,
  scoreEvent,
  scoreGenreAffinity,
  scorePriceFit,
  scoreVenueAffinity,
} from '../../../src/recommendations/scorer';
import type {
  EventScoreInput,
  ExplanationContext,
  RecommendationFactors,
} from '../../../src/recommendations/scorer';

const NO_FACTORS: RecommendationFactors = {
  artistAffinity: 0,
  genreAffinity: 0,
  distanceScore: 0,
  priceFit: 0,
  venueAffinity: 0,
};

function scoreInput(overrides: Partial<EventScoreInput> = {}): EventScoreInput {
  return {
    eventArtistIds: [],
    eventGenreIds: [],
    eventMinPriceCents: null,
    venueLatitude: null,
    venueLongitude: null,
    userFollowedArtistIds: new Set(),
    userPreferredGenreIds: new Set(),
    userLatitude: null,
    userLongitude: null,
    userTravelRadiusKm: 80,
    userPriceMinCents: null,
    userPriceMaxCents: null,
    venuePastVisitCount: 0,
    ...overrides,
  };
}

function explanationContext(overrides: Partial<ExplanationContext> = {}): ExplanationContext {
  return {
    matchedArtistNames: [],
    matchedGenreNames: [],
    distanceKm: null,
    priceFitEvaluated: false,
    venueName: null,
    ...overrides,
  };
}

describe('RECOMMENDATION_WEIGHTS', () => {
  it('sum to 1 so the composite stays on the 0-1 scale', () => {
    const sum = Object.values(RECOMMENDATION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe('scoreArtistAffinity / scoreGenreAffinity', () => {
  const followed = new Set(['a', 'b']);

  it('is the fraction of the event lineup the user follows', () => {
    expect(scoreArtistAffinity(['a', 'b', 'c', 'd'], followed)).toBe(0.5);
    expect(scoreArtistAffinity(['a', 'b'], followed)).toBe(1);
    expect(scoreArtistAffinity(['a', 'x', 'y'], followed)).toBeCloseTo(1 / 3, 10);
  });

  it('is 0 when the user follows none of the lineup or follows nobody', () => {
    expect(scoreArtistAffinity(['x', 'y'], followed)).toBe(0);
    expect(scoreArtistAffinity(['a'], new Set())).toBe(0);
  });

  it('is 0 for an event with no artists instead of dividing by zero', () => {
    expect(scoreArtistAffinity([], followed)).toBe(0);
  });

  it('is asymmetric: following one headliner of a big lineup scores low, not by how many you follow overall', () => {
    const followsMany = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    expect(scoreArtistAffinity(['a', 'x', 'y', 'z'], followsMany)).toBe(0.25);
  });

  it('applies the same ratio to genres', () => {
    expect(scoreGenreAffinity(['g1', 'g2'], new Set(['g1']))).toBe(0.5);
    expect(scoreGenreAffinity(['g1'], new Set(['g1']))).toBe(1);
    expect(scoreGenreAffinity([], new Set(['g1']))).toBe(0);
    expect(scoreGenreAffinity(['g1'], new Set())).toBe(0);
  });
});

describe('distanceKmOrNull', () => {
  it('is null when any of the four coordinates is missing', () => {
    expect(distanceKmOrNull(null, -74, 40, -73)).toBeNull();
    expect(distanceKmOrNull(40, null, 40, -73)).toBeNull();
    expect(distanceKmOrNull(40, -74, null, -73)).toBeNull();
    expect(distanceKmOrNull(40, -74, 40, null)).toBeNull();
  });

  it('is the Haversine distance when all four are present', () => {
    expect(distanceKmOrNull(0, 0, 0, 1)).toBeCloseTo(111.195, 2);
  });
});

describe('scoreDistance', () => {
  it('is the neutral 0.5 when there is no distance to score', () => {
    expect(scoreDistance(null, 80)).toBe(DISTANCE_NEUTRAL);
    expect(DISTANCE_NEUTRAL).toBe(0.5);
  });

  it('decays linearly from 1 at the user to 0 at the travel radius', () => {
    expect(scoreDistance(0, 80)).toBe(1);
    expect(scoreDistance(20, 80)).toBe(0.75);
    expect(scoreDistance(40, 80)).toBe(0.5);
    expect(scoreDistance(80, 80)).toBe(0);
  });

  it('stays at 0 beyond the radius rather than going negative', () => {
    expect(scoreDistance(160, 80)).toBe(0);
    expect(scoreDistance(10_000, 80)).toBe(0);
  });

  it('handles a zero or negative radius without dividing by zero', () => {
    expect(scoreDistance(0, 0)).toBe(1);
    expect(scoreDistance(5, 0)).toBe(0);
    expect(scoreDistance(5, -10)).toBe(0);
  });
});

describe('scorePriceFit', () => {
  it('is 1 when the user has no price preference at all', () => {
    expect(scorePriceFit(20000, null, null)).toBe(1);
  });

  it('is 1 when the event has no known price, so it is not penalized', () => {
    expect(scorePriceFit(null, 1000, 5000)).toBe(1);
  });

  it('is binary against the max: at or under passes, over fails', () => {
    expect(scorePriceFit(4000, null, 5000)).toBe(1);
    expect(scorePriceFit(5000, null, 5000)).toBe(1);
    expect(scorePriceFit(5001, null, 5000)).toBe(0);
  });

  it('is binary against the min: at or over passes, under fails', () => {
    expect(scorePriceFit(2000, 2000, null)).toBe(1);
    expect(scorePriceFit(1999, 2000, null)).toBe(0);
  });

  it('requires the price to sit inside a min-max range', () => {
    expect(scorePriceFit(3000, 2000, 5000)).toBe(1);
    expect(scorePriceFit(1000, 2000, 5000)).toBe(0);
    expect(scorePriceFit(9000, 2000, 5000)).toBe(0);
  });
});

describe('scoreVenueAffinity', () => {
  it('maps past visits to 0, 0.5, 0.75, then a capped 1', () => {
    expect(scoreVenueAffinity(0)).toBe(0);
    expect(scoreVenueAffinity(1)).toBe(0.5);
    expect(scoreVenueAffinity(2)).toBe(0.75);
    expect(scoreVenueAffinity(3)).toBe(1);
    expect(scoreVenueAffinity(10)).toBe(1);
  });

  it('treats a negative count as no history', () => {
    expect(scoreVenueAffinity(-1)).toBe(0);
  });

  it('floors a fractional count', () => {
    expect(scoreVenueAffinity(2.9)).toBe(0.75);
  });
});

describe('computeComposite', () => {
  it('is 1 when every factor is 1 and 0 when every factor is 0', () => {
    const all = { artistAffinity: 1, genreAffinity: 1, distanceScore: 1, priceFit: 1, venueAffinity: 1 };
    expect(computeComposite(all)).toBeCloseTo(1, 10);
    expect(computeComposite(NO_FACTORS)).toBe(0);
  });

  it('is the weighted sum: 0.35*0.5 + 0.25*1 + 0.20*0.25 + 0.10*1 + 0.10*0.5 = 0.625', () => {
    expect(
      computeComposite({
        artistAffinity: 0.5,
        genreAffinity: 1,
        distanceScore: 0.25,
        priceFit: 1,
        venueAffinity: 0.5,
      }),
    ).toBeCloseTo(0.625, 10);
  });

  it('lets each factor move the score by exactly its own weight', () => {
    expect(computeComposite({ ...NO_FACTORS, artistAffinity: 1 })).toBeCloseTo(0.35, 10);
    expect(computeComposite({ ...NO_FACTORS, genreAffinity: 1 })).toBeCloseTo(0.25, 10);
    expect(computeComposite({ ...NO_FACTORS, distanceScore: 1 })).toBeCloseTo(0.2, 10);
    expect(computeComposite({ ...NO_FACTORS, priceFit: 1 })).toBeCloseTo(0.1, 10);
    expect(computeComposite({ ...NO_FACTORS, venueAffinity: 1 })).toBeCloseTo(0.1, 10);
  });
});

describe('scoreEvent', () => {
  it('scores a cold-start user (no follows, genres, location, price prefs or history) at exactly 0.20', () => {
    // 0.35*0 + 0.25*0 + 0.20*0.5 (neutral distance) + 0.10*1 (no price constraint) + 0.10*0 = 0.10 + 0.10
    const result = scoreEvent(scoreInput({ eventArtistIds: ['a'], eventGenreIds: ['g'] }));

    expect(result.factors).toEqual({
      artistAffinity: 0,
      genreAffinity: 0,
      distanceScore: 0.5,
      priceFit: 1,
      venueAffinity: 0,
    });
    expect(result.score).toBeCloseTo(0.2, 10);
    expect(result.distanceKm).toBeNull();
  });

  it('scores a perfect match at 1', () => {
    const result = scoreEvent(
      scoreInput({
        eventArtistIds: ['a'],
        eventGenreIds: ['g'],
        eventMinPriceCents: 3000,
        venueLatitude: 40.7128,
        venueLongitude: -74.006,
        userFollowedArtistIds: new Set(['a']),
        userPreferredGenreIds: new Set(['g']),
        userLatitude: 40.7128,
        userLongitude: -74.006,
        userPriceMaxCents: 5000,
        venuePastVisitCount: 5,
      }),
    );

    expect(result.score).toBeCloseTo(1, 10);
    expect(result.distanceKm).toBe(0);
  });

  it('turns the real distance into distanceScore against the user travel radius', () => {
    // 0 N,0 E to 0 N,1 E is 111.195 km; against a 222.39 km radius that is exactly half.
    const result = scoreEvent(
      scoreInput({
        venueLatitude: 0,
        venueLongitude: 1,
        userLatitude: 0,
        userLongitude: 0,
        userTravelRadiusKm: 222.39,
      }),
    );

    expect(result.distanceKm).toBeCloseTo(111.195, 2);
    expect(result.factors.distanceScore).toBeCloseTo(0.5, 3);
  });

  it('keeps a far-away event recommendable: distance zeroes only its own factor', () => {
    const result = scoreEvent(
      scoreInput({
        eventArtistIds: ['a'],
        userFollowedArtistIds: new Set(['a']),
        venueLatitude: 34.0522,
        venueLongitude: -118.2437,
        userLatitude: 40.7128,
        userLongitude: -74.006,
      }),
    );

    expect(result.factors.distanceScore).toBe(0);
    // 0.35*1 + 0.25*0 + 0.20*0 + 0.10*1 + 0.10*0
    expect(result.score).toBeCloseTo(0.45, 10);
  });

  it('falls back to neutral distance when only one side has coordinates', () => {
    expect(scoreEvent(scoreInput({ userLatitude: 40, userLongitude: -74 })).factors.distanceScore).toBe(0.5);
    expect(scoreEvent(scoreInput({ venueLatitude: 40, venueLongitude: -74 })).factors.distanceScore).toBe(0.5);
  });

  it('feeds venue history and price prefs through to their factors', () => {
    const result = scoreEvent(
      scoreInput({ eventMinPriceCents: 9000, userPriceMaxCents: 5000, venuePastVisitCount: 2 }),
    );

    expect(result.factors.priceFit).toBe(0);
    expect(result.factors.venueAffinity).toBe(0.75);
  });
});

describe('buildExplanation', () => {
  it('falls back to a plain label when no factor carries real signal (the cold-start case)', () => {
    const cold = { ...NO_FACTORS, distanceScore: 0.5, priceFit: 1 };
    expect(buildExplanation(cold, explanationContext())).toBe(EXPLANATION_FALLBACK);
    expect(EXPLANATION_FALLBACK).toBe('Upcoming event');
  });

  it('reproduces the contract example: followed artists plus a real distance', () => {
    const factors = { ...NO_FACTORS, artistAffinity: 0.85, distanceScore: 0.92 };
    const text = buildExplanation(
      factors,
      explanationContext({
        matchedArtistNames: ['ISOxo', 'RL Grime'],
        distanceKm: 12 * KM_PER_MILE,
      }),
    );

    expect(text).toBe('You follow ISOxo and RL Grime, and this is 12 miles from your location');
  });

  it('keeps only the two strongest contributions: artist (0.35) and genre (0.25) beat distance (0.20)', () => {
    const factors = { ...NO_FACTORS, artistAffinity: 1, genreAffinity: 1, distanceScore: 1, venueAffinity: 1 };
    const text = buildExplanation(
      factors,
      explanationContext({
        matchedArtistNames: ['Skrillex'],
        matchedGenreNames: ['Dubstep'],
        distanceKm: 5,
        venueName: 'Mirage',
      }),
    );

    expect(text).toBe('You follow Skrillex, and this matches your Dubstep preferences');
  });

  it('orders clauses by contribution, not by the order the factors are checked', () => {
    // distance contributes 0.2*1 = 0.2; artist only 0.35*0.4 = 0.14, so distance leads.
    const factors = { ...NO_FACTORS, artistAffinity: 0.4, distanceScore: 1 };
    const text = buildExplanation(
      factors,
      explanationContext({ matchedArtistNames: ['Fisher'], distanceKm: 3 * KM_PER_MILE }),
    );

    expect(text).toBe('This is 3 miles from your location, and you follow Fisher');
  });

  it('names at most three followed artists and at most two genres', () => {
    const factors = { ...NO_FACTORS, artistAffinity: 1, genreAffinity: 1 };
    const text = buildExplanation(
      factors,
      explanationContext({
        matchedArtistNames: ['A', 'B', 'C', 'D'],
        matchedGenreNames: ['Bass', 'Trap', 'House'],
      }),
    );

    expect(text).toBe('You follow A, B and C, and this matches your Bass and Trap preferences');
  });

  it('never claims proximity from the neutral fallback distance', () => {
    const factors = { ...NO_FACTORS, distanceScore: 0.5 };
    expect(buildExplanation(factors, explanationContext({ distanceKm: null }))).toBe(EXPLANATION_FALLBACK);
  });

  it('does not cite a distance the user is beyond their radius for', () => {
    const factors = { ...NO_FACTORS, distanceScore: 0 };
    expect(buildExplanation(factors, explanationContext({ distanceKm: 900 }))).toBe(EXPLANATION_FALLBACK);
  });

  it('handles singular and sub-mile distances', () => {
    const factors = { ...NO_FACTORS, distanceScore: 1 };
    expect(buildExplanation(factors, explanationContext({ distanceKm: KM_PER_MILE }))).toBe(
      'This is 1 mile from your location',
    );
    expect(buildExplanation(factors, explanationContext({ distanceKm: 0.3 }))).toBe(
      'This is less than a mile from your location',
    );
  });

  it('mentions budget only when the user set a price preference and the event has a price', () => {
    const factors = { ...NO_FACTORS, priceFit: 1 };
    expect(buildExplanation(factors, explanationContext({ priceFitEvaluated: true }))).toBe(
      'This is within your budget',
    );
    expect(buildExplanation(factors, explanationContext({ priceFitEvaluated: false }))).toBe(
      EXPLANATION_FALLBACK,
    );
    expect(
      buildExplanation({ ...NO_FACTORS, priceFit: 0 }, explanationContext({ priceFitEvaluated: true })),
    ).toBe(EXPLANATION_FALLBACK);
  });

  it('mentions venue history when there is some', () => {
    const factors = { ...NO_FACTORS, venueAffinity: 0.5 };
    expect(buildExplanation(factors, explanationContext({ venueName: 'Brooklyn Mirage' }))).toBe(
      "You've been to Brooklyn Mirage before",
    );
  });

  it('breaks contribution ties in a fixed order (budget before venue history)', () => {
    const factors = { ...NO_FACTORS, priceFit: 1, venueAffinity: 1 };
    const text = buildExplanation(
      factors,
      explanationContext({ priceFitEvaluated: true, venueName: 'Elsewhere' }),
    );

    expect(text).toBe("This is within your budget, and you've been to Elsewhere before");
  });

  it('skips an affinity clause when there are no names to cite', () => {
    const factors = { ...NO_FACTORS, artistAffinity: 1, genreAffinity: 1 };
    expect(buildExplanation(factors, explanationContext())).toBe(EXPLANATION_FALLBACK);
  });
});
