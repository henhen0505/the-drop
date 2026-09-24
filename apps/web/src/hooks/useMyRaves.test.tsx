import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../services/api';
import { useMyRaves } from './useMyRaves';

describe('useMyRaves', () => {
  let apiMock: MockAdapter;
  let queryClient: QueryClient;

  beforeEach(() => {
    apiMock = new MockAdapter(apiClient);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiMock.onGet('/users/me/raves').reply(200, { data: [], cursor: null });
  });

  afterEach(() => {
    apiMock.restore();
  });

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  it('the "All" tab sends no state filter and upcoming=true', async () => {
    const { result } = renderHook(() => useMyRaves({ upcoming: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiMock.history.get[0]?.params).toEqual({
      state: undefined,
      upcoming: true,
      limit: undefined,
      cursor: undefined,
    });
  });

  it('the "Interested" tab sends state=INTERESTED', async () => {
    const { result } = renderHook(() => useMyRaves({ states: ['INTERESTED'], upcoming: true }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiMock.history.get[0]?.params.state).toBe('INTERESTED');
    expect(apiMock.history.get[0]?.params.upcoming).toBe(true);
  });

  it('the "Past" tab sends no state filter and upcoming=false', async () => {
    const { result } = renderHook(() => useMyRaves({ upcoming: false }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(apiMock.history.get[0]?.params.state).toBeUndefined();
    expect(apiMock.history.get[0]?.params.upcoming).toBe(false);
  });
});
