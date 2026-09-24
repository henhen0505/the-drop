import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import type { NotificationItem } from '@the-drop/types';
import { apiClient } from '../services/api';
import { useNotifications } from './useNotifications';

const notification: NotificationItem = {
  id: 'n1',
  type: 'EVENT_TOMORROW',
  title: 'Your event is tomorrow',
  body: null,
  data: { eventId: 'e1' },
  readAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('useNotifications', () => {
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

  it('reads unreadCount from the non-standard envelope without dropping it', async () => {
    apiMock.onGet('/notifications').reply(200, { data: [notification], cursor: null, unreadCount: 3 });

    const { result } = renderHook(() => useNotifications(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.unreadCount).toBe(3);
    expect(result.current.notifications).toEqual([notification]);
  });

  it('markRead PATCHes /notifications/:id/read and refetches the list', async () => {
    apiMock
      .onGet('/notifications')
      .replyOnce(200, { data: [notification], cursor: null, unreadCount: 1 })
      .onGet('/notifications')
      .reply(200, {
        data: [{ ...notification, readAt: '2026-01-02T00:00:00.000Z' }],
        cursor: null,
        unreadCount: 0,
      });
    apiMock.onPatch('/notifications/n1/read').reply(200, {
      data: { id: 'n1', readAt: '2026-01-02T00:00:00.000Z' },
    });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    act(() => {
      result.current.markRead('n1');
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(apiMock.history.patch).toHaveLength(1);
  });

  it('markAllRead POSTs /notifications/read-all and refetches the list', async () => {
    apiMock
      .onGet('/notifications')
      .replyOnce(200, { data: [notification], cursor: null, unreadCount: 1 })
      .onGet('/notifications')
      .reply(200, { data: [], cursor: null, unreadCount: 0 });
    apiMock.onPost('/notifications/read-all').reply(200, { data: { markedCount: 1 } });

    const { result } = renderHook(() => useNotifications(), { wrapper });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));

    act(() => {
      result.current.markAllRead();
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(apiMock.history.post).toHaveLength(1);
  });
});
