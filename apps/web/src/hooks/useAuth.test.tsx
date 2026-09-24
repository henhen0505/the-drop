import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MockAdapter from 'axios-mock-adapter';
import { apiClient, refreshClient } from '../services/api';
import { clearTokens } from '../services/token-store';
import { AuthProvider } from '../store/auth';
import { AdminRoute, ProtectedRoute } from './useAuth';

describe('ProtectedRoute', () => {
  let refreshMock: MockAdapter;
  let apiMock: MockAdapter;

  beforeEach(() => {
    refreshMock = new MockAdapter(refreshClient);
    apiMock = new MockAdapter(apiClient);
    clearTokens();
  });

  afterEach(() => {
    refreshMock.restore();
    apiMock.restore();
  });

  it('redirects to /login when there is no valid session', async () => {
    refreshMock.onPost('/auth/refresh').reply(401, {
      error: { code: 'UNAUTHORIZED', message: 'no session' },
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <div>secret content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('login page')).toBeInTheDocument());
    expect(screen.queryByText('secret content')).not.toBeInTheDocument();
  });

  it('renders the protected content once the session is restored', async () => {
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

    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <div>secret content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('secret content')).toBeInTheDocument());
  });
});

describe('AdminRoute', () => {
  let refreshMock: MockAdapter;
  let apiMock: MockAdapter;

  beforeEach(() => {
    refreshMock = new MockAdapter(refreshClient);
    apiMock = new MockAdapter(apiClient);
    clearTokens();
  });

  afterEach(() => {
    refreshMock.restore();
    apiMock.restore();
  });

  function renderAdminRoute() {
    render(
      <MemoryRouter initialEntries={['/admin/events']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route path="/" element={<div>home page</div>} />
            <Route
              path="/admin/events"
              element={
                <AdminRoute>
                  <div>admin content</div>
                </AdminRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it('redirects to /login when there is no valid session', async () => {
    refreshMock.onPost('/auth/refresh').reply(401, {
      error: { code: 'UNAUTHORIZED', message: 'no session' },
    });

    renderAdminRoute();

    await waitFor(() => expect(screen.getByText('login page')).toBeInTheDocument());
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });

  it('redirects to / when the signed-in user is not an admin', async () => {
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

    renderAdminRoute();

    await waitFor(() => expect(screen.getByText('home page')).toBeInTheDocument());
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });

  it('renders the admin content for a signed-in ADMIN user', async () => {
    refreshMock.onPost('/auth/refresh').reply(200, {
      data: { accessToken: 'access-1', csrfToken: 'csrf-1' },
    });
    apiMock.onGet('/users/me').reply(200, {
      data: {
        id: 'u2',
        email: 'admin@example.com',
        displayName: 'Admin',
        role: 'ADMIN',
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

    renderAdminRoute();

    await waitFor(() => expect(screen.getByText('admin content')).toBeInTheDocument());
  });
});
