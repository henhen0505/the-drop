import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import type { EventDetail } from '@the-drop/types';
import { apiClient } from '../services/api';
import { useEventState } from './useEventState';

const eventFixture: EventDetail = {
  id: 'e1',
  title: 'Test Event',
  slug: 'test-event',
  description: null,
  imageUrl: null,
  startsAt: '2026-08-01T00:00:00.000Z',
  endsAt: null,
  timezone: 'America/New_York',
  venue: null,
  artists: [],
  genres: [],
  ticketLinks: [],
  sources: [],
  status: 'PUBLISHED',
  ageRestriction: null,
  doorTime: null,
  reentryPolicy: null,
  bagPolicy: null,
  prohibitedItems: null,
  dressCode: null,
  minPriceCents: null,
  artistCount: 0,
  confidence: 'COMMUNITY',
  primarySource: 'COMMUNITY',
  lastVerifiedAt: null,
  userState: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('useEventState', () => {
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

  it('seeds currentState from any cached event detail with a matching id', () => {
    queryClient.setQueryData(['event', 'test-event'], { ...eventFixture, userState: 'GOING' });

    const { result } = renderHook(() => useEventState('e1'), { wrapper });

    expect(result.current.currentState).toBe('GOING');
  });

  it('setState PUTs the new state and updates the event-detail cache on success', async () => {
    queryClient.setQueryData(['event', 'test-event'], eventFixture);
    apiMock.onPut('/events/e1/state').reply(200, {
      data: { eventId: 'e1', state: 'INTERESTED', updatedAt: '2026-01-02T00:00:00.000Z' },
    });

    const { result } = renderHook(() => useEventState('e1'), { wrapper });

    act(() => {
      result.current.setState('INTERESTED');
    });

    await waitFor(() => expect(result.current.currentState).toBe('INTERESTED'));
    expect(queryClient.getQueryData<EventDetail>(['event', 'test-event'])?.userState).toBe(
      'INTERESTED',
    );
    expect(JSON.parse(apiMock.history.put[0]?.data)).toEqual({ state: 'INTERESTED' });
  });

  it('clearState DELETEs (204, no body) and clears the event-detail cache on success', async () => {
    queryClient.setQueryData(['event', 'test-event'], { ...eventFixture, userState: 'GOING' });
    apiMock.onDelete('/events/e1/state').reply(204);

    const { result } = renderHook(() => useEventState('e1'), { wrapper });
    expect(result.current.currentState).toBe('GOING');

    act(() => {
      result.current.clearState();
    });

    await waitFor(() => expect(result.current.currentState).toBeNull());
    expect(queryClient.getQueryData<EventDetail>(['event', 'test-event'])?.userState).toBeNull();
    expect(apiMock.history.delete).toHaveLength(1);
  });
});
