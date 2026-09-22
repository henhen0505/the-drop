import { haversineKm } from '../utils/haversine';
import {
  DISTANCE_NEUTRAL,
  EXPLANATION_ARTIST_LIMIT,
  EXPLANATION_CLAUSE_LIMIT,
  EXPLANATION_FALLBACK,
  EXPLANATION_GENRE_LIMIT,
  KM_PER_MILE,
  RECOMMENDATION_WEIGHTS,
  VENUE_AFFINITY_BY_VISITS,
} from './config';

export interface RecommendationFactors {
  artistAffinity: number;
  genreAffinity: number;
  distanceScore: number;
  priceFit: number;
  venueAffinity: number;
}

export interface EventScoreInput {
  eventArtistIds: readonly string[];
  eventGenreIds: readonly string[];
  eventMinPriceCents: number | null;
  venueLatitude: number | null;
  venueLongitude: number | null;
  userFollowedArtistIds: ReadonlySet<string>;
  userPreferredGenreIds: ReadonlySet<string>;
  userLatitude: number | null;
  userLongitude: number | null;
  userTravelRadiusKm: number;
  userPriceMinCents: number | null;
  userPriceMaxCents: number | null;
  venuePastVisitCount: number;
}

export interface ScoredEvent {
  factors: RecommendationFactors;
  score: number;
  /** Real distance between the user and the venue, or null when either side has no coordinates. */
  distanceKm: number | null;
}

export interface ExplanationContext {
  matchedArtistNames: readonly string[];
  matchedGenreNames: readonly string[];
  distanceKm: number | null;
  /** True only when the user set a price preference AND the event has a known price to check it against. */
  priceFitEvaluated: boolean;
  venueName: string | null;
}

function overlapRatio(eventIds: readonly string[], userIds: ReadonlySet<string>): number {
  if (eventIds.length === 0) return 0;
  const matches = eventIds.filter((id) => userIds.has(id)).length;
  return matches / eventIds.length;
}

/** Fraction of this event's lineup the user already follows (asymmetric on purpose, not Jaccard). */
export function scoreArtistAffinity(
  eventArtistIds: readonly string[],
  userFollowedArtistIds: ReadonlySet<string>,
): number {
  return overlapRatio(eventArtistIds, userFollowedArtistIds);
}

/** Fraction of this event's genres the user has marked as preferred. */
export function scoreGenreAffinity(
  eventGenreIds: readonly string[],
  userPreferredGenreIds: ReadonlySet<string>,
): number {
  return overlapRatio(eventGenreIds, userPreferredGenreIds);
}

export function distanceKmOrNull(
  userLatitude: number | null,
  userLongitude: number | null,
  venueLatitude: number | null,
  venueLongitude: number | null,
): number | null {
  if (
    userLatitude === null ||
    userLongitude === null ||
    venueLatitude === null ||
    venueLongitude === null
  ) {
    return null;
  }
  return haversineKm(userLatitude, userLongitude, venueLatitude, venueLongitude);
}

/** 1.0 at the user's location, decaying linearly to 0.0 at (and beyond) their travel radius. */
export function scoreDistance(distanceKm: number | null, travelRadiusKm: number): number {
  if (distanceKm === null) return DISTANCE_NEUTRAL;
  if (travelRadiusKm <= 0) return distanceKm === 0 ? 1 : 0;
  return Math.min(1, Math.max(0, 1 - distanceKm / travelRadiusKm));
}

/**
 * Binary in-budget check rather than a price comparison (architecture/provider-notes.md section 3:
 * fee structures differ across vendors, so a precise "cheaper here" signal would mislead).
 */
export function scorePriceFit(
  eventMinPriceCents: number | null,
  userPriceMinCents: number | null,
  userPriceMaxCents: number | null,
): number {
  if (userPriceMinCents === null && userPriceMaxCents === null) return 1;
  if (eventMinPriceCents === null) return 1;
  if (userPriceMaxCents !== null && eventMinPriceCents > userPriceMaxCents) return 0;
  if (userPriceMinCents !== null && eventMinPriceCents < userPriceMinCents) return 0;
  return 1;
}

