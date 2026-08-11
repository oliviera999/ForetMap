import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

import { useAdminCrud } from '../../src/shared/hooks/useAdminCrud.js';

const EMPTY_FORM = { thing_code: '', label: '' };

/**
 * Construit un transport factice : `request(path, method, body)` renvoie la
 * réponse enregistrée pour la clé `METHOD path`, et journalise les appels.
 */
function makeRequest(responses = {}) {
  const calls = [];
  const request = vi.fn(async (path, method = 'GET', body) => {
    calls.push({ path, method, body });
    const key = `${method} ${path}`;
    if (!(key in responses)) throw new Error(`Réponse non prévue : ${key}`);
    const value = responses[key];
    if (value instanceof Error) throw value;
    return value;
  });
  return { request, calls };
}

function baseOptions(request, overrides = {}) {
  return {
    request,
    listPath: '/api/things',
    basePath: '/api/things',
    codeField: 'thing_code',
    entityKey: 'thing',
    emptyForm: EMPTY_FORM,
    toForm: (entity) => ({ ...EMPTY_FORM, ...(entity || {}) }),
    toPayload: (form) => ({ ...form }),
    // Autosave neutralisé par défaut : les tests ciblent le CRUD explicite.
    isAutoSaveReady: () => false,
    messages: {
      updated: 'Fiche mise à jour',
      created: 'Fiche créée',
      startNewError: 'Code indisponible',
    },
    ...overrides,
  };
}

describe('useAdminCrud (hook partagé ForetMap/GL)', () => {
  it('charge la liste au montage via le transport injecté', async () => {
    const { request, calls } = makeRequest({
      'GET /api/things': { items: [{ thing_code: 'T1' }, { thing_code: 'T2' }] },
    });
    const { result } = renderHook(() => useAdminCrud(baseOptions(request)));

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(calls[0]).toMatchObject({ path: '/api/things' });
  });

  it('vide la liste sans appel réseau quand `listPath` est falsy', async () => {
    const { request, calls } = makeRequest({});
    const { result } = renderHook(() => useAdminCrud(baseOptions(request, { listPath: null })));

    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(calls).toHaveLength(0);
  });

  it('remonte une erreur de chargement de liste sans casser le rendu', async () => {
    const { request } = makeRequest({ 'GET /api/things': new Error('Réseau indisponible') });
    const { result } = renderHook(() => useAdminCrud(baseOptions(request)));

    await waitFor(() => expect(result.current.error).toBe('Réseau indisponible'));
  });

  it('ouvre une fiche, encode le code dans le chemin et notifie `onItemLoaded`', async () => {
    const onItemLoaded = vi.fn();
    const { request, calls } = makeRequest({
      'GET /api/things': { items: [] },
      'GET /api/things/a%2Fb': { thing: { thing_code: 'a/b', label: 'Chose' } },
    });
    const { result } = renderHook(() => useAdminCrud(baseOptions(request, { onItemLoaded })));
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      await result.current.loadItem('a/b');
    });

    expect(result.current.selectedCode).toBe('a/b');
    expect(result.current.form).toEqual({ thing_code: 'a/b', label: 'Chose' });
    expect(onItemLoaded).toHaveBeenCalledWith({ thing_code: 'a/b', label: 'Chose' });
    expect(calls.some((c) => c.path === '/api/things/a%2Fb')).toBe(true);
  });

  it('prépare une nouvelle fiche depuis « next-code » avec les extras', async () => {
    const { request } = makeRequest({
      'GET /api/things': { items: [] },
      'GET /api/things/next-code': { thing_code: 'T42' },
    });
    const { result } = renderHook(() =>
      useAdminCrud(baseOptions(request, { newFormExtra: { biome_slug: 'foret' } })),
    );
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      await result.current.startNew();
    });

    expect(result.current.selectedCode).toBeNull();
    expect(result.current.form).toEqual({
      thing_code: 'T42',
      label: '',
      biome_slug: 'foret',
    });
  });

  it('retombe sur un formulaire vierge si « next-code » échoue', async () => {
    const { request } = makeRequest({
      'GET /api/things': { items: [] },
      'GET /api/things/next-code': new Error(''),
    });
    const { result } = renderHook(() => useAdminCrud(baseOptions(request)));
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      await result.current.startNew();
    });

    expect(result.current.error).toBe('Code indisponible');
    expect(result.current.form).toEqual(EMPTY_FORM);
  });

  it('crée via POST puis bascule en édition (PUT) et recharge la liste', async () => {
    const { request, calls } = makeRequest({
      'GET /api/things': { items: [] },
      'POST /api/things': { thing: { thing_code: 'T7', label: 'Neuf' } },
      'PUT /api/things/T7': { thing: { thing_code: 'T7', label: 'Modifié' } },
    });
    // Autosave activé : `persist` est déclenché par le hook d'enregistrement.
    const { result } = renderHook(() =>
      useAdminCrud(baseOptions(request, { isAutoSaveReady: () => true })),
    );
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      result.current.setField('label', 'Neuf');
    });
    await waitFor(() => expect(result.current.info).toBe('Fiche créée'), { timeout: 3000 });
    expect(result.current.selectedCode).toBe('T7');

    await act(async () => {
      result.current.setField('label', 'Modifié');
    });
    await waitFor(() => expect(result.current.info).toBe('Fiche mise à jour'), { timeout: 3000 });

    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/things')).toBe(true);
    expect(calls.some((c) => c.method === 'PUT' && c.path === '/api/things/T7')).toBe(true);
  });

  it('`runAction` enveloppe une action et capture son erreur', async () => {
    const { request } = makeRequest({ 'GET /api/things': { items: [] } });
    const { result } = renderHook(() => useAdminCrud(baseOptions(request)));
    await waitFor(() => expect(result.current.items).toEqual([]));

    await act(async () => {
      await result.current.runAction(async () => {
        throw new Error('');
      }, 'Archivage impossible');
    });

    expect(result.current.error).toBe('Archivage impossible');
    expect(result.current.loading).toBe(false);
  });
});
