import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../../services/api';
import { useAdminEvents, useDeleteEvent } from './useAdminEvents';

describe('useAdminEvents', () => {
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

  it('round-trips q/status/stale filters as GET /admin/events query params', async () => {
    apiMock.onGet('/admin/events').reply(200, { data: [], cursor: null });

    const { result } = renderHook(
      () => useAdminEvents({ q: 'bass fest', status: 'PUBLISHED', stale: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiMock.history.get[0]?.params).toEqual({
      q: 'bass fest',
      status: 'PUBLISHED',
      stale: true,
      cursor: undefined,
    });
  });

  it('omits filters that are left unset', async () => {
    apiMock.onGet('/admin/events').reply(200, { data: [], cursor: null });

    const { result } = renderHook(() => useAdminEvents(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiMock.history.get[0]?.params.q).toBeUndefined();
    expect(apiMock.history.get[0]?.params.status).toBeUndefined();
    expect(apiMock.history.get[0]?.params.stale).toBeUndefined();
  });
});

describe('useDeleteEvent', () => {
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

  it('DELETEs (204, no body) to /admin/events/:id and invalidates the list cache', async () => {
    apiMock.onDelete('/admin/events/e1').reply(204);
    queryClient.setQueryData(['admin-events', {}], { pages: [{ data: [], cursor: null }] });

    const { result } = renderHook(() => useDeleteEvent(), { wrapper });

    act(() => {
      result.current.mutate('e1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiMock.history.delete).toHaveLength(1);
    expect(queryClient.getQueryState(['admin-events', {}])?.isInvalidated).toBe(true);
  });
});
