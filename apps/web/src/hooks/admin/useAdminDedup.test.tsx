import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../../services/api';
import { useResolveCandidate } from './useAdminDedup';

describe('useResolveCandidate', () => {
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

  it('sends action=merge in the PATCH body', async () => {
    apiMock.onPatch('/admin/dedup/candidates/c1').reply(200, {
      data: { id: 'c1', status: 'MANUAL_MERGED', resultEventId: 'e1', reviewedBy: 'admin-1', reviewedAt: '2026-01-01T00:00:00.000Z' },
    });

    const { result } = renderHook(() => useResolveCandidate(), { wrapper });

    act(() => {
      result.current.mutate({ id: 'c1', action: 'merge' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(JSON.parse(apiMock.history.patch[0]?.data)).toEqual({ action: 'merge' });
    expect(result.current.data?.status).toBe('MANUAL_MERGED');
  });

  it('sends action=reject in the PATCH body', async () => {
    apiMock.onPatch('/admin/dedup/candidates/c2').reply(200, {
      data: { id: 'c2', status: 'REJECTED', resultEventId: 'e2', reviewedBy: 'admin-1', reviewedAt: '2026-01-01T00:00:00.000Z' },
    });

    const { result } = renderHook(() => useResolveCandidate(), { wrapper });

    act(() => {
      result.current.mutate({ id: 'c2', action: 'reject' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(JSON.parse(apiMock.history.patch[0]?.data)).toEqual({ action: 'reject' });
    expect(result.current.data?.status).toBe('REJECTED');
  });
});
