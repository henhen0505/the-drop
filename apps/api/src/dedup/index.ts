export { processIncomingEvent, processPendingBatch } from './processor';
export { getDedupSettings, DEDUP_WEIGHTS } from './config';
export type {
  DedupResult,
  DedupSettings,
  MatchDecision,
  DecisionReason,
  NormalizedEvent,
  ScoreBreakdown,
} from './types';
