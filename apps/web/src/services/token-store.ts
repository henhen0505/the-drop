/**
 * Module-level in-memory token store. Deliberately NOT React state: both
 * services/api.ts (axios interceptors) and store/auth.tsx (the React
 * context) need read/write access to the current tokens, and having api.ts
 * import the auth context would create a circular dependency between the
 * two modules. Tokens live only in memory (this module's closure) -- never
 * localStorage/sessionStorage -- so they're lost on page refresh, which is
 * why the auth provider re-establishes them via a silent /auth/refresh on
 * mount.
 */

export interface Tokens {
  accessToken: string | null;
  csrfToken: string | null;
}

let tokens: Tokens = { accessToken: null, csrfToken: null };

export function getTokens(): Tokens {
  return tokens;
}

export function setTokens(next: Tokens): void {
  tokens = next;
}

export function clearTokens(): void {
  tokens = { accessToken: null, csrfToken: null };
}
