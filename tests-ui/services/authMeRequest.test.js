import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(),
}));

import { api } from '../../src/services/api';
import {
  AUTH_ME_FRESH_MS,
  fetchAuthMe,
  resetAuthMeRequestForTests,
  wasAuthMeFetchedRecently,
} from '../../src/services/authMeRequest.js';

describe('authMeRequest', () => {
  afterEach(() => {
    resetAuthMeRequestForTests();
    vi.clearAllMocks();
  });

  test('déduplique les appels in-flight vers /api/auth/me', async () => {
    let resolveMe;
    api.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMe = resolve;
        }),
    );
    const a = fetchAuthMe();
    const b = fetchAuthMe();
    expect(a).toBe(b);
    expect(api).toHaveBeenCalledTimes(1);
    resolveMe({ ok: true });
    await expect(a).resolves.toEqual({ ok: true });
    await expect(b).resolves.toEqual({ ok: true });
  });

  test('wasAuthMeFetchedRecently après succès', async () => {
    api.mockResolvedValue({ id: 1 });
    expect(wasAuthMeFetchedRecently()).toBe(false);
    await fetchAuthMe();
    expect(wasAuthMeFetchedRecently()).toBe(true);
    expect(wasAuthMeFetchedRecently(Date.now() + AUTH_ME_FRESH_MS + 1)).toBe(false);
  });
});
