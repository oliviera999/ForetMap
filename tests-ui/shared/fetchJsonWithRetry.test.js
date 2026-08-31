import { describe, expect, test, vi } from 'vitest';
import {
  fetchJsonWithRetry,
  REQUEST_TIMEOUT_USER_MESSAGE,
} from '../../src/shared/fetchJsonWithRetry.js';
import { subscribeAppStatus } from '../../src/shared/appStatusEvents.js';
import { createApiRetryGate } from '../../src/shared/apiRetryGate.js';

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

  test('publie retrying puis recovered sur le bus de statut pendant un réessai passerelle', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(html503())
      .mockResolvedValueOnce(jsonRes(200, { done: true }));
    const events = [];
    const unsubscribe = subscribeAppStatus((detail) => events.push(detail));
    try {
      await fetchJsonWithRetry('/api/test', { method: 'POST' }, { buildHttpError });
    } finally {
      unsubscribe();
    }
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('retrying');
    expect(kinds).toContain('recovered');
    const retrying = events.find((e) => e.kind === 'retrying');
    expect(retrying.id).toBeTruthy();
    expect(retrying.maxAttempts).toBe(8);
  });

  test('ne publie aucun événement de statut pour une requête sans réessai', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes(200, { ok: true }));
    const events = [];
    const unsubscribe = subscribeAppStatus((detail) => events.push(detail));
    try {
      await fetchJsonWithRetry('/api/test', { method: 'GET' }, { buildHttpError });
    } finally {
      unsubscribe();
    }
    expect(events).toEqual([]);
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

  test('AbortError produit le message de timeout commun (mutation : aucun réessai)', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr);

    await expect(
      fetchJsonWithRetry('/api/test', { method: 'POST', body: { a: 1 } }, { buildHttpError }),
    ).rejects.toThrow(REQUEST_TIMEOUT_USER_MESSAGE);
    // Un timeout ne dit pas si le serveur a traité la mutation : on ne la rejoue pas.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('un GET qui expire est rejoué une fois, puis réussit', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce(jsonRes(200, { ok: true }));

    const data = await fetchJsonWithRetry('/api/test', { method: 'GET' }, { buildHttpError });
    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('un GET qui expire deux fois s’arrête là (pas six minutes d’attente)', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr);

    await expect(
      fetchJsonWithRetry('/api/test', { method: 'GET' }, { buildHttpError }),
    ).rejects.toThrow(REQUEST_TIMEOUT_USER_MESSAGE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('le délai d’abandon reste armé pendant la lecture du corps', async () => {
    // `fetch` résout dès les **en-têtes** reçus : le minuteur était désarmé à cet instant,
    // si bien qu'un corps qui n'arrivait jamais laissait la requête pendante sans aucun
    // délai maximal. On vérifie donc qu'aucun `clearTimeout` n'a lieu avant la lecture.
    const realClearTimeout = globalThis.clearTimeout;
    let clearCount = 0;
    let clearedBeforeBodyRead = null;
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation((id) => {
      clearCount += 1;
      return realClearTimeout(id);
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => {
        clearedBeforeBodyRead = clearCount;
        return { ok: true };
      },
      text: async () => '{"ok":true}',
    });

    await fetchJsonWithRetry('/api/test', { method: 'GET' }, { buildHttpError });
    expect(clearedBeforeBodyRead).toBe(0);
    // …et il est bien désarmé une fois la requête terminée.
    expect(clearCount).toBeGreaterThan(0);
  });

  test('un 429 ouvre la pause partagée : les requêtes sœurs cessent d’alimenter le plafond', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonRes(429, { error: 'Trop de requêtes, réessayez dans une minute.' }),
    );
    const retryGate = createApiRetryGate();

    await expect(
      fetchJsonWithRetry('/api/test', { method: 'GET' }, { buildHttpError, retryGate }),
    ).rejects.toMatchObject({ status: 429 });
    expect(retryGate.remainingMs()).toBeGreaterThan(0);
  });

  test('une réponse correcte referme la pause partagée pour tout le monde', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonRes(200, { ok: true }));
    const retryGate = createApiRetryGate();
    retryGate.pauseFor(150);

    await fetchJsonWithRetry('/api/test', { method: 'GET' }, { buildHttpError, retryGate });
    expect(retryGate.remainingMs()).toBe(0);
  });

  test('un réessai passerelle ouvre la pause partagée au lieu de dormir dans son coin', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(html503())
      .mockResolvedValueOnce(html503())
      .mockResolvedValueOnce(jsonRes(200, { done: true }));
    const pauses = [];
    const retryGate = createApiRetryGate();
    const spied = {
      ...retryGate,
      pauseFor: (ms) => {
        pauses.push(ms);
        retryGate.pauseFor(ms);
      },
    };

    await fetchJsonWithRetry('/api/test', { method: 'GET' }, { buildHttpError, retryGate: spied });
    expect(pauses).toHaveLength(2);
    expect(pauses[0]).toBeGreaterThanOrEqual(400);
    expect(pauses[1]).toBeGreaterThan(pauses[0]);
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
