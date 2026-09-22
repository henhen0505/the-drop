import {
  ARTIST_FUZZY_THRESHOLD,
  DEDUP_TIMEZONE,
  DEDUP_WEIGHTS,
} from './config';
import { normalize } from './normalizer';
import { trigramSimilarity } from './similarity';
import type { CandidateEvent, NormalizedEvent, ScoreBreakdown, ScoredCandidate } from './types';

export function scoreVenue(incoming: NormalizedEvent, candidate: CandidateEvent): number {
  const idPairs: Array<[string | null, string | null]> = [
    [incoming.venueTicketmasterId, candidate.venueTicketmasterId],
    [incoming.venueSeatgeekId, candidate.venueSeatgeekId],
  ];
  const comparable = idPairs.filter(
    (pair): pair is [string, string] => pair[0] !== null && pair[1] !== null,
  );
  if (comparable.length > 0) {
    return comparable.some(([a, b]) => a === b) ? 1.0 : 0.0;
  }

  if (!incoming.venueName || !candidate.venueName) return 0.0;
  return trigramSimilarity(
    normalize(incoming.venueName, 'venue'),
    normalize(candidate.venueName, 'venue'),
  );
}

function localDayNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DEDUP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  const [year, month, day] = parts.split('-').map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function scoreDate(incomingStartsAt: Date, candidateStartsAt: Date): number {
  const diff = Math.abs(localDayNumber(incomingStartsAt) - localDayNumber(candidateStartsAt));
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.8;
  if (diff <= 2) return 0.3;
  return 0.0;
}

export function scoreArtists(incomingNames: string[], candidateNames: string[]): number {
  const incoming = [...new Set(incomingNames.map((n) => normalize(n, 'artist')).filter(Boolean))];
  const candidate = [...new Set(candidateNames.map((n) => normalize(n, 'artist')).filter(Boolean))];

  if (incoming.length === 0 && candidate.length === 0) return 0.5;
  if (incoming.length === 0 || candidate.length === 0) return 0.3;

  const candidateSet = new Set(candidate);
  const unmatchedIncoming = incoming.filter((name) => !candidateSet.has(name));
  const exact = incoming.length - unmatchedIncoming.length;

  const incomingSet = new Set(incoming);
  const unmatchedCandidate = candidate.filter((name) => !incomingSet.has(name));

  let fuzzy = 0;
  for (const name of unmatchedIncoming) {
    const idx = unmatchedCandidate.findIndex(
      (other) => trigramSimilarity(name, other) > ARTIST_FUZZY_THRESHOLD,
    );
    if (idx !== -1) {
      unmatchedCandidate.splice(idx, 1);
      fuzzy++;
    }
  }

  const matches = exact + fuzzy;
  const union = incoming.length + candidate.length - matches;
  return matches / union;
}

export function scoreTitle(incoming: NormalizedEvent, candidate: CandidateEvent): number {
  return trigramSimilarity(
    normalize(incoming.title, 'title', { venueName: incoming.venueName }),
    normalize(candidate.title, 'title', { venueName: candidate.venueName }),
  );
}

export function computeComposite(
  scores: Omit<ScoreBreakdown, 'composite'>,
): number {
  return (
    DEDUP_WEIGHTS.venue * scores.venueScore +
    DEDUP_WEIGHTS.date * scores.dateScore +
    DEDUP_WEIGHTS.artist * scores.artistScore +
    DEDUP_WEIGHTS.title * scores.titleScore
  );
}

export function scoreCandidate(incoming: NormalizedEvent, candidate: CandidateEvent): ScoredCandidate {
  const venueScore = scoreVenue(incoming, candidate);
  const dateScore = scoreDate(new Date(incoming.startsAt), candidate.startsAt);
  const artistScore = scoreArtists(incoming.artistNames, candidate.artistNames);
  const titleScore = scoreTitle(incoming, candidate);
  const composite = computeComposite({ venueScore, dateScore, artistScore, titleScore });

  return { candidate, scores: { venueScore, dateScore, artistScore, titleScore, composite } };
}

export function scoreCandidates(
  incoming: NormalizedEvent,
  candidates: CandidateEvent[],
): ScoredCandidate[] {
  return candidates
    .map((candidate) => scoreCandidate(incoming, candidate))
    .sort(
      (a, b) =>
        b.scores.composite - a.scores.composite ||
        a.candidate.eventId.localeCompare(b.candidate.eventId),
    );
}
