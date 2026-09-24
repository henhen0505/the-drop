import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MockAdapter from 'axios-mock-adapter';
import App from './App';
import { AuthProvider } from './store/auth';
import { apiClient, refreshClient } from './services/api';
import { clearTokens } from './services/token-store';

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('App routing', () => {
  let refreshMock: MockAdapter;
  let apiMock: MockAdapter;

  beforeEach(() => {
    refreshMock = new MockAdapter(refreshClient);
    refreshMock.onPost('/auth/refresh').reply(401, {
      error: { code: 'UNAUTHORIZED', message: 'no session' },
    });
    apiMock = new MockAdapter(apiClient);
    apiMock.onGet('/events').reply(200, { data: [], cursor: null });
    apiMock.onGet('/genres').reply(200, { data: [] });
    apiMock.onGet('/search').reply(200, { data: { events: [], artists: [], venues: [] } });
    clearTokens();
  });

  afterEach(() => {
    refreshMock.restore();
    apiMock.restore();
  });

  it('shows the login page at /login', async () => {
    renderAt('/login');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('shows the register page at /register', async () => {
    renderAt('/register');
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeInTheDocument();
  });

  it('shows the home page at / for an unauthenticated visitor (no longer redirects to /login)', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Find your next rave' })).toBeInTheDocument();
  });

  it('shows the event discovery page at /events', async () => {
    renderAt('/events');
    expect(await screen.findByText('No events match your filters')).toBeInTheDocument();
  });

  it('shows the event detail page at /events/:slug', async () => {
    apiMock.onGet('/events/summer-bass-fest').reply(200, {
      data: {
        id: 'e1',
        title: 'Summer Bass Fest',
        slug: 'summer-bass-fest',
        description: null,
        imageUrl: null,
        startsAt: '2026-08-01T02:00:00.000Z',
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
      },
    });
    apiMock.onGet('/events/e1/similar').reply(200, { data: [] });

    renderAt('/events/summer-bass-fest');
    expect(await screen.findByRole('heading', { name: 'Summer Bass Fest' })).toBeInTheDocument();
  });

  it('shows the search results page at /search', async () => {
    renderAt('/search?q=bass');
    expect(await screen.findByText('No results found')).toBeInTheDocument();
  });

  it('shows a 404 page for an unmatched route', async () => {
    renderAt('/this-route-does-not-exist');
    expect(await screen.findByText('404')).toBeInTheDocument();
  });

  it('shows the artist profile page at /artists/:slug', async () => {
    apiMock.onGet('/artists/night-drive').reply(200, {
      data: {
        id: 'a1',
        name: 'Night Drive',
        slug: 'night-drive',
        imageUrl: null,
        bio: null,
        genres: [],
        spotifyUrl: null,
        soundcloudUrl: null,
        appleMusicUrl: null,
        followerCount: 0,
        isFollowed: false,
        confidence: 'COMMUNITY',
        primarySource: 'COMMUNITY',
        upcomingEventCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    apiMock.onGet('/artists/night-drive/events').reply(200, { data: [], cursor: null });

    renderAt('/artists/night-drive');
    expect(await screen.findByRole('heading', { name: 'Night Drive' })).toBeInTheDocument();
  });

  it('shows the venue profile page at /venues/:slug', async () => {
    apiMock.onGet('/venues/the-warehouse').reply(200, {
      data: {
        id: 'v1',
        name: 'The Warehouse',
        slug: 'the-warehouse',
        address: null,
        city: 'Brooklyn',
        state: 'NY',
        country: 'US',
        postalCode: null,
        latitude: null,
        longitude: null,
        timezone: null,
        capacity: null,
        venueType: null,
        imageUrl: null,
        typicalAgeRestriction: null,
        typicalBagPolicy: null,
        confidence: 'COMMUNITY',
        primarySource: 'COMMUNITY',
        upcomingEventCount: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    apiMock.onGet('/venues/the-warehouse/events').reply(200, { data: [], cursor: null });

    renderAt('/venues/the-warehouse');
    expect(await screen.findByRole('heading', { name: 'The Warehouse' })).toBeInTheDocument();
  });

  it('redirects /my-raves to /login when signed out', async () => {
    renderAt('/my-raves');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('redirects /submit to /login when signed out', async () => {
    renderAt('/submit');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('redirects /profile to /login when signed out', async () => {
    renderAt('/profile');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});
