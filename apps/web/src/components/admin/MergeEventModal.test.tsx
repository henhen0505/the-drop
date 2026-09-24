import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import type { AdminEventListItem } from '@the-drop/types';
import { apiClient } from '../../services/api';
import { MergeEventModal } from './MergeEventModal';

const keepEvent: AdminEventListItem = {
  id: 'e1',
  title: 'Keep Me',
  slug: 'keep-me',
  startsAt: '2026-08-01T00:00:00.000Z',
  status: 'PUBLISHED',
  venue: null,
  artistCount: 0,
  primarySource: 'ADMIN',
  confidence: 'ADMIN_VERIFIED',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sources: [],
};

const mergeCandidate: AdminEventListItem = {
  id: 'e2',
  title: 'Duplicate Event',
  slug: 'duplicate-event',
  startsAt: '2026-08-01T00:00:00.000Z',
  status: 'DRAFT',
  venue: null,
  artistCount: 0,
  primarySource: 'TICKETMASTER',
  confidence: 'UNVERIFIED',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sources: [],
};

describe('MergeEventModal', () => {
  let apiMock: MockAdapter;
  let queryClient: QueryClient;

  beforeEach(() => {
    apiMock = new MockAdapter(apiClient);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    apiMock.restore();
  });

  function renderModal() {
    render(
      <QueryClientProvider client={queryClient}>
        <MergeEventModal keepEvent={keepEvent} onClose={() => {}} onMerged={() => {}} />
      </QueryClientProvider>,
    );
  }

  it('toggling a mergeable field to "merge" includes it in fieldOverrides on submit', async () => {
    apiMock.onGet('/admin/events').reply(200, { data: [mergeCandidate], cursor: null });
    apiMock.onPost('/admin/events/merge').reply(200, {
      data: { ...keepEvent, description: null, imageUrl: null, artists: [], genres: [] },
    });

    renderModal();

    fireEvent.change(screen.getByPlaceholderText('Search events by title'), {
      target: { value: 'Duplicate' },
    });
    const targetOption = await screen.findByRole('button', { name: /Duplicate Event/ });
    fireEvent.click(targetOption);

    const titleRow = screen.getByText('Title').closest('li');
    if (!titleRow) throw new Error('Title field row not found');
    fireEvent.click(within(titleRow).getByRole('button', { name: 'Keep current' }));

    fireEvent.click(screen.getByRole('button', { name: 'Merge events' }));

    await waitFor(() => expect(apiMock.history.post).toHaveLength(1));
    const body = JSON.parse(apiMock.history.post[0]?.data ?? '{}');
    expect(body.keepEventId).toBe('e1');
    expect(body.mergeEventId).toBe('e2');
    expect(body.fieldOverrides).toEqual({ title: 'merge' });
  });

  it('submits with no fieldOverrides when every field is left at "keep"', async () => {
    apiMock.onGet('/admin/events').reply(200, { data: [mergeCandidate], cursor: null });
    apiMock.onPost('/admin/events/merge').reply(200, {
      data: { ...keepEvent, description: null, imageUrl: null, artists: [], genres: [] },
    });

    renderModal();

    fireEvent.change(screen.getByPlaceholderText('Search events by title'), {
      target: { value: 'Duplicate' },
    });
    const targetOption = await screen.findByRole('button', { name: /Duplicate Event/ });
    fireEvent.click(targetOption);

    fireEvent.click(screen.getByRole('button', { name: 'Merge events' }));

    await waitFor(() => expect(apiMock.history.post).toHaveLength(1));
    const body = JSON.parse(apiMock.history.post[0]?.data ?? '{}');
    expect(body.fieldOverrides).toBeUndefined();
  });
});
