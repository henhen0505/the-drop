import styles from './StatusBadge.module.css';

export type StatusBadgeVariant = 'event' | 'submission' | 'dedup' | 'confidence' | 'source';

// Every value these variants can take, mapped to a badge tone. Statuses not
// listed here (there aren't any left, but new enum values fail safe) fall
// back to the neutral tone in the component below.
const TONE_BY_VALUE: Record<string, 'positive' | 'negative' | 'neutral' | 'warning'> = {
  // EventStatus
  DRAFT: 'neutral',
  PUBLISHED: 'positive',
  CANCELLED: 'negative',
  POSTPONED: 'warning',
  COMPLETED: 'neutral',
  // SubmissionStatus
  PENDING: 'warning',
  APPROVED: 'positive',
  REJECTED: 'negative',
  MERGED: 'positive',
  // DedupMatchStatus
  AUTO_MERGED: 'positive',
  PENDING_REVIEW: 'warning',
  MANUAL_MERGED: 'positive',
  // Shared with SubmissionStatus's REJECTED above.
};

interface StatusBadgeProps {
  status: string;
  variant: StatusBadgeVariant;
}

/** Colored badge for any raw status/enum string -- EventStatus,
 * SubmissionStatus, DedupMatchStatus, ConfidenceLevel, SourceType. The
 * `variant` prop is informational only (kept for callers to document what
 * they're rendering); the color comes from the status value itself. */
export function StatusBadge({ status, variant }: StatusBadgeProps) {
  const tone = TONE_BY_VALUE[status] ?? 'neutral';
  return (
    <span className={`${styles.badge} ${styles[tone]}`} data-variant={variant}>
      {status}
    </span>
  );
}
