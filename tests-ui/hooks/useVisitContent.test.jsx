// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import React, { useState } from 'react';
import { api } from '../../src/services/api';
import { useVisitContent } from '../../src/hooks/useVisitContent.js';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => ({})),
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

/** Harnais reproduisant l'usage réel (visit-views.jsx) : `mapId` possédé par la vue hôte. */
function Harness({ apiRef, initialMapId = 'foret', onForceLogout, onProgressLoaded }) {
  const [mapId, setMapId] = useState(initialMapId);
  const hook = useVisitContent({ mapId, setMapId, onForceLogout, onProgressLoaded });
  apiRef.current = { ...hook, mapId, setMapId };
  return null;
}

const MAPS = [
  { id: 'foret', label: 'Forêt', is_active: true },
  { id: 'mare', label: 'Mare', is_active: false },
];

function mockApiRoutes({ maps = MAPS, content = {}, progress = { seen: [] } } = {}) {
  api.mockImplementation(async (path) => {
    if (path === '/api/maps') return maps;
    if (String(path).startsWith('/api/visit/content')) return content;
    if (path === '/api/visit/progress') return progress;
    return {};
  });
}

let alertSpy;
beforeEach(() => {
  api.mockReset();
  alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  alertSpy.mockRestore();
});

describe('useVisitContent', () => {
  it('charge cartes actives + contenu (mascot_packs normalisé) et transmet la progression brute', async () => {
    const progress = { seen: [{ target_type: 'zone', target_id: 1 }] };
    mockApiRoutes({
      content: { zones: [{ id: 1 }], markers: [], tutorials: [] },
      progress,
    });
    const apiRef = { current: null };
    const onProgressLoaded = vi.fn();
    render(<Harness apiRef={apiRef} onProgressLoaded={onProgressLoaded} />);

    await waitFor(() => expect(apiRef.current.loading).toBe(false));
    // Seules les cartes actives sont conservées.
    expect(apiRef.current.maps).toEqual([MAPS[0]]);
    expect(apiRef.current.content.zones).toEqual([{ id: 1 }]);
    expect(apiRef.current.content.map_id).toBe('foret');
    expect(apiRef.current.content.mascot_packs).toEqual([]);
    expect(onProgressLoaded).toHaveBeenCalledWith(progress);
    expect(api).toHaveBeenCalledWith('/api/visit/content?map_id=foret');
  });

  it('bascule sur la première carte visible si la carte demandée est absente', async () => {
    mockApiRoutes({ maps: [{ id: 'verger', is_active: true }] });
    const apiRef = { current: null };
    render(<Harness apiRef={apiRef} initialMapId="disparue" />);

    await waitFor(() => expect(apiRef.current.mapId).toBe('verger'));
  });

  it('ignore une réponse obsolète après changement de carte pendant le chargement', async () => {
    let resolveContent;
    const bothActive = [
      { id: 'foret', is_active: true },
      { id: 'mare', is_active: true },
    ];
    api.mockImplementation(async (path) => {
      if (path === '/api/maps') return bothActive;
      if (String(path).startsWith('/api/visit/content')) {
        if (String(path).includes('map_id=foret')) {
          return new Promise((resolve) => {
            resolveContent = resolve;
          });
        }
        return { zones: [{ id: 99 }], markers: [], tutorials: [] };
      }
      if (path === '/api/visit/progress') return { seen: [] };
      return {};
    });
    const apiRef = { current: null };
    render(<Harness apiRef={apiRef} />);

    await waitFor(() => expect(typeof resolveContent).toBe('function'));
    act(() => apiRef.current.setMapId('mare'));
    await waitFor(() => expect(apiRef.current.loading).toBe(false));
    // La réponse « foret » arrive trop tard : elle ne doit pas écraser « mare ».
    await act(async () => {
      resolveContent({ zones: [{ id: 1 }], markers: [], tutorials: [] });
    });
    expect(apiRef.current.content.zones).toEqual([{ id: 99 }]);
    expect(apiRef.current.content.map_id).toBe('mare');
  });

  it('resynchronise la sélection après rechargement (élément remplacé ou fermé)', async () => {
    mockApiRoutes({ content: { zones: [{ id: 1, name: 'A' }], markers: [], tutorials: [] } });
    const apiRef = { current: null };
    render(<Harness apiRef={apiRef} />);
    await waitFor(() => expect(apiRef.current.loading).toBe(false));

    act(() => {
      apiRef.current.setSelected({ id: 1, name: 'A' });
      apiRef.current.setSelectedType('zone');
    });

    // Rechargement : la zone 1 a changé → sélection remplacée par la nouvelle version.
    mockApiRoutes({ content: { zones: [{ id: 1, name: 'A bis' }], markers: [], tutorials: [] } });
    await act(async () => apiRef.current.loadData());
    await waitFor(() => expect(apiRef.current.selected?.name).toBe('A bis'));

    // Rechargement : la zone 1 a disparu → sélection fermée.
    mockApiRoutes({ content: { zones: [], markers: [], tutorials: [] } });
    await act(async () => apiRef.current.loadData());
    await waitFor(() => {
      expect(apiRef.current.selected).toBe(null);
      expect(apiRef.current.selectedType).toBe(null);
    });
  });

  it('alerte sur erreur de contenu (hors compte supprimé) et termine le chargement', async () => {
    api.mockImplementation(async (path) => {
      if (path === '/api/maps') return MAPS;
      throw new Error('boom');
    });
    const apiRef = { current: null };
    const onForceLogout = vi.fn();
    render(<Harness apiRef={apiRef} onForceLogout={onForceLogout} />);

    await waitFor(() => expect(apiRef.current.loading).toBe(false));
    expect(alertSpy).toHaveBeenCalledWith('boom');
    expect(onForceLogout).not.toHaveBeenCalled();
  });
});
