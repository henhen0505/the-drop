import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// vitest.config.ts doesn't set `globals: true`, so React Testing Library's
// auto-cleanup (which looks for a global `afterEach`) never engages on its
// own -- wire it explicitly so each test starts from an empty DOM.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement IntersectionObserver -- useInfiniteScroll needs a
// stub present so any component that renders it doesn't crash in tests.
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

globalThis.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver;
