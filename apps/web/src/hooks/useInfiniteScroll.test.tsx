import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useInfiniteScroll, type InfiniteScrollSource } from './useInfiniteScroll';

let capturedCallback: IntersectionObserverCallback | undefined;
let observeSpy: ReturnType<typeof vi.fn>;
let disconnectSpy: ReturnType<typeof vi.fn>;
let originalIntersectionObserver: typeof IntersectionObserver;

function triggerIntersect(isIntersecting: boolean) {
  capturedCallback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
}

function TestComponent(props: InfiniteScrollSource) {
  const { sentinelRef } = useInfiniteScroll(props);
  return <div data-testid="sentinel" ref={sentinelRef} />;
}

describe('useInfiniteScroll', () => {
  beforeEach(() => {
    originalIntersectionObserver = globalThis.IntersectionObserver;
    observeSpy = vi.fn();
    disconnectSpy = vi.fn();
    capturedCallback = undefined;

    class CapturingIntersectionObserver implements IntersectionObserver {
      readonly root: Element | Document | null = null;
      readonly rootMargin: string = '';
      readonly thresholds: ReadonlyArray<number> = [];

      constructor(callback: IntersectionObserverCallback) {
        capturedCallback = callback;
      }

      observe = observeSpy;
      unobserve = vi.fn();
      disconnect = disconnectSpy;
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }

    globalThis.IntersectionObserver =
      CapturingIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  it('observes the sentinel on mount and disconnects on unmount', () => {
    const fetchNextPage = vi.fn();
    const { unmount } = render(
      <TestComponent fetchNextPage={fetchNextPage} hasNextPage={true} isFetchingNextPage={false} />,
    );

    expect(observeSpy).toHaveBeenCalledTimes(1);

    unmount();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('calls fetchNextPage when the sentinel intersects and more pages are available', () => {
    const fetchNextPage = vi.fn();
    render(
      <TestComponent fetchNextPage={fetchNextPage} hasNextPage={true} isFetchingNextPage={false} />,
    );

    triggerIntersect(true);

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('does not call fetchNextPage when the sentinel is not intersecting', () => {
    const fetchNextPage = vi.fn();
    render(
      <TestComponent fetchNextPage={fetchNextPage} hasNextPage={true} isFetchingNextPage={false} />,
    );

    triggerIntersect(false);

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does not call fetchNextPage when there is no next page', () => {
    const fetchNextPage = vi.fn();
    render(
      <TestComponent
        fetchNextPage={fetchNextPage}
        hasNextPage={false}
        isFetchingNextPage={false}
      />,
    );

    triggerIntersect(true);

    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does not call fetchNextPage while a fetch is already in flight', () => {
    const fetchNextPage = vi.fn();
    render(
      <TestComponent fetchNextPage={fetchNextPage} hasNextPage={true} isFetchingNextPage={true} />,
    );

    triggerIntersect(true);

    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});
