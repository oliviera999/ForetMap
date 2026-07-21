import { describe, expect, test, vi } from 'vitest';
import { downloadAuthedFile } from '../../src/shared/downloadAuthedFile.js';

const MESSAGES = {
  unauthorized: 'msg-401 produit',
  forbidden: 'msg-403 produit',
  notFound: 'msg-404 produit',
};

function baseOptions(overrides = {}) {
  return {
    resolveUrl: (p) => `/base${p}`,
    getToken: () => 'jeton-dl',
    messages: MESSAGES,
    ...overrides,
  };
}

function errorRes(status, { contentType = 'application/json', body = {} } = {}) {
  return {
    ok: false,
    status,
    headers: { get: () => contentType },
    json: async () => body,
  };
}

describe('downloadAuthedFile (cœur partagé)', () => {
  test('envoie le jeton injecté et déclenche le téléchargement du blob', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      blob: async () => ({ size: 128 }),
    });
    const createObjectURL = vi.fn(() => 'blob:xlsx');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const remove = vi.fn();
    const link = { click, remove, style: {} };
    vi.spyOn(document, 'createElement').mockReturnValue(link);
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => link);

    await downloadAuthedFile('/api/export.xlsx', 'export.xlsx', baseOptions());

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/base/api/export.xlsx');
    expect(options.headers.get('Authorization')).toBe('Bearer jeton-dl');
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.download).toBe('export.xlsx');
    expect(click).toHaveBeenCalledTimes(1);
    // Le nettoyage (révocation + retrait) est différé : indispensable sur mobile.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:xlsx');
    expect(remove).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('utilise les messages produit injectés pour 401 / 403 / 404', async () => {
    for (const [status, expected] of [
      [401, MESSAGES.unauthorized],
      [403, MESSAGES.forbidden],
      [404, MESSAGES.notFound],
    ]) {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorRes(status));
      await expect(downloadAuthedFile('/api/x', 'x.xlsx', baseOptions())).rejects.toThrow(expected);
    }
  });

  test('préfère le message d’erreur du corps JSON quand il existe', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      errorRes(403, { body: { error: 'Erreur serveur précise' } }),
    );
    await expect(downloadAuthedFile('/api/x', 'x.xlsx', baseOptions())).rejects.toThrow(
      'Erreur serveur précise',
    );
  });

  test('erreur générique sur statut non-JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorRes(500, { contentType: 'text/html' }));
    await expect(downloadAuthedFile('/api/x', 'x.xlsx', baseOptions())).rejects.toThrow(
      'Téléchargement impossible (HTTP 500).',
    );
  });

  test('rejette une réponse 200 HTML/JSON à la place du fichier', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
    });
    await expect(downloadAuthedFile('/api/x', 'x.xlsx', baseOptions())).rejects.toThrow(
      /Réponse serveur invalide/,
    );
  });

  test('rejette un fichier reçu vide', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => 'text/csv' },
      blob: async () => ({ size: 0 }),
    });
    await expect(downloadAuthedFile('/api/x', 'x.csv', baseOptions())).rejects.toThrow(
      'Fichier reçu vide.',
    );
  });
});
