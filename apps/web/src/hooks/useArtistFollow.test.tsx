import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../services/api';
import { useArtistFollow } from './useArtistFollow';

describe('useArtistFollow', () => {
  let apiMock: MockAdapter;
  let queryClient: QueryClient;

  beforeEach(() => {
    apiMock = new MockAdapter(apiClient);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    apiMock.restore();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  it('follow POSTs to /artists/:id/follow and invalidates the artist-profile cache', async () => {
    apiMock.onPost('/artists/a1/follow').reply(201, {
      data: { artistId: 'a1', followedAt: '2026-01-01T00:00:00.000Z' },
    });
    // Seed the cache so there's a query for invalidateQueries to actually mark stale.
    queryClient.setQueryData(['artist', 'test-artist'], { id: 'a1', isFollowed: false });

    const { result } = renderHook(() => useArtistFollow('a1', 'test-artist'), { wrapper });

    act(() => {
      result.current.follow();
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(apiMock.history.post).toHaveLength(1);
    expect(queryClient.getQueryState(['artist', 'test-artist'])?.isInvalidated).toBe(true);
  });

  it('unfollow DELETEs (204, no body) to /artists/:id/follow', async () => {
    apiMock.onDelete('/artists/a1/follow').reply(204);

    const { result } = renderHook(() => useArtistFollow('a1', 'test-artist'), { wrapper });

    act(() => {
      result.current.unfollow();
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(apiMock.history.delete).toHaveLength(1);
  });
});
