import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../../services/api';
import { useReviewSubmission } from './useAdminSubmissions';

describe('useReviewSubmission', () => {
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

  it('approving a submission surfaces the dedup decision and resulting event id', async () => {
    apiMock.onPatch('/admin/submissions/s1').reply(200, {
      data: {
        id: 's1',
        eventTitle: 'Summer Bass Fest',
        eventStartsAt: '2026-08-01T00:00:00.000Z',
        venueId: null,
        venueNameRaw: null,
        venueAddressRaw: null,
        artistNames: [],
        description: null,
        posterImageUrl: null,
        ticketUrl: null,
        sourceUrl: null,
        ageRestriction: null,
        status: 'APPROVED',
        reviewNotes: null,
        reviewedAt: '2026-01-02T00:00:00.000Z',
        mergedEventId: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        resultEventId: 'e1',
        dedupDecision: 'AUTO_MERGE',
      },
    });

    const { result } = renderHook(() => useReviewSubmission(), { wrapper });

    act(() => {
      result.current.mutate({ id: 's1', body: { status: 'APPROVED' } });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.dedupDecision).toBe('AUTO_MERGE');
    expect(result.current.data?.resultEventId).toBe('e1');
    expect(JSON.parse(apiMock.history.patch[0]?.data)).toEqual({ status: 'APPROVED' });
  });
});
