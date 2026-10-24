import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  pendingLossConfirmationMessage,
  purgeCachedAuthenticatedApi,
  purgeCachedPlanApi,
  purgeCachedUserMedia,
  SW_ACCOUNT_PARTITION_PARAM,
} from '../../src/utils/localDataCleanup.js';

function stubCaches(entriesByCache) {
  const cachesMap = new Map();
  for (const [name, urls] of Object.entries(entriesByCache)) {
    const store = new Map(urls.map((url) => [url, { url }]));
    cachesMap.set(name, {
      keys: async () => [...store.values()],
      delete: async (req) => store.delete(req.url),
      _store: store,
    });
  }
  vi.stubGlobal('caches', {
    keys: async () => [...cachesMap.keys()],
    open: async (name) => cachesMap.get(name),
  });
  return cachesMap;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('purgeCachedAuthenticatedApi', () => {
  test('retire __fm_sw_user et laisse bundles / uploads / publics', async () => {
    const cachesMap = stubCaches({
      runtime: [
        'https://foret.example/api/tasks?__fm_sw_user=abc123',
        'https://foret.example/api/visit/content?__fm_sw_user=abc123',
        'https://foret.example/api/visit/content',
        'https://foret.example/assets/main.js',
        'https://foret.example/uploads/photo.jpg',
      ],
    });
    expect(await purgeCachedAuthenticatedApi()).toBe(2);
    const left = [...cachesMap.get('runtime')._store.keys()];
    expect(left).toEqual([
      'https://foret.example/api/visit/content',
      'https://foret.example/assets/main.js',
      'https://foret.example/uploads/photo.jpg',
    ]);
    expect(SW_ACCOUNT_PARTITION_PARAM).toBe('__fm_sw_user');
  });

  test('sans Cache Storage : aucune erreur', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await purgeCachedAuthenticatedApi()).toBe(0);
  });
});

describe('purgeCachedPlanApi', () => {
  test('retire content/settings plan et enov', async () => {
    const cachesMap = stubCaches({
      plan: [
        'https://plan.example/api/plan/content',
        'https://plan.example/api/plan/settings',
        'https://enov.example/api/enov/content',
        'https://enov.example/api/enov/settings',
        'https://plan.example/assets/plan.js',
      ],
    });
    expect(await purgeCachedPlanApi()).toBe(4);
    expect([...cachesMap.get('plan')._store.keys()]).toEqual([
      'https://plan.example/assets/plan.js',
    ]);
  });
});

describe('purgeCachedUserMedia', () => {
  test('retire /uploads/ seulement', async () => {
    const cachesMap = stubCaches({
      media: ['https://foret.example/uploads/a.jpg', 'https://foret.example/assets/main.js'],
    });
    expect(await purgeCachedUserMedia()).toBe(1);
    expect([...cachesMap.get('media')._store.keys()]).toEqual([
      'https://foret.example/assets/main.js',
    ]);
  });
});

describe('pendingLossConfirmationMessage', () => {
  test('mode borne même sans action en attente', () => {
    const msg = pendingLossConfirmationMessage(0, { clearSiteStorage: true });
    expect(msg).toMatch(/Mode borne/);
    expect(msg).toMatch(/Se déconnecter/);
  });

  test('sans pending et hors borne : null', () => {
    expect(pendingLossConfirmationMessage(0)).toBeNull();
  });
});
