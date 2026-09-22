import type { EventStatus, SourceType } from '@the-drop/types';
import type { db } from '../db/client';

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Source-agnostic event shape produced by extractors and consumed by the dedup pipeline. */
export interface NormalizedEvent {
  title: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  venueCity: string | null;
  venueState: string | null;
  venueTicketmasterId: string | null;
  venueSeatgeekId: string | null;
  artistNames: string[];
  description: string | null;
  imageUrl: string | null;
  ticketUrl: string | null;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  sourceUrl: string | null;
  externalId: string | null;
  // Not every source determines a status (only Ticketmaster's dates.status.code does today).
  status?: EventStatus;
  // Curated field: only human sources (community submissions) provide it.
  ageRestriction?: string | null;
}

export interface CandidateEvent {
  eventId: string;
  title: string;
  startsAt: Date;
  venueId: string | null;
  venueName: string | null;
  venueTicketmasterId: string | null;
  venueSeatgeekId: string | null;
  artistNames: string[];
  sourceTypes: SourceType[];
}

export interface ScoreBreakdown {
  venueScore: number;
  dateScore: number;
  artistScore: number;
  titleScore: number;
  composite: number;
}

export interface ScoredCandidate {
  candidate: CandidateEvent;
  scores: ScoreBreakdown;
}

export type MatchDecision = 'AUTO_MERGE' | 'REVIEW' | 'NO_MATCH';

export type DecisionReason =
  | 'SCORE'
  | 'REVIEW_ONLY_MODE'
  | 'ADJACENT_DATE_GUARD'
  | 'BELOW_REVIEW_THRESHOLD'
  | 'NO_CANDIDATES'
  | 'EXTERNAL_ID_MATCH'
  | 'ALREADY_QUEUED';

export interface DedupSettings {
  autoMergeEnabled: boolean;
  autoMergeThreshold: number;
  reviewThreshold: number;
}

export interface SourceRecord {
  sourceType: SourceType;
  externalId: string | null;
  rawData: unknown;
}

export interface DedupResult {
  incomingId: string;
  status: 'PROCESSED' | 'FAILED' | 'SKIPPED';
  decision: MatchDecision | null;
  reason: DecisionReason | null;
  matchedEventId: string | null;
  score: number | null;
  error?: string;
}
