import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import { apiClient, refreshClient } from '../services/api';
import { clearTokens } from '../services/token-store';
import { AuthProvider } from '../store/auth';
import SubmitEvent from './SubmitEvent';

function futureDatetimeLocal(): string {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return future.toISOString().slice(0, 16);
}

async function renderAsUser() {
  const refreshMock = new MockAdapter(refreshClient);
  const apiMock = new MockAdapter(apiClient);
  clearTokens();

  refreshMock.onPost('/auth/refresh').reply(200, {
    data: { accessToken: 'access-1', csrfToken: 'csrf-1' },
  });
  apiMock.onGet('/users/me').reply(200, {
    data: {
      id: 'u1',
      email: 'ada@example.com',
      displayName: 'Ada',
      role: 'USER',
      avatarUrl: null,
      preferredCity: null,
      preferredState: null,
      travelRadiusKm: null,
      priceMin: null,
      priceMax: null,
      emailVerified: true,
      createdAt: '2020-01-01T00:00:00.000Z',
    },
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/submit']}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SubmitEvent />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );

  await screen.findByRole('heading', { name: 'Submit an Event' });
  return { apiMock, refreshMock };
}

describe('SubmitEvent', () => {
  afterEach(() => {
    // MockAdapters are recreated per test in renderAsUser and never shared,
    // so nothing to restore globally here beyond clearing tokens.
    clearTokens();
  });

  it('manual venue mode sends venueNameRaw/venueAddressRaw, not venueId', async () => {
    const { apiMock } = await renderAsUser();
    apiMock.onPost('/submissions').reply(201, {
      data: { id: 's1', status: 'PENDING', createdAt: '2026-01-01T00:00:00.000Z' },
    });

    fireEvent.change(screen.getByLabelText('Event title'), {
      target: { value: 'Test Rave' },
    });
    fireEvent.change(screen.getByLabelText('Date & time'), {
      target: { value: futureDatetimeLocal() },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enter manually' }));
    fireEvent.change(screen.getByPlaceholderText('Venue name'), {
      target: { value: 'Warehouse 5' },
    });
    fireEvent.change(screen.getByPlaceholderText('Venue address (optional)'), {
      target: { value: '123 Main St' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Submit event' }));

    await waitFor(() => expect(apiMock.history.post).toHaveLength(1));
    const body = JSON.parse(apiMock.history.post[0]?.data ?? '{}');
    expect(body.venueNameRaw).toBe('Warehouse 5');
    expect(body.venueAddressRaw).toBe('123 Main St');
    expect(body.venueId).toBeUndefined();
    expect(body.eventTitle).toBe('Test Rave');
  });

  it('search mode with a selected venue sends venueId, not venueNameRaw', async () => {
    const { apiMock } = await renderAsUser();
    apiMock.onGet('/venues').reply(200, {
      data: [{ id: 'v1', name: 'Warehouse 5', slug: 'warehouse-5', city: 'Brooklyn', state: 'NY', country: 'US', imageUrl: null, venueType: null, capacity: null }],
      cursor: null,
    });
    apiMock.onPost('/submissions').reply(201, {
      data: { id: 's1', status: 'PENDING', createdAt: '2026-01-01T00:00:00.000Z' },
    });

    fireEvent.change(screen.getByLabelText('Event title'), {
      target: { value: 'Test Rave' },
    });
    fireEvent.change(screen.getByLabelText('Date & time'), {
      target: { value: futureDatetimeLocal() },
    });

    fireEvent.change(screen.getByPlaceholderText('Venue name'), {
      target: { value: 'Warehouse' },
    });

    const venueOption = await screen.findByRole('button', { name: /Warehouse 5/ });
    fireEvent.click(venueOption);

    fireEvent.click(screen.getByRole('button', { name: 'Submit event' }));

    await waitFor(() => expect(apiMock.history.post).toHaveLength(1));
    const body = JSON.parse(apiMock.history.post[0]?.data ?? '{}');
    expect(body.venueId).toBe('v1');
    expect(body.venueNameRaw).toBeUndefined();
  });
});
