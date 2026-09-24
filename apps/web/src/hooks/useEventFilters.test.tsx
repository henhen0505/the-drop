import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useEventFilters } from './useEventFilters';

function wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={['/events']}>{children}</MemoryRouter>;
}

describe('useEventFilters', () => {
  it('starts with no filters set from an empty URL', () => {
    const { result } = renderHook(() => useEventFilters(), { wrapper });
    expect(result.current.filters).toEqual({});
  });

  it('round-trips filter values through the URL', () => {
    const { result } = renderHook(() => useEventFilters(), { wrapper });

    act(() => {
      result.current.setFilter('city', 'Brooklyn');
    });
    expect(result.current.filters.city).toBe('Brooklyn');

    act(() => {
      result.current.setFilter('priceMin', 2000);
    });
    expect(result.current.filters.priceMin).toBe(2000);

    act(() => {
      result.current.setSort('price');
    });
    expect(result.current.filters.sort).toBe('price');

    // Only 'date' and 'price' are valid sorts -- anything else (e.g. a
    // hand-edited URL with sort=relevance) is dropped rather than passed
    // through, since the backend throws NotImplementedError for it.
    act(() => {
      result.current.setFilter('sort', 'relevance');
    });
    expect(result.current.filters.sort).toBeUndefined();
  });

  it('clearFilters removes every filter from the URL', () => {
    const { result } = renderHook(() => useEventFilters(), { wrapper });

    // Each setFilter call is in its own act() -- in real usage these come
    // from separate DOM change events, each getting its own render cycle
    // before the next fires, so this matches how the URL state actually
    // updates (setSearchParams reads searchParams from render-time closure,
    // not a queued-updater like useState).
    act(() => {
      result.current.setFilter('city', 'Brooklyn');
    });
    act(() => {
      result.current.setFilter('genreId', 'g1');
    });
    expect(result.current.filters).toEqual({ city: 'Brooklyn', genreId: 'g1' });

    act(() => {
      result.current.clearFilters();
    });
    expect(result.current.filters).toEqual({});
  });

  it('setFilter with an empty string clears that single filter', () => {
    const { result } = renderHook(() => useEventFilters(), { wrapper });

    act(() => {
      result.current.setFilter('city', 'Brooklyn');
    });
    expect(result.current.filters.city).toBe('Brooklyn');

    act(() => {
      result.current.setFilter('city', '');
    });
    expect(result.current.filters.city).toBeUndefined();
  });
});
