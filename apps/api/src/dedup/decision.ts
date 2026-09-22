import type { SourceType } from '@the-drop/types';
import { ADJACENT_DATE_GUARD } from './config';
import type { DecisionReason, DedupSettings, MatchDecision, ScoredCandidate } from './types';

export interface Decision {
  decision: MatchDecision;
  reason: DecisionReason;
}

/**
 * Consecutive residency nights at one venue score ~0.95 but are different events, so a
 * same-provider listing on an adjacent day must never auto-merge.
 */
export function adjacentDateGuardTriggered(
  top: ScoredCandidate,
  incomingSource: SourceType,
): boolean {
  return (
    top.scores.venueScore >= ADJACENT_DATE_GUARD.minVenueScore &&
    top.scores.dateScore === ADJACENT_DATE_GUARD.adjacentDateScore &&
    top.candidate.sourceTypes.includes(incomingSource)
  );
}

export function decide(
  top: ScoredCandidate | undefined,
  incomingSource: SourceType,
  settings: DedupSettings,
): Decision {
  if (!top) return { decision: 'NO_MATCH', reason: 'NO_CANDIDATES' };

  const score = top.scores.composite;
  if (score < settings.reviewThreshold) {
    return { decision: 'NO_MATCH', reason: 'BELOW_REVIEW_THRESHOLD' };
  }
  if (!settings.autoMergeEnabled) {
    return { decision: 'REVIEW', reason: 'REVIEW_ONLY_MODE' };
  }
  if (score >= settings.autoMergeThreshold) {
    if (adjacentDateGuardTriggered(top, incomingSource)) {
      return { decision: 'REVIEW', reason: 'ADJACENT_DATE_GUARD' };
    }
    return { decision: 'AUTO_MERGE', reason: 'SCORE' };
  }
  return { decision: 'REVIEW', reason: 'SCORE' };
}