export function scoreVenueAffinity(pastVisitCount: number): number {
  if (pastVisitCount <= 0) return 0;
  const index = Math.min(Math.floor(pastVisitCount), VENUE_AFFINITY_BY_VISITS.length - 1);
  return VENUE_AFFINITY_BY_VISITS[index] ?? 0;
}

export function computeComposite(factors: RecommendationFactors): number {
  return (
    RECOMMENDATION_WEIGHTS.artistAffinity * factors.artistAffinity +
    RECOMMENDATION_WEIGHTS.genreAffinity * factors.genreAffinity +
    RECOMMENDATION_WEIGHTS.distanceScore * factors.distanceScore +
    RECOMMENDATION_WEIGHTS.priceFit * factors.priceFit +
    RECOMMENDATION_WEIGHTS.venueAffinity * factors.venueAffinity
  );
}

export function scoreEvent(input: EventScoreInput): ScoredEvent {
  const distanceKm = distanceKmOrNull(
    input.userLatitude,
    input.userLongitude,
    input.venueLatitude,
    input.venueLongitude,
  );

  const factors: RecommendationFactors = {
    artistAffinity: scoreArtistAffinity(input.eventArtistIds, input.userFollowedArtistIds),
    genreAffinity: scoreGenreAffinity(input.eventGenreIds, input.userPreferredGenreIds),
    distanceScore: scoreDistance(distanceKm, input.userTravelRadiusKm),
    priceFit: scorePriceFit(
      input.eventMinPriceCents,
      input.userPriceMinCents,
      input.userPriceMaxCents,
    ),
    venueAffinity: scoreVenueAffinity(input.venuePastVisitCount),
  };

  return { factors, score: computeComposite(factors), distanceKm };
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function milesClause(distanceKm: number): string {
  const miles = Math.round(distanceKm / KM_PER_MILE);
  if (miles < 1) return 'this is less than a mile from your location';
  return `this is ${miles} ${miles === 1 ? 'mile' : 'miles'} from your location`;
}

interface Clause {
  contribution: number;
  text: string;
}

/**
 * Deterministic template (no model call): the top contributing factors, each as a clause,
 * joined with ", and ". Factors sitting at their neutral default contribute no clause, so a
 * cold-start user gets the plain fallback instead of a claim the data doesn't support.
 */
export function buildExplanation(
  factors: RecommendationFactors,
  context: ExplanationContext,
): string {
  const candidates: Clause[] = [];

  if (factors.artistAffinity > 0 && context.matchedArtistNames.length > 0) {
    const names = joinNames(context.matchedArtistNames.slice(0, EXPLANATION_ARTIST_LIMIT));
    candidates.push({
      contribution: RECOMMENDATION_WEIGHTS.artistAffinity * factors.artistAffinity,
      text: `you follow ${names}`,
    });
  }

  if (factors.genreAffinity > 0 && context.matchedGenreNames.length > 0) {
    const names = joinNames(context.matchedGenreNames.slice(0, EXPLANATION_GENRE_LIMIT));
    candidates.push({
      contribution: RECOMMENDATION_WEIGHTS.genreAffinity * factors.genreAffinity,
      text: `this matches your ${names} preferences`,
    });
  }

  if (context.distanceKm !== null && factors.distanceScore > 0) {
    candidates.push({
      contribution: RECOMMENDATION_WEIGHTS.distanceScore * factors.distanceScore,
      text: milesClause(context.distanceKm),
    });
  }

  if (context.priceFitEvaluated && factors.priceFit === 1) {
    candidates.push({
      contribution: RECOMMENDATION_WEIGHTS.priceFit * factors.priceFit,
      text: 'this is within your budget',
    });
  }

  if (factors.venueAffinity > 0 && context.venueName) {
    candidates.push({
      contribution: RECOMMENDATION_WEIGHTS.venueAffinity * factors.venueAffinity,
      text: `you've been to ${context.venueName} before`,
    });
  }

  // Array.prototype.sort is stable, so equal contributions keep the order pushed above.
  const top = candidates
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, EXPLANATION_CLAUSE_LIMIT);

  if (top.length === 0) return EXPLANATION_FALLBACK;

  const sentence = top.map((clause) => clause.text).join(', and ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
