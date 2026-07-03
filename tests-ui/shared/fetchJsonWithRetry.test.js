import { describe, expect, test, vi } from 'vitest';
import {
  fetchJsonWithRetry,
  REQUEST_TIMEOUT_USER_MESSAGE,
} from '../../src/shared/fetchJsonWithRetry.js';

function jsonRes(status, body, { ok = status < 400 } = {}) {
  return {
    ok,
    status,
    headers: {
      get: (name) => (String(name).toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function html503() {
  return {
    ok: false,
    status: 503,
    headers: {
      get: (name) => (String(name).toLowerCase() === 'content-type' ? 'text/html' : null),
    },
    json: async () => {
      throw new Error('not json');
    },
    text: async () => '<html><body>Service Unavailable</body></html>',
  };
}

const buildHttpError = ({ res, errBody }) => {
  const err = new Error(errBody.error || `HTTP ${res.status}`);
  err.status = res.status;
  err.body = errBody;
  return err;
};

describe('fetchJsonWithRetry (boucle partagée)', () => {
  test('résout l’URL via resolveUrl et injecte le jeton fourni par getToken', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes(200, { ok: true }));

    const data = await fetchJsonWithRetry(
      '/api/test',
      { method: 'GET' },
      { resolveUrl: (p) => `/base${p}`, getToken: () => 'jeton-42', buildHttpError },
    );

    expect(data).toEqual({ ok: true });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/base/api/test');
    expect(options.headers.Authorization).toBe('Bearer jeton-42');
    expect(options.headers.Accept).toBe('application/json');
  });

  test('n’ajoute pas Authorization sans jeton et sérialise les corps falsy valides', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes(200, { ok: true }));

    await fetchJsonWithRetry('/api/test', { method: 'POST', body: 0 }, { buildHttpError });
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
    expect(options.body).toBe('0');
  });

  test('réessaie sur 503 HTML passerelle puis réussit (POST)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(html503())
      .mockResolvedValueOnce(html503())
      .mockResolvedValueOnce(jsonRes(200, { done: true }));

    const data = await fetchJsonWithRetry('/api/test', { method: 'POST' }, { buildHttpError });
    expect(data).toEqual({ done: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('ne réessaie pas un 4xx et lève l’erreur produite par buildHttpError', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonRes(403, { error: 'Interdit' }));

    await expect(
      fetchJsonWithRetry('/api/test', { method: 'GET' }, { buildHttpError }),
    ).rejects.toMatchObject({ message: 'Interdit', status: 403, body: { error: 'Interdit' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('appelle onUnauthorized sur 401 (qui peut lever une erreur produit)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes(401, { error: 'Token expiré' }));
    const onUnauthorized = vi.fn(({ errBody, token }) => {
      const err = new Error(`expiré:${token}:${errBody.error}`);
      err.sessionExpired = true;
      throw err;
    });

    await expect(
      fetchJsonWithRetry(
        '/api/test',
        { method: 'GET' },
        { getToken: () => 'tok', onUnauthorized, buildHttpError },
      ),
    ).rejects.toMatchObject({ message: 'expiré:tok:Token expiré', sessionExpired: true });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('n’appelle pas onUnauthorized hors 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes(500, { error: 'Boom' }));
    const onUnauthorized = vi.fn();

    await expect(
      fetchJsonWithRetry('/api/test', { method: 'GET' }, { onUnauthorized, buildHttpError }),
    ).rejects.toMatchObject({ status: 500 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  test('mappe l’erreur réseau finale via onNetworkError, sinon relance l’erreur brute', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new RangeError('hors retry'));

    await expect(
      fetchJsonWithRetry(
        '/api/test',
        { method: 'GET' },
        { onNetworkError: () => new Error('message produit'), buildHttpError },
      ),
    ).rejects.toThrow('message produit');

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new RangeError('hors retry'));
    await expect(
      fetchJsonWithRetry(
        '/api/test',
        { method: 'GET' },
        { onNetworkError: () => null, buildHttpError },
      ),
    ).rejects.toThrow('hors retry');
  });

  test('AbortError produit le message de timeout commun', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr);

    await expect(
      fetchJsonWithRetry('/api/test', { method: 'GET' }, { buildHttpError }),
    ).rejects.toThrow(REQUEST_TIMEOUT_USER_MESSAGE);
  });

  test('200 HTML lève un message de contenu inattendu (assertJsonApiBody)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      json: async () => {
        throw new Error('not json');
      },
      text: async () => '<!DOCTYPE html><html></html>',
    });

    await expect(
      fetchJsonWithRetry('/api/test', { method: 'GET' }, { buildHttpError }),
    ).rejects.toThrow(/Impossible de charger le contenu/i);
  });
});
