import { useState } from 'react';
import type { DedupMatchStatus } from '@the-drop/types';
import { DedupCandidateCard } from '../../components/admin/DedupCandidateCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useDedupCandidates, useResolveCandidate } from '../../hooks/admin/useAdminDedup';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { ApiRequestError } from '../../services/api';
import styles from './AdminDedupReview.module.css';

const STATUS_TABS: DedupMatchStatus[] = ['PENDING_REVIEW', 'AUTO_MERGED', 'MANUAL_MERGED', 'REJECTED'];

export default function AdminDedupReview() {
  const [status, setStatus] = useState<DedupMatchStatus>('PENDING_REVIEW');

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useDedupCandidates({ status });
  const { mutate: resolveCandidate, isPending, error: resolveError } = useResolveCandidate();
  const { sentinelRef } = useInfiniteScroll({
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  });

  const candidates = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dedup Review</h1>

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

      {resolveError && (
        <p className={styles.error}>
          {resolveError instanceof ApiRequestError ? resolveError.message : 'Failed to resolve candidate.'}
        </p>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <EmptyState title="Couldn't load match candidates" description="Please try again later." />
      ) : candidates.length === 0 ? (
        <EmptyState title="No match candidates" description="Nothing in this queue right now." />
      ) : (
        <>
          <div className={styles.list}>
            {candidates.map((candidate) => (
              <DedupCandidateCard
                key={candidate.id}
                candidate={candidate}
                isResolving={isPending}
                onMerge={(id) => resolveCandidate({ id, action: 'merge' })}
                onReject={(id) => resolveCandidate({ id, action: 'reject' })}
              />
            ))}
          </div>
          {hasNextPage && <div ref={sentinelRef} className={styles.sentinel} />}
          {isFetchingNextPage && <LoadingSpinner size="sm" />}
        </>
      )}
    </div>
  );
}
