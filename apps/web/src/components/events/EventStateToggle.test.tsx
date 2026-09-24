import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MockAdapter from 'axios-mock-adapter';
import type { EventDetail } from '@the-drop/types';
import { apiClient } from '../../services/api';
import { AuthContext, type AuthContextValue } from '../../store/auth';
import { EventStateToggle } from './EventStateToggle';

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
  userState: 'GOING',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const authenticatedValue: AuthContextValue = {
  user: { id: 'u1', email: 'ada@example.com', displayName: 'Ada', role: 'USER', avatarUrl: null },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshAuth: vi.fn(),
  loginWithGoogle: vi.fn(),
};

describe('EventStateToggle', () => {
  let apiMock: MockAdapter;
  let queryClient: QueryClient;

  beforeEach(() => {
    apiMock = new MockAdapter(apiClient);
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['event', 'test-event'], eventFixture);
  });

  afterEach(() => {
    apiMock.restore();
  });

  function renderToggle() {
    return render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider value={authenticatedValue}>
            <EventStateToggle eventId="e1" />
          </AuthContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>,
    );
  }

  it('marks the button matching the current cached state as pressed', () => {
    renderToggle();
    expect(screen.getByRole('button', { name: 'Going' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Interested' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('clicking the already-active button clears the state via DELETE', async () => {
    apiMock.onDelete('/events/e1/state').reply(204);
    renderToggle();

    fireEvent.click(screen.getByRole('button', { name: 'Going' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Going' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
    expect(apiMock.history.delete).toHaveLength(1);
    expect(apiMock.history.put).toHaveLength(0);
  });

  it('clicking an inactive button sets the state via PUT', async () => {
    apiMock.onPut('/events/e1/state').reply(200, {
      data: { eventId: 'e1', state: 'INTERESTED', updatedAt: '2026-01-02T00:00:00.000Z' },
    });
    renderToggle();

    fireEvent.click(screen.getByRole('button', { name: 'Interested' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Interested' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(JSON.parse(apiMock.history.put[0]?.data)).toEqual({ state: 'INTERESTED' });
  });
});
