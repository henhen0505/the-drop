import { createElement, useContext, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '../store/auth';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Gates its children behind authentication. Redirects to /login, carrying
 * the attempted location in router state so Login can navigate back after
 * a successful sign-in.
 */
export function ProtectedRoute({ children }: { children: ReactNode }): ReactNode {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return createElement(Navigate, { to: '/login', state: { from: location }, replace: true });
  }

  return children;
}

/**
 * Gates its children behind an authenticated ADMIN user. Non-admins are
 * bounced to the homepage rather than /login -- they *are* authenticated,
 * they just don't have access. This is client-side UX only:
 * requireRole('ADMIN') on the API itself is the real enforcement.
 */
export function AdminRoute({ children }: { children: ReactNode }): ReactNode {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return createElement(Navigate, { to: '/login', state: { from: location }, replace: true });
  }

  if (user?.role !== 'ADMIN') {
    return createElement(Navigate, { to: '/', replace: true });
  }

  return children;
}
