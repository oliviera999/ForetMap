// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { api } from '../src/services/api';
import { useVisitContent } from '../src/hooks/useVisitContent.js';

vi.mock('../src/services/api', () => ({
  api: vi.fn(async () => ({})),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

/**
 * Audit ForetMap du 19/11/2026, lot 11 — F10 : un changement de carte pendant la lecture de
 * la progression appliquait le contenu de l'ancienne carte, et le `finally` du chargement
 * périmé baissait `loading` alors que le chargement courant n'était pas fini.
 */
function Harness({ apiRef }) {
  const [mapId, setMapId] = useState('foret');
  const hook = useVisitContent({ mapId, setMapId });
  apiRef.current = { ...hook, mapId, setMapId };
  return null;
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const MAPS = [
  { id: 'foret', is_active: true },
  { id: 'verger', is_active: true },
];

let alertSpy;
beforeEach(() => {
  api.mockReset();
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  alertSpy.mockRestore();
});

describe('useVisitContent — F10 (garde de carte après la progression)', () => {
  it('changement de carte pendant la lecture de la progression : l’ancienne carte n’est pas appliquée', async () => {
    const firstProgress = deferred();
    const vergerContent = deferred();
    let progressCalls = 0;
    api.mockImplementation(async (path) => {
      if (path === '/api/maps') return MAPS;
      if (path === '/api/visit/content?map_id=foret') return { zones: [{ id: 'z-foret' }] };
      if (path === '/api/visit/content?map_id=verger') return vergerContent.promise;
      if (path === '/api/visit/progress') {
        progressCalls += 1;
        return progressCalls === 1 ? firstProgress.promise : { seen: [] };
      }
      return {};
    });
    const apiRef = { current: null };
    render(<Harness apiRef={apiRef} />);

    // Premier chargement bloqué sur la lecture de la progression.
    await waitFor(() => expect(progressCalls).toBe(1));
    act(() => {
      apiRef.current.setMapId('verger');
    });
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/visit/content?map_id=verger'));

    // La progression du chargement périmé arrive : rien ne doit être appliqué, et `loading`
    // reste levé tant que le chargement de « verger » n'est pas fini.
    await act(async () => {
      firstProgress.resolve({ seen: [] });
      await Promise.resolve();
    });
    expect(apiRef.current.content.zones).not.toEqual([{ id: 'z-foret' }]);
    expect(apiRef.current.loading).toBe(true);

    await act(async () => {
      vergerContent.resolve({ zones: [{ id: 'z-verger' }] });
    });
    await waitFor(() => expect(apiRef.current.loading).toBe(false));
    expect(apiRef.current.content.map_id).toBe('verger');
    expect(apiRef.current.content.zones).toEqual([{ id: 'z-verger' }]);
  });
});
