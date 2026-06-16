import { describe, test, expect } from 'vitest';
import {
  computeEditorWarnings,
  filterGlobalAssets,
  insertAssetUrlIntoPackState,
} from '../../src/utils/visitMascotPackManager.js';

describe('computeEditorWarnings', () => {
  test('avertit si état idle absent', () => {
    const w = computeEditorWarnings({ stateFrames: { walking: {} } });
    expect(w).toContain(
      'État recommandé manquant: ajoutez un état « idle » pour un fallback visuel fiable.',
    );
  });

  test('aucun avertissement idle si état idle présent', () => {
    const w = computeEditorWarnings({ stateFrames: { idle: {} } });
    expect(w.some((m) => m.includes('idle'))).toBe(false);
  });

  test('avertit pour une silhouette inconnue', () => {
    const w = computeEditorWarnings({
      fallbackSilhouette: 'licorne-rose',
      stateFrames: { idle: {} },
    });
    expect(w).toContain('Silhouette « licorne-rose » inconnue.');
  });

  test('pack vide ou null → seul l’avertissement idle', () => {
    expect(computeEditorWarnings(null)).toEqual([
      'État recommandé manquant: ajoutez un état « idle » pour un fallback visuel fiable.',
    ]);
    expect(computeEditorWarnings({})).toEqual([
      'État recommandé manquant: ajoutez un état « idle » pour un fallback visuel fiable.',
    ]);
  });

  test('stateFrames non-objet est ignoré', () => {
    const w = computeEditorWarnings({ stateFrames: 'oops' });
    expect(w.some((m) => m.includes('idle'))).toBe(true);
  });
});

describe('filterGlobalAssets', () => {
  const assets = [
    {
      id: 1,
      filename: 'spr0ut-idle.png',
      url: '/a/x.png',
      source: 'pack',
      map_id: 'foret',
      pack_label: 'SPR0UT',
    },
    { id: 2, filename: 'renard-walk.png', url: '/a/y.png', source: 'library', map_id: 'jardin' },
    { id: 3, filename: 'autre.gif', url: 'https://cdn/z.gif', source: 'catalog' },
  ];

  test('requête vide → liste inchangée', () => {
    expect(filterGlobalAssets(assets, '')).toBe(assets);
    expect(filterGlobalAssets(assets, '   ')).toBe(assets);
  });

  test('filtre par nom de fichier (insensible à la casse)', () => {
    expect(filterGlobalAssets(assets, 'RENARD').map((a) => a.id)).toEqual([2]);
  });

  test('filtre par map_id et par label de pack', () => {
    expect(filterGlobalAssets(assets, 'foret').map((a) => a.id)).toEqual([1]);
    expect(filterGlobalAssets(assets, 'spr0ut').map((a) => a.id)).toEqual([1]);
  });

  test('filtre par URL', () => {
    expect(filterGlobalAssets(assets, 'cdn').map((a) => a.id)).toEqual([3]);
  });

  test('entrée non-tableau → tableau vide', () => {
    expect(filterGlobalAssets(null, 'x')).toEqual([]);
    expect(filterGlobalAssets(undefined, '')).toEqual([]);
  });
});

describe('insertAssetUrlIntoPackState', () => {
  test('url vide → retourne une copie du pack sans modification', () => {
    const prev = { stateFrames: { idle: { srcs: ['a'] } } };
    const next = insertAssetUrlIntoPackState(prev, 'idle', '   ');
    expect(next).not.toBe(prev);
    expect(next.stateFrames).toEqual({ idle: { srcs: ['a'] } });
  });

  test('ajoute l’url aux srcs existants avec fps par défaut conservé', () => {
    const prev = { stateFrames: { idle: { srcs: ['a.png'], fps: 12 } } };
    const next = insertAssetUrlIntoPackState(prev, 'idle', 'b.png');
    expect(next.stateFrames.idle.srcs).toEqual(['a.png', 'b.png']);
    expect(next.stateFrames.idle.fps).toBe(12);
  });

  test('dédoublonne une url déjà présente', () => {
    const prev = { stateFrames: { idle: { srcs: ['a.png'] } } };
    const next = insertAssetUrlIntoPackState(prev, 'idle', 'a.png');
    expect(next.stateFrames.idle.srcs).toEqual(['a.png']);
  });

  test('convertit files + framesBase en srcs absolus puis supprime files', () => {
    const prev = { framesBase: '/base', stateFrames: { idle: { files: ['/f1.png', 'f2.png'] } } };
    const next = insertAssetUrlIntoPackState(prev, 'idle', 'c.png');
    expect(next.stateFrames.idle.srcs).toEqual(['/base/f1.png', '/base/f2.png', 'c.png']);
    expect(next.stateFrames.idle.files).toBeUndefined();
  });

  test('état cible vide → "idle" par défaut et fps minimal 8', () => {
    const next = insertAssetUrlIntoPackState({}, '', 'c.png');
    expect(next.stateFrames.idle.srcs).toEqual(['c.png']);
    expect(next.stateFrames.idle.fps).toBe(8);
  });

  test('ne mute pas le pack source', () => {
    const prev = { stateFrames: { idle: { srcs: ['a.png'] } } };
    const snapshot = JSON.parse(JSON.stringify(prev));
    insertAssetUrlIntoPackState(prev, 'idle', 'b.png');
    expect(prev).toEqual(snapshot);
  });
});
