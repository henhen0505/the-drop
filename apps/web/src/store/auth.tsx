import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthResponse, AuthUser, GoogleAuthResponse, User } from '@the-drop/types';
import { api, apiClient, CSRF_HEADER, refreshAccessToken } from '../services/api';
import { clearTokens, getTokens, setTokens } from '../services/token-store';

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<{ isNewUser: boolean }>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toAuthUser(profile: User): AuthUser {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    role: profile.role,
    avatarUrl: profile.avatarUrl,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<AuthResponse['data']>('/auth/login', { email, password });
    setTokens({ accessToken: result.accessToken, csrfToken: result.csrfToken });
    setUser(result.user);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const result = await api.post<AuthResponse['data']>('/auth/register', {
      email,
      password,
      displayName,
    });
    setTokens({ accessToken: result.accessToken, csrfToken: result.csrfToken });
    setUser(result.user);
  }, []);

  const loginWithGoogle = useCallback(async (idToken: string) => {
    const result = await api.post<GoogleAuthResponse['data']>('/auth/google', { idToken });
    setTokens({ accessToken: result.accessToken, csrfToken: result.csrfToken });
    setUser(result.user);
    return { isNewUser: result.isNewUser };
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      await refreshAccessToken();
      const profile = await api.get<User>('/users/me');
      setUser(toAuthUser(profile));
    } catch {
      clearTokens();
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    const { csrfToken } = getTokens();
    try {
      // 204 No Content on success -- call apiClient directly rather than the
      // api.* helpers, which assume a `{ data: T }` body to unwrap.
      await apiClient.post('/auth/logout', undefined, {
        headers: csrfToken ? { [CSRF_HEADER]: csrfToken } : undefined,
      });
    } catch {
      // Local state is cleared below regardless of whether the server call
      // succeeded -- an unreachable API shouldn't trap the user in a
      // logged-in UI.
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshAuth();
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
      refreshAuth,
      loginWithGoogle,
    }),
    [user, isLoading, login, register, logout, refreshAuth, loginWithGoogle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
