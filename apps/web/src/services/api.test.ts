import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { api, apiClient, ApiRequestError, refreshClient } from './api';
import { clearTokens, getTokens, setTokens } from './token-store';

// jsdom's window.location.assign is non-configurable, so it can't be
// spied on directly with vi.spyOn -- replace the whole location object
// for the duration of each test instead.
const originalLocation = window.location;

function stubLocationAssign() {
  const assign = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, assign },
  });
  return assign;
}

function restoreLocation() {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
}

describe('apiClient 401 refresh-and-retry', () => {
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
    restoreLocation();
    vi.restoreAllMocks();
  });

  it('retries the original request exactly once after a successful refresh', async () => {
    setTokens({ accessToken: 'expired-token', csrfToken: 'csrf-1' });

    let getCallCount = 0;
    apiMock.onGet('/users/me').reply(() => {
      getCallCount += 1;
      const { accessToken } = getTokens();
      if (accessToken !== 'fresh-token') {
        return [
          401,
          { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' } },
        ];
      }
      return [200, { data: { id: 'u1' } }];
    });

    refreshMock.onPost('/auth/refresh').reply(200, {
      data: { accessToken: 'fresh-token', csrfToken: 'csrf-2' },
    });

    const result = await api.get('/users/me');

    expect(result).toEqual({ id: 'u1' });
    expect(getCallCount).toBe(2); // original 401 + one retry
    expect(getTokens()).toEqual({ accessToken: 'fresh-token', csrfToken: 'csrf-2' });
  });

  it('redirects to /login and rejects once refresh also fails', async () => {
    setTokens({ accessToken: 'expired-token', csrfToken: 'csrf-1' });

    apiMock.onGet('/users/me').reply(401, {
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' },
    });
    refreshMock.onPost('/auth/refresh').reply(401, {
      error: { code: 'UNAUTHORIZED', message: 'Refresh token expired' },
    });

    const assignSpy = stubLocationAssign();

    await expect(api.get('/users/me')).rejects.toBeInstanceOf(ApiRequestError);

    expect(assignSpy).toHaveBeenCalledWith('/login');
    expect(getTokens()).toEqual({ accessToken: null, csrfToken: null });
  });

  it('shares a single refresh call across concurrent 401s (no duplicate refresh requests)', async () => {
    setTokens({ accessToken: 'expired-token', csrfToken: 'csrf-1' });

    let refreshCallCount = 0;
    refreshMock.onPost('/auth/refresh').reply(() => {
      refreshCallCount += 1;
      return [200, { data: { accessToken: 'fresh-token', csrfToken: 'csrf-2' } }];
    });

    apiMock.onGet('/a').reply(() => {
      const { accessToken } = getTokens();
      return accessToken === 'fresh-token'
        ? [200, { data: 'a' }]
        : [401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }];
    });
    apiMock.onGet('/b').reply(() => {
      const { accessToken } = getTokens();
      return accessToken === 'fresh-token'
        ? [200, { data: 'b' }]
        : [401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }];
    });

    const [a, b] = await Promise.all([api.get('/a'), api.get('/b')]);

    expect(a).toBe('a');
    expect(b).toBe('b');
    expect(refreshCallCount).toBe(1);
  });

  it('does not retry a second time if the retried request 401s again', async () => {
    setTokens({ accessToken: 'expired-token', csrfToken: 'csrf-1' });

    let getCallCount = 0;
    apiMock.onGet('/users/me').reply(() => {
      getCallCount += 1;
      return [401, { error: { code: 'UNAUTHORIZED', message: 'still invalid' } }];
    });
    refreshMock.onPost('/auth/refresh').reply(200, {
      data: { accessToken: 'fresh-token', csrfToken: 'csrf-2' },
    });

    const assignSpy = stubLocationAssign();

    await expect(api.get('/users/me')).rejects.toBeInstanceOf(ApiRequestError);
    expect(getCallCount).toBe(2); // original + exactly one retry, no third attempt
    expect(assignSpy).not.toHaveBeenCalled();
  });
});

describe('api.cursor', () => {
  let apiMock: MockAdapter;

  beforeEach(() => {
    apiMock = new MockAdapter(apiClient);
    clearTokens();
  });

  afterEach(() => {
    apiMock.restore();
  });

  it('returns the { data, cursor } body directly, unlike api.get which unwraps one level', async () => {
    apiMock.onGet('/events').reply(200, { data: [{ id: 'e1' }], cursor: 'next-cursor' });

    const result = await api.cursor('/events');

    expect(result).toEqual({ data: [{ id: 'e1' }], cursor: 'next-cursor' });
  });

  it('throws ApiRequestError on the { error: {...} } failure envelope', async () => {
    apiMock.onGet('/events').reply(400, {
      error: { code: 'VALIDATION_ERROR', message: 'bad cursor' },
    });

    await expect(api.cursor('/events')).rejects.toBeInstanceOf(ApiRequestError);
  });
});
