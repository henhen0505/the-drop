// Artist follows are the most intentional signal, genre prefs are semi-explicit, distance is a
// practical but secondary constraint, and price/venue history are sparse or binary so they weigh least.
export const RECOMMENDATION_WEIGHTS = {
  artistAffinity: 0.35,
  genreAffinity: 0.25,
  distanceScore: 0.2,
  priceFit: 0.1,
  venueAffinity: 0.1,
} as const;

export const MAX_CANDIDATE_EVENTS = 500;

// Used whenever the user or the venue has no coordinates: no signal, so neither reward nor penalize.
export const DISTANCE_NEUTRAL = 0.5;

// Matches users.travel_radius_km's column default (~50 miles).
export const DEFAULT_TRAVEL_RADIUS_KM = 80;

export const KM_PER_MILE = 1.609344;

// Indexed by past visits at the venue, capped at the last entry (3+ visits).
export const VENUE_AFFINITY_BY_VISITS = [0, 0.5, 0.75, 1] as const;

// user_event_states values that count as having actually been to (or committed to) a venue.
export const VENUE_VISIT_STATES = ['ATTENDED', 'GOING', 'HAVE_TICKET'] as const;

export const EXPLANATION_ARTIST_LIMIT = 3;
export const EXPLANATION_GENRE_LIMIT = 2;
export const EXPLANATION_CLAUSE_LIMIT = 2;
export const EXPLANATION_FALLBACK = 'Upcoming event';
