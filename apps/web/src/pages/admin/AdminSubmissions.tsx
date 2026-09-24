import { useState } from 'react';
import type { AdminEventListItem, ReviewedSubmission, SubmissionStatus } from '@the-drop/types';
import { AdminEventPicker } from '../../components/admin/AdminEventPicker';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAdminSubmissions, useReviewSubmission } from '../../hooks/admin/useAdminSubmissions';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { ApiRequestError } from '../../services/api';
import styles from './AdminSubmissions.module.css';

const STATUS_TABS: SubmissionStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'MERGED'];

type PendingAction = 'APPROVED' | 'REJECTED' | 'MERGED';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function AdminSubmissions() {
  const [status, setStatus] = useState<SubmissionStatus>('PENDING');
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<PendingAction | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [mergeTarget, setMergeTarget] = useState<AdminEventListItem | null>(null);
  const [results, setResults] = useState<Record<string, ReviewedSubmission>>({});

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAdminSubmissions({ status });
  const { mutate: reviewSubmission, isPending, error } = useReviewSubmission();
  const { sentinelRef } = useInfiniteScroll({
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  });

  const submissions = data?.pages.flatMap((page) => page.data) ?? [];

  function startAction(submissionId: string, action: PendingAction) {
    setActiveSubmissionId(submissionId);
    setActiveAction(action);
    setReviewNotes('');
    setMergeTarget(null);
  }

  function cancelAction() {
    setActiveSubmissionId(null);
    setActiveAction(null);
    setMergeTarget(null);
  }

  function confirmAction() {
    if (!activeSubmissionId || !activeAction) return;
    if (activeAction === 'MERGED' && !mergeTarget) return;

    reviewSubmission(
      {
        id: activeSubmissionId,
        body: {
          status: activeAction,
          reviewNotes: reviewNotes.trim() || undefined,
          mergedEventId: activeAction === 'MERGED' ? mergeTarget!.id : undefined,
        },
      },
      {
        onSuccess: (result) => {
          setResults((prev) => ({ ...prev, [activeSubmissionId]: result }));
          cancelAction();
        },
      },
    );
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Submissions</h1>

      <div className={styles.tabs}>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={tab === status ? styles.tabActive : styles.tab}
            onClick={() => setStatus(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <EmptyState title="Couldn't load submissions" description="Please try again later." />
      ) : submissions.length === 0 ? (
        <EmptyState title="No submissions" description="Nothing in this queue right now." />
      ) : (
        <>
          <ul className={styles.list}>
            {submissions.map((submission) => {
              const result = results[submission.id];
              const isActive = activeSubmissionId === submission.id;
              return (
                <li key={submission.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <span className={styles.eventTitle}>{submission.eventTitle}</span>
                    <StatusBadge status={submission.status} variant="submission" />
                  </div>
                  <p className={styles.meta}>{formatDate(submission.eventStartsAt)}</p>
                  <p className={styles.meta}>
                    Submitted by {submission.submitter.displayName} ({submission.submitter.role})
                  </p>
                  <p className={styles.meta}>
                    {submission.venue
                      ? `${submission.venue.name}, ${submission.venue.city}`
                      : submission.venueNameRaw
                        ? `${submission.venueNameRaw}${submission.venueAddressRaw ? `, ${submission.venueAddressRaw}` : ''}`
                        : 'No venue provided'}
                  </p>
                  <p className={styles.meta}>
                    {submission.artistNames.length > 0
                      ? submission.artistNames.join(', ')
                      : 'No artists listed'}
                  </p>
                  <p className={styles.meta}>Created {formatDate(submission.createdAt)}</p>

                  {result && (
                    <p className={styles.resultNote}>
                      Result: {result.status}
                      {result.dedupDecision ? ` · dedup: ${result.dedupDecision}` : ''}
                      {result.resultEventId ? ` · event ${result.resultEventId}` : ''}
                    </p>
                  )}

                  {submission.status === 'PENDING' && (
                    <div className={styles.actions}>
                      {!isActive ? (
                        <>
                          <button
                            type="button"
                            className={styles.approveButton}
                            onClick={() => startAction(submission.id, 'APPROVED')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className={styles.rejectButton}
                            onClick={() => startAction(submission.id, 'REJECTED')}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className={styles.mergeButton}
                            onClick={() => startAction(submission.id, 'MERGED')}
                          >
                            Merge
                          </button>
                        </>
                      ) : (
                        <div className={styles.reviewPanel}>
                          <label htmlFor={`notes-${submission.id}`}>Review notes (optional)</label>
                          <textarea
                            id={`notes-${submission.id}`}
                            rows={2}
                            value={reviewNotes}
                            onChange={(event) => setReviewNotes(event.target.value)}
                          />
                          {activeAction === 'MERGED' &&
                            (mergeTarget ? (
                              <p className={styles.meta}>
                                Merging into <strong>{mergeTarget.title}</strong>{' '}
                                <button type="button" className={styles.changeTarget} onClick={() => setMergeTarget(null)}>
                                  change
                                </button>
                              </p>
                            ) : (
                              <AdminEventPicker onSelect={setMergeTarget} />
                            ))}
                          {error && (
                            <p className={styles.error}>
                              {error instanceof ApiRequestError ? error.message : 'Review failed.'}
                            </p>
                          )}
                          <div className={styles.reviewActions}>
                            <button type="button" className={styles.cancelLink} onClick={cancelAction}>
                              Cancel
                            </button>
                            <button
                              type="button"
                              className={styles.confirmButton}
                              onClick={confirmAction}
                              disabled={isPending || (activeAction === 'MERGED' && !mergeTarget)}
                            >
                              {isPending ? 'Saving...' : `Confirm ${(activeAction ?? '').toLowerCase()}`}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {hasNextPage && <div ref={sentinelRef} className={styles.sentinel} />}
          {isFetchingNextPage && <LoadingSpinner size="sm" />}
        </>
      )}
    </div>
  );
}
