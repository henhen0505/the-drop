import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { apiClient } from '../../services/api';
import AdminEvents from './AdminEvents';

const eventFixture = {
  id: 'e1',
  title: 'Summer Bass Fest',
  slug: 'summer-bass-fest',
  startsAt: '2026-08-01T00:00:00.000Z',
  status: 'PUBLISHED',
  venue: null,
  artistCount: 2,
  primarySource: 'ADMIN',
  confidence: 'ADMIN_VERIFIED',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sources: [],
};

describe('AdminEvents', () => {
  let apiMock: MockAdapter;
  let queryClient: QueryClient;

  beforeEach(() => {
    apiMock = new MockAdapter(apiClient);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    apiMock.restore();
  });

  function renderPage() {
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AdminEvents />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  }

  it('does not fire the delete request until the confirm dialog is confirmed', async () => {
    apiMock.onGet('/admin/events').reply(200, { data: [eventFixture], cursor: null });
    apiMock.onDelete('/admin/events/e1').reply(204);

    renderPage();

    await screen.findByText('Summer Bass Fest');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Delete "Summer Bass Fest"/)).toBeInTheDocument();
    expect(apiMock.history.delete).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(apiMock.history.delete).toHaveLength(1));
  });

  it('cancelling the confirm dialog never sends the delete request', async () => {
    apiMock.onGet('/admin/events').reply(200, { data: [eventFixture], cursor: null });
    apiMock.onDelete('/admin/events/e1').reply(204);

    renderPage();

    await screen.findByText('Summer Bass Fest');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(apiMock.history.delete).toHaveLength(0);
  });
});
