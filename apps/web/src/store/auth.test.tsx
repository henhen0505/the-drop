import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import MockAdapter from 'axios-mock-adapter';
import { apiClient, refreshClient } from '../services/api';
import { clearTokens, getTokens } from '../services/token-store';
import { AuthProvider } from './auth';
import { useAuth } from '../hooks/useAuth';

function Probe() {
  const { user, isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div>loading</div>;
  return <div>{isAuthenticated ? `user:${user?.displayName}` : 'anonymous'}</div>;
}

const profileFixture = {
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
};

describe('AuthProvider silent refresh on mount', () => {
  let apiMock: MockAdapter;
  let refreshMock: MockAdapter;

  beforeEach(() => {
    apiMock = new MockAdapter(apiClient);
    refreshMock = new MockAdapter(refreshClient);
    clearTokens();
  });

  afterEach(() => {
    apiMock.restore();
    refreshMock.restore();
  });

  it('restores the session when the refresh cookie is still valid', async () => {
    refreshMock.onPost('/auth/refresh').reply(200, {
      data: { accessToken: 'access-1', csrfToken: 'csrf-1' },
    });
    apiMock.onGet('/users/me').reply(200, { data: profileFixture });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByText('loading')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('user:Ada')).toBeInTheDocument());
    expect(getTokens()).toEqual({ accessToken: 'access-1', csrfToken: 'csrf-1' });
  });

  it('leaves the user unauthenticated when the refresh cookie is invalid or missing', async () => {
    refreshMock.onPost('/auth/refresh').reply(401, {
      error: { code: 'UNAUTHORIZED', message: 'Missing refresh token' },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
    expect(getTokens()).toEqual({ accessToken: null, csrfToken: null });
  });
});

describe('AuthProvider login/logout', () => {
  let apiMock: MockAdapter;
  let refreshMock: MockAdapter;

  beforeEach(() => {
    apiMock = new MockAdapter(apiClient);
    refreshMock = new MockAdapter(refreshClient);
    refreshMock.onPost('/auth/refresh').reply(401, {
      error: { code: 'UNAUTHORIZED', message: 'no session' },
    });
    clearTokens();
  });

  afterEach(() => {
    apiMock.restore();
    refreshMock.restore();
  });

  it('login stores tokens in memory and populates the user', async () => {
    apiMock.onPost('/auth/login').reply(200, {
      data: { user: { id: 'u1', email: 'ada@example.com', displayName: 'Ada', role: 'USER', avatarUrl: null }, accessToken: 'access-1', csrfToken: 'csrf-1' },
    });

    let auth: ReturnType<typeof useAuth> | undefined;
    function Capture() {
      auth = useAuth();
      return auth.isLoading ? <div>loading</div> : <div>{auth.isAuthenticated ? 'in' : 'out'}</div>;
    }

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument());

    await auth!.login('ada@example.com', 'password123');

    await waitFor(() => expect(screen.getByText('in')).toBeInTheDocument());
    expect(getTokens()).toEqual({ accessToken: 'access-1', csrfToken: 'csrf-1' });
  });

  it('logout clears in-memory tokens and user state', async () => {
    apiMock.onPost('/auth/login').reply(200, {
      data: { user: { id: 'u1', email: 'ada@example.com', displayName: 'Ada', role: 'USER', avatarUrl: null }, accessToken: 'access-1', csrfToken: 'csrf-1' },
    });
    apiMock.onPost('/auth/logout').reply(204);

    let auth: ReturnType<typeof useAuth> | undefined;
    function Capture() {
      auth = useAuth();
      return auth.isLoading ? <div>loading</div> : <div>{auth.isAuthenticated ? 'in' : 'out'}</div>;
    }

    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument());
    await auth!.login('ada@example.com', 'password123');
    await waitFor(() => expect(screen.getByText('in')).toBeInTheDocument());

    await auth!.logout();

    await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument());
    expect(getTokens()).toEqual({ accessToken: null, csrfToken: null });
  });
});
