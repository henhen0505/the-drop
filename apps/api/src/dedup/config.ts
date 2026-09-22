import { config } from '../config/index';
import type { DedupSettings } from './types';

// architecture/dedup-engine.md Step 4
export const DEDUP_WEIGHTS = {
  venue: 0.3,
  date: 0.25,
  artist: 0.25,
  title: 0.2,
} as const;

export const DEFAULT_DEDUP_SETTINGS: DedupSettings = {
  autoMergeEnabled: false,
  autoMergeThreshold: 0.85,
  reviewThreshold: 0.55,
};

// Step 5 "Same-Venue-Adjacent-Date Guard"
export const ADJACENT_DATE_GUARD = {
  minVenueScore: 0.9,
  adjacentDateScore: 0.8,
} as const;

// Step 4c: trigram fallback for artist-name pairs that don't match exactly
export const ARTIST_FUZZY_THRESHOLD = 0.7;

// Reusing an existing venue row when a source sends a venue we don't know by ID.
// Stricter than the 0.6 "likely same venue" scoring signal because a wrong reuse
// silently attaches events to the wrong venue.
export const VENUE_REUSE_THRESHOLD = 0.8;

// Calendar-day comparison for date scoring; matches events.timezone's column default.
export const DEDUP_TIMEZONE = 'America/New_York';

export const CANDIDATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MAX_CANDIDATES = 200;

export function getDedupSettings(): DedupSettings {
  return {
    autoMergeEnabled: config.dedup.autoMergeEnabled,
    autoMergeThreshold: config.dedup.autoMergeThreshold,
    reviewThreshold: config.dedup.reviewThreshold,
  };
}
