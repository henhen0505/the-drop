import { Link } from 'react-router-dom';
import type { DedupCandidateItem } from '@the-drop/types';
import { ScoreBar } from './ScoreBar';
import styles from './DedupCandidateCard.module.css';

interface DedupCandidateCardProps {
  candidate: DedupCandidateItem;
  onMerge: (id: string) => void;
  onReject: (id: string) => void;
  isResolving?: boolean;
}

// Neither side of a dedup candidate carries the event's own timezone, so this
// renders in the viewer's local time rather than formatEventDateTime's
// event-timezone convention.
function formatLocal(startsAt: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startsAt));
}

/** Side-by-side comparison of an incoming ingested/submitted record against
 * the existing event the dedup pipeline flagged it as a possible match for. */
export function DedupCandidateCard({ candidate, onMerge, onReject, isResolving = false }: DedupCandidateCardProps) {
  const { incoming, candidate: existing } = candidate;

  return (
    <div className={styles.card}>
      <div className={styles.panels}>
        <div className={styles.panel}>
          <h4 className={styles.panelTitle}>Incoming</h4>
          <p className={styles.eventTitle}>{incoming.title}</p>
          <p className={styles.meta}>{formatLocal(incoming.startsAt)}</p>
          <p className={styles.meta}>{incoming.venueName ?? 'No venue'}</p>
          <p className={styles.meta}>
            {incoming.artists.length > 0 ? incoming.artists.join(', ') : 'No artists listed'}
          </p>
          {incoming.sourceType && <p className={styles.source}>{incoming.sourceType}</p>}
        </div>

        <div className={styles.panel}>
          <h4 className={styles.panelTitle}>Existing Event</h4>
          <Link to={`/events/${existing.id}`} className={styles.eventTitle}>
            {existing.title}
          </Link>
          <p className={styles.meta}>{formatLocal(existing.startsAt)}</p>
          <p className={styles.meta}>
            {existing.venue ? `${existing.venue.name}, ${existing.venue.city}` : 'No venue'}
          </p>
          <p className={styles.meta}>
            {existing.artists.length > 0 ? existing.artists.join(', ') : 'No artists listed'}
          </p>
        </div>
      </div>

      <div className={styles.scores}>
        <ScoreBar label="Overall" value={candidate.score} />
        {candidate.venueScore !== null && <ScoreBar label="Venue" value={candidate.venueScore} />}
        {candidate.dateScore !== null && <ScoreBar label="Date" value={candidate.dateScore} />}
        {candidate.titleScore !== null && <ScoreBar label="Title" value={candidate.titleScore} />}
        {candidate.artistScore !== null && <ScoreBar label="Artists" value={candidate.artistScore} />}
      </div>

      {candidate.status === 'PENDING_REVIEW' && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.rejectButton}
            onClick={() => onReject(candidate.id)}
            disabled={isResolving}
          >
            Reject
          </button>
          <button
            type="button"
            className={styles.mergeButton}
            onClick={() => onMerge(candidate.id)}
            disabled={isResolving}
          >
            Merge
          </button>
        </div>
      )}
    </div>
  );
}
