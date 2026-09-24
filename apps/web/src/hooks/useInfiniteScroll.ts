import { useEffect, useRef } from 'react';

/** The subset of a TanStack `useInfiniteQuery` result this hook needs. */
export interface InfiniteScrollSource {
  fetchNextPage: () => unknown;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

/**
 * Generic IntersectionObserver-based infinite-scroll trigger. Attach the
 * returned `sentinelRef` to a bottom sentinel `<div>`; when it scrolls into
 * view, `fetchNextPage` is called (gated on `hasNextPage &&
 * !isFetchingNextPage` so it never double-fires mid-fetch or past the last
 * page).
 */
export function useInfiniteScroll({
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
}: InfiniteScrollSource) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return { sentinelRef };
}
